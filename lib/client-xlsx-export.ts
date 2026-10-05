"use client";

import type { PaymentRunExportData } from "./client-document-export";

export type RequestWorkbookRow = {
  requestNumber: string;
  createdAt?: string | Date;
  departmentCode: string;
  expenseType: string;
  beneficiaryName: string;
  paymentMethod: string;
  bankName?: string | null;
  iban?: string | null;
  accountNameMatch?: string | null;
  amountMinor: number;
  status: string;
  priority?: string;
  currentStage?: string;
  createdByName?: string;
};

type Cell = { value?: string | number; style?: number; type?: "s" | "n" | "d"; formula?: string };
type ZipEntry = { name: string; data: Uint8Array; crc: number; offset: number };

const encoder = new TextEncoder();
const RED = "DC001C";

const statusNames: Record<string, string> = {
  DRAFT: "مسودة", PENDING_DEPARTMENT: "بانتظار الإدارة", RETURNED_TO_CREATOR: "معاد للتعديل",
  PENDING_ACCOUNTING: "بانتظار الحسابات", RETURNED_ACCOUNTING_TO_DEPARTMENT: "معاد للإدارة",
  PENDING_EXECUTIVE: "بانتظار الاعتماد التنفيذي",
  READY_FOR_BATCH: "جاهز للمسير", IN_BATCH_DRAFT: "داخل مسير", PENDING_BATCH_APPROVAL: "بانتظار اعتماد المسير",
  READY_FOR_EXECUTION: "جاهز للتنفيذ", EXECUTION_PENDING: "قيد التنفيذ", EXECUTED: "تم التنفيذ",
  EXECUTION_FAILED: "متعذر", REJECTED_FINAL: "مرفوض", CANCELLED: "ملغى",
};
const priorityNames: Record<string, string> = { CRITICAL: "أولوية قصوى", URGENT: "عاجل", NORMAL: "عادي" };
const groupNames: Record<string, string> = {
  SUPPLIERS: "الموردون", EMPLOYEES: "الموظفون", GOVERNMENT: "السداد الحكومي",
  MAINTENANCE_OPERATIONS: "التشغيل والصيانة", MARKETING: "التسويق والإعلانات",
  TECHNOLOGY: "تقنية المعلومات", MONTHLY_OBLIGATIONS: "الالتزامات الشهرية", OTHER: "أخرى",
};
const runStatusNames: Record<string, string> = {
  BATCH_DRAFT: "تحت الإعداد", BATCH_PENDING_APPROVAL: "بانتظار الاعتماد", BATCH_RETURNED: "معاد للحسابات",
  BATCH_APPROVED: "جاهز للتنفيذ", BATCH_EXECUTING: "قيد التنفيذ", BATCH_CLOSED: "مغلق ومنفذ", BATCH_REJECTED: "مرفوض",
};
const executionStatusNames: Record<string, string> = {
  PENDING: "بانتظار التنفيذ", EXECUTED: "تم التنفيذ", FAILED: "متعذر", EXCLUDED: "مستبعد", SUSPENDED: "معلق",
};

function escapeXml(value: string | number | undefined) {
  return String(value ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function columnName(index: number) {
  let value = index + 1;
  let name = "";
  while (value > 0) { value -= 1; name = String.fromCharCode(65 + (value % 26)) + name; value = Math.floor(value / 26); }
  return name;
}

function excelSerial(value: string | Date | undefined) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Riyadh", year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
  }).formatToParts(date);
  const getPart = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((part) => part.type === type)?.value || 0);
  const riyadhWallClock = Date.UTC(getPart("year"), getPart("month") - 1, getPart("day"), getPart("hour"), getPart("minute"), getPart("second"));
  return riyadhWallClock / 86_400_000 + 25569;
}

function cellXml(cell: Cell, row: number, column: number) {
  const reference = `${columnName(column)}${row}`;
  const style = cell.style == null ? "" : ` s="${cell.style}"`;
  if (cell.formula) return `<c r="${reference}"${style}><f>${escapeXml(cell.formula)}</f><v>${escapeXml(cell.value)}</v></c>`;
  if (cell.type === "n" || typeof cell.value === "number") return `<c r="${reference}"${style}><v>${escapeXml(cell.value)}</v></c>`;
  return `<c r="${reference}" t="inlineStr"${style}><is><t xml:space="preserve">${escapeXml(cell.value)}</t></is></c>`;
}

function sheetXml(title: string, subtitle: string, headers: string[], rows: Cell[][], widths: number[], totalColumn?: number) {
  const lastColumn = columnName(headers.length - 1);
  const dataStart = 5;
  const dataEnd = dataStart + rows.length - 1;
  const titleRow = `<row r="1" ht="34" customHeight="1">${cellXml({ value: title, style: 1 }, 1, 0)}</row>`;
  const subtitleRow = `<row r="2" ht="24" customHeight="1">${cellXml({ value: subtitle, style: 2 }, 2, 0)}</row>`;
  const summaryRow = `<row r="3" ht="22" customHeight="1">${cellXml({ value: `عدد السجلات: ${rows.length}`, style: 2 }, 3, 0)}${totalColumn == null ? "" : cellXml({ value: `الإجمالي: ${rows.reduce((sum, row) => sum + Number(row[totalColumn]?.value || 0), 0).toLocaleString("en-US", { minimumFractionDigits: 2 })} ر.س`, style: 2 }, 3, Math.max(1, totalColumn - 1))}</row>`;
  const headerRow = `<row r="4" ht="32" customHeight="1">${headers.map((header, index) => cellXml({ value: header, style: 3 }, 4, index)).join("")}</row>`;
  const dataRows = rows.map((cells, index) => `<row r="${dataStart + index}">${cells.map((cell, column) => cellXml(cell, dataStart + index, column)).join("")}</row>`).join("");
  let totalRow = "";
  let finalRow = Math.max(4, dataEnd);
  if (totalColumn != null && rows.length) {
    finalRow = dataEnd + 1;
    totalRow = `<row r="${finalRow}" ht="30" customHeight="1">${cellXml({ value: "الإجمالي", style: 5 }, finalRow, Math.max(0, totalColumn - 1))}${cellXml({ value: rows.reduce((sum, row) => sum + Number(row[totalColumn]?.value || 0), 0), formula: `SUM(${columnName(totalColumn)}${dataStart}:${columnName(totalColumn)}${dataEnd})`, style: 6 }, finalRow, totalColumn)}</row>`;
  }
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <dimension ref="A1:${lastColumn}${finalRow}"/>
  <sheetPr><pageSetUpPr fitToPage="1" autoPageBreaks="0"/></sheetPr>
  <sheetViews><sheetView rightToLeft="1" showGridLines="0" workbookViewId="0"><pane ySplit="4" topLeftCell="A5" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>
  <sheetFormatPr defaultRowHeight="20"/>
  <cols>${widths.map((width, index) => `<col min="${index + 1}" max="${index + 1}" width="${width}" customWidth="1"/>`).join("")}</cols>
  <sheetData>${titleRow}${subtitleRow}${summaryRow}${headerRow}${dataRows}${totalRow}</sheetData>
  <mergeCells count="2"><mergeCell ref="A1:${lastColumn}1"/><mergeCell ref="A2:${lastColumn}2"/></mergeCells>
  <autoFilter ref="A4:${lastColumn}${Math.max(4, dataEnd)}"/>
  <printOptions horizontalCentered="1"/>
  <pageMargins left="0.25" right="0.25" top="0.5" bottom="0.5" header="0.2" footer="0.2"/>
  <pageSetup orientation="landscape" paperSize="9" pageOrder="overThenDown" fitToWidth="1" fitToHeight="0"/>
</worksheet>`;
}

function stylesXml() {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <numFmts count="2"><numFmt numFmtId="164" formatCode="#\,##0.00 &quot;ر.س&quot;"/><numFmt numFmtId="165" formatCode="yyyy-mm-dd hh:mm"/></numFmts>
  <fonts count="3"><font><sz val="10"/><name val="Arial"/></font><font><b/><color rgb="FFFFFFFF"/><sz val="18"/><name val="Arial"/></font><font><b/><color rgb="FFFFFFFF"/><sz val="10"/><name val="Arial"/></font></fonts>
  <fills count="4"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF${RED}"/><bgColor indexed="64"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFF4F5F7"/><bgColor indexed="64"/></patternFill></fill></fills>
  <borders count="2"><border/><border><left style="thin"><color rgb="FFE1E3E7"/></left><right style="thin"><color rgb="FFE1E3E7"/></right><top style="thin"><color rgb="FFE1E3E7"/></top><bottom style="thin"><color rgb="FFE1E3E7"/></bottom></border></borders>
  <cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
  <cellXfs count="8">
    <xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"><alignment horizontal="right" vertical="center" readingOrder="2" wrapText="1"/></xf>
    <xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFill="1" applyFont="1"><alignment horizontal="center" vertical="center" readingOrder="2"/></xf>
    <xf numFmtId="0" fontId="0" fillId="3" borderId="0" xfId="0" applyFill="1"><alignment horizontal="center" vertical="center" readingOrder="2"/></xf>
    <xf numFmtId="0" fontId="2" fillId="2" borderId="1" xfId="0" applyFill="1" applyFont="1" applyBorder="1"><alignment horizontal="center" vertical="center" readingOrder="2" wrapText="1"/></xf>
    <xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1"><alignment horizontal="right" vertical="center" readingOrder="2" wrapText="1"/></xf>
    <xf numFmtId="0" fontId="2" fillId="2" borderId="1" xfId="0" applyFill="1" applyFont="1" applyBorder="1"><alignment horizontal="right" vertical="center" readingOrder="2"/></xf>
    <xf numFmtId="164" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1"><alignment horizontal="left" vertical="center" readingOrder="1"/></xf>
    <xf numFmtId="165" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1"><alignment horizontal="center" vertical="center" readingOrder="1"/></xf>
  </cellXfs>
  <cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`;
}

function crc32(data: Uint8Array) {
  let crc = 0xffffffff;
  for (const byte of data) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function writeUint16(view: DataView, offset: number, value: number) { view.setUint16(offset, value, true); }
function writeUint32(view: DataView, offset: number, value: number) { view.setUint32(offset, value >>> 0, true); }

function zip(files: Record<string, string>) {
  const chunks: Uint8Array[] = [];
  const entries: ZipEntry[] = [];
  let offset = 0;
  Object.entries(files).forEach(([name, value]) => {
    const nameBytes = encoder.encode(name);
    const data = encoder.encode(value);
    const checksum = crc32(data);
    const header = new Uint8Array(30 + nameBytes.length);
    const view = new DataView(header.buffer);
    writeUint32(view, 0, 0x04034b50); writeUint16(view, 4, 20); writeUint16(view, 6, 0); writeUint16(view, 8, 0);
    writeUint16(view, 10, 0); writeUint16(view, 12, 0); writeUint32(view, 14, checksum); writeUint32(view, 18, data.length); writeUint32(view, 22, data.length);
    writeUint16(view, 26, nameBytes.length); writeUint16(view, 28, 0); header.set(nameBytes, 30);
    chunks.push(header, data);
    entries.push({ name, data, crc: checksum, offset });
    offset += header.length + data.length;
  });
  const centralOffset = offset;
  entries.forEach((entry) => {
    const nameBytes = encoder.encode(entry.name);
    const header = new Uint8Array(46 + nameBytes.length);
    const view = new DataView(header.buffer);
    writeUint32(view, 0, 0x02014b50); writeUint16(view, 4, 20); writeUint16(view, 6, 20); writeUint16(view, 8, 0); writeUint16(view, 10, 0);
    writeUint16(view, 12, 0); writeUint16(view, 14, 0); writeUint32(view, 16, entry.crc); writeUint32(view, 20, entry.data.length); writeUint32(view, 24, entry.data.length);
    writeUint16(view, 28, nameBytes.length); writeUint16(view, 30, 0); writeUint16(view, 32, 0); writeUint16(view, 34, 0); writeUint16(view, 36, 0); writeUint32(view, 38, 0); writeUint32(view, 42, entry.offset);
    header.set(nameBytes, 46); chunks.push(header); offset += header.length;
  });
  const centralSize = offset - centralOffset;
  const end = new Uint8Array(22);
  const endView = new DataView(end.buffer);
  writeUint32(endView, 0, 0x06054b50); writeUint16(endView, 4, 0); writeUint16(endView, 6, 0); writeUint16(endView, 8, entries.length); writeUint16(endView, 10, entries.length);
  writeUint32(endView, 12, centralSize); writeUint32(endView, 16, centralOffset); writeUint16(endView, 20, 0); chunks.push(end);
  const totalLength = chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0);
  const output = new Uint8Array(new ArrayBuffer(totalLength));
  let position = 0;
  for (const chunk of chunks) {
    output.set(chunk, position);
    position += chunk.byteLength;
  }
  return new Blob([output.buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
}

function workbookFiles(sheet: string, title: string) {
  return {
    "[Content_Types].xml": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/><Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/></Types>`,
    "_rels/.rels": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/></Relationships>`,
    "docProps/app.xml": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties"><Application>TITO Expense Governance</Application></Properties>`,
    "docProps/core.xml": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/"><dc:title>${escapeXml(title)}</dc:title><dc:creator>TITO</dc:creator><dcterms:created xsi:type="dcterms:W3CDTF" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">${new Date().toISOString()}</dcterms:created></cp:coreProperties>`,
    "xl/workbook.xml": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><bookViews><workbookView activeTab="0"/></bookViews><sheets><sheet name="تقرير TITO" sheetId="1" r:id="rId1"/></sheets><definedNames><definedName name="_xlnm.Print_Titles" localSheetId="0">'تقرير TITO'!$4:$4</definedName></definedNames><calcPr calcId="191029" fullCalcOnLoad="1" forceFullCalc="1"/></workbook>`,
    "xl/_rels/workbook.xml.rels": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`,
    "xl/styles.xml": stylesXml(),
    "xl/worksheets/sheet1.xml": sheet,
  };
}

function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url; anchor.download = filename; anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1200);
}

export function createRequestsXlsx(rows: RequestWorkbookRow[]) {
  const headers = ["رقم الطلب", "التاريخ", "الإدارة", "نوع الصرف", "المستفيد", "طريقة الصرف", "البنك", "الآيبان", "المطابقة", "المبلغ", "الحالة", "الأولوية", "المرحلة", "مُعدّ الطلب"];
  const data = rows.map<Cell[]>((row) => {
    const serial = excelSerial(row.createdAt);
    return [
      { value: row.requestNumber, style: 4 }, { value: serial ?? "—", style: serial == null ? 4 : 7, type: serial == null ? "s" : "n" },
      { value: row.departmentCode, style: 4 }, { value: row.expenseType, style: 4 }, { value: row.beneficiaryName, style: 4 },
      { value: row.paymentMethod === "BANK" ? "تحويل بنكي" : "نقدي", style: 4 }, { value: row.bankName || "—", style: 4 },
      { value: row.iban || "—", style: 4 }, { value: row.accountNameMatch === "MATCHED" ? "مطابق" : row.accountNameMatch ? "غير مطابق" : "—", style: 4 },
      { value: row.amountMinor / 100, style: 6, type: "n" }, { value: statusNames[row.status] || row.status, style: 4 },
      { value: priorityNames[row.priority || "NORMAL"] || row.priority || "عادي", style: 4 }, { value: row.currentStage || "—", style: 4 }, { value: row.createdByName || "—", style: 4 },
    ];
  });
  const sheet = sheetXml("\u2066T2 · TITO\u2069 | تقرير طلبات الصرف", `تيتو · تسوق كل جديد · تاريخ التصدير ${new Date().toLocaleString("ar-SA", { timeZone: "Asia/Riyadh" })}`, headers, data, [20, 21, 18, 28, 28, 16, 20, 30, 14, 16, 22, 16, 18, 22], 9);
  const blob = zip(workbookFiles(sheet, "تقرير طلبات الصرف – TITO"));
  const filename = `TITO-requests-${new Date().toISOString().slice(0, 10)}.xlsx`;
  return { blob, filename };
}

export function downloadRequestsXlsx(rows: RequestWorkbookRow[]) {
  const result = createRequestsXlsx(rows);
  download(result.blob, result.filename);
  return result.filename;
}

export function createPaymentRunXlsx(data: PaymentRunExportData) {
  const run = data.paymentRun;
  const isBank = run.paymentMethod === "BANK";
  const headers = isBank
    ? ["م", "رقم الطلب", "الإدارة", "نوع الصرف", "الاعتماد التنفيذي", "المستفيد", "البيان", "البنك", "الآيبان", "اسم صاحب الحساب", "المطابقة", "المبلغ", "حالة التنفيذ", "مرجع البنك", "الأولوية", "منفذ العملية", "وقت التنفيذ"]
    : ["م", "رقم الطلب", "الإدارة", "نوع الصرف", "الاعتماد التنفيذي", "مستلم النقد", "نوع المستفيد", "البيان", "المبلغ", "حالة الصرف", "رقم سند / مرجع الاستلام", "الأولوية", "أمين الصندوق / المنفذ", "وقت الصرف"];
  const rows = data.items.filter((item) => item.executionStatus !== "EXCLUDED").map<Cell[]>((item, index) => {
    const request = item.request;
    const executionDate = excelSerial(item.execution?.executedAt || undefined);
    const dateCell: Cell = { value: executionDate ?? "—", style: executionDate == null ? 4 : 7, type: executionDate == null ? "s" : "n" };
    const commonStart: Cell[] = [
      { value: index + 1, style: 4, type: "n" }, { value: request?.requestNumber || "—", style: 4 }, { value: request?.departmentCode || "—", style: 4 },
      { value: request?.expenseType || "—", style: 4 },
      { value: item.executiveApproval?.actorName || item.executiveApproval?.actorEmail || "اعتماد سابق", style: 4 },
    ];
    if (!isBank) return [
      ...commonStart, { value: request?.cashRecipient || request?.beneficiaryName || "—", style: 4 }, { value: request?.beneficiaryType || "—", style: 4 }, { value: request?.purpose || "—", style: 4 },
      { value: item.amountMinor / 100, style: 6, type: "n" }, { value: executionStatusNames[item.executionStatus] || item.executionStatus, style: 4 },
      { value: item.bankReference || "—", style: 4 }, { value: priorityNames[request?.priority || "NORMAL"], style: 4 },
      { value: item.execution?.executedByEmail || "—", style: 4 }, dateCell,
    ];
    return [
      ...commonStart, { value: request?.beneficiaryName || "—", style: 4 }, { value: request?.purpose || "—", style: 4 }, { value: request?.bankName || "—", style: 4 },
      { value: request?.iban || "—", style: 4 }, { value: request?.accountHolderName || "—", style: 4 },
      { value: request?.accountNameMatch === "MATCHED" ? "مطابق" : request?.accountNameMatch ? "غير مطابق" : "—", style: 4 },
      { value: item.amountMinor / 100, style: 6, type: "n" }, { value: executionStatusNames[item.executionStatus] || item.executionStatus, style: 4 }, { value: item.bankReference || "—", style: 4 },
      { value: priorityNames[request?.priority || "NORMAL"], style: 4 }, { value: item.execution?.executedByEmail || "—", style: 4 },
      dateCell,
    ];
  });
  const widths = isBank ? [7, 20, 17, 25, 24, 25, 34, 18, 28, 25, 13, 16, 16, 20, 14, 24, 22] : [7, 20, 18, 25, 24, 26, 18, 34, 16, 18, 24, 14, 26, 22];
  const title = `\u2066T2 · TITO\u2069 | مسير ${isBank ? "التحويلات البنكية" : "الصرف النقدي"}`;
  const subtitle = `${run.runNumber} · ${groupNames[run.settlementGroup] || run.settlementGroup} · ${run.sourceAccount} · ${runStatusNames[run.status] || run.status}`;
  const sheet = sheetXml(title, subtitle, headers, rows, widths, isBank ? 11 : 8);
  const blob = zip(workbookFiles(sheet, `مسير ${run.runNumber} – TITO`));
  const filename = `TITO-${run.runNumber}.xlsx`;
  return { blob, filename };
}

export function downloadPaymentRunXlsx(data: PaymentRunExportData) {
  const result = createPaymentRunXlsx(data);
  download(result.blob, result.filename);
  return result.filename;
}
