import { and, desc, eq, or } from "drizzle-orm";
import { getDb } from "../../../db";
import { auditEvents, branches, cashReceipts, departments, files, users } from "../../../db/schema";
import { authenticationRequired, getResolvedRequestUser } from "../../../lib/request-user";
import { sha256 } from "../../../lib/workflow";

const receiptRoles = new Set(["ADMIN", "ACCOUNTING", "EXECUTOR", "CASHIER"]);

async function actorProfile(request: Request) {
  const actor = await getResolvedRequestUser(request);
  if (!actor) return null;
  const db = getDb();
  const [profile] = await db.select().from(users).where(or(eq(users.email, actor.email), eq(users.authIdentityEmail, actor.email))).limit(1);
  if (!profile || profile.status !== "ACTIVE" || !receiptRoles.has(profile.systemRole)) return null;
  const [branch] = profile.branchId
    ? await db.select({ code: branches.code }).from(branches).where(eq(branches.id, profile.branchId)).limit(1)
    : [];
  const [department] = profile.departmentId
    ? await db.select({ code: departments.code }).from(departments).where(eq(departments.id, profile.departmentId)).limit(1)
    : [];
  return {
    actor,
    profile,
    branchCode: branch?.code || profile.branchId || null,
    departmentCode: department?.code || profile.departmentId || null,
  };
}

function receiptNumber() {
  const now = new Date();
  const day = now.toISOString().slice(0, 10).replaceAll("-", "");
  const suffix = crypto.randomUUID().replaceAll("-", "").slice(0, 6).toUpperCase();
  return `RCV-${day}-${suffix}`;
}

export async function GET(request: Request) {
  const resolved = await actorProfile(request);
  if (!resolved) {
    if (!await getResolvedRequestUser(request)) return authenticationRequired();
    return Response.json({ error: "غير مصرح بعرض سندات القبض" }, { status: 403 });
  }
  const db = getDb();
  const id = new URL(request.url).searchParams.get("id");
  if (id) {
    const [receipt] = await db.select().from(cashReceipts).where(eq(cashReceipts.id, id)).limit(1);
    if (!receipt) return Response.json({ error: "سند القبض غير موجود" }, { status: 404 });
    const unrestricted = ["ADMIN", "ACCOUNTING"].includes(resolved.profile.systemRole);
    if (!unrestricted && receipt.branchCode && receipt.branchCode !== resolved.branchCode && receipt.createdByEmail !== resolved.actor.email) {
      return Response.json({ error: "غير مصرح بعرض هذا السند" }, { status: 403 });
    }
    const attachments = await db.select({
      id: files.id, originalName: files.originalName, mimeType: files.mimeType,
      sizeBytes: files.sizeBytes, uploadedByEmail: files.uploadedByEmail, createdAt: files.createdAt,
    }).from(files).where(and(eq(files.receiptId, id), eq(files.status, "READY"))).orderBy(files.createdAt);
    return Response.json({ receipt, attachments }, { headers: { "Cache-Control": "no-store" } });
  }
  const limit = Math.min(500, Math.max(1, Number(new URL(request.url).searchParams.get("limit") || 200)));
  const unrestricted = ["ADMIN", "ACCOUNTING"].includes(resolved.profile.systemRole);
  const rows = unrestricted
    ? await db.select().from(cashReceipts).orderBy(desc(cashReceipts.createdAt)).limit(limit)
    : resolved.branchCode
      ? await db.select().from(cashReceipts).where(eq(cashReceipts.branchCode, resolved.branchCode)).orderBy(desc(cashReceipts.createdAt)).limit(limit)
      : await db.select().from(cashReceipts).where(eq(cashReceipts.createdByEmail, resolved.actor.email)).orderBy(desc(cashReceipts.createdAt)).limit(limit);
  return Response.json({ receipts: rows }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  const resolved = await actorProfile(request);
  if (!resolved) {
    if (!await getResolvedRequestUser(request)) return authenticationRequired();
    return Response.json({ error: "غير مصرح بإنشاء سند قبض" }, { status: 403 });
  }
  const payload = await request.json().catch(() => null) as {
    receivedFrom?: string; amountMinor?: number; purpose?: string; paymentMethod?: "CASH" | "BANK";
    destinationAccount?: string; referenceNumber?: string; draftKey?: string;
  } | null;
  if (!payload?.receivedFrom?.trim() || !payload.purpose?.trim() || !payload.destinationAccount?.trim()) {
    return Response.json({ error: "المستلم منه والبيان والصندوق أو الحساب مطلوبة" }, { status: 400 });
  }
  if (!Number.isInteger(payload.amountMinor) || (payload.amountMinor || 0) <= 0) {
    return Response.json({ error: "مبلغ القبض غير صحيح" }, { status: 400 });
  }
  const paymentMethod = payload.paymentMethod === "BANK" ? "BANK" : "CASH";
  if (paymentMethod === "BANK" && !payload.referenceNumber?.trim()) {
    return Response.json({ error: "رقم مرجع التحويل مطلوب للقبض البنكي" }, { status: 400 });
  }
  const db = getDb();
  const id = crypto.randomUUID();
  const now = new Date();
  const voucherNumber = receiptNumber();
  const receipt = {
    id, voucherNumber, receivedFrom: payload.receivedFrom.trim(), amountMinor: payload.amountMinor!, currency: "SAR",
    purpose: payload.purpose.trim(), paymentMethod, destinationAccount: payload.destinationAccount.trim(),
    referenceNumber: payload.referenceNumber?.trim() || null, branchCode: resolved.branchCode,
    departmentCode: resolved.departmentCode, status: "CONFIRMED",
    createdByEmail: resolved.actor.email, createdByName: resolved.profile.fullName || resolved.actor.displayName,
    confirmedByEmail: resolved.actor.email, confirmedAt: now, createdAt: now, updatedAt: now,
  } as const;
  await db.insert(cashReceipts).values(receipt);
  if (payload.draftKey) {
    await db.update(files).set({ receiptId: id, draftKey: null }).where(and(
      eq(files.draftKey, payload.draftKey), eq(files.uploadedByEmail, resolved.actor.email), eq(files.status, "READY"),
    ));
  }
  const correlationId = crypto.randomUUID();
  const afterJson = JSON.stringify({ voucherNumber, amountMinor: receipt.amountMinor, paymentMethod, status: receipt.status });
  await db.insert(auditEvents).values({
    id: crypto.randomUUID(), actorEmail: resolved.actor.email, action: "CREATE_CASH_RECEIPT",
    entityType: "CASH_RECEIPT", entityId: id, afterJson, reason: receipt.purpose,
    correlationId, eventHash: await sha256(`${correlationId}|${resolved.actor.email}|CREATE_CASH_RECEIPT|${id}|${afterJson}`), createdAt: now,
  });
  return Response.json({ receipt }, { status: 201, headers: { "Cache-Control": "no-store" } });
}
