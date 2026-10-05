"use client";

type PdfImage = unknown;
type PdfEmbeddedPage = { width: number; height: number };
type PdfPage = {
  drawImage(image: PdfImage, options: Record<string, number>): void;
  drawPage(page: PdfEmbeddedPage, options: Record<string, number>): void;
  drawRectangle(options: Record<string, unknown>): void;
  drawText(text: string, options: Record<string, unknown>): void;
  getWidth(): number;
  getHeight(): number;
};
export type PdfDocument = {
  addPage(size?: [number, number]): PdfPage;
  embedJpg(data: string | ArrayBuffer | Uint8Array): Promise<PdfImage>;
  embedPng(data: string | ArrayBuffer | Uint8Array): Promise<PdfImage>;
  embedPdf(data: ArrayBuffer | Uint8Array, indices?: number[]): Promise<PdfEmbeddedPage[]>;
  embedFont(name: string): Promise<unknown>;
  getPages(): PdfPage[];
  save(options?: Record<string, unknown>): Promise<Uint8Array>;
};
export type PdfLibNamespace = {
  PDFDocument: {
    create(): Promise<PdfDocument>;
    load(data: ArrayBuffer | Uint8Array, options?: Record<string, unknown>): Promise<{ getPageCount(): number }>;
  };
  StandardFonts: { Helvetica: string; HelveticaBold: string };
  rgb(red: number, green: number, blue: number): unknown;
};

declare global {
  interface Window { PDFLib?: PdfLibNamespace }
}

export type ExportAttachment = {
  id: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  uploadedByEmail?: string;
  createdAt?: string;
};

export type RequestExportData = {
  request: {
    id: string; requestNumber: string; createdAt?: string; updatedAt?: string; createdByName: string; departmentCode: string;
    priority: string; categoryCode: string; expenseType: string; beneficiaryName: string; beneficiaryType: string;
    paymentMethod: string; bankName?: string | null; iban?: string | null; accountHolderName?: string | null;
    accountNameMatch?: string | null; accountMismatchReason?: string | null; cashRecipient?: string | null;
    totalDueMinor?: number | null; paidPreviouslyMinor?: number | null; amountMinor: number; purpose: string; details: string;
    status: string; revisionNumber: number;
  };
  attachments: ExportAttachment[];
  actions: Array<{ id: string; action: string; fromStatus?: string | null; toStatus?: string | null; actorName: string; actorEmail: string; note?: string | null; createdAt: string }>;
  currentResponsible?: { label?: string } | string;
};

export type PaymentRunExportData = {
  paymentRun: {
    id: string; runNumber: string; paymentMethod: string; settlementGroup: string; sourceAccount: string; status: string;
    preparedByEmail: string; approvedByEmail?: string | null; approvedAt?: string | null; digitalSignatureCode?: string | null;
    totalMinor: number; itemCount: number; createdAt: string;
  };
  items: Array<{ id: string; amountMinor: number; executionStatus: string; bankReference?: string | null; executiveApproval?: { actorName?: string | null; actorEmail: string; note?: string | null; createdAt: string } | null; execution?: { executedByEmail?: string | null; executedAt?: string | null; executedAmountMinor?: number | null; status?: string | null } | null; request: {
    requestNumber: string; departmentCode: string; expenseType: string; beneficiaryName: string; bankName?: string | null;
    iban?: string | null; accountHolderName?: string | null; accountNameMatch?: string | null; priority: string;
    cashRecipient?: string | null; beneficiaryType?: string | null; purpose?: string | null;
  } | null }>;
  actions: Array<{ id: string; action: string; actorEmail: string; note?: string | null; createdAt: string }>;
};

const RED = "#dc001c";
const DARK = "#17191f";
const MUTED = "#68707d";
const LINE = "#e4e5e8";
const LIGHT_RED = "#fff1f3";
const A4_PORTRAIT: [number, number] = [595.28, 841.89];
const A4_LANDSCAPE: [number, number] = [841.89, 595.28];
const ARABIC_FONT = 'Arial, "Noto Sans Arabic", "Tahoma", sans-serif';
let pdfLibPromise: Promise<PdfLibNamespace> | null = null;

const statusNames: Record<string, string> = {
  DRAFT: "مسودة", PENDING_DEPARTMENT: "بانتظار اعتماد الإدارة", RETURNED_TO_CREATOR: "معاد لمُعدّ الطلب",
  PENDING_ACCOUNTING: "بانتظار مراجعة الحسابات", RETURNED_ACCOUNTING_TO_DEPARTMENT: "معاد من الحسابات للإدارة",
  PENDING_EXECUTIVE: "بانتظار اعتماد المدير التنفيذي",
  READY_FOR_BATCH: "جاهز للمسير", IN_BATCH_DRAFT: "داخل مسير", PENDING_BATCH_APPROVAL: "بانتظار اعتماد المسير",
  READY_FOR_EXECUTION: "جاهز للتنفيذ", EXECUTION_PENDING: "قيد التنفيذ", EXECUTED: "تم التنفيذ",
  EXECUTION_FAILED: "متعذر التنفيذ", REJECTED_FINAL: "مرفوض نهائيًا", CANCELLED: "ملغى",
};
const actionNames: Record<string, string> = {
  SUBMIT: "إرسال الطلب", APPROVE: "اعتماد المرحلة", REAPPROVE: "إعادة الاعتماد", RETURN: "إعادة للمرحلة السابقة",
  REJECT: "رفض نهائي", RESUBMIT: "إعادة إرسال", EDIT_BEFORE_APPROVAL: "تعديل قبل الاعتماد", CANCEL: "إلغاء الطلب",
  SAVE_DRAFT: "حفظ مسودة", UPDATE_DRAFT: "تحديث المسودة",
  REMOVE_ATTACHMENT: "إزالة مرفق قبل الاعتماد",
  ADD_TO_PAYMENT_RUN: "إضافة إلى المسير", REMOVE_FROM_PAYMENT_RUN: "استبعاد من المسير",
  PAYMENT_RUN_SUBMIT: "إرسال المسير", PAYMENT_RUN_RESUBMIT: "إعادة إرسال المسير",
  PAYMENT_RUN_APPROVE: "اعتماد المسير", PAYMENT_RUN_RETURN: "إعادة المسير",
  PAYMENT_RUN_REJECT: "رفض المسير السابق", PAYMENT_RUN_CLOSE: "إغلاق مسير سابق",
  PAYMENT_RUN_AUTO_CLOSE: "إغلاق المسير تلقائيًا", EXECUTE_PAYMENT: "تنفيذ الصرف", EXECUTION_FAILED: "تعذر التنفيذ",
};
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

function loadPdfLib() {
  if (window.PDFLib) return Promise.resolve(window.PDFLib);
  if (pdfLibPromise) return pdfLibPromise;
  const pending = new Promise<PdfLibNamespace>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>('script[data-tito-pdf-lib="true"]');
    const script = existing || document.createElement("script");
    const timer = window.setTimeout(() => reject(new Error("استغرق تجهيز PDF وقتًا طويلًا؛ أعد المحاولة")), 20_000);
    const loaded = () => {
      window.clearTimeout(timer);
      if (window.PDFLib) resolve(window.PDFLib);
      else reject(new Error("تعذر تشغيل محرك PDF"));
    };
    const failed = () => {
      window.clearTimeout(timer);
      script.remove();
      reject(new Error("تعذر تحميل محرك PDF"));
    };
    script.addEventListener("load", loaded, { once: true });
    script.addEventListener("error", failed, { once: true });
    if (!existing) {
      script.src = "/vendor/pdf-lib.min.js";
      script.async = true;
      script.dataset.titoPdfLib = "true";
      document.head.appendChild(script);
    }
  });
  pdfLibPromise = pending.catch((error) => {
    pdfLibPromise = null;
    throw error;
  });
  return pdfLibPromise;
}

function formatMoney(minor?: number | null) {
  return ((minor || 0) / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function arabicInteger(value: number): string {
  const ones = ["صفر", "واحد", "اثنان", "ثلاثة", "أربعة", "خمسة", "ستة", "سبعة", "ثمانية", "تسعة", "عشرة", "أحد عشر", "اثنا عشر", "ثلاثة عشر", "أربعة عشر", "خمسة عشر", "ستة عشر", "سبعة عشر", "ثمانية عشر", "تسعة عشر"];
  const tens = ["", "", "عشرون", "ثلاثون", "أربعون", "خمسون", "ستون", "سبعون", "ثمانون", "تسعون"];
  const hundreds = ["", "مائة", "مائتان", "ثلاثمائة", "أربعمائة", "خمسمائة", "ستمائة", "سبعمائة", "ثمانمائة", "تسعمائة"];
  const underThousand = (number: number) => {
    const parts: string[] = [];
    if (number >= 100) { parts.push(hundreds[Math.floor(number / 100)]); number %= 100; }
    if (number) {
      if (number < 20) parts.push(ones[number]);
      else {
        const unit = number % 10;
        if (unit) parts.push(ones[unit]);
        parts.push(tens[Math.floor(number / 10)]);
      }
    }
    return parts.join(" و");
  };
  if (value === 0) return ones[0];
  const scales: Array<[number, string, string, string]> = [[1_000_000, "مليون", "مليونان", "ملايين"], [1_000, "ألف", "ألفان", "آلاف"]];
  const parts: string[] = [];
  let remaining = Math.floor(value);
  for (const [scale, singular, dual, plural] of scales) {
    const count = Math.floor(remaining / scale);
    if (!count) continue;
    if (count === 1) parts.push(singular);
    else if (count === 2) parts.push(dual);
    else if (count <= 10) parts.push(`${underThousand(count)} ${plural}`);
    else parts.push(`${underThousand(count)} ${singular}`);
    remaining %= scale;
  }
  if (remaining) parts.push(underThousand(remaining));
  return parts.join(" و");
}

function amountInArabic(minor: number) {
  const riyals = Math.floor(minor / 100);
  const halalas = Math.abs(minor % 100);
  return `${arabicInteger(riyals)} ريال سعودي${halalas ? ` و${arabicInteger(halalas)} هللة` : ""} فقط لا غير`;
}

function formatDate(value?: string | null) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("ar-SA", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Riyadh" }).format(new Date(value));
}

function safeFilename(value: string) {
  return value.replace(/[\\/:*?"<>|]+/g, "-").replace(/\s+/g, "-").slice(0, 110);
}

function bytesToArrayBuffer(bytes: Uint8Array) {
  const output = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(output).set(bytes);
  return output;
}

function newCanvas(width: number, height: number) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("تعذر تجهيز صفحة المستند");
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, width, height);
  context.textBaseline = "alphabetic";
  return { canvas, context };
}

function setRtl(context: CanvasRenderingContext2D, font: string, color = DARK) {
  context.direction = "rtl";
  context.textAlign = "right";
  context.font = font;
  context.fillStyle = color;
}

function drawPortraitHeader(context: CanvasRenderingContext2D, title: string, reference: string) {
  context.fillStyle = RED;
  context.fillRect(0, 0, 1240, 190);
  context.direction = "ltr";
  context.textAlign = "left";
  context.font = `900 78px ${ARABIC_FONT}`;
  context.fillStyle = "#ffffff";
  context.fillText("T2", 70, 112);
  context.font = `700 30px ${ARABIC_FONT}`;
  context.fillText("TITO", 255, 84);
  context.font = `500 23px ${ARABIC_FONT}`;
  context.fillText("تيتو · تسوق كل جديد", 255, 122);
  setRtl(context, `700 34px ${ARABIC_FONT}`, "#ffffff");
  context.fillText(title, 1170, 79);
  context.font = `600 23px ${ARABIC_FONT}`;
  context.fillText(reference, 1170, 123);
}

function drawLandscapeHeader(context: CanvasRenderingContext2D, title: string, reference: string) {
  context.fillStyle = RED;
  context.fillRect(0, 0, 1754, 150);
  context.direction = "ltr";
  context.textAlign = "left";
  context.font = `900 68px ${ARABIC_FONT}`;
  context.fillStyle = "#ffffff";
  context.fillText("T2", 68, 94);
  context.font = `700 28px ${ARABIC_FONT}`;
  context.fillText("TITO | تيتو · تسوق كل جديد", 230, 84);
  setRtl(context, `700 32px ${ARABIC_FONT}`, "#ffffff");
  context.fillText(title, 1688, 72);
  context.font = `600 22px ${ARABIC_FONT}`;
  context.fillText(reference, 1688, 108);
}

function drawSectionTitle(context: CanvasRenderingContext2D, title: string, y: number, width = 1100) {
  context.fillStyle = RED;
  context.fillRect(1170, y - 27, 5, 34);
  setRtl(context, `700 25px ${ARABIC_FONT}`);
  context.fillText(title, 1155, y);
  context.strokeStyle = LINE;
  context.beginPath();
  context.moveTo(1170 - width, y + 15);
  context.lineTo(1170, y + 15);
  context.stroke();
  return y + 45;
}

function drawPairGrid(context: CanvasRenderingContext2D, pairs: Array<[string, string]>, startY: number) {
  const cellWidth = 535;
  let y = startY;
  for (let index = 0; index < pairs.length; index += 2) {
    const rowPairs = pairs.slice(index, index + 2);
    setRtl(context, `700 22px ${ARABIC_FONT}`);
    const valueLines = rowPairs.map(([, value]) => wrapLines(context, value || "—", cellWidth - 40));
    const cellHeight = Math.max(92, 66 + Math.max(...valueLines.map((lines) => lines.length)) * 30);
    rowPairs.forEach(([label], column) => {
      const x = column === 0 ? 70 : 635;
      context.fillStyle = "#fafafa";
      context.strokeStyle = LINE;
      context.lineWidth = 2;
      context.beginPath();
      context.roundRect(x, y, cellWidth, cellHeight, 12);
      context.fill();
      context.stroke();
      setRtl(context, `500 18px ${ARABIC_FONT}`, MUTED);
      context.fillText(label, x + cellWidth - 20, y + 29);
      setRtl(context, `700 22px ${ARABIC_FONT}`);
      valueLines[column].forEach((line, lineIndex) => context.fillText(line, x + cellWidth - 20, y + 66 + lineIndex * 30));
    });
    y += cellHeight + 14;
  }
  return y;
}

function drawCompactPairGrid(context: CanvasRenderingContext2D, pairs: Array<[string, string]>, startY: number) {
  const cellWidth = 535;
  const rowHeight = 68;
  let y = startY;
  for (let index = 0; index < pairs.length; index += 2) {
    pairs.slice(index, index + 2).forEach(([label, value], column) => {
      const x = column === 0 ? 70 : 635;
      context.fillStyle = column === 0 ? "#ffffff" : "#fafafa";
      context.strokeStyle = LINE;
      context.lineWidth = 2;
      context.beginPath(); context.roundRect(x, y, cellWidth, rowHeight, 10); context.fill(); context.stroke();
      setRtl(context, `500 15px ${ARABIC_FONT}`, MUTED);
      context.fillText(label, x + cellWidth - 16, y + 23);
      setRtl(context, `700 18px ${ARABIC_FONT}`);
      const lines = wrapLines(context, value || "—", cellWidth - 32);
      lines.slice(0, 2).forEach((line, lineIndex) => context.fillText(line, x + cellWidth - 16, y + 50 + lineIndex * 18));
    });
    y += rowHeight + 8;
  }
  return y;
}

function drawFixedTextBox(context: CanvasRenderingContext2D, label: string, text: string, y: number, height: number) {
  context.fillStyle = "#ffffff";
  context.strokeStyle = LINE;
  context.lineWidth = 2;
  context.beginPath(); context.roundRect(70, y, 1100, height, 12); context.fill(); context.stroke();
  setRtl(context, `700 16px ${ARABIC_FONT}`, RED);
  context.fillText(label, 1145, y + 26);
  let size = 19;
  let lineHeight = 25;
  let lines: string[] = [];
  const maxHeight = height - 48;
  while (size >= 10) {
    setRtl(context, `500 ${size}px ${ARABIC_FONT}`);
    lines = wrapLines(context, text || "—", 1040);
    lineHeight = Math.ceil(size * 1.35);
    if (lines.length * lineHeight <= maxHeight) break;
    size -= 1;
  }
  setRtl(context, `500 ${size}px ${ARABIC_FONT}`);
  lines.forEach((line, index) => context.fillText(line, 1140, y + 49 + index * lineHeight));
  return y + height + 10;
}

function latestAction(data: RequestExportData, predicate: (action: RequestExportData["actions"][number]) => boolean) {
  return [...data.actions].reverse().find(predicate);
}

function drawWorkflowSummary(context: CanvasRenderingContext2D, data: RequestExportData, y: number) {
  const stages = [
    { title: "إعداد الطلب", action: latestAction(data, (item) => ["SUBMIT", "RESUBMIT", "SAVE_DRAFT"].includes(item.action)), fallback: data.request.createdByName },
    { title: "اعتماد الإدارة", action: latestAction(data, (item) => item.toStatus === "PENDING_ACCOUNTING"), fallback: "بانتظار الاعتماد" },
    { title: "مراجعة الحسابات", action: latestAction(data, (item) => item.fromStatus === "PENDING_ACCOUNTING" && ["PENDING_EXECUTIVE", "RETURNED_ACCOUNTING_TO_DEPARTMENT", "REJECTED_FINAL"].includes(item.toStatus || "")), fallback: "بانتظار المراجعة" },
    { title: "اعتماد المدير التنفيذي", action: latestAction(data, (item) => item.fromStatus === "PENDING_EXECUTIVE" && ["READY_FOR_BATCH", "PENDING_ACCOUNTING", "REJECTED_FINAL"].includes(item.toStatus || "")), fallback: "بانتظار الاعتماد التنفيذي" },
    { title: "المسير والتنفيذ", action: latestAction(data, (item) => ["ADD_TO_PAYMENT_RUN", "EXECUTE_PAYMENT", "PAYMENT_RUN_AUTO_CLOSE", "PAYMENT_RUN_CLOSE"].includes(item.action)), fallback: "بانتظار المسير" },
  ];
  stages.forEach((stage, index) => {
    const firstRow = index < 3;
    const column = firstRow ? index : index - 3;
    const cardWidth = firstRow ? 350 : 535;
    const x = firstRow ? 70 + column * 375 : 70 + column * 565;
    const cardY = y + (firstRow ? 0 : 118);
    context.fillStyle = index >= 3 ? LIGHT_RED : "#fafafa";
    context.strokeStyle = index >= 3 ? "#f5b8c0" : LINE;
    context.lineWidth = 2;
    context.beginPath(); context.roundRect(x, cardY, cardWidth, 104, 12); context.fill(); context.stroke();
    setRtl(context, `700 15px ${ARABIC_FONT}`, RED); context.fillText(stage.title, x + cardWidth - 16, cardY + 25);
    const actor = stage.action?.actorName || stage.fallback;
    setRtl(context, `700 16px ${ARABIC_FONT}`); wrapLines(context, actor, cardWidth - 32).slice(0, 1).forEach((line) => context.fillText(line, x + cardWidth - 16, cardY + 52));
    const decision = stage.action ? `${actionNames[stage.action.action] || stage.action.action} · ${formatDate(stage.action.createdAt)}` : statusNames[data.request.status] || data.request.status;
    setRtl(context, `500 13px ${ARABIC_FONT}`, MUTED); wrapLines(context, decision, cardWidth - 32).slice(0, 2).forEach((line, lineIndex) => context.fillText(line, x + cardWidth - 16, cardY + 78 + lineIndex * 16));
  });
  return y + 236;
}

function wrapLines(context: CanvasRenderingContext2D, text: string, maxWidth: number) {
  const paragraphs = String(text || "—").split(/\n/);
  const lines: string[] = [];
  for (const paragraph of paragraphs) {
    const words = paragraph.trim().split(/\s+/).filter(Boolean).flatMap((word) => {
      if (context.measureText(word).width <= maxWidth) return [word];
      const chunks: string[] = [];
      let chunk = "";
      for (const character of Array.from(word)) {
        if (chunk && context.measureText(`${chunk}${character}`).width > maxWidth) {
          chunks.push(chunk);
          chunk = character;
        } else chunk += character;
      }
      if (chunk) chunks.push(chunk);
      return chunks;
    });
    if (!words.length) { lines.push(""); continue; }
    let line = words[0];
    for (const word of words.slice(1)) {
      const candidate = `${line} ${word}`;
      if (context.measureText(candidate).width <= maxWidth) line = candidate;
      else { lines.push(line); line = word; }
    }
    lines.push(line);
  }
  return lines;
}

function drawParagraphBox(context: CanvasRenderingContext2D, label: string, text: string, y: number) {
  setRtl(context, `500 19px ${ARABIC_FONT}`, MUTED);
  context.fillText(label, 1150, y + 27);
  setRtl(context, `500 23px ${ARABIC_FONT}`);
  const lines = wrapLines(context, text, 1030);
  const height = 70 + lines.length * 35;
  context.fillStyle = "#ffffff";
  context.strokeStyle = LINE;
  context.lineWidth = 2;
  context.beginPath();
  context.roundRect(70, y, 1100, height, 14);
  context.fill();
  context.stroke();
  setRtl(context, `500 23px ${ARABIC_FONT}`);
  lines.forEach((line, index) => context.fillText(line, 1150, y + 68 + index * 35));
  return y + height + 22;
}

function drawCanvasFooter(context: CanvasRenderingContext2D, reference: string, width: number, height: number) {
  context.strokeStyle = LINE;
  context.beginPath();
  context.moveTo(60, height - 102);
  context.lineTo(width - 60, height - 102);
  context.stroke();
  context.direction = "ltr";
  context.textAlign = "left";
  context.fillStyle = MUTED;
  context.font = `500 16px ${ARABIC_FONT}`;
  context.fillText(`TITO · ${reference}`, 70, height - 70);
  setRtl(context, `500 16px ${ARABIC_FONT}`, MUTED);
  context.fillText("وثيقة إلكترونية رسمية · سجل التدقيق محفوظ", width - 70, height - 70);
}

async function canvasToJpeg(canvas: HTMLCanvasElement) {
  return new Promise<Blob>((resolve, reject) => canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("تعذر إنشاء صفحة PDF")), "image/jpeg", 0.92));
}

async function addCanvasPage(pdf: PdfDocument, canvas: HTMLCanvasElement, size: [number, number]) {
  const blob = await canvasToJpeg(canvas);
  const image = await pdf.embedJpg(await blob.arrayBuffer());
  const page = pdf.addPage(size);
  page.drawImage(image, { x: 0, y: 0, width: size[0], height: size[1] });
}

function createPortraitFlowPage(title: string, reference: string) {
  const page = newCanvas(1240, 1754);
  drawPortraitHeader(page.context, title, reference);
  drawCanvasFooter(page.context, reference, 1240, 1754);
  return page;
}

function requestNarrativePages(data: RequestExportData) {
  const request = data.request;
  const sections: Array<[string, string]> = [
    ["الغرض من الصرف", request.purpose],
    ["البيان التفصيلي", request.details],
  ];
  if (request.accountNameMatch === "MISMATCHED") sections.push(["سبب عدم مطابقة اسم الحساب", request.accountMismatchReason || "يلزم التحقق"]);
  const pages: HTMLCanvasElement[] = [];
  let page = createPortraitFlowPage("الغرض والبيان", request.requestNumber);
  let y = 245;
  let pageIndex = 0;
  const pushPage = () => {
    pages.push(page.canvas);
    pageIndex += 1;
    page = createPortraitFlowPage("استكمال الغرض والبيان", request.requestNumber);
    y = 245;
  };
  sections.forEach(([label, value]) => {
    setRtl(page.context, `500 23px ${ARABIC_FONT}`);
    const remaining = wrapLines(page.context, value || "—", 1030);
    let part = 1;
    while (remaining.length) {
      if (y > 1480) pushPage();
      const sectionLabel = part === 1 ? label : `${label} — تابع (${part})`;
      y = drawSectionTitle(page.context, sectionLabel, y);
      const availableLines = Math.max(1, Math.floor((1570 - y - 70) / 35));
      const chunk = remaining.splice(0, availableLines);
      const boxHeight = 70 + chunk.length * 35;
      page.context.fillStyle = "#ffffff";
      page.context.strokeStyle = LINE;
      page.context.lineWidth = 2;
      page.context.beginPath();
      page.context.roundRect(70, y, 1100, boxHeight, 14);
      page.context.fill();
      page.context.stroke();
      setRtl(page.context, `500 23px ${ARABIC_FONT}`);
      chunk.forEach((line, lineIndex) => page.context.fillText(line, 1140, y + 55 + lineIndex * 35));
      y += boxHeight + 30;
      part += 1;
      if (remaining.length) pushPage();
    }
  });
  if (pageIndex || y > 245) pages.push(page.canvas);
  return pages;
}

function requestActionPages(data: RequestExportData) {
  const request = data.request;
  const pages: HTMLCanvasElement[] = [];
  let page = createPortraitFlowPage("الاعتمادات والتوصيات", request.requestNumber);
  let y = drawSectionTitle(page.context, "السجل الزمني الكامل", 245);
  const pushPage = () => {
    pages.push(page.canvas);
    page = createPortraitFlowPage("استكمال سجل الاعتمادات", request.requestNumber);
    y = drawSectionTitle(page.context, "السجل الزمني الكامل — تابع", 245);
  };
  if (!data.actions.length) {
    setRtl(page.context, `500 23px ${ARABIC_FONT}`, MUTED);
    page.context.fillText("لم تُسجل اعتمادات إضافية بعد.", 1140, y + 45);
  } else {
    data.actions.forEach((action) => {
      setRtl(page.context, `500 20px ${ARABIC_FONT}`);
      const noteLines = wrapLines(page.context, action.note || "تم تسجيل الإجراء دون ملاحظة", 1030);
      const chunks: string[][] = [];
      for (let offset = 0; offset < noteLines.length; offset += 8) chunks.push(noteLines.slice(offset, offset + 8));
      chunks.forEach((lines, chunkIndex) => {
        setRtl(page.context, `600 21px ${ARABIC_FONT}`);
        const actorLines = chunkIndex ? [] : wrapLines(page.context, `${action.actorName} · ${action.actorEmail}`, 1030);
        const cardHeight = 145 + actorLines.length * 28 + lines.length * 28;
        if (y + cardHeight > 1580) pushPage();
        page.context.fillStyle = "#ffffff";
        page.context.strokeStyle = LINE;
        page.context.beginPath();
        page.context.roundRect(70, y, 1100, cardHeight, 14);
        page.context.fill();
        page.context.stroke();
        setRtl(page.context, `700 23px ${ARABIC_FONT}`, RED);
        page.context.fillText(`${actionNames[action.action] || action.action}${chunkIndex ? ` — تابع (${chunkIndex + 1})` : ""}`, 1140, y + 38);
        setRtl(page.context, `600 21px ${ARABIC_FONT}`);
        actorLines.forEach((line, lineIndex) => page.context.fillText(line, 1140, y + 75 + lineIndex * 28));
        const dateY = y + 80 + actorLines.length * 28;
        setRtl(page.context, `500 19px ${ARABIC_FONT}`, MUTED);
        page.context.fillText(formatDate(action.createdAt), 1140, dateY);
        setRtl(page.context, `500 20px ${ARABIC_FONT}`);
        lines.forEach((line, lineIndex) => page.context.fillText(line, 1140, dateY + 37 + lineIndex * 28));
        y += cardHeight + 18;
      });
    });
  }
  pages.push(page.canvas);
  return pages;
}

function requestAttachmentIndexPages(data: RequestExportData) {
  if (!data.attachments.length) return [];
  const request = data.request;
  const pages: HTMLCanvasElement[] = [];
  let page = createPortraitFlowPage("فهرس المرفقات", request.requestNumber);
  let y = drawSectionTitle(page.context, `المستندات المرتبطة (${data.attachments.length})`, 245);
  const pushPage = () => {
    pages.push(page.canvas);
    page = createPortraitFlowPage("استكمال فهرس المرفقات", request.requestNumber);
    y = drawSectionTitle(page.context, `المستندات المرتبطة (${data.attachments.length}) — تابع`, 245);
  };
  data.attachments.forEach((file, index) => {
    setRtl(page.context, `600 19px ${ARABIC_FONT}`);
    const filenameLines = wrapLines(page.context, `${index + 1}. ${file.originalName}`, 1030);
    page.context.direction = "ltr";
    page.context.textAlign = "left";
    page.context.font = `500 15px ${ARABIC_FONT}`;
    const metadataLines = wrapLines(page.context, `${file.mimeType} · ${Math.max(1, Math.round(file.sizeBytes / 1024))} KB · ${file.uploadedByEmail || "TITO"} · ${formatDate(file.createdAt)}`, 1030);
    const rowHeight = 38 + filenameLines.length * 27 + metadataLines.length * 23;
    if (y + rowHeight > 1580) pushPage();
    page.context.fillStyle = index % 2 ? "#fafafa" : "#ffffff";
    page.context.strokeStyle = LINE;
    page.context.fillRect(70, y, 1100, rowHeight);
    page.context.strokeRect(70, y, 1100, rowHeight);
    setRtl(page.context, `600 19px ${ARABIC_FONT}`);
    filenameLines.forEach((line, lineIndex) => page.context.fillText(line, 1140, y + 31 + lineIndex * 27));
    page.context.direction = "ltr";
    page.context.textAlign = "left";
    page.context.font = `500 15px ${ARABIC_FONT}`;
    page.context.fillStyle = MUTED;
    metadataLines.forEach((line, lineIndex) => page.context.fillText(line, 82, y + 31 + filenameLines.length * 27 + lineIndex * 23));
    y += rowHeight + 10;
  });
  pages.push(page.canvas);
  return pages;
}

function requestFormPages(data: RequestExportData) {
  const request = data.request;
  const first = createPortraitFlowPage("طلب صرف مالي", request.requestNumber);
  let y = 218;
  const responsible = typeof data.currentResponsible === "string" ? data.currentResponsible : data.currentResponsible?.label || "—";
  y = drawCompactPairGrid(first.context, [
    ["تاريخ الطلب", formatDate(request.createdAt)], ["مُعدّ الطلب", request.createdByName],
    ["الإدارة", request.departmentCode], ["الحالة الحالية", statusNames[request.status] || request.status],
    ["الأولوية", request.priority], ["المسؤول الحالي", responsible],
  ], y);
  y = drawSectionTitle(first.context, "بيانات الطلب والمستفيد", y + 2);
  y = drawCompactPairGrid(first.context, [
    ["نوع الصرف", request.expenseType], ["المستفيد", request.beneficiaryName],
    ["طريقة الصرف", request.paymentMethod === "BANK" ? "تحويل بنكي" : "نقدًا من الصندوق"],
    ["مبلغ الصرف", `${formatMoney(request.amountMinor)} ر.س`],
    ...(request.paymentMethod === "BANK" ? [
      ["البنك", request.bankName || "—"], ["رقم الآيبان", request.iban || "—"],
      ["اسم صاحب الحساب", request.accountHolderName || "—"],
      ["مطابقة اسم الحساب", request.accountNameMatch === "MATCHED" ? "✓ مطابق لاسم المستفيد" : `غير مطابق · ${request.accountMismatchReason || "يلزم التحقق"}`],
    ] as Array<[string, string]> : [["مستلم النقد", request.cashRecipient || request.beneficiaryName], ["نوع المستفيد", request.beneficiaryType]] as Array<[string, string]>),
  ], y);
  y = drawSectionTitle(first.context, "البيان المالي", y + 2);
  const settlement = request.totalDueMinor != null || request.paidPreviouslyMinor != null
    ? `إجمالي الاستحقاق ${formatMoney(request.totalDueMinor)} ر.س · المدفوع سابقًا ${formatMoney(request.paidPreviouslyMinor)} ر.س · المطلوب الآن ${formatMoney(request.amountMinor)} ر.س`
    : `المطلوب صرفه الآن ${formatMoney(request.amountMinor)} ر.س`;
  y = drawFixedTextBox(first.context, "ملخص المبلغ", settlement, y, 76);
  y = drawFixedTextBox(first.context, "الغرض من الصرف", request.purpose, y, 76);
  y = drawFixedTextBox(first.context, "البيان التفصيلي", request.details, y, request.accountNameMatch === "MISMATCHED" ? 182 : 220);
  if (request.accountNameMatch === "MISMATCHED") y = drawFixedTextBox(first.context, "مبرر عدم مطابقة اسم الحساب", request.accountMismatchReason || "يلزم التحقق من مستند التفويض المرفق", y, 76);
  y = drawSectionTitle(first.context, "الدورة المستندية والاعتمادات", y + 2);
  y = drawWorkflowSummary(first.context, data, y);
  first.context.fillStyle = "#fafafa"; first.context.strokeStyle = LINE; first.context.beginPath(); first.context.roundRect(70, y, 1100, 58, 10); first.context.fill(); first.context.stroke();
  setRtl(first.context, `600 15px ${ARABIC_FONT}`, MUTED);
  first.context.fillText(data.attachments.length ? `المرفقات: ${data.attachments.length} · تلي هذه الصفحة بالترتيب داخل الملف نفسه` : "لا توجد مرفقات مرتبطة بهذا الطلب", 1140, y + 35);
  return [first.canvas];
}

function loadCanvasImage(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("تعذر تحميل أصل الهوية"));
    image.src = src;
  });
}

async function requestVoucherPage(data: RequestExportData) {
  const request = data.request;
  const page = newCanvas(1754, 1240);
  const { context } = page;
  const right = 1670;
  const dateText = formatDate(request.createdAt);
  context.strokeStyle = RED;
  context.lineWidth = 3;
  context.beginPath(); context.moveTo(460, 105); context.lineTo(1410, 105); context.stroke();

  context.direction = "ltr"; context.textAlign = "left";
  context.fillStyle = RED; context.fillRect(55, 45, 150, 68);
  context.font = `900 42px ${ARABIC_FONT}`; context.fillStyle = "#fff"; context.fillText("TITO", 75, 92);
  context.font = `800 43px ${ARABIC_FONT}`; context.fillStyle = RED; context.fillText("تيتو", 230, 94);

  context.fillStyle = RED; context.beginPath(); context.roundRect(1550, 38, 118, 92, 16); context.fill();
  context.fillStyle = "#fff"; context.font = `900 54px ${ARABIC_FONT}`; context.textAlign = "center"; context.fillText("T2", 1609, 102);
  setRtl(context, `700 17px ${ARABIC_FONT}`); context.fillText("شركة لجين ينبع للتجارة", right, 154);
  context.direction = "ltr"; context.textAlign = "right"; context.font = `500 14px ${ARABIC_FONT}`; context.fillStyle = MUTED; context.fillText("Lujain Yanbu Trading Co.", right, 177);

  setRtl(context, `900 74px ${ARABIC_FONT}`, RED); context.textAlign = "center"; context.fillText("سند صرف", 880, 182);
  context.direction = "ltr"; context.textAlign = "center"; context.font = `700 26px ${ARABIC_FONT}`; context.fillStyle = DARK; context.fillText("PAYMENT VOUCHER", 880, 220);
  context.strokeStyle = RED; context.lineWidth = 3; context.beginPath(); context.moveTo(685, 238); context.lineTo(1075, 238); context.stroke();

  setRtl(context, `700 20px ${ARABIC_FONT}`, RED); context.fillText("رقم السند", 1445, 205);
  context.direction = "ltr"; context.textAlign = "center"; context.fillStyle = "#f3f3f4"; context.fillRect(1455, 215, 210, 52);
  context.fillStyle = DARK; context.font = `700 22px ${ARABIC_FONT}`; context.fillText(request.requestNumber, 1560, 248);

  context.strokeStyle = RED; context.lineWidth = 2; context.beginPath(); context.roundRect(55, 250, 370, 85, 10); context.stroke();
  setRtl(context, `800 26px ${ARABIC_FONT}`, RED); context.fillText("ريال", 140, 292);
  context.direction = "ltr"; context.textAlign = "center"; context.font = `700 26px ${ARABIC_FONT}`; context.fillStyle = DARK; context.fillText(formatMoney(request.amountMinor), 285, 302);

  const fields: Array<[string, string, string]> = [
    ["التاريخ", "Date", dateText],
    ["أصرفه للمستفيد", "Pay to Beneficiary", request.beneficiaryName],
    ["مبلغ وقدره", "Amount in Words", amountInArabic(request.amountMinor)],
    ["وذلك مقابل", "For", `${request.purpose} — ${request.details}`],
    ["طريقة الصرف", "Payment Method", request.paymentMethod === "BANK" ? `تحويل بنكي · ${request.bankName || "—"} · ${request.iban || "—"}` : `نقدًا من الصندوق · المستلم: ${request.cashRecipient || request.beneficiaryName}`],
  ];
  let y = 325;
  fields.forEach(([label, english, value], index) => {
    const height = index === 3 ? 120 : index === 4 ? 80 : 74;
    setRtl(context, `800 24px ${ARABIC_FONT}`, RED); context.fillText(label, right, y + 27);
    context.direction = "ltr"; context.textAlign = "right"; context.font = `500 14px ${ARABIC_FONT}`; context.fillStyle = MUTED; context.fillText(english, right, y + 48);
    context.strokeStyle = "#babcc2"; context.lineWidth = 1.5; context.setLineDash([3, 5]); context.beginPath(); context.moveTo(260, y + height - 12); context.lineTo(1440, y + height - 12); context.stroke(); context.setLineDash([]);
    setRtl(context, `${index === 1 ? "800" : "600"} 22px ${ARABIC_FONT}`, DARK);
    wrapLines(context, value, 1130).slice(0, index === 3 ? 3 : 2).forEach((line, lineIndex) => context.fillText(line, 1415, y + 34 + lineIndex * 30));
    y += height;
  });

  context.fillStyle = "#fff1f3"; context.globalAlpha = .72; context.beginPath(); context.roundRect(55, 420, 200, 200, 18); context.fill(); context.globalAlpha = 1;
  context.direction = "ltr"; context.textAlign = "center"; context.font = `900 92px ${ARABIC_FONT}`; context.fillStyle = "#f4b7bf"; context.fillText("T2", 155, 545);
  context.font = `800 27px ${ARABIC_FONT}`; context.fillText("TITO", 155, 585);

  try {
    const qr = await loadCanvasImage("/tito-official-qr.jpeg");
    context.drawImage(qr, 55, 765, 185, 185);
    context.strokeStyle = RED; context.lineWidth = 3; context.strokeRect(51, 761, 193, 193);
  } catch { /* keep voucher usable if the QR asset is temporarily unavailable */ }

  const signatures = [
    ["التسجيل والاعتماد", "Recording & Approval", request.createdByName],
    ["أمين الصندوق / منفذ التحويل", "Cashier / Executor", data.actions.find((action) => action.action === "EXECUTE_PAYMENT")?.actorName || "بانتظار التنفيذ"],
    ["المستلم", "Receiver", request.cashRecipient || request.beneficiaryName],
  ];
  signatures.forEach(([label, english, value], index) => {
    const x = 300 + index * 440;
    if (index) { context.strokeStyle = "#9da0a8"; context.beginPath(); context.moveTo(x - 30, 795); context.lineTo(x - 30, 975); context.stroke(); }
    setRtl(context, `800 24px ${ARABIC_FONT}`); context.textAlign = "center"; context.fillText(label, x + 180, 825);
    context.direction = "ltr"; context.textAlign = "center"; context.font = `500 15px ${ARABIC_FONT}`; context.fillStyle = MUTED; context.fillText(english, x + 180, 850);
    setRtl(context, `600 17px ${ARABIC_FONT}`, DARK); context.textAlign = "center"; wrapLines(context, value, 340).slice(0, 2).forEach((line, lineIndex) => context.fillText(line, x + 180, 900 + lineIndex * 24));
    context.strokeStyle = "#9da0a8"; context.setLineDash([3, 4]); context.beginPath(); context.moveTo(x + 30, 950); context.lineTo(x + 330, 950); context.stroke(); context.setLineDash([]);
  });

  context.strokeStyle = RED; context.lineWidth = 3; context.beginPath(); context.moveTo(55, 1015); context.lineTo(1690, 1015); context.stroke();
  setRtl(context, `800 24px ${ARABIC_FONT}`, RED); context.fillText("تسوق كل جديد", 1690, 1055);
  context.direction = "ltr"; context.textAlign = "right"; context.font = `500 15px ${ARABIC_FONT}`; context.fillStyle = MUTED; context.fillText("Shop Every New", 1690, 1080);
  setRtl(context, `600 16px ${ARABIC_FONT}`, MUTED); context.fillText(`الحالة: ${statusNames[request.status] || request.status} · الإدارة: ${request.departmentCode} · المرفقات: ${data.attachments.length}`, 1690, 1135);
  return page.canvas;
}

async function imageFromBlob(blob: Blob) {
  if ("createImageBitmap" in window) return createImageBitmap(blob);
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const image = new Image();
    image.onload = () => { URL.revokeObjectURL(url); resolve(image); };
    image.onerror = () => { URL.revokeObjectURL(url); reject(new Error("تعذر قراءة الصورة")); };
    image.src = url;
  });
}

async function appendAttachmentNoticePage(pdf: PdfDocument, data: RequestExportData, file: ExportAttachment, index: number, note: string) {
  const page = newCanvas(1240, 1754);
  drawPortraitHeader(page.context, `مرفق ${index + 1}`, data.request.requestNumber);
  let y = drawSectionTitle(page.context, "بيانات المستند المرفق", 270);
  y = drawPairGrid(page.context, [
    ["اسم الملف", file.originalName],
    ["نوع الملف", file.mimeType],
    ["الحجم", `${Math.max(1, Math.round(file.sizeBytes / 1024))} KB`],
    ["تاريخ الرفع", formatDate(file.createdAt)],
    ["رُفع بواسطة", file.uploadedByEmail || "مستخدم TITO"],
    ["حالة الحفظ", "محفوظ دائمًا ومرتبط بالطلب"],
  ], y);
  drawParagraphBox(page.context, "ملاحظة المعاينة", note, y + 30);
  drawCanvasFooter(page.context, data.request.requestNumber, 1240, 1754);
  await addCanvasPage(pdf, page.canvas, A4_PORTRAIT);
}

async function createEmbeddedAttachmentHeader(pdf: PdfDocument, data: RequestExportData, index: number, pageCount: number) {
  const header = newCanvas(1240, 140);
  header.context.fillStyle = RED;
  header.context.fillRect(0, 0, 1240, 140);
  header.context.direction = "ltr";
  header.context.textAlign = "left";
  header.context.fillStyle = "#ffffff";
  header.context.font = `900 54px ${ARABIC_FONT}`;
  header.context.fillText("T2", 45, 83);
  header.context.font = `700 25px ${ARABIC_FONT}`;
  header.context.fillText("TITO", 165, 63);
  header.context.font = `500 18px ${ARABIC_FONT}`;
  header.context.fillText(data.request.requestNumber, 165, 96);
  setRtl(header.context, `700 24px ${ARABIC_FONT}`, "#ffffff");
  header.context.fillText(`مستند مرفق رقم ${index + 1}`, 1190, 55);
  header.context.font = `500 17px ${ARABIC_FONT}`;
  header.context.fillText(`${pageCount} صفحة · اسم الملف موثق كاملًا في الفهرس`, 1190, 96);
  const blob = await canvasToJpeg(header.canvas);
  return pdf.embedJpg(await blob.arrayBuffer());
}

async function appendAttachments(pdf: PdfDocument, pdfLib: PdfLibNamespace, data: RequestExportData, onProgress?: (message: string) => void) {
  for (let index = 0; index < data.attachments.length; index += 1) {
    const file = data.attachments[index];
    onProgress?.(`جارٍ إرفاق المستند ${index + 1} من ${data.attachments.length}`);
    let response: Response;
    try {
      response = await fetch(`/api/files/${file.id}`, { cache: "no-store" });
    } catch {
      throw new Error(`تعذر جلب المرفق «${file.originalName}». لم يُنشأ PDF ناقص؛ تحقق من الاتصال ثم أعد المحاولة.`);
    }
    if (!response.ok) throw new Error(`تعذر جلب المرفق «${file.originalName}» (رمز ${response.status}). لم يُنشأ PDF ناقص.`);
    const blob = await response.blob();
    if (!blob.size) throw new Error(`المرفق «${file.originalName}» فارغ أو غير متاح. لم يُنشأ PDF ناقص.`);
    if (file.mimeType.startsWith("image/")) {
      const page = newCanvas(1240, 1754);
      drawPortraitHeader(page.context, `مرفق ${index + 1}`, data.request.requestNumber);
      setRtl(page.context, `700 25px ${ARABIC_FONT}`);
      const filenameLines = wrapLines(page.context, file.originalName, 1080);
      filenameLines.forEach((line, lineIndex) => page.context.fillText(line, 1160, 242 + lineIndex * 31));
      const image = await imageFromBlob(blob);
      const sourceWidth = image.width;
      const sourceHeight = image.height;
      const imageTop = 270 + filenameLines.length * 31;
      const imageAreaHeight = Math.max(200, 1580 - imageTop);
      const scale = Math.min(1, 1080 / sourceWidth, imageAreaHeight / sourceHeight);
      const width = sourceWidth * scale;
      const height = sourceHeight * scale;
      page.context.drawImage(image, (1240 - width) / 2, imageTop + (imageAreaHeight - height) / 2, width, height);
      if ("close" in image && typeof image.close === "function") image.close();
      drawCanvasFooter(page.context, data.request.requestNumber, 1240, 1754);
      await addCanvasPage(pdf, page.canvas, A4_PORTRAIT);
    } else if (file.mimeType === "application/pdf") {
      const bytes = await blob.arrayBuffer();
      try {
        const source = await pdfLib.PDFDocument.load(bytes, { ignoreEncryption: true });
        const indices = Array.from({ length: source.getPageCount() }, (_, pageIndex) => pageIndex);
        const embedded = await pdf.embedPdf(bytes, indices);
        const header = await createEmbeddedAttachmentHeader(pdf, data, index, embedded.length);
        for (const embeddedPage of embedded) {
          const wrapper = pdf.addPage(A4_PORTRAIT);
          wrapper.drawImage(header, { x: 0, y: 774, width: A4_PORTRAIT[0], height: 68 });
          wrapper.drawRectangle({ x: 28, y: 38, width: A4_PORTRAIT[0] - 56, height: 0.7, color: pdfLib.rgb(0.89, 0.9, 0.92) });
          const scale = Math.min(539 / embeddedPage.width, 710 / embeddedPage.height);
          const width = embeddedPage.width * scale;
          const height = embeddedPage.height * scale;
          wrapper.drawPage(embeddedPage, { x: (A4_PORTRAIT[0] - width) / 2, y: 48 + (710 - height) / 2, width, height });
        }
      } catch {
        await appendAttachmentNoticePage(pdf, data, file, index, "تعذر دمج صفحات هذا الـPDF لأنه محمي أو تالف؛ يبقى الملف الأصلي محفوظًا ومتاحًا داخل الطلب.");
      }
    } else {
      await appendAttachmentNoticePage(pdf, data, file, index, "هذا النوع لا يتحول بصريًا داخل PDF. أُدرجت بياناته هنا، ويبقى ملفه الأصلي Word أو Excel محفوظًا وقابلًا للتحميل من الطلب.");
    }
  }
}

async function addPageNumbers(pdf: PdfDocument, pdfLib: PdfLibNamespace, reference: string) {
  const font = await pdf.embedFont(pdfLib.StandardFonts.Helvetica);
  const pages = pdf.getPages();
  pages.forEach((page, index) => {
    page.drawText(`${reference}  |  ${index + 1} / ${pages.length}`, { x: 26, y: 16, size: 8, font, color: pdfLib.rgb(0.38, 0.4, 0.44) });
    page.drawText("T2 | TITO", { x: page.getWidth() - 66, y: 16, size: 8, font, color: pdfLib.rgb(0.863, 0, 0.11) });
  });
}

export async function fetchRequestExportData(requestId: string) {
  const response = await fetch(`/api/requests/${requestId}`, { cache: "no-store" });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "تعذر تحميل بيانات الطلب");
  return { ...data, attachments: data.attachments || [] } as RequestExportData;
}

export async function createRequestPdfFromData(data: RequestExportData, onProgress?: (message: string) => void) {
  onProgress?.("جارٍ تجهيز نموذج TITO");
  const pdfLib = await loadPdfLib();
  const pdf = await pdfLib.PDFDocument.create();
  await addCanvasPage(pdf, await requestVoucherPage(data), A4_LANDSCAPE);
  await appendAttachments(pdf, pdfLib, data, onProgress);
  await addPageNumbers(pdf, pdfLib, data.request.requestNumber);
  const bytes = await pdf.save({ useObjectStreams: true });
  return new Blob([bytesToArrayBuffer(bytes)], { type: "application/pdf" });
}

export async function createRequestPdf(requestId: string, onProgress?: (message: string) => void) {
  const data = await fetchRequestExportData(requestId);
  return { blob: await createRequestPdfFromData(data, onProgress), data };
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.rel = "noopener";
  anchor.style.display = "none";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

export async function downloadRequestPdf(requestId: string, onProgress?: (message: string) => void) {
  const result = await createRequestPdf(requestId, onProgress);
  const filename = `سند-صرف-${safeFilename(result.data.request.beneficiaryName)}-${safeFilename(result.data.request.requestNumber)}.pdf`;
  downloadBlob(result.blob, filename);
  return filename;
}

export async function previewRequestPdf(requestId: string, onProgress?: (message: string) => void) {
  const preview = window.open("about:blank", "_blank");
  if (!preview) throw new Error("اسمح بفتح نافذة المعاينة ثم أعد المحاولة");
  try {
    const result = await createRequestPdf(requestId, onProgress);
    const url = URL.createObjectURL(result.blob);
    preview.location.href = url;
    window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
  } catch (error) {
    preview.close();
    throw error;
  }
}

export async function shareRequestPdf(requestId: string, onProgress?: (message: string) => void) {
  const result = await createRequestPdf(requestId, onProgress);
  const filename = `سند-صرف-${safeFilename(result.data.request.beneficiaryName)}-${safeFilename(result.data.request.requestNumber)}.pdf`;
  const file = new File([result.blob], filename, { type: "application/pdf" });
  if (navigator.share && navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file] });
      return { shared: true, downloaded: false, filename };
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") throw error;
      downloadBlob(result.blob, filename);
      return { shared: false, downloaded: true, filename };
    }
  }
  downloadBlob(result.blob, filename);
  return { shared: false, downloaded: true, filename };
}

type RunColumn = { label: string; width: number };
type RunRow = { item: PaymentRunExportData["items"][number]; values: string[]; lines: string[][]; height: number };

function paymentRunColumns(isBank: boolean): RunColumn[] {
  return isBank ? [
    { label: "م", width: 48 }, { label: "رقم الطلب", width: 135 }, { label: "الإدارة / النوع", width: 170 },
    { label: "اعتماد تنفيذي", width: 130 }, { label: "المستفيد", width: 165 }, { label: "البيان", width: 215 }, { label: "البنك", width: 105 },
    { label: "الآيبان", width: 230 }, { label: "المطابقة", width: 95 }, { label: "المبلغ", width: 125 },
    { label: "المرجع / الحالة", width: 170 },
  ] : [
    { label: "م", width: 55 }, { label: "رقم الطلب", width: 155 }, { label: "الإدارة / النوع", width: 210 },
    { label: "اعتماد تنفيذي", width: 170 }, { label: "مستلم النقد", width: 220 }, { label: "البيان", width: 300 }, { label: "المبلغ", width: 160 },
    { label: "حالة الصرف", width: 175 }, { label: "سند / مرجع الاستلام", width: 220 },
  ];
}

function paymentRunRowValues(data: PaymentRunExportData, item: PaymentRunExportData["items"][number], index: number) {
  const request = item.request;
  const common = [String(index + 1), request?.requestNumber || "—", `${request?.departmentCode || "—"} · ${request?.expenseType || "—"}`];
  const executive = item.executiveApproval?.actorName || item.executiveApproval?.actorEmail || "اعتماد سابق";
  if (data.paymentRun.paymentMethod === "BANK") return [
    ...common, executive, request?.beneficiaryName || "—", request?.purpose || "—", request?.bankName || "—", request?.iban || "—",
    request?.accountNameMatch === "MATCHED" ? "✓ مطابق" : "غير مطابق", formatMoney(item.amountMinor),
    `${item.bankReference || "—"} · ${executionStatusNames[item.executionStatus] || item.executionStatus}`,
  ];
  return [
    ...common, executive, request?.cashRecipient || request?.beneficiaryName || "—", request?.purpose || "—",
    formatMoney(item.amountMinor), executionStatusNames[item.executionStatus] || item.executionStatus, item.bankReference || "—",
  ];
}

function executiveApprovalSummary(data: PaymentRunExportData) {
  const approvals = data.items.map((item) => item.executiveApproval).filter((value): value is NonNullable<PaymentRunExportData["items"][number]["executiveApproval"]> => Boolean(value));
  const actors = [...new Set(approvals.map((approval) => approval.actorName || approval.actorEmail).filter(Boolean))];
  const dates = approvals.map((approval) => approval.createdAt).filter(Boolean).sort();
  return { approvals, actors, latestDate: dates.at(-1) || "" };
}

function paymentRunMeta(data: PaymentRunExportData) {
  const run = data.paymentRun;
  const executive = executiveApprovalSummary(data);
  const activeCount = data.items.filter((item) => item.executionStatus !== "EXCLUDED").length;
  return [
    ["تاريخ المسير", formatDate(run.createdAt)], [run.paymentMethod === "BANK" ? "الحساب المصدر" : "الصندوق / الموقع", run.sourceAccount],
    ["عدد العمليات", `${run.itemCount} عملية`], ["الإجمالي", `${formatMoney(run.totalMinor)} ر.س`],
    ["الحالة", runStatusNames[run.status] || run.status], ["الاعتماد التنفيذي", executive.approvals.length ? `${executive.approvals.length}/${activeCount} موثق` : run.approvedByEmail ? "اعتماد مسير سابق" : "موثق في الطلبات"],
  ];
}

function drawPaymentRunMeta(context: CanvasRenderingContext2D, data: PaymentRunExportData) {
  const meta = paymentRunMeta(data);
  const width = 260;
  setRtl(context, `700 18px ${ARABIC_FONT}`);
  const valueLines = meta.map(([, value]) => wrapLines(context, value, width - 28));
  const height = Math.max(82, 58 + Math.max(...valueLines.map((lines) => lines.length)) * 22);
  meta.forEach(([label], index) => {
    const x = 70 + index * 272;
    context.fillStyle = "#fafafa";
    context.strokeStyle = LINE;
    context.beginPath(); context.roundRect(x, 180, width, height, 10); context.fill(); context.stroke();
    setRtl(context, `500 15px ${ARABIC_FONT}`, MUTED); context.fillText(label, x + width - 14, 207);
    setRtl(context, `700 18px ${ARABIC_FONT}`);
    valueLines[index].forEach((line, lineIndex) => context.fillText(line, x + width - 14, 239 + lineIndex * 22));
  });
  return 180 + height + 30;
}

function preparePaymentRunRows(data: PaymentRunExportData, columns: RunColumn[]) {
  const scratch = newCanvas(1754, 1240);
  setRtl(scratch.context, `500 15px ${ARABIC_FONT}`);
  return data.items.filter((item) => item.executionStatus !== "EXCLUDED").map<RunRow>((item, index) => {
    const values = paymentRunRowValues(data, item, index);
    const lines = values.map((value, columnIndex) => wrapLines(scratch.context, value, columns[columnIndex].width - 16));
    const height = Math.max(58, 24 + Math.max(...lines.map((cellLines) => cellLines.length)) * 20);
    return { item, values, lines, height };
  });
}

function drawLandscapeSectionTitle(context: CanvasRenderingContext2D, title: string, y: number) {
  context.fillStyle = RED;
  context.fillRect(1682, y - 27, 5, 34);
  setRtl(context, `700 25px ${ARABIC_FONT}`);
  context.fillText(title, 1668, y);
  context.strokeStyle = LINE;
  context.beginPath(); context.moveTo(70, y + 15); context.lineTo(1688, y + 15); context.stroke();
  return y + 45;
}

function drawRunSignatures(context: CanvasRenderingContext2D, data: PaymentRunExportData, y: number) {
  const run = data.paymentRun;
  const created = data.actions.find((action) => ["CREATE", "SUBMIT"].includes(action.action));
  const approve = [...data.actions].reverse().find((action) => action.action === "APPROVE");
  const executive = executiveApprovalSummary(data);
  const executors = [...new Set(data.items.map((item) => item.execution?.executedByEmail).filter((value): value is string => Boolean(value)))];
  const executionDates = data.items.map((item) => item.execution?.executedAt).filter((value): value is string => Boolean(value)).sort();
  const signatures = [
    { title: "إعداد ومطابقة المسير", actor: run.preparedByEmail, date: created?.createdAt || run.createdAt, note: created?.note || "تم تجميع العمليات المعتمدة نهائيًا ومطابقتها" },
    { title: "الاعتماد التنفيذي للطلبات", actor: executive.actors.join(" · ") || run.approvedByEmail || approve?.actorEmail || "موثق داخل كل طلب", date: executive.latestDate || run.approvedAt || approve?.createdAt || "", note: executive.approvals.length ? `${executive.approvals.length} اعتمادًا تنفيذيًا موثقًا داخل الطلبات` : approve?.note || "مسير سابق أو اعتماد موثق داخل الطلب" },
    { title: run.paymentMethod === "BANK" ? "التنفيذ / الختم البنكي" : "أمين الصندوق / الاستلام", actor: executors.join(" · ") || "بانتظار التنفيذ", date: executionDates.at(-1) || "", note: executors.length ? "المراجع والإثباتات موثقة لكل عملية" : "التوقيع والختم بعد التنفيذ" },
  ];
  signatures.forEach((signature, index) => {
    const boxWidth = 510; const x = 70 + index * 540;
    context.fillStyle = index === 1 ? LIGHT_RED : "#ffffff"; context.strokeStyle = index === 1 ? "#f2aab4" : LINE;
    context.beginPath(); context.roundRect(x, y, boxWidth, 166, 12); context.fill(); context.stroke();
    setRtl(context, `700 18px ${ARABIC_FONT}`, RED); context.fillText(signature.title, x + boxWidth - 16, y + 31);
    setRtl(context, `700 16px ${ARABIC_FONT}`); wrapLines(context, signature.actor, boxWidth - 32).slice(0, 2).forEach((line, lineIndex) => context.fillText(line, x + boxWidth - 16, y + 61 + lineIndex * 21));
    setRtl(context, `500 14px ${ARABIC_FONT}`, MUTED); wrapLines(context, signature.note, boxWidth - 32).slice(0, 2).forEach((line, lineIndex) => context.fillText(line, x + boxWidth - 16, y + 108 + lineIndex * 19));
    context.direction = "ltr"; context.textAlign = "left"; context.font = `500 13px ${ARABIC_FONT}`; context.fillStyle = MUTED; context.fillText(formatDate(signature.date), x + 16, y + 151);
  });
}

function paymentRunTablePages(data: PaymentRunExportData) {
  const run = data.paymentRun;
  const columns = paymentRunColumns(run.paymentMethod === "BANK");
  const preparedRows = preparePaymentRunRows(data, columns);
  const measurePage = newCanvas(1754, 1240);
  const headerY = drawPaymentRunMeta(measurePage.context, data);
  const dataStartY = headerY + 54;
  const pageRows: RunRow[][] = [[]];
  let usedHeight = dataStartY;
  preparedRows.forEach((row) => {
    if (pageRows[pageRows.length - 1].length && usedHeight + row.height > 1055) {
      pageRows.push([]);
      usedHeight = dataStartY;
    }
    pageRows[pageRows.length - 1].push(row);
    usedHeight += row.height;
  });
  const canvases: HTMLCanvasElement[] = [];
  let signaturesNeedPage = false;
  pageRows.forEach((rows, pageIndex) => {
    const page = newCanvas(1754, 1240);
    drawLandscapeHeader(page.context, `مسير ${run.paymentMethod === "BANK" ? "تحويلات بنكية" : "صرف نقدي"} · ${groupNames[run.settlementGroup] || run.settlementGroup}`, run.runNumber);
    const tableY = drawPaymentRunMeta(page.context, data);
    let x = 55;
    columns.forEach((column) => {
      page.context.fillStyle = DARK; page.context.fillRect(x, tableY, column.width, 54);
      setRtl(page.context, `700 16px ${ARABIC_FONT}`, "#ffffff"); page.context.fillText(column.label, x + column.width - 8, tableY + 34);
      x += column.width;
    });
    let rowY = tableY + 54;
    rows.forEach((row, rowIndex) => {
      let cellX = 55;
      columns.forEach((column, columnIndex) => {
        page.context.fillStyle = rowIndex % 2 ? "#fafafa" : "#ffffff";
        if (row.item.request?.priority === "CRITICAL") page.context.fillStyle = LIGHT_RED;
        page.context.strokeStyle = LINE; page.context.fillRect(cellX, rowY, column.width, row.height); page.context.strokeRect(cellX, rowY, column.width, row.height);
        const isAmount = column.label === "المبلغ";
        const isPriority = column.label === "الأولوية";
        setRtl(page.context, `${isAmount ? "700" : "500"} 15px ${ARABIC_FONT}`, isPriority && row.item.request?.priority !== "NORMAL" ? RED : DARK);
        row.lines[columnIndex].forEach((line, lineIndex) => page.context.fillText(line, cellX + column.width - 8, rowY + 25 + lineIndex * 20));
        cellX += column.width;
      });
      rowY += row.height;
    });
    if (pageIndex === pageRows.length - 1) {
      page.context.fillStyle = "#f3f4f6"; page.context.fillRect(55, rowY, columns.reduce((sum, column) => sum + column.width, 0), 46);
      setRtl(page.context, `700 17px ${ARABIC_FONT}`);
      page.context.fillText(`الإجمالي المعتمد: ${formatMoney(run.totalMinor)} ر.س`, 1640, rowY + 30);
      rowY += 62;
      if (rowY + 166 <= 1110) drawRunSignatures(page.context, data, rowY);
      else signaturesNeedPage = true;
    } else {
      setRtl(page.context, `600 17px ${ARABIC_FONT}`, MUTED);
      page.context.fillText("يتبع في الصفحة التالية — ترويسة الجدول مكررة تلقائيًا", 1660, 1090);
    }
    drawCanvasFooter(page.context, run.runNumber, 1754, 1240);
    canvases.push(page.canvas);
  });
  if (signaturesNeedPage) {
    const page = newCanvas(1754, 1240);
    drawLandscapeHeader(page.context, `الخلاصة والاعتماد النهائي · مسير ${run.paymentMethod === "BANK" ? "بنكي" : "نقدي"}`, run.runNumber);
    const y = drawPaymentRunMeta(page.context, data);
    drawRunSignatures(page.context, data, y + 36);
    drawCanvasFooter(page.context, run.runNumber, 1754, 1240);
    canvases.push(page.canvas);
  }
  return canvases;
}

function paymentRunGovernancePages(data: PaymentRunExportData) {
  const run = data.paymentRun;
  const pages: HTMLCanvasElement[] = [];
  const executors = [...new Set(data.items.map((item) => item.execution?.executedByEmail).filter((value): value is string => Boolean(value)))];
  const executionDates = data.items.map((item) => item.execution?.executedAt).filter((value): value is string => Boolean(value)).sort();
  const entries = data.actions.map((action) => ({
    title: actionNames[action.action] || action.action,
    actor: action.actorEmail,
    date: action.createdAt,
    note: action.note || "تم تسجيل الإجراء دون ملاحظة",
  }));
  if (executors.length) entries.push({ title: "منفذو العمليات", actor: executors.join(" · "), date: executionDates.at(-1) || "", note: "تم توثيق منفذ ومرجع كل عملية داخل المسير." });
  let page = newCanvas(1754, 1240);
  const resetPage = (continuation = false) => {
    page = newCanvas(1754, 1240);
    drawLandscapeHeader(page.context, continuation ? "استكمال اعتمادات وتوصيات المسير" : "اعتمادات وتوصيات المسير", run.runNumber);
    drawCanvasFooter(page.context, run.runNumber, 1754, 1240);
    return drawLandscapeSectionTitle(page.context, "السجل الكامل للقرارات والتوصيات", 220);
  };
  let y = resetPage();
  const pushPage = () => {
    pages.push(page.canvas);
    y = resetPage(true);
  };
  if (!entries.length) {
    setRtl(page.context, `500 22px ${ARABIC_FONT}`, MUTED);
    page.context.fillText("لا توجد قرارات إضافية مسجلة بعد.", 1660, y + 45);
    y += 90;
  } else {
    entries.forEach((entry) => {
      setRtl(page.context, `500 18px ${ARABIC_FONT}`);
      const noteLines = wrapLines(page.context, entry.note, 1510);
      const actorLines = wrapLines(page.context, entry.actor, 1510);
      const allLines = [...actorLines.map((line) => `المنفذ: ${line}`), ...noteLines];
      const chunks: string[][] = [];
      for (let offset = 0; offset < allLines.length; offset += 9) chunks.push(allLines.slice(offset, offset + 9));
      chunks.forEach((lines, chunkIndex) => {
        const height = 108 + lines.length * 25;
        if (y + height > 850) pushPage();
        page.context.fillStyle = "#ffffff"; page.context.strokeStyle = LINE;
        page.context.beginPath(); page.context.roundRect(70, y, 1618, height, 12); page.context.fill(); page.context.stroke();
        setRtl(page.context, `700 21px ${ARABIC_FONT}`, RED);
        page.context.fillText(`${entry.title}${chunkIndex ? ` — تابع (${chunkIndex + 1})` : ""}`, 1660, y + 34);
        setRtl(page.context, `500 16px ${ARABIC_FONT}`, MUTED);
        page.context.fillText(formatDate(entry.date), 1660, y + 62);
        setRtl(page.context, `500 18px ${ARABIC_FONT}`);
        lines.forEach((line, lineIndex) => page.context.fillText(line, 1660, y + 92 + lineIndex * 25));
        y += height + 14;
      });
    });
  }
  const submit = data.actions.find((action) => action.action === "SUBMIT");
  const approve = [...data.actions].reverse().find((action) => action.action === "APPROVE");
  const signatureY = 910;
  const signatures = [
    ["إعداد ومراجعة المسير", run.preparedByEmail, submit?.createdAt || run.createdAt],
    ["الاعتماد النهائي", run.approvedByEmail || approve?.actorEmail || "بانتظار المعتمد", run.approvedAt || approve?.createdAt || ""],
    [run.paymentMethod === "BANK" ? "التنفيذ / الختم البنكي" : "أمين الصندوق / إثبات الاستلام", executors.length ? `${executors.length} منفذ — التفاصيل أعلاه` : "بانتظار التنفيذ", executionDates.at(-1) || ""],
  ];
  signatures.forEach(([label, value, date], index) => {
    const boxWidth = 510; const boxX = 70 + index * 540;
    page.context.strokeStyle = LINE; page.context.beginPath(); page.context.roundRect(boxX, signatureY, boxWidth, 180, 12); page.context.stroke();
    setRtl(page.context, `700 18px ${ARABIC_FONT}`, RED); page.context.fillText(label, boxX + boxWidth - 16, signatureY + 34);
    setRtl(page.context, `600 16px ${ARABIC_FONT}`);
    wrapLines(page.context, value, boxWidth - 32).forEach((line, lineIndex) => page.context.fillText(line, boxX + boxWidth - 16, signatureY + 70 + lineIndex * 22));
    setRtl(page.context, `500 14px ${ARABIC_FONT}`, MUTED); page.context.fillText(formatDate(date), boxX + boxWidth - 16, signatureY + 154);
  });
  pages.push(page.canvas);
  return pages;
}

function paymentRunCanvases(data: PaymentRunExportData) {
  return paymentRunTablePages(data);
}

export async function createPaymentRunPdf(data: PaymentRunExportData) {
  const pdfLib = await loadPdfLib();
  const pdf = await pdfLib.PDFDocument.create();
  for (const canvas of paymentRunCanvases(data)) await addCanvasPage(pdf, canvas, A4_LANDSCAPE);
  await addPageNumbers(pdf, pdfLib, data.paymentRun.runNumber);
  const bytes = await pdf.save({ useObjectStreams: true });
  return new Blob([bytesToArrayBuffer(bytes)], { type: "application/pdf" });
}

export async function downloadPaymentRunPdf(data: PaymentRunExportData) {
  const blob = await createPaymentRunPdf(data);
  const filename = `TITO-${safeFilename(data.paymentRun.runNumber)}.pdf`;
  downloadBlob(blob, filename);
  return filename;
}

export async function sharePaymentRunPdf(data: PaymentRunExportData) {
  const blob = await createPaymentRunPdf(data);
  const filename = `TITO-${safeFilename(data.paymentRun.runNumber)}.pdf`;
  const file = new File([blob], filename, { type: "application/pdf" });
  if (navigator.share && navigator.canShare?.({ files: [file] })) {
    await navigator.share({ title: `TITO · ${data.paymentRun.runNumber}`, files: [file] });
    return { shared: true, downloaded: false, filename };
  }
  downloadBlob(blob, filename);
  return { shared: false, downloaded: true, filename };
}
