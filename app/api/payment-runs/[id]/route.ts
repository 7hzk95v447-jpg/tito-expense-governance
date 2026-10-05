import { and, asc, desc, eq, or } from "drizzle-orm";
import { getDb } from "../../../../db";
import { auditEvents, executionAttempts, expenseRequests, notifications, paymentRunActions, paymentRunItems, paymentRuns, requestActions, users, workItems } from "../../../../db/schema";
import { authenticationRequired, getResolvedRequestUser } from "../../../../lib/request-user";
import { sha256 } from "../../../../lib/workflow";

type Context = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: Context) {
  const actor = await getResolvedRequestUser(request);
  if (!actor) return authenticationRequired();
  const db = getDb();
  const [profile] = await db.select().from(users).where(or(eq(users.email, actor.email), eq(users.authIdentityEmail, actor.email))).limit(1);
  if (profile?.status !== "ACTIVE" || !["ADMIN", "ACCOUNTING", "EXECUTIVE", "BATCH_APPROVER", "EXECUTOR"].includes(profile.systemRole)) return Response.json({ error: "غير مصرح بعرض المسير" }, { status: 403 });
  const { id } = await context.params;
  const [run] = await db.select().from(paymentRuns).where(eq(paymentRuns.id, id)).limit(1);
  if (!run) return Response.json({ error: "المسير غير موجود" }, { status: 404 });
  const itemRows = await db.select().from(paymentRunItems).where(eq(paymentRunItems.paymentRunId, id)).orderBy(asc(paymentRunItems.createdAt));
  const items = await Promise.all(itemRows.map(async (item) => {
    const [expenseRequest, latestExecution, executiveApproval] = await Promise.all([
      db.select().from(expenseRequests).where(eq(expenseRequests.id, item.requestId)).limit(1).then((rows) => rows[0]),
      db.select().from(executionAttempts).where(eq(executionAttempts.paymentRunItemId, item.id)).orderBy(asc(executionAttempts.attemptNumber)).then((rows) => rows.at(-1)),
      db.select({ actorName: requestActions.actorName, actorEmail: requestActions.actorEmail, note: requestActions.note, createdAt: requestActions.createdAt })
        .from(requestActions)
        .where(and(
          eq(requestActions.requestId, item.requestId),
          eq(requestActions.action, "APPROVE"),
          eq(requestActions.fromStatus, "PENDING_EXECUTIVE"),
          eq(requestActions.toStatus, "READY_FOR_BATCH"),
        ))
        .orderBy(desc(requestActions.createdAt)).limit(1).then((rows) => rows[0]),
    ]);
    return { ...item, request: expenseRequest || null, execution: latestExecution || null, executiveApproval: executiveApproval || null };
  }));
  const actions = await db.select().from(paymentRunActions).where(eq(paymentRunActions.paymentRunId, id)).orderBy(asc(paymentRunActions.createdAt));
  return Response.json({ paymentRun: run, items, actions });
}

export async function PATCH(request: Request, context: Context) {
  const actor = await getResolvedRequestUser(request);
  if (!actor) return authenticationRequired();
  const idempotencyKey = request.headers.get("idempotency-key")?.trim();
  if (!idempotencyKey) return Response.json({ error: "مفتاح منع التكرار مطلوب" }, { status: 400 });
  const payload = (await request.json()) as { action?: string; itemId?: string; reason?: string };
  if (payload.action !== "EXCLUDE_ITEM" || !payload.itemId || !payload.reason?.trim()) return Response.json({ error: "العملية وسبب الاستبعاد مطلوبان" }, { status: 400 });
  const { id } = await context.params;
  const db = getDb();
  const [profile] = await db.select().from(users).where(or(eq(users.email, actor.email), eq(users.authIdentityEmail, actor.email))).limit(1);
  if (profile?.status !== "ACTIVE" || !["ADMIN", "ACCOUNTING"].includes(profile.systemRole)) return Response.json({ error: "تعديل المسير متاح للحسابات فقط" }, { status: 403 });
  const [duplicate] = await db.select().from(paymentRunActions).where(eq(paymentRunActions.idempotencyKey, idempotencyKey)).limit(1);
  if (duplicate) return duplicate.paymentRunId === id ? Response.json({ duplicatePrevented: true, action: duplicate }) : Response.json({ error: "مفتاح العملية مستخدم لمسير آخر" }, { status: 409 });
  const [run] = await db.select().from(paymentRuns).where(eq(paymentRuns.id, id)).limit(1);
  if (!run) return Response.json({ error: "المسير غير موجود" }, { status: 404 });
  if (!["BATCH_DRAFT", "BATCH_RETURNED", "BATCH_APPROVED"].includes(run.status)) return Response.json({ error: "لا يمكن تعديل عمليات المسير بعد بدء التنفيذ" }, { status: 409 });
  if (profile.systemRole !== "ADMIN" && run.preparedByEmail !== actor.email) return Response.json({ error: "التعديل متاح لمُعدّ المسير فقط" }, { status: 403 });
  const items = await db.select().from(paymentRunItems).where(eq(paymentRunItems.paymentRunId, id));
  if (run.status === "BATCH_APPROVED" && items.some((row) => !["PENDING", "EXCLUDED"].includes(row.executionStatus))) {
    return Response.json({ error: "بدأ تنفيذ المسير؛ لا يمكن استبعاد عملية بعد تسجيل تنفيذ أو تعذر" }, { status: 409 });
  }
  const item = items.find((row) => row.id === payload.itemId);
  if (!item) return Response.json({ error: "عملية المسير غير موجودة" }, { status: 404 });
  if (item.executionStatus === "EXCLUDED") return Response.json({ error: "العملية مستبعدة مسبقًا" }, { status: 409 });
  const remaining = items.filter((row) => row.id !== item.id && row.executionStatus !== "EXCLUDED");
  if (!remaining.length) return Response.json({ error: "لا يمكن استبعاد آخر عملية؛ ارفض المسير وأنشئ مسيرًا جديدًا" }, { status: 409 });
  const [expenseRequest] = await db.select().from(expenseRequests).where(eq(expenseRequests.id, item.requestId)).limit(1);
  if (!expenseRequest) return Response.json({ error: "الطلب المرتبط غير موجود" }, { status: 404 });
  const now = new Date();
  const totalMinor = remaining.reduce((sum, row) => sum + row.amountMinor, 0);
  const actionId = crypto.randomUUID();
  const note = `${expenseRequest.requestNumber} · ${payload.reason.trim()}`;
  await db.batch([
    db.update(paymentRunItems).set({ executionStatus: "EXCLUDED", failureReason: payload.reason.trim() }).where(eq(paymentRunItems.id, item.id)),
    db.update(paymentRuns).set({ totalMinor, itemCount: remaining.length }).where(eq(paymentRuns.id, id)),
    db.update(expenseRequests).set({ status: "READY_FOR_BATCH", currentStage: "BATCH_PREPARATION", currentAssignee: "role:BATCH_PREPARER:FINANCE", updatedAt: now }).where(eq(expenseRequests.id, item.requestId)),
    db.insert(paymentRunActions).values({ id: actionId, paymentRunId: id, action: "EXCLUDE_ITEM", fromStatus: run.status, toStatus: run.status, actorEmail: actor.email, note, idempotencyKey }),
    db.insert(requestActions).values({ id: crypto.randomUUID(), requestId: item.requestId, action: "REMOVE_FROM_PAYMENT_RUN", fromStatus: expenseRequest.status, toStatus: "READY_FOR_BATCH", actorEmail: actor.email, actorName: profile.fullName || actor.displayName, note: `${run.runNumber} · ${payload.reason.trim()}`, idempotencyKey: `${idempotencyKey}:request` }),
    db.insert(workItems).values({ id: crypto.randomUUID(), requestId: item.requestId, taskType: "ADD_TO_PAYMENT_RUN", assignedDepartmentCode: "FINANCE", assignedRole: "BATCH_PREPARER", status: "OPEN", dueAt: new Date(Date.now() + 24 * 60 * 60 * 1000) }),
  ]);
  for (const recipientEmail of new Set([expenseRequest.createdByEmail, `department.${expenseRequest.departmentCode.toLowerCase()}@tito.local`])) {
    await db.insert(notifications).values({ id: crypto.randomUUID(), recipientEmail, title: "استُبعد الطلب من المسير للتصحيح", body: `${expenseRequest.requestNumber} · ${run.runNumber} · ${payload.reason.trim()}`, entityType: "REQUEST", entityId: item.requestId, actionUrl: `/requests/${item.requestId}`, dedupeKey: `${actionId}:${recipientEmail}`, sentByEmail: actor.email }).onConflictDoNothing();
  }
  const correlationId = crypto.randomUUID();
  const afterJson = JSON.stringify({ paymentRunId: id, itemId: item.id, requestId: item.requestId, totalMinor, itemCount: remaining.length });
  await db.insert(auditEvents).values({ id: crypto.randomUUID(), actorEmail: actor.email, action: "EXCLUDE_PAYMENT_RUN_ITEM", entityType: "PAYMENT_RUN", entityId: id, beforeJson: JSON.stringify({ totalMinor: run.totalMinor, itemCount: run.itemCount }), afterJson, reason: payload.reason.trim(), correlationId, eventHash: await sha256(`${correlationId}|${actor.email}|EXCLUDE_PAYMENT_RUN_ITEM|${id}|${afterJson}`) });
  return Response.json({ updated: true, paymentRun: { id, totalMinor, itemCount: remaining.length }, excludedItemId: item.id });
}
