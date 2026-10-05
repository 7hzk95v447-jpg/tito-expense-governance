import { and, asc, desc, eq, or } from "drizzle-orm";
import { getDb } from "../../../../db";
import { auditEvents, departments, executionAttempts, expenseRequests, files, monthlyObligations, notifications, paymentRunItems, paymentRuns, requestActions, requestRevisions, users, workItems } from "../../../../db/schema";
import { parseRiyadhDate } from "../../../../lib/monthly-reminders";
import { authenticationRequired, getResolvedRequestUser } from "../../../../lib/request-user";
import { settlementGroupFor, sha256 } from "../../../../lib/workflow";

type Context = { params: Promise<{ id: string }> };
type Priority = "NORMAL" | "URGENT" | "CRITICAL";
type PriorityPayload = { priority?: Priority; reason?: string; expectedLockVersion?: number };
type EditPayload = {
  expectedLockVersion?: number;
  overrideReason?: string;
  departmentCode?: string;
  branchCode?: string;
  categoryCode?: string;
  expenseType?: string;
  paymentMethod?: "BANK" | "CASH";
  beneficiaryName?: string;
  beneficiaryType?: string;
  bankName?: string;
  iban?: string;
  accountHolderName?: string;
  accountNameMatch?: "MATCHED" | "MISMATCHED";
  accountMismatchReason?: string;
  totalDueMinor?: number | null;
  paidPreviouslyMinor?: number | null;
  amountMinor?: number;
  purpose?: string;
  details?: string;
  isRecurring?: boolean;
  recurring?: boolean;
  obligationType?: string | null;
  dueDay?: number | null;
  reminderDaysBefore?: number | null;
  nextDueDate?: string | null;
};

const priorities = new Set<Priority>(["NORMAL", "URGENT", "CRITICAL"]);
const categoryDepartment: Record<string, string> = {
  supplier: "PURCHASING",
  employee: "HR",
  government: "FINANCE",
  operations: "BRANCH",
  marketing: "MARKETING",
  it: "IT",
  recurring: "FINANCE",
};
const roleLabels: Record<string, string> = {
  DEPARTMENT_MANAGER: "مدير الإدارة",
  ACCOUNTING_REVIEWER: "مراجع الحسابات",
  EXECUTIVE: "المدير التنفيذي",
  BATCH_PREPARER: "معدّ المسير",
  EXECUTOR: "منفذ المسير",
  REQUESTER: "معدّ الطلب",
};

function sameEmail(left: string | null | undefined, right: string | null | undefined) {
  return Boolean(left && right && left.trim().toLowerCase() === right.trim().toLowerCase());
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

async function loadActorProfile(db: ReturnType<typeof getDb>, actorEmail: string) {
  const [profile] = await db.select().from(users).where(or(eq(users.email, actorEmail), eq(users.authIdentityEmail, actorEmail))).limit(1);
  let departmentCode: string | null = null;
  if (profile?.departmentId) {
    const [department] = await db.select({ code: departments.code }).from(departments).where(eq(departments.id, profile.departmentId)).limit(1);
    departmentCode = department?.code || profile.departmentId;
  }
  return { profile, departmentCode };
}

function canView(
  expenseRequest: typeof expenseRequests.$inferSelect,
  actorEmail: string,
  profile: typeof users.$inferSelect,
  departmentCode: string | null,
  linkedToPaymentRun: boolean,
) {
  const creator = sameEmail(expenseRequest.createdByEmail, actorEmail)
    || sameEmail(expenseRequest.createdByEmail, profile.email)
    || sameEmail(expenseRequest.createdByEmail, profile.authIdentityEmail);
  if (creator) return true;
  if (profile.systemRole === "ADMIN") return true;
  if (expenseRequest.status === "DRAFT") return false;
  if (["ACCOUNTING", "EXECUTIVE"].includes(profile.systemRole)) return true;
  if (["BATCH_APPROVER", "EXECUTOR"].includes(profile.systemRole)) return linkedToPaymentRun;
  return profile.systemRole === "DEPARTMENT_MANAGER" && departmentCode === expenseRequest.departmentCode;
}

function taskRecipient(task: typeof workItems.$inferSelect | undefined) {
  if (!task) return null;
  if (task.assignedUserEmail) return task.assignedUserEmail;
  if (!task.assignedRole) return null;
  return task.assignedRole === "DEPARTMENT_MANAGER" && task.assignedDepartmentCode
    ? `department.${task.assignedDepartmentCode.toLowerCase()}@tito.local`
    : `role.${task.assignedRole.toLowerCase()}@tito.local`;
}

function validateEdit(payload: EditPayload) {
  if (!payload.categoryCode || !payload.expenseType?.trim()) return "تصنيف الطلب مطلوب";
  if (!payload.paymentMethod || !payload.beneficiaryName?.trim() || !payload.beneficiaryType) return "بيانات المستفيد وطريقة الصرف مطلوبة";
  if (!Number.isInteger(payload.amountMinor) || (payload.amountMinor ?? 0) <= 0) return "مبلغ الصرف غير صحيح";
  if (payload.totalDueMinor != null && (!Number.isInteger(payload.totalDueMinor) || payload.totalDueMinor < 0)) return "إجمالي الاستحقاق غير صحيح";
  if (payload.paidPreviouslyMinor != null && (!Number.isInteger(payload.paidPreviouslyMinor) || payload.paidPreviouslyMinor < 0)) return "المدفوع سابقًا غير صحيح";
  if (payload.totalDueMinor != null && payload.paidPreviouslyMinor != null && (payload.amountMinor ?? 0) > payload.totalDueMinor - payload.paidPreviouslyMinor) return "المبلغ المطلوب أكبر من الرصيد المتبقي";
  if ((payload.details?.trim().length ?? 0) < 10 || !payload.purpose?.trim()) return "الغرض والبيان التفصيلي الواضح مطلوبان";
  if (payload.paymentMethod === "BANK") {
    const iban = (payload.iban || "").replace(/\s/g, "").toUpperCase();
    if (!payload.bankName?.trim() || !/^SA\d{22}$/.test(iban) || !payload.accountHolderName?.trim()) return "بيانات البنك والآيبان واسم صاحب الحساب غير مكتملة";
    if (!payload.accountNameMatch) return "حدد حالة مطابقة اسم الحساب للمستفيد";
    if (payload.accountNameMatch === "MISMATCHED" && !payload.accountMismatchReason?.trim()) return "سبب عدم مطابقة اسم الحساب إلزامي";
  }
  return null;
}

export async function GET(request: Request, context: Context) {
  const { id } = await context.params;
  const actor = await getResolvedRequestUser(request);
  if (!actor) return authenticationRequired();
  const db = getDb();
  const [expenseRequest] = await db.select().from(expenseRequests).where(eq(expenseRequests.id, id)).limit(1);
  if (!expenseRequest) return Response.json({ error: "الطلب غير موجود" }, { status: 404 });

  const { profile, departmentCode } = await loadActorProfile(db, actor.email);
  if (!profile || profile.status !== "ACTIVE") return Response.json({ error: "المستخدم غير مسجل أو غير نشط" }, { status: 403 });
  let linkedToPaymentRun = false;
  if (["BATCH_APPROVER", "EXECUTOR"].includes(profile.systemRole) && expenseRequest.status !== "DRAFT") {
    const [linkedItem] = await db.select({ id: paymentRunItems.id }).from(paymentRunItems)
      .where(eq(paymentRunItems.requestId, expenseRequest.id)).limit(1);
    linkedToPaymentRun = Boolean(linkedItem);
  }
  if (!canView(expenseRequest, actor.email, profile, departmentCode, linkedToPaymentRun)) return Response.json({ error: "غير مصرح بعرض هذا الطلب" }, { status: 403 });

  const [attachmentRows, actionRows, currentTasks, linkedItems] = await Promise.all([
    db.select({
      id: files.id,
      originalName: files.originalName,
      mimeType: files.mimeType,
      sizeBytes: files.sizeBytes,
      purpose: files.purpose,
      status: files.status,
      uploadedByEmail: files.uploadedByEmail,
      createdAt: files.createdAt,
    }).from(files).where(and(eq(files.requestId, id), eq(files.status, "READY"))).orderBy(asc(files.createdAt)),
    db.select().from(requestActions).where(eq(requestActions.requestId, id)).orderBy(asc(requestActions.createdAt)),
    db.select().from(workItems).where(and(eq(workItems.requestId, id), eq(workItems.status, "OPEN"))).orderBy(desc(workItems.createdAt)).limit(1),
    db.select().from(paymentRunItems).where(eq(paymentRunItems.requestId, id)).orderBy(desc(paymentRunItems.createdAt)).limit(1),
  ]);
  const linkedItem = linkedItems[0];
  const [linkedRun, latestExecution] = linkedItem ? await Promise.all([
    db.select().from(paymentRuns).where(eq(paymentRuns.id, linkedItem.paymentRunId)).limit(1).then((rows) => rows[0] || null),
    db.select().from(executionAttempts).where(eq(executionAttempts.paymentRunItemId, linkedItem.id)).orderBy(desc(executionAttempts.attemptNumber)).limit(1).then((rows) => rows[0] || null),
  ]) : [null, null];
  let currentTask = currentTasks[0];
  if (!currentTask && linkedRun) {
    const [runTask] = await db.select().from(workItems)
      .where(and(eq(workItems.paymentRunId, linkedRun.id), eq(workItems.status, "OPEN")))
      .orderBy(desc(workItems.createdAt)).limit(1);
    currentTask = runTask;
  }
  const creator = sameEmail(expenseRequest.createdByEmail, actor.email)
    || sameEmail(expenseRequest.createdByEmail, profile.email)
    || sameEmail(expenseRequest.createdByEmail, profile.authIdentityEmail);
  const isAdmin = profile.systemRole === "ADMIN";
  const editableStatus = ["DRAFT", "PENDING_DEPARTMENT", "RETURNED_TO_CREATOR"].includes(expenseRequest.status);
  const decisionStatuses = ["PENDING_DEPARTMENT", "RETURNED_ACCOUNTING_TO_DEPARTMENT", "PENDING_ACCOUNTING", "PENDING_EXECUTIVE"];
  const stageDecision = (isAdmin && decisionStatuses.includes(expenseRequest.status))
    || (["PENDING_DEPARTMENT", "RETURNED_ACCOUNTING_TO_DEPARTMENT"].includes(expenseRequest.status) && profile.systemRole === "DEPARTMENT_MANAGER" && departmentCode === expenseRequest.departmentCode)
    || (expenseRequest.status === "PENDING_ACCOUNTING" && profile.systemRole === "ACCOUNTING")
    || (expenseRequest.status === "PENDING_EXECUTIVE" && profile.systemRole === "EXECUTIVE");
  return Response.json({
    request: expenseRequest,
    attachments: attachmentRows.map((file) => ({ ...file, url: `/api/files/${file.id}` })),
    actions: actionRows,
    paymentRun: linkedRun,
    paymentRunItem: linkedItem || null,
    execution: latestExecution,
    currentTask: currentTask || null,
    currentResponsible: responsible(currentTask, expenseRequest.status),
    permissions: {
      canPreview: true,
      canEdit: editableStatus && (creator || isAdmin),
      canCancel: editableStatus && (creator || isAdmin),
      canDecide: stageDecision && (!creator || isAdmin),
      canPrepareRun: expenseRequest.status === "READY_FOR_BATCH" && ["ADMIN", "ACCOUNTING"].includes(profile.systemRole),
    },
  });
}

export async function PUT(request: Request, context: Context) {
  const { id } = await context.params;
  const actor = await getResolvedRequestUser(request);
  if (!actor) return authenticationRequired();
  const payload = (await request.json()) as EditPayload;
  const idempotencyKey = request.headers.get("idempotency-key")?.trim();
  if (!idempotencyKey) return Response.json({ error: "مفتاح العملية مطلوب لمنع تكرار التعديل" }, { status: 400 });
  if (!Number.isInteger(payload.expectedLockVersion)) return Response.json({ error: "نسخة الطلب الحالية مطلوبة" }, { status: 428 });

  const db = getDb();
  const [expenseRequest] = await db.select().from(expenseRequests).where(eq(expenseRequests.id, id)).limit(1);
  if (!expenseRequest) return Response.json({ error: "الطلب غير موجود" }, { status: 404 });
  if (payload.expectedLockVersion !== expenseRequest.lockVersion) return Response.json({ error: "تم تحديث الطلب من مستخدم آخر؛ أعد فتحه", currentLockVersion: expenseRequest.lockVersion }, { status: 409 });
  if (!["DRAFT", "PENDING_DEPARTMENT", "RETURNED_TO_CREATOR"].includes(expenseRequest.status)) return Response.json({ error: "لا يمكن تعديل الطلب بعد بدء الاعتماد المالي" }, { status: 409 });

  const { profile, departmentCode: actorDepartmentCode } = await loadActorProfile(db, actor.email);
  if (!profile || profile.status !== "ACTIVE") return Response.json({ error: "المستخدم غير مسجل أو غير نشط" }, { status: 403 });
  const creator = sameEmail(expenseRequest.createdByEmail, actor.email) || sameEmail(expenseRequest.createdByEmail, profile.email) || sameEmail(expenseRequest.createdByEmail, profile.authIdentityEmail);
  const isAdmin = profile.systemRole === "ADMIN";
  if (!creator && !isAdmin) return Response.json({ error: "التعديل متاح لمُعدّ الطلب فقط" }, { status: 403 });
  const overrideReason = payload.overrideReason?.trim() || "";
  if (!creator && isAdmin && !overrideReason) return Response.json({ error: "تعديل مدير النظام الاستثنائي يتطلب سببًا" }, { status: 400 });
  const [duplicate] = await db.select({ requestId: requestActions.requestId }).from(requestActions).where(eq(requestActions.idempotencyKey, idempotencyKey)).limit(1);
  if (duplicate) {
    if (duplicate.requestId !== id) return Response.json({ error: "مفتاح العملية مستخدم لطلب آخر" }, { status: 409 });
    return Response.json({ duplicatePrevented: true, request: expenseRequest });
  }
  const nextDepartment = categoryDepartment[payload.categoryCode || ""]
    || (creator ? actorDepartmentCode : expenseRequest.departmentCode);
  if (!nextDepartment) return Response.json({ error: "يجب ربط مُعدّ الطلب بإدارة قبل التعديل" }, { status: 409 });
  const normalizedPayload: EditPayload = { ...payload, departmentCode: nextDepartment };
  const error = validateEdit(normalizedPayload);
  if (error) return Response.json({ error }, { status: 400 });
  const recurring = Boolean(payload.isRecurring || payload.recurring);
  const reminderDaysBefore = payload.reminderDaysBefore ?? 3;
  const recurringDueDate = recurring ? parseRiyadhDate(payload.nextDueDate || undefined) : null;
  if (recurring && !recurringDueDate) return Response.json({ error: "تاريخ استحقاق الالتزام الشهري غير صحيح" }, { status: 400 });
  if (recurring && (!Number.isInteger(reminderDaysBefore) || reminderDaysBefore < 0 || reminderDaysBefore > 31)) return Response.json({ error: "مدة تنبيه الالتزام الشهري غير صحيحة" }, { status: 400 });

  const readyFiles = await db.select({ id: files.id, originalName: files.originalName, mimeType: files.mimeType }).from(files)
    .where(and(or(eq(files.requestId, id), and(eq(files.draftKey, expenseRequest.draftKey), eq(files.uploadedByEmail, actor.email))), eq(files.status, "READY"))).orderBy(asc(files.createdAt));
  if (payload.paymentMethod === "BANK" && payload.accountNameMatch === "MISMATCHED" && !readyFiles.length) return Response.json({ error: "عدم مطابقة اسم الحساب يتطلب تفويضًا أو عقدًا أو مستند إثبات" }, { status: 400 });

  const nextRevision = expenseRequest.revisionNumber + 1;
  const now = new Date();
  const nextCategory = payload.categoryCode!;
  const snapshot = JSON.stringify({ ...normalizedPayload, expectedLockVersion: undefined, overrideReason: undefined, attachments: readyFiles });
  const beforeJson = JSON.stringify(expenseRequest);
  const [updated] = await db.update(expenseRequests).set({
    departmentCode: nextDepartment,
    branchCode: payload.branchCode || expenseRequest.branchCode,
    categoryCode: nextCategory,
    expenseType: payload.expenseType!.trim(),
    settlementGroup: settlementGroupFor(nextCategory),
    paymentMethod: payload.paymentMethod!,
    beneficiaryName: payload.beneficiaryName!.trim(),
    beneficiaryType: payload.beneficiaryType!,
    bankName: payload.paymentMethod === "BANK" ? payload.bankName!.trim() : null,
    iban: payload.paymentMethod === "BANK" ? payload.iban!.replace(/\s/g, "").toUpperCase() : null,
    accountHolderName: payload.paymentMethod === "BANK" ? payload.accountHolderName!.trim() : null,
    accountNameMatch: payload.paymentMethod === "BANK" ? payload.accountNameMatch! : null,
    accountMismatchReason: payload.paymentMethod === "BANK" && payload.accountNameMatch === "MISMATCHED" ? payload.accountMismatchReason!.trim() : null,
    cashRecipient: payload.paymentMethod === "CASH" ? payload.beneficiaryName!.trim() : null,
    totalDueMinor: payload.totalDueMinor ?? null,
    paidPreviouslyMinor: payload.paidPreviouslyMinor ?? null,
    amountMinor: payload.amountMinor!,
    purpose: payload.purpose!.trim(),
    details: payload.details!.trim(),
    currentAssignee: expenseRequest.status === "PENDING_DEPARTMENT" ? `role:DEPARTMENT_MANAGER:${nextDepartment}` : expenseRequest.currentAssignee,
    revisionNumber: nextRevision,
    lockVersion: expenseRequest.lockVersion + 1,
    updatedAt: now,
  }).where(and(eq(expenseRequests.id, id), eq(expenseRequests.lockVersion, expenseRequest.lockVersion))).returning();
  if (!updated) return Response.json({ error: "تعذر حفظ التعديل بسبب تحديث متزامن" }, { status: 409 });

  let monthlyObligationId = expenseRequest.monthlyObligationId;
  if (recurring && recurringDueDate) {
    if (monthlyObligationId) {
      await db.update(monthlyObligations).set({
        title: payload.purpose!.trim(), obligationType: payload.obligationType?.trim() || payload.expenseType!.trim(),
        providerName: payload.beneficiaryName!.trim(), paymentMethod: payload.paymentMethod!,
        expectedAmountMinor: payload.amountMinor!, dueDay: payload.dueDay || Number(payload.nextDueDate?.slice(-2)) || 28,
        reminderDaysBefore, nextDueDate: recurringDueDate, responsibleEmail: expenseRequest.createdByEmail,
        departmentCode: nextDepartment, status: "ACTIVE", lastNotifiedPeriod: null, updatedAt: now,
      }).where(eq(monthlyObligations.id, monthlyObligationId));
    } else {
      monthlyObligationId = crypto.randomUUID();
      await db.insert(monthlyObligations).values({
        id: monthlyObligationId, title: payload.purpose!.trim(), obligationType: payload.obligationType?.trim() || payload.expenseType!.trim(),
        providerName: payload.beneficiaryName!.trim(), paymentMethod: payload.paymentMethod!, expectedAmountMinor: payload.amountMinor!,
        dueDay: payload.dueDay || Number(payload.nextDueDate?.slice(-2)) || 28, reminderDaysBefore,
        nextDueDate: recurringDueDate, responsibleEmail: expenseRequest.createdByEmail, departmentCode: nextDepartment,
        status: "ACTIVE", createdByEmail: actor.email,
      });
      await db.update(expenseRequests).set({ monthlyObligationId }).where(eq(expenseRequests.id, id));
    }
  } else if (monthlyObligationId) {
    await db.update(monthlyObligations).set({ status: "INACTIVE", updatedAt: now }).where(eq(monthlyObligations.id, monthlyObligationId));
    await db.update(expenseRequests).set({ monthlyObligationId: null }).where(eq(expenseRequests.id, id));
    monthlyObligationId = null;
  }

  await db.update(files).set({ requestId: id }).where(and(eq(files.draftKey, expenseRequest.draftKey), eq(files.status, "READY"), eq(files.uploadedByEmail, actor.email)));
  if (expenseRequest.status === "PENDING_DEPARTMENT") {
    await db.update(workItems).set({ assignedDepartmentCode: nextDepartment }).where(and(eq(workItems.requestId, id), eq(workItems.status, "OPEN")));
  }
  const reason = expenseRequest.status === "PENDING_DEPARTMENT" ? "تعديل قبل أول اعتماد" : expenseRequest.status === "RETURNED_TO_CREATOR" ? "تعديل الطلب المعاد" : "تحديث المسودة";
  await db.insert(requestRevisions).values({ id: crypto.randomUUID(), requestId: id, revisionNumber: nextRevision, snapshotJson: snapshot, reason, changedByEmail: actor.email });
  const actionId = crypto.randomUUID();
  const actionNote = [reason, overrideReason ? `سبب تدخل مدير النظام: ${overrideReason}` : ""].filter(Boolean).join("\n");
  await db.insert(requestActions).values({ id: actionId, requestId: id, action: "EDIT_BEFORE_APPROVAL", fromStatus: expenseRequest.status, toStatus: expenseRequest.status, actorEmail: actor.email, actorName: actor.displayName, note: actionNote, idempotencyKey });
  if (expenseRequest.status === "PENDING_DEPARTMENT") {
    await db.insert(notifications).values({ id: crypto.randomUUID(), recipientEmail: `department.${nextDepartment.toLowerCase()}@tito.local`, title: "عُدّل طلب قبل اعتماد الإدارة", body: `${expenseRequest.requestNumber} · الإصدار ${nextRevision}`, entityType: "REQUEST", entityId: id, actionUrl: `/requests/${id}`, dedupeKey: `${actionId}:DEPARTMENT`, sentByEmail: actor.email });
  }
  const correlationId = crypto.randomUUID();
  const afterJson = JSON.stringify(updated);
  const eventHash = await sha256(`${correlationId}|${actor.email}|EDIT_BEFORE_APPROVAL|${id}|${beforeJson}|${afterJson}|${now.toISOString()}`);
  await db.insert(auditEvents).values({ id: crypto.randomUUID(), actorEmail: actor.email, action: "EDIT_BEFORE_APPROVAL", entityType: "REQUEST", entityId: id, beforeJson, afterJson, reason: actionNote, correlationId, eventHash });
  const [savedRequest] = await db.select().from(expenseRequests).where(eq(expenseRequests.id, id)).limit(1);
  return Response.json({ request: savedRequest || { ...updated, monthlyObligationId } });
}

export async function PATCH(request: Request, context: Context) {
  const { id } = await context.params;
  const actor = await getResolvedRequestUser(request);
  if (!actor) return authenticationRequired();
  const payload = (await request.json()) as PriorityPayload;
  const reason = payload.reason?.trim() || "";
  const idempotencyKey = request.headers.get("idempotency-key")?.trim();
  if (!idempotencyKey) return Response.json({ error: "مفتاح العملية مطلوب لمنع تكرار الإجراء" }, { status: 400 });
  if (!Number.isInteger(payload.expectedLockVersion)) return Response.json({ error: "نسخة الطلب الحالية مطلوبة" }, { status: 428 });
  const priority = String(payload.priority || "").toUpperCase() as Priority;
  if (!priorities.has(priority)) return Response.json({ error: "الأولوية غير صحيحة" }, { status: 400 });

  const db = getDb();
  const [expenseRequest] = await db.select().from(expenseRequests).where(eq(expenseRequests.id, id)).limit(1);
  if (!expenseRequest) return Response.json({ error: "الطلب غير موجود" }, { status: 404 });
  if (payload.expectedLockVersion !== expenseRequest.lockVersion) {
    return Response.json({ error: "تم تحديث الطلب من مستخدم آخر؛ أعد فتحه", currentLockVersion: expenseRequest.lockVersion }, { status: 409 });
  }
  if (["REJECTED_FINAL", "CANCELLED", "EXECUTED"].includes(expenseRequest.status)) {
    return Response.json({ error: "لا يمكن تغيير أولوية طلب مغلق" }, { status: 409 });
  }

  const { profile, departmentCode } = await loadActorProfile(db, actor.email);
  if (!profile || profile.status !== "ACTIVE") return Response.json({ error: "المستخدم غير مسجل أو غير نشط" }, { status: 403 });
  if (!["ADMIN", "DEPARTMENT_MANAGER", "ACCOUNTING"].includes(profile.systemRole)) {
    return Response.json({ error: "تغيير الأولوية متاح لمدير الإدارة أو الحسابات فقط" }, { status: 403 });
  }
  if (expenseRequest.status === "DRAFT" && profile.systemRole !== "ADMIN") {
    return Response.json({ error: "المسودة خاصة بمُعدّ الطلب حتى إرسالها" }, { status: 403 });
  }
  if (profile.systemRole === "DEPARTMENT_MANAGER" && departmentCode !== expenseRequest.departmentCode) {
    return Response.json({ error: "لا يمكن تغيير أولوية طلب خارج الإدارة المرتبطة" }, { status: 403 });
  }
  const [duplicate] = await db.select({ id: requestActions.id, requestId: requestActions.requestId })
    .from(requestActions).where(eq(requestActions.idempotencyKey, idempotencyKey)).limit(1);
  if (duplicate) {
    if (duplicate.requestId !== id) return Response.json({ error: "مفتاح العملية مستخدم لطلب آخر" }, { status: 409 });
    const [currentTask] = await db.select().from(workItems).where(and(eq(workItems.requestId, id), eq(workItems.status, "OPEN"))).orderBy(desc(workItems.createdAt)).limit(1);
    return Response.json({
      duplicatePrevented: true,
      request: {
        id,
        status: expenseRequest.status,
        currentStage: expenseRequest.currentStage,
        currentAssignee: expenseRequest.currentAssignee,
        currentResponsible: responsible(currentTask, expenseRequest.status),
        priority: expenseRequest.priority,
        lockVersion: expenseRequest.lockVersion,
      },
    });
  }
  if (priority === expenseRequest.priority) {
    const [currentTask] = await db.select().from(workItems).where(and(eq(workItems.requestId, id), eq(workItems.status, "OPEN"))).orderBy(desc(workItems.createdAt)).limit(1);
    return Response.json({
      unchanged: true,
      request: {
        id,
        status: expenseRequest.status,
        currentStage: expenseRequest.currentStage,
        currentAssignee: expenseRequest.currentAssignee,
        currentResponsible: responsible(currentTask, expenseRequest.status),
        priority: expenseRequest.priority,
        lockVersion: expenseRequest.lockVersion,
      },
    });
  }
  if (!reason) return Response.json({ error: "سبب تغيير الأولوية إلزامي" }, { status: 400 });

  const now = new Date();
  const [updated] = await db.update(expenseRequests).set({
    priority,
    prioritySetByEmail: actor.email,
    prioritySetAt: now,
    lockVersion: expenseRequest.lockVersion + 1,
    updatedAt: now,
  }).where(and(eq(expenseRequests.id, id), eq(expenseRequests.lockVersion, expenseRequest.lockVersion))).returning();
  if (!updated) return Response.json({ error: "تعذر تغيير الأولوية بسبب تحديث متزامن" }, { status: 409 });

  const note = `تغيير الأولوية من ${expenseRequest.priority} إلى ${priority}: ${reason}`;
  const actionId = crypto.randomUUID();
  await db.insert(requestActions).values({
    id: actionId,
    requestId: id,
    action: "SET_PRIORITY",
    fromStatus: expenseRequest.status,
    toStatus: expenseRequest.status,
    actorEmail: actor.email,
    actorName: actor.displayName,
    note,
    idempotencyKey,
  });

  const [currentTask] = await db.select().from(workItems).where(and(eq(workItems.requestId, id), eq(workItems.status, "OPEN"))).orderBy(desc(workItems.createdAt)).limit(1);
  const recipients = new Set<string>([expenseRequest.createdByEmail]);
  const currentRecipient = taskRecipient(currentTask);
  if (currentRecipient) recipients.add(currentRecipient);
  for (const recipientEmail of recipients) {
    await db.insert(notifications).values({
      id: crypto.randomUUID(),
      recipientEmail,
      title: priority === "CRITICAL" ? "رُفع الطلب إلى الأولوية القصوى" : "تغيرت أولوية الطلب",
      body: `${expenseRequest.requestNumber} · ${note}`,
      entityType: "REQUEST",
      entityId: id,
      actionUrl: `/requests/${id}`,
      dedupeKey: `${actionId}:${recipientEmail}`,
      sentByEmail: actor.email,
    });
  }

  const correlationId = crypto.randomUUID();
  const beforeJson = JSON.stringify({ priority: expenseRequest.priority, lockVersion: expenseRequest.lockVersion });
  const afterJson = JSON.stringify({ priority: updated.priority, lockVersion: updated.lockVersion });
  const eventHash = await sha256(`${correlationId}|${actor.email}|SET_PRIORITY|${id}|${beforeJson}|${afterJson}|${now.toISOString()}`);
  await db.insert(auditEvents).values({
    id: crypto.randomUUID(),
    actorEmail: actor.email,
    action: "SET_PRIORITY",
    entityType: "REQUEST",
    entityId: id,
    beforeJson,
    afterJson,
    reason,
    correlationId,
    eventHash,
  });

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
