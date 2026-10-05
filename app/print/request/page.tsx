"use client";

import { useEffect, useState } from "react";
import { downloadRequestPdf, shareRequestPdf } from "../../../lib/client-document-export";

type PrintData = {
  request: { id: string; requestNumber: string; createdAt?: string; createdByName: string; departmentCode: string; priority: string; categoryCode: string; expenseType: string; beneficiaryName: string; beneficiaryType: string; paymentMethod: string; bankName?: string | null; iban?: string | null; accountHolderName?: string | null; accountNameMatch?: string | null; accountMismatchReason?: string | null; cashRecipient?: string | null; amountMinor: number; purpose: string; details: string; status: string; revisionNumber: number };
  attachments: Array<{ id: string; originalName: string; mimeType: string; sizeBytes: number; uploadedByEmail: string }>;
  actions: Array<{ id: string; action: string; actorName: string; actorEmail: string; note?: string | null; createdAt: string }>;
  currentResponsible?: { label?: string } | string;
};

const statusNames: Record<string, string> = { DRAFT: "مسودة", PENDING_DEPARTMENT: "بانتظار الإدارة", RETURNED_TO_CREATOR: "معاد للتعديل", PENDING_ACCOUNTING: "بانتظار الحسابات", RETURNED_ACCOUNTING_TO_DEPARTMENT: "معاد للإدارة", PENDING_EXECUTIVE: "بانتظار المدير التنفيذي", READY_FOR_BATCH: "جاهز لإعداد المسير", IN_BATCH_DRAFT: "داخل مسير سابق", PENDING_BATCH_APPROVAL: "بانتظار اعتماد مسير سابق", READY_FOR_EXECUTION: "جاهز للتنفيذ", EXECUTION_PENDING: "قيد التنفيذ", EXECUTION_FAILED: "متعذر التنفيذ", EXECUTED: "تم التنفيذ والأرشفة", REJECTED_FINAL: "مرفوض نهائيًا", CANCELLED: "ملغى" };
const actionNames: Record<string, string> = { SUBMIT: "إعداد وإرسال الطلب", APPROVE: "اعتماد المرحلة", REAPPROVE: "إعادة الاعتماد", RETURN: "إعادة للمرحلة السابقة", REJECT: "رفض نهائي", RESUBMIT: "إعادة إرسال", EDIT_BEFORE_APPROVAL: "تعديل قبل الاعتماد", REMOVE_ATTACHMENT: "إزالة مرفق", CANCEL: "إلغاء الطلب" };
const money = (minor: number) => (minor / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const date = (value?: string) => value ? new Intl.DateTimeFormat("ar-SA", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Riyadh" }).format(new Date(value)) : "—";

export default function PrintRequestPage() {
  const [data, setData] = useState<PrintData | null>(null);
  const [requestId] = useState(() => {
    if (typeof window === "undefined") return "";
    const params = new URLSearchParams(window.location.search);
    return params.get("id") || params.get("requestId") || "";
  });
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("جارٍ تحميل الطلب ومرفقاته...");
  useEffect(() => {
    if (!requestId) return;
    fetch(`/api/requests/${requestId}`, { cache: "no-store" })
      .then(async (response) => ({ ok: response.ok, value: await response.json().catch(() => null) }))
      .then(({ ok, value }) => { if (ok && value?.request) { setData({ ...value, attachments: value.attachments || [], currentResponsible: value.currentResponsible?.label || value.currentResponsible }); setMessage(""); } else setMessage(value?.error || "تعذر تحميل الطلب"); })
      .catch(() => setMessage("تعذر الاتصال لتحميل الطلب"));
  }, [requestId]);
  if (!data) return <main dir="rtl" className="grid min-h-screen place-items-center bg-zinc-100 p-5"><section className="w-full max-w-md rounded-2xl border border-zinc-200 bg-white p-7 text-center"><span className="mx-auto grid h-12 w-12 place-items-center rounded-xl bg-[#dc001c] font-sans text-lg font-black text-white">T2</span><h1 className="mt-4 text-base font-bold">معاينة طلب الصرف</h1><p className="mt-2 text-[10px] leading-6 text-zinc-500">{requestId ? message : "لم يُحدد الطلب المطلوب. افتح المعاينة من شاشة الطلب."}</p></section></main>;
  const request = data.request;
  const share = async () => {
    setBusy(true);
    try {
      const result = await shareRequestPdf(requestId, setMessage);
      setMessage(result.shared ? "فُتحت مشاركة الجهاز وملف PDF مرفق؛ اختر واتساب لإرساله." : "هذا المتصفح لا يدعم إرفاق الملف مباشرة؛ تم تنزيل PDF لتختاره داخل واتساب.");
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") setMessage("تم إلغاء نافذة المشاركة دون إرسال الملف.");
      else setMessage(error instanceof Error ? error.message : "تعذرت مشاركة ملف PDF");
    } finally { setBusy(false); }
  };
  const download = async () => {
    setBusy(true);
    try { await downloadRequestPdf(requestId, setMessage); setMessage("تم تنزيل PDF الكامل بالمرفقات"); }
    catch (error) { setMessage(error instanceof Error ? error.message : "تعذر إنشاء PDF"); }
    finally { setBusy(false); }
  };
  return <main dir="rtl" className="min-h-screen bg-zinc-100 px-3 py-6 text-[#17191f] print:bg-white print:p-0">
    <style>{`@media print { @page { size: A4 portrait; margin: 0; } }`}</style>
    <div className="mx-auto mb-3 max-w-[210mm] rounded-xl border border-zinc-200 bg-white p-3 print:hidden"><div className="flex flex-wrap items-center justify-between gap-2"><div><strong className="text-[11px]">معاينة طلب الصرف</strong><p className="mt-1 text-[8px] text-zinc-400">A4 · PDF فعلي يشمل النموذج والصور وصفحات مرفقات PDF</p></div><div className="flex flex-wrap gap-2"><button disabled={busy} onClick={() => void share()} className="flex h-10 items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 text-[9px] font-bold text-emerald-700 disabled:opacity-50"><OutputIcon kind="whatsapp"/>مشاركة الجهاز · PDF</button><button disabled={busy} onClick={() => void download()} className="flex h-10 items-center gap-2 rounded-xl bg-[#dc001c] px-5 text-[9px] font-bold text-white disabled:opacity-50"><OutputIcon kind="pdf"/>تنزيل PDF الكامل</button></div></div>{message ? <p className="mt-2 rounded-lg bg-zinc-50 px-3 py-2 text-[8px] text-zinc-600">{message}</p> : null}</div>
    <article className="print-request-page mx-auto min-h-[297mm] w-full max-w-[210mm] overflow-visible bg-white shadow-xl print:min-h-0 print:max-w-none print:overflow-visible print:shadow-none">
      <header className="flex h-[32mm] items-center justify-between bg-[#dc001c] px-[10mm] text-white"><div className="flex items-center gap-4"><span className="font-sans text-[38px] font-black tracking-[-.16em] [direction:ltr]">T2</span><i className="h-12 w-px bg-white/40"/><div><strong className="block font-sans text-[18px] tracking-wider [direction:ltr]">TITO</strong><span className="text-[11px]">تيتو · تسوق كل جديد</span></div></div><div className="text-left"><h1 className="text-[18px] font-bold">طلب صرف مالي</h1><span className="mt-2 block font-mono text-[10px] [direction:ltr]">{request.requestNumber}</span></div></header>
      <div className="px-[9mm] py-[7mm]">
        <section className="mb-[5mm] grid grid-cols-4 overflow-hidden rounded-lg border border-zinc-200 text-[8px]"><Meta label="تاريخ الطلب" value={date(request.createdAt)}/><Meta label="مُعدّ الطلب" value={request.createdByName}/><Meta label="الإدارة" value={request.departmentCode}/><Meta label="الحالة / المسؤول" value={`${statusNames[request.status] || request.status} · ${typeof data.currentResponsible === "string" ? data.currentResponsible : data.currentResponsible?.label || "—"}`} last/></section>
        <Section title="أولًا: بيانات الطلب والمستفيد"><div className="grid grid-cols-2 gap-x-5 gap-y-3"><Item label="نوع الصرف" value={request.expenseType}/><Item label="المستفيد" value={request.beneficiaryName}/><Item label="طريقة الصرف" value={request.paymentMethod === "BANK" ? "تحويل بنكي" : "نقدًا من الصندوق"}/><Item label="المبلغ المطلوب" value={`${money(request.amountMinor)} ر.س`} ltr/>{request.paymentMethod === "BANK" ? <><Item label="البنك" value={request.bankName || "—"}/><Item label="رقم الآيبان" value={request.iban || "—"} ltr/><Item label="اسم صاحب الحساب" value={request.accountHolderName || "—"}/><Item label="مطابقة الحساب" value={request.accountNameMatch === "MATCHED" ? "✓ مطابق لاسم المستفيد" : `غير مطابق · ${request.accountMismatchReason || "يلزم التحقق"}`}/></> : <Item label="مستلم النقد" value={request.cashRecipient || request.beneficiaryName}/>}</div></Section>
        <Section title="ثانيًا: الغرض والبيان"><div className="rounded-lg bg-[#fff4f5] p-3"><small className="text-[7px] text-[#dc001c]">الغرض من الصرف</small><strong className="mt-1 block text-[9px]">{request.purpose}</strong></div><div className="mt-2 rounded-lg border border-zinc-200 p-3"><small className="text-[7px] text-zinc-400">البيان التفصيلي</small><p className="mt-1 text-[9px] leading-6">{request.details}</p></div></Section>
        <Section title={`ثالثًا: المرفقات (${data.attachments.length})`}><div className="grid grid-cols-3 gap-2">{data.attachments.length ? data.attachments.map((file,index) => <div key={file.id} className="rounded-lg border border-zinc-200 p-2.5"><div className="flex items-center gap-2"><span className="grid h-7 w-7 shrink-0 place-items-center rounded-md bg-red-50 text-[7px] font-bold text-[#dc001c]">{file.mimeType.includes("pdf") ? "PDF" : "IMG"}</span><div className="min-w-0"><strong className="block break-words text-[7px]">{index + 1}. {file.originalName}</strong><small className="text-[6px] text-zinc-400">✓ مكتمل · {(file.sizeBytes / 1024).toFixed(0)} KB</small></div></div></div>) : <p className="col-span-3 rounded-lg bg-zinc-50 p-3 text-[7px] text-zinc-400">لا توجد مرفقات مرتبطة.</p>}</div></Section>
        <Section title="رابعًا: الاعتمادات والتوصيات"><div className="grid grid-cols-3 gap-2">{data.actions.map((action) => <Approval key={action.id} title={actionNames[action.action] || action.action} name={action.actorName} decision={action.note || "تم تسجيل الإجراء"} time={date(action.createdAt)}/>) }{!data.actions.length ? <Approval title="المرحلة الحالية" name={typeof data.currentResponsible === "string" ? data.currentResponsible : data.currentResponsible?.label || "—"} decision={statusNames[request.status] || request.status} time="بانتظار الإجراء" pending/> : null}</div></Section>
        <footer className="mt-[5mm] flex items-center justify-between border-t border-zinc-200 pt-3 text-[6px] text-zinc-400"><span>صادر إلكترونيًا من نظام حوكمة الصرف – TITO</span><span>الإصدار {request.revisionNumber} · سجل التدقيق محفوظ</span><span className="font-mono [direction:ltr]">{request.requestNumber} · الترقيم داخل ملف PDF</span></footer>
      </div>
    </article>
  </main>;
}

function Section({ title, children }: { title: string; children: React.ReactNode }) { return <section className="mb-[5mm] print:[break-inside:auto]"><h2 className="mb-3 border-r-[3px] border-[#dc001c] pr-2 text-[10px] font-bold">{title}</h2>{children}</section>; }
function Item({ label, value, ltr }: { label: string; value: string; ltr?: boolean }) { return <div><small className="block text-[7px] text-zinc-400">{label}</small><strong className={`mt-1 block break-words text-[9px] ${ltr ? "font-mono [direction:ltr] text-right" : ""}`}>{value}</strong></div>; }
function Meta({ label, value, last }: { label: string; value: string; last?: boolean }) { return <div className={`p-3 ${last ? "" : "border-l border-zinc-200"}`}><small className="block text-[6px] text-zinc-400">{label}</small><strong className="mt-1 block break-words">{value}</strong></div>; }
function Approval({ title, name, decision, time, pending }: { title: string; name: string; decision: string; time: string; pending?: boolean }) { return <div className={`min-h-[29mm] break-inside-avoid rounded-lg border p-2.5 ${pending ? "border-dashed border-zinc-300 bg-zinc-50" : "border-zinc-200"}`}><small className="text-[6px] font-bold text-[#dc001c]">{title}</small><strong className="mt-2 block break-words text-[8px]">{name}</strong><p className={`mt-1.5 whitespace-pre-wrap break-words text-[7px] leading-5 ${pending ? "text-amber-700" : "text-zinc-600"}`}>{decision}</p><time className="mt-2 block border-t border-zinc-100 pt-2 text-[6px] text-zinc-400">{time}</time></div>; }

function OutputIcon({ kind }: { kind: "pdf" | "whatsapp" }) {
  if (kind === "whatsapp") return <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M20.5 11.7a8.5 8.5 0 0 1-12.7 7.4L3 20.5l1.4-4.7A8.5 8.5 0 1 1 20.5 11.7Z"/><path d="M8 7.8c.4-.8.8-.7 1.3-.6l1 2.2-.9 1.2c.8 1.6 2 2.8 3.6 3.5l1-1 2.3 1c.2 1.4-.8 2.5-2.2 2.6-3 .1-7.2-3.8-7-7.1.1-.7.3-1.3.9-1.8Z"/></svg>;
  return <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 2h9l5 5v15H5zM14 2v6h5M8 13h8M8 17h8"/></svg>;
}
