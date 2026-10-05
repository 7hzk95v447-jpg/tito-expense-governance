import { and, desc, eq, or } from "drizzle-orm";
import { getDb } from "../../../../../db";
import { auditEvents, departments, expenseRequests, notifications, requestActions, users, workItems } from "../../../../../db/schema";
import { authenticationRequired, getResolvedRequestUser } from "../../../../../lib/request-user";
import { getTransition, isDecisionAction, sha256 } from "../../../../../lib/workflow";

type Context = { params: Promise<{ id: string }> };
type Priority = "NORMAL" | "URGENT" | "CRITICAL";
type ActionPayload = {
  action?: string;
  note?: string;
  expectedLockVersion?: number;
  priority?: Priority;
  priorityReason?: string;
  overrideReason?: string;
};

const approvalActions = new Set(["APPROVE", "REAPPROVE"]);
const reasonActions = new Set(["RETURN", "REJECT", "CANCEL"]);
const priorities = new Set<Priority>(["NORMAL", "URGENT", "CRITICAL"]);
const roleLabels: Record<string, string> = {
  DEPARTMENT_MANAGER: "مدير الإدارة",
  ACCOUNTING_REVIEWER: "مراجع الحسابات",
  EXECUTIVE: "المدير التنفيذي",
  BATCH_PREPARER: "معدّ المسير",
  REQUESTER: "معدّ الطلب",
};

function sameEmail(left: string | null | undefined, right: string | null | undefined) {
  return Boolean(left && right && left.trim().toLowerCase() === right.trim().toLowerCase());
}

function isCreatorIdentity(
  createdByEmail: string,
  actorEmail: string,
  profile: typeof users.$inferSelect | undefined,
) {
  return sameEmail(createdByEmail, actorEmail)
    || sameEmail(createdByEmail, profile?.email)
    || sameEmail(createdByEmail, profile?.authIdentityEmail);
}

function isNormallyAuthorized(
  action: string,
  status: string,
  systemRole: string,
  actorDepartmentCode: string | null,
  requestDepartmentCode: string,
  isCreator: boolean,
) {
  if (["SUBMIT", "RESUBMIT", "CANCEL"].includes(action)) return isCreator;
  if (status === "PENDING_DEPARTMENT" || status === "RETURNED_ACCOUNTING_TO_DEPARTMENT") {
    return systemRole === "DEPARTMENT_MANAGER" && actorDepartmentCode === requestDepartmentCode;
  }
  if (status === "PENDING_ACCOUNTING") return systemRole === "ACCOUNTING";
  if (status === "PENDING_EXECUTIVE") return systemRole === "EXECUTIVE";
  return false;
}

function responsible(task: typeof workItems.$inferSelect | undefined, status: string) {
  if (!task) {
    return ["REJECTED_FINAL", "CANCELLED", "EXECUTED"].includes(status)
      ? { type: "CLOSED", label: "الطلب مغلق" }
      : { type: "UNASSIGNED", label: "لا توجد مهمة مفتوحة" };
  }
  if (task.assignedUserEmail) {
    return { type: "USER", email: task.assignedUserEmail, label: "المستخدم المسؤول حاليًا" };
  }
  return {
    type: "ROLE",
    role: task.assignedRole,
    departmentCode: task.assignedDepartmentCode,
    label: task.assignedRole ? (roleLabels[task.assignedRole] || task.assignedRole) : "الإدارة المسؤولة حاليًا",
  };
}

function roleRecipient(role: string, departmentCode: string) {
  return role === "DEPARTMENT_MANAGER"
    ? `department.${departmentCode.toLowerCase()}@tito.local`
    : `role.${role.toLowerCase()}@tito.local`;
}

export async function POST(request: Request, context: Context) {
  const { id } = await context.params;
  const actor = await getResolvedRequestUser(request);
  if (!actor) return authenticationRequired();
  const payload = (await request.json()) as ActionPayload;
  const action = (payload.action || "").trim().toUpperCase();
  const note = payload.note?.trim() || "";
  const priorityReason = payload.priorityReason?.trim() || "";
  const overrideReason = payload.overrideReason?.trim() || "";
  const idempotencyKey = request.headers.get("idempotency-key")?.trim();
  if (!idempotencyKey) return Response.json({ error: "مفتاح العملية مطلوب لمنع تكرار الإجراء" }, { status: 400 });

  const db = getDb();
  const [expenseRequest] = await db.select().from(expenseRequests).where(eq(expenseRequests.id, id)).limit(1);
  if (!expenseRequest) return Response.json({ error: "الطلب غير موجود" }, { status: 404 });
  const [profile] = await db.select().from(users).where(or(eq(users.email, actor.email), eq(users.authIdentityEmail, actor.email))).limit(1);
  if (!profile || profile.status !== "ACTIVE") return Response.json({ error: "المستخدم غير مسجل أو غير نشط" }, { status: 403 });
  let actorDepartmentCode: string | null = null;
  if (profile.departmentId) {
    const [department] = await db.select({ code: departments.code }).from(departments).where(eq(departments.id, profile.departmentId)).limit(1);
    actorDepartmentCode = department?.code || profile.departmentId;
  }
  const isAdmin = profile.systemRole === "ADMIN";
  const isCreator = isCreatorIdentity(expenseRequest.createdByEmail, actor.email, profile);
  const [existingAction] = await db.select({
    id: requestActions.id,
    requestId: requestActions.requestId,
    action: requestActions.action,
    fromStatus: requestActions.fromStatus,
    toStatus: requestActions.toStatus,
  }).from(requestActions).where(eq(requestActions.idempotencyKey, idempotencyKey)).limit(1);

  if (existingAction) {
    if (existingAction.requestId !== id) return Response.json({ error: "مفتاح العملية مستخدم لطلب آخر" }, { status: 409 });
    const originalStatus = existingAction.fromStatus || expenseRequest.status;
    const duplicateAuthorized = isAdmin || (
      isNormallyAuthorized(existingAction.action, originalStatus, profile.systemRole, actorDepartmentCode, expenseRequest.departmentCode, isCreator)
      && !(isDecisionAction(existingAction.action) && isCreator)
    );
    if (!duplicateAuthorized) return Response.json({ error: "غير مصرح بعرض نتيجة هذا الإجراء" }, { status: 403 });
    const [currentTask] = await db.select().from(workItems).where(and(eq(workItems.requestId, id), eq(workItems.status, "OPEN"))).orderBy(desc(workItems.createdAt)).limit(1);
    return Response.json({
      action: existingAction,
      duplicatePrevented: true,
      request: {
        id,
        requestNumber: expenseRequest.requestNumber,
        status: expenseRequest.status,
        currentStage: expenseRequest.currentStage,
        currentAssignee: expenseRequest.currentAssignee,
        currentResponsible: responsible(currentTask, expenseRequest.status),
        currentTask: currentTask || null,
        priority: expenseRequest.priority,
        lockVersion: expenseRequest.lockVersion,
      },
    });
  }

  const [previousTask] = await db.select().from(workItems).where(and(eq(workItems.requestId, id), eq(workItems.status, "OPEN"))).orderBy(desc(workItems.createdAt)).limit(1);
  if (!Number.isInteger(payload.expectedLockVersion)) {
    return Response.json({ error: "نسخة الطلب الحالية مطلوبة قبل اتخاذ القرار" }, { status: 428 });
  }
  if (payload.expectedLockVersion !== expenseRequest.lockVersion) {
    return Response.json({
      error: "تم تحديث الطلب من مستخدم آخر؛ أعد فتحه قبل اتخاذ القرار",
      current: { status: expenseRequest.status, currentStage: expenseRequest.currentStage, lockVersion: expenseRequest.lockVersion },
    }, { status: 409 });
  }

  const transition = getTransition(expenseRequest.status, action);
  if (!transition) {
    return Response.json({
      error: "هذا الإجراء غير مسموح في المرحلة الحالية",
      current: { status: expenseRequest.status, currentStage: expenseRequest.currentStage, lockVersion: expenseRequest.lockVersion },
    }, { status: 409 });
  }
  if (approvalActions.has(action) && !note) return Response.json({ error: "توصية الاعتماد إلزامية" }, { status: 400 });
  if ((reasonActions.has(action) || transition.reasonRequired) && !note) return Response.json({ error: "سبب الإعادة أو الرفض إلزامي" }, { status: 400 });

  const normallyAuthorized = isNormallyAuthorized(
    action,
    expenseRequest.status,
    profile.systemRole,
    actorDepartmentCode,
    expenseRequest.departmentCode,
    isCreator,
  );

  if (isDecisionAction(action) && isCreator && !isAdmin) {
    return Response.json({ error: "لا يمكن للمستخدم اتخاذ قرار على طلب أنشأه بنفسه" }, { status: 403 });
  }
  if (!normallyAuthorized && !isAdmin) return Response.json({ error: "القرار متاح للمسؤول الحالي فقط" }, { status: 403 });
  if (isAdmin && (isDecisionAction(action) || !normallyAuthorized) && !overrideReason) {
    return Response.json({ error: "تدخل مدير النظام الاستثنائي يتطلب سببًا مستقلًا ومسجلًا" }, { status: 400 });
  }

  let requestedPriority: Priority | null = null;
  if (payload.priority !== undefined) {
    const normalizedPriority = String(payload.priority).toUpperCase() as Priority;
    if (!priorities.has(normalizedPriority)) return Response.json({ error: "الأولوية غير صحيحة" }, { status: 400 });
    requestedPriority = normalizedPriority;
  }
  const priorityChanged = requestedPriority !== null && requestedPriority !== expenseRequest.priority;
  if (priorityChanged) {
    if (!["ADMIN", "DEPARTMENT_MANAGER", "ACCOUNTING", "EXECUTIVE"].includes(profile.systemRole)) {
      return Response.json({ error: "تغيير الأولوية متاح لمدير الإدارة أو الحسابات أو المدير التنفيذي فقط" }, { status: 403 });
    }
    if (!priorityReason) return Response.json({ error: "سبب تغيير الأولوية إلزامي" }, { status: 400 });
  }

  const assignedDepartment = transition.assignedDepartmentCode || expenseRequest.departmentCode;
  const assignedUser = transition.stage === "CREATOR"
    ? expenseRequest.createdByEmail
    : transition.assignedRole ? `role:${transition.assignedRole}:${assignedDepartment}` : null;
  const now = new Date();
  const nextPriority = requestedPriority || (expenseRequest.priority as Priority);
  const beforeJson = JSON.stringify({
    status: expenseRequest.status,
    stage: expenseRequest.currentStage,
    assignee: expenseRequest.currentAssignee,
    priority: expenseRequest.priority,
    lockVersion: expenseRequest.lockVersion,
  });
  const [updated] = await db.update(expenseRequests).set({
    status: transition.to,
    currentStage: transition.stage,
    currentAssignee: assignedUser,
    priority: nextPriority,
    prioritySetByEmail: priorityChanged ? actor.email : expenseRequest.prioritySetByEmail,
    prioritySetAt: priorityChanged ? now : expenseRequest.prioritySetAt,
    lockVersion: expenseRequest.lockVersion + 1,
    updatedAt: now,
    closedAt: ["REJECTED_FINAL", "CANCELLED"].includes(transition.to) ? now : expenseRequest.closedAt,
  }).where(and(eq(expenseRequests.id, id), eq(expenseRequests.lockVersion, expenseRequest.lockVersion))).returning();
  if (!updated) return Response.json({ error: "تعذر تثبيت القرار بسبب تحديث متزامن؛ أعد فتح الطلب" }, { status: 409 });

  await db.update(workItems).set({ status: "COMPLETED", completedAt: now }).where(and(eq(workItems.requestId, id), eq(workItems.status, "OPEN")));
  if (transition.taskType) {
    await db.insert(workItems).values({
      id: crypto.randomUUID(),
      requestId: id,
      taskType: transition.taskType,
      assignedUserEmail: transition.stage === "CREATOR" ? expenseRequest.createdByEmail : null,
      assignedDepartmentCode: assignedDepartment,
      assignedRole: transition.assignedRole,
      status: "OPEN",
      dueAt: new Date(now.getTime() + 24 * 60 * 60 * 1000),
    });
  }

  const actionId = crypto.randomUUID();
  const recordedParts = [note];
  if (overrideReason) recordedParts.push(`سبب تدخل مدير النظام: ${overrideReason}`);
  if (priorityChanged) recordedParts.push(`تغيير الأولوية من ${expenseRequest.priority} إلى ${nextPriority}: ${priorityReason}`);
  const recordedNote = recordedParts.filter(Boolean).join("\n");
  await db.insert(requestActions).values({
    id: actionId,
    requestId: id,
    action,
    fromStatus: expenseRequest.status,
    toStatus: transition.to,
    actorEmail: actor.email,
    actorName: actor.displayName,
    note: recordedNote || null,
    idempotencyKey,
  });

  const recipients = new Set<string>([expenseRequest.createdByEmail]);
  if (action === "CANCEL" && previousTask) {
    if (previousTask.assignedUserEmail) recipients.add(previousTask.assignedUserEmail);
    else if (previousTask.assignedRole) recipients.add(roleRecipient(previousTask.assignedRole, previousTask.assignedDepartmentCode || expenseRequest.departmentCode));
  } else if (action === "REJECT") {
    const priorActions = await db.select({ action: requestActions.action, actorEmail: requestActions.actorEmail })
      .from(requestActions).where(eq(requestActions.requestId, id));
    for (const priorAction of priorActions) {
      if (approvalActions.has(priorAction.action)) recipients.add(priorAction.actorEmail);
    }
  } else if (transition.stage !== "CREATOR" && transition.assignedRole) {
    recipients.add(roleRecipient(transition.assignedRole, assignedDepartment));
  }

  const title = approvalActions.has(action)
    ? "تم اعتماد الطلب وانتقل للمرحلة التالية"
    : action === "RETURN"
      ? "أعيد الطلب للمرحلة السابقة"
      : action === "REJECT"
        ? "رُفض الطلب نهائيًا"
        : action === "CANCEL"
          ? "أُلغي الطلب قبل الاعتماد"
        : "تغيرت حالة الطلب";
  for (const recipientEmail of recipients) {
    await db.insert(notifications).values({
      id: crypto.randomUUID(),
      recipientEmail,
      title,
      body: `${expenseRequest.requestNumber} · ${note || transition.to}`,
      entityType: "REQUEST",
      entityId: id,
      actionUrl: `/requests/${id}`,
      dedupeKey: `${actionId}:${recipientEmail}`,
      sentByEmail: actor.email,
    });
  }

  const correlationId = crypto.randomUUID();
  const afterJson = JSON.stringify({
    status: updated.status,
    stage: updated.currentStage,
    assignee: updated.currentAssignee,
    priority: updated.priority,
    lockVersion: updated.lockVersion,
  });
  const eventHash = await sha256(`${correlationId}|${actor.email}|${action}|${id}|${beforeJson}|${afterJson}|${now.toISOString()}`);
  await db.insert(auditEvents).values({
    id: crypto.randomUUID(),
    actorEmail: actor.email,
    action,
    entityType: "REQUEST",
    entityId: id,
    beforeJson,
    afterJson,
    reason: recordedNote || null,
    correlationId,
    eventHash,
  });

  const [currentTask] = await db.select().from(workItems)
    .where(and(eq(workItems.requestId, id), eq(workItems.status, "OPEN")))
    .orderBy(desc(workItems.createdAt)).limit(1);
  return Response.json({
    request: {
      id,
      requestNumber: updated.requestNumber,
      status: updated.status,
      currentStage: updated.currentStage,
      currentAssignee: updated.currentAssignee,
      currentResponsible: responsible(currentTask, updated.status),
      currentTask: currentTask || null,
      priority: updated.priority,
      lockVersion: updated.lockVersion,
    },
  });
}
