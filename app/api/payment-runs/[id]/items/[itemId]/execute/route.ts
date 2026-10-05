import { desc, eq, or } from "drizzle-orm";
import { getDb } from "../../../../../../../db";
import { executionAttempts, expenseRequests, files, paymentRunItems, paymentRuns, users } from "../../../../../../../db/schema";
import { authenticationRequired, getResolvedRequestUser } from "../../../../../../../lib/request-user";
import { sha256 } from "../../../../../../../lib/workflow";

type Context = { params: Promise<{ id: string; itemId: string }> };
type ExecutionStatus = "EXECUTED" | "FAILED" | "PENDING";

const executionStatuses = new Set<ExecutionStatus>(["EXECUTED", "FAILED", "PENDING"]);
const executionProofPurposes = new Set(["EXECUTION_PROOF", "BANK_TRANSFER_PROOF", "PAYMENT_PROOF", "CASH_RECEIPT"]);

async function reconcileClosedRun(
  db: ReturnType<typeof getDb>,
  run: typeof paymentRuns.$inferSelect,
  actorEmail: string,
  nowSeconds: number,
) {
  const [current] = await db.select({ status: paymentRuns.status }).from(paymentRuns).where(eq(paymentRuns.id, run.id)).limit(1);
  if (current?.status !== "BATCH_CLOSED") return false;
  const closeCorrelationId = `auto-close:${run.id}`;
  const closeEventHash = await sha256(`${closeCorrelationId}|${actorEmail}|PAYMENT_RUN_AUTO_CLOSE|${run.id}|BATCH_CLOSED`);
  try {
    await db.$client.batch([
      db.$client.prepare(`
        UPDATE work_items SET status = 'COMPLETED', completed_at = ?
        WHERE payment_run_id = ? AND status = 'OPEN'
      `).bind(nowSeconds, run.id),
      db.$client.prepare(`
        UPDATE expense_requests
        SET status = 'EXECUTED', current_stage = 'ARCHIVE', current_assignee = NULL,
            closed_at = COALESCE(closed_at, ?), updated_at = ?
        WHERE id IN (
          SELECT request_id FROM payment_run_items
          WHERE payment_run_id = ? AND execution_status = 'EXECUTED'
        )
      `).bind(nowSeconds, nowSeconds, run.id),
      db.$client.prepare(`
        INSERT OR IGNORE INTO payment_run_actions
          (id, payment_run_id, action, from_status, to_status, actor_email, note, idempotency_key, created_at)
        VALUES (?, ?, 'AUTO_CLOSE', ?, 'BATCH_CLOSED', ?, ?, ?, ?)
      `).bind(
        `auto-close-action:${run.id}`, run.id, run.status, actorEmail,
        "أُغلق المسير تلقائيًا بعد اكتمال تنفيذ جميع العمليات",
        `payment-run:${run.id}:auto-close`, nowSeconds,
      ),
      db.$client.prepare(`
        INSERT OR IGNORE INTO notifications
          (id, recipient_email, title, body, entity_type, entity_id, action_url, dedupe_key, sent_by_email, is_read, created_at)
        VALUES (?, ?, 'اكتمل تنفيذ المسير وأُغلق تلقائيًا', ?, 'PAYMENT_RUN', ?, ?, ?, ?, 0, ?)
      `).bind(
        `auto-close-notification:${run.id}`, run.preparedByEmail,
        `${run.runNumber} · اكتملت جميع العمليات`, run.id, `/payment-runs/${run.id}`,
        `payment-run:${run.id}:auto-close:preparer`, actorEmail, nowSeconds,
      ),
      db.$client.prepare(`
        INSERT OR IGNORE INTO audit_events
          (id, actor_email, action, entity_type, entity_id, after_json, reason, correlation_id, event_hash, created_at)
        VALUES (?, ?, 'PAYMENT_RUN_AUTO_CLOSE', 'PAYMENT_RUN', ?, ?, ?, ?, ?, ?)
      `).bind(
        `auto-close-audit:${run.id}`, actorEmail, run.id,
        JSON.stringify({ status: "BATCH_CLOSED", closedAt: new Date(nowSeconds * 1000).toISOString() }),
        "اكتملت جميع عمليات المسير", closeCorrelationId, closeEventHash, nowSeconds,
      ),
    ]);
    return true;
  } catch {
    // حالة التنفيذ المالية حُفظت بالفعل. يُعاد توحيد آثار الإغلاق بأمان عند
    // إعادة نفس الطلب أو عند محاولة التنفيذ التالية دون تكرار أي سجل.
    return false;
  }
}

export async function POST(request: Request, context: Context) {
  const { id, itemId } = await context.params;
  const actor = await getResolvedRequestUser(request);
  if (!actor) return authenticationRequired();
  const idempotencyKey = request.headers.get("idempotency-key")?.trim();
  if (!idempotencyKey || idempotencyKey.length > 200) return Response.json({ error: "مفتاح منع تكرار التنفيذ مطلوب" }, { status: 400 });
  const payload = (await request.json()) as { status?: string; executedAmountMinor?: number; bankReference?: string; reason?: string; proofFileId?: string };
  const db = getDb();
  const [profile] = await db.select().from(users).where(or(eq(users.email, actor.email), eq(users.authIdentityEmail, actor.email))).limit(1);
  if (profile?.status !== "ACTIVE" || !["ADMIN", "ACCOUNTING", "EXECUTOR"].includes(profile.systemRole)) return Response.json({ error: "التنفيذ متاح لمنفذ العملية فقط" }, { status: 403 });
  const [run] = await db.select().from(paymentRuns).where(eq(paymentRuns.id, id)).limit(1);
  const [item] = await db.select().from(paymentRunItems).where(eq(paymentRunItems.id, itemId)).limit(1);
  if (!run || !item || item.paymentRunId !== id) return Response.json({ error: "العملية أو المسير غير موجود" }, { status: 404 });
  const [expenseRequest] = await db.select().from(expenseRequests).where(eq(expenseRequests.id, item.requestId)).limit(1);
  if (!expenseRequest) return Response.json({ error: "الطلب المرتبط بالعملية غير موجود" }, { status: 404 });
  const attemptId = await sha256(`execution:${id}:${itemId}:${idempotencyKey}`);
  const [duplicate] = await db.select().from(executionAttempts).where(eq(executionAttempts.id, attemptId)).limit(1);
  if (duplicate) {
    const duplicateSeconds = Math.floor(Date.now() / 1000);
    await reconcileClosedRun(db, run, actor.email, duplicateSeconds);
    const [currentRun] = await db.select({ status: paymentRuns.status }).from(paymentRuns).where(eq(paymentRuns.id, id)).limit(1);
    return Response.json({
      execution: { id: duplicate.id, attemptNumber: duplicate.attemptNumber, status: duplicate.status },
      paymentRun: { status: currentRun?.status || run.status },
      autoClosed: currentRun?.status === "BATCH_CLOSED",
      duplicatePrevented: true,
    });
  }
  if (!["BATCH_APPROVED", "BATCH_EXECUTING"].includes(run.status)) return Response.json({ error: "المسير غير جاهز للتنفيذ" }, { status: 409 });
  const status = String(payload.status || "").trim().toUpperCase() as ExecutionStatus;
  if (!executionStatuses.has(status)) return Response.json({ error: "حالة التنفيذ غير صحيحة" }, { status: 400 });
  if (item.executionStatus === "EXECUTED") return Response.json({ error: "العملية منفذة مسبقًا ولا يمكن إعادة تنفيذها" }, { status: 409 });
  if (!["PENDING", "FAILED"].includes(item.executionStatus)) return Response.json({ error: "حالة العملية الحالية غير قابلة للتنفيذ" }, { status: 409 });
  if (["FAILED", "PENDING"].includes(status) && !payload.reason?.trim()) return Response.json({ error: "سبب التعذر أو التعليق إلزامي" }, { status: 400 });
  if (status === "EXECUTED") {
    if (!Number.isInteger(payload.executedAmountMinor) || (payload.executedAmountMinor ?? 0) <= 0) return Response.json({ error: "المبلغ المنفذ مطلوب" }, { status: 400 });
    if ((payload.executedAmountMinor ?? 0) !== item.amountMinor) return Response.json({ error: "يجب أن يطابق المبلغ المنفذ المبلغ المعتمد؛ أعد الطلب للتصحيح عند وجود فرق" }, { status: 409 });
    if (!payload.bankReference?.trim() && !payload.proofFileId) return Response.json({ error: "رقم المرجع أو إثبات التنفيذ مطلوب" }, { status: 400 });
  }
  if (payload.proofFileId) {
    const [proof] = await db.select().from(files).where(eq(files.id, payload.proofFileId)).limit(1);
    if (!proof || proof.status !== "READY") return Response.json({ error: "ملف إثبات التنفيذ غير موجود أو غير جاهز" }, { status: 400 });
    const linkedToOperation = proof.paymentRunId === id || proof.requestId === item.requestId;
    if (!linkedToOperation) return Response.json({ error: "ملف الإثبات غير مرتبط بهذا المسير أو الطلب" }, { status: 403 });
    if (!executionProofPurposes.has(proof.purpose.trim().toUpperCase())) return Response.json({ error: "غرض المرفق لا يسمح باستخدامه كإثبات تنفيذ" }, { status: 400 });
  }
  const [lastAttempt] = await db.select({ attemptNumber: executionAttempts.attemptNumber }).from(executionAttempts).where(eq(executionAttempts.paymentRunItemId, itemId)).orderBy(desc(executionAttempts.attemptNumber)).limit(1);
  const attemptNumber = (lastAttempt?.attemptNumber || 0) + 1;
  const now = new Date();
  const requestStatus = status === "EXECUTED" ? "EXECUTED" : status === "FAILED" ? "EXECUTION_FAILED" : "EXECUTION_PENDING";
  const afterJson = JSON.stringify({ runId: id, itemId, attemptNumber, ...payload, status });
  const correlationId = crypto.randomUUID();
  const eventHash = await sha256(`${correlationId}|${actor.email}|EXECUTE_PAYMENT|${itemId}|${afterJson}`);
  const claimToken = `execution-claim:${attemptId}`;
  const nowSeconds = Math.floor(now.getTime() / 1000);
  try {
    await db.$client.batch([
      db.$client.prepare(`
        UPDATE payment_run_items SET failure_reason = ?
        WHERE id = ? AND payment_run_id = ? AND execution_status = ? AND execution_status <> 'EXECUTED'
      `).bind(claimToken, itemId, id, item.executionStatus),
      db.$client.prepare(`
        INSERT INTO audit_events
          (id, actor_email, action, entity_type, entity_id, after_json, reason, correlation_id, event_hash, created_at)
        VALUES (?,
          (SELECT ? FROM payment_run_items WHERE id = ? AND payment_run_id = ? AND failure_reason = ?),
          ?, 'PAYMENT_RUN_ITEM', ?, ?, ?, ?, ?, ?)
      `).bind(
        crypto.randomUUID(), actor.email, itemId, id, claimToken,
        status === "EXECUTED" ? "EXECUTE_PAYMENT" : status === "FAILED" ? "EXECUTION_FAILED" : "EXECUTION_PENDING",
        itemId, afterJson, payload.reason?.trim() || null, correlationId, eventHash, nowSeconds,
      ),
      db.$client.prepare(`
        INSERT INTO execution_attempts
          (id, payment_run_item_id, attempt_number, status, executed_amount_minor, bank_reference,
           reason, proof_file_id, executed_by_email, executed_at, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(
        attemptId, itemId, attemptNumber, status, payload.executedAmountMinor || null,
        payload.bankReference?.trim() || null, payload.reason?.trim() || null, payload.proofFileId || null,
        actor.email, status === "EXECUTED" ? nowSeconds : null, nowSeconds,
      ),
      db.$client.prepare(`
        INSERT INTO request_actions
          (id, request_id, action, from_status, to_status, actor_email, actor_name, note, idempotency_key, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(
        crypto.randomUUID(), item.requestId,
        status === "EXECUTED" ? "EXECUTE_PAYMENT" : status === "FAILED" ? "EXECUTION_FAILED" : "EXECUTION_PENDING",
        expenseRequest.status, requestStatus, actor.email, profile.fullName || actor.displayName,
        `${run.runNumber} · ${payload.bankReference?.trim() || payload.reason?.trim() || status}`,
        `execution:${attemptId}:request`, nowSeconds,
      ),
      db.$client.prepare(`
        INSERT INTO notifications
          (id, recipient_email, title, body, entity_type, entity_id, action_url, dedupe_key, sent_by_email, is_read, created_at)
        VALUES (?, ?, ?, ?, 'REQUEST', ?, ?, ?, ?, 0, ?)
      `).bind(
        crypto.randomUUID(), expenseRequest.createdByEmail,
        status === "EXECUTED" ? "تم تنفيذ عملية الصرف" : status === "FAILED" ? "تعذر تنفيذ عملية الصرف" : "عملية الصرف معلقة",
        `${expenseRequest.requestNumber} · ${run.runNumber} · ${payload.bankReference?.trim() || payload.reason?.trim() || status}`,
        item.requestId, `/requests/${item.requestId}`, `execution:${attemptId}:creator`, actor.email, nowSeconds,
      ),
      db.$client.prepare(`
        INSERT INTO notifications
          (id, recipient_email, title, body, entity_type, entity_id, action_url, dedupe_key, sent_by_email, is_read, created_at)
        VALUES (?, ?, ?, ?, 'REQUEST', ?, ?, ?, ?, 0, ?)
      `).bind(
        crypto.randomUUID(), `department.${expenseRequest.departmentCode.toLowerCase()}@tito.local`,
        status === "EXECUTED" ? "تم تنفيذ عملية صرف للإدارة" : status === "FAILED" ? "تعذر تنفيذ عملية صرف للإدارة" : "عملية صرف للإدارة معلقة",
        `${expenseRequest.requestNumber} · ${run.runNumber} · ${payload.bankReference?.trim() || payload.reason?.trim() || status}`,
        item.requestId, `/requests/${item.requestId}`, `execution:${attemptId}:department`, actor.email, nowSeconds,
      ),
      db.$client.prepare(`
        UPDATE payment_run_items
        SET execution_status = ?, bank_reference = ?, failure_reason = ?
        WHERE id = ? AND payment_run_id = ? AND failure_reason = ?
      `).bind(status, payload.bankReference?.trim() || null, payload.reason?.trim() || null, itemId, id, claimToken),
      db.$client.prepare(`
        UPDATE payment_runs
        SET status = CASE
              WHEN NOT EXISTS (
                SELECT 1 FROM payment_run_items
                WHERE payment_run_id = ? AND execution_status NOT IN ('EXECUTED', 'EXCLUDED')
              ) THEN 'BATCH_CLOSED'
              ELSE 'BATCH_EXECUTING'
            END,
            closed_at = CASE
              WHEN NOT EXISTS (
                SELECT 1 FROM payment_run_items
                WHERE payment_run_id = ? AND execution_status NOT IN ('EXECUTED', 'EXCLUDED')
              ) THEN ?
              ELSE NULL
            END
        WHERE id = ?
      `).bind(id, id, nowSeconds, id),
      db.$client.prepare(`
        UPDATE work_items SET status = 'COMPLETED', completed_at = ?
        WHERE payment_run_id = ? AND status = 'OPEN'
          AND EXISTS (SELECT 1 FROM payment_runs WHERE id = ? AND status = 'BATCH_CLOSED')
      `).bind(nowSeconds, id, id),
      db.$client.prepare(`
        UPDATE expense_requests
        SET status = ?, current_stage = ?, current_assignee = ?, closed_at = ?, updated_at = ?
        WHERE id = ?
      `).bind(
        requestStatus,
        status === "EXECUTED" ? "ARCHIVE" : "EXECUTION",
        status === "EXECUTED" ? null : "role:EXECUTOR:FINANCE",
        status === "EXECUTED" ? nowSeconds : null,
        nowSeconds,
        item.requestId,
      ),
    ]);
  } catch {
    const [currentItem] = await db.select({ executionStatus: paymentRunItems.executionStatus }).from(paymentRunItems).where(eq(paymentRunItems.id, itemId)).limit(1);
    return Response.json({ error: currentItem?.executionStatus === "EXECUTED" ? "العملية منفذة مسبقًا" : "تغيرت العملية أثناء التنفيذ؛ أعد فتح المسير" }, { status: 409 });
  }
  const [updatedRun] = await db.select({ status: paymentRuns.status }).from(paymentRuns).where(eq(paymentRuns.id, id)).limit(1);
  const autoClosed = updatedRun?.status === "BATCH_CLOSED";
  if (autoClosed) await reconcileClosedRun(db, run, actor.email, nowSeconds);
  return Response.json({ execution: { id: attemptId, attemptNumber, status }, paymentRun: { status: updatedRun?.status || "BATCH_EXECUTING" }, autoClosed });
}
