import { and, eq, ne } from "drizzle-orm";
import { getDb } from "../../../../db";
import { auditEvents, userSessions, users } from "../../../../db/schema";
import {
  getTeamSession,
  hashPassword,
  verifyPassword,
} from "../../../../lib/team-auth";
import { sha256 } from "../../../../lib/workflow";

export async function POST(request: Request) {
  const resolved = await getTeamSession(request);
  if (!resolved)
    return Response.json(
      { error: "انتهت جلسة الدخول؛ سجّل الدخول من جديد" },
      { status: 401 },
    );
  const payload = (await request.json().catch(() => null)) as {
    currentPassword?: string;
    newPassword?: string;
    confirmPassword?: string;
  } | null;
  const currentPassword = payload?.currentPassword || "";
  const newPassword = payload?.newPassword || "";
  if (
    !currentPassword ||
    !newPassword ||
    newPassword !== payload?.confirmPassword
  )
    return Response.json(
      { error: "تحقق من كلمة المرور الحالية وتطابق كلمة المرور الجديدة" },
      { status: 400 },
    );
  if (
    !resolved.user.passwordHash ||
    !(await verifyPassword(currentPassword, resolved.user.passwordHash))
  )
    return Response.json(
      { error: "كلمة المرور الحالية غير صحيحة" },
      { status: 401 },
    );
  if (await verifyPassword(newPassword, resolved.user.passwordHash))
    return Response.json(
      { error: "اختر كلمة مرور جديدة مختلفة عن المؤقتة" },
      { status: 400 },
    );

  const db = getDb();
  const now = new Date();
  await db
    .update(users)
    .set({
      passwordHash: await hashPassword(newPassword),
      mustChangePassword: false,
      failedLoginCount: 0,
      lockedUntil: null,
    })
    .where(eq(users.id, resolved.user.id));
  await db
    .update(userSessions)
    .set({ revokedAt: now })
    .where(
      and(
        eq(userSessions.userId, resolved.user.id),
        ne(userSessions.id, resolved.session.id),
      ),
    );
  const correlationId = crypto.randomUUID();
  const afterJson = JSON.stringify({
    userId: resolved.user.id,
    changedAt: now.toISOString(),
    forcedChangeCompleted: true,
  });
  const eventHash = await sha256(
    `${correlationId}|${resolved.user.email}|CHANGE_PASSWORD|${resolved.user.id}|${afterJson}`,
  );
  await db
    .insert(auditEvents)
    .values({
      id: crypto.randomUUID(),
      actorEmail: resolved.user.email,
      action: "CHANGE_PASSWORD",
      entityType: "USER",
      entityId: resolved.user.id,
      afterJson,
      correlationId,
      eventHash,
    });
  return Response.json(
    { ok: true },
    { headers: { "Cache-Control": "no-store" } },
  );
}
