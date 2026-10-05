"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createReceiptPdf, downloadReceiptPdf, shareReceiptPdf } from "../lib/client-receipt-export";

type Receipt = { id: string; voucherNumber: string; receivedFrom: string; amountMinor: number; purpose: string; paymentMethod: string; destinationAccount: string; referenceNumber?: string | null; branchCode?: string | null; status: string; createdAt: string };
type DraftFile = { id: string; name: string; mimeType: string; sizeBytes: number; status: string };
const money = (minor: number) => (minor / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const date = (value: string) => new Intl.DateTimeFormat("ar-SA", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Riyadh" }).format(new Date(value));

async function prepareUpload(file: File) {
  if (!file.type.startsWith("image/") || file.size < 650_000) return file;
  try {
    const bitmap = await createImageBitmap(file); const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas"); canvas.width = Math.max(1, Math.round(bitmap.width * scale)); canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    canvas.getContext("2d")?.drawImage(bitmap, 0, 0, canvas.width, canvas.height); bitmap.close();
    let blob: Blob | null = null;
    for (const quality of [.74, .64, .54, .44]) { blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", quality)); if (blob && blob.size <= 700_000) break; }
    return blob ? new File([blob], file.name.replace(/\.[^.]+$/, ".jpg"), { type: "image/jpeg" }) : file;
  } catch { return file; }
}

export default function ReceiptVouchers({ onMessage }: { onMessage: (message: string) => void }) {
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [exportId, setExportId] = useState("");
  const [files, setFiles] = useState<DraftFile[]>([]);
  const [draftKey, setDraftKey] = useState(() => crypto.randomUUID());
  const [form, setForm] = useState({ receivedFrom: "", amount: "", purpose: "", paymentMethod: "CASH", destinationAccount: "", referenceNumber: "" });

  const load = useCallback(() => fetch("/api/receipts?limit=500", { cache: "no-store" }).then(async (response) => { const data = await response.json(); if (!response.ok) throw new Error(data.error || "تعذر تحميل سندات القبض"); setReceipts(data.receipts || []); }), []);
  useEffect(() => { void load().catch((error) => onMessage(error instanceof Error ? error.message : "تعذر تحميل سندات القبض")); }, [load, onMessage]);
  const total = useMemo(() => receipts.reduce((sum, item) => sum + item.amountMinor, 0), [receipts]);

  const upload = async (selected: FileList | null) => {
    if (!selected?.length) return;
    setBusy(true);
    try {
      for (const original of Array.from(selected)) {
        const file = await prepareUpload(original);
        if (file.size > 900_000) throw new Error(`الملف ${original.name} أكبر من حد الرفع المباشر؛ اختر ملفًا أقل من 900 ك.ب`);
        const data = new FormData(); data.set("file", file); data.set("draftKey", draftKey); data.set("purpose", "RECEIPT_ATTACHMENT");
        const response = await fetch("/api/files", { method: "POST", body: data }); const result = await response.json();
        if (!response.ok) throw new Error(result.error || `تعذر رفع ${file.name}`);
        setFiles((current) => [...current, result.file]);
      }
      onMessage("تم حفظ المرفقات وربطها بالسند");
    } catch (error) { onMessage(error instanceof Error ? error.message : "تعذر رفع المرفقات"); }
    finally { setBusy(false); }
  };

  const removeFile = async (id: string) => {
    const response = await fetch(`/api/files/${id}`, { method: "DELETE" });
    if (!response.ok) return onMessage("تعذر حذف المرفق");
    setFiles((current) => current.filter((file) => file.id !== id));
  };

  const create = async () => {
    if (!form.receivedFrom.trim() || !form.purpose.trim() || !form.destinationAccount.trim()) return onMessage("أكمل المستلم منه والمبلغ والبيان والصندوق أو الحساب");
    const amount = Number(form.amount.replaceAll(",", ""));
    if (!Number.isFinite(amount) || amount <= 0) return onMessage("اكتب مبلغ قبض صحيحًا");
    if (form.paymentMethod === "BANK" && !form.referenceNumber.trim()) return onMessage("رقم مرجع التحويل مطلوب");
    setBusy(true);
    try {
      const response = await fetch("/api/receipts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...form, amountMinor: Math.round(amount * 100), draftKey }) });
      const result = await response.json(); if (!response.ok) throw new Error(result.error || "تعذر إصدار سند القبض");
      await load(); setOpen(false); setFiles([]); setDraftKey(crypto.randomUUID()); setForm({ receivedFrom: "", amount: "", purpose: "", paymentMethod: "CASH", destinationAccount: "", referenceNumber: "" });
      onMessage(`تم إصدار سند القبض ${result.receipt.voucherNumber}`);
    } catch (error) { onMessage(error instanceof Error ? error.message : "تعذر إصدار سند القبض"); }
    finally { setBusy(false); }
  };

  const runExport = async (id: string, mode: "SHARE" | "DOWNLOAD" | "PREVIEW") => {
    if (exportId) return;
    const previewWindow = mode === "PREVIEW" ? window.open("about:blank", "_blank") : null;
    setExportId(id);
    try {
      if (mode === "SHARE") { const result = await shareReceiptPdf(id, onMessage); onMessage(result.shared ? "فُتحت مشاركة الجهاز وملف سند القبض مرفق" : "المتصفح منع إرفاق الملف؛ تم تنزيل PDF لإرساله من واتساب"); }
      else if (mode === "DOWNLOAD") { await downloadReceiptPdf(id, onMessage); onMessage("تم تنزيل سند القبض PDF مع مرفقاته"); }
      else {
        if (!previewWindow) throw new Error("تعذر فتح المعاينة. اسمح بالنوافذ المنبثقة ثم حاول مرة أخرى.");
        const result = await createReceiptPdf(id, onMessage);
        const url = URL.createObjectURL(result.blob);
        previewWindow.location.href = url;
        window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
      }
    } catch (error) {
      previewWindow?.close();
      onMessage(error instanceof Error ? error.message : "تعذر تجهيز سند القبض");
    }
    finally { setExportId(""); }
  };

  return <div dir="rtl">
    <header className="mb-5 flex flex-col gap-4 rounded-3xl border border-zinc-200 bg-white p-5 shadow-sm sm:flex-row sm:items-center sm:justify-between">
      <div><span className="text-sm font-bold text-[#dc001c]">الصندوق والمقبوضات</span><h1 className="mt-1 text-2xl font-black text-zinc-950">سندات القبض</h1><p className="mt-2 text-sm leading-6 text-zinc-500">إصدار سند رسمي وتأكيد القبض وأرشفته مع المرفقات.</p></div>
      <button onClick={() => setOpen(true)} className="h-12 rounded-2xl bg-[#dc001c] px-6 text-sm font-bold text-white shadow-[0_10px_24px_rgba(220,0,28,.18)]">+ سند قبض جديد</button>
    </header>
    <div className="mb-4 grid gap-3 sm:grid-cols-3"><Stat label="عدد السندات" value={String(receipts.length)}/><Stat label="إجمالي المقبوض" value={`${money(total)} ر.س`}/><Stat label="الحالة" value="مؤكدة ومؤرشفة"/></div>
    <section className="overflow-hidden rounded-3xl border border-zinc-200 bg-white shadow-sm">
      {receipts.map((item) => <article key={item.id} className="border-b border-zinc-100 p-4 last:border-0 sm:p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center">
          <div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><b className="font-mono text-sm text-[#dc001c]">{item.voucherNumber}</b><span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-bold text-emerald-700">تم القبض</span></div><h3 className="mt-2 text-base font-extrabold text-zinc-900">{item.receivedFrom}</h3><p className="mt-1 text-sm text-zinc-500">{item.purpose} · {item.paymentMethod === "BANK" ? "تحويل بنكي" : "نقدًا"} · {date(item.createdAt)}</p></div>
          <strong className="font-mono text-lg [direction:ltr]">{money(item.amountMinor)} ر.س</strong>
          <div className="grid grid-cols-3 gap-2"><button disabled={exportId === item.id} onClick={() => void runExport(item.id,"PREVIEW")} className="h-11 rounded-xl border border-zinc-200 px-3 text-xs font-bold">معاينة</button><button disabled={exportId === item.id} onClick={() => void runExport(item.id,"DOWNLOAD")} className="h-11 rounded-xl border border-red-200 bg-red-50 px-3 text-xs font-bold text-[#dc001c]">PDF</button><button disabled={exportId === item.id} onClick={() => void runExport(item.id,"SHARE")} className="h-11 rounded-xl border border-emerald-200 bg-emerald-50 px-3 text-xs font-bold text-emerald-700">مشاركة</button></div>
        </div>
      </article>)}
      {!receipts.length ? <div className="p-12 text-center"><b className="text-base">لا توجد سندات قبض حتى الآن</b><p className="mt-2 text-sm text-zinc-500">ابدأ بسند جديد عند استلام مبلغ للصندوق أو الحساب.</p></div> : null}
    </section>
    {open ? <div className="fixed inset-0 z-[180] grid place-items-center overflow-y-auto bg-zinc-950/55 p-3 sm:p-6" onMouseDown={(event) => event.target === event.currentTarget && setOpen(false)}><section className="my-auto w-full max-w-2xl rounded-3xl bg-white p-5 shadow-2xl sm:p-7"><div className="mb-5 flex items-center justify-between"><div><span className="text-sm font-bold text-[#dc001c]">T2 · TITO</span><h2 className="mt-1 text-xl font-black">إصدار سند قبض</h2></div><button onClick={() => setOpen(false)} className="grid h-11 w-11 place-items-center rounded-xl border border-zinc-200 text-xl">×</button></div>
      <div className="grid gap-4 sm:grid-cols-2"><Field label="استلمنا من"><input value={form.receivedFrom} onChange={(e)=>setForm({...form,receivedFrom:e.target.value})} className="input"/></Field><Field label="المبلغ بالريال"><input inputMode="decimal" value={form.amount} onChange={(e)=>setForm({...form,amount:e.target.value})} className="input"/></Field><Field label="طريقة القبض"><select value={form.paymentMethod} onChange={(e)=>setForm({...form,paymentMethod:e.target.value})} className="input"><option value="CASH">نقدًا</option><option value="BANK">تحويل بنكي</option></select></Field><Field label={form.paymentMethod === "BANK" ? "الحساب المستلم" : "الصندوق / الموقع"}><input value={form.destinationAccount} onChange={(e)=>setForm({...form,destinationAccount:e.target.value})} className="input"/></Field>{form.paymentMethod === "BANK" ? <Field label="رقم مرجع التحويل"><input value={form.referenceNumber} onChange={(e)=>setForm({...form,referenceNumber:e.target.value})} className="input"/></Field> : null}<div className="sm:col-span-2"><Field label="وذلك مقابل"><textarea value={form.purpose} onChange={(e)=>setForm({...form,purpose:e.target.value})} className="input min-h-28 resize-none"/></Field></div></div>
      <div className="mt-4 rounded-2xl border border-dashed border-zinc-300 p-4"><div className="flex flex-wrap items-center justify-between gap-3"><div><b className="text-sm">المرفقات</b><p className="mt-1 text-xs text-zinc-500">صور أو PDF أو Word أو Excel، وتظهر بعد السند داخل الملف.</p></div><label className="cursor-pointer rounded-xl bg-zinc-900 px-4 py-3 text-xs font-bold text-white">إضافة مرفقات<input type="file" multiple accept="image/*,.pdf,.doc,.docx,.xls,.xlsx" className="hidden" onChange={(e)=>{void upload(e.target.files);e.target.value="";}}/></label></div>{files.length ? <div className="mt-3 space-y-2">{files.map((file)=><div key={file.id} className="flex items-center justify-between rounded-xl bg-zinc-50 p-3 text-xs"><span className="truncate">{file.name}</span><button onClick={()=>void removeFile(file.id)} className="font-bold text-[#dc001c]">حذف</button></div>)}</div>:null}</div>
      <button disabled={busy} onClick={()=>void create()} className="mt-5 h-12 w-full rounded-2xl bg-[#dc001c] text-sm font-bold text-white disabled:opacity-50">{busy?"جارٍ الحفظ...":"تأكيد القبض وإصدار السند"}</button>
    </section></div>:null}
  </div>;
}

function Stat({label,value}:{label:string;value:string}) { return <div className="rounded-2xl border border-zinc-200 bg-white p-4"><span className="text-xs font-bold text-zinc-400">{label}</span><strong className="mt-1 block text-lg text-zinc-900">{value}</strong></div>; }
function Field({label,children}:{label:string;children:React.ReactNode}) { return <label className="block"><span className="mb-2 block text-sm font-bold text-zinc-700">{label} <i className="not-italic text-[#dc001c]">*</i></span>{children}</label>; }
