"use client";

import { useEffect, useMemo, useState } from "react";
import { downloadPaymentRunPdf, sharePaymentRunPdf } from "../../../lib/client-document-export";
import { downloadPaymentRunXlsx } from "../../../lib/client-xlsx-export";

type RunData = {
  paymentRun: { id: string; runNumber: string; paymentMethod: string; settlementGroup: string; sourceAccount: string; status: string; preparedByEmail: string; approvedByEmail?: string | null; approvedAt?: string | null; digitalSignatureCode?: string | null; totalMinor: number; itemCount: number; createdAt: string };
  items: Array<{ id: string; amountMinor: number; executionStatus: string; bankReference?: string | null; failureReason?: string | null; executiveApproval?: { actorName?: string | null; actorEmail: string; note?: string | null; createdAt: string } | null; execution?: { executedByEmail?: string | null; executedAt?: string | null; executedAmountMinor?: number | null; status?: string | null } | null; request: { id: string; requestNumber: string; departmentCode: string; expenseType: string; beneficiaryName: string; beneficiaryType?: string | null; cashRecipient?: string | null; purpose?: string | null; bankName?: string | null; iban?: string | null; accountHolderName?: string | null; accountNameMatch?: string | null; priority: string } | null }>;
  actions: Array<{ id: string; action: string; actorEmail: string; note?: string | null; createdAt: string }>;
};

const groupNames: Record<string, string> = { SUPPLIERS: "الموردون", EMPLOYEES: "الموظفون", GOVERNMENT: "السداد الحكومي", MAINTENANCE_OPERATIONS: "التشغيل والصيانة", MARKETING: "التسويق والإعلانات", TECHNOLOGY: "تقنية المعلومات", MONTHLY_OBLIGATIONS: "الالتزامات الشهرية" };
const runStatusNames: Record<string, string> = { BATCH_DRAFT: "تحت الإعداد", BATCH_PENDING_APPROVAL: "بانتظار الاعتماد", BATCH_RETURNED: "معاد للحسابات", BATCH_APPROVED: "جاهز للتنفيذ", BATCH_EXECUTING: "قيد التنفيذ", BATCH_CLOSED: "مغلق ومنفذ", BATCH_REJECTED: "مرفوض" };
const money = (minor: number) => (minor / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const date = (value?: string | null) => value ? new Intl.DateTimeFormat("ar-SA", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Riyadh" }).format(new Date(value)) : "—";

export default function PaymentRunPrintPage() {
  const [requestId] = useState(() => typeof window === "undefined" ? "" : new URLSearchParams(window.location.search).get("id") || "");
  const [data, setData] = useState<RunData | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("جارٍ تحميل بيانات المسير...");
  const [meRole, setMeRole] = useState("");
  const [workflowNote, setWorkflowNote] = useState("");
  const [executionValues, setExecutionValues] = useState<Record<string, { reference: string; reason: string }>>({});
  useEffect(() => {
    if (!requestId) return;
    fetch(`/api/payment-runs/${requestId}`, { cache: "no-store" })
      .then(async (response) => ({ ok: response.ok, value: await response.json().catch(() => null) }))
      .then(({ ok, value }) => { if (ok && value?.paymentRun) { setData(value); setMessage(""); } else setMessage(value?.error || "تعذر تحميل المسير"); })
      .catch(() => setMessage("تعذر الاتصال لتحميل المسير"));
  }, [requestId]);
  useEffect(() => { fetch("/api/me", { cache: "no-store" }).then((response) => response.ok ? response.json() : null).then((value) => value?.user?.systemRole && setMeRole(value.user.systemRole)).catch(() => undefined); }, []);
  const approved = useMemo(() => data?.actions.find((item) => item.action === "APPROVE"), [data]);
  const executiveApprovals = useMemo(() => data?.items.map((item) => item.executiveApproval).filter((item): item is NonNullable<typeof item> => Boolean(item)) || [], [data]);
  if (!data) return <main dir="rtl" className="grid min-h-screen place-items-center bg-zinc-100 p-5"><section className="w-full max-w-md rounded-2xl border border-zinc-200 bg-white p-7 text-center"><span className="mx-auto grid h-12 w-12 place-items-center rounded-xl bg-[#dc001c] font-sans text-lg font-black text-white">T2</span><h1 className="mt-4 text-base font-bold">معاينة المسير</h1><p className="mt-2 text-[10px] leading-6 text-zinc-500">{requestId ? message : "لم يُحدد المسير المطلوب. افتح المستند من شاشة المسيرات."}</p></section></main>;
  const { paymentRun: run } = data;
  const download = async () => { setBusy(true); try { await downloadPaymentRunPdf(data); setMessage("تم تنزيل المسير PDF بهوية TITO"); } finally { setBusy(false); } };
  const share = async () => { setBusy(true); try { const result = await sharePaymentRunPdf(data); setMessage(result.shared ? "فُتحت المشاركة والمسير PDF مرفق" : "تم تنزيل PDF؛ اختره من واتساب"); } finally { setBusy(false); } };
  const excel = () => { const filename = downloadPaymentRunXlsx(data); setMessage(`تم تنزيل ${filename}`); };
  const reload = async () => {
    const response = await fetch(`/api/payment-runs/${requestId}`, { cache: "no-store" });
    const value = await response.json();
    if (!response.ok) throw new Error(value.error || "تعذر تحديث المسير");
    setData(value);
  };
  const runAction = async (action: string) => {
    if (busy) return;
    if (!workflowNote.trim()) return setMessage("اكتب توصية أو سببًا واضحًا قبل تنفيذ الإجراء");
    setBusy(true);
    try {
      const response = await fetch(`/api/payment-runs/${requestId}/action`, { method: "POST", headers: { "Content-Type": "application/json", "Idempotency-Key": `t2-run-${crypto.randomUUID()}` }, body: JSON.stringify({ action, note: workflowNote.trim() }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "تعذر تنفيذ إجراء المسير");
      await reload(); setWorkflowNote(""); setMessage("تم تسجيل الإجراء والتوصية وإرسال التنبيه للمسؤول التالي");
    } catch (error) { setMessage(error instanceof Error ? error.message : "تعذر تنفيذ الإجراء"); }
    finally { setBusy(false); }
  };
  const excludeItem = async (item: RunData["items"][number]) => {
    if (busy) return;
    if (!workflowNote.trim()) return setMessage("اكتب سبب استبعاد العملية للتصحيح أولًا");
    setBusy(true);
    try {
      const response = await fetch(`/api/payment-runs/${requestId}`, { method: "PATCH", headers: { "Content-Type": "application/json", "Idempotency-Key": `t2-run-item-${crypto.randomUUID()}` }, body: JSON.stringify({ action: "EXCLUDE_ITEM", itemId: item.id, reason: workflowNote.trim() }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "تعذر استبعاد العملية");
      await reload(); setWorkflowNote(""); setMessage("استُبعدت العملية من المسير وعاد الطلب إلى قائمة الجاهز للمسير");
    } catch (error) { setMessage(error instanceof Error ? error.message : "تعذر استبعاد العملية"); }
    finally { setBusy(false); }
  };
  const executeItem = async (item: RunData["items"][number], status: "EXECUTED" | "FAILED") => {
    if (busy) return;
    const values = executionValues[item.id] || { reference: "", reason: "" };
    if (status === "EXECUTED" && !values.reference.trim()) return setMessage("رقم مرجع البنك أو سند الاستلام إلزامي");
    if (status === "FAILED" && !values.reason.trim()) return setMessage("سبب تعذر التنفيذ إلزامي");
    setBusy(true);
    try {
      const response = await fetch(`/api/payment-runs/${requestId}/items/${item.id}/execute`, { method: "POST", headers: { "Content-Type": "application/json", "Idempotency-Key": `t2-execution-${crypto.randomUUID()}` }, body: JSON.stringify({ status, executedAmountMinor: status === "EXECUTED" ? item.amountMinor : undefined, bankReference: values.reference.trim() || undefined, reason: values.reason.trim() || undefined }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "تعذر تسجيل التنفيذ");
      await reload(); setMessage(result.autoClosed ? "اكتمل آخر تنفيذ وأُغلق المسير وأُرشف تلقائيًا" : status === "EXECUTED" ? "تم تسجيل تنفيذ العملية ومرجعها؛ بقي المسير مفتوحًا للعمليات الأخرى" : "تم تسجيل التعذر وبقيت المهمة مفتوحة لإعادة المحاولة");
    } catch (error) { setMessage(error instanceof Error ? error.message : "تعذر تسجيل التنفيذ"); }
    finally { setBusy(false); }
  };
  const canPrepare = ["ADMIN", "ACCOUNTING"].includes(meRole) && ["BATCH_DRAFT", "BATCH_RETURNED"].includes(run.status);
  const canApprove = ["ADMIN", "EXECUTIVE", "BATCH_APPROVER"].includes(meRole) && run.status === "BATCH_PENDING_APPROVAL";
  const canExecute = ["ADMIN", "ACCOUNTING", "EXECUTOR"].includes(meRole) && ["BATCH_APPROVED", "BATCH_EXECUTING"].includes(run.status);
  const allExecuted = data.items.every((item) => ["EXECUTED", "EXCLUDED"].includes(item.executionStatus));
  const canCorrect = ["ADMIN", "ACCOUNTING"].includes(meRole) && (["BATCH_DRAFT", "BATCH_RETURNED"].includes(run.status) || (run.status === "BATCH_APPROVED" && data.items.every((item) => ["PENDING", "EXCLUDED"].includes(item.executionStatus))));
  const canCloseLegacy = ["ADMIN", "ACCOUNTING", "EXECUTOR"].includes(meRole) && run.status === "BATCH_EXECUTING" && allExecuted && !data.actions.some((item) => item.action === "AUTO_CLOSE");
  const activeItems = data.items.filter((item) => item.executionStatus !== "EXCLUDED");
  const executorNames = [...new Set(data.items.map((item) => item.execution?.executedByEmail).filter((value): value is string => Boolean(value)))];
  const executiveNames = [...new Set(executiveApprovals.map((item) => item.actorName || item.actorEmail))];
  const executiveDate = executiveApprovals.map((item) => item.createdAt).sort().at(-1);
  const runCreatedAction = data.actions.find((item) => ["CREATE", "SUBMIT"].includes(item.action));
  return <main dir="rtl" className="min-h-screen bg-zinc-100 p-3 text-[#17191f] print:bg-white print:p-0">
    <style>{`@media print { @page { size: A4 landscape; margin: 0; } }`}</style>
    <div className="mx-auto mb-3 max-w-[297mm] rounded-xl border border-zinc-200 bg-white p-3 print:hidden"><div className="flex flex-wrap items-center justify-between gap-2"><div><strong className="text-[12px]">المعاينة النهائية للمسير</strong><p className="mt-1 text-[9px] text-zinc-500">A4 أفقي · رأس وجدول متكرران لكل صفحة · توقيع نهائي</p></div><div className="flex flex-wrap gap-2"><button disabled={busy} onClick={() => share().catch(() => setMessage("تعذرت المشاركة"))} className="flex h-11 items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 text-[9px] font-bold text-emerald-700 disabled:opacity-50"><OutputIcon kind="whatsapp"/>واتساب · PDF</button><button disabled={busy} onClick={excel} className="flex h-11 items-center gap-2 rounded-xl border border-emerald-200 bg-white px-4 text-[9px] font-bold text-emerald-700 disabled:opacity-50"><OutputIcon kind="excel"/>Excel</button><button disabled={busy} onClick={() => download().catch(() => setMessage("تعذر إنشاء PDF"))} className="flex h-11 items-center gap-2 rounded-xl bg-[#dc001c] px-5 text-[10px] font-bold text-white disabled:opacity-50"><OutputIcon kind="pdf"/>تنزيل PDF</button></div></div>{message ? <p className="mt-2 rounded-lg bg-zinc-50 px-3 py-2 text-[8px] text-zinc-600">{message}</p> : null}</div>
    {(canPrepare || canApprove || canExecute || canCorrect || canCloseLegacy) ? <section className="mx-auto mb-3 max-w-[297mm] rounded-2xl border border-zinc-200 bg-white p-4 print:hidden"><div className="flex flex-wrap items-start justify-between gap-3"><div><small className="text-xs font-bold text-[#dc001c]">مساحة تنفيذ المسير</small><h2 className="mt-1 text-base font-bold">{runStatusNames[run.status] || run.status}</h2><p className="mt-1 text-xs leading-5 text-zinc-500">الموافقات محفوظة داخل كل طلب؛ هذا المسير للتجميع والتنفيذ والإغلاق التلقائي فقط.</p></div><span className="rounded-lg bg-zinc-100 px-3 py-2 text-xs font-bold text-zinc-600">{meRole}</span></div>
      {(canPrepare || canApprove || canCorrect || canCloseLegacy) ? <><label className="mt-3 block text-xs font-bold text-zinc-600">التوصية أو سبب الإجراء <span className="text-[#dc001c]">*</span></label><textarea value={workflowNote} onChange={(event) => setWorkflowNote(event.target.value)} rows={2} className="mt-1.5 w-full rounded-xl border border-zinc-200 p-3 text-sm leading-6 outline-none focus:border-red-300 focus:ring-4 focus:ring-red-50" placeholder="اكتب السبب أو التوصية بوضوح..."/></> : null}
      <div className="mt-3 flex flex-wrap gap-2">{canPrepare ? <button disabled={busy} onClick={() => void runAction(run.status === "BATCH_DRAFT" ? "SUBMIT" : "RESUBMIT")} className="h-11 rounded-xl border border-zinc-900 bg-white px-4 text-xs font-bold text-zinc-900 disabled:opacity-50">إرسال المسير السابق للاعتماد</button> : null}{canApprove ? <><button disabled={busy} onClick={() => void runAction("APPROVE")} className="h-11 rounded-xl bg-emerald-600 px-5 text-xs font-bold text-white disabled:opacity-50">اعتماد المسير السابق وفتحه للتنفيذ</button><button disabled={busy} onClick={() => void runAction("RETURN")} className="h-11 rounded-xl bg-amber-500 px-4 text-xs font-bold text-white disabled:opacity-50">إعادة للحسابات</button><button disabled={busy} onClick={() => void runAction("REJECT")} className="h-11 rounded-xl bg-[#dc001c] px-4 text-xs font-bold text-white disabled:opacity-50">رفض المسير السابق</button></> : null}{canCloseLegacy ? <button disabled={busy} onClick={() => void runAction("CLOSE")} className="h-11 rounded-xl bg-emerald-600 px-5 text-xs font-bold text-white disabled:opacity-40">إغلاق مسير سابق مكتمل</button> : null}</div>
      {canCorrect ? <div className="mt-4 space-y-2 border-t border-zinc-100 pt-4"><p className="text-xs leading-5 text-zinc-500">قبل بدء أي تنفيذ يمكن استبعاد عملية بسبب مسجل؛ يعود الطلب تلقائيًا إلى «جاهز لإعداد المسير».</p>{data.items.filter((item) => item.executionStatus !== "EXCLUDED").map((item) => <div key={item.id} className="flex items-center justify-between gap-3 rounded-xl border border-zinc-200 p-3"><span className="min-w-0"><b className="block truncate text-sm">{item.request?.requestNumber} · {item.request?.beneficiaryName}</b><small className="mt-1 block text-xs text-zinc-500">{money(item.amountMinor)} ر.س</small></span><button disabled={busy || data.items.filter((row) => row.executionStatus !== "EXCLUDED").length <= 1} onClick={() => void excludeItem(item)} className="h-10 shrink-0 rounded-lg border border-red-200 bg-red-50 px-3 text-xs font-bold text-[#dc001c] disabled:opacity-40">استبعاد للتصحيح</button></div>)}</div> : null}
      {canExecute ? <div className="mt-4 space-y-2 border-t border-zinc-100 pt-4"><div className="mb-3 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs leading-5 text-emerald-800">سجّل كل عملية مباشرة. عند اكتمال آخر عملية يغلق النظام المسير ويؤرشف طلباته تلقائيًا.</div>{data.items.map((item) => <div key={item.id} className="grid gap-2 rounded-xl border border-zinc-200 p-3 sm:grid-cols-[1fr_180px_180px_auto]"><div>{item.request ? <a href={`/print/request?id=${encodeURIComponent(item.request.id)}`} target="_blank" rel="noreferrer" className="block text-sm font-bold text-[#dc001c] underline decoration-red-200 underline-offset-4">{item.request.requestNumber} · {item.request.beneficiaryName}</a> : <b className="block text-sm">طلب غير متاح</b>}<small className="mt-1 block text-xs text-zinc-500">{money(item.amountMinor)} ر.س · {item.executionStatus === "EXECUTED" ? "تم التنفيذ" : item.executionStatus === "FAILED" ? `متعذر: ${item.failureReason || "بحاجة لإعادة محاولة"}` : "بانتظار التنفيذ"}</small></div><input disabled={item.executionStatus === "EXECUTED"} value={executionValues[item.id]?.reference || ""} onChange={(event) => setExecutionValues((values) => ({ ...values, [item.id]: { reference: event.target.value, reason: values[item.id]?.reason || "" } }))} className="h-11 rounded-lg border border-zinc-200 px-3 text-xs disabled:bg-zinc-50" placeholder={run.paymentMethod === "BANK" ? "مرجع البنك" : "رقم سند الاستلام"}/><input disabled={item.executionStatus === "EXECUTED"} value={executionValues[item.id]?.reason || ""} onChange={(event) => setExecutionValues((values) => ({ ...values, [item.id]: { reference: values[item.id]?.reference || "", reason: event.target.value } }))} className="h-11 rounded-lg border border-zinc-200 px-3 text-xs disabled:bg-zinc-50" placeholder="سبب التعذر عند الحاجة"/><div className="flex gap-1"><button disabled={busy || item.executionStatus === "EXECUTED" || item.executionStatus === "EXCLUDED"} onClick={() => void executeItem(item, "EXECUTED")} className="h-11 rounded-lg bg-emerald-600 px-3 text-xs font-bold text-white disabled:opacity-40">تم الدفع</button><button disabled={busy || item.executionStatus === "EXECUTED" || item.executionStatus === "EXCLUDED"} onClick={() => void executeItem(item, "FAILED")} className="h-11 rounded-lg bg-red-50 px-3 text-xs font-bold text-[#dc001c] disabled:opacity-40">متعذر</button></div></div>)}</div> : null}
    </section> : null}
    <article className="print-run-page mx-auto min-h-[210mm] w-full max-w-[297mm] overflow-hidden bg-white shadow-xl print:min-h-0 print:max-w-none print:shadow-none">
      <header className="flex h-[28mm] items-center justify-between bg-[#dc001c] px-[9mm] text-white"><div className="flex items-center gap-5"><span className="font-sans text-[40px] font-black tracking-[-.17em] [direction:ltr]">T2</span><span className="h-12 w-px bg-white/35"/><div><strong className="block font-sans text-[19px] tracking-[.14em] [direction:ltr]">TITO</strong><span className="text-[11px]">تيتو · تسوق كل جديد</span></div></div><div className="text-left"><h1 className="text-[18px] font-bold">مسير {run.paymentMethod === "BANK" ? "تحويلات بنكية" : "صرف نقدي"} · {groupNames[run.settlementGroup] || run.settlementGroup}</h1><b className="mt-2 block font-mono text-[11px] [direction:ltr]">{run.runNumber}</b></div></header>
      <div className="p-[8mm]">
        <section className="mb-4 grid grid-cols-2 overflow-hidden rounded-lg border border-zinc-200 text-[8px] sm:grid-cols-3 lg:grid-cols-6">{[["تاريخ المسير", date(run.createdAt)], [run.paymentMethod === "BANK" ? "الحساب البنكي المصدر" : "الصندوق / الموقع", run.sourceAccount], ["عدد العمليات", `${run.itemCount} عملية`], ["الإجمالي", `${money(run.totalMinor)} ر.س`], ["الحالة", runStatusNames[run.status] || run.status], ["الاعتماد التنفيذي", executiveApprovals.length ? `${executiveApprovals.length}/${activeItems.length} موثق` : run.approvedByEmail ? "اعتماد مسير سابق" : "موثق بالطلبات"]].map(([label,value]) => <div key={label} className="border-l border-b border-zinc-200 p-3 last:border-l-0 lg:border-b-0"><small className="block text-[6px] text-zinc-400">{label}</small><strong className="mt-1 block break-words">{value}</strong></div>)}</section>
        <RunTable paymentMethod={run.paymentMethod} items={activeItems} totalMinor={run.totalMinor}/>
        <section className="mt-5 grid grid-cols-3 gap-3"><Signature title="إعداد ومراجعة المسير" name={run.preparedByEmail} note={runCreatedAction?.note || "جُمعت العمليات المعتمدة نهائيًا وتمت مطابقتها"} time={date(runCreatedAction?.createdAt || run.createdAt)}/><Signature title="الاعتماد التنفيذي للطلبات" name={executiveNames.join(" · ") || run.approvedByEmail || approved?.actorEmail || "موثق داخل الطلبات"} note={executiveApprovals.length ? `${executiveApprovals.length} اعتمادًا تنفيذيًا موثقًا` : approved?.note || "مسير سابق أو اعتماد محفوظ داخل الطلب"} time={date(executiveDate || run.approvedAt || approved?.createdAt)} code={executiveApprovals.length ? "توقيعات الطلبات محفوظة" : run.digitalSignatureCode}/><Signature title={run.paymentMethod === "BANK" ? "التنفيذ / الختم البنكي" : "أمين الصندوق / الاستلام"} name={executorNames.join(" · ") || "بانتظار المنفذ"} note={executorNames.length ? "سُجل منفذ كل عملية ومرجعها إلكترونيًا" : "الاسم والتوقيع والختم النهائي"} time={date(data.items.find((item) => item.execution?.executedAt)?.execution?.executedAt)} /></section>
        <footer className="mt-4 flex justify-between border-t border-zinc-200 pt-3 text-[6px] text-zinc-400"><span>وثيقة رسمية صادرة من نظام حوكمة الصرف – TITO</span><span>تظهر الأولوية للترتيب فقط ولا تتجاوز أي مرحلة اعتماد</span><span className="font-mono [direction:ltr]">{run.runNumber} · الترقيم داخل ملف PDF</span></footer>
      </div>
    </article>
  </main>;
}

function RunTable({ paymentMethod, items, totalMinor }: { paymentMethod: string; items: RunData["items"]; totalMinor: number }) {
  const isBank = paymentMethod === "BANK";
  const headers = isBank
    ? ["م", "رقم الطلب", "الإدارة / النوع", "الاعتماد التنفيذي", "المستفيد", "البيان", "البنك", "الآيبان", "المطابقة", "المبلغ ر.س", "المرجع / الحالة"]
    : ["م", "رقم الطلب", "الإدارة / النوع", "الاعتماد التنفيذي", "مستلم النقد", "البيان", "المبلغ ر.س", "حالة الصرف", "سند / مرجع الاستلام"];
  return <div className="overflow-x-auto"><table className="w-full min-w-[1020px] table-fixed border-collapse text-[7px]"><thead className="bg-zinc-900 text-white"><tr>{headers.map((head) => <th key={head} className={`border border-zinc-700 p-2 ${head === "م" ? "w-[4%]" : head === "البيان" ? "w-[16%]" : head === "الآيبان" ? "w-[15%]" : head.includes("المبلغ") ? "w-[9%]" : ""}`}>{head}</th>)}</tr></thead><tbody>{items.map((item,index) => { const request = item.request; const approvalName = item.executiveApproval?.actorName || item.executiveApproval?.actorEmail || "اعتماد سابق"; const common = <><td className="border border-zinc-200 p-2 text-center">{index + 1}</td><td className="border border-zinc-200 p-2 font-mono text-center [direction:ltr]">{request ? <a href={`/print/request?id=${encodeURIComponent(request.id)}`} target="_blank" rel="noreferrer" title="فتح الطلب ومرفقاته" className="font-bold text-[#dc001c] underline decoration-red-200 underline-offset-2">{request.requestNumber}</a> : "—"}</td><td className="border border-zinc-200 p-2"><b>{request?.departmentCode || "—"}</b><br/><small className="text-zinc-500">{request?.expenseType || "—"}</small></td><td className="border border-zinc-200 p-2 text-center"><b>{approvalName}</b><br/><small className="text-zinc-500">{item.executiveApproval?.createdAt ? date(item.executiveApproval.createdAt) : "موثق"}</small></td></>; return <tr key={item.id} className={request?.priority === "CRITICAL" ? "bg-red-50" : ""}>{common}{isBank ? <><td className="border border-zinc-200 p-2 font-bold">{request?.beneficiaryName || "—"}</td><td className="border border-zinc-200 p-2 leading-4">{request?.purpose || "—"}</td><td className="border border-zinc-200 p-2">{request?.bankName || "—"}</td><td className="break-all border border-zinc-200 p-2 font-mono text-center [direction:ltr]">{request?.iban || "—"}</td><td className="border border-zinc-200 p-2 text-center">{request?.accountNameMatch === "MATCHED" ? "✓ مطابق" : "غير مطابق"}</td><td className="border border-zinc-200 p-2 text-left font-mono font-bold [direction:ltr]">{money(item.amountMinor)}</td><td className="border border-zinc-200 p-2 text-center"><b className="font-mono">{item.bankReference || "—"}</b><br/><small>{item.executionStatus}</small></td></> : <><td className="border border-zinc-200 p-2 font-bold">{request?.cashRecipient || request?.beneficiaryName || "—"}</td><td className="border border-zinc-200 p-2 leading-4">{request?.purpose || "—"}</td><td className="border border-zinc-200 p-2 text-left font-mono font-bold [direction:ltr]">{money(item.amountMinor)}</td><td className="border border-zinc-200 p-2 text-center">{item.executionStatus}</td><td className="border border-zinc-200 p-2 font-mono text-center">{item.bankReference || "—"}</td></>}</tr>; })}</tbody><tfoot><tr className="bg-zinc-100 font-bold"><td colSpan={isBank ? 9 : 6} className="border border-zinc-200 p-2 text-left">الإجمالي المعتمد</td><td className="border border-zinc-200 p-2 text-left font-mono [direction:ltr]">{money(totalMinor)}</td><td colSpan={isBank ? 1 : 2} className="border border-zinc-200"/></tr></tfoot></table></div>;
}

function OutputIcon({ kind }: { kind: "pdf" | "excel" | "whatsapp" }) {
  if (kind === "whatsapp") return <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M20.5 11.7a8.5 8.5 0 0 1-12.7 7.4L3 20.5l1.4-4.7A8.5 8.5 0 1 1 20.5 11.7Z"/><path d="M8 7.8c.4-.8.8-.7 1.3-.6l1 2.2-.9 1.2c.8 1.6 2 2.8 3.6 3.5l1-1 2.3 1c.2 1.4-.8 2.5-2.2 2.6-3 .1-7.2-3.8-7-7.1.1-.7.3-1.3.9-1.8Z"/></svg>;
  if (kind === "excel") return <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 3h11l5 5v13H4zM15 3v5h5M8 11l4 6M12 11l-4 6M15 12h2M15 15h2"/></svg>;
  return <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 2h9l5 5v15H5zM14 2v6h5M8 13h8M8 17h8"/></svg>;
}

function Signature({ title, name, note, time, code }: { title: string; name: string; note: string; time: string; code?: string | null }) { return <div className="min-h-[34mm] rounded-lg border border-zinc-200 p-3"><small className="text-[7px] font-bold text-[#dc001c]">{title}</small><strong className="mt-2 block text-[9px]">{name}</strong><p className="mt-2 line-clamp-2 text-[7px] leading-5 text-zinc-500">{note}</p><div className="mt-2 flex justify-between border-t border-zinc-100 pt-2 text-[6px] text-zinc-400"><span>{time}</span><b className="font-mono text-emerald-700 [direction:ltr]">{code || "توقيع إلكتروني محفوظ"}</b></div></div>; }
