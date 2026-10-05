import { eq, or } from "drizzle-orm";
import { getDb } from "../../../../db";
import { auditEvents, users } from "../../../../db/schema";
import { createTeamSession, teamSessionCookie, verifyPassword } from "../../../../lib/team-auth";
import { sha256 } from "../../../../lib/workflow";

const MAX_FAILED_ATTEMPTS = 5;
const LOCK_MINUTES = 15;

export async function POST(request: Request) {
  const payload = (await request.json().catch(() => null)) as { username?: string; password?: string } | null;
  const username = payload?.username?.trim().toLowerCase();
  const password = payload?.password || "";
  if (!username || !password) return Response.json({ error: "أدخل اسم المستخدم وكلمة المرور" }, { status: 400 });

  const db = getDb();
  const [user] = await db.select().from(users).where(or(eq(users.username, username), eq(users.email, username))).limit(1);
  const now = new Date();
  if (!user || user.status !== "ACTIVE") return Response.json({ error: "بيانات الدخول غير صحيحة" }, { status: 401, headers: { "Cache-Control": "no-store" } });
  if (user.lockedUntil && user.lockedUntil > now) {
    return Response.json({ error: "تم إيقاف المحاولات مؤقتًا؛ حاول بعد 15 دقيقة أو راجع مدير النظام" }, { status: 429, headers: { "Cache-Control": "no-store" } });
  }
  if (!user.passwordHash) {
    return Response.json({ error: "لم تُصدر لهذا الحساب كلمة مرور مؤقتة بعد؛ راجع مدير النظام" }, { status: 403, headers: { "Cache-Control": "no-store" } });
  }

  const valid = await verifyPassword(password, user.passwordHash);
  if (!valid) {
    const failedLoginCount = user.failedLoginCount + 1;
    const lockedUntil = failedLoginCount >= MAX_FAILED_ATTEMPTS ? new Date(now.getTime() + LOCK_MINUTES * 60_000) : null;
    await db.update(users).set({ failedLoginCount, lockedUntil }).where(eq(users.id, user.id));
    return Response.json({ error: "بيانات الدخول غير صحيحة" }, { status: 401, headers: { "Cache-Control": "no-store" } });
  }

  await db.update(users).set({ failedLoginCount: 0, lockedUntil: null, lastLoginAt: now }).where(eq(users.id, user.id));
  const session = await createTeamSession(user.id);
  const correlationId = crypto.randomUUID();
  const afterJson = JSON.stringify({ userId: user.id, role: user.systemRole, loginAt: now.toISOString(), authMode: "TEAM_PASSWORD" });
  const eventHash = await sha256(`${correlationId}|${user.email}|LOGIN|${user.id}|${afterJson}`);
  await db.insert(auditEvents).values({ id: crypto.randomUUID(), actorEmail: user.email, action: "LOGIN", entityType: "USER", entityId: user.id, afterJson, correlationId, eventHash });

  return Response.json({ ok: true, mustChangePassword: user.mustChangePassword }, {
    headers: { "Cache-Control": "no-store", "Set-Cookie": teamSessionCookie(session.token) },
  });
}
