"use client";

import { useEffect, useMemo, useState } from "react";
import { shareRequestPdf } from "../lib/client-document-export";
import { downloadRequestsXlsx } from "../lib/client-xlsx-export";
import ReceiptVouchers from "./receipt-vouchers";

type DemoRequest = {
  id: string;
  requestNumber: string;
  expenseType: string;
  categoryCode?: string;
  beneficiaryName: string;
  amountMinor: number;
  status: string;
  currentStage: string;
  createdByName: string;
  departmentCode: string;
  paymentMethod: string;
  settlementGroup?: string;
  priority?: string;
  monthlyObligationId?: string | null;
  createdAt?: string;
  updatedAt?: string;
  closedAt?: string | null;
};
type MonthlyObligation = {
  id: string;
  title: string;
  obligationType: string;
  providerName: string;
  expectedAmountMinor?: number | null;
  dueDay: number;
  reminderDaysBefore: number;
  nextDueDate: string;
  departmentCode: string;
  status: string;
  overdue?: boolean;
};
type PaymentRunListRow = {
  id: string;
  runNumber: string;
  paymentMethod: string;
  settlementGroup: string;
  status: string;
  itemCount: number;
  totalMinor: number;
  createdAt: string;
  closedAt?: string | null;
  preparedByEmail: string;
};

const statusNames: Record<string, string> = {
  DRAFT: "مسودة",
  PENDING_DEPARTMENT: "بانتظار الإدارة",
  RETURNED_TO_CREATOR: "معاد للتعديل",
  PENDING_ACCOUNTING: "بانتظار الحسابات",
  RETURNED_ACCOUNTING_TO_DEPARTMENT: "معاد للإدارة",
  PENDING_EXECUTIVE: "بانتظار المدير التنفيذي",
  READY_FOR_BATCH: "جاهز لإعداد المسير",
  IN_BATCH_DRAFT: "داخل مسير سابق",
  PENDING_BATCH_APPROVAL: "اعتماد مسير سابق",
  READY_FOR_EXECUTION: "جاهز للتنفيذ",
  EXECUTION_PENDING: "قيد التنفيذ",
  EXECUTION_FAILED: "متعذر التنفيذ",
  EXECUTED: "تم التنفيذ",
  REJECTED_FINAL: "مرفوض",
  CANCELLED: "ملغى",
};

const runStatusNames: Record<string, string> = {
  BATCH_DRAFT: "تحت الإعداد",
  BATCH_PENDING_APPROVAL: "بانتظار الاعتماد",
  BATCH_APPROVED: "جاهز للتنفيذ",
  BATCH_EXECUTING: "قيد التنفيذ",
  BATCH_CLOSED: "منفذ",
  BATCH_REJECTED: "مرفوض",
  BATCH_RETURNED: "معاد للحسابات",
};

const runGroupNames: Record<string, string> = {
  SUPPLIERS: "الموردون",
  EMPLOYEES: "الموظفون",
  GOVERNMENT: "السداد الحكومي",
  MAINTENANCE_OPERATIONS: "التشغيل والصيانة",
  MARKETING: "التسويق والإعلانات",
  TECHNOLOGY: "تقنية المعلومات",
  MONTHLY_OBLIGATIONS: "الالتزامات الشهرية",
  OTHER: "أخرى",
};

const requestTaskStatuses: Record<string, Set<string>> = {
  REQUESTER: new Set(["DRAFT", "RETURNED_TO_CREATOR"]),
  DEPARTMENT_MANAGER: new Set([
    "PENDING_DEPARTMENT",
    "RETURNED_ACCOUNTING_TO_DEPARTMENT",
  ]),
  ACCOUNTING: new Set(["PENDING_ACCOUNTING", "READY_FOR_BATCH"]),
  EXECUTIVE: new Set(["PENDING_EXECUTIVE"]),
  BATCH_APPROVER: new Set(),
  EXECUTOR: new Set(),
};

function isRunTask(
  run: PaymentRunListRow,
  systemRole: string,
  userEmail: string,
) {
  if (systemRole === "ADMIN")
    return !["BATCH_CLOSED", "BATCH_REJECTED"].includes(run.status);
  if (["EXECUTIVE", "BATCH_APPROVER"].includes(systemRole))
    return run.status === "BATCH_PENDING_APPROVAL";
  if (systemRole === "EXECUTOR")
    return ["BATCH_APPROVED", "BATCH_EXECUTING"].includes(run.status);
  if (systemRole === "ACCOUNTING") {
    if (["BATCH_APPROVED", "BATCH_EXECUTING"].includes(run.status)) return true;
    return (
      ["BATCH_DRAFT", "BATCH_RETURNED"].includes(run.status) &&
      run.preparedByEmail.toLowerCase() === userEmail.toLowerCase()
    );
  }
  return false;
}

const departments = [
  {
    code: "PURCHASING",
    name: "إدارة المشتريات",
    manager: "سلمان العتيبي",
    users: 7,
    pending: 4,
    color: "bg-red-50 text-red-700",
  },
  {
    code: "FINANCE",
    name: "المالية والحسابات",
    manager: "أحمد فاروق",
    users: 6,
    pending: 11,
    color: "bg-blue-50 text-blue-700",
  },
  {
    code: "HR",
    name: "الموارد البشرية",
    manager: "سارة العسيري",
    users: 4,
    pending: 3,
    color: "bg-emerald-50 text-emerald-700",
  },
  {
    code: "MARKETING",
    name: "إدارة التسويق",
    manager: "نورة الشمري",
    users: 5,
    pending: 2,
    color: "bg-purple-50 text-purple-700",
  },
  {
    code: "BRANCH",
    name: "إدارة الفرع",
    manager: "خالد الشهري",
    users: 18,
    pending: 6,
    color: "bg-amber-50 text-amber-700",
  },
  {
    code: "WAREHOUSE",
    name: "إدارة المستودع",
    manager: "محمد القحطاني",
    users: 9,
    pending: 1,
    color: "bg-zinc-100 text-zinc-700",
  },
  {
    code: "IT",
    name: "تقنية المعلومات",
    manager: "مدير تقنية المعلومات",
    users: 5,
    pending: 2,
    color: "bg-cyan-50 text-cyan-700",
  },
  {
    code: "EXECUTIVE",
    name: "الإدارة التنفيذية",
    manager: "المدير التنفيذي",
    users: 2,
    pending: 4,
    color: "bg-rose-50 text-rose-700",
  },
];

const userRoles = [
  { value: "REQUESTER", label: "مُعدّ طلب", hint: "إنشاء الطلب ومتابعته" },
  {
    value: "DEPARTMENT_MANAGER",
    label: "مدير إدارة",
    hint: "اعتماد طلبات الإدارة",
  },
  { value: "ACCOUNTING", label: "الحسابات", hint: "التدقيق وإعداد المسير" },
  { value: "EXECUTIVE", label: "المدير التنفيذي", hint: "الاعتماد المالي النهائي" },
  { value: "EXECUTOR", label: "منفذ العملية", hint: "التحويل والتنفيذ والإغلاق" },
  { value: "CASHIER", label: "أمين صندوق", hint: "الصرف النقدي وسندات القبض" },
  { value: "ADMIN", label: "مدير النظام", hint: "جميع الصلاحيات وإدارة المستخدمين" },
] as const;

function money(minor: number) {
  return (minor / 100).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}
function riyadhMonthKey(value?: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const parts = new Intl.DateTimeFormat("en", {
    timeZone: "Asia/Riyadh",
    year: "numeric",
    month: "2-digit",
  }).formatToParts(date);
  return `${parts.find((part) => part.type === "year")?.value || ""}-${parts.find((part) => part.type === "month")?.value || ""}`;
}
function monthLabel(key: string) {
  const [year, month] = key.split("-").map(Number);
  return Number.isFinite(year) && Number.isFinite(month)
    ? new Intl.DateTimeFormat("ar-SA", {
        year: "numeric",
        month: "long",
        timeZone: "Asia/Riyadh",
      }).format(new Date(Date.UTC(year, month - 1, 15)))
    : key;
}

async function loadPagedCollection<T>(path: string, field: string) {
  const rows: T[] = [];
  let offset = 0;
  const limit = 500;
  while (offset < 50_000) {
    const separator = path.includes("?") ? "&" : "?";
    const response = await fetch(
      `${path}${separator}limit=${limit}&offset=${offset}`,
      { cache: "no-store" },
    );
    if (!response.ok) throw new Error("تعذر تحميل جميع السجلات");
    const data = (await response.json()) as Record<string, unknown> & {
      page?: { hasMore?: boolean };
    };
    const pageRows = Array.isArray(data[field]) ? (data[field] as T[]) : [];
    rows.push(...pageRows);
    if (!data.page?.hasMore || pageRows.length === 0) break;
    offset += pageRows.length;
  }
  return rows;
}

function OutputIcon({
  kind,
  size = 20,
}: {
  kind: "pdf" | "excel" | "whatsapp" | "bank" | "cash";
  size?: number;
}) {
  if (kind === "whatsapp")
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M20.5 11.7a8.5 8.5 0 0 1-12.7 7.4L3 20.5l1.4-4.7A8.5 8.5 0 1 1 20.5 11.7Z" />
        <path d="M8.2 7.7c.2-.5.4-.5.8-.5h.4l.9 2.1c.1.3 0 .5-.2.7l-.7.8c.7 1.5 1.8 2.6 3.3 3.3l.8-.9c.2-.2.4-.3.7-.2l2 .9c.3.1.5.4.4.7-.2 1.2-1.1 2-2.3 2.1-2.1.1-4.5-1.2-6.2-3-1.6-1.7-2.6-4.1-1.8-5.9Z" />
      </svg>
    );
  if (kind === "excel")
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M4 3h11l5 5v13H4zM15 3v5h5M8 11l4 6M12 11l-4 6M15 12h2M15 15h2" />
      </svg>
    );
  if (kind === "pdf")
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M5 2h9l5 5v15H5zM14 2v6h5" />
        <path d="M8 16v-4h1.2a1.2 1.2 0 0 1 0 2.4H8M12 16v-4h1.1c1.2 0 1.9.8 1.9 2s-.7 2-1.9 2H12M17 16v-4h2" />
      </svg>
    );
  if (kind === "bank")
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="m3 9 9-5 9 5M5 10v7M9 10v7M15 10v7M19 10v7M3 20h18" />
      </svg>
    );
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M3 6h16a2 2 0 0 1 2 2v11H3zM3 6V4h14v2M16 12h5" />
    </svg>
  );
}

function Header({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="mb-5 flex items-end justify-between gap-3">
      <div>
        <p className="mb-1 text-[8px] font-bold text-[#dc001c]">نظام TITO</p>
        <h1 className="text-[22px] font-bold tracking-tight sm:text-[25px]">
          {title}
        </h1>
        <p className="mt-1.5 text-[9px] text-zinc-500 sm:text-[10px]">
          {subtitle}
        </p>
      </div>
      {action}
    </div>
  );
}

function RequestList({
  rows,
  taskMode,
  onOpen,
}: {
  rows: DemoRequest[];
  taskMode?: boolean;
  onOpen: (id: string) => void;
}) {
  return (
    <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-white">
      <div className="hidden grid-cols-[120px_1fr_1fr_120px_120px_80px] gap-3 border-b border-zinc-100 bg-zinc-50 px-4 py-3 text-[8px] font-bold text-zinc-500 md:grid">
        <span>رقم الطلب</span>
        <span>النوع والمستفيد</span>
        <span>مُعدّ الطلب والإدارة</span>
        <span>الحالة</span>
        <span>المبلغ</span>
        <span>الإجراء</span>
      </div>
      {rows.map((row) => (
        <article
          key={row.id}
          className="grid gap-3 border-b border-zinc-100 p-4 last:border-0 md:grid-cols-[120px_1fr_1fr_120px_120px_80px] md:items-center"
        >
          <span className="font-mono text-[9px] font-bold text-[#dc001c] [direction:ltr]">
            {row.requestNumber}
          </span>
          <span>
            <strong className="block text-[10px]">{row.expenseType}</strong>
            <small className="mt-1 block text-[8px] text-zinc-500">
              {row.beneficiaryName} ·{" "}
              {row.paymentMethod === "BANK" ? "بنكي" : "نقدي"}
            </small>
          </span>
          <span>
            <strong className="block text-[9px]">{row.createdByName}</strong>
            <small className="mt-1 block text-[7px] text-zinc-400">
              {row.departmentCode}
            </small>
          </span>
          <span>
            <b className="w-max rounded-lg border border-zinc-200 bg-zinc-50 px-2 py-1.5 text-[7px] text-zinc-600">
              {statusNames[row.status] || row.status}
            </b>
          </span>
          <span className="font-mono text-[10px] font-bold [direction:ltr]">
            {money(row.amountMinor)}{" "}
            <small className="text-[7px] text-zinc-400">ر.س</small>
          </span>
          <button
            onClick={() => onOpen(row.id)}
            className="h-8 rounded-lg bg-zinc-900 px-3 text-[8px] font-bold text-white"
          >
            {taskMode ? "فتح المهمة" : "فتح"}
          </button>
        </article>
      ))}
      {!rows.length ? (
        <div className="grid min-h-[180px] place-items-center px-5 text-center">
          <div>
            <strong className="text-[10px] text-zinc-700">
              لا توجد بيانات في هذه القائمة
            </strong>
            <p className="mt-1 text-[8px] text-zinc-400">
              ستظهر الطلبات تلقائيًا عند إنشائها أو وصولها إلى صلاحيتك.
            </p>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default function WorkspaceView({
  active,
  systemRole,
  userEmail,
  onCreate,
  onMessage,
  onOpenRequest,
}: {
  active: string;
  systemRole: string;
  userEmail: string;
  onCreate: () => void;
  onMessage: (message: string) => void;
  onOpenRequest: (id: string) => void;
}) {
  const [requests, setRequests] = useState<DemoRequest[]>([]);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("ALL");
  const [archiveMonth, setArchiveMonth] = useState("");
  const [reportMonth, setReportMonth] = useState("");
  const [reportMethod, setReportMethod] = useState("ALL");
  const [reportGroup, setReportGroup] = useState("ALL");
  const [obligations, setObligations] = useState<MonthlyObligation[]>([]);
  const [paymentRuns, setPaymentRuns] = useState<PaymentRunListRow[]>([]);
  const [runBuilderOpen, setRunBuilderOpen] = useState(false);
  const [runBuilderBusy, setRunBuilderBusy] = useState(false);
  const [runMethod, setRunMethod] = useState("BANK");
  const [runGroup, setRunGroup] = useState("SUPPLIERS");
  const [runSource, setRunSource] = useState("");
  const [selectedRunRequests, setSelectedRunRequests] = useState<string[]>([]);
  useEffect(() => {
    void loadPagedCollection<DemoRequest>("/api/requests", "requests")
      .then(setRequests)
      .catch(() => undefined);
  }, []);
  useEffect(() => {
    const refresh = () =>
      loadPagedCollection<DemoRequest>("/api/requests", "requests")
        .then(setRequests)
        .catch(() => undefined);
    window.addEventListener("tito:request-updated", refresh);
    return () => window.removeEventListener("tito:request-updated", refresh);
  }, []);
  useEffect(() => {
    if (active !== "المسيرات" || !requests.length) return;
    const requestId = window.sessionStorage.getItem("tito:run-builder-request");
    if (!requestId) return;
    window.sessionStorage.removeItem("tito:run-builder-request");
    const target = requests.find(
      (item) => item.id === requestId && item.status === "READY_FOR_BATCH",
    );
    const timer = window.setTimeout(() => {
      if (target) {
        setRunMethod(target.paymentMethod);
        setRunGroup(target.settlementGroup || "OTHER");
        setSelectedRunRequests([target.id]);
      }
      setRunBuilderOpen(true);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [active, requests]);
  useEffect(() => {
    if (active !== "الالتزامات الشهرية") return;
    fetch("/api/monthly-obligations")
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => {
        if (data?.obligations) setObligations(data.obligations);
      })
      .catch(() => undefined);
  }, [active]);
  useEffect(() => {
    if (!["المسيرات", "مهامي", "الأرشيف", "التقارير"].includes(active)) return;
    void loadPagedCollection<PaymentRunListRow>(
      "/api/payment-runs",
      "paymentRuns",
    )
      .then(setPaymentRuns)
      .catch(() => undefined);
  }, [active]);
  const filtered = useMemo(
    () =>
      requests.filter(
        (item) =>
          (filter === "ALL" || item.status === filter) &&
          (!query ||
            `${item.requestNumber} ${item.expenseType} ${item.beneficiaryName}`
              .toLowerCase()
              .includes(query.toLowerCase())),
      ),
    [requests, filter, query],
  );
  const taskRequests = useMemo(
    () =>
      requests.filter((item) =>
        systemRole === "ADMIN"
          ? !["EXECUTED", "REJECTED_FINAL", "CANCELLED"].includes(item.status)
          : requestTaskStatuses[systemRole]?.has(item.status),
      ),
    [requests, systemRole],
  );
  const filteredTaskRequests = useMemo(
    () =>
      taskRequests.filter((item) => filter === "ALL" || item.status === filter),
    [filter, taskRequests],
  );
  const runTasks = useMemo(
    () => paymentRuns.filter((run) => isRunTask(run, systemRole, userEmail)),
    [paymentRuns, systemRole, userEmail],
  );
  const eligibleRunRequests = requests.filter(
    (item) =>
      item.status === "READY_FOR_BATCH" &&
      item.paymentMethod === runMethod &&
      item.settlementGroup === runGroup,
  );
  const archivedRequests = useMemo(
    () =>
      requests.filter((item) =>
        ["EXECUTED", "REJECTED_FINAL", "CANCELLED"].includes(item.status),
      ),
    [requests],
  );
  const archiveMonths = useMemo(() => {
    const groups = new Map<string, DemoRequest[]>();
    for (const item of archivedRequests) {
      const key = riyadhMonthKey(
        item.closedAt || item.updatedAt || item.createdAt,
      );
      if (!key) continue;
      groups.set(key, [...(groups.get(key) || []), item]);
    }
    return [...groups.entries()]
      .sort(([left], [right]) => right.localeCompare(left))
      .map(([key, rows]) => ({
        key,
        rows,
        executed: rows.filter((item) => item.status === "EXECUTED"),
        totalMinor: rows
          .filter((item) => item.status === "EXECUTED")
          .reduce((sum, item) => sum + item.amountMinor, 0),
      }));
  }, [archivedRequests]);
  const activeArchiveMonth = archiveMonths.some(
    (item) => item.key === archiveMonth,
  )
    ? archiveMonth
    : archiveMonths[0]?.key || "";
  const archiveRows = useMemo(
    () =>
      archivedRequests.filter(
        (item) =>
          riyadhMonthKey(item.closedAt || item.updatedAt || item.createdAt) ===
            activeArchiveMonth &&
          (!query ||
            `${item.requestNumber} ${item.expenseType} ${item.beneficiaryName} ${item.departmentCode}`
              .toLowerCase()
              .includes(query.toLowerCase())),
      ),
    [activeArchiveMonth, archivedRequests, query],
  );
  const archiveRuns = useMemo(
    () =>
      paymentRuns.filter(
        (run) =>
          run.status === "BATCH_CLOSED" &&
          riyadhMonthKey(run.closedAt || run.createdAt) === activeArchiveMonth,
      ),
    [activeArchiveMonth, paymentRuns],
  );
  const reportRows = useMemo(
    () =>
      requests.filter((item) => {
        const monthMatches =
          !reportMonth ||
          riyadhMonthKey(item.closedAt || item.updatedAt || item.createdAt) ===
            reportMonth;
        const methodMatches =
          reportMethod === "ALL" || item.paymentMethod === reportMethod;
        const groupMatches =
          reportGroup === "ALL" || item.settlementGroup === reportGroup;
        return monthMatches && methodMatches && groupMatches;
      }),
    [reportGroup, reportMethod, reportMonth, requests],
  );

  const createPaymentRun = async () => {
    if (!selectedRunRequests.length || !runSource.trim() || runBuilderBusy)
      return onMessage(
        "اختر طلبًا واحدًا على الأقل واكتب الحساب أو الصندوق المصدر",
      );
    setRunBuilderBusy(true);
    try {
      const response = await fetch("/api/payment-runs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          requestIds: selectedRunRequests,
          paymentMethod: runMethod,
          settlementGroup: runGroup,
          sourceAccount: runSource.trim(),
        }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "تعذر إنشاء المسير");
      onMessage(
        `تم إنشاء المسير ${result.paymentRun.runNumber} وأصبح جاهزًا للتنفيذ مباشرة`,
      );
      setRunBuilderOpen(false);
      setSelectedRunRequests([]);
      setRunSource("");
      setPaymentRuns(
        await loadPagedCollection<PaymentRunListRow>(
          "/api/payment-runs",
          "paymentRuns",
        ),
      );
      window.open(
        `/print/payment-run?id=${encodeURIComponent(result.paymentRun.id)}`,
        "_blank",
        "noopener,noreferrer",
      );
    } catch (error) {
      onMessage(error instanceof Error ? error.message : "تعذر إنشاء المسير");
    } finally {
      setRunBuilderBusy(false);
    }
  };

  if (active === "سندات القبض") return <ReceiptVouchers onMessage={onMessage} />;

  if (active === "مهامي")
    return (
      <>
        <Header
          title="مهامي"
          subtitle="طلبات ومسيرات تحتاج إجراءك الآن فقط، وفق دورك الحالي."
          action={
            <span className="rounded-xl bg-[#fff0f2] px-3 py-2 text-[9px] font-bold text-[#dc001c]">
              {filteredTaskRequests.length + runTasks.length} مهام ظاهرة
            </span>
          }
        />
        <div className="mb-3 flex gap-2 overflow-auto pb-1">
          {[
            ["ALL", `الكل ${taskRequests.length + runTasks.length}`],
            [
              "PENDING_DEPARTMENT",
              `اعتماد الإدارة ${taskRequests.filter((item) => item.status === "PENDING_DEPARTMENT").length}`,
            ],
            [
              "PENDING_ACCOUNTING",
              `الحسابات ${taskRequests.filter((item) => item.status === "PENDING_ACCOUNTING").length}`,
            ],
            [
              "PENDING_EXECUTIVE",
              `المدير التنفيذي ${taskRequests.filter((item) => item.status === "PENDING_EXECUTIVE").length}`,
            ],
            [
              "RETURNED_TO_CREATOR",
              `معاد إليّ ${taskRequests.filter((item) => item.status === "RETURNED_TO_CREATOR").length}`,
            ],
            [
              "READY_FOR_BATCH",
              `إعداد المسير ${taskRequests.filter((item) => item.status === "READY_FOR_BATCH").length}`,
            ],
          ].map(([value, label]) => (
            <button
              key={value}
              onClick={() => setFilter(value)}
              className={`h-10 whitespace-nowrap rounded-xl border px-3 text-xs font-bold ${filter === value ? "border-[#dc001c] bg-[#dc001c] text-white" : "border-zinc-200 bg-white text-zinc-600"}`}
            >
              {label}
            </button>
          ))}
          {runTasks.length ? (
            <span className="flex h-10 items-center whitespace-nowrap rounded-xl border border-red-200 bg-red-50 px-3 text-xs font-bold text-[#dc001c]">
              مسيرات تنفيذ {runTasks.length}
            </span>
          ) : null}
        </div>
        {runTasks.length ? (
          <section className="mb-4">
            <div className="mb-2 flex items-center justify-between">
              <strong className="text-[10px]">مهام المسيرات</strong>
              <small className="text-[8px] text-zinc-400">
                اعتماد أو تنفيذ أو إعادة معالجة
              </small>
            </div>
            <div className="grid gap-2 md:grid-cols-2">
              {runTasks.map((run) => (
                <button
                  key={run.id}
                  onClick={() =>
                    window.open(
                      `/print/payment-run?id=${encodeURIComponent(run.id)}`,
                      "_blank",
                      "noopener,noreferrer",
                    )
                  }
                  className="grid grid-cols-[42px_1fr_auto] items-center gap-3 rounded-2xl border border-blue-100 bg-white p-3 text-right transition hover:border-blue-300 hover:shadow-md"
                >
                  <span
                    className={`grid h-10 w-10 place-items-center rounded-xl ${run.paymentMethod === "BANK" ? "bg-blue-50 text-blue-700" : "bg-amber-50 text-amber-700"}`}
                  >
                    <OutputIcon
                      kind={run.paymentMethod === "BANK" ? "bank" : "cash"}
                      size={18}
                    />
                  </span>
                  <span className="min-w-0">
                    <b className="block truncate font-mono text-[8px] text-[#dc001c] [direction:ltr]">
                      {run.runNumber}
                    </b>
                    <strong className="mt-1 block text-[9px]">
                      {runGroupNames[run.settlementGroup] ||
                        run.settlementGroup}{" "}
                      · {run.itemCount} عملية
                    </strong>
                    <small className="mt-1 block text-[7px] text-zinc-400">
                      {runStatusNames[run.status] || run.status}
                    </small>
                  </span>
                  <span className="text-left">
                    <b className="block font-mono text-[10px] [direction:ltr]">
                      {money(run.totalMinor)}
                    </b>
                    <small className="text-[7px] text-zinc-400">
                      ر.س · فتح المهمة
                    </small>
                  </span>
                </button>
              ))}
            </div>
          </section>
        ) : null}
        {filteredTaskRequests.length || !runTasks.length ? (
          <RequestList
            rows={filteredTaskRequests}
            taskMode
            onOpen={onOpenRequest}
          />
        ) : null}
      </>
    );

  if (active === "الالتزامات الشهرية")
    return (
      <>
        <Header
          title="الالتزامات الشهرية"
          subtitle="الكهرباء والاتصالات والإنترنت والاشتراكات والعقود الدورية، بتنبيه واحد قبل الاستحقاق."
          action={
            <button
              onClick={() => {
                onCreate();
                onMessage("فعّل خيار «التزام شهري» داخل الطلب");
              }}
              className="h-10 rounded-xl bg-[#dc001c] px-4 text-[9px] font-bold text-white"
            >
              + طلب والتزام
            </button>
          }
        />
        <div className="mb-4 grid grid-cols-2 gap-2 lg:grid-cols-4">
          {[
            [
              "الالتزامات النشطة",
              String(
                obligations.filter((item) => item.status === "ACTIVE").length,
              ),
            ],
            [
              "تقنية المعلومات",
              String(
                obligations.filter((item) => item.departmentCode === "IT")
                  .length,
              ),
            ],
            [
              "تشغيل وفروع",
              String(
                obligations.filter((item) => item.departmentCode === "BRANCH")
                  .length,
              ),
            ],
            ["منع تكرار التنبيه", "✓"],
          ].map(([label, value]) => (
            <div
              key={label}
              className="rounded-xl border border-zinc-200 bg-white p-3"
            >
              <small className="text-[7px] text-zinc-400">{label}</small>
              <strong className="mt-1 block font-sans text-xl">{value}</strong>
            </div>
          ))}
        </div>
        <div className="grid gap-3 lg:grid-cols-2">
          {obligations.map((item, index) => (
            <article
              key={item.id}
              className="rounded-2xl border border-zinc-200 bg-white p-4"
            >
              <div className="flex items-start justify-between">
                <span className="grid h-10 w-10 place-items-center rounded-xl bg-[#fff0f2] text-[11px] font-bold text-[#dc001c]">
                  {index + 1}
                </span>
                <b className="rounded-lg bg-amber-50 px-2 py-1.5 text-[7px] text-amber-700">
                  تنبيه قبل {item.reminderDaysBefore} أيام
                </b>
              </div>
              <h3 className="mt-4 text-[12px] font-bold">{item.title}</h3>
              <p className="mt-1 text-[8px] text-zinc-500">
                {item.providerName} · {item.departmentCode}
              </p>
              <div className="mt-4 grid grid-cols-2 border-t border-zinc-100 pt-3">
                <span>
                  <small className="block text-[7px] text-zinc-400">
                    الاستحقاق القادم
                  </small>
                  <b className="mt-1 block text-[9px]">
                    {new Intl.DateTimeFormat("ar-SA", {
                      dateStyle: "medium",
                      timeZone: "Asia/Riyadh",
                    }).format(new Date(item.nextDueDate))}
                  </b>
                </span>
                <span className="text-left">
                  <small className="block text-[7px] text-zinc-400">
                    المبلغ المتوقع
                  </small>
                  <b className="mt-1 block font-mono text-[11px] [direction:ltr]">
                    {item.expectedAmountMinor
                      ? `${money(item.expectedAmountMinor)} ر.س`
                      : "غير محدد"}
                  </b>
                </span>
              </div>
              <button
                onClick={() => {
                  onCreate();
                  onMessage(`إنشاء طلب من ${item.title}`);
                }}
                className="mt-4 h-10 w-full rounded-xl border border-red-200 bg-red-50 text-[8px] font-bold text-[#dc001c]"
              >
                إنشاء طلب الصرف لهذا الشهر
              </button>
            </article>
          ))}
          {!obligations.length ? (
            <div className="rounded-2xl border border-zinc-200 bg-white p-10 text-center lg:col-span-2">
              <strong className="text-[10px]">
                لا توجد التزامات شهرية بعد
              </strong>
              <p className="mt-1 text-[8px] text-zinc-400">
                أنشئ طلبًا وفعّل خيار الالتزام الشهري ليبدأ التنبيه التلقائي.
              </p>
            </div>
          ) : null}
        </div>
      </>
    );

  if (active === "الطلبات")
    return (
      <>
        <Header
          title="الطلبات"
          subtitle="متابعة الطلبات والمسودات والمعاد والمكتمل من مكان واحد."
          action={
            <button
              onClick={onCreate}
              className="h-10 rounded-xl bg-[#dc001c] px-4 text-[9px] font-bold text-white"
            >
              + طلب جديد
            </button>
          }
        />
        <div className="mb-3 grid gap-2 sm:grid-cols-[1fr_auto]">
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            className="h-10 rounded-xl border border-zinc-200 bg-white px-3 text-[9px] outline-none focus:border-red-300"
            placeholder="ابحث برقم الطلب أو المستفيد..."
          />
          <select
            value={filter}
            onChange={(event) => setFilter(event.target.value)}
            className="h-10 rounded-xl border border-zinc-200 bg-white px-3 text-[8px]"
          >
            <option value="ALL">جميع الحالات</option>
            {Object.entries(statusNames).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </div>
        <RequestList rows={filtered} onOpen={onOpenRequest} />
      </>
    );

  if (active === "المسيرات") {
    const count = (method: string, group?: string) =>
      paymentRuns.filter(
        (item) =>
          item.paymentMethod === method &&
          (!group || item.settlementGroup === group),
      ).length;
    return (
      <>
        <Header
          title="المسيرات"
          subtitle="البنك والنقد منفصلان، وكل فئة لها مسير مستقل لا يختلط بغيرها."
          action={
            <button
              onClick={() => setRunBuilderOpen(true)}
              className="h-10 rounded-xl bg-[#dc001c] px-4 text-[9px] font-bold text-white"
            >
              + إنشاء مسير
            </button>
          }
        />
        <div className="mb-4 grid grid-cols-2 gap-2 lg:grid-cols-4">
          {[
            ["بنكي · موردون", String(count("BANK", "SUPPLIERS"))],
            ["بنكي · موظفون", String(count("BANK", "EMPLOYEES"))],
            ["كل المسيرات النقدية", String(count("CASH"))],
            [
              "تقنية / شهري",
              String(
                paymentRuns.filter((item) =>
                  ["TECHNOLOGY", "MONTHLY_OBLIGATIONS"].includes(
                    item.settlementGroup,
                  ),
                ).length,
              ),
            ],
          ].map((item) => (
            <div
              key={item[0]}
              className="rounded-xl border border-zinc-200 bg-white p-3"
            >
              <small className="text-[7px] text-zinc-400">{item[0]}</small>
              <strong className="mt-1 block font-sans text-xl">
                {item[1]}
              </strong>
            </div>
          ))}
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          {paymentRuns.map((run) => (
            <article
              key={run.id}
              className="rounded-2xl border border-zinc-200 bg-white p-4 transition hover:-translate-y-0.5 hover:shadow-lg"
            >
              <div className="flex items-start justify-between">
                <span
                  className={`grid h-10 w-10 place-items-center rounded-xl ${run.paymentMethod === "BANK" ? "bg-blue-50 text-blue-700" : "bg-amber-50 text-amber-700"}`}
                >
                  <OutputIcon
                    kind={run.paymentMethod === "BANK" ? "bank" : "cash"}
                  />
                </span>
                <b className="rounded-lg bg-zinc-50 px-2 py-1.5 text-[7px] text-zinc-500">
                  {runStatusNames[run.status] || run.status}
                </b>
              </div>
              <small className="mt-4 block font-mono text-[8px] text-[#dc001c] [direction:ltr]">
                {run.runNumber}
              </small>
              <h3 className="mt-2 text-[12px] font-bold">
                مسير {run.paymentMethod === "BANK" ? "بنكي" : "نقدي"} ·{" "}
                {runGroupNames[run.settlementGroup] || run.settlementGroup}
              </h3>
              <div className="mt-4 flex items-end justify-between border-t border-zinc-100 pt-3">
                <span>
                  <small className="block text-[7px] text-zinc-400">
                    عدد العمليات
                  </small>
                  <strong className="text-[10px]">{run.itemCount} عملية</strong>
                </span>
                <span className="text-left">
                  <small className="block text-[7px] text-zinc-400">
                    الإجمالي
                  </small>
                  <strong className="font-mono text-[12px] [direction:ltr]">
                    {money(run.totalMinor)} ر.س
                  </strong>
                </span>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <button
                  onClick={() =>
                    window.open(
                      `/print/payment-run?id=${encodeURIComponent(run.id)}`,
                      "_blank",
                      "noopener,noreferrer",
                    )
                  }
                  className="h-9 rounded-xl border border-zinc-200 text-[8px] font-bold"
                >
                  فتح المسير
                </button>
                <button
                  onClick={() =>
                    window.open(
                      `/print/payment-run?id=${encodeURIComponent(run.id)}`,
                      "_blank",
                      "noopener,noreferrer",
                    )
                  }
                  className="flex h-9 items-center justify-center gap-2 rounded-xl bg-zinc-900 text-[8px] font-bold text-white"
                >
                  <OutputIcon kind="pdf" size={15} />
                  PDF / Excel
                </button>
              </div>
            </article>
          ))}
          {!paymentRuns.length ? (
            <div className="rounded-2xl border border-zinc-200 bg-white p-10 text-center md:col-span-2">
              <strong className="text-[10px]">لا توجد مسيرات بعد</strong>
              <p className="mt-1 text-[8px] text-zinc-400">
                بعد الاعتماد المالي ستُجمع الطلبات حسب البنك أو النقد والفئة.
              </p>
            </div>
          ) : null}
        </div>
        {runBuilderOpen ? (
          <div
            className="fixed inset-0 z-[180] grid items-end bg-zinc-950/45 sm:place-items-center"
            dir="rtl"
          >
            <section className="max-h-[92vh] w-full overflow-y-auto rounded-t-3xl bg-white p-5 sm:w-[680px] sm:rounded-3xl">
              <div className="flex items-start justify-between">
                <div>
                  <small className="text-[8px] font-bold text-[#dc001c]">
                    الحسابات · إجراء مسجل
                  </small>
                  <h2 className="mt-1 text-[18px] font-bold">
                    إنشاء مسير مستقل
                  </h2>
                  <p className="mt-1 text-[8px] text-zinc-500">
                    حدّد طريقة الصرف والفئة؛ لن يعرض النظام إلا الطلبات المطابقة
                    والمعتمدة ماليًا.
                  </p>
                </div>
                <button
                  onClick={() => setRunBuilderOpen(false)}
                  className="text-xl text-zinc-400"
                >
                  ×
                </button>
              </div>
              <div className="mt-5 grid gap-3 sm:grid-cols-2">
                <Field label="طريقة الصرف">
                  <select
                    value={runMethod}
                    onChange={(event) => {
                      setRunMethod(event.target.value);
                      setSelectedRunRequests([]);
                    }}
                  >
                    <option value="BANK">تحويل بنكي</option>
                    <option value="CASH">صرف نقدي</option>
                  </select>
                </Field>
                <Field label="فئة المسير">
                  <select
                    value={runGroup}
                    onChange={(event) => {
                      setRunGroup(event.target.value);
                      setSelectedRunRequests([]);
                    }}
                  >
                    {Object.entries(runGroupNames).map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                </Field>
              </div>
              <Field
                label={
                  runMethod === "BANK"
                    ? "الحساب البنكي المصدر *"
                    : "الصندوق أو الموقع المصدر *"
                }
              >
                <input
                  value={runSource}
                  onChange={(event) => setRunSource(event.target.value)}
                  placeholder={
                    runMethod === "BANK"
                      ? "مثال: حساب التشغيل الرئيسي"
                      : "مثال: صندوق فرع خميس مشيط"
                  }
                />
              </Field>
              <div className="mt-4">
                <div className="mb-2 flex items-center justify-between">
                  <strong className="text-[9px]">
                    الطلبات الجاهزة المطابقة
                  </strong>
                  <span className="text-[8px] text-zinc-400">
                    {selectedRunRequests.length} محدد
                  </span>
                </div>
                <div className="max-h-[320px] space-y-2 overflow-y-auto">
                  {eligibleRunRequests.map((request) => {
                    const selected = selectedRunRequests.includes(request.id);
                    return (
                      <button
                        key={request.id}
                        onClick={() =>
                          setSelectedRunRequests((items) =>
                            selected
                              ? items.filter((id) => id !== request.id)
                              : [...items, request.id],
                          )
                        }
                        className={`grid w-full grid-cols-[24px_1fr_auto] items-center gap-3 rounded-xl border p-3 text-right ${selected ? "border-[#dc001c] bg-red-50" : "border-zinc-200"}`}
                      >
                        <span
                          className={`grid h-6 w-6 place-items-center rounded-lg border ${selected ? "border-[#dc001c] bg-[#dc001c] text-white" : "border-zinc-300"}`}
                        >
                          {selected ? "✓" : ""}
                        </span>
                        <span>
                          <b className="block font-mono text-[8px] text-[#dc001c] [direction:ltr]">
                            {request.requestNumber}
                          </b>
                          <small className="mt-1 block text-[8px] text-zinc-500">
                            {request.beneficiaryName} · {request.expenseType}
                          </small>
                        </span>
                        <strong className="font-mono text-[10px] [direction:ltr]">
                          {money(request.amountMinor)} ر.س
                        </strong>
                      </button>
                    );
                  })}
                  {!eligibleRunRequests.length ? (
                    <p className="rounded-xl bg-zinc-50 p-8 text-center text-[9px] text-zinc-400">
                      لا توجد طلبات معتمدة ماليًا لهذه الطريقة والفئة.
                    </p>
                  ) : null}
                </div>
              </div>
              <div className="mt-4 flex items-center justify-between rounded-xl bg-zinc-50 p-3">
                <span className="text-[8px] text-zinc-500">إجمالي المسير</span>
                <strong className="font-mono text-[14px] [direction:ltr]">
                  {money(
                    eligibleRunRequests
                      .filter((item) => selectedRunRequests.includes(item.id))
                      .reduce((sum, item) => sum + item.amountMinor, 0),
                  )}{" "}
                  ر.س
                </strong>
              </div>
              <button
                disabled={
                  runBuilderBusy ||
                  !selectedRunRequests.length ||
                  !runSource.trim()
                }
                onClick={() => void createPaymentRun()}
                className="mt-4 h-12 w-full rounded-xl bg-[#dc001c] text-sm font-bold text-white disabled:opacity-40"
              >
                {runBuilderBusy
                  ? "جارٍ إنشاء المسير..."
                  : "إنشاء المسير وفتحه للتنفيذ"}
              </button>
            </section>
          </div>
        ) : null}
      </>
    );
  }

  if (active === "المستخدمون") return <UsersView onMessage={onMessage} />;

  if (active === "الأرشيف") {
    const executed = archiveRows.filter((item) => item.status === "EXECUTED");
    const executedTotal = executed.reduce(
      (sum, item) => sum + item.amountMinor,
      0,
    );
    const bankTotal = executed
      .filter((item) => item.paymentMethod === "BANK")
      .reduce((sum, item) => sum + item.amountMinor, 0);
    const cashTotal = executed
      .filter((item) => item.paymentMethod === "CASH")
      .reduce((sum, item) => sum + item.amountMinor, 0);
    return (
      <>
        <Header
          title="الأرشيف الشهري"
          subtitle="إقفالات موثقة شهرًا بشهر، تشمل الطلبات والمسيرات المنفذة والمرفوض والملغى."
        />
        <div className="grid gap-4 lg:grid-cols-[260px_minmax(0,1fr)]">
          <aside className="h-max rounded-2xl border border-zinc-200 bg-white p-3 lg:sticky lg:top-24">
            <div className="flex items-center justify-between px-2 pb-2">
              <strong className="text-sm">الإقفالات الشهرية</strong>
              <span className="rounded-lg bg-[#fff0f2] px-2 py-1 text-xs font-bold text-[#dc001c]">
                {archiveMonths.length}
              </span>
            </div>
            <div className="max-h-[62vh] space-y-1 overflow-y-auto">
              {archiveMonths.map((month) => (
                <button
                  key={month.key}
                  onClick={() => setArchiveMonth(month.key)}
                  className={`w-full rounded-xl border p-3 text-right transition ${activeArchiveMonth === month.key ? "border-red-200 bg-[#fff5f6] text-[#dc001c]" : "border-transparent hover:bg-zinc-50"}`}
                >
                  <span className="flex items-center justify-between">
                    <b className="text-sm">{monthLabel(month.key)}</b>
                    <small className="text-xs">{month.rows.length} سجل</small>
                  </span>
                  <span className="mt-1 flex items-center justify-between text-xs text-zinc-500">
                    <span>{month.executed.length} منفذ</span>
                    <span className="font-mono [direction:ltr]">
                      {money(month.totalMinor)} ر.س
                    </span>
                  </span>
                </button>
              ))}
              {!archiveMonths.length ? (
                <p className="px-2 py-8 text-center text-xs leading-6 text-zinc-500">
                  لا توجد إقفالات بعد. تظهر الأشهر تلقائيًا عند تنفيذ أو إغلاق
                  أول طلب.
                </p>
              ) : null}
            </div>
          </aside>
          <section className="min-w-0">
            <div className="mb-3 grid grid-cols-2 gap-2 xl:grid-cols-4">
              {[
                ["المنفذ", `${executed.length} طلب`],
                ["إجمالي المصروف", `${money(executedTotal)} ر.س`],
                ["تحويلات البنك", `${money(bankTotal)} ر.س`],
                ["الصرف النقدي", `${money(cashTotal)} ر.س`],
              ].map(([label, value], index) => (
                <article
                  key={label}
                  className="rounded-2xl border border-zinc-200 bg-white p-4"
                >
                  <span
                    className={`mb-3 block h-1 w-8 rounded-full ${index === 0 ? "bg-emerald-500" : "bg-[#dc001c]"}`}
                  />
                  <small className="text-xs text-zinc-500">{label}</small>
                  <strong className="mt-1 block text-base">{value}</strong>
                </article>
              ))}
            </div>
            <div className="mb-3 flex flex-wrap gap-2">
              {Object.entries(runGroupNames).map(([group, label]) => {
                const count = executed.filter(
                  (item) => item.settlementGroup === group,
                ).length;
                return count ? (
                  <span
                    key={group}
                    className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-xs text-zinc-600"
                  >
                    {label} <b className="mr-1 text-[#dc001c]">{count}</b>
                  </span>
                ) : null;
              })}
            </div>
            <div className="mb-4 flex gap-2">
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                className="h-11 min-w-0 flex-1 rounded-xl border border-zinc-200 bg-white px-3 text-sm"
                placeholder="ابحث برقم الطلب أو المستفيد أو الإدارة..."
              />
              <button
                onClick={() => setQuery("")}
                className="rounded-xl border border-zinc-200 bg-white px-4 text-xs font-bold"
              >
                مسح
              </button>
            </div>
            {archiveRuns.length ? (
              <div className="mb-4">
                <div className="mb-2 flex items-center justify-between">
                  <h2 className="text-sm font-bold">مسيرات الشهر المغلقة</h2>
                  <span className="text-xs text-zinc-500">
                    {archiveRuns.length} مسير
                  </span>
                </div>
                <div className="grid gap-2 sm:grid-cols-2">
                  {archiveRuns.map((run) => (
                    <button
                      key={run.id}
                      onClick={() =>
                        window.open(
                          `/print/payment-run?id=${encodeURIComponent(run.id)}`,
                          "_blank",
                          "noopener,noreferrer",
                        )
                      }
                      className="rounded-2xl border border-zinc-200 bg-white p-4 text-right hover:border-red-200"
                    >
                      <small className="font-mono text-xs text-[#dc001c] [direction:ltr]">
                        {run.runNumber}
                      </small>
                      <b className="mt-2 block text-sm">
                        {run.paymentMethod === "BANK"
                          ? "مسير بنكي"
                          : "مسير نقدي"}{" "}
                        ·{" "}
                        {runGroupNames[run.settlementGroup] ||
                          run.settlementGroup}
                      </b>
                      <span className="mt-3 flex justify-between text-xs text-zinc-500">
                        <span>{run.itemCount} عملية</span>
                        <strong className="font-mono text-zinc-900 [direction:ltr]">
                          {money(run.totalMinor)} ر.س
                        </strong>
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
            <div className="mb-2 flex items-center justify-between">
              <h2 className="text-sm font-bold">
                طلبات{" "}
                {activeArchiveMonth
                  ? monthLabel(activeArchiveMonth)
                  : "الأرشيف"}
              </h2>
              <span className="text-xs text-zinc-500">
                {archiveRows.length} سجل
              </span>
            </div>
            <RequestList rows={archiveRows} onOpen={onOpenRequest} />
          </section>
        </div>
      </>
    );
  }

  if (active === "التقارير") {
    const executedRows = reportRows.filter(
      (item) => item.status === "EXECUTED",
    );
    const total = executedRows.reduce((sum, item) => sum + item.amountMinor, 0);
    const target = reportRows.find((item) => !item.id.startsWith("demo"));
    return (
      <>
        <Header
          title="التقارير والتصدير"
          subtitle="اختر الفترة وطريقة الصرف والفئة؛ جميع المؤشرات والنتائج والتصدير تستخدم الفلتر نفسه."
        />
        <section className="mb-4 rounded-2xl border border-zinc-200 bg-white p-4">
          <div className="grid gap-3 md:grid-cols-3">
            <Field label="الشهر">
              <select
                value={reportMonth}
                onChange={(event) => setReportMonth(event.target.value)}
              >
                <option value="">جميع الفترات المتاحة</option>
                {archiveMonths.map((month) => (
                  <option key={month.key} value={month.key}>
                    {monthLabel(month.key)}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="طريقة الصرف">
              <select
                value={reportMethod}
                onChange={(event) => setReportMethod(event.target.value)}
              >
                <option value="ALL">بنك ونقد</option>
                <option value="BANK">تحويل بنكي</option>
                <option value="CASH">صرف نقدي</option>
              </select>
            </Field>
            <Field label="فئة المسير">
              <select
                value={reportGroup}
                onChange={(event) => setReportGroup(event.target.value)}
              >
                <option value="ALL">جميع الفئات</option>
                {Object.entries(runGroupNames).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-2 lg:grid-cols-4">
            {[
              ["الطلبات المطابقة", String(reportRows.length)],
              ["تم التنفيذ", String(executedRows.length)],
              ["إجمالي المنفذ", `${money(total)} ر.س`],
              [
                "متعذر ويحتاج معالجة",
                String(
                  reportRows.filter(
                    (item) => item.status === "EXECUTION_FAILED",
                  ).length,
                ),
              ],
            ].map(([label, value]) => (
              <div key={label} className="rounded-xl bg-zinc-50 p-3">
                <small className="text-xs text-zinc-500">{label}</small>
                <strong className="mt-1 block text-base">{value}</strong>
              </div>
            ))}
          </div>
          <div className="mt-4 grid gap-2 sm:grid-cols-3">
            <button
              onClick={() => {
                const filename = downloadRequestsXlsx(reportRows);
                onMessage(`تم تنزيل التقرير المفلتر: ${filename}`);
              }}
              disabled={!reportRows.length}
              className="flex h-11 items-center justify-center gap-2 rounded-xl bg-emerald-700 text-xs font-bold text-white disabled:opacity-40"
            >
              <OutputIcon kind="excel" size={17} />
              Excel للنتيجة
            </button>
            <button
              onClick={() =>
                target &&
                window.open(
                  `/print/request?id=${target.id}`,
                  "_blank",
                  "noopener,noreferrer",
                )
              }
              disabled={!target}
              className="flex h-11 items-center justify-center gap-2 rounded-xl border border-red-200 bg-red-50 text-xs font-bold text-[#dc001c] disabled:opacity-40"
            >
              <OutputIcon kind="pdf" size={17} />
              معاينة أول طلب
            </button>
            <button
              onClick={() =>
                target &&
                void shareRequestPdf(target.id, onMessage)
                  .then((result) =>
                    onMessage(
                      result.shared
                        ? "تم إرفاق PDF في المشاركة"
                        : "تم تنزيل PDF للمشاركة",
                    ),
                  )
                  .catch(() => onMessage("تعذرت المشاركة"))
              }
              disabled={!target}
              className="flex h-11 items-center justify-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 text-xs font-bold text-emerald-700 disabled:opacity-40"
            >
              <OutputIcon kind="whatsapp" size={17} />
              واتساب · PDF
            </button>
          </div>
        </section>
        <RequestList rows={reportRows} onOpen={onOpenRequest} />
      </>
    );
  }

  return (
    <>
      <Header title={active} subtitle="هذه الوحدة تحت إعداد مدير النظام." />
      <div className="rounded-2xl border border-zinc-200 bg-white p-10 text-center">
        <p className="text-[10px] text-zinc-500">
          ستظهر بيانات {active} هنا حسب صلاحيات المستخدم.
        </p>
      </div>
    </>
  );
}

type UserRow = {
  id: string;
  fullName: string;
  username: string;
  email: string;
  departmentId?: string | null;
  jobTitle?: string | null;
  systemRole: string;
  status: string;
  mustChangePassword: boolean;
};

function UsersView({ onMessage }: { onMessage: (message: string) => void }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState("");
  const [users, setUsers] = useState<UserRow[]>([]);
  const [selectedDepartment, setSelectedDepartment] = useState<string | null>(
    null,
  );
  const [credential, setCredential] = useState<{
    fullName: string;
    username: string;
    password: string;
  } | null>(null);
  const [form, setForm] = useState({
    fullName: "",
    username: "",
    email: "",
    departmentId: "dept-branch",
    jobTitle: "",
    systemRole: "REQUESTER",
    temporaryPassword: "",
    confirmPassword: "",
  });
  const load = () =>
    fetch("/api/users")
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => data?.users && setUsers(data.users))
      .catch(() => undefined);
  useEffect(() => {
    void load();
  }, []);
  const selectedDepartmentRecord = departments.find(
    (department) => department.code === selectedDepartment,
  );
  const openCreateUser = (departmentCode?: string) => {
    const department = departmentCode
      ? departments.find((item) => item.code === departmentCode)
      : undefined;
    setFormError("");
    setSelectedDepartment(departmentCode || null);
    setForm((current) => ({
      ...current,
      departmentId: department
        ? `dept-${department.code.toLowerCase()}`
        : current.departmentId,
      systemRole:
        departmentCode === "EXECUTIVE" ? "EXECUTIVE" : current.systemRole,
    }));
    setOpen(true);
  };
  const visibleUsers = selectedDepartment
    ? users.filter(
        (item) =>
          item.departmentId === `dept-${selectedDepartment.toLowerCase()}` ||
          item.departmentId === selectedDepartment,
      )
    : users;
  const submit = async () => {
    if (busy) return;
    setFormError("");
    if (!form.temporaryPassword) {
      setFormError("اكتب كلمة المرور المؤقتة");
      return;
    }
    if (form.temporaryPassword !== form.confirmPassword) {
      setFormError("تأكيد كلمة المرور غير مطابق");
      return;
    }
    setBusy(true);
    try {
      const response = await fetch("/api/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, branchId: "branch-khamis" }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "تعذر إنشاء المستخدم");
      setCredential({
        fullName: result.user.fullName,
        username: result.user.username,
        password: result.temporaryPassword,
      });
      onMessage(
        result.created
          ? "تم حفظ المستخدم وكلمة المرور"
          : "تم تحديث المستخدم وحفظ كلمة المرور الجديدة",
      );
      setOpen(false);
      setForm({
        fullName: "",
        username: "",
        email: "",
        departmentId: "dept-branch",
        jobTitle: "",
        systemRole: "REQUESTER",
        temporaryPassword: "",
        confirmPassword: "",
      });
      load();
    } catch (error) {
      setFormError(
        error instanceof Error ? error.message : "تعذر حفظ المستخدم",
      );
    } finally {
      setBusy(false);
    }
  };
  const resetPassword = async (user: UserRow) => {
    const response = await fetch("/api/users", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: user.id, action: "RESET_PASSWORD" }),
    });
    const result = await response.json().catch(() => null);
    if (!response.ok)
      return onMessage(result?.error || "تعذر إصدار كلمة المرور");
    setCredential({
      fullName: user.fullName,
      username: user.username,
      password: result.temporaryPassword,
    });
    void load();
  };
  return (
    <>
      <Header
        title="المستخدمون والإدارات"
        subtitle="كل مستخدم مرتبط بإدارته وفرعه ودوره، ولا يُحذف إذا ارتبط بعملية."
        action={
          <button
            type="button"
            onClick={() => openCreateUser()}
            className="h-11 rounded-xl bg-[#dc001c] px-4 text-[9px] font-bold text-white shadow-sm active:scale-[.98]"
          >
            + إضافة مستخدم
          </button>
        }
      />
      <div className="mb-4 flex gap-2">
        <div className="rounded-xl border border-zinc-200 bg-white px-4 py-3">
          <small className="text-[7px] text-zinc-400">المستخدمون النشطون</small>
          <strong className="mr-4 font-sans text-lg">
            {users.filter((item) => item.status === "ACTIVE").length}
          </strong>
        </div>
        <div className="rounded-xl border border-zinc-200 bg-white px-4 py-3">
          <small className="text-[7px] text-zinc-400">
            يتطلب تغيير كلمة المرور
          </small>
          <strong className="mr-4 font-sans text-lg">
            {users.filter((item) => item.mustChangePassword).length}
          </strong>
        </div>
      </div>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {departments.map((department) => {
          const departmentUsers = users.filter(
            (item) =>
              item.departmentId === `dept-${department.code.toLowerCase()}` ||
              item.departmentId === department.code,
          );
          const manager = departmentUsers.find(
            (item) => item.systemRole === "DEPARTMENT_MANAGER",
          );
          return (
            <button
              type="button"
              key={department.code}
              onClick={() => openCreateUser(department.code)}
              className={`rounded-2xl border bg-white p-4 text-right transition hover:-translate-y-0.5 hover:shadow-lg active:scale-[.99] ${selectedDepartment === department.code ? "border-[#dc001c] ring-2 ring-red-100" : "border-zinc-200"}`}
              aria-label={`إضافة مستخدم في ${department.name}`}
            >
              <div className="flex items-start justify-between">
                <span
                  className={`grid h-10 w-10 place-items-center rounded-xl text-[11px] font-bold ${department.color}`}
                >
                  {department.name.slice(0, 2)}
                </span>
                <span className="rounded-lg bg-zinc-50 px-2 py-1.5 text-[7px] text-zinc-500">
                  {
                    departmentUsers.filter((item) => item.status === "ACTIVE")
                      .length
                  }{" "}
                  نشط
                </span>
              </div>
              <h3 className="mt-4 text-[12px] font-bold">{department.name}</h3>
              <p className="mt-1 text-[8px] text-zinc-400">
                المدير: {manager?.fullName || "لم يُعيّن بعد"}
              </p>
              <div className="mt-4 flex items-center justify-between border-t border-zinc-100 pt-3">
                <span className="text-[8px] text-zinc-500">
                  {departmentUsers.length} مستخدمين
                </span>
                <span className="text-[8px] font-bold text-[#dc001c]">
                  + إضافة مستخدم ←
                </span>
              </div>
            </button>
          );
        })}
      </div>
      <section
        id="user-accounts"
        className="mt-4 scroll-mt-24 overflow-hidden rounded-2xl border border-zinc-200 bg-white"
      >
        <div className="flex items-center justify-between border-b border-zinc-100 px-4 py-3">
          <div>
            <h2 className="text-[11px] font-bold">
              {selectedDepartmentRecord
                ? `حسابات ${selectedDepartmentRecord.name}`
                : "جميع حسابات الدخول"}
            </h2>
            <span className="mt-1 block text-[8px] text-zinc-400">
              {visibleUsers.length} حساب
            </span>
          </div>
          {selectedDepartment ? (
              <button
                type="button"
                onClick={() => setSelectedDepartment(null)}
              className="h-9 rounded-lg border border-zinc-200 px-3 text-[8px] font-bold text-zinc-600"
            >
              عرض الجميع
            </button>
          ) : null}
        </div>
        <div className="divide-y divide-zinc-100">
          {visibleUsers.map((user) => (
            <div
              key={user.id}
              className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center"
            >
              <div className="min-w-0 flex-1">
                <b className="block truncate text-[10px]">{user.fullName}</b>
                <span className="mt-1 block truncate font-mono text-[8px] text-zinc-500 [direction:ltr]">
                  {user.username}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span
                  className={`rounded-lg px-2 py-1 text-[7px] font-bold ${user.mustChangePassword ? "bg-amber-50 text-amber-700" : "bg-emerald-50 text-emerald-700"}`}
                >
                  {user.mustChangePassword
                    ? "تغيير أول دخول"
                    : "كلمة المرور مفعلة"}
                </span>
                <button
                  onClick={() => void resetPassword(user)}
                  className="h-9 rounded-lg border border-zinc-200 px-3 text-[8px] font-bold text-[#dc001c]"
                >
                  إصدار مؤقتة جديدة
                </button>
              </div>
            </div>
          ))}
        </div>
      </section>
      {open ? (
        <div className="fixed inset-0 z-[170] grid items-end bg-zinc-950/45 sm:place-items-center">
          <div className="max-h-[92vh] w-full overflow-y-auto rounded-t-3xl bg-white p-5 sm:w-[520px] sm:rounded-3xl">
            <div className="flex items-start justify-between">
              <div>
                <small className="text-[8px] font-bold text-[#dc001c]">
                  إدارة النظام
                </small>
                <h2 className="mt-1 text-[18px] font-bold">إضافة مستخدم</h2>
                <p className="mt-1 text-[8px] text-zinc-500">
                  سيأخذ مهامه وصلاحياته من الإدارة والدور المحددين.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="text-xl text-zinc-400"
              >
                ×
              </button>
            </div>
            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              <Field label="الاسم الكامل *">
                <input
                  value={form.fullName}
                  onChange={(event) =>
                    setForm({ ...form, fullName: event.target.value })
                  }
                  placeholder="الاسم الثلاثي"
                />
              </Field>
              <Field label="اسم المستخدم *">
                <input
                  value={form.username}
                  onChange={(event) =>
                    setForm({ ...form, username: event.target.value })
                  }
                  dir="ltr"
                  placeholder="username"
                />
              </Field>
              <Field label="البريد الإلكتروني (اختياري)">
                <input
                  value={form.email}
                  onChange={(event) =>
                    setForm({ ...form, email: event.target.value })
                  }
                  dir="ltr"
                  type="email"
                  placeholder="name@company.com"
                />
              </Field>
              <Field label="المسمى الوظيفي">
                <input
                  value={form.jobTitle}
                  onChange={(event) =>
                    setForm({ ...form, jobTitle: event.target.value })
                  }
                  placeholder="محاسب، مدير إدارة..."
                />
              </Field>
              <Field label="الإدارة *">
                <select
                  value={form.departmentId}
                  onChange={(event) =>
                    setForm({ ...form, departmentId: event.target.value })
                  }
                >
                  {departments.map((item) => (
                    <option
                      key={item.code}
                      value={`dept-${item.code.toLowerCase()}`}
                    >
                      {item.name}
                    </option>
                  ))}
                </select>
              </Field>
              <div className="sm:col-span-2">
                <span className="mb-2 block text-[8px] font-bold text-zinc-600">
                  الدور والصلاحية *
                </span>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {userRoles.map((role) => (
                    <button
                      key={role.value}
                      type="button"
                      onClick={() =>
                        setForm({ ...form, systemRole: role.value })
                      }
                      className={`min-h-[68px] rounded-xl border p-3 text-right transition active:scale-[.98] ${
                        form.systemRole === role.value
                          ? "border-[#dc001c] bg-[#fff0f2] text-[#b60017] ring-2 ring-red-100"
                          : "border-zinc-200 bg-white text-zinc-700"
                      }`}
                      aria-pressed={form.systemRole === role.value}
                    >
                      <b className="block text-[9px]">{role.label}</b>
                      <span className="mt-1 block text-[7px] leading-4 text-zinc-500">
                        {role.hint}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
              <Field label="كلمة المرور المؤقتة *">
                <input
                  value={form.temporaryPassword}
                  onChange={(event) =>
                    setForm({ ...form, temporaryPassword: event.target.value })
                  }
                  dir="ltr"
                  type="password"
                  autoComplete="new-password"
                  placeholder="اكتب كلمة المرور"
                />
              </Field>
              <Field label="تأكيد كلمة المرور *">
                <input
                  value={form.confirmPassword}
                  onChange={(event) =>
                    setForm({ ...form, confirmPassword: event.target.value })
                  }
                  dir="ltr"
                  type="password"
                  autoComplete="new-password"
                  placeholder="أعد كتابة كلمة المرور"
                />
              </Field>
            </div>
            <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-[8px] leading-5 text-emerald-800">
              ضع أنت كلمة المرور المؤقتة، ثم أرسلها للمستخدم بشكل خاص. سيُجبر
              على تغييرها عند أول دخول.
            </div>
            {formError ? (
              <div className="mt-3 rounded-xl border border-red-200 bg-red-50 p-3 text-[8px] font-bold text-red-700">
                {formError}
              </div>
            ) : null}
            <button
              type="button"
              disabled={
                busy ||
                !form.fullName ||
                !form.username ||
                !form.temporaryPassword ||
                form.temporaryPassword !== form.confirmPassword
              }
              onClick={submit}
              className="mt-4 h-12 w-full rounded-xl bg-[#dc001c] text-[9px] font-bold text-white disabled:opacity-40"
            >
              {busy ? "جارٍ حفظ المستخدم..." : "حفظ المستخدم وكلمة المرور"}
            </button>
          </div>
        </div>
      ) : null}
      {credential ? (
        <div className="fixed inset-0 z-[180] grid place-items-center bg-zinc-950/55 px-4">
          <div className="w-full max-w-md rounded-3xl bg-white p-6">
            <small className="text-[8px] font-bold text-[#dc001c]">
              بيانات دخول مؤقتة · تظهر مرة واحدة
            </small>
            <h2 className="mt-2 text-[18px] font-bold">
              {credential.fullName}
            </h2>
            <div className="mt-5 space-y-2 rounded-2xl bg-zinc-50 p-4 font-mono text-[11px] [direction:ltr]">
              <div>
                <span className="text-zinc-400">Username</span>
                <b className="mt-1 block select-all">{credential.username}</b>
              </div>
              <div className="border-t border-zinc-200 pt-2">
                <span className="text-zinc-400">Temporary password</span>
                <b className="mt-1 block select-all text-[#dc001c]">
                  {credential.password}
                </b>
              </div>
            </div>
            <p className="mt-3 text-[8px] leading-5 text-zinc-500">
              أرسلها للمستخدم بشكل خاص. عند أول دخول سيُطلب منه تعيين كلمة مرور
              جديدة.
            </p>
            <button
              type="button"
              onClick={() => {
                void navigator.clipboard?.writeText(
                  `اسم المستخدم: ${credential.username}\nكلمة المرور المؤقتة: ${credential.password}`,
                );
                onMessage("تم نسخ بيانات الدخول");
              }}
              className="mt-4 h-11 w-full rounded-xl bg-[#dc001c] text-[9px] font-bold text-white"
            >
              نسخ بيانات الدخول
            </button>
            <button
              type="button"
              onClick={() => setCredential(null)}
              className="mt-2 h-10 w-full rounded-xl border border-zinc-200 text-[9px] font-bold"
            >
              تم الحفظ والإغلاق
            </button>
          </div>
        </div>
      ) : null}
    </>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[8px] font-bold text-zinc-600">
        {label}
      </span>
      <div className="[&_input]:h-11 [&_input]:w-full [&_input]:rounded-xl [&_input]:border [&_input]:border-zinc-200 [&_input]:px-3 [&_input]:text-[9px] [&_select]:h-11 [&_select]:w-full [&_select]:rounded-xl [&_select]:border [&_select]:border-zinc-200 [&_select]:bg-white [&_select]:px-3 [&_select]:text-[9px]">
        {children}
      </div>
    </label>
  );
}
