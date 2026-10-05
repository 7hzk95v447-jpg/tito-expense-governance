import { getTeamSession } from "./team-auth";

export type ResolvedRequestUser = {
  email: string;
  displayName: string;
  systemRole: "ADMIN" | null;
  authMode: "TEAM_PASSWORD" | "HOST_IDENTITY";
};

export function getRequestUser(request: Request) {
  const email = request.headers.get("oai-authenticated-user-email")?.trim().toLowerCase();
  if (!email) return null;
  const encodedName = request.headers.get("oai-authenticated-user-full-name");
  const encoding = request.headers.get("oai-authenticated-user-full-name-encoding");
  let fullName: string | null = null;
  if (encodedName && encoding === "percent-encoded-utf-8") {
    try { fullName = decodeURIComponent(encodedName); } catch { fullName = null; }
  }
  return { email, displayName: fullName || email };
}

// Sanitized in the handover package. Replace this placeholder with the
// SHA-256 fingerprint of the approved hosting identity before deployment.
const BOOTSTRAP_ADMIN_IDENTITY_HASH = "REPLACE_WITH_SHA256_OF_APPROVED_OWNER_EMAIL";

async function hashIdentity(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

/** Maps the authenticated hosting identity to the TITO admin profile without persisting it. */
export async function getResolvedRequestUser(request: Request): Promise<ResolvedRequestUser | null> {
  const teamSession = await getTeamSession(request);
  if (teamSession) {
    if (teamSession.user.mustChangePassword) return null;
    return {
      email: teamSession.user.email,
      displayName: teamSession.user.fullName,
      systemRole: teamSession.user.systemRole === "ADMIN" ? "ADMIN" : null,
      authMode: "TEAM_PASSWORD",
    };
  }
  return null; // Standalone Cloudflare: never trust caller-supplied hosting headers.
}

export function authenticationRequired() {
  return Response.json(
    { error: "يلزم تسجيل الدخول الآمن للمتابعة" },
    { status: 401, headers: { "Cache-Control": "no-store" } },
  );
}
