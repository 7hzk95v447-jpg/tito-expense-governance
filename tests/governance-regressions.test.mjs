import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("request routing is server-owned and never falls back to GENERAL", async () => {
  const source = await read("app/api/requests/route.ts");
  for (const mapping of [
    'supplier: "PURCHASING"', 'employee: "HR"', 'government: "FINANCE"',
    'operations: "BRANCH"', 'marketing: "MARKETING"', 'it: "IT"',
  ]) assert.match(source, new RegExp(mapping.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.doesNotMatch(source, /departmentCode:\s*payload\.departmentCode/);
  assert.doesNotMatch(source, /\|\|\s*["']GENERAL["']/);
});

test("notification reads are isolated per user", async () => {
  const [route, schema] = await Promise.all([read("app/api/notifications/route.ts"), read("db/schema.ts")]);
  assert.match(route, /notificationReads/);
  assert.match(route, /userEmail:\s*context\.readKey/);
  assert.doesNotMatch(route, /update\(notifications\)\.set\(\{\s*isRead/);
  assert.match(schema, /notification_reads_user_unique_idx/);
});

test("payment execution is idempotent and atomically claimed", async () => {
  const [api, ui] = await Promise.all([
    read("app/api/payment-runs/[id]/items/[itemId]/execute/route.ts"),
    read("app/print/payment-run/page.tsx"),
  ]);
  assert.match(api, /idempotency-key/i);
  assert.match(api, /execution-claim:/);
  assert.match(api, /execution_status <> 'EXECUTED'/);
  assert.match(api, /proof\.status !== "READY"/);
  assert.match(api, /يجب أن يطابق المبلغ المنفذ المبلغ المعتمد/);
  assert.match(ui, /Idempotency-Key/);
});

test("governed outputs use real PDF file sharing and printable XLSX settings", async () => {
  const [pdf, xlsx] = await Promise.all([read("lib/client-document-export.ts"), read("lib/client-xlsx-export.ts")]);
  assert.match(pdf, /navigator\.share/);
  assert.match(pdf, /new File\(/);
  assert.match(pdf, /لم يُنشأ PDF ناقص/);
  assert.match(xlsx, /_xlnm\.Print_Titles/);
  assert.match(xlsx, /fitToPage/);
  assert.match(xlsx, /Asia\/Riyadh/);
});

test("request PDF is one governed form followed directly by the real attachments", async () => {
  const pdf = await read("lib/client-document-export.ts");
  assert.match(pdf, /async function requestVoucherPage/);
  assert.match(pdf, /await addCanvasPage\(pdf, await requestVoucherPage\(data\), A4_LANDSCAPE\)[\s\S]*appendAttachments\(pdf, pdfLib, data/);
  assert.match(pdf, /PAYMENT VOUCHER/);
});

test("new payment runs go directly to one execution task and legacy drafts remain recoverable", async () => {
  const [createApi, actionApi, runPage] = await Promise.all([
    read("app/api/payment-runs/route.ts"),
    read("app/api/payment-runs/[id]/action/route.ts"),
    read("app/print/payment-run/page.tsx"),
  ]);
  assert.match(createApi, /status: "BATCH_APPROVED"/);
  assert.match(createApi, /EXECUTE_PAYMENT_RUN/);
  assert.match(createApi, /role:EXECUTOR:FINANCE/);
  assert.doesNotMatch(createApi, /APPROVE_PAYMENT_RUN/);
  assert.match(actionApi, /BATCH_DRAFT: \{ SUBMIT: "BATCH_PENDING_APPROVAL" \}/);
  assert.match(actionApi, /run\.preparedByEmail === actor\.email && !isAdmin/);
  assert.match(runPage, /هذا المسير للتجميع والتنفيذ والإغلاق التلقائي فقط/);
  assert.match(runPage, /الموافقات محفوظة داخل كل طلب/);
});

test("ready-for-run requests cannot show a misleading request approval action", async () => {
  const [detailApi, detailUi, shell, workspace] = await Promise.all([
    read("app/api/requests/[id]/route.ts"),
    read("app/request-detail.tsx"),
    read("app/tito-app.tsx"),
    read("app/workspace-views.tsx"),
  ]);
  assert.match(detailApi, /decisionStatuses = \["PENDING_DEPARTMENT", "RETURNED_ACCOUNTING_TO_DEPARTMENT", "PENDING_ACCOUNTING", "PENDING_EXECUTIVE"\]/);
  assert.match(detailApi, /canPrepareRun: expenseRequest\.status === "READY_FOR_BATCH"/);
  assert.match(detailUi, /فور إنشاء المسير ينتقل مباشرة إلى المنفذ، من دون اعتماد زائد/);
  assert.match(detailUi, /فتح إعداد المسير الآن/);
  assert.match(shell, /tito:run-builder-request/);
  assert.match(workspace, /setSelectedRunRequests\(\[target\.id\]\)/);
});

test("accounting routes to executive approval before run preparation", async () => {
  const [workflow, actionApi] = await Promise.all([
    read("lib/workflow.ts"),
    read("app/api/requests/[id]/action/route.ts"),
  ]);
  assert.match(workflow, /PENDING_ACCOUNTING:[\s\S]*APPROVE: \{ to: "PENDING_EXECUTIVE", stage: "EXECUTIVE"/);
  assert.match(workflow, /PENDING_EXECUTIVE:[\s\S]*APPROVE: \{ to: "READY_FOR_BATCH", stage: "BATCH_PREPARATION"/);
  assert.match(workflow, /PENDING_EXECUTIVE:[\s\S]*RETURN: \{ to: "PENDING_ACCOUNTING", stage: "ACCOUNTING"/);
  assert.match(actionApi, /status === "PENDING_EXECUTIVE"/);
  assert.match(actionApi, /systemRole === "EXECUTIVE"/);
});

test("the last execution closes the run and archives requests automatically", async () => {
  const executionApi = await read("app/api/payment-runs/[id]/items/[itemId]/execute/route.ts");
  assert.match(executionApi, /execution_status NOT IN \('EXECUTED', 'EXCLUDED'\)/);
  assert.match(executionApi, /THEN 'BATCH_CLOSED'/);
  assert.match(executionApi, /PAYMENT_RUN_AUTO_CLOSE/);
  assert.match(executionApi, /current_stage = 'ARCHIVE', current_assignee = NULL/);
  assert.match(executionApi, /WHERE payment_run_id = \? AND status = 'OPEN'/);
  assert.match(executionApi, /duplicate[\s\S]*reconcileClosedRun/);
});

test("bank and cash runs have separate statement-aware PDF and Excel tables", async () => {
  const [pdf, xlsx, runPage] = await Promise.all([
    read("lib/client-document-export.ts"),
    read("lib/client-xlsx-export.ts"),
    read("app/print/payment-run/page.tsx"),
  ]);
  for (const source of [pdf, xlsx, runPage]) assert.match(source, /البيان/);
  assert.match(pdf, /run\.paymentMethod === "BANK"/);
  assert.match(pdf, /نقدي/);
  assert.match(xlsx, /التحويلات البنكية/);
  assert.match(xlsx, /الصرف النقدي/);
  assert.match(runPage, /"تحويلات بنكية"/);
  assert.match(runPage, /"صرف نقدي"/);
  assert.match(xlsx, /filter\(\(item\) => item\.executionStatus !== "EXCLUDED"\)/);
  assert.match(xlsx, /الاعتماد التنفيذي/);
  assert.match(pdf, /اعتماد المدير التنفيذي/);
});

test("archive and report data are loaded page by page without the old 100-row cutoff", async () => {
  const [requestsApi, runsApi, workspace] = await Promise.all([
    read("app/api/requests/route.ts"),
    read("app/api/payment-runs/route.ts"),
    read("app/workspace-views.tsx"),
  ]);
  for (const source of [requestsApi, runsApi]) {
    assert.match(source, /searchParams\.get\("limit"\)/);
    assert.match(source, /searchParams\.get\("offset"\)/);
    assert.match(source, /hasMore/);
  }
  assert.match(workspace, /loadPagedCollection/);
  assert.match(workspace, /while \(offset < 50_000\)/);
});

test("draft edit, cancellation and run correction remain exposed", async () => {
  const [detail, runPage, runApi] = await Promise.all([
    read("app/request-detail.tsx"), read("app/print/payment-run/page.tsx"), read("app/api/payment-runs/[id]/route.ts"),
  ]);
  assert.match(detail, /تعديل الطلب/);
  assert.match(detail, /إلغاء الطلب/);
  assert.match(runPage, /استبعاد للتصحيح/);
  assert.match(runApi, /EXCLUDE_ITEM/);
});
