import { and, eq, gt, isNull } from "drizzle-orm";
import { getDb } from "../db";
import { userSessions, users } from "../db/schema";

export const TEAM_SESSION_COOKIE = "tito_session";
export const TEAM_SESSION_MAX_AGE_SECONDS = 12 * 60 * 60;
// Cloudflare Workers caps PBKDF2 at 100,000 iterations.
const PASSWORD_ITERATIONS = 100_000;
const encoder = new TextEncoder();

function toBase64Url(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function fromBase64Url(value: string) {
  const padded =
    value.replace(/-/g, "+").replace(/_/g, "/") +
    "===".slice((value.length + 3) % 4);
  const binary = atob(padded);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function randomBytes(length: number) {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return bytes;
}

export async function sha256Hex(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(value));
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

export async function hashPassword(password: string) {
  const salt = randomBytes(16);
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt, iterations: PASSWORD_ITERATIONS },
    key,
    256,
  );
  return `pbkdf2-sha256$${PASSWORD_ITERATIONS}$${toBase64Url(salt)}$${toBase64Url(new Uint8Array(bits))}`;
}

export async function verifyPassword(password: string, encodedHash: string) {
  const [scheme, iterationsText, saltText, expectedText] =
    encodedHash.split("$");
  const iterations = Number(iterationsText);
  if (
    scheme !== "pbkdf2-sha256" ||
    !Number.isSafeInteger(iterations) ||
    iterations < 100_000 ||
    !saltText ||
    !expectedText
  )
    return false;
  try {
    const salt = fromBase64Url(saltText);
    const expected = fromBase64Url(expectedText);
    const key = await crypto.subtle.importKey(
      "raw",
      encoder.encode(password),
      "PBKDF2",
      false,
      ["deriveBits"],
    );
    const bits = await crypto.subtle.deriveBits(
      { name: "PBKDF2", hash: "SHA-256", salt, iterations },
      key,
      expected.byteLength * 8,
    );
    const actual = new Uint8Array(bits);
    if (actual.length !== expected.length) return false;
    let difference = 0;
    for (let index = 0; index < actual.length; index += 1)
      difference |= actual[index] ^ expected[index];
    return difference === 0;
  } catch {
    return false;
  }
}

export function generateTemporaryPassword() {
  const alphabet =
    "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%";
  const bytes = randomBytes(14);
  return Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join("");
}

function readCookie(cookieHeader: string | null, name: string) {
  if (!cookieHeader) return null;
  for (const part of cookieHeader.split(";")) {
    const separator = part.indexOf("=");
    if (separator < 0) continue;
    if (part.slice(0, separator).trim() !== name) continue;
    try {
      return decodeURIComponent(part.slice(separator + 1).trim());
    } catch {
      return null;
    }
  }
  return null;
}

export function teamSessionCookie(token: string) {
  return `${TEAM_SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/; Max-Age=${TEAM_SESSION_MAX_AGE_SECONDS}; HttpOnly; Secure; SameSite=Lax`;
}

export function clearTeamSessionCookie() {
  return `${TEAM_SESSION_COOKIE}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax`;
}

export async function createTeamSession(userId: string) {
  const token = toBase64Url(randomBytes(32));
  const now = new Date();
  const expiresAt = new Date(
    now.getTime() + TEAM_SESSION_MAX_AGE_SECONDS * 1000,
  );
  await getDb()
    .insert(userSessions)
    .values({
      id: crypto.randomUUID(),
      userId,
      tokenHash: await sha256Hex(token),
      expiresAt,
      lastSeenAt: now,
    });
  return { token, expiresAt };
}

export async function getTeamSessionFromCookieHeader(
  cookieHeader: string | null,
) {
  const token = readCookie(cookieHeader, TEAM_SESSION_COOKIE);
  if (!token) return null;
  const db = getDb();
  const tokenHash = await sha256Hex(token);
  const [session] = await db
    .select()
    .from(userSessions)
    .where(
      and(
        eq(userSessions.tokenHash, tokenHash),
        isNull(userSessions.revokedAt),
        gt(userSessions.expiresAt, new Date()),
      ),
    )
    .limit(1);
  if (!session) return null;
  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.id, session.userId))
    .limit(1);
  if (!user || user.status !== "ACTIVE") return null;
  return { token, session, user };
}

export async function getTeamSession(request: Request) {
  return getTeamSessionFromCookieHeader(request.headers.get("cookie"));
}

export async function revokeTeamSession(request: Request) {
  const resolved = await getTeamSession(request);
  if (!resolved) return null;
  await getDb()
    .update(userSessions)
    .set({ revokedAt: new Date() })
    .where(eq(userSessions.id, resolved.session.id));
  return resolved;
}
