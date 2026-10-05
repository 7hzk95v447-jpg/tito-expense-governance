import { and, eq, or } from "drizzle-orm";
import { getDb } from "../../../../../db";
import { auditEvents, expenseRequests, notifications, paymentRunActions, paymentRunItems, paymentRuns, requestActions, users, workItems } from "../../../../../db/schema";
import { authenticationRequired, getResolvedRequestUser } from "../../../../../lib/request-user";
import { sha256 } from "../../../../../lib/workflow";

type Context = { params: Promise<{ id: string }> };
const transitionMap: Record<string, Record<string, string>> = {
  BATCH_DRAFT: { SUBMIT: "BATCH_PENDING_APPROVAL" },
  BATCH_RETURNED: { RESUBMIT: "BATCH_PENDING_APPROVAL" },
  BATCH_PENDING_APPROVAL: { APPROVE: "BATCH_APPROVED", RETURN: "BATCH_RETURNED", REJECT: "BATCH_REJECTED" },
  BATCH_EXECUTING: { CLOSE: "BATCH_CLOSED" },
};

export async function POST(request: Request, context: Context) {
  const { id } = await context.params;
  const actor = await getResolvedRequestUser(request);
  if (!actor) return authenticationRequired();
  const payload = (await request.json()) as { action?: string; note?: string };
  const action = (payload.action || "").toUpperCase();
  const idempotencyKey = request.headers.get("idempotency-key")?.trim();
  if (!idempotencyKey) return Response.json({ error: "مفتاح منع التكرار مطلوب" }, { status: 400 });
  const db = getDb();
  const [duplicate] = await db.select().from(paymentRunActions).where(eq(paymentRunActions.idempotencyKey, idempotencyKey)).limit(1);
  if (duplicate) {
    if (duplicate.paymentRunId !== id) return Response.json({ error: "مفتاح العملية مستخدم لمسير آخر" }, { status: 409 });
    return Response.json({ action: duplicate, duplicatePrevented: true });
  }
  const [run] = await db.select().from(paymentRuns).where(eq(paymentRuns.id, id)).limit(1);
  if (!run) return Response.json({ error: "المسير غير موجود" }, { status: 404 });
  const toStatus = transitionMap[run.status]?.[action];
  if (!toStatus) return Response.json({ error: "الإجراء غير مسموح في حالة المسير الحالية" }, { status: 409 });
  if (["APPROVE", "RETURN", "REJECT"].includes(action) && !payload.note?.trim()) return Response.json({ error: action === "APPROVE" ? "توصية اعتماد المسير إلزامية" : "سبب الإعادة أو الرفض إلزامي" }, { status: 400 });
  const [profile] = await db.select().from(users).where(or(eq(users.email, actor.email), eq(users.authIdentityEmail, actor.email))).limit(1);
  if (profile?.status !== "ACTIVE") return Response.json({ error: "الحساب غير مرتبط أو موقوف" }, { status: 403 });
  const isAdmin = profile.systemRole === "ADMIN";
  const roleAllowed = ["SUBMIT", "RESUBMIT"].includes(action)
    ? ["ADMIN", "ACCOUNTING"].includes(profile.systemRole) && (isAdmin || run.preparedByEmail === actor.email)
    : ["APPROVE", "RETURN", "REJECT"].includes(action)
      ? ["ADMIN", "EXECUTIVE", "BATCH_APPROVER"].includes(profile.systemRole)
      : action === "CLOSE"
        ? ["ADMIN", "ACCOUNTING", "EXECUTOR"].includes(profile.systemRole)
        : false;
  if (!roleAllowed) return Response.json({ error: "الإجراء متاح للمسؤول عن مرحلة المسير فقط" }, { status: 403 });
  if (action === "APPROVE" && ["BATCH_DRAFT", "BATCH_RETURNED"].includes(run.status) && !isAdmin) return Response.json({ error: "يجب إرسال المسير للمعتمد النهائي أولًا" }, { status: 409 });
  if (isAdmin && !payload.note?.trim()) return Response.json({ error: "تدخل مدير النظام الاستثنائي يتطلب سببًا مسجلًا" }, { status: 400 });
  if (action === "APPROVE" && run.preparedByEmail === actor.email && !isAdmin) return Response.json({ error: "مُعدّ المسير لا يعتمد المسير الذي أعدّه" }, { status: 403 });
  const items = await db.select().from(paymentRunItems).where(eq(paymentRunItems.paymentRunId, id));
  const activeItems = items.filter((item) => item.executionStatus !== "EXCLUDED");
  if (!activeItems.length) return Response.json({ error: "لا يمكن متابعة مسير بلا عمليات فعالة" }, { status: 409 });
  if (action === "CLOSE" && activeItems.some((item) => item.executionStatus !== "EXECUTED")) return Response.json({ error: "لا يمكن إغلاق المسير قبل معالجة جميع العمليات" }, { status: 409 });
  const approvedAt = action === "APPROVE" ? new Date() : run.approvedAt;
  const signatureCode = action === "APPROVE" ? `T2-SIG-${crypto.randomUUID().slice(0, 8).toUpperCase()}` : run.digitalSignatureCode;
  const [updatedRun] = await db.update(paymentRuns).set({ status: toStatus, approvedByEmail: action === "APPROVE" ? actor.email : run.approvedByEmail, approvedAt, digitalSignatureCode: signatureCode, closedAt: action === "CLOSE" ? new Date() : null })
    .where(and(eq(paymentRuns.id, id), eq(paymentRuns.status, run.status))).returning();
  if (!updatedRun) return Response.json({ error: "تغيرت حالة المسير؛ أعد فتحه قبل تنفيذ الإجراء" }, { status: 409 });
  const actionId = crypto.randomUUID();
  await db.insert(paymentRunActions).values({ id: actionId, paymentRunId: id, action, fromStatus: run.status, toStatus, actorEmail: actor.email, note: payload.note?.trim() || null, idempotencyKey });
  const requestTransition = action === "SUBMIT" || action === "RESUBMIT"
    ? { status: "PENDING_BATCH_APPROVAL", stage: "BATCH", assignee: "role:BATCH_APPROVER:EXECUTIVE" }
    : action === "APPROVE"
      ? { status: "READY_FOR_EXECUTION", stage: "EXECUTION", assignee: "role:EXECUTOR:FINANCE" }
      : action === "REJECT"
        ? { status: "READY_FOR_BATCH", stage: "BATCH_PREPARATION", assignee: "role:BATCH_PREPARER:FINANCE" }
        : action === "RETURN"
          ? { status: "IN_BATCH_DRAFT", stage: "BATCH_PREPARATION", assignee: run.preparedByEmail }
          : action === "CLOSE"
            ? { status: "EXECUTED", stage: "ARCHIVE", assignee: null }
            : null;
  const requestRows = new Map<string, typeof expenseRequests.$inferSelect>();
  for (const item of activeItems) {
    const [beforeRequest] = await db.select().from(expenseRequests).where(eq(expenseRequests.id, item.requestId)).limit(1);
    if (!beforeRequest || !requestTransition) continue;
    requestRows.set(item.requestId, beforeRequest);
    await db.update(expenseRequests).set({ status: requestTransition.status, currentStage: requestTransition.stage, currentAssignee: requestTransition.assignee, updatedAt: new Date(), closedAt: action === "CLOSE" ? new Date() : beforeRequest.closedAt }).where(eq(expenseRequests.id, item.requestId));
    await db.insert(requestActions).values({
      id: crypto.randomUUID(), requestId: item.requestId, action: `PAYMENT_RUN_${action}`,
      fromStatus: beforeRequest.status, toStatus: requestTransition.status,
      actorEmail: actor.email, actorName: profile.fullName || actor.displayName,
      note: `${run.runNumber}${payload.note?.trim() ? ` · ${payload.note.trim()}` : ""}`,
      idempotencyKey: `${idempotencyKey}:request:${item.requestId}`,
    }).onConflictDoNothing();
  }
  await db.update(workItems).set({ status: "COMPLETED", completedAt: new Date() }).where(and(eq(workItems.paymentRunId, id), eq(workItems.status, "OPEN")));
  if (["BATCH_PENDING_APPROVAL", "BATCH_APPROVED"].includes(toStatus)) {
    const role = toStatus === "BATCH_PENDING_APPROVAL" ? "BATCH_APPROVER" : "EXECUTOR";
    await db.insert(workItems).values({ id: crypto.randomUUID(), paymentRunId: id, taskType: role === "BATCH_APPROVER" ? "APPROVE_PAYMENT_RUN" : "EXECUTE_PAYMENT_RUN", assignedDepartmentCode: role === "EXECUTOR" ? "FINANCE" : "EXECUTIVE", assignedRole: role, status: "OPEN", dueAt: new Date(Date.now() + 24 * 60 * 60 * 1000) });
    await db.insert(notifications).values({ id: crypto.randomUUID(), recipientEmail: `role.${role.toLowerCase()}@tito.local`, title: role === "BATCH_APPROVER" ? "مسير جديد ينتظر الاعتماد" : "مسير معتمد جاهز للتنفيذ", body: `${run.runNumber} · ${run.itemCount} عملية`, entityType: "PAYMENT_RUN", entityId: id, actionUrl: `/payment-runs/${id}`, dedupeKey: `${actionId}:${role}`, sentByEmail: actor.email });
  }
  if (["RETURN", "REJECT", "CLOSE"].includes(action)) {
    await db.insert(notifications).values({
      id: crypto.randomUUID(), recipientEmail: run.preparedByEmail,
      title: action === "RETURN" ? "أُعيد المسير للحسابات" : action === "REJECT" ? "رُفض المسير" : "أُغلق المسير بعد التنفيذ",
      body: `${run.runNumber} · ${payload.note?.trim() || toStatus}`, entityType: "PAYMENT_RUN", entityId: id,
      actionUrl: `/payment-runs/${id}`, dedupeKey: `${actionId}:PREPARER`, sentByEmail: actor.email,
    });
  }
  const creatorTitle = action === "SUBMIT" || action === "RESUBMIT" ? "أُرسل المسير للاعتماد"
    : action === "APPROVE" ? "اعتُمد المسير وأصبح جاهزًا للتنفيذ"
      : action === "RETURN" ? "أُعيد المسير للحسابات"
          : action === "REJECT" ? "رُفض المسير"
            : "اكتمل تنفيذ المسير وأُغلق";
  for (const [requestId, requestRow] of requestRows) {
    const recipients = new Set([requestRow.createdByEmail, `department.${requestRow.departmentCode.toLowerCase()}@tito.local`]);
    for (const recipientEmail of recipients) {
      await db.insert(notifications).values({
        id: crypto.randomUUID(), recipientEmail, title: creatorTitle,
        body: `${requestRow.requestNumber} · ${run.runNumber}${payload.note?.trim() ? ` · ${payload.note.trim()}` : ""}`,
        entityType: "REQUEST", entityId: requestId, actionUrl: `/requests/${requestId}`,
        dedupeKey: `${actionId}:${requestId}:${recipientEmail}`, sentByEmail: actor.email,
      }).onConflictDoNothing();
    }
  }
  const correlationId = crypto.randomUUID();
  const beforeJson = JSON.stringify({ status: run.status, approvedByEmail: run.approvedByEmail, approvedAt: run.approvedAt, digitalSignatureCode: run.digitalSignatureCode });
  const afterJson = JSON.stringify({ status: toStatus, approvedByEmail: action === "APPROVE" ? actor.email : run.approvedByEmail, approvedAt, digitalSignatureCode: signatureCode });
  const eventHash = await sha256(`${correlationId}|${actor.email}|PAYMENT_RUN_${action}|${id}|${beforeJson}|${afterJson}`);
  await db.insert(auditEvents).values({ id: crypto.randomUUID(), actorEmail: actor.email, action: `PAYMENT_RUN_${action}`, entityType: "PAYMENT_RUN", entityId: id, beforeJson, afterJson, reason: payload.note?.trim() || null, correlationId, eventHash });
  return Response.json({ paymentRun: { id, runNumber: run.runNumber, status: toStatus, approvedAt, digitalSignatureCode: signatureCode } });
}
