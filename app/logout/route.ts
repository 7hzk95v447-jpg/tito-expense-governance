import { eq, or } from "drizzle-orm";
import { getDb } from "../../db";
import { auditEvents, users } from "../../db/schema";
import { getResolvedRequestUser } from "../../lib/request-user";
import { clearTeamSessionCookie, getTeamSession, revokeTeamSession } from "../../lib/team-auth";
import { sha256 } from "../../lib/workflow";

export async function GET(request: Request) {
  const teamSession = await getTeamSession(request);
  if (teamSession) {
    await revokeTeamSession(request);
    const db = getDb();
    const correlationId = crypto.randomUUID();
    const now = new Date();
    const afterJson = JSON.stringify({ userId: teamSession.user.id, logoutAt: now.toISOString(), authMode: "TEAM_PASSWORD" });
    const eventHash = await sha256(`${correlationId}|${teamSession.user.email}|LOGOUT|${teamSession.user.id}|${afterJson}`);
    await db.insert(auditEvents).values({ id: crypto.randomUUID(), actorEmail: teamSession.user.email, action: "LOGOUT", entityType: "USER", entityId: teamSession.user.id, afterJson, correlationId, eventHash });
    return new Response(null, { status: 302, headers: { Location: "/login", "Set-Cookie": clearTeamSessionCookie(), "Cache-Control": "no-store" } });
  }
  const actor = await getResolvedRequestUser(request);
  if (actor) {
    const db = getDb();
    const [profile] = await db.select().from(users).where(or(eq(users.email, actor.email), eq(users.authIdentityEmail, actor.email))).limit(1);
    if (profile) {
      const correlationId = crypto.randomUUID();
      const now = new Date();
      const afterJson = JSON.stringify({ userId: profile.id, logoutAt: now.toISOString(), authMode: "HOST_IDENTITY" });
      const eventHash = await sha256(`${correlationId}|${actor.email}|LOGOUT|${profile.id}|${afterJson}`);
      await db.insert(auditEvents).values({ id: crypto.randomUUID(), actorEmail: actor.email, action: "LOGOUT", entityType: "USER", entityId: profile.id, afterJson, correlationId, eventHash });
    }
  }
  return new Response(null, { status: 302, headers: { Location: "/login", "Cache-Control": "no-store" } });
}
