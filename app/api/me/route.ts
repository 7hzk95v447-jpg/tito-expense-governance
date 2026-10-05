import { eq, or } from "drizzle-orm";
import { getDb } from "../../../db";
import { auditEvents, users } from "../../../db/schema";
import { authenticationRequired, getResolvedRequestUser } from "../../../lib/request-user";
import { sha256 } from "../../../lib/workflow";

// Sanitized placeholder for the handover package.
const ADMIN_EMAIL = "admin@example.invalid";

export async function GET(request: Request) {
  const identity = await getResolvedRequestUser(request);
  if (!identity) return authenticationRequired();
  const db = getDb();
  let [profile] = await db.select().from(users).where(or(eq(users.email, identity.email), eq(users.authIdentityEmail, identity.email))).limit(1);

  // getResolvedRequestUser only returns this ADMIN marker after comparing the
  // authenticated hosting identity with the approved SHA-256 fingerprint.
  // The private hosting email and any password are deliberately not persisted.
  if (identity.systemRole === "ADMIN" && identity.email === ADMIN_EMAIL) {
    if (!profile) {
      await db.insert(users).values({
        id: crypto.randomUUID(),
        fullName: identity.displayName,
        username: ADMIN_EMAIL,
        email: ADMIN_EMAIL,
        authIdentityEmail: null,
        jobTitle: "مدير النظام",
        systemRole: "ADMIN",
        status: "ACTIVE",
        mustChangePassword: false,
        lastLoginAt: new Date(),
      }).onConflictDoNothing();
      [profile] = await db.select().from(users).where(eq(users.email, ADMIN_EMAIL)).limit(1);
    } else if (profile.systemRole !== "ADMIN" || profile.mustChangePassword) {
      const [updated] = await db.update(users).set({ systemRole: "ADMIN", mustChangePassword: false, lastLoginAt: new Date() }).where(eq(users.id, profile.id)).returning();
      profile = updated;
    }
  }

  if (!profile) return Response.json({ error: "الحساب غير مرتبط بمستخدم في TITO" }, { status: 403, headers: { "Cache-Control": "no-store" } });
  if (profile.status !== "ACTIVE") return Response.json({ error: "الحساب موقوف؛ راجع مدير النظام" }, { status: 403, headers: { "Cache-Control": "no-store" } });

  // First verified platform sign-in completes the account link. TITO never
  // receives or stores the user's platform password.
  if (identity.authMode === "HOST_IDENTITY" && identity.systemRole !== "ADMIN" && (!profile.authIdentityEmail || profile.mustChangePassword)) {
    const [linked] = await db.update(users).set({ authIdentityEmail: identity.email, mustChangePassword: false }).where(eq(users.id, profile.id)).returning();
    if (linked) profile = linked;
  }

  const now = new Date();
  await db.update(users).set({ lastLoginAt: now }).where(eq(users.id, profile.id));
  const correlationId = crypto.randomUUID();
  const afterJson = JSON.stringify({ userId: profile.id, role: profile.systemRole, loginAt: now.toISOString(), authMode: identity.authMode });
  const eventHash = await sha256(`${correlationId}|${identity.email}|LOGIN|${profile.id}|${afterJson}`);
  await db.insert(auditEvents).values({ id: crypto.randomUUID(), actorEmail: identity.email, action: "LOGIN", entityType: "USER", entityId: profile.id, afterJson, correlationId, eventHash });

  return Response.json({
    user: {
      id: profile.id,
      fullName: profile.fullName,
      username: profile.username,
      email: profile.email,
      mobile: profile.mobile,
      departmentId: profile.departmentId,
      branchId: profile.branchId,
      jobTitle: profile.jobTitle,
      systemRole: profile.systemRole,
      status: profile.status,
      mustChangePassword: profile.mustChangePassword,
      lastLoginAt: now,
    },
    authMode: identity.authMode,
  }, { headers: { "Cache-Control": "no-store" } });
}
