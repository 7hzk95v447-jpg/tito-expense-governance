import { desc, eq, inArray, or } from "drizzle-orm";
import { getDb } from "../../../db";
import { departments, monthlyObligations, notificationReads, notifications, users } from "../../../db/schema";
import { createDueReminders } from "../../../lib/monthly-reminders";
import { authenticationRequired, getResolvedRequestUser } from "../../../lib/request-user";

const notificationRoles: Record<string, string[]> = {
  ACCOUNTING: ["ACCOUNTING_REVIEWER", "BATCH_PREPARER", "EXECUTOR"],
  BATCH_APPROVER: ["BATCH_APPROVER"],
  EXECUTOR: ["EXECUTOR"],
  EXECUTIVE: ["EXECUTIVE", "BATCH_APPROVER"],
  DEPARTMENT_MANAGER: ["DEPARTMENT_MANAGER"],
  REQUESTER: ["REQUESTER"],
  ADMIN: ["ADMIN"],
};

async function activeContext(email: string) {
  const db = getDb();
  const [profile] = await db.select().from(users).where(or(eq(users.email, email), eq(users.authIdentityEmail, email))).limit(1);
  if (profile?.status !== "ACTIVE") return null;
  const aliases = new Set<string>([email, profile.email]);
  if (profile.authIdentityEmail) aliases.add(profile.authIdentityEmail);
  for (const role of notificationRoles[profile.systemRole] || []) aliases.add(`role.${role.toLowerCase()}@tito.local`);
  if (profile.systemRole === "DEPARTMENT_MANAGER" && profile.departmentId) {
    const [department] = await db.select({ code: departments.code }).from(departments).where(eq(departments.id, profile.departmentId)).limit(1);
    const departmentCode = department?.code || profile.departmentId;
    aliases.add(`department.${departmentCode.toLowerCase()}@tito.local`);
  }
  return { profile, aliases: [...aliases], readKey: profile.email.trim().toLowerCase() };
}

async function visibleNotifications(context: NonNullable<Awaited<ReturnType<typeof activeContext>>>) {
  const db = getDb();
  return context.profile.systemRole === "ADMIN"
    ? db.select().from(notifications).orderBy(desc(notifications.createdAt)).limit(100)
    : db.select().from(notifications).where(inArray(notifications.recipientEmail, context.aliases)).orderBy(desc(notifications.createdAt)).limit(50);
}

export async function GET(request: Request) {
  const user = await getResolvedRequestUser(request);
  if (!user) return authenticationRequired();
  const context = await activeContext(user.email);
  if (!context) return Response.json({ error: "الحساب غير مرتبط أو موقوف" }, { status: 403 });
  const db = getDb();
  // The notification endpoint is loaded with every dashboard session. This
  // makes monthly reminders self-healing even if nobody opens the dedicated
  // obligations screen on the due date.
  const obligations = await db.select().from(monthlyObligations).limit(250);
  await createDueReminders(db, obligations, new Date());
  const rows = await visibleNotifications(context);
  const reads = await db.select({ notificationId: notificationReads.notificationId, readAt: notificationReads.readAt })
    .from(notificationReads).where(eq(notificationReads.userEmail, context.readKey));
  const readMap = new Map(reads.map((item) => [item.notificationId, item.readAt]));
  const personalized = rows.map((item) => ({ ...item, isRead: readMap.has(item.id), readAt: readMap.get(item.id) || null }));
  return Response.json({ notifications: personalized, unread: personalized.filter((item) => !item.isRead).length });
}

export async function PATCH(request: Request) {
  const user = await getResolvedRequestUser(request);
  if (!user) return authenticationRequired();
  const context = await activeContext(user.email);
  if (!context) return Response.json({ error: "الحساب غير مرتبط أو موقوف" }, { status: 403 });
  const payload = (await request.json()) as { id?: string; all?: boolean };
  const visible = await visibleNotifications(context);
  const rows = payload.all ? visible : visible.filter((item) => item.id === payload.id);
  if (!payload.all && !payload.id) return Response.json({ error: "معرف التنبيه مطلوب" }, { status: 400 });
  if (!payload.all && !rows.length) return Response.json({ error: "التنبيه غير موجود أو غير مصرح به" }, { status: 404 });
  const db = getDb();
  for (const row of rows) {
    await db.insert(notificationReads).values({ id: crypto.randomUUID(), notificationId: row.id, userEmail: context.readKey })
      .onConflictDoNothing();
  }
  return Response.json({ updated: true, count: rows.length });
}
