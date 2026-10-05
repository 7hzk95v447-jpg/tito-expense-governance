"use client";

import type { PdfLibNamespace as PdfLib, PdfDocument } from "./client-document-export";

export type ReceiptExportData = {
  receipt: {
    id: string; voucherNumber: string; receivedFrom: string; amountMinor: number; purpose: string;
    paymentMethod: string; destinationAccount: string; referenceNumber?: string | null; branchCode?: string | null;
    departmentCode?: string | null; status: string; createdByName: string; createdByEmail: string;
    confirmedByEmail: string; confirmedAt: string; createdAt: string;
  };
  attachments: Array<{ id: string; originalName: string; mimeType: string; sizeBytes: number }>;
};

const RED = "#dc001c";
const DARK = "#17191f";
const MUTED = "#68707d";
const FONT = 'Arial, "Noto Sans Arabic", Tahoma, sans-serif';
const A4_LANDSCAPE: [number, number] = [841.89, 595.28];
const A4_PORTRAIT: [number, number] = [595.28, 841.89];
let loader: Promise<PdfLib> | null = null;

function loadPdfLib() {
  if (window.PDFLib) return Promise.resolve(window.PDFLib);
  if (loader) return loader;
  const pending = new Promise<PdfLib>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>('script[data-tito-pdf-lib="true"]');
    const script = existing || document.createElement("script");
    const timer = window.setTimeout(() => reject(new Error("استغرق تجهيز PDF وقتًا طويلًا؛ أعد المحاولة")), 20_000);
    const loaded = () => { window.clearTimeout(timer); window.PDFLib ? resolve(window.PDFLib) : reject(new Error("تعذر تشغيل محرك PDF")); };
    const failed = () => { window.clearTimeout(timer); script.remove(); reject(new Error("تعذر تحميل محرك PDF")); };
    script.addEventListener("load", loaded, { once: true });
    script.addEventListener("error", failed, { once: true });
    if (!existing) { script.src = "/vendor/pdf-lib.min.js"; script.async = true; script.dataset.titoPdfLib = "true"; document.head.appendChild(script); }
  });
  loader = pending.catch((error) => { loader = null; throw error; });
  return loader;
}

function canvasPage(width: number, height: number) {
  const canvas = document.createElement("canvas"); canvas.width = width; canvas.height = height;
  const context = canvas.getContext("2d"); if (!context) throw new Error("تعذر تجهيز صفحة السند");
  context.fillStyle = "#fff"; context.fillRect(0, 0, width, height); context.textBaseline = "alphabetic";
  return { canvas, context };
}

function rtl(context: CanvasRenderingContext2D, font: string, color = DARK) {
  context.direction = "rtl"; context.textAlign = "right"; context.font = font; context.fillStyle = color;
}

function wrap(context: CanvasRenderingContext2D, value: string, width: number) {
  const words = value.split(/\s+/); const lines: string[] = []; let line = "";
  for (const word of words) { const next = line ? `${line} ${word}` : word; if (context.measureText(next).width <= width) line = next; else { if (line) lines.push(line); line = word; } }
  if (line) lines.push(line); return lines;
}

function integerWords(value: number): string {
  const ones = ["صفر", "واحد", "اثنان", "ثلاثة", "أربعة", "خمسة", "ستة", "سبعة", "ثمانية", "تسعة", "عشرة", "أحد عشر", "اثنا عشر", "ثلاثة عشر", "أربعة عشر", "خمسة عشر", "ستة عشر", "سبعة عشر", "ثمانية عشر", "تسعة عشر"];
  const tens = ["", "", "عشرون", "ثلاثون", "أربعون", "خمسون", "ستون", "سبعون", "ثمانون", "تسعون"];
  const hundreds = ["", "مائة", "مائتان", "ثلاثمائة", "أربعمائة", "خمسمائة", "ستمائة", "سبعمائة", "ثمانمائة", "تسعمائة"];
  const small = (n: number) => { const p: string[] = []; if (n >= 100) { p.push(hundreds[Math.floor(n / 100)]); n %= 100; } if (n) { if (n < 20) p.push(ones[n]); else { if (n % 10) p.push(ones[n % 10]); p.push(tens[Math.floor(n / 10)]); } } return p.join(" و"); };
  if (!value) return ones[0]; const parts: string[] = []; let rest = Math.floor(value);
  for (const [scale, one, two, many] of [[1_000_000, "مليون", "مليونان", "ملايين"], [1_000, "ألف", "ألفان", "آلاف"]] as Array<[number,string,string,string]>) {
    const count = Math.floor(rest / scale); if (!count) continue;
    parts.push(count === 1 ? one : count === 2 ? two : `${small(count)} ${count <= 10 ? many : one}`); rest %= scale;
  }
  if (rest) parts.push(small(rest)); return parts.join(" و");
}

function moneyWords(minor: number) {
  const riyals = Math.floor(minor / 100); const halalas = Math.abs(minor % 100);
  return `${integerWords(riyals)} ريال سعودي${halalas ? ` و${integerWords(halalas)} هللة` : ""} فقط لا غير`;
}

function loadImage(src: string) { return new Promise<HTMLImageElement>((resolve, reject) => { const image = new Image(); image.onload = () => resolve(image); image.onerror = reject; image.src = src; }); }
function canvasBlob(canvas: HTMLCanvasElement) { return new Promise<Blob>((resolve, reject) => canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("تعذر تحويل السند إلى PDF")), "image/jpeg", .94)); }
function arrayBuffer(bytes: Uint8Array) { const output = new ArrayBuffer(bytes.byteLength); new Uint8Array(output).set(bytes); return output; }
function safe(value: string) { return value.replace(/[\\/:*?"<>|]+/g, "-").replace(/\s+/g, "-").slice(0, 100); }

async function receiptCanvas(data: ReceiptExportData) {
  const { receipt } = data; const page = canvasPage(1754, 1240); const c = page.context; const right = 1670;
  c.strokeStyle = RED; c.lineWidth = 3; c.beginPath(); c.moveTo(460, 105); c.lineTo(1410, 105); c.stroke();
  c.direction = "ltr"; c.textAlign = "left"; c.fillStyle = RED; c.fillRect(55, 45, 150, 68); c.font = `900 42px ${FONT}`; c.fillStyle = "#fff"; c.fillText("TITO", 75, 92);
  c.font = `800 43px ${FONT}`; c.fillStyle = RED; c.fillText("تيتو", 230, 94);
  c.fillStyle = RED; c.beginPath(); c.roundRect(1550, 38, 118, 92, 16); c.fill(); c.fillStyle = "#fff"; c.font = `900 54px ${FONT}`; c.textAlign = "center"; c.fillText("T2", 1609, 102);
  rtl(c, `700 17px ${FONT}`); c.fillText("شركة لجين ينبع للتجارة", right, 154); c.direction = "ltr"; c.textAlign = "right"; c.font = `500 14px ${FONT}`; c.fillStyle = MUTED; c.fillText("Lujain Yanbu Trading Co.", right, 177);
  rtl(c, `900 74px ${FONT}`, RED); c.textAlign = "center"; c.fillText("سند قبض", 880, 182); c.direction = "ltr"; c.textAlign = "center"; c.font = `700 26px ${FONT}`; c.fillStyle = DARK; c.fillText("RECEIPT VOUCHER", 880, 220);
  c.strokeStyle = RED; c.beginPath(); c.moveTo(685, 238); c.lineTo(1075, 238); c.stroke();
  rtl(c, `700 20px ${FONT}`, RED); c.fillText("رقم السند", 1445, 205); c.direction = "ltr"; c.textAlign = "center"; c.fillStyle = "#f3f3f4"; c.fillRect(1455, 215, 210, 52); c.fillStyle = DARK; c.font = `700 21px ${FONT}`; c.fillText(receipt.voucherNumber, 1560, 248);
  c.strokeStyle = RED; c.lineWidth = 2; c.beginPath(); c.roundRect(55, 250, 370, 85, 10); c.stroke(); rtl(c, `800 26px ${FONT}`, RED); c.fillText("ريال", 140, 292); c.direction = "ltr"; c.textAlign = "center"; c.font = `700 26px ${FONT}`; c.fillStyle = DARK; c.fillText((receipt.amountMinor / 100).toLocaleString("en-US", { minimumFractionDigits: 2 }), 285, 302);
  const fields: Array<[string,string,string]> = [
    ["التاريخ", "Date", new Intl.DateTimeFormat("ar-SA", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Riyadh" }).format(new Date(receipt.confirmedAt))],
    ["استلمنا من", "Received From", receipt.receivedFrom],
    ["مبلغ وقدره", "Amount", moneyWords(receipt.amountMinor)],
    ["وذلك مقابل", "For", receipt.purpose],
    ["طريقة القبض", "Receipt Method", receipt.paymentMethod === "BANK" ? `تحويل بنكي · ${receipt.destinationAccount} · المرجع ${receipt.referenceNumber || "—"}` : `نقدًا · ${receipt.destinationAccount}`],
  ];
  let y = 325;
  fields.forEach(([label,en,value], index) => { const height = index === 3 ? 120 : 78; rtl(c, `800 24px ${FONT}`, RED); c.fillText(label, right, y + 27); c.direction = "ltr"; c.textAlign = "right"; c.font = `500 14px ${FONT}`; c.fillStyle = MUTED; c.fillText(en, right, y + 48); c.strokeStyle = "#babcc2"; c.setLineDash([3,5]); c.beginPath(); c.moveTo(260, y + height - 12); c.lineTo(1440, y + height - 12); c.stroke(); c.setLineDash([]); rtl(c, `${index === 1 ? "800" : "600"} 22px ${FONT}`); wrap(c, value, 1130).slice(0, index === 3 ? 3 : 2).forEach((line,i) => c.fillText(line, 1415, y + 34 + i * 30)); y += height; });
  try { const qr = await loadImage("/tito-official-qr.jpeg"); c.drawImage(qr, 55, 765, 185, 185); c.strokeStyle = RED; c.lineWidth = 3; c.strokeRect(51, 761, 193, 193); } catch { /* document remains valid without network-loaded QR */ }
  const signatures = [["التسجيل والاعتماد", "Recording & Approval", receipt.createdByName], ["أمين الصندوق", "Cashier", receipt.confirmedByEmail], ["المستلم", "Receiver", receipt.receivedFrom]];
  signatures.forEach(([label,en,value], index) => { const x = 300 + index * 440; if (index) { c.strokeStyle = "#9da0a8"; c.beginPath(); c.moveTo(x - 30, 795); c.lineTo(x - 30, 975); c.stroke(); } rtl(c, `800 24px ${FONT}`); c.textAlign = "center"; c.fillText(label, x + 180, 825); c.direction = "ltr"; c.textAlign = "center"; c.font = `500 15px ${FONT}`; c.fillStyle = MUTED; c.fillText(en, x + 180, 850); rtl(c, `600 17px ${FONT}`); c.textAlign = "center"; wrap(c, value, 340).slice(0,2).forEach((line,i)=>c.fillText(line,x+180,900+i*24)); c.strokeStyle = "#9da0a8"; c.setLineDash([3,4]); c.beginPath(); c.moveTo(x+30,950); c.lineTo(x+330,950); c.stroke(); c.setLineDash([]); });
  c.strokeStyle = RED; c.lineWidth = 3; c.beginPath(); c.moveTo(55, 1015); c.lineTo(1690, 1015); c.stroke(); rtl(c, `800 24px ${FONT}`, RED); c.fillText("تسوق كل جديد", 1690, 1055); c.direction = "ltr"; c.textAlign = "right"; c.font = `500 15px ${FONT}`; c.fillStyle = MUTED; c.fillText("Shop Every New", 1690, 1080); rtl(c, `600 16px ${FONT}`, MUTED); c.fillText(`الفرع: ${receipt.branchCode || "—"} · الحالة: مؤكد · المرفقات: ${data.attachments.length}`, 1690, 1135);
  return page.canvas;
}

async function addCanvas(pdf: PdfDocument, canvas: HTMLCanvasElement, size: [number, number]) {
  const blob = await canvasBlob(canvas); const image = await pdf.embedJpg(await blob.arrayBuffer()); const page = pdf.addPage(size); page.drawImage(image, { x: 0, y: 0, width: size[0], height: size[1] });
}

async function appendAttachments(pdf: PdfDocument, pdfLib: PdfLib, data: ReceiptExportData, progress?: (message: string) => void) {
  for (let index = 0; index < data.attachments.length; index++) {
    const file = data.attachments[index]; progress?.(`جارٍ ضم المرفق ${index + 1} من ${data.attachments.length}`);
    const response = await fetch(`/api/files/${file.id}`, { cache: "no-store" }); if (!response.ok) throw new Error(`تعذر جلب المرفق ${file.originalName}`); const blob = await response.blob();
    if (file.mimeType === "application/pdf") { const bytes = await blob.arrayBuffer(); const source = await pdfLib.PDFDocument.load(bytes, { ignoreEncryption: true }); const embedded = await pdf.embedPdf(bytes, Array.from({ length: source.getPageCount() }, (_, i) => i)); for (const item of embedded) { const page = pdf.addPage(A4_PORTRAIT); const scale = Math.min((A4_PORTRAIT[0]-36)/item.width, (A4_PORTRAIT[1]-36)/item.height); const width=item.width*scale, height=item.height*scale; page.drawPage(item,{x:(A4_PORTRAIT[0]-width)/2,y:(A4_PORTRAIT[1]-height)/2,width,height}); } }
    else if (file.mimeType.startsWith("image/")) { const url = URL.createObjectURL(blob); try { const image = await loadImage(url); const page = canvasPage(1240,1754); rtl(page.context,`800 28px ${FONT}`,RED); page.context.fillText(`مرفق ${index+1}: ${file.originalName}`,1170,80); const scale=Math.min(1080/image.width,1510/image.height,1); const width=image.width*scale,height=image.height*scale; page.context.drawImage(image,(1240-width)/2,140+(1510-height)/2,width,height); await addCanvas(pdf,page.canvas,A4_PORTRAIT); } finally { URL.revokeObjectURL(url); } }
    else { const page=canvasPage(1240,1754); rtl(page.context,`900 52px ${FONT}`,RED); page.context.fillText("مرفق محفوظ مع سند القبض",1170,180); rtl(page.context,`700 30px ${FONT}`); wrap(page.context,file.originalName,1080).forEach((line,i)=>page.context.fillText(line,1170,300+i*44)); rtl(page.context,`500 22px ${FONT}`,MUTED); page.context.fillText(`${file.mimeType} · ${Math.round(file.sizeBytes/1024)} KB`,1170,450); await addCanvas(pdf,page.canvas,A4_PORTRAIT); }
  }
}

export async function fetchReceiptExportData(id: string) { const response = await fetch(`/api/receipts?id=${encodeURIComponent(id)}`, { cache: "no-store" }); const data = await response.json(); if (!response.ok) throw new Error(data.error || "تعذر تحميل سند القبض"); return data as ReceiptExportData; }
export async function createReceiptPdf(id: string, progress?: (message: string) => void) { progress?.("جارٍ تجهيز سند القبض"); const data=await fetchReceiptExportData(id); const lib=await loadPdfLib(); const pdf=await lib.PDFDocument.create(); await addCanvas(pdf,await receiptCanvas(data),A4_LANDSCAPE); await appendAttachments(pdf,lib,data,progress); const bytes=await pdf.save({useObjectStreams:true}); return {blob:new Blob([arrayBuffer(bytes)],{type:"application/pdf"}),data}; }
function download(blob: Blob, filename: string) { const url=URL.createObjectURL(blob); const anchor=document.createElement("a"); anchor.href=url; anchor.download=filename; anchor.rel="noopener"; anchor.style.display="none"; document.body.appendChild(anchor); anchor.click(); anchor.remove(); window.setTimeout(()=>URL.revokeObjectURL(url),60_000); }
export async function downloadReceiptPdf(id: string, progress?: (message:string)=>void) { const result=await createReceiptPdf(id,progress); const filename=`سند-قبض-${safe(result.data.receipt.receivedFrom)}-${safe(result.data.receipt.voucherNumber)}.pdf`; download(result.blob,filename); return filename; }
export async function shareReceiptPdf(id: string, progress?: (message:string)=>void) { const result=await createReceiptPdf(id,progress); const filename=`سند-قبض-${safe(result.data.receipt.receivedFrom)}-${safe(result.data.receipt.voucherNumber)}.pdf`; const file=new File([result.blob],filename,{type:"application/pdf"}); if(navigator.share&&navigator.canShare?.({files:[file]})){try{await navigator.share({files:[file]});return {shared:true,downloaded:false,filename};}catch(error){if(error instanceof DOMException&&error.name==="AbortError")throw error;download(result.blob,filename);return {shared:false,downloaded:true,filename};}} download(result.blob,filename); return {shared:false,downloaded:true,filename}; }
