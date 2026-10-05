import { desc, eq, inArray, or } from "drizzle-orm";
import { getDb } from "../../../db";
import { expenseRequests, paymentRuns, users } from "../../../db/schema";
import { authenticationRequired, getResolvedRequestUser } from "../../../lib/request-user";
import { sha256 } from "../../../lib/workflow";

const groupCodes: Record<string, string> = { SUPPLIERS: "SUP", EMPLOYEES: "EMP", GOVERNMENT: "GOV", MAINTENANCE_OPERATIONS: "OPS", MARKETING: "MKT", TECHNOLOGY: "IT", MONTHLY_OBLIGATIONS: "MON", OTHER: "OTH" };
const priorityOrder: Record<string, number> = { CRITICAL: 0, URGENT: 1, NORMAL: 2 };

function runNumber(method: string, group: string) {
  const now = new Date();
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Riyadh", year: "2-digit", month: "2-digit", day: "2-digit" }).formatToParts(now);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value || "00";
  const date = `${part("year")}${part("month")}${part("day")}`;
  const suffix = crypto.getRandomValues(new Uint32Array(1))[0] % 1000;
  return `T2-${method === "BANK" ? "BNK" : method === "CASH" ? "CSH" : "GOV"}-${groupCodes[group] || "OTH"}-${date}-${String(suffix).padStart(3,"0")}`;
}

async function activeProfile(email: string) {
  const db = getDb();
  const [profile] = await db.select().from(users).where(or(eq(users.email, email), eq(users.authIdentityEmail, email))).limit(1);
  return profile?.status === "ACTIVE" ? profile : null;
}

export async function GET(request: Request) {
  const actor = await getResolvedRequestUser(request);
  if (!actor) return authenticationRequired();
  const profile = await activeProfile(actor.email);
  if (!profile || !["ADMIN", "ACCOUNTING", "EXECUTIVE", "BATCH_APPROVER", "EXECUTOR"].includes(profile.systemRole)) return Response.json({ error: "غير مصرح بعرض المسيرات" }, { status: 403 });
  const db = getDb();
  const url = new URL(request.url);
  const limit = Math.min(Math.max(Number(url.searchParams.get("limit")) || 100, 1), 500);
  const offset = Math.max(Number(url.searchParams.get("offset")) || 0, 0);
  const rows = await db.select().from(paymentRuns).orderBy(desc(paymentRuns.createdAt)).limit(limit).offset(offset);
  return Response.json({ paymentRuns: rows, page: { limit, offset, hasMore: rows.length === limit } });
}

export async function POST(request: Request) {
  const actor = await getResolvedRequestUser(request);
  if (!actor) return authenticationRequired();
  const profile = await activeProfile(actor.email);
  if (!profile || !["ADMIN", "ACCOUNTING"].includes(profile.systemRole)) return Response.json({ error: "إعداد المسير متاح للحسابات فقط" }, { status: 403 });
  const payload = (await request.json()) as { requestIds?: string[]; paymentMethod?: string; settlementGroup?: string; sourceAccount?: string };
  const requestIds = [...new Set(payload.requestIds || [])];
  if (!requestIds.length || !payload.paymentMethod || !payload.settlementGroup || !payload.sourceAccount?.trim()) return Response.json({ error: "بيانات المسير والعمليات مطلوبة" }, { status: 400 });
  if (requestIds.length > 100) return Response.json({ error: "الحد الأعلى للمسير 100 عملية" }, { status: 400 });
  if (!["BANK", "CASH"].includes(payload.paymentMethod) || !groupCodes[payload.settlementGroup]) return Response.json({ error: "طريقة أو فئة المسير غير صحيحة" }, { status: 400 });
  const db = getDb();
  const requests = await db.select().from(expenseRequests).where(inArray(expenseRequests.id, requestIds));
  if (requests.length !== requestIds.length) return Response.json({ error: "تعذر العثور على جميع الطلبات" }, { status: 404 });
  const invalid = requests.find((item) => item.status !== "READY_FOR_BATCH" || item.paymentMethod !== payload.paymentMethod || item.settlementGroup !== payload.settlementGroup);
  if (invalid) return Response.json({ error: `الطلب ${invalid.requestNumber} لا يطابق طريقة أو فئة المسير` }, { status: 409 });
  requests.sort((a, b) => (priorityOrder[a.priority] ?? 2) - (priorityOrder[b.priority] ?? 2));
  const totalMinor = requests.reduce((sum, item) => sum + item.amountMinor, 0);
  const id = crypto.randomUUID();
  const number = runNumber(payload.paymentMethod, payload.settlementGroup);
  const afterJson = JSON.stringify({ runNumber: number, paymentMethod: payload.paymentMethod, settlementGroup: payload.settlementGroup, requestIds, totalMinor, status: "BATCH_APPROVED" });
  const correlationId = crypto.randomUUID();
  const eventHash = await sha256(`${correlationId}|${actor.email}|CREATE_PAYMENT_RUN|${id}|${afterJson}`);
  const nowSeconds = Math.floor(Date.now() / 1000);
  const claimToken = `batch-claim:${id}`;
  const lockedRequestPredicates = requests.map(() => "(id = ? AND lock_version = ?)").join(" OR ");
  const statements = [db.$client.prepare(`
    UPDATE expense_requests
    SET status = 'READY_FOR_EXECUTION', current_stage = 'EXECUTION', current_assignee = ?,
        lock_version = lock_version + 1, updated_at = ?
    WHERE status = 'READY_FOR_BATCH' AND payment_method = ? AND settlement_group = ?
      AND (${lockedRequestPredicates})
  `).bind(
    claimToken, nowSeconds, payload.paymentMethod, payload.settlementGroup,
    ...requests.flatMap((item) => [item.id, item.lockVersion]),
  )];
  const placeholders = requestIds.map(() => "?").join(", ");
  statements.push(db.$client.prepare(`
    INSERT INTO payment_runs
      (id, run_number, payment_method, settlement_group, source_account, currency, status,
       prepared_by_email, total_minor, item_count, created_at)
    SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
    WHERE (
      SELECT COUNT(*) FROM expense_requests
      WHERE id IN (${placeholders}) AND status = 'READY_FOR_EXECUTION' AND current_assignee = ?
    ) = ?
  `).bind(
    id, number, payload.paymentMethod, payload.settlementGroup, payload.sourceAccount.trim(), "SAR", "BATCH_APPROVED",
    actor.email, totalMinor, requests.length, nowSeconds,
    ...requestIds, claimToken, requestIds.length,
  ));
  const itemValues = requests.map(() => "(?, ?, ?, ?, 'PENDING', ?)").join(", ");
  statements.push(db.$client.prepare(`
    INSERT INTO payment_run_items
      (id, payment_run_id, request_id, amount_minor, execution_status, created_at)
    VALUES ${itemValues}
  `).bind(...requests.flatMap((item) => [crypto.randomUUID(), id, item.id, item.amountMinor, nowSeconds])));
  const actionRows = requests.map((item) => [
    crypto.randomUUID(), item.id, "ADD_TO_PAYMENT_RUN", "READY_FOR_BATCH", "READY_FOR_EXECUTION",
    actor.email, profile.fullName || actor.displayName, `أُضيف إلى المسير ${number}`,
    `payment-run:${id}:request:${item.id}`, nowSeconds,
  ]);
  for (let offset = 0; offset < actionRows.length; offset += 40) {
    const chunk = actionRows.slice(offset, offset + 40);
    statements.push(db.$client.prepare(`
      INSERT INTO request_actions
        (id, request_id, action, from_status, to_status, actor_email, actor_name, note, idempotency_key, created_at)
      VALUES ${chunk.map(() => "(?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").join(", ")}
    `).bind(...chunk.flat()));
  }
  const notificationRows = requests.flatMap((item) => {
    const title = "أُضيف الطلب إلى مسير جاهز للتنفيذ";
    const body = `${item.requestNumber} · ${number} · ${payload.paymentMethod === "BANK" ? "تحويل بنكي" : "صرف نقدي"}`;
    return [
      [crypto.randomUUID(), item.createdByEmail, title, body, "REQUEST", item.id, `/requests/${item.id}`, `payment-run:${id}:${item.id}:creator`, actor.email, 0, nowSeconds],
      [crypto.randomUUID(), `department.${item.departmentCode.toLowerCase()}@tito.local`, title, body, "REQUEST", item.id, `/requests/${item.id}`, `payment-run:${id}:${item.id}:department`, actor.email, 0, nowSeconds],
    ];
  });
  for (let offset = 0; offset < notificationRows.length; offset += 35) {
    const chunk = notificationRows.slice(offset, offset + 35);
    statements.push(db.$client.prepare(`
      INSERT INTO notifications
        (id, recipient_email, title, body, entity_type, entity_id, action_url, dedupe_key, sent_by_email, is_read, created_at)
      VALUES ${chunk.map(() => "(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").join(", ")}
    `).bind(...chunk.flat()));
  }
  statements.push(db.$client.prepare(`
    UPDATE work_items SET status = 'COMPLETED', completed_at = ?
    WHERE request_id IN (${placeholders}) AND status = 'OPEN'
  `).bind(nowSeconds, ...requestIds));
  statements.push(db.$client.prepare(`
    UPDATE expense_requests SET current_assignee = ?
    WHERE id IN (${placeholders}) AND status = 'READY_FOR_EXECUTION' AND current_assignee = ?
  `).bind("role:EXECUTOR:FINANCE", ...requestIds, claimToken));
  statements.push(db.$client.prepare(`
    INSERT INTO payment_run_actions
      (id, payment_run_id, action, from_status, to_status, actor_email, note, idempotency_key, created_at)
    VALUES (?, ?, 'CREATE', NULL, 'BATCH_APPROVED', ?, ?, ?, ?)
  `).bind(crypto.randomUUID(), id, actor.email, "جُمعت الطلبات المعتمدة نهائيًا وأصبح المسير جاهزًا للتنفيذ", `payment-run:${id}:create`, nowSeconds));
  statements.push(db.$client.prepare(`
    INSERT INTO work_items
      (id, payment_run_id, task_type, assigned_department_code, assigned_role, status, due_at, created_at)
    VALUES (?, ?, 'EXECUTE_PAYMENT_RUN', 'FINANCE', 'EXECUTOR', 'OPEN', ?, ?)
  `).bind(crypto.randomUUID(), id, nowSeconds + 86400, nowSeconds));
  statements.push(db.$client.prepare(`
    INSERT INTO notifications
      (id, recipient_email, title, body, entity_type, entity_id, action_url, dedupe_key, sent_by_email, is_read, created_at)
    VALUES (?, 'role.executor@tito.local', 'مسير جديد جاهز للتنفيذ', ?, 'PAYMENT_RUN', ?, ?, ?, ?, 0, ?)
  `).bind(crypto.randomUUID(), `${number} · ${requests.length} عملية · ${payload.paymentMethod === "BANK" ? "بنك" : "نقد"}`, id, `/payment-runs/${id}`, `payment-run:${id}:executor`, actor.email, nowSeconds));
  statements.push(db.$client.prepare(`
    INSERT INTO audit_events
      (id, actor_email, action, entity_type, entity_id, after_json, correlation_id, event_hash, created_at)
    VALUES (?, ?, 'CREATE_PAYMENT_RUN', 'PAYMENT_RUN', ?, ?, ?, ?, ?)
  `).bind(crypto.randomUUID(), actor.email, id, afterJson, correlationId, eventHash, nowSeconds));
  try {
    // D1 batch is transactional: a failed conditional claim prevents the guarded
    // run insert, then the item FK fails and rolls the entire batch back.
    await db.$client.batch(statements);
  } catch {
    return Response.json({ error: "تغيرت حالة طلب واحد أو أكثر؛ لم يُنشأ المسير وأُعيدت العملية كاملة" }, { status: 409 });
  }
  return Response.json({ paymentRun: { id, runNumber: number, totalMinor, itemCount: requests.length, status: "BATCH_APPROVED" } }, { status: 201 });
}
