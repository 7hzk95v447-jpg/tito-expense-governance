import { env } from "cloudflare:workers";
import { and, eq, or } from "drizzle-orm";
import { getDb } from "../../../../db";
import { auditEvents, cashReceipts, departments, expenseRequests, files, paymentRunItems, paymentRuns, requestActions, requestRevisions, users } from "../../../../db/schema";
import { authenticationRequired, getResolvedRequestUser } from "../../../../lib/request-user";
import { sha256 } from "../../../../lib/workflow";

type Context = { params: Promise<{ id: string }> };

function sameEmail(left: string | null | undefined, right: string | null | undefined) {
  return Boolean(left && right && left.trim().toLowerCase() === right.trim().toLowerCase());
}

async function canAccess(request: Request, metadata: typeof files.$inferSelect) {
  const actor = await getResolvedRequestUser(request);
  if (!actor) return false;
  const db = getDb();
  const [profile] = await db.select().from(users).where(or(eq(users.email, actor.email), eq(users.authIdentityEmail, actor.email))).limit(1);
  if (!profile || profile.status !== "ACTIVE") return false;
  if (profile.systemRole === "ADMIN") return true;
  if (metadata.receiptId) {
    const [receipt] = await db.select().from(cashReceipts).where(eq(cashReceipts.id, metadata.receiptId)).limit(1);
    if (!receipt) return false;
    if (["ACCOUNTING", "CASHIER"].includes(profile.systemRole)) return true;
    return sameEmail(receipt.createdByEmail, actor.email) || sameEmail(metadata.uploadedByEmail, actor.email);
  }
  if (metadata.paymentRunId && ["BATCH_APPROVER", "EXECUTOR"].includes(profile.systemRole)) {
    const [visibleRun] = await db.select({ id: paymentRuns.id }).from(paymentRuns)
      .where(eq(paymentRuns.id, metadata.paymentRunId)).limit(1);
    if (visibleRun) return true;
  }
  if (!metadata.requestId) return sameEmail(metadata.uploadedByEmail, actor.email);
  const [expenseRequest] = await db.select().from(expenseRequests).where(eq(expenseRequests.id, metadata.requestId)).limit(1);
  if (!expenseRequest) return false;
  const creator = sameEmail(expenseRequest.createdByEmail, actor.email)
    || sameEmail(expenseRequest.createdByEmail, profile.email)
    || sameEmail(expenseRequest.createdByEmail, profile.authIdentityEmail);
  if (creator) return true;
  if (expenseRequest.status === "DRAFT") return false;
  if (sameEmail(metadata.uploadedByEmail, actor.email)) return true;
  if (["ACCOUNTING", "EXECUTIVE"].includes(profile.systemRole)) return true;
  if (["BATCH_APPROVER", "EXECUTOR"].includes(profile.systemRole)) {
    const [linkedItem] = await db.select({ id: paymentRunItems.id }).from(paymentRunItems)
      .where(eq(paymentRunItems.requestId, expenseRequest.id)).limit(1);
    return Boolean(linkedItem);
  }
  if (profile.systemRole === "DEPARTMENT_MANAGER" && profile.departmentId) {
    const [department] = await db.select({ code: departments.code }).from(departments).where(eq(departments.id, profile.departmentId)).limit(1);
    return (department?.code || profile.departmentId) === expenseRequest.departmentCode;
  }
  return false;
}

export async function GET(request: Request, context: Context) {
  if (!await getResolvedRequestUser(request)) return authenticationRequired();
  const { id } = await context.params;
  const db = getDb();
  const [metadata] = await db.select().from(files).where(eq(files.id, id)).limit(1);
  if (!metadata || metadata.status !== "READY") return Response.json({ error: "الملف غير موجود" }, { status: 404 });
  if (!await canAccess(request, metadata)) return Response.json({ error: "غير مصرح بعرض المرفق" }, { status: 403 });
  const object = await env.BUCKET.get(metadata.objectKey);
  if (!object) return Response.json({ error: "محتوى الملف غير موجود" }, { status: 404 });
  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set("content-type", metadata.mimeType);
  headers.set("content-disposition", `inline; filename*=UTF-8''${encodeURIComponent(metadata.originalName)}`);
  headers.set("cache-control", "private, max-age=60");
  return new Response(object.body, { headers });
}

export async function DELETE(request: Request, context: Context) {
  const actor = await getResolvedRequestUser(request);
  if (!actor) return authenticationRequired();
  const { id } = await context.params;
  const db = getDb();
  const [metadata] = await db.select().from(files).where(eq(files.id, id)).limit(1);
  if (!metadata) return Response.json({ error: "الملف غير موجود" }, { status: 404 });
  if (metadata.status === "REMOVED") return Response.json({ deleted: true, duplicatePrevented: true });
  if (!await canAccess(request, metadata)) return Response.json({ error: "غير مصرح بحذف المرفق" }, { status: 403 });
  const [profile] = await db.select().from(users).where(or(eq(users.email, actor.email), eq(users.authIdentityEmail, actor.email))).limit(1);
  if (!profile || profile.status !== "ACTIVE") return Response.json({ error: "الحساب غير مرتبط أو موقوف" }, { status: 403 });

  if (metadata.paymentRunId) return Response.json({ error: "لا يمكن حذف ملف إثبات مرتبط بمسير" }, { status: 409 });
  if (metadata.receiptId) return Response.json({ error: "لا يمكن حذف مرفق بعد إصدار سند القبض" }, { status: 409 });
  if (metadata.requestId) {
    const [expenseRequest] = await db.select().from(expenseRequests).where(eq(expenseRequests.id, metadata.requestId)).limit(1);
    if (!expenseRequest) return Response.json({ error: "الطلب المرتبط غير موجود" }, { status: 404 });
    const creatorEmail = expenseRequest.createdByEmail.trim().toLowerCase();
    const isCreator = [actor.email, profile.email, profile.authIdentityEmail]
      .filter(Boolean).some((email) => email!.trim().toLowerCase() === creatorEmail);
    if (!isCreator && profile.systemRole !== "ADMIN") return Response.json({ error: "إزالة المرفق متاحة لمُعدّ الطلب فقط" }, { status: 403 });
    if (!["DRAFT", "PENDING_DEPARTMENT", "RETURNED_TO_CREATOR"].includes(expenseRequest.status)) {
      return Response.json({ error: "لا يمكن إزالة مرفق بعد بدء الاعتماد المالي" }, { status: 409 });
    }
    const now = new Date();
    const nextRevision = expenseRequest.revisionNumber + 1;
    const [updated] = await db.update(expenseRequests).set({
      revisionNumber: nextRevision,
      lockVersion: expenseRequest.lockVersion + 1,
      updatedAt: now,
    }).where(and(eq(expenseRequests.id, expenseRequest.id), eq(expenseRequests.lockVersion, expenseRequest.lockVersion))).returning();
    if (!updated) return Response.json({ error: "تغير الطلب أثناء إزالة المرفق؛ أعد المحاولة" }, { status: 409 });
    await db.update(files).set({ status: "REMOVED" }).where(eq(files.id, id));
    const remaining = await db.select({ id: files.id, originalName: files.originalName }).from(files)
      .where(and(eq(files.requestId, expenseRequest.id), eq(files.status, "READY")));
    const note = `إزالة المرفق قبل الاعتماد: ${metadata.originalName}`;
    await db.insert(requestRevisions).values({
      id: crypto.randomUUID(), requestId: expenseRequest.id, revisionNumber: nextRevision,
      snapshotJson: JSON.stringify({ request: updated, attachments: remaining }), reason: note, changedByEmail: actor.email,
    });
    const idempotencyKey = request.headers.get("idempotency-key")?.trim() || `remove-file:${id}`;
    await db.insert(requestActions).values({
      id: crypto.randomUUID(), requestId: expenseRequest.id, action: "REMOVE_ATTACHMENT",
      fromStatus: expenseRequest.status, toStatus: expenseRequest.status, actorEmail: actor.email,
      actorName: profile.fullName || actor.displayName, note, idempotencyKey,
    });
    const correlationId = crypto.randomUUID();
    const beforeJson = JSON.stringify({ file: metadata, requestLockVersion: expenseRequest.lockVersion });
    const afterJson = JSON.stringify({ fileStatus: "REMOVED", requestLockVersion: updated.lockVersion, revisionNumber: nextRevision });
    const eventHash = await sha256(`${correlationId}|${actor.email}|REMOVE_ATTACHMENT|${id}|${beforeJson}|${afterJson}|${now.toISOString()}`);
    await db.insert(auditEvents).values({
      id: crypto.randomUUID(), actorEmail: actor.email, action: "REMOVE_ATTACHMENT", entityType: "REQUEST",
      entityId: expenseRequest.id, beforeJson, afterJson, reason: note, correlationId, eventHash,
    });
    return Response.json({ deleted: true, softDeleted: true, request: { lockVersion: updated.lockVersion, revisionNumber: updated.revisionNumber } });
  }

  await env.BUCKET.delete(metadata.objectKey);
  await db.delete(files).where(eq(files.id, id));
  const correlationId = crypto.randomUUID();
  const now = new Date();
  const beforeJson = JSON.stringify(metadata);
  const eventHash = await sha256(`${correlationId}|${actor.email}|DELETE_DRAFT_ATTACHMENT|${id}|${beforeJson}|${now.toISOString()}`);
  await db.insert(auditEvents).values({ id: crypto.randomUUID(), actorEmail: actor.email, action: "DELETE_DRAFT_ATTACHMENT", entityType: "FILE", entityId: id, beforeJson, reason: "حذف مرفق قبل ربطه بطلب", correlationId, eventHash });
  return Response.json({ deleted: true });
}
