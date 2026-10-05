import { env } from "cloudflare:workers";
import { and, desc, eq, or } from "drizzle-orm";
import { getDb } from "../../../db";
import { expenseRequests, files, users } from "../../../db/schema";
import { authenticationRequired, getResolvedRequestUser } from "../../../lib/request-user";

const allowedMimeTypes = new Set([
  "image/jpeg", "image/png", "image/webp", "application/pdf",
  "application/msword", "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
]);

export async function GET(request: Request) {
  const actor = await getResolvedRequestUser(request);
  if (!actor) return authenticationRequired();
  const { searchParams } = new URL(request.url);
  const draftKey = searchParams.get("draftKey");
  if (!draftKey) return Response.json({ error: "draftKey is required" }, { status: 400 });
  const db = getDb();
  const [profile] = await db.select().from(users).where(or(eq(users.email, actor.email), eq(users.authIdentityEmail, actor.email))).limit(1);
  if (profile?.status !== "ACTIVE") return Response.json({ error: "الحساب غير مرتبط أو موقوف" }, { status: 403 });
  const where = profile.systemRole === "ADMIN"
    ? and(eq(files.draftKey, draftKey), eq(files.status, "READY"))
    : and(eq(files.draftKey, draftKey), eq(files.status, "READY"), eq(files.uploadedByEmail, actor.email));
  const rows = await db.select({ id: files.id, originalName: files.originalName, mimeType: files.mimeType, sizeBytes: files.sizeBytes, status: files.status, createdAt: files.createdAt })
    .from(files).where(where).orderBy(desc(files.createdAt));
  return Response.json({ files: rows });
}

export async function POST(request: Request) {
  const user = await getResolvedRequestUser(request);
  if (!user) return authenticationRequired();
  const db = getDb();
  const [profile] = await db.select().from(users).where(or(eq(users.email, user.email), eq(users.authIdentityEmail, user.email))).limit(1);
  if (profile?.status !== "ACTIVE") return Response.json({ error: "الحساب غير مرتبط أو موقوف" }, { status: 403 });
  const form = await request.formData();
  const upload = form.get("file");
  const draftKey = String(form.get("draftKey") || "").trim();
  const purpose = String(form.get("purpose") || "REQUEST_ATTACHMENT").trim();
  if (!(upload instanceof File) || !draftKey) return Response.json({ error: "الملف ومفتاح المسودة مطلوبان" }, { status: 400 });
  if (!allowedMimeTypes.has(upload.type)) return Response.json({ error: "نوع الملف غير مدعوم" }, { status: 415 });
  if (upload.size > 15 * 1024 * 1024) return Response.json({ error: "الحد الأعلى للملف 15 ميجابايت" }, { status: 413 });

  const [existingRequest] = await db.select({
    createdByEmail: expenseRequests.createdByEmail,
  }).from(expenseRequests).where(eq(expenseRequests.draftKey, draftKey)).limit(1);
  if (existingRequest) {
    const creatorEmail = existingRequest.createdByEmail.trim().toLowerCase();
    const isCreator = [user.email, profile.email, profile.authIdentityEmail]
      .filter(Boolean).some((email) => email!.trim().toLowerCase() === creatorEmail);
    if (!isCreator) return Response.json({ error: "المسودة غير موجودة" }, { status: 404 });
  }

  const id = crypto.randomUUID();
  const safeName = upload.name.replace(/[^\p{L}\p{N}._-]+/gu, "-").slice(-120) || "attachment";
  const objectKey = `requests/${draftKey}/${id}-${safeName}`;
  await env.BUCKET.put(objectKey, upload.stream(), {
    httpMetadata: { contentType: upload.type },
    customMetadata: { uploadedBy: user.email, draftKey, originalName: upload.name },
  });

  await db.insert(files).values({ id, draftKey, objectKey, originalName: upload.name, mimeType: upload.type, sizeBytes: upload.size, purpose, status: "READY", uploadedByEmail: user.email });
  return Response.json({ file: { id, name: upload.name, mimeType: upload.type, sizeBytes: upload.size, status: "READY", url: `/api/files/${id}` } }, { status: 201 });
}
