"use client";

import { useCallback, useEffect, useState } from "react";
import RequestWizard from "./request-wizard";
import RequestDetail from "./request-detail";
import WorkspaceView from "./workspace-views-v2";

type IconName = "home" | "tasks" | "file" | "batch" | "archive" | "chart" | "users" | "settings" | "bell" | "search" | "plus" | "clock" | "check" | "bank" | "wallet" | "backup" | "logout" | "arrow" | "close";

function Icon({ name, size = 20 }: { name: IconName; size?: number }) {
  const nodes: Record<IconName, React.ReactNode> = {
    home: <><path d="m3 11 9-8 9 8"/><path d="M5 10v10h14V10M9 20v-6h6v6"/></>,
    tasks: <><rect x="4" y="3" width="16" height="18" rx="2"/><path d="M9 8h6M9 12h6M9 16h4"/><path d="m6.5 8 .5.5 1-1"/></>,
    file: <><path d="M6 2h9l4 4v16H6zM14 2v5h5M9 12h6M9 16h6"/></>,
    batch: <><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 10h18M8 15h2M14 15h2"/></>,
    archive: <><path d="M4 7v14h16V7M3 3h18v4H3zM9 12h6"/></>,
    chart: <><path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/></>,
    users: <><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></>,
    settings: <><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06-2.83 2.83-.06-.06A1.7 1.7 0 0 0 15 19.4a1.7 1.7 0 0 0-1 1.5V21H10v-.1A1.7 1.7 0 0 0 7.1 19.7l-.06.06-2.83-2.83.06-.06A1.7 1.7 0 0 0 4.6 15a1.7 1.7 0 0 0-1.5-1H3v-4h.1A1.7 1.7 0 0 0 4.3 7.1l-.06-.06 2.83-2.83.06.06A1.7 1.7 0 0 0 10 3.1V3h4v.1a1.7 1.7 0 0 0 2.9 1.2l.06-.06 2.83 2.83-.06.06A1.7 1.7 0 0 0 19.4 9a1.7 1.7 0 0 0 1.5 1h.1v4h-.1a1.7 1.7 0 0 0-1.5 1Z"/></>,
    bell: <><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4"/></>,
    search: <><circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/></>,
    plus: <path d="M12 5v14M5 12h14"/>,
    clock: <><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></>,
    check: <path d="m5 12 4 4L19 6"/>,
    bank: <><path d="m3 9 9-5 9 5M5 10v7M9 10v7M15 10v7M19 10v7M3 20h18"/></>,
    wallet: <><path d="M3 6h16a2 2 0 0 1 2 2v11H3zM3 6V4h14v2M16 12h5"/></>,
    backup: <><path d="M20 15a5 5 0 0 1-5 5H6a4 4 0 0 1-.5-7.97A7 7 0 0 1 19 9a5 5 0 0 1 1 6Z"/><path d="m9 13 3-3 3 3M12 10v7"/></>,
    logout: <><path d="M10 17l5-5-5-5M15 12H3M14 3h7v18h-7"/></>,
    arrow: <><path d="M5 12h14M13 6l6 6-6 6"/></>,
    close: <path d="M6 6l12 12M18 6 6 18"/>,
  };
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{nodes[name]}</svg>;
}

const navItems: { label: string; icon: IconName; badge?: number }[] = [
  { label: "لوحة التحكم", icon: "home" },
  { label: "مهامي", icon: "tasks" },
  { label: "الالتزامات الشهرية", icon: "clock" },
  { label: "الطلبات", icon: "file" },
  { label: "المسيرات", icon: "batch" },
  { label: "سندات القبض", icon: "wallet" },
  { label: "الأرشيف", icon: "archive" },
  { label: "التقارير", icon: "chart" },
  { label: "المستخدمون", icon: "users" },
];

type RequestSummary = {
  id: string; requestNumber: string; expenseType: string; beneficiaryName: string; amountMinor: number;
  status: string; currentStage: string; priority: string; createdAt?: string; updatedAt?: string; closedAt?: string | null;
};
type NotificationSummary = {
  id: string; title: string; body: string; entityType: string; entityId: string; actionUrl: string;
  isRead: boolean; createdAt: string;
};
type PaymentRunSummary = {
  id: string; runNumber: string; paymentMethod: string; settlementGroup: string; status: string;
  itemCount: number; totalMinor: number; createdAt: string; preparedByEmail: string;
};

const statusNames: Record<string, string> = {
  DRAFT: "مسودة", PENDING_DEPARTMENT: "اعتماد الإدارة", RETURNED_TO_CREATOR: "معاد للتعديل",
  PENDING_ACCOUNTING: "مراجعة الحسابات", RETURNED_ACCOUNTING_TO_DEPARTMENT: "معاد للإدارة",
  PENDING_EXECUTIVE: "اعتماد المدير التنفيذي",
  READY_FOR_BATCH: "جاهز للمسير", IN_BATCH_DRAFT: "داخل مسير", PENDING_BATCH_APPROVAL: "اعتماد المسير",
  READY_FOR_EXECUTION: "جاهز للتنفيذ", EXECUTION_PENDING: "قيد التنفيذ", EXECUTED: "تم التنفيذ",
  EXECUTION_FAILED: "متعذر التنفيذ", REJECTED_FINAL: "مرفوض", CANCELLED: "ملغى",
};
const runGroupNames: Record<string, string> = {
  SUPPLIERS: "الموردون", EMPLOYEES: "الموظفون", GOVERNMENT: "السداد الحكومي",
  MAINTENANCE_OPERATIONS: "التشغيل والصيانة", MARKETING: "التسويق والإعلانات",
  TECHNOLOGY: "تقنية المعلومات", MONTHLY_OBLIGATIONS: "الالتزامات الشهرية", OTHER: "أخرى",
};
const runStatusNames: Record<string, string> = {
  BATCH_DRAFT: "تحت الإعداد", BATCH_PENDING_APPROVAL: "بانتظار اعتماد المسير",
  BATCH_RETURNED: "معاد للحسابات", BATCH_APPROVED: "جاهز للتنفيذ",
  BATCH_EXECUTING: "قيد التنفيذ", BATCH_CLOSED: "مغلق ومنفذ", BATCH_REJECTED: "مرفوض",
};
const closedStatuses = new Set(["EXECUTED", "REJECTED_FINAL", "CANCELLED"]);
const formatMoney = (minor: number) => (minor / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const timeAgo = (value?: string) => {
  if (!value) return "الآن";
  const minutes = Math.max(0, Math.round((Date.now() - new Date(value).getTime()) / 60_000));
  if (minutes < 1) return "الآن";
  if (minutes < 60) return `منذ ${minutes} دقيقة`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `منذ ${hours} ساعة`;
  return `منذ ${Math.floor(hours / 24)} يوم`;
};

export default function TitoApp() {
  const [active, setActive] = useState("لوحة التحكم");
  const [drawer, setDrawer] = useState(false);
  const [mobileMenu, setMobileMenu] = useState(false);
  const [notices, setNotices] = useState(false);
  const [toast, setToast] = useState("");
  const [backupBusy, setBackupBusy] = useState(false);
  const [openRequestId, setOpenRequestId] = useState<string | null>(null);
  const [editRequestId, setEditRequestId] = useState<string | null>(null);
  const [me, setMe] = useState<{ fullName: string; email: string; systemRole: string; jobTitle?: string | null } | null>(null);
  const [accessState, setAccessState] = useState<"LOADING" | "READY" | "DENIED">("LOADING");
  const [requestRows, setRequestRows] = useState<RequestSummary[]>([]);
  const [notificationRows, setNotificationRows] = useState<NotificationSummary[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [paymentRunRows, setPaymentRunRows] = useState<PaymentRunSummary[]>([]);
  const [lastBackupAt, setLastBackupAt] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/me", { cache: "no-store" })
      .then(async (response) => ({ ok: response.ok, body: await response.json().catch(() => null) }))
      .then(({ ok, body }) => {
        if (ok && body?.user) { setMe(body.user); setAccessState("READY"); }
        else setAccessState("DENIED");
      })
      .catch(() => setAccessState("DENIED"));
  }, []);

  useEffect(() => {
    const openRequest = (event: Event) => setOpenRequestId((event as CustomEvent<{ requestId: string }>).detail.requestId);
    const editRequest = (event: Event) => { const requestId = (event as CustomEvent<{ requestId: string }>).detail.requestId; setOpenRequestId(null); setEditRequestId(requestId); setDrawer(true); };
    window.addEventListener("tito:open-request", openRequest);
    window.addEventListener("tito:edit-request", editRequest);
    return () => { window.removeEventListener("tito:open-request", openRequest); window.removeEventListener("tito:edit-request", editRequest); };
  }, []);

  const isAdmin = me?.systemRole === "ADMIN";
  useEffect(() => {
    if (accessState !== "READY") return;
    let cancelled = false;
    const load = async () => {
      const [requestsResult, notificationsResult, runsResult, backupsResult] = await Promise.allSettled([
        fetch("/api/requests?limit=500", { cache: "no-store" }).then((response) => response.ok ? response.json() : Promise.reject()),
        fetch("/api/notifications", { cache: "no-store" }).then((response) => response.ok ? response.json() : Promise.reject()),
        fetch("/api/payment-runs?limit=500", { cache: "no-store" }).then((response) => response.ok ? response.json() : { paymentRuns: [] }),
        isAdmin ? fetch("/api/backups", { cache: "no-store" }).then((response) => response.ok ? response.json() : { backups: [] }) : Promise.resolve({ backups: [] }),
      ]);
      if (cancelled) return;
      if (requestsResult.status === "fulfilled") setRequestRows(requestsResult.value.requests || []);
      if (notificationsResult.status === "fulfilled") {
        setNotificationRows(notificationsResult.value.notifications || []);
        setUnreadCount(notificationsResult.value.unread || 0);
      }
      if (runsResult.status === "fulfilled") setPaymentRunRows(runsResult.value.paymentRuns || []);
      if (backupsResult.status === "fulfilled") setLastBackupAt(backupsResult.value.backups?.find((item: { status: string }) => item.status === "SUCCEEDED")?.completedAt || null);
    };
    void load();
    const refresh = () => { void load(); };
    window.addEventListener("tito:request-updated", refresh);
    return () => { cancelled = true; window.removeEventListener("tito:request-updated", refresh); };
  }, [accessState, isAdmin]);

  const actionableStatuses: Record<string, Set<string>> = {
    REQUESTER: new Set(["DRAFT", "RETURNED_TO_CREATOR"]),
    DEPARTMENT_MANAGER: new Set(["PENDING_DEPARTMENT", "RETURNED_ACCOUNTING_TO_DEPARTMENT"]),
    ACCOUNTING: new Set(["PENDING_ACCOUNTING", "READY_FOR_BATCH"]),
    EXECUTIVE: new Set(["PENDING_EXECUTIVE"]), BATCH_APPROVER: new Set(), EXECUTOR: new Set(),
  };
  const taskRows = requestRows.filter((item) => isAdmin ? !closedStatuses.has(item.status) : actionableStatuses[me?.systemRole || "REQUESTER"]?.has(item.status)).sort((left, right) => {
    const priorityRank: Record<string, number> = { CRITICAL: 0, URGENT: 1, NORMAL: 2 };
    return (priorityRank[left.priority] ?? 2) - (priorityRank[right.priority] ?? 2)
      || new Date(left.createdAt || 0).getTime() - new Date(right.createdAt || 0).getTime();
  });
  const runTaskRows = paymentRunRows.filter((run) => {
    if (isAdmin) return !["BATCH_CLOSED", "BATCH_REJECTED"].includes(run.status);
    if (["EXECUTIVE", "BATCH_APPROVER"].includes(me?.systemRole || "")) return run.status === "BATCH_PENDING_APPROVAL";
    if (me?.systemRole === "EXECUTOR") return ["BATCH_APPROVED", "BATCH_EXECUTING"].includes(run.status);
    if (me?.systemRole === "ACCOUNTING") {
      if (["BATCH_APPROVED", "BATCH_EXECUTING"].includes(run.status)) return true;
      return ["BATCH_DRAFT", "BATCH_RETURNED"].includes(run.status) && run.preparedByEmail === me.email;
    }
    return false;
  });
  const totalTaskCount = taskRows.length + runTaskRows.length;
  const dashboardRunTasks = runTaskRows.slice(0, Math.max(0, 5 - Math.min(taskRows.length, 3)));
  const dashboardRequestTasks = taskRows.slice(0, Math.max(0, 5 - dashboardRunTasks.length));
  const activeRuns = paymentRunRows.filter((item) => !["BATCH_CLOSED", "BATCH_REJECTED"].includes(item.status));
  const urgentTasks = taskRows.filter((item) => ["CRITICAL", "URGENT"].includes(item.priority)).length;
  const readyForBatch = requestRows.filter((item) => item.status === "READY_FOR_BATCH");
  const executedThisMonth = requestRows.filter((item) => {
    if (item.status !== "EXECUTED") return false;
    const date = new Date(item.updatedAt || item.createdAt || 0);
    const now = new Date();
    return date.getUTCFullYear() === now.getUTCFullYear() && date.getUTCMonth() === now.getUTCMonth();
  });
  const stats = [
    { label: "مهامي الآن", value: String(totalTaskCount), note: `${urgentTasks} عاجلة · ${runTaskRows.length} مسيرات`, icon: "tasks" as IconName, color: "text-[#dc001c] bg-[#fff0f2]", target: "مهامي" },
    { label: "جاهز لإعداد المسير", value: String(readyForBatch.length), note: `${formatMoney(readyForBatch.reduce((sum, item) => sum + item.amountMinor, 0))} ر.س`, icon: "batch" as IconName, color: "text-blue-700 bg-blue-50", target: "المسيرات" },
    { label: "منفذ هذا الشهر", value: String(executedThisMonth.length), note: `${formatMoney(executedThisMonth.reduce((sum, item) => sum + item.amountMinor, 0))} ر.س`, icon: "check" as IconName, color: "text-emerald-700 bg-emerald-50", target: "الأرشيف" },
  ];
  const visibleNav = navItems
    .filter((item) => (isAdmin || item.label !== "المستخدمون") && (item.label !== "سندات القبض" || ["ADMIN", "ACCOUNTING", "EXECUTOR", "CASHIER"].includes(me?.systemRole || "")))
    .map((item) => ({ ...item, badge: item.label === "مهامي" ? totalTaskCount : item.label === "المسيرات" ? activeRuns.length : undefined }));
  const userName = me?.fullName || "مستخدم TITO";
  const roleName = me?.jobTitle || ({ ADMIN: "مدير النظام", REQUESTER: "مُعدّ طلب", DEPARTMENT_MANAGER: "مدير إدارة", ACCOUNTING: "مراجع حسابات", EXECUTIVE: "مدير تنفيذي", BATCH_APPROVER: "معتمد مسير سابق", EXECUTOR: "منفذ العملية", CASHIER: "أمين صندوق" }[me?.systemRole || "REQUESTER"] || "مستخدم TITO");
  const roleCapabilities: Record<string, string[]> = {
    REQUESTER: ["إنشاء الطلبات وحفظ المسودات", "تعديل الطلب المعاد إليك", "متابعة الطلب والمرفقات والمخرجات"],
    DEPARTMENT_MANAGER: ["اعتماد طلبات إدارتك أو إعادتها", "تحديد العاجل والأولوية القصوى", "متابعة طلبات الإدارة فقط"],
    ACCOUNTING: ["التدقيق المالي وإعادة الطلب للإدارة", "إعداد مسيرات البنك والصندوق", "متابعة المبالغ والمستفيدين والمطابقة"],
    EXECUTIVE: ["الاعتماد التنفيذي النهائي للطلبات", "إعادة الطلب للحسابات بسبب مسجل", "تحديد الأولوية النهائية قبل الصرف"],
    EXECUTOR: ["تنفيذ المسيرات الجاهزة فقط", "تسجيل المرجع أو سند الاستلام", "إغلاق المسير تلقائيًا باكتمال التنفيذ"],
    CASHIER: ["إصدار سندات القبض الرسمية", "إرفاق مستندات القبض ومشاركتها PDF", "متابعة سجل الصندوق حسب الفرع"],
    BATCH_APPROVER: ["معالجة المسيرات السابقة فقط", "توثيق قرار المسير القديم", "لا تظهر هذه المرحلة للمسيرات الجديدة"],
    ADMIN: ["جميع الصلاحيات مع تسجيل التدخل الاستثنائي", "إدارة المستخدمين والإدارات والنسخ الاحتياطي", "الاطلاع على الأرشيف والتقارير وسجل التدقيق"],
  };

  const flash = useCallback((message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(""), 2400);
  }, []);

  const markNotificationsRead = async () => {
    const response = await fetch("/api/notifications", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ all: true }) });
    if (!response.ok) return flash("تعذر تحديث التنبيهات");
    setNotificationRows((rows) => rows.map((item) => ({ ...item, isRead: true })));
    setUnreadCount(0);
  };

  const openNotification = async (notification: NotificationSummary) => {
    if (!notification.isRead) {
      const response = await fetch("/api/notifications", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: notification.id }) });
      if (response.ok) {
        setNotificationRows((rows) => rows.map((item) => item.id === notification.id ? { ...item, isRead: true } : item));
        setUnreadCount((count) => Math.max(0, count - 1));
      }
    }
    setNotices(false);
    if (notification.entityType === "REQUEST") setOpenRequestId(notification.entityId);
    else if (notification.entityType === "PAYMENT_RUN") window.open(`/print/payment-run?id=${encodeURIComponent(notification.entityId)}`, "_blank", "noopener,noreferrer");
    else setActive("الالتزامات الشهرية");
  };

  const createBackup = async () => {
    if (backupBusy) return;
    setBackupBusy(true);
    try {
      const response = await fetch("/api/backups", { method: "POST" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "تعذر إنشاء النسخة");
      setLastBackupAt(new Date().toISOString());
      flash("اكتملت النسخة الاحتياطية بنجاح");
    } catch (error) {
      flash(error instanceof Error ? error.message : "تعذر إنشاء النسخة الاحتياطية");
    } finally { setBackupBusy(false); }
  };

  if (accessState === "LOADING") return <main className="grid min-h-screen place-items-center bg-[#f5f6f8]" dir="rtl"><div className="text-center"><span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-[#dc001c] font-sans text-xl font-black text-white">T2</span><p className="mt-4 text-sm font-bold">جارٍ التحقق من صلاحيات حسابك...</p></div></main>;
  if (accessState === "DENIED" || !me) return <main className="grid min-h-screen place-items-center bg-[#f5f6f8] px-5" dir="rtl"><section className="w-full max-w-md rounded-3xl border border-zinc-200 bg-white p-7 text-center shadow-xl"><span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-[#dc001c] font-sans text-xl font-black text-white">T2</span><h1 className="mt-5 text-xl font-bold">الحساب غير مرتبط بالنظام</h1><p className="mt-2 text-sm leading-7 text-zinc-500">سجّلت الدخول بنجاح، لكن حسابك غير مفعّل داخل TITO أو تم إيقافه. راجع مدير النظام.</p><a href="/logout" target="_top" className="mt-5 flex h-12 items-center justify-center rounded-xl bg-zinc-900 text-sm font-bold text-white">تسجيل الخروج</a></section></main>;

  return (
    <div className="tito-shell min-h-screen bg-[#f5f6f8] text-[#191b20]">
      <aside className="fixed inset-y-0 right-0 z-30 hidden w-[250px] flex-col border-l border-[#e7e8eb] bg-white p-4 lg:flex">
        <div className="flex items-center gap-3 px-2 pb-7 pt-1">
          <div className="grid h-13 w-13 place-items-center rounded-[15px] bg-[#dc001c] font-sans text-[25px] font-black tracking-[-.18em] text-white shadow-[0_9px_22px_rgba(220,0,28,.18)] [direction:ltr]">T2</div>
          <div><div className="font-sans text-xl font-black tracking-wider [direction:ltr]">TITO</div><div className="mt-1 text-[10px] text-zinc-500">تيتو · تسوق كل جديد</div></div>
        </div>
        <div className="px-3 pb-2 text-[9px] font-bold text-zinc-400">مساحة العمل</div>
        <nav className="space-y-1" aria-label="التنقل الرئيسي">
          {visibleNav.map((item) => (
            <button key={item.label} onClick={() => setActive(item.label)} className={`relative flex h-11 w-full items-center gap-3 rounded-xl px-3 text-[12px] font-semibold transition ${active === item.label ? "bg-[#fff0f2] text-[#dc001c]" : "text-zinc-500 hover:bg-zinc-50 hover:text-zinc-900"}`}>
              <Icon name={item.icon} size={19}/><span>{item.label}</span>{item.badge ? <i className={`mr-auto grid h-5 min-w-5 place-items-center rounded-md px-1 font-sans text-[9px] not-italic ${active === item.label ? "bg-[#dc001c] text-white" : "bg-zinc-100 text-zinc-500"}`}>{item.badge}</i> : null}
              {active === item.label ? <span className="absolute -right-4 h-6 w-[3px] rounded-l bg-[#dc001c]"/> : null}
            </button>
          ))}
        </nav>
        <div className="flex-1"/>
        <div className="mb-3 border-t border-zinc-100 pt-3">
          {isAdmin ? <><button onClick={createBackup} disabled={backupBusy} className="flex h-10 w-full items-center gap-3 rounded-xl px-3 text-[11px] text-zinc-500 hover:bg-zinc-50 disabled:opacity-50"><Icon name="backup" size={18}/>{backupBusy ? "جارٍ إنشاء النسخة..." : "النسخة الاحتياطية"}</button><button onClick={() => setActive("إعدادات النظام")} className="flex h-10 w-full items-center gap-3 rounded-xl px-3 text-[11px] text-zinc-500 hover:bg-zinc-50"><Icon name="settings" size={18}/>إعدادات النظام</button></> : null}
        </div>
        <div className="grid grid-cols-[38px_1fr_28px] items-center gap-2 rounded-xl border border-zinc-200 p-2.5">
          <span className="grid h-9 w-9 place-items-center rounded-[10px] bg-[#fff0f2] text-[11px] font-bold text-[#dc001c]">رط</span>
          <div className="min-w-0"><strong className="block truncate text-[10px]">{userName}</strong><small className="text-[8px] text-zinc-400">{roleName}</small></div>
          <a href="/logout" target="_top" aria-label="تسجيل الخروج" className="text-zinc-400"><Icon name="logout" size={17}/></a>
        </div>
      </aside>

      <div className="lg:mr-[250px]">
        <header className="sticky top-0 z-20 flex h-16 items-center gap-3 border-b border-zinc-200 bg-white/95 px-4 backdrop-blur-xl sm:px-6 lg:h-[72px] lg:px-8">
          <div className="flex items-center gap-2 lg:hidden"><span className="grid h-8 w-8 place-items-center rounded-lg bg-[#dc001c] font-sans text-xs font-black text-white [direction:ltr]">T2</span><strong className="text-[11px]">تيتو</strong></div>
          <div className="min-w-0 flex-1"><strong className="block truncate text-[11px]">{active}</strong><small className="mt-0.5 hidden text-[8px] text-zinc-400 sm:block">نظام حوكمة الصرف والتحويلات</small></div>
          <div className="relative mr-auto">
            <button onClick={() => setNotices(!notices)} aria-label={`التنبيهات؛ ${unreadCount} غير مقروء`} className="relative grid h-10 w-10 place-items-center rounded-xl border border-zinc-200 bg-white text-zinc-600"><Icon name="bell" size={19}/>{unreadCount ? <i className="absolute -left-1 -top-1 grid h-4 min-w-4 place-items-center rounded-full border-2 border-white bg-[#dc001c] px-1 font-sans text-[7px] not-italic text-white">{unreadCount > 99 ? "99+" : unreadCount}</i> : null}</button>
            {notices ? <div className="absolute left-0 top-12 w-[min(360px,calc(100vw-28px))] overflow-hidden rounded-2xl border border-zinc-200 bg-white p-2 shadow-2xl">
              <div className="flex h-11 items-center justify-between border-b border-zinc-100 px-2"><strong className="text-xs">التنبيهات</strong><button onClick={() => void markNotificationsRead()} disabled={!unreadCount} className="text-[8px] text-[#dc001c] disabled:text-zinc-300">تحديد الكل كمقروء</button></div>
              {notificationRows.slice(0, 6).map((notification) => <button key={notification.id} onClick={() => void openNotification(notification)} className={`grid w-full grid-cols-[7px_1fr] gap-2 border-b border-zinc-100 px-2 py-3 text-right ${notification.isRead ? "" : "bg-[#fffafb]"}`}><span className={`mt-1.5 h-1.5 w-1.5 rounded-full ${notification.isRead ? "bg-zinc-300" : "bg-[#dc001c]"}`}/><span><strong className="block text-[10px]">{notification.title}</strong><small className="mt-1 block line-clamp-2 text-[8px] leading-4 text-zinc-400">{notification.body} · {timeAgo(notification.createdAt)}</small></span></button>)}
              {!notificationRows.length ? <p className="px-3 py-7 text-center text-[9px] text-zinc-400">لا توجد تنبيهات جديدة.</p> : null}
              <button onClick={() => { setNotices(false); setActive("مهامي"); }} className="flex h-10 w-full items-center justify-center gap-1 text-[9px] font-bold text-[#dc001c]">فتح المهام <Icon name="arrow" size={14}/></button>
            </div> : null}
          </div>
          <button onClick={() => setDrawer(true)} className="flex h-10 items-center gap-2 rounded-xl bg-[#dc001c] px-3 text-[11px] font-bold text-white shadow-[0_8px_18px_rgba(220,0,28,.16)]"><Icon name="plus" size={18}/><span className="hidden sm:inline">طلب صرف جديد</span></button>
        </header>

        <main className="mx-auto max-w-[1480px] px-4 py-6 pb-24 sm:px-6 lg:px-8 lg:py-8">
          {active !== "لوحة التحكم" ? <WorkspaceView key={active} active={active} systemRole={me.systemRole} userEmail={me.email} onCreate={() => setDrawer(true)} onMessage={flash} onOpenRequest={setOpenRequestId}/> : <>
          <section className="mb-5 flex items-end justify-between gap-4">
            <div><p className="mb-1 text-[9px] font-bold text-[#dc001c]">مساحة عمل {roleName}</p><h1 className="text-[22px] font-bold tracking-tight sm:text-[25px]">مرحبًا، {userName.split(" ")[0]}</h1><p className="mt-1.5 text-[10px] text-zinc-500 sm:text-[11px]">تظهر هنا مهامك وقراراتك فقط، مرتبة حسب الأولوية ووقت الانتظار.</p></div>
            <div className="hidden items-center gap-3 rounded-xl border border-zinc-200 bg-white px-3 py-2.5 sm:flex"><span className="h-2 w-2 rounded-full bg-emerald-500 shadow-[0_0_0_5px_#e7f7ef]"/><div><strong className="block text-[9px]">النظام متصل وآمن</strong><small className="text-[7px] text-zinc-400">{isAdmin ? (lastBackupAt ? `آخر نسخة ${timeAgo(lastBackupAt)}` : "لم تُنشأ نسخة احتياطية بعد") : "تظهر البيانات وفق صلاحيات حسابك"}</small></div></div>
          </section>

          <section className="mb-4 grid gap-2.5 sm:grid-cols-3">
            {stats.map((stat) => <button key={stat.label} onClick={() => setActive(stat.target)} className="group grid min-h-24 grid-cols-[38px_1fr] items-center gap-2.5 rounded-2xl border border-zinc-200 border-t-[3px] border-t-[#dc001c] bg-white p-3 text-right transition hover:-translate-y-0.5 hover:shadow-lg sm:min-h-[104px] sm:grid-cols-[42px_1fr_18px] sm:p-4">
              <span className={`grid h-9 w-9 place-items-center rounded-xl sm:h-10 sm:w-10 ${stat.color}`}><Icon name={stat.icon} size={19}/></span><span><small className="block text-[8px] font-semibold text-zinc-500 sm:text-[9px]">{stat.label}</small><strong className="mt-1 block font-sans text-[21px] leading-none sm:text-[24px]">{stat.value}</strong><em className="mt-1 block text-[7px] not-italic text-zinc-400 sm:text-[8px]">{stat.note}</em></span><span className="hidden text-zinc-300 transition group-hover:text-[#dc001c] sm:block"><Icon name="arrow" size={15}/></span>
            </button>)}
          </section>

          <section className="grid items-start gap-4 xl:grid-cols-[minmax(0,1.65fr)_minmax(290px,.7fr)]">
            <article className="overflow-hidden rounded-2xl border border-zinc-200 bg-white">
              <div className="flex h-16 items-center justify-between border-b border-zinc-100 px-4 sm:px-5"><div><h2 className="text-[13px] font-bold">مهامي الآن</h2><p className="mt-1 text-[8px] text-zinc-400">مرتبة حسب الأولوية ووقت الانتظار</p></div><button onClick={() => setActive("مهامي")} className="flex items-center gap-1 text-[8px] font-bold text-[#dc001c]">عرض الكل <Icon name="arrow" size={14}/></button></div>
              <div className="px-3 sm:px-4">
                {dashboardRequestTasks.map((task) => <button onClick={() => setOpenRequestId(task.id)} key={task.id} className="grid min-h-[84px] w-full grid-cols-[3px_1fr_78px_14px] items-center gap-2.5 border-b border-zinc-100 bg-white py-2 text-right hover:bg-zinc-50 sm:grid-cols-[3px_minmax(150px,1.2fr)_minmax(105px,.6fr)_95px_16px] sm:gap-4">
                  <span className={`h-9 w-[3px] rounded ${["CRITICAL", "URGENT"].includes(task.priority) ? "bg-[#dc001c]" : "bg-zinc-200"}`}/><span><b className="block w-max font-sans text-[7px] text-zinc-400 [direction:ltr]">{task.requestNumber}</b><strong className="mt-1 block text-[10px] sm:text-[11px]">{task.expenseType}</strong><small className="mt-1 block text-[8px] text-zinc-500">{task.beneficiaryName}</small></span>
                  <span className="col-start-2 row-start-2 flex items-center gap-1 sm:col-start-3 sm:row-start-auto sm:block"><b className="w-max rounded-md border border-zinc-200 bg-zinc-50 px-1.5 py-1 text-[7px] text-zinc-600">{statusNames[task.status] || task.status}</b><small className="flex items-center gap-1 text-[7px] text-zinc-400 sm:mt-2"><Icon name="clock" size={11}/>{timeAgo(task.updatedAt || task.createdAt)}</small></span>
                  <span className="col-start-3 row-span-2 row-start-1 text-left [direction:ltr] sm:col-start-4"><strong className="block font-sans text-[11px] sm:text-[12px]">{formatMoney(task.amountMinor)}</strong><small className="text-[7px] text-zinc-400">ر.س</small></span><span className="col-start-4 row-span-2 row-start-1 rotate-180 text-zinc-300 sm:col-start-5"><Icon name="arrow" size={14}/></span>
                </button>)}
                {dashboardRunTasks.map((run) => <button onClick={() => window.open(`/print/payment-run?id=${encodeURIComponent(run.id)}`, "_blank", "noopener,noreferrer")} key={run.id} className="grid min-h-[84px] w-full grid-cols-[3px_1fr_78px_14px] items-center gap-2.5 border-b border-zinc-100 bg-white py-2 text-right hover:bg-zinc-50 sm:grid-cols-[3px_minmax(150px,1.2fr)_minmax(105px,.6fr)_95px_16px] sm:gap-4">
                  <span className="h-9 w-[3px] rounded bg-blue-500"/><span><b className="block w-max font-sans text-[7px] text-blue-600 [direction:ltr]">{run.runNumber}</b><strong className="mt-1 block text-[10px] sm:text-[11px]">مسير {run.paymentMethod === "BANK" ? "بنكي" : "نقدي"}</strong><small className="mt-1 block text-[8px] text-zinc-500">{runGroupNames[run.settlementGroup] || run.settlementGroup} · {run.itemCount} عملية</small></span>
                  <span className="col-start-2 row-start-2 flex items-center gap-1 sm:col-start-3 sm:row-start-auto sm:block"><b className="w-max rounded-md border border-blue-100 bg-blue-50 px-1.5 py-1 text-[7px] text-blue-700">{runStatusNames[run.status] || run.status}</b><small className="flex items-center gap-1 text-[7px] text-zinc-400 sm:mt-2"><Icon name="clock" size={11}/>{timeAgo(run.createdAt)}</small></span>
                  <span className="col-start-3 row-span-2 row-start-1 text-left [direction:ltr] sm:col-start-4"><strong className="block font-sans text-[11px] sm:text-[12px]">{formatMoney(run.totalMinor)}</strong><small className="text-[7px] text-zinc-400">ر.س</small></span><span className="col-start-4 row-span-2 row-start-1 rotate-180 text-zinc-300 sm:col-start-5"><Icon name="arrow" size={14}/></span>
                </button>)}
                {!totalTaskCount ? <div className="grid min-h-[180px] place-items-center text-center"><div><span className="mx-auto grid h-11 w-11 place-items-center rounded-xl bg-emerald-50 text-emerald-700"><Icon name="check" size={20}/></span><strong className="mt-3 block text-[10px]">لا توجد مهام معلقة</strong><p className="mt-1 text-[8px] text-zinc-400">ستظهر هنا فور وصول طلب أو مسير إلى صلاحيتك.</p></div></div> : null}
              </div>
              <div className="flex h-11 items-center gap-4 px-4 text-[7px] text-zinc-400"><span className="flex items-center gap-1"><i className="h-1.5 w-1.5 rounded-full bg-[#dc001c]"/>عاجل أو قصوى</span><span className="flex items-center gap-1"><i className="h-1.5 w-1.5 rounded-full bg-zinc-300"/>عادي</span><button onClick={() => setActive("مهامي")} className="mr-auto font-bold text-[#dc001c]">عرض كل المهام</button></div>
            </article>

            <div className="space-y-4">
              <article className="overflow-hidden rounded-2xl border border-zinc-200 bg-white">
                <div className="border-b border-zinc-100 px-4 py-4"><div className="flex items-center justify-between"><div><h2 className="text-sm font-bold">صلاحياتي ونطاق عملي</h2><p className="mt-1 text-xs text-zinc-500">{roleName} · الصلاحيات تُطبّق تلقائيًا</p></div><span className="grid h-10 w-10 place-items-center rounded-xl bg-[#fff0f2] text-[#dc001c]"><Icon name="settings" size={19}/></span></div></div>
                <div className="space-y-3 p-4">{(roleCapabilities[me.systemRole] || []).map((capability) => <div key={capability} className="flex items-start gap-2.5"><span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-emerald-50 text-emerald-700"><Icon name="check" size={12}/></span><p className="text-xs leading-5 text-zinc-600">{capability}</p></div>)}</div>
                <div className="grid grid-cols-2 gap-2 border-t border-zinc-100 p-3"><button onClick={() => setDrawer(true)} className="flex h-11 items-center justify-center gap-2 rounded-xl bg-[#dc001c] text-xs font-bold text-white"><Icon name="plus" size={17}/>طلب جديد</button><button onClick={() => setActive("التقارير")} className="flex h-11 items-center justify-center gap-2 rounded-xl border border-zinc-200 text-xs font-bold text-zinc-700"><Icon name="chart" size={17}/>التقارير</button></div>
              </article>
              <article className="rounded-2xl bg-zinc-900 p-4 text-white"><small className="text-xs font-bold text-red-300">المسار المعتمد</small><h2 className="mt-1 text-sm font-bold">من الطلب إلى الإغلاق</h2><div className="mt-4 space-y-2.5">{[["1","إعداد الطلب"],["2","اعتماد الإدارة"],["3","مراجعة الحسابات"],["4","اعتماد المدير التنفيذي"],["5","إعداد المسير للتنفيذ"],["6","تنفيذ بنك / صندوق وإغلاق تلقائي"]].map(([step,label],index) => <div key={step} className="flex items-center gap-3"><span className={`grid h-7 w-7 place-items-center rounded-lg text-xs font-bold ${index === 4 ? "bg-[#dc001c] text-white" : "bg-white/10 text-white/75"}`}>{step}</span><span className="text-xs text-white/80">{label}</span></div>)}</div></article>
            </div>
          </section>
          </>}
        </main>
      </div>

      <nav className="fixed inset-x-0 bottom-0 z-40 grid min-h-17 grid-cols-5 border-t border-zinc-200 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden">
        {visibleNav.filter((item) => ["لوحة التحكم", "مهامي"].includes(item.label)).map((item) => <button onClick={() => { setActive(item.label); setMobileMenu(false); }} key={item.label} className={`relative flex min-h-16 flex-col items-center justify-center gap-1 text-[11px] ${active === item.label ? "font-bold text-[#dc001c]" : "text-zinc-500"}`}><Icon name={item.icon} size={20}/><span>{item.label === "لوحة التحكم" ? "الرئيسية" : item.label}</span>{item.badge ? <i className="absolute right-[calc(50%-19px)] top-1 grid h-4 min-w-4 place-items-center rounded-full bg-[#dc001c] px-1 font-sans text-[8px] not-italic text-white">{item.badge}</i> : null}</button>)}
        <button onClick={() => setDrawer(true)} className="relative flex min-h-16 flex-col items-center justify-center gap-1 text-[11px] font-bold text-[#dc001c]"><span className="absolute -top-5 grid h-12 w-12 place-items-center rounded-2xl border-4 border-[#f5f6f8] bg-[#dc001c] text-white shadow-lg"><Icon name="plus" size={22}/></span><span className="mt-7">طلب جديد</span></button>
        <button onClick={() => { setActive("المسيرات"); setMobileMenu(false); }} className={`relative flex min-h-16 flex-col items-center justify-center gap-1 text-[11px] ${active === "المسيرات" ? "font-bold text-[#dc001c]" : "text-zinc-500"}`}><Icon name="batch" size={20}/><span>المسيرات</span>{activeRuns.length ? <i className="absolute right-[calc(50%-19px)] top-1 grid h-4 min-w-4 place-items-center rounded-full bg-[#dc001c] px-1 font-sans text-[8px] not-italic text-white">{activeRuns.length}</i> : null}</button>
        <button onClick={() => setMobileMenu(true)} className="flex min-h-16 flex-col items-center justify-center gap-1 text-[11px] text-zinc-500"><Icon name="settings" size={20}/><span>المزيد</span></button>
      </nav>

      {mobileMenu ? <div className="fixed inset-0 z-[120] bg-zinc-950/45 lg:hidden" onMouseDown={(event) => event.target === event.currentTarget && setMobileMenu(false)}><section className="absolute inset-x-0 bottom-0 max-h-[82vh] overflow-y-auto rounded-t-3xl bg-white p-4 pb-[calc(18px+env(safe-area-inset-bottom))]" dir="rtl"><div className="mb-4 flex items-center justify-between"><div><small className="text-xs font-bold text-[#dc001c]">T2 · TITO</small><h2 className="mt-1 text-lg font-bold">كل وحدات النظام</h2></div><button onClick={() => setMobileMenu(false)} className="grid h-11 w-11 place-items-center rounded-xl border border-zinc-200 text-xl">×</button></div><div className="grid grid-cols-2 gap-2">{visibleNav.filter((item) => !["لوحة التحكم", "مهامي", "المسيرات"].includes(item.label)).map((item) => <button key={item.label} onClick={() => { setActive(item.label); setMobileMenu(false); }} className="flex min-h-14 items-center gap-3 rounded-xl border border-zinc-200 px-3 text-right text-sm font-bold text-zinc-700"><span className="text-[#dc001c]"><Icon name={item.icon} size={19}/></span>{item.label}</button>)}</div>{isAdmin ? <button onClick={() => { void createBackup(); setMobileMenu(false); }} disabled={backupBusy} className="mt-3 flex h-12 w-full items-center justify-center gap-2 rounded-xl border border-zinc-200 text-sm font-bold"><Icon name="backup" size={19}/>{backupBusy ? "جارٍ إنشاء النسخة..." : "إنشاء نسخة احتياطية الآن"}</button> : null}<div className="mt-3 flex items-center gap-3 rounded-2xl bg-zinc-50 p-3"><span className="grid h-10 w-10 place-items-center rounded-xl bg-[#fff0f2] text-sm font-bold text-[#dc001c]">T2</span><span className="min-w-0 flex-1"><b className="block truncate text-sm">{userName}</b><small className="text-xs text-zinc-500">{roleName}</small></span><a href="/logout" target="_top" className="flex h-11 items-center gap-2 rounded-xl bg-zinc-900 px-4 text-xs font-bold text-white"><Icon name="logout" size={17}/>خروج</a></div></section></div> : null}

      <RequestWizard open={drawer} editRequestId={editRequestId} onClose={() => { setDrawer(false); setEditRequestId(null); }} onSuccess={flash} onUpdated={(requestId) => window.dispatchEvent(new CustomEvent("tito:request-updated", { detail: { requestId } }))}/>
      <RequestDetail id={openRequestId} open={Boolean(openRequestId)} onClose={() => setOpenRequestId(null)} onMessage={flash} onEdit={(requestId) => { setOpenRequestId(null); setEditRequestId(requestId); setDrawer(true); }} onChanged={(requestId) => window.dispatchEvent(new CustomEvent("tito:request-updated", { detail: { requestId } }))} onOpenRuns={(request) => { window.sessionStorage.setItem("tito:run-builder-request", request.id); setActive("المسيرات"); }}/>

      {toast ? <div className="toast-enter fixed bottom-20 left-4 z-[140] flex min-h-11 max-w-[calc(100vw-32px)] items-center gap-2 rounded-xl bg-zinc-900 px-4 text-[9px] text-white shadow-2xl lg:bottom-6"><span className="grid h-6 w-6 place-items-center rounded-lg bg-emerald-600"><Icon name="check" size={14}/></span>{toast}</div> : null}
    </div>
  );
}
