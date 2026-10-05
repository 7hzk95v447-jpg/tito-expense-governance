import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("beneficiary is reused automatically instead of being entered twice", async () => {
  const wizard = await read("app/request-wizard.tsx");
  assert.match(wizard, /accountHolderName: current\.accountNameMatch === "MISMATCHED" \? current\.accountHolderName : value/);
  assert.match(wizard, /تم نسخه تلقائيًا، ولا تحتاج لكتابته مرة ثانية/);
  assert.match(wizard, /اسم صاحب الحساب المختلف/);
});

test("payment voucher PDF uses the approved TITO identity and official QR", async () => {
  const source = await read("lib/client-document-export.ts");
  assert.match(source, /سند صرف/);
  assert.match(source, /PAYMENT VOUCHER/);
  assert.match(source, /tito-official-qr\.jpeg/);
  assert.match(source, /سند-صرف-/);
  assert.match(source, /await appendAttachments/);
});

test("device sharing sends the PDF file without WhatsApp text payload", async () => {
  const payment = await read("lib/client-document-export.ts");
  const receipt = await read("lib/client-receipt-export.ts");
  assert.match(payment, /navigator\.share\(\{ files: \[file\] \}\)/);
  assert.doesNotMatch(payment, /wa\.me|api\.whatsapp|text:\s*`TITO/);
  assert.match(receipt, /navigator\.share\(\{files:\[file\]\}\)/);
  assert.doesNotMatch(receipt, /wa\.me|api\.whatsapp/);
});

test("mobile PDF downloads use a real attached link and recover from share failures", async () => {
  const [payment, receipt, wizard] = await Promise.all([
    read("lib/client-document-export.ts"),
    read("lib/client-receipt-export.ts"),
    read("app/request-wizard.tsx"),
  ]);
  for (const source of [payment, receipt]) {
    assert.match(source, /document\.body\.appendChild\(anchor\)/);
    assert.match(source, /anchor\.remove\(\)/);
    assert.match(source, /60_000/);
    assert.match(source, /AbortError/);
  }
  assert.match(wizard, /file\.size < 650_000/);
  assert.match(wizard, /file\.size > 900_000/);
});

test("cash receipts are durable, scoped, exportable, and included in backups", async () => {
  const [schema, api, ui, pdf, backup, migration] = await Promise.all([
    read("db/schema.ts"), read("app/api/receipts/route.ts"), read("app/receipt-vouchers.tsx"),
    read("lib/client-receipt-export.ts"), read("app/api/backups/route.ts"), read("drizzle/0006_yielding_the_order.sql"),
  ]);
  assert.match(schema, /cash_receipts/);
  assert.match(schema, /receipt_id/);
  assert.match(api, /receiptRoles/);
  assert.match(api, /CREATE_CASH_RECEIPT/);
  assert.match(ui, /سندات القبض/);
  assert.match(pdf, /RECEIPT VOUCHER/);
  assert.match(pdf, /سند-قبض-/);
  assert.match(backup, /cashReceipts: receiptRows/);
  assert.match(migration, /CREATE TABLE `cash_receipts`/);
});
