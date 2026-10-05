import { and, desc, eq, ne, or } from "drizzle-orm";
import { getDb } from "../../../db";
import { auditEvents, branches, departments, expenseRequests, files, monthlyObligations, notifications, requestActions, requestRevisions, users, workItems } from "../../../db/schema";
import { authenticationRequired, getResolvedRequestUser } from "../../../lib/request-user";
import { settlementGroupFor, sha256 } from "../../../lib/workflow";

type RequestPayload = {
  intent?: "DRAFT" | "SUBMIT";
  draftKey?: string;
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
  cashRecipient?: string;
  totalDueMinor?: number | null;
  paidPreviouslyMinor?: number | null;
  amountMinor?: number;
  purpose?: string;
  details?: string;
  isRecurring?: boolean;
  recurring?: boolean;
  obligationType?: string;
  dueDay?: number;
  reminderDaysBefore?: number;
  nextDueDate?: string;
  accountReference?: string;
};

const categoryDepartment: Record<string, string> = {
  supplier: "PURCHASING",
  employee: "HR",
  government: "FINANCE",
  operations: "BRANCH",
  marketing: "MARKETING",
  it: "IT",
  recurring: "FINANCE",
};

function requestNumber() {
  const now = new Date();
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Riyadh", year: "2-digit", month: "2-digit", day: "2-digit" }).formatToParts(now);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value || "00";
  const yy = part("year");
  const mm = part("month");
  const dd = part("day");
  const suffix = crypto.getRandomValues(new Uint32Array(1))[0] % 10000;
  return `T2-${yy}${mm}${dd}-${String(suffix).padStart(4, "0")}`;
}

function validate(payload: RequestPayload, submit: boolean) {
  if (!payload.draftKey) return "تعذر تحديد المسودة";
  if (!submit) return null;
  if (!payload.departmentCode || !payload.categoryCode || !payload.expenseType) return "تصنيف الطلب والإدارة مطلوبان";
  if (!payload.paymentMethod || !payload.beneficiaryName || !payload.beneficiaryType) return "بيانات المستفيد وطريقة الصرف مطلوبة";
  if (!Number.isInteger(payload.amountMinor) || (payload.amountMinor ?? 0) <= 0) return "مبلغ الصرف غير صحيح";
  if (payload.totalDueMinor != null && (!Number.isInteger(payload.totalDueMinor) || payload.totalDueMinor < 0)) return "إجمالي الاستحقاق غير صحيح";
  if (payload.paidPreviouslyMinor != null && (!Number.isInteger(payload.paidPreviouslyMinor) || payload.paidPreviouslyMinor < 0)) return "المدفوع سابقًا غير صحيح";
  if (payload.totalDueMinor != null && payload.paidPreviouslyMinor != null && (payload.amountMinor ?? 0) > payload.totalDueMinor - payload.paidPreviouslyMinor) return "المبلغ المطلوب أكبر من الرصيد المتبقي";
  if ((payload.details?.trim().length ?? 0) < 10) return "البيان التفصيلي يجب أن يكون واضحًا";
  if (payload.paymentMethod === "BANK") {
    if (!payload.bankName?.trim()) return "اسم البنك مطلوب";
    if (!/^SA\d{22}$/.test((payload.iban || "").replace(/\s/g, "").toUpperCase())) return "رقم الآيبان السعودي غير مكتمل";
    if (!payload.accountHolderName?.trim()) return "اسم صاحب الحساب مطلوب";
    if (!payload.accountNameMatch) return "يجب تحديد حالة مطابقة اسم الحساب للمستفيد";
    if (payload.accountNameMatch === "MISMATCHED" && !payload.accountMismatchReason?.trim()) return "سبب عدم مطابقة اسم الحساب إلزامي";
  }
  return null;
}

function nextMonthlyDate(dueDay = 28) {
  const now = new Date();
  const safeDay = Math.min(31, Math.max(1, dueDay));
  const make = (year: number, month: number) => new Date(Date.UTC(year, month, Math.min(safeDay, new Date(Date.UTC(year, month + 1, 0)).getUTCDate()), 9));
  let due = make(now.getUTCFullYear(), now.getUTCMonth());
  if (due < now) due = make(now.getUTCMonth() === 11 ? now.getUTCFullYear() + 1 : now.getUTCFullYear(), (now.getUTCMonth() + 1) % 12);
  return due;
}

function responsibility(stage: string, department: string) {
  if (stage === "DEPARTMENT") return `مدير إدارة ${department}`;
  if (stage === "ACCOUNTING") return "إدارة المالية والحسابات";
  if (stage === "EXECUTIVE") return "المدير التنفيذي";
  if (stage === "BATCH_PREPARATION") return "مُعدّ المسير";
  if (stage === "EXECUTION") return "منفذ العملية";
  if (stage === "CREATOR") return "مُعدّ الطلب";
  return "مغلقة";
}

function sameEmail(left: string | null | undefined, right: string | null | undefined) {
  return Boolean(left && right && left.trim().toLowerCase() === right.trim().toLowerCase());
}

async function profileOrganization(db: ReturnType<typeof getDb>, profile: typeof users.$inferSelect) {
  const [department, branch] = await Promise.all([
    profile.departmentId
      ? db.select({ code: departments.code }).from(departments).where(eq(departments.id, profile.departmentId)).limit(1).then((rows) => rows[0])
      : Promise.resolve(undefined),
    profile.branchId
      ? db.select({ code: branches.code }).from(branches).where(eq(branches.id, profile.branchId)).limit(1).then((rows) => rows[0])
      : Promise.resolve(undefined),
  ]);
  return {
    departmentCode: department?.code || profile.departmentId || null,
    branchCode: branch?.code || profile.branchId || null,
  };
}

export async function GET(request: Request) {
  const user = await getResolvedRequestUser(request);
  if (!user) return authenticationRequired();
  const url = new URL(request.url);
  const requestedLimit = Number(url.searchParams.get("limit") || 100);
  const requestedOffset = Number(url.searchParams.get("offset") || 0);
  const limit = Number.isInteger(requestedLimit) ? Math.min(500, Math.max(1, requestedLimit)) : 100;
  const offset = Number.isInteger(requestedOffset) ? Math.max(0, requestedOffset) : 0;
  const db = getDb();
  const [profile] = await db.select().from(users).where(or(eq(users.email, user.email), eq(users.authIdentityEmail, user.email))).limit(1);
  if (profile?.status !== "ACTIVE") return Response.json({ error: "الحساب غير مرتبط أو موقوف" }, { status: 403 });
  let rows;
  if (profile?.systemRole === "ADMIN") {
    rows = await db.select().from(expenseRequests).orderBy(desc(expenseRequests.createdAt)).limit(limit).offset(offset);
  } else if (profile?.systemRole === "ACCOUNTING" || profile?.systemRole === "EXECUTIVE") {
    rows = await db.select().from(expenseRequests).where(ne(expenseRequests.status, "DRAFT")).orderBy(desc(expenseRequests.createdAt)).limit(limit).offset(offset);
  } else if (profile?.systemRole === "DEPARTMENT_MANAGER" && profile.departmentId) {
    const [department] = await db.select({ code: departments.code }).from(departments).where(eq(departments.id, profile.departmentId)).limit(1);
    rows = await db.select().from(expenseRequests).where(and(eq(expenseRequests.departmentCode, department?.code || profile.departmentId), ne(expenseRequests.status, "DRAFT"))).orderBy(desc(expenseRequests.createdAt)).limit(limit).offset(offset);
  } else {
    rows = await db.select().from(expenseRequests).where(eq(expenseRequests.createdByEmail, user.email)).orderBy(desc(expenseRequests.createdAt)).limit(limit).offset(offset);
  }
  return Response.json({ requests: rows, page: { limit, offset, hasMore: rows.length === limit } });
}

export async function POST(request: Request) {
  const user = await getResolvedRequestUser(request);
  if (!user) return authenticationRequired();
  const payload = (await request.json()) as RequestPayload;
  const submit = payload.intent === "SUBMIT";

  const db = getDb();
  const [profile] = await db.select().from(users).where(or(eq(users.email, user.email), eq(users.authIdentityEmail, user.email))).limit(1);
  if (profile?.status !== "ACTIVE") return Response.json({ error: "الحساب غير مرتبط أو موقوف" }, { status: 403 });
  const organization = await profileOrganization(db, profile);
  if (!organization.departmentCode) return Response.json({ error: "يجب ربط المستخدم بإدارة قبل إنشاء الطلب" }, { status: 409 });
  const categoryCode = payload.categoryCode || "other";
  const departmentCode = categoryDepartment[categoryCode] || organization.departmentCode;
  const branchCode = organization.branchCode || "KHAMIS";
  const normalizedPayload: RequestPayload = { ...payload, departmentCode, branchCode };
  const error = validate(normalizedPayload, submit);
  if (error) return Response.json({ error }, { status: 400 });
  const id = crypto.randomUUID();
  const number = requestNumber();
  const draftKey = payload.draftKey!;
  const status = submit ? "PENDING_DEPARTMENT" : "DRAFT";
  const stage = submit ? "DEPARTMENT" : "CREATOR";
  const createdByName = profile.fullName || user.displayName;
  const snapshot = JSON.stringify(normalizedPayload);
  const now = new Date();

  if (submit && payload.paymentMethod === "BANK" && payload.accountNameMatch === "MISMATCHED") {
    const evidence = await db.select({ id: files.id }).from(files).where(and(eq(files.draftKey, draftKey), eq(files.status, "READY"), eq(files.uploadedByEmail, user.email)));
    if (!evidence.length) return Response.json({ error: "عند عدم مطابقة اسم الحساب يجب إرفاق تفويض أو عقد أو إثبات واحد على الأقل" }, { status: 400 });
  }

  const duplicate = await db.select().from(expenseRequests).where(eq(expenseRequests.draftKey, draftKey)).limit(1);
  if (duplicate.length) {
    const existing = duplicate[0];
    const ownsDraft = sameEmail(existing.createdByEmail, user.email)
      || sameEmail(existing.createdByEmail, profile.email)
      || sameEmail(existing.createdByEmail, profile.authIdentityEmail);
    if (!ownsDraft) return Response.json({ error: "المسودة غير موجودة" }, { status: 404 });
    if (existing.status !== "DRAFT") {
      return Response.json({
        request: {
          id: existing.id,
          requestNumber: existing.requestNumber,
          status: existing.status,
          currentStage: existing.currentStage,
          currentResponsible: responsibility(existing.currentStage, existing.departmentCode),
        },
        duplicatePrevented: true,
      }, { status: 200 });
    }
    const nextRevision = existing.revisionNumber + 1;
    const [updated] = await db.update(expenseRequests).set({
      departmentCode,
      branchCode,
      categoryCode, expenseType: payload.expenseType || existing.expenseType,
      settlementGroup: settlementGroupFor(categoryCode), paymentMethod: payload.paymentMethod || existing.paymentMethod,
      beneficiaryName: payload.beneficiaryName || existing.beneficiaryName,
      beneficiaryType: payload.beneficiaryType || existing.beneficiaryType,
      bankName: payload.bankName || existing.bankName,
      iban: payload.iban?.replace(/\s/g, "").toUpperCase() || existing.iban,
      accountHolderName: payload.accountHolderName?.trim() || existing.accountHolderName,
      accountNameMatch: payload.accountNameMatch || existing.accountNameMatch,
      accountMismatchReason: payload.accountNameMatch === "MISMATCHED" ? payload.accountMismatchReason?.trim() || existing.accountMismatchReason : null,
      cashRecipient: payload.paymentMethod === "CASH" ? (payload.beneficiaryName || existing.beneficiaryName) : null,
      governmentBiller: null,
      totalDueMinor: payload.totalDueMinor ?? existing.totalDueMinor,
      paidPreviouslyMinor: payload.paidPreviouslyMinor ?? existing.paidPreviouslyMinor,
      amountMinor: payload.amountMinor || existing.amountMinor,
      purpose: payload.purpose?.trim() || existing.purpose,
      details: payload.details?.trim() || existing.details,
      priority: existing.priority || "NORMAL",
      status, currentStage: stage,
      currentAssignee: submit ? `role:DEPARTMENT_MANAGER:${departmentCode}` : user.email,
      revisionNumber: nextRevision, lockVersion: existing.lockVersion + 1,
      submittedAt: submit ? now : existing.submittedAt, updatedAt: now,
    }).where(eq(expenseRequests.id, existing.id)).returning();
    await db.update(files).set({ requestId: existing.id }).where(and(eq(files.draftKey, draftKey), eq(files.status, "READY"), eq(files.uploadedByEmail, user.email)));
    await db.insert(requestRevisions).values({ id: crypto.randomUUID(), requestId: existing.id, revisionNumber: nextRevision, snapshotJson: snapshot, reason: submit ? "استكمال المسودة وإرسالها" : "تحديث المسودة", changedByEmail: user.email });
    const updateActionId = crypto.randomUUID();
    await db.insert(requestActions).values({ id: updateActionId, requestId: existing.id, action: submit ? "SUBMIT" : "UPDATE_DRAFT", fromStatus: "DRAFT", toStatus: status, actorEmail: user.email, actorName: createdByName, idempotencyKey: `update:${draftKey}:${nextRevision}` });
    if (submit) {
      const department = departmentCode;
      await db.insert(workItems).values({ id: crypto.randomUUID(), requestId: existing.id, taskType: "DEPARTMENT_APPROVAL", assignedDepartmentCode: department, assignedRole: "DEPARTMENT_MANAGER", status: "OPEN", dueAt: new Date(now.getTime() + 24 * 60 * 60 * 1000) });
      await db.insert(notifications).values({ id: crypto.randomUUID(), recipientEmail: `department.${department.toLowerCase()}@tito.local`, title: "طلب صرف جديد ينتظر الاعتماد", body: `${existing.requestNumber} · ${payload.beneficiaryName}`, entityType: "REQUEST", entityId: existing.id, actionUrl: `/requests/${existing.id}`, dedupeKey: `${updateActionId}:DEPARTMENT_APPROVAL`, sentByEmail: user.email });
    }
    if (submit && (payload.isRecurring || payload.recurring) && !existing.monthlyObligationId) {
      const obligationId = crypto.randomUUID();
      const dueDate = payload.nextDueDate ? new Date(payload.nextDueDate) : nextMonthlyDate(payload.dueDay);
      await db.insert(monthlyObligations).values({ id: obligationId, title: payload.purpose?.trim() || payload.expenseType || "التزام شهري", obligationType: payload.obligationType || payload.expenseType || "OTHER", providerName: payload.beneficiaryName || existing.beneficiaryName, accountReference: payload.accountReference || null, paymentMethod: payload.paymentMethod || existing.paymentMethod, expectedAmountMinor: payload.amountMinor || existing.amountMinor, dueDay: payload.dueDay || 28, reminderDaysBefore: payload.reminderDaysBefore ?? 3, nextDueDate: dueDate, responsibleEmail: user.email, departmentCode, createdByEmail: user.email });
      await db.update(expenseRequests).set({ monthlyObligationId: obligationId }).where(eq(expenseRequests.id, existing.id));
    }
    const updateCorrelationId = crypto.randomUUID();
    const updateEventHash = await sha256(`${updateCorrelationId}|${user.email}|UPDATE_REQUEST|${existing.id}|${snapshot}|${now.toISOString()}`);
    await db.insert(auditEvents).values({ id: crypto.randomUUID(), actorEmail: user.email, action: submit ? "SUBMIT_DRAFT" : "UPDATE_DRAFT", entityType: "REQUEST", entityId: existing.id, beforeJson: JSON.stringify(existing), afterJson: snapshot, correlationId: updateCorrelationId, eventHash: updateEventHash });
    return Response.json({ request: { id: existing.id, requestNumber: existing.requestNumber, status: updated.status, currentStage: updated.currentStage, currentResponsible: responsibility(updated.currentStage, updated.departmentCode) } });
  }

  await db.insert(expenseRequests).values({
    id, requestNumber: number, draftKey, createdByEmail: user.email, createdByName,
    departmentCode, branchCode,
    categoryCode, expenseType: payload.expenseType || "أخرى", settlementGroup: settlementGroupFor(categoryCode),
    paymentMethod: payload.paymentMethod || "BANK", beneficiaryName: payload.beneficiaryName || "غير محدد",
    beneficiaryType: payload.beneficiaryType || "OTHER", bankName: payload.bankName || null,
    iban: payload.iban?.replace(/\s/g, "").toUpperCase() || null,
    accountHolderName: payload.accountHolderName?.trim() || null, accountNameMatch: payload.accountNameMatch || null,
    accountMismatchReason: payload.accountNameMatch === "MISMATCHED" ? payload.accountMismatchReason?.trim() || null : null,
    cashRecipient: payload.paymentMethod === "CASH" ? payload.beneficiaryName || "غير محدد" : null,
    governmentBiller: null, totalDueMinor: payload.totalDueMinor ?? null, paidPreviouslyMinor: payload.paidPreviouslyMinor ?? null, amountMinor: payload.amountMinor || 0,
    purpose: payload.purpose?.trim() || "مسودة طلب صرف", details: payload.details?.trim() || "لم يكتمل البيان بعد",
    priority: "NORMAL", status, currentStage: stage,
    currentAssignee: submit ? `role:DEPARTMENT_MANAGER:${departmentCode}` : user.email,
    submittedAt: submit ? now : null,
  });

  await db.update(files).set({ requestId: id }).where(and(eq(files.draftKey, draftKey), eq(files.status, "READY"), eq(files.uploadedByEmail, user.email)));
  await db.insert(requestRevisions).values({ id: crypto.randomUUID(), requestId: id, revisionNumber: 1, snapshotJson: snapshot, changedByEmail: user.email });
  const actionId = crypto.randomUUID();
  await db.insert(requestActions).values({ id: actionId, requestId: id, action: submit ? "SUBMIT" : "SAVE_DRAFT", fromStatus: null, toStatus: status, actorEmail: user.email, actorName: createdByName, idempotencyKey: `create:${draftKey}` });

  if (submit) {
    const department = departmentCode;
    await db.insert(workItems).values({ id: crypto.randomUUID(), requestId: id, taskType: "DEPARTMENT_APPROVAL", assignedDepartmentCode: department, assignedRole: "DEPARTMENT_MANAGER", status: "OPEN", dueAt: new Date(now.getTime() + 24 * 60 * 60 * 1000) });
    await db.insert(notifications).values({ id: crypto.randomUUID(), recipientEmail: `department.${department.toLowerCase()}@tito.local`, title: "طلب صرف جديد ينتظر الاعتماد", body: `${number} · ${payload.beneficiaryName}`, entityType: "REQUEST", entityId: id, actionUrl: `/requests/${id}`, dedupeKey: `${actionId}:DEPARTMENT_APPROVAL`, sentByEmail: user.email });
  }

  if (submit && (payload.isRecurring || payload.recurring)) {
    const obligationId = crypto.randomUUID();
    const dueDate = payload.nextDueDate ? new Date(payload.nextDueDate) : nextMonthlyDate(payload.dueDay);
    await db.insert(monthlyObligations).values({ id: obligationId, title: payload.purpose?.trim() || payload.expenseType || "التزام شهري", obligationType: payload.obligationType || payload.expenseType || "OTHER", providerName: payload.beneficiaryName || "غير محدد", accountReference: payload.accountReference || null, paymentMethod: payload.paymentMethod || "BANK", expectedAmountMinor: payload.amountMinor || null, dueDay: payload.dueDay || 28, reminderDaysBefore: payload.reminderDaysBefore ?? 3, nextDueDate: dueDate, responsibleEmail: user.email, departmentCode, createdByEmail: user.email });
    await db.update(expenseRequests).set({ monthlyObligationId: obligationId }).where(eq(expenseRequests.id, id));
  }

  const correlationId = crypto.randomUUID();
  const eventHash = await sha256(`${correlationId}|${user.email}|CREATE_REQUEST|${id}|${snapshot}|${now.toISOString()}`);
  await db.insert(auditEvents).values({ id: crypto.randomUUID(), actorEmail: user.email, action: submit ? "CREATE_AND_SUBMIT_REQUEST" : "CREATE_DRAFT", entityType: "REQUEST", entityId: id, afterJson: snapshot, correlationId, eventHash });
  return Response.json({ request: { id, requestNumber: number, status, currentStage: stage, currentResponsible: responsibility(stage, departmentCode) } }, { status: 201 });
}
