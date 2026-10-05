import { desc, eq, or } from "drizzle-orm";
import { getDb } from "../../../db";
import {
  auditEvents,
  backupJobs,
  executionAttempts,
  expenseRequests,
  files,
  paymentRunActions,
  paymentRuns,
  requestActions,
  requestRevisions,
  userSessions,
  users,
} from "../../../db/schema";
import {
  authenticationRequired,
  getResolvedRequestUser,
} from "../../../lib/request-user";
import {
  generateTemporaryPassword,
  hashPassword,
} from "../../../lib/team-auth";
import { sha256 } from "../../../lib/workflow";

const allowedRoles = new Set([
  "REQUESTER",
  "DEPARTMENT_MANAGER",
  "ACCOUNTING",
  "BATCH_APPROVER",
  "EXECUTOR",
  "CASHIER",
  "EXECUTIVE",
  "ADMIN",
]);

async function recordAudit(
  actorEmail: string,
  action: string,
  entityId: string,
  before: unknown,
  after: unknown,
  reason?: string,
) {
  const db = getDb();
  const correlationId = crypto.randomUUID();
  const beforeJson = before == null ? null : JSON.stringify(before);
  const afterJson = after == null ? null : JSON.stringify(after);
  const eventHash = await sha256(
    `${correlationId}|${actorEmail}|${action}|${entityId}|${beforeJson || ""}|${afterJson || ""}`,
  );
  await db.insert(auditEvents).values({
    id: crypto.randomUUID(),
    actorEmail,
    action,
    entityType: "USER",
    entityId,
    beforeJson,
    afterJson,
    reason: reason || null,
    correlationId,
    eventHash,
  });
}

async function requireAdmin(request: Request) {
  const actor = await getResolvedRequestUser(request);
  if (!actor) return null;
  const db = getDb();
  const [profile] = await db
    .select()
    .from(users)
    .where(
      or(
        eq(users.email, actor.email),
        eq(users.authIdentityEmail, actor.email),
      ),
    )
    .limit(1);
  if (profile?.status !== "ACTIVE" || profile.systemRole !== "ADMIN")
    return null;
  return actor;
}

export async function GET(request: Request) {
  if (!(await getResolvedRequestUser(request))) return authenticationRequired();
  if (!(await requireAdmin(request)))
    return Response.json({ error: "غير مصرح" }, { status: 403 });
  const db = getDb();
  return Response.json({
    users: await db
      .select({
        id: users.id,
        fullName: users.fullName,
        username: users.username,
        email: users.email,
        mobile: users.mobile,
        departmentId: users.departmentId,
        branchId: users.branchId,
        jobTitle: users.jobTitle,
        systemRole: users.systemRole,
        status: users.status,
        mustChangePassword: users.mustChangePassword,
        lastLoginAt: users.lastLoginAt,
        createdAt: users.createdAt,
      })
      .from(users)
      .orderBy(desc(users.createdAt))
      .limit(250),
  });
}

export async function POST(request: Request) {
  const actor = await getResolvedRequestUser(request);
  if (!actor) return authenticationRequired();
  if (!(await requireAdmin(request)))
    return Response.json({ error: "غير مصرح" }, { status: 403 });
  const payload = (await request.json()) as {
    fullName?: string;
    username?: string;
    email?: string;
    mobile?: string;
    departmentId?: string;
    branchId?: string;
    jobTitle?: string;
    systemRole?: string;
    temporaryPassword?: string;
  };
  const requestedEmail = payload.email?.trim().toLowerCase();
  const username = payload.username?.trim().toLowerCase();
  if (!payload.fullName?.trim() || !username)
    return Response.json(
      { error: "الاسم واسم المستخدم مطلوبان" },
      { status: 400 },
    );
  if (requestedEmail && !/^\S+@\S+\.\S+$/.test(requestedEmail))
    return Response.json(
      { error: "صيغة البريد الإلكتروني غير صحيحة" },
      { status: 400 },
    );
  if (!payload.temporaryPassword)
    return Response.json(
      { error: "كلمة المرور المؤقتة مطلوبة" },
      { status: 400 },
    );
  if (payload.systemRole && !allowedRoles.has(payload.systemRole))
    return Response.json({ error: "الدور الوظيفي غير مدعوم" }, { status: 400 });
  const db = getDb();
  const email =
    requestedEmail ||
    `tito-${(await sha256(username)).slice(0, 16)}@tito.local`;
  const [existingUsername] = await db
    .select()
    .from(users)
    .where(eq(users.username, username))
    .limit(1);
  const [existingEmail] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, email))
    .limit(1);
  if (existingEmail && existingEmail.id !== existingUsername?.id)
    return Response.json(
      { error: "البريد الإلكتروني مستخدم في حساب آخر" },
      { status: 409 },
    );
  const id = existingUsername?.id || crypto.randomUUID();
  const temporaryPassword = payload.temporaryPassword;
  try {
    const values = {
      id,
      fullName: payload.fullName.trim(),
      username,
      email,
      mobile: payload.mobile?.trim() || null,
      departmentId: payload.departmentId || null,
      branchId: payload.branchId || null,
      jobTitle: payload.jobTitle?.trim() || null,
      systemRole: payload.systemRole || "REQUESTER",
      status: "ACTIVE",
      passwordHash: await hashPassword(temporaryPassword),
      mustChangePassword: true,
      failedLoginCount: 0,
      lockedUntil: null,
    } as const;
    if (existingUsername) {
      await db
        .update(users)
        .set(values)
        .where(eq(users.id, existingUsername.id));
      await db
        .update(userSessions)
        .set({ revokedAt: new Date() })
        .where(eq(userSessions.userId, existingUsername.id));
      await recordAudit(
        actor.email,
        "UPDATE_USER_CREDENTIALS",
        id,
        { username: existingUsername.username, email: existingUsername.email },
        {
          id,
          fullName: values.fullName,
          username,
          email,
          systemRole: values.systemRole,
          authMode: "TEAM_PASSWORD",
        },
      );
    } else {
      await db.insert(users).values(values);
      await recordAudit(actor.email, "CREATE_USER", id, null, {
        id,
        fullName: values.fullName,
        username,
        email,
        systemRole: values.systemRole,
        authMode: "TEAM_PASSWORD",
      });
    }
    return Response.json(
      {
        user: {
          id,
          fullName: values.fullName,
          username,
          email,
          status: "ACTIVE",
          mustChangePassword: true,
        },
        temporaryPassword,
        created: !existingUsername,
      },
      { status: existingUsername ? 200 : 201 },
    );
  } catch {
    return Response.json(
      { error: "تعذر حفظ المستخدم. تحقق من البيانات ثم أعد المحاولة" },
      { status: 500 },
    );
  }
}

export async function PATCH(request: Request) {
  const actor = await getResolvedRequestUser(request);
  if (!actor) return authenticationRequired();
  if (!(await requireAdmin(request)))
    return Response.json({ error: "غير مصرح" }, { status: 403 });
  const payload = (await request.json()) as {
    id?: string;
    status?: "ACTIVE" | "SUSPENDED";
    action?: "RESET_PASSWORD";
  };
  if (!payload.id)
    return Response.json({ error: "المستخدم مطلوب" }, { status: 400 });
  const db = getDb();
  const [target] = await db
    .select()
    .from(users)
    .where(eq(users.id, payload.id))
    .limit(1);
  if (!target)
    return Response.json({ error: "المستخدم غير موجود" }, { status: 404 });
  if (payload.action === "RESET_PASSWORD") {
    const temporaryPassword = generateTemporaryPassword();
    await db
      .update(users)
      .set({
        passwordHash: await hashPassword(temporaryPassword),
        mustChangePassword: true,
        failedLoginCount: 0,
        lockedUntil: null,
      })
      .where(eq(users.id, payload.id));
    await db
      .update(userSessions)
      .set({ revokedAt: new Date() })
      .where(eq(userSessions.userId, payload.id));
    await recordAudit(
      actor.email,
      "RESET_USER_PASSWORD",
      payload.id,
      { mustChangePassword: target.mustChangePassword },
      { mustChangePassword: true },
    );
    return Response.json({ updated: true, temporaryPassword });
  }
  if (!payload.status)
    return Response.json({ error: "الحالة مطلوبة" }, { status: 400 });
  if (target.email === actor.email && payload.status === "SUSPENDED")
    return Response.json(
      { error: "لا يمكن لمدير النظام إيقاف حسابه الحالي" },
      { status: 409 },
    );
  await db
    .update(users)
    .set({ status: payload.status })
    .where(eq(users.id, payload.id));
  await recordAudit(
    actor.email,
    "UPDATE_USER_STATUS",
    payload.id,
    { status: target.status },
    { status: payload.status },
  );
  return Response.json({ updated: true });
}

export async function DELETE(request: Request) {
  const actor = await getResolvedRequestUser(request);
  if (!actor) return authenticationRequired();
  if (!(await requireAdmin(request)))
    return Response.json({ error: "غير مصرح" }, { status: 403 });
  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  if (!id)
    return Response.json({ error: "معرف المستخدم مطلوب" }, { status: 400 });
  const db = getDb();
  const [target] = await db
    .select()
    .from(users)
    .where(eq(users.id, id))
    .limit(1);
  if (!target)
    return Response.json({ error: "المستخدم غير موجود" }, { status: 404 });
  if (target.email === actor.email)
    return Response.json(
      { error: "لا يمكن حذف حساب مدير النظام المستخدم حاليًا" },
      { status: 409 },
    );
  const [
    requestLink,
    actionLink,
    runLink,
    runActionLink,
    fileLink,
    executionLink,
    revisionLink,
    backupLink,
    auditLink,
  ] = await Promise.all([
    db
      .select({ id: expenseRequests.id })
      .from(expenseRequests)
      .where(eq(expenseRequests.createdByEmail, target.email))
      .limit(1),
    db
      .select({ id: requestActions.id })
      .from(requestActions)
      .where(eq(requestActions.actorEmail, target.email))
      .limit(1),
    db
      .select({ id: paymentRuns.id })
      .from(paymentRuns)
      .where(
        or(
          eq(paymentRuns.preparedByEmail, target.email),
          eq(paymentRuns.approvedByEmail, target.email),
        ),
      )
      .limit(1),
    db
      .select({ id: paymentRunActions.id })
      .from(paymentRunActions)
      .where(eq(paymentRunActions.actorEmail, target.email))
      .limit(1),
    db
      .select({ id: files.id })
      .from(files)
      .where(eq(files.uploadedByEmail, target.email))
      .limit(1),
    db
      .select({ id: executionAttempts.id })
      .from(executionAttempts)
      .where(eq(executionAttempts.executedByEmail, target.email))
      .limit(1),
    db
      .select({ id: requestRevisions.id })
      .from(requestRevisions)
      .where(eq(requestRevisions.changedByEmail, target.email))
      .limit(1),
    db
      .select({ id: backupJobs.id })
      .from(backupJobs)
      .where(eq(backupJobs.requestedByEmail, target.email))
      .limit(1),
    db
      .select({ id: auditEvents.id })
      .from(auditEvents)
      .where(eq(auditEvents.actorEmail, target.email))
      .limit(1),
  ]);
  if (
    [
      requestLink,
      actionLink,
      runLink,
      runActionLink,
      fileLink,
      executionLink,
      revisionLink,
      backupLink,
      auditLink,
    ].some((rows) => rows.length)
  ) {
    await db.update(users).set({ status: "SUSPENDED" }).where(eq(users.id, id));
    await recordAudit(
      actor.email,
      "SUSPEND_LINKED_USER",
      id,
      { status: target.status },
      { status: "SUSPENDED" },
      "المستخدم مرتبط بسجل تشغيلي محفوظ",
    );
    return Response.json({
      deleted: false,
      suspended: true,
      message: "المستخدم مرتبط بعمليات؛ تم إيقافه مع حفظ سجله",
    });
  }
  await recordAudit(
    actor.email,
    "DELETE_UNUSED_USER",
    id,
    target,
    null,
    "المستخدم غير مرتبط بأي عملية",
  );
  await db.delete(users).where(eq(users.id, id));
  return Response.json({ deleted: true });
}
