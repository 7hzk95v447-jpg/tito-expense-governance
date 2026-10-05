"use client";

import { useEffect, useMemo, useState } from "react";
import { downloadRequestPdf, previewRequestPdf, shareRequestPdf } from "../lib/client-document-export";

type PaymentMethod = "BANK" | "CASH";
type AccountNameMatch = "" | "MATCHED" | "MISMATCHED";
type AttachmentStatus = "UPLOADING" | "READY" | "FAILED";
type IconName =
  | "supplier" | "employee" | "government" | "operations" | "marketing" | "technology"
  | "calendar" | "bank" | "cash" | "upload" | "camera" | "file" | "check"
  | "arrow" | "eye" | "pdf" | "whatsapp" | "tasks" | "close" | "shield"
  | "info" | "trash" | "refresh" | "chevron";

type Attachment = {
  localId: string;
  id?: string;
  name: string;
  size: number;
  progress: number;
  status: AttachmentStatus;
  error?: string;
  file?: File;
};

type FormState = {
  categoryCode: string;
  expenseType: string;
  isMonthlyObligation: boolean;
  obligationType: string;
  dueDate: string;
  reminderDaysBefore: string;
  paymentMethod: PaymentMethod;
  beneficiaryName: string;
  beneficiaryType: string;
  bankName: string;
  iban: string;
  accountHolderName: string;
  accountNameMatch: AccountNameMatch;
  accountMismatchReason: string;
  cashRecipient: string;
  totalDue: string;
  paidPreviously: string;
  amount: string;
  purpose: string;
  details: string;
};

type CompletedRequest = {
  id: string;
  requestNumber: string;
  status: string;
  currentStage: string;
  currentAssignee?: string;
};

type Category = {
  id: string;
  title: string;
  note: string;
  owner: string;
  departmentCode: string;
  icon: IconName;
  route: string[];
  options: { label: string; hint: string }[];
};

const categories: Category[] = [
  {
    id: "supplier",
    title: "الموردون والمشتريات",
    note: "البضائع، الدفعات ومستحقات الموردين",
    owner: "مدير إدارة المشتريات",
    departmentCode: "PURCHASING",
    icon: "supplier",
    route: ["إدارة المشتريات", "مراجعة الحسابات", "المدير التنفيذي", "المسير والتنفيذ"],
    options: [
      { label: "شراء بضاعة", hint: "لشراء أصناف أو توريد بضاعة جديدة." },
      { label: "دفعة مقدمة لمورد", hint: "دفعة مرتبطة بعرض سعر أو عقد توريد." },
      { label: "سداد مستحق مورد", hint: "سداد فاتورة أو رصيد مستحق لمورد." },
      { label: "شراء خدمة أو معدات", hint: "خدمات، تجهيزات أو أصول من مورد خارجي." },
      { label: "مصروف مورد آخر", hint: "مصروف مورد لا يندرج ضمن الخيارات السابقة." },
    ],
  },
  {
    id: "employee",
    title: "الموظفون",
    note: "السلف، العهد، الرواتب والاستحقاقات",
    owner: "المدير المباشر",
    departmentCode: "HR",
    icon: "employee",
    route: ["المدير المباشر", "الموارد البشرية", "مراجعة الحسابات", "المدير التنفيذي", "المسير والتنفيذ"],
    options: [
      { label: "سلفة موظف", hint: "سلفة تخص موظفًا وتخضع لضوابط الموارد البشرية." },
      { label: "عهدة مالية", hint: "عهدة مؤقتة لتنفيذ مهمة أو مصروف محدد." },
      { label: "رواتب أو استحقاقات", hint: "راتب، بدل أو استحقاق وظيفي معتمد." },
      { label: "استرداد مصروف موظف", hint: "إعادة مبلغ دفعه الموظف نيابة عن العمل." },
      { label: "التزام موظف آخر", hint: "استحقاق موظف لا يندرج ضمن الخيارات السابقة." },
    ],
  },
  {
    id: "government",
    title: "السداد الحكومي",
    note: "الرسوم، الرخص والمدفوعات الحكومية",
    owner: "مدير الإدارة المختصة",
    departmentCode: "FINANCE",
    icon: "government",
    route: ["الإدارة المختصة", "مراجعة الحسابات", "المدير التنفيذي", "المسير والتنفيذ"],
    options: [
      { label: "رسوم حكومية", hint: "رسوم خدمات أو معاملات لدى جهة حكومية." },
      { label: "تراخيص وتجديدات", hint: "إصدار أو تجديد ترخيص، سجل أو تصريح." },
      { label: "زكاة أو ضريبة أو بلدية", hint: "التزامات دورية أو فورية لجهة رسمية." },
      { label: "مخالفة أو غرامة معتمدة", hint: "سداد غرامة بعد إرفاق مرجعها واعتمادها." },
      { label: "سداد حكومي آخر", hint: "سداد رسمي لا يندرج ضمن الخيارات السابقة." },
    ],
  },
  {
    id: "operations",
    title: "التشغيل والصيانة",
    note: "مصروفات الفروع والمستودع والصيانة",
    owner: "مدير الإدارة المختصة",
    departmentCode: "BRANCH",
    icon: "operations",
    route: ["الإدارة المختصة", "مراجعة الحسابات", "المدير التنفيذي", "المسير والتنفيذ"],
    options: [
      { label: "مصروف تشغيلي عام", hint: "احتياج يومي مباشر لتشغيل الإدارة أو الفرع." },
      { label: "مصروف صيانة", hint: "صيانة موقع، معدات، سيارة أو أصل تشغيلي." },
      { label: "مصروف فرع", hint: "مصروف خاص بتشغيل فرع أو موقع محدد." },
      { label: "مصروف مستودع", hint: "مصروف تشغيلي داخل المستودع وليس حركة مخزون." },
      { label: "خدمة تشغيلية أخرى", hint: "خدمة تشغيلية لا يطابقها خيار سابق." },
    ],
  },
  {
    id: "marketing",
    title: "التسويق والإعلانات",
    note: "المشاهير، الحملات، الطباعة والمحتوى",
    owner: "مدير إدارة التسويق",
    departmentCode: "MARKETING",
    icon: "marketing",
    route: ["إدارة التسويق", "مراجعة الحسابات", "المدير التنفيذي", "المسير والتنفيذ"],
    options: [
      { label: "سداد مشهور أو صانع محتوى", hint: "حملة مؤثر أو مشهور مع العقد أو الاتفاق." },
      { label: "طباعة ملصقات أو مواد داخلية", hint: "ستيكرات، لوحات أو مواد مطبوعة للفرع." },
      { label: "حملة أو عمل دعائي", hint: "تنفيذ حملة، فعالية أو إنتاج دعائي." },
      { label: "إعلان رقمي ممول", hint: "إعلانات المنصات الرقمية ومحركات البحث." },
      { label: "تصميم أو إنتاج محتوى", hint: "تصوير، تصميم، مونتاج أو محتوى تسويقي." },
    ],
  },
  {
    id: "it",
    title: "تقنية المعلومات",
    note: "الأجهزة، البرامج، الشبكات والاشتراكات",
    owner: "مدير تقنية المعلومات",
    departmentCode: "IT",
    icon: "technology",
    route: ["تقنية المعلومات", "مراجعة الحسابات", "المدير التنفيذي", "المسير والتنفيذ"],
    options: [
      { label: "شراء أجهزة أو ملحقات تقنية", hint: "حواسيب، طابعات، قارئات أو تجهيزات تقنية." },
      { label: "اشتراك برنامج أو خدمة سحابية", hint: "أنظمة، تراخيص، استضافة أو خدمة رقمية." },
      { label: "شبكات واتصالات", hint: "إنترنت، ربط فروع، شبكات أو أجهزة اتصال." },
      { label: "صيانة ودعم تقني", hint: "صيانة أجهزة أو عقد دعم فني وتشغيلي." },
      { label: "أمن معلومات أو تراخيص", hint: "حماية، نسخ احتياطي أو ترخيص تقني." },
    ],
  },
];

const obligationTypes = [
  "فاتورة كهرباء",
  "فاتورة هاتف أو جوال",
  "فاتورة إنترنت واتصالات",
  "اشتراك تقني أو سحابي",
  "سداد حكومي دوري",
  "إيجار أو عقد خدمة شهري",
  "صيانة أو دعم شهري",
  "التزام شهري آخر",
];

const stepNames = ["التصنيف", "المستفيد والدفع", "المبلغ والبيان", "المرفقات", "المراجعة"];

function clientId() {
  return `t2-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

function Icon({ name, size = 20 }: { name: IconName; size?: number }) {
  const nodes: Record<IconName, React.ReactNode> = {
    supplier: <><path d="M4 7h16v13H4z"/><path d="M7 7V4h10v3M8 12h8M8 16h5"/></>,
    employee: <><circle cx="12" cy="8" r="3.5"/><path d="M5 21c.7-4 3-6 7-6s6.3 2 7 6"/></>,
    government: <><path d="m3 9 9-5 9 5M5 10v7M9 10v7M15 10v7M19 10v7M3 20h18"/></>,
    operations: <><path d="m14 7 3-3 3 3-3 3M17 7 9 15"/><path d="m7 13-3 3 4 4 3-3M4 4l6 6"/></>,
    marketing: <><path d="M4 13V8l13-4v13L4 13Z"/><path d="M17 8h3a2 2 0 0 1 0 4h-3M7 14l1 5h4l-2-5"/></>,
    technology: <><rect x="3" y="4" width="18" height="13" rx="2"/><path d="M8 21h8M12 17v4M7 9h3M7 12h6"/></>,
    calendar: <><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 3v4M17 3v4M3 10h18M8 14h.01M12 14h.01M16 14h.01"/></>,
    bank: <><path d="m3 9 9-5 9 5M5 10v8M10 10v8M14 10v8M19 10v8M3 21h18"/></>,
    cash: <><rect x="3" y="6" width="18" height="13" rx="2"/><circle cx="12" cy="12.5" r="3"/><path d="M6 9h.01M18 16h.01"/></>,
    upload: <><path d="M12 16V4M7 9l5-5 5 5"/><path d="M5 14v6h14v-6"/></>,
    camera: <><path d="M4 7h4l2-3h4l2 3h4v13H4z"/><circle cx="12" cy="13" r="4"/></>,
    file: <><path d="M6 3h8l4 4v14H6zM14 3v5h4M9 13h6M9 17h6"/></>,
    check: <path d="m5 12 4 4L19 6"/>,
    arrow: <><path d="M5 12h14M13 6l6 6-6 6"/></>,
    eye: <><path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z"/><circle cx="12" cy="12" r="2.5"/></>,
    pdf: <><path d="M6 3h8l4 4v14H6zM14 3v5h4"/><path d="M8.5 15h7M8.5 18h5"/></>,
    whatsapp: <><path d="M20 11.5a8 8 0 0 1-11.8 7L4 20l1.5-4A8 8 0 1 1 20 11.5Z"/><path d="M9 8c.5 3 2 4.5 5 5l1-1 2 1.3c-.7 2-2.2 2.3-4 1.7-3.3-1.1-5.8-4-6-6.8C6.9 6.8 8 6 9 8Z"/></>,
    tasks: <><rect x="4" y="3" width="16" height="18" rx="2"/><path d="M9 8h7M9 12h7M9 16h5M6.5 8h.01M6.5 12h.01M6.5 16h.01"/></>,
    close: <path d="M6 6l12 12M18 6 6 18"/>,
    shield: <><path d="M12 3 5 6v5c0 4.8 2.8 8.2 7 10 4.2-1.8 7-5.2 7-10V6l-7-3Z"/><path d="m9 12 2 2 4-5"/></>,
    info: <><circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/></>,
    trash: <><path d="M4 7h16M9 7V4h6v3M7 7l1 14h8l1-14M10 11v6M14 11v6"/></>,
    refresh: <><path d="M20 7v5h-5M4 17v-5h5"/><path d="M6.1 8a7 7 0 0 1 11.7-1L20 12M4 12l2.2 5a7 7 0 0 0 11.7-1"/></>,
    chevron: <path d="m9 18 6-6-6-6"/>,
  };
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{nodes[name]}</svg>;
}

function isoDate(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function defaultDueDate() {
  const today = new Date();
  let due = new Date(today.getFullYear(), today.getMonth(), 28);
  if (due < new Date(today.getFullYear(), today.getMonth(), today.getDate())) due = new Date(today.getFullYear(), today.getMonth() + 1, 28);
  return isoDate(due);
}

function createInitialForm(): FormState {
  return {
    categoryCode: "supplier",
    expenseType: categories[0].options[2].label,
    isMonthlyObligation: false,
    obligationType: obligationTypes[0],
    dueDate: defaultDueDate(),
    reminderDaysBefore: "3",
    paymentMethod: "BANK",
    beneficiaryName: "",
    beneficiaryType: "COMPANY",
    bankName: "",
    iban: "",
    accountHolderName: "",
    accountNameMatch: "MATCHED",
    accountMismatchReason: "",
    cashRecipient: "",
    totalDue: "",
    paidPreviously: "",
    amount: "",
    purpose: "",
    details: "",
  };
}

function formatBytes(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} ك.ب`;
  return `${(bytes / 1024 / 1024).toFixed(1)} م.ب`;
}

function money(value: string | number) {
  const amount = Number(value || 0);
  return Number.isFinite(amount) ? amount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "0.00";
}

function amountInput(value: string) {
  const normalized = value.replace(/,/g, "").replace(/[^0-9.]/g, "");
  const [whole = "", ...rest] = normalized.split(".");
  return rest.length ? `${whole}.${rest.join("").slice(0, 2)}` : whole;
}

function rawIban(value: string) {
  return value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 24);
}

function formatIban(value: string) {
  return rawIban(value).replace(/(.{4})/g, "$1 ").trim();
}

async function compressImage(file: File) {
  const isImage = file.type.startsWith("image/");
  const needsConversion = isImage && !["image/jpeg", "image/png", "image/webp"].includes(file.type);
  if (!isImage || (!needsConversion && file.size < 650_000)) return file;
  try {
    const bitmap = await createImageBitmap(file);
    const maxSide = 1600;
    const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    canvas.getContext("2d")?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    let blob: Blob | null = null;
    for (const quality of [.74, .64, .54, .44]) {
      blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
      if (blob && blob.size <= 700_000) break;
    }
    return blob ? new File([blob], file.name.replace(/\.[^.]+$/, ".jpg"), { type: "image/jpeg" }) : file;
  } catch {
    return file;
  }
}

function Field({ label, required, hint, children, action }: { label: string; required?: boolean; hint?: string; children: React.ReactNode; action?: React.ReactNode }) {
  return <label className="block min-w-0">
    <span className="mb-2 flex min-h-5 items-center gap-2 text-xs font-bold text-zinc-700">
      <span>{label}{required ? <i className="mr-1 not-italic text-[#dc001c]">*</i> : null}</span>
      {action ? <span className="mr-auto">{action}</span> : null}
    </span>
    {children}
    {hint ? <small className="mt-1.5 block text-[11px] leading-5 text-zinc-500">{hint}</small> : null}
  </label>;
}

const inputClass = "h-12 w-full rounded-xl border border-zinc-200 bg-white px-3 text-[16px] text-zinc-900 outline-none transition placeholder:text-zinc-400 focus:border-[#dc001c] focus:ring-4 focus:ring-red-50 sm:text-sm";

export default function RequestWizard({ open, editRequestId, onClose, onSuccess, onUpdated }: { open: boolean; editRequestId?: string | null; onClose: () => void; onSuccess: (message: string) => void; onUpdated?: (requestId: string) => void }) {
  const [step, setStep] = useState(1);
  const [form, setForm] = useState<FormState>(createInitialForm);
  const [draftKey, setDraftKey] = useState(clientId);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [acknowledged, setAcknowledged] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [completed, setCompleted] = useState<CompletedRequest | null>(null);
  const [showCompletedDetails, setShowCompletedDetails] = useState(false);
  const [editLockVersion, setEditLockVersion] = useState<number | null>(null);
  const [editStatus, setEditStatus] = useState<string | null>(null);
  const [loadingEdit, setLoadingEdit] = useState(false);
  const [exportBusy, setExportBusy] = useState(false);
  const editMode = Boolean(editRequestId);

  useEffect(() => {
    if (!open || !editRequestId) return;
    let cancelled = false;
    setLoadingEdit(true);
    setError("");
    fetch(`/api/requests/${editRequestId}`, { cache: "no-store" })
      .then(async (response) => {
        const value = await response.json();
        if (!response.ok) throw new Error(value.error || "تعذر تحميل الطلب للتعديل");
        return value;
      })
      .then((value) => {
        if (cancelled) return;
        const request = value.request;
        setDraftKey(request.draftKey);
        setEditLockVersion(request.lockVersion);
        setEditStatus(request.status);
        setForm({
          categoryCode: request.categoryCode,
          expenseType: request.expenseType,
          isMonthlyObligation: Boolean(request.monthlyObligationId),
          obligationType: request.expenseType,
          dueDate: defaultDueDate(),
          reminderDaysBefore: "3",
          paymentMethod: request.paymentMethod as PaymentMethod,
          beneficiaryName: request.beneficiaryName,
          beneficiaryType: request.beneficiaryType,
          bankName: request.bankName || "",
          iban: formatIban(request.iban || ""),
          accountHolderName: request.accountHolderName || "",
          accountNameMatch: (request.accountNameMatch || "") as AccountNameMatch,
          accountMismatchReason: request.accountMismatchReason || "",
          cashRecipient: request.cashRecipient || request.beneficiaryName,
          totalDue: request.totalDueMinor == null ? "" : String(request.totalDueMinor / 100),
          paidPreviously: request.paidPreviouslyMinor == null ? "" : String(request.paidPreviouslyMinor / 100),
          amount: String(request.amountMinor / 100),
          purpose: request.purpose,
          details: request.details,
        });
        setAttachments((value.attachments || []).map((file: { id: string; originalName: string; sizeBytes: number }) => ({ localId: `stored-${file.id}`, id: file.id, name: file.originalName, size: file.sizeBytes, progress: 100, status: "READY" as const })));
        setAcknowledged(false);
        setStep(1);
      })
      .catch((loadError) => !cancelled && setError(loadError instanceof Error ? loadError.message : "تعذر تحميل الطلب للتعديل"))
      .finally(() => !cancelled && setLoadingEdit(false));
    return () => { cancelled = true; };
  }, [open, editRequestId]);

  const selectedCategory = useMemo(() => categories.find((item) => item.id === form.categoryCode) ?? categories[0], [form.categoryCode]);
  const selectedType = useMemo(() => selectedCategory.options.find((item) => item.label === form.expenseType) ?? selectedCategory.options[0], [form.expenseType, selectedCategory]);
  const readyAttachments = attachments.filter((item) => item.status === "READY");
  const uploading = attachments.some((item) => item.status === "UPLOADING");
  const failedUploads = attachments.some((item) => item.status === "FAILED");
  const availableBeforeCurrent = Math.max(0, Number(form.totalDue || 0) - Number(form.paidPreviously || 0));
  const remaining = Math.max(0, availableBeforeCurrent - Number(form.amount || 0));

  if (!open) return null;

  const update = <K extends keyof FormState>(field: K, value: FormState[K]) => setForm((current) => ({ ...current, [field]: value }));

  function resetWizard() {
    setStep(1);
    setForm(createInitialForm());
    setDraftKey(clientId());
    setAttachments([]);
    setAcknowledged(false);
    setBusy(false);
    setError("");
    setCompleted(null);
    setShowCompletedDetails(false);
    setEditLockVersion(null);
    setEditStatus(null);
    setLoadingEdit(false);
    setExportBusy(false);
  }

  function closeWizard() {
    if (busy) return;
    resetWizard();
    onClose();
  }

  function selectCategory(category: Category) {
    const beneficiaryType = category.id === "employee" ? "EMPLOYEE" : category.id === "government" ? "GOVERNMENT" : "COMPANY";
    setForm((current) => ({ ...current, categoryCode: category.id, expenseType: category.options[0].label, beneficiaryType }));
    setError("");
  }

  function changePaymentMethod(method: PaymentMethod) {
    setForm((current) => ({
      ...current,
      paymentMethod: method,
      cashRecipient: method === "CASH" ? current.beneficiaryName : "",
      accountHolderName: method === "BANK" && current.accountNameMatch !== "MISMATCHED" ? current.beneficiaryName : current.accountHolderName,
      accountNameMatch: method === "CASH" ? "" : current.accountNameMatch || "MATCHED",
      accountMismatchReason: method === "CASH" ? "" : current.accountMismatchReason,
    }));
    setError("");
  }

  function changeBeneficiary(value: string) {
    setForm((current) => ({
      ...current,
      beneficiaryName: value,
      cashRecipient: current.paymentMethod === "CASH" ? value : current.cashRecipient,
      accountHolderName: current.accountNameMatch === "MISMATCHED" ? current.accountHolderName : value,
      accountNameMatch: current.paymentMethod === "BANK" && current.accountNameMatch !== "MISMATCHED" ? "MATCHED" : current.accountNameMatch,
    }));
  }

  function validateCurrent() {
    if (step === 1) {
      if (!form.categoryCode || !form.expenseType.trim()) return "اختر تصنيف الطلب ونوع الصرف التفصيلي";
      if (form.isMonthlyObligation) {
        if (!form.obligationType.trim()) return "اختر نوع الالتزام الشهري";
        if (!form.dueDate) return "حدد موعد استحقاق الالتزام الشهري";
        const reminder = Number(form.reminderDaysBefore);
        if (!Number.isInteger(reminder) || reminder < 1 || reminder > 30) return "حدد التنبيه من يوم إلى 30 يومًا قبل الاستحقاق";
      }
    }
    if (step === 2) {
      if (!form.beneficiaryName.trim()) return "اكتب اسم المستفيد";
      if (form.paymentMethod === "BANK") {
        if (!form.bankName.trim()) return "اكتب اسم البنك";
        if (!/^SA\d{22}$/.test(rawIban(form.iban))) return "تحقق من الآيبان السعودي؛ يجب أن يبدأ بـ SA ويتكون من 24 خانة";
        if (!form.accountHolderName.trim()) return "اكتب اسم صاحب الحساب كما يظهر لدى البنك";
        if (!form.accountNameMatch) return "حدد هل اسم صاحب الحساب مطابق للمستفيد";
        if (form.accountNameMatch === "MISMATCHED" && form.accountMismatchReason.trim().length < 5) return "اكتب سببًا واضحًا لعدم مطابقة اسم الحساب";
      }
    }
    if (step === 3) {
      if (!(Number(form.amount) > 0)) return "أدخل مبلغ الصرف المطلوب";
      if (form.categoryCode === "supplier" && Number(form.totalDue) > 0) {
        if (Number(form.paidPreviously) > Number(form.totalDue)) return "المدفوع سابقًا لا يمكن أن يتجاوز إجمالي الاستحقاق";
        if (Number(form.amount) > availableBeforeCurrent) return "المبلغ المطلوب أكبر من الرصيد المتبقي للمورد";
      }
      if (!form.purpose.trim()) return "اكتب الغرض المختصر من الصرف";
      if (form.details.trim().length < 10) return "اكتب بيانًا تفصيليًا واضحًا لا يقل عن 10 أحرف";
    }
    if (step === 4) {
      if (uploading) return "انتظر حتى يكتمل رفع جميع المرفقات";
      if (failedUploads) return "يوجد ملف لم يكتمل رفعه؛ أعد المحاولة أو احذفه";
      if (form.paymentMethod === "BANK" && form.accountNameMatch === "MISMATCHED" && readyAttachments.length === 0) return "عدم تطابق اسم الحساب يتطلب إرفاق تفويض أو عقد أو مستند إثبات";
    }
    if (step === 5 && !acknowledged) return "أقر بصحة البيانات والمرفقات قبل الإرسال";
    return "";
  }

  function next() {
    const message = validateCurrent();
    if (message) { setError(message); return; }
    setError("");
    setStep((current) => Math.min(5, current + 1));
  }

  function setAttachment(localId: string, updater: (item: Attachment) => Attachment) {
    setAttachments((items) => items.map((item) => item.localId === localId ? updater(item) : item));
  }

  function sendFile(localId: string, file: File) {
    setAttachment(localId, (item) => ({ ...item, file, name: file.name, size: file.size, progress: 1, status: "UPLOADING", error: undefined }));
    const data = new FormData();
    data.append("file", file);
    data.append("draftKey", draftKey);
    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/files");
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) setAttachment(localId, (item) => ({ ...item, progress: Math.max(1, Math.round(event.loaded / event.total * 100)) }));
    };
    xhr.onload = () => {
      try {
        const result = JSON.parse(xhr.responseText || "{}");
        if (xhr.status >= 200 && xhr.status < 300) {
          setAttachment(localId, (item) => ({ ...item, id: result.file.id, name: result.file.name, size: result.file.sizeBytes ?? item.size, progress: 100, status: "READY", error: undefined }));
        } else throw new Error(result.error || "تعذر رفع الملف");
      } catch (uploadError) {
        setAttachment(localId, (item) => ({ ...item, status: "FAILED", error: uploadError instanceof Error ? uploadError.message : "تعذر رفع الملف" }));
      }
    };
    xhr.onerror = () => setAttachment(localId, (item) => ({ ...item, status: "FAILED", error: "انقطع الاتصال؛ أعد المحاولة" }));
    xhr.send(data);
  }

  async function queueFile(original: File) {
    if (original.type.startsWith("video/")) { setError("ملفات الفيديو غير مدعومة"); return; }
    if (original.size > 25 * 1024 * 1024) { setError(`الملف ${original.name} أكبر من الحد المسموح`); return; }
    const duplicate = attachments.some((item) => item.name === original.name && item.size === original.size && item.status !== "FAILED");
    if (duplicate) { setError(`الملف ${original.name} مضاف بالفعل`); return; }
    const localId = clientId();
    setAttachments((items) => [...items, { localId, name: original.name, size: original.size, progress: 0, status: "UPLOADING", file: original }]);
    const file = await compressImage(original);
    if (file.size > 900_000) {
      setAttachment(localId, (item) => ({ ...item, status: "FAILED", error: "تعذر ضغط الملف للرفع. اختر صورة أصغر أو ملفًا أقل من 900 ك.ب" }));
      return;
    }
    sendFile(localId, file);
  }

  function uploadFiles(list: FileList | null) {
    if (!list?.length) return;
    setError("");
    Array.from(list).forEach((file) => { void queueFile(file); });
  }

  function retryAttachment(item: Attachment) {
    if (!item.file) return;
    setError("");
    sendFile(item.localId, item.file);
  }

  async function removeAttachment(item: Attachment) {
    if (item.status === "UPLOADING") return;
    if (item.id) {
      try {
        const response = await fetch(`/api/files/${item.id}`, { method: "DELETE", headers: { "Idempotency-Key": clientId() } });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || "تعذر إزالة المرفق");
        if (Number.isInteger(result.request?.lockVersion)) setEditLockVersion(result.request.lockVersion);
      } catch (removeError) {
        setError(removeError instanceof Error ? removeError.message : "تعذر إزالة المرفق");
        return;
      }
    }
    setAttachments((items) => items.filter((candidate) => candidate.localId !== item.localId));
  }

  async function save(intent: "DRAFT" | "SUBMIT") {
    if (intent === "SUBMIT") {
      const message = validateCurrent();
      if (message) { setError(message); return; }
      if (uploading) { setError("لا يمكن الإرسال قبل اكتمال رفع المرفقات"); return; }
    }
    setBusy(true);
    setError("");
    try {
      const payload = {
          intent,
          draftKey,
          expectedLockVersion: editLockVersion,
          departmentCode: selectedCategory.departmentCode,
          branchCode: "KHAMIS",
          categoryCode: form.categoryCode,
          expenseType: form.expenseType,
          isMonthlyObligation: form.isMonthlyObligation,
          isRecurring: form.isMonthlyObligation,
          recurring: form.isMonthlyObligation,
          obligationType: form.isMonthlyObligation ? form.obligationType : null,
          dueDate: form.isMonthlyObligation ? form.dueDate : null,
          dueDay: form.isMonthlyObligation ? Number(form.dueDate.slice(-2)) : null,
          nextDueDate: form.isMonthlyObligation ? form.dueDate : null,
          reminderDaysBefore: form.isMonthlyObligation ? Number(form.reminderDaysBefore) : null,
          monthlyObligation: form.isMonthlyObligation ? {
            enabled: true,
            type: form.obligationType,
            dueDate: form.dueDate,
            reminderDaysBefore: Number(form.reminderDaysBefore),
          } : null,
          paymentMethod: form.paymentMethod,
          beneficiaryName: form.beneficiaryName.trim(),
          beneficiaryType: form.beneficiaryType,
          bankName: form.paymentMethod === "BANK" ? form.bankName.trim() : "",
          iban: form.paymentMethod === "BANK" ? rawIban(form.iban) : "",
          accountHolderName: form.paymentMethod === "BANK" ? form.accountHolderName.trim() : "",
          accountNameMatch: form.paymentMethod === "BANK" ? form.accountNameMatch : "",
          accountMismatchReason: form.accountNameMatch === "MISMATCHED" ? form.accountMismatchReason.trim() : "",
          cashRecipient: form.paymentMethod === "CASH" ? form.beneficiaryName.trim() : "",
          totalDueMinor: form.totalDue ? Math.round(Number(form.totalDue) * 100) : null,
          paidPreviouslyMinor: form.paidPreviously ? Math.round(Number(form.paidPreviously) * 100) : null,
          amountMinor: Math.round(Number(form.amount || 0) * 100),
          purpose: form.purpose.trim(),
          details: form.details.trim(),
        };
      const response = await fetch(editMode ? `/api/requests/${editRequestId}` : "/api/requests", {
        method: editMode ? "PUT" : "POST",
        headers: { "content-type": "application/json", ...(editMode ? { "Idempotency-Key": clientId() } : {}) },
        body: JSON.stringify(payload),
      });
      let result = await response.json();
      if (!response.ok) throw new Error(result.error || "تعذر حفظ الطلب");
      if (editMode && Number.isInteger(result.request?.lockVersion)) setEditLockVersion(result.request.lockVersion);
      if (editMode && intent === "SUBMIT" && ["DRAFT", "RETURNED_TO_CREATOR"].includes(editStatus || "")) {
        const actionResponse = await fetch(`/api/requests/${editRequestId}/action`, {
          method: "POST",
          headers: { "content-type": "application/json", "Idempotency-Key": clientId() },
          body: JSON.stringify({ action: editStatus === "DRAFT" ? "SUBMIT" : "RESUBMIT", note: "تم تعديل الطلب وإعادة إرساله للاعتماد", expectedLockVersion: result.request.lockVersion }),
        });
        const actionResult = await actionResponse.json();
        if (!actionResponse.ok) throw new Error(actionResult.error || "حُفظ التعديل لكن تعذرت إعادة الإرسال");
        result = actionResult;
        if (Number.isInteger(result.request?.lockVersion)) setEditLockVersion(result.request.lockVersion);
      }
      if (intent === "SUBMIT") {
        setCompleted({
          id: result.request.id,
          requestNumber: result.request.requestNumber,
          status: result.request.status,
          currentStage: result.request.currentStage,
          currentAssignee: result.request.currentAssignee ?? result.request.currentResponsible,
        });
        onSuccess(editMode ? `تم حفظ تعديل الطلب ${result.request.requestNumber}` : `تم إرسال الطلب ${result.request.requestNumber} للاعتماد`);
        if (editMode && editRequestId) onUpdated?.(editRequestId);
      } else {
        onSuccess(editMode ? "تم حفظ التعديلات وتسجيل إصدار جديد" : "تم حفظ المسودة ويمكن استكمالها لاحقًا");
        if (editMode && editRequestId) onUpdated?.(editRequestId);
      }
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "تعذر تنفيذ العملية");
    } finally {
      setBusy(false);
    }
  }

  function openPrint(mode: "preview" | "pdf") {
    if (!completed) return;
    if (mode === "pdf") {
      if (exportBusy) return;
      setExportBusy(true);
      void downloadRequestPdf(completed.id, setError)
        .then(() => { setError(""); onSuccess("تم تنزيل ملف PDF الكامل بالمرفقات"); })
        .catch((exportError) => setError(exportError instanceof Error ? exportError.message : "تعذر إنشاء ملف PDF"))
        .finally(() => setExportBusy(false));
      return;
    }
    if (exportBusy) return;
    setExportBusy(true);
    void previewRequestPdf(completed.id, setError)
      .then(() => setError(""))
      .catch((exportError) => setError(exportError instanceof Error ? exportError.message : "تعذر فتح معاينة السند"))
      .finally(() => setExportBusy(false));
  }

  async function shareWhatsApp() {
    if (!completed) return;
    if (exportBusy) return;
    setExportBusy(true);
    setError("جارٍ تجهيز ملف PDF والمرفقات للمشاركة...");
    try {
      const result = await shareRequestPdf(completed.id, setError);
      setError("");
      onSuccess(result.shared ? "فُتحت المشاركة والـPDF مرفق فعليًا" : "تم تنزيل ملف PDF؛ اختره من واتساب على هذا الجهاز");
    } catch (shareError) {
      setError(shareError instanceof Error ? shareError.message : "تعذرت مشاركة ملف PDF");
    } finally { setExportBusy(false); }
  }

  function goToTasks() {
    window.dispatchEvent(new CustomEvent("tito:navigate", { detail: { view: "مهامي" } }));
    closeWizard();
  }

  function openCompletedRequest(mode: "VIEW" | "EDIT") {
    if (!completed) return;
    window.dispatchEvent(new CustomEvent(mode === "EDIT" ? "tito:edit-request" : "tito:open-request", { detail: { requestId: completed.id } }));
    closeWizard();
  }

  return <div dir="rtl" className="fixed inset-0 z-[100] flex justify-end" role="dialog" aria-modal="true" aria-label={completed ? "تم حفظ طلب الصرف" : editMode ? "تعديل طلب الصرف" : "إنشاء طلب صرف جديد"}>
    <button className="absolute inset-0 bg-zinc-950/50 backdrop-blur-[2px]" aria-label="إغلاق" onClick={closeWizard}/>
    <section className="sheet-enter relative flex h-full w-full flex-col overflow-hidden bg-white shadow-2xl sm:m-3 sm:h-[calc(100%-24px)] sm:max-w-[880px] sm:rounded-3xl">
      <header className="flex min-h-[88px] items-center gap-4 border-b border-zinc-200 px-4 py-4 sm:px-7">
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-[#dc001c] font-sans text-lg font-black tracking-[-.12em] text-white [direction:ltr]">T2</span>
        <div className="min-w-0 flex-1">
          <span className="block text-[11px] font-bold text-[#dc001c]">نظام حوكمة الصرف · TITO</span>
          <h2 className="mt-1 truncate text-lg font-extrabold text-zinc-950 sm:text-xl">{completed ? (editMode ? "تم حفظ التعديل" : "تم إرسال الطلب") : editMode ? `تعديل الطلب · ${stepNames[step - 1]}` : stepNames[step - 1]}</h2>
          <p className="mt-1 hidden text-xs text-zinc-500 sm:block">{completed ? "الطلب داخل مساره الصحيح ويمكنك معاينته أو مشاركته." : editMode ? "سيُحفظ إصدار جديد، وسيظهر التعديل في سجل التدقيق." : "خمس خطوات واضحة؛ لن تظهر إلا الحقول التي يحتاجها طلبك."}</p>
        </div>
        <button onClick={closeWizard} disabled={busy} className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-zinc-200 text-zinc-500 transition hover:border-red-200 hover:bg-red-50 hover:text-[#dc001c] disabled:opacity-50" aria-label="إغلاق"><Icon name="close" size={20}/></button>
      </header>

      {!completed ? <div className="border-b border-zinc-200 bg-zinc-50 px-3 py-3 sm:px-7">
        <div className="relative grid grid-cols-5">
          <span className="absolute right-[10%] left-[10%] top-4 h-px bg-zinc-200"/>
          {stepNames.map((name, index) => {
            const number = index + 1;
            const done = number < step;
            const active = number === step;
            return <button key={name} type="button" disabled={!done || busy} onClick={() => done && setStep(number)} className={`relative z-10 flex min-w-0 flex-col items-center gap-1.5 ${active ? "text-[#dc001c]" : done ? "text-zinc-800" : "text-zinc-400"}`} aria-current={active ? "step" : undefined}>
              <span className={`grid h-8 w-8 place-items-center rounded-full border text-xs font-bold ${active ? "border-[#dc001c] bg-[#dc001c] text-white shadow-[0_0_0_4px_#fff0f2]" : done ? "border-zinc-900 bg-zinc-900 text-white" : "border-zinc-300 bg-white"}`}>{done ? <Icon name="check" size={14}/> : number}</span>
              <small className="w-full truncate px-0.5 text-[9px] font-semibold sm:text-[11px]">{name}</small>
            </button>;
          })}
        </div>
      </div> : null}

      <div className="no-scrollbar flex-1 overflow-y-auto px-4 py-5 sm:px-7 sm:py-6">
        {loadingEdit ? <div className="grid min-h-[340px] place-items-center"><p className="text-sm font-bold text-zinc-500">جارٍ تحميل بيانات الطلب والمرفقات...</p></div> : null}
        {!completed && !loadingEdit ? <div className="mb-5 flex items-start gap-3 rounded-2xl border border-zinc-200 bg-zinc-50 p-3.5">
          <span className="mt-0.5 text-[#dc001c]"><Icon name="shield" size={20}/></span>
          <div><strong className="block text-xs text-zinc-900">بيانات المُعدّ والإدارة والفرع تُسجّل تلقائيًا</strong><p className="mt-1 text-[11px] leading-5 text-zinc-500">تُؤخذ من حساب المستخدم ولا يمكن تغييرها داخل الطلب. تحديد الأولوية من صلاحية المدير المعتمد فقط.</p></div>
        </div> : null}

        {step === 1 && !completed && !loadingEdit ? <div>
          <div className="mb-3"><h3 className="text-sm font-extrabold text-zinc-900">ما نوع المصروف؟</h3><p className="mt-1 text-xs text-zinc-500">اختيارك يحدد جهة الاعتماد ومجموعة المسير تلقائيًا.</p></div>
          <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
            {categories.map((category) => {
              const active = form.categoryCode === category.id;
              return <button key={category.id} type="button" onClick={() => selectCategory(category)} aria-pressed={active} className={`relative min-h-[112px] rounded-2xl border p-4 text-right transition ${active ? "border-[#dc001c] bg-[#fff8f9] shadow-[0_8px_24px_rgba(220,0,28,.08)]" : "border-zinc-200 bg-white hover:border-red-200 hover:bg-red-50/40"}`}>
                <span className={`grid h-10 w-10 place-items-center rounded-xl ${active ? "bg-[#dc001c] text-white" : "bg-zinc-100 text-zinc-600"}`}><Icon name={category.icon} size={20}/></span>
                <span className={`absolute left-4 top-4 grid h-5 w-5 place-items-center rounded-full border ${active ? "border-[#dc001c]" : "border-zinc-300"}`}>{active ? <i className="h-2.5 w-2.5 rounded-full bg-[#dc001c]"/> : null}</span>
                <strong className="mt-3 block text-[13px] text-zinc-900">{category.title}</strong>
                <small className="mt-1 block text-[11px] leading-5 text-zinc-500">{category.note}</small>
              </button>;
            })}
          </div>

          <div className="mt-5 grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(240px,.8fr)]">
            <Field label="نوع الصرف التفصيلي" required>
              <select value={form.expenseType} onChange={(event) => update("expenseType", event.target.value)} className={inputClass}>
                {selectedCategory.options.map((option) => <option key={option.label}>{option.label}</option>)}
              </select>
            </Field>
            <div className="rounded-2xl border border-red-100 bg-[#fff8f9] p-3.5">
              <span className="flex items-center gap-2 text-xs font-bold text-[#dc001c]"><Icon name="info" size={16}/>معلومة مرتبطة بالاختيار</span>
              <p className="mt-2 text-[11px] leading-5 text-zinc-600">{selectedType.hint}</p>
            </div>
          </div>

          <div className={`mt-5 overflow-hidden rounded-2xl border transition ${form.isMonthlyObligation ? "border-[#dc001c] bg-[#fffafb]" : "border-zinc-200 bg-white"}`}>
            <button type="button" onClick={() => update("isMonthlyObligation", !form.isMonthlyObligation)} className="flex w-full items-center gap-3 p-4 text-right" aria-pressed={form.isMonthlyObligation}>
              <span className={`grid h-11 w-11 shrink-0 place-items-center rounded-xl ${form.isMonthlyObligation ? "bg-[#dc001c] text-white" : "bg-zinc-100 text-zinc-600"}`}><Icon name="calendar" size={21}/></span>
              <span className="min-w-0 flex-1"><strong className="block text-sm">فاتورة أو التزام شهري متكرر</strong><small className="mt-1 block text-[11px] leading-5 text-zinc-500">يفعّل تنبيهًا قبل موعد الاستحقاق حتى لا تتأخر الفاتورة.</small></span>
              <span className={`relative h-7 w-12 shrink-0 rounded-full transition ${form.isMonthlyObligation ? "bg-[#dc001c]" : "bg-zinc-200"}`}><i className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow transition ${form.isMonthlyObligation ? "left-1" : "right-1"}`}/></span>
            </button>
            {form.isMonthlyObligation ? <div className="grid gap-3 border-t border-red-100 p-4 sm:grid-cols-3">
              <Field label="نوع الالتزام" required><select value={form.obligationType} onChange={(event) => update("obligationType", event.target.value)} className={inputClass}>{obligationTypes.map((item) => <option key={item}>{item}</option>)}</select></Field>
              <Field label="موعد الاستحقاق" required hint="يُكرر النظام التنبيه شهريًا"><input type="date" min={isoDate(new Date())} value={form.dueDate} onChange={(event) => update("dueDate", event.target.value)} className={inputClass}/></Field>
              <Field label="التنبيه قبل الاستحقاق" required><select value={form.reminderDaysBefore} onChange={(event) => update("reminderDaysBefore", event.target.value)} className={inputClass}><option value="1">قبل يوم</option><option value="2">قبل يومين</option><option value="3">قبل 3 أيام</option><option value="5">قبل 5 أيام</option><option value="7">قبل 7 أيام</option></select></Field>
            </div> : null}
          </div>

          <div className="mt-4 rounded-2xl border border-zinc-200 bg-zinc-50 p-3.5">
            <small className="text-[11px] font-bold text-zinc-500">مسار الاعتماد المتوقع</small>
            <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[11px] font-semibold text-zinc-800">{selectedCategory.route.map((item, index) => <span key={item} className="contents"><b className={index === 0 ? "rounded-lg bg-white px-2.5 py-2 text-[#dc001c] shadow-sm" : "rounded-lg bg-white px-2.5 py-2"}>{item}</b>{index < selectedCategory.route.length - 1 ? <Icon name="chevron" size={13}/> : null}</span>)}</div>
          </div>
        </div> : null}

        {step === 2 && !completed && !loadingEdit ? <div>
          <div className="mb-4"><h3 className="text-sm font-extrabold">المستفيد وطريقة الدفع</h3><p className="mt-1 text-xs text-zinc-500">السداد الحكومي تصنيف، أما طريقة الدفع فهي بنكية أو نقدية فقط.</p></div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="اسم المستفيد" required hint="اكتب الاسم القانوني للفرد أو الجهة"><input value={form.beneficiaryName} onChange={(event) => changeBeneficiary(event.target.value)} className={inputClass} placeholder="مثال: شركة الحلول التقنية" autoComplete="off"/></Field>
            <Field label="نوع المستفيد" required><select value={form.beneficiaryType} onChange={(event) => update("beneficiaryType", event.target.value)} className={inputClass}><option value="COMPANY">مؤسسة أو شركة</option><option value="PERSON">فرد</option><option value="EMPLOYEE">موظف</option><option value="GOVERNMENT">جهة حكومية</option></select></Field>
          </div>

          <div className="my-5"><span className="mb-2 block text-xs font-bold text-zinc-700">طريقة الدفع المطلوبة <i className="not-italic text-[#dc001c]">*</i></span><div className="grid grid-cols-2 gap-2.5">
            <button type="button" onClick={() => changePaymentMethod("BANK")} className={`flex min-h-16 items-center gap-3 rounded-2xl border px-4 text-right transition ${form.paymentMethod === "BANK" ? "border-[#dc001c] bg-[#fff8f9] text-[#dc001c]" : "border-zinc-200 text-zinc-600"}`}><span className={`grid h-10 w-10 place-items-center rounded-xl ${form.paymentMethod === "BANK" ? "bg-[#dc001c] text-white" : "bg-zinc-100"}`}><Icon name="bank" size={20}/></span><span><strong className="block text-sm">تحويل بنكي</strong><small className="mt-1 block text-[10px] text-zinc-500">إلى حساب المستفيد</small></span></button>
            <button type="button" onClick={() => changePaymentMethod("CASH")} className={`flex min-h-16 items-center gap-3 rounded-2xl border px-4 text-right transition ${form.paymentMethod === "CASH" ? "border-[#dc001c] bg-[#fff8f9] text-[#dc001c]" : "border-zinc-200 text-zinc-600"}`}><span className={`grid h-10 w-10 place-items-center rounded-xl ${form.paymentMethod === "CASH" ? "bg-[#dc001c] text-white" : "bg-zinc-100"}`}><Icon name="cash" size={20}/></span><span><strong className="block text-sm">نقدًا من الصندوق</strong><small className="mt-1 block text-[10px] text-zinc-500">اسم المستلم تلقائي</small></span></button>
          </div></div>

          {form.paymentMethod === "BANK" ? <div className="space-y-4 rounded-2xl border border-zinc-200 bg-zinc-50/70 p-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="اسم البنك" required><input value={form.bankName} onChange={(event) => update("bankName", event.target.value)} className={inputClass} placeholder="اسم البنك"/></Field>
              <Field label="رقم الآيبان" required hint="24 خانة ويبدأ بـ SA"><input dir="ltr" inputMode="text" value={formatIban(form.iban)} onChange={(event) => update("iban", rawIban(event.target.value))} className={`${inputClass} font-mono tracking-wide text-left`} placeholder="SA00 0000 0000 0000 0000 0000" autoCapitalize="characters"/></Field>
            </div>
            {form.accountNameMatch === "MISMATCHED" ? <Field label="اسم صاحب الحساب المختلف" required hint="اكتبه فقط عندما يختلف عن المستفيد"><input value={form.accountHolderName} onChange={(event) => update("accountHolderName", event.target.value)} className={inputClass} placeholder="الاسم المسجل على الحساب البنكي"/></Field> : <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3"><span className="text-xs font-bold text-emerald-700">اسم صاحب الحساب</span><strong className="mt-1 block text-sm text-zinc-800">{form.beneficiaryName || "اكتب اسم المستفيد أعلاه"}</strong><small className="mt-1 block text-xs text-zinc-500">تم نسخه تلقائيًا، ولا تحتاج لكتابته مرة ثانية.</small></div>}
            <div><span className="mb-2 block text-xs font-bold text-zinc-700">هل اسم الحساب مطابق لاسم المستفيد؟ <i className="not-italic text-[#dc001c]">*</i></span><div className="grid grid-cols-2 gap-2.5">
              <button type="button" onClick={() => setForm((current) => ({ ...current, accountHolderName: current.beneficiaryName, accountNameMatch: "MATCHED", accountMismatchReason: "" }))} className={`flex h-12 items-center justify-center gap-2 rounded-xl border text-sm font-bold ${form.accountNameMatch === "MATCHED" ? "border-zinc-900 bg-zinc-900 text-white" : "border-zinc-200 bg-white text-zinc-600"}`}><Icon name="check" size={17}/>مطابق تلقائيًا</button>
              <button type="button" onClick={() => setForm((current) => ({ ...current, accountNameMatch: "MISMATCHED", accountHolderName: current.accountHolderName === current.beneficiaryName ? "" : current.accountHolderName }))} className={`flex h-12 items-center justify-center gap-2 rounded-xl border text-sm font-bold ${form.accountNameMatch === "MISMATCHED" ? "border-[#dc001c] bg-[#dc001c] text-white" : "border-zinc-200 bg-white text-zinc-600"}`}><Icon name="info" size={17}/>مختلف</button>
            </div></div>
            {form.accountNameMatch === "MISMATCHED" ? <div className="rounded-2xl border border-red-200 bg-red-50 p-3.5"><Field label="سبب عدم المطابقة" required hint="في الخطوة الرابعة أرفق التفويض أو العقد أو مستند الإثبات"><textarea value={form.accountMismatchReason} onChange={(event) => update("accountMismatchReason", event.target.value)} className="min-h-24 w-full resize-none rounded-xl border border-red-200 bg-white p-3 text-[16px] outline-none focus:border-[#dc001c] focus:ring-4 focus:ring-red-100 sm:text-sm" placeholder="مثال: الحساب باسم الشركة التشغيلية وفق التفويض المرفق..."/></Field></div> : null}
          </div> : <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4"><Field label="اسم مستلم النقد" required hint="يُنسخ تلقائيًا من اسم المستفيد ولا يحتاج إلى إدخال جديد"><div className="relative"><input value={form.beneficiaryName} readOnly className={`${inputClass} bg-zinc-100 pl-10 font-bold text-zinc-700`} placeholder="اكتب اسم المستفيد أعلاه"/><span className="absolute left-3 top-3.5 text-zinc-400"><Icon name="shield" size={18}/></span></div></Field></div>}
        </div> : null}

        {step === 3 && !completed && !loadingEdit ? <div>
          <div className="mb-4"><h3 className="text-sm font-extrabold">المبلغ وبيان الصرف</h3><p className="mt-1 text-xs text-zinc-500">لا يحدد معدّ الطلب الأولوية؛ يرفعها المدير عند الحاجة.</p></div>
          <div className={`grid gap-4 ${form.categoryCode === "supplier" ? "sm:grid-cols-3" : "sm:grid-cols-2"}`}>
            {form.categoryCode === "supplier" ? <><Field label="إجمالي الاستحقاق"><div className="relative"><input dir="ltr" inputMode="decimal" value={form.totalDue} onChange={(event) => update("totalDue", amountInput(event.target.value))} className={`${inputClass} pl-12 text-left font-mono`} placeholder="0.00"/><span className="absolute left-3 top-4 text-[11px] text-zinc-400">ر.س</span></div></Field><Field label="المدفوع سابقًا"><div className="relative"><input dir="ltr" inputMode="decimal" value={form.paidPreviously} onChange={(event) => update("paidPreviously", amountInput(event.target.value))} className={`${inputClass} pl-12 text-left font-mono`} placeholder="0.00"/><span className="absolute left-3 top-4 text-[11px] text-zinc-400">ر.س</span></div></Field></> : null}
            <Field label="المطلوب صرفه الآن" required><div className="relative"><input dir="ltr" inputMode="decimal" value={form.amount} onChange={(event) => update("amount", amountInput(event.target.value))} className={`${inputClass} pl-12 text-left font-mono font-bold`} placeholder="0.00"/><span className="absolute left-3 top-4 text-[11px] text-zinc-400">ر.س</span></div></Field>
          </div>
          {form.categoryCode === "supplier" && form.totalDue ? <div className="mt-3 flex items-center justify-between rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-xs"><span className="text-zinc-500">المتبقي بعد الصرف</span><strong dir="ltr" className="font-mono text-sm">{money(remaining)} ر.س</strong></div> : null}
          <div className="mt-5"><Field label="الغرض المختصر من الصرف" required><input value={form.purpose} onChange={(event) => update("purpose", event.target.value)} className={inputClass} placeholder="عنوان واضح يظهر في القوائم والمسير" maxLength={120}/></Field></div>
          <div className="mt-4"><Field label="البيان التفصيلي" required hint="سيظهر هذا النص في المعاينة وPDF ورسالة واتساب"><textarea value={form.details} onChange={(event) => update("details", event.target.value)} className="min-h-36 w-full resize-none rounded-xl border border-zinc-200 p-3 text-[16px] leading-7 outline-none focus:border-[#dc001c] focus:ring-4 focus:ring-red-50 sm:text-sm" placeholder="اشرح ما الذي سيتم دفعه، ولماذا، وما المرجع أو الفترة التي يخصها الصرف..." maxLength={1500}/><span className="mt-1 block text-left text-[10px] text-zinc-400">{form.details.length}/1500</span></Field></div>
        </div> : null}

        {step === 4 && !completed && !loadingEdit ? <div>
          <div className="mb-4"><h3 className="text-sm font-extrabold">المرفقات والمستندات</h3><p className="mt-1 text-xs text-zinc-500">ارفع أكثر من ملف، وتأكد من ظهور علامة الجاهزية لكل مرفق.</p></div>
          {form.paymentMethod === "BANK" && form.accountNameMatch === "MISMATCHED" ? <div className="mb-4 flex gap-3 rounded-2xl border border-red-200 bg-red-50 p-3.5 text-[#b00018]"><Icon name="shield" size={20}/><div><strong className="block text-xs">مستند إثبات المطابقة البديلة مطلوب</strong><p className="mt-1 text-[11px] leading-5">أرفق تفويضًا أو عقدًا أو مستندًا يوضح العلاقة بين المستفيد وصاحب الحساب.</p></div></div> : null}
          <div className="rounded-2xl border-2 border-dashed border-zinc-200 bg-zinc-50 p-5 text-center">
            <span className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-white text-[#dc001c] shadow-sm"><Icon name="upload" size={23}/></span>
            <strong className="mt-3 block text-sm">اختر طريقة إضافة المرفقات</strong>
            <p className="mt-1 text-[11px] leading-5 text-zinc-500">تُضغط الصور تلقائيًا ويُرفع كل ملف بشكل مستقل.</p>
            <div className="mt-4 grid gap-2 sm:mx-auto sm:max-w-md sm:grid-cols-2">
              <label className="flex h-12 cursor-pointer items-center justify-center gap-2 rounded-xl bg-[#dc001c] px-4 text-xs font-bold text-white"><Icon name="camera" size={18}/>الكاميرا أو الصور<input type="file" multiple accept="image/*" className="hidden" onChange={(event) => { uploadFiles(event.target.files); event.target.value = ""; }}/></label>
              <label className="flex h-12 cursor-pointer items-center justify-center gap-2 rounded-xl border border-zinc-300 bg-white px-4 text-xs font-bold text-zinc-700"><Icon name="file" size={18}/>PDF وWord وExcel<input type="file" multiple accept=".pdf,.doc,.docx,.xls,.xlsx" className="hidden" onChange={(event) => { uploadFiles(event.target.files); event.target.value = ""; }}/></label>
            </div>
            <small className="mt-3 block text-[10px] text-zinc-400">تُصغّر صور الجوال تلقائيًا · الملفات الأخرى حتى 900 ك.ب · الفيديو غير مدعوم</small>
          </div>

          <div className="mt-5">
            <div className="mb-2 flex items-center justify-between"><strong className="text-xs">المرفقات المضافة</strong><span className="rounded-lg bg-zinc-100 px-2.5 py-1 text-[11px] text-zinc-600">{readyAttachments.length} جاهز من {attachments.length}</span></div>
            <div className="space-y-2.5">
              {attachments.map((item, index) => <article key={item.localId} className={`grid min-h-[78px] grid-cols-[44px_minmax(0,1fr)_auto] items-center gap-3 rounded-2xl border p-3 ${item.status === "FAILED" ? "border-red-200 bg-red-50/50" : item.status === "READY" ? "border-zinc-200 bg-white" : "border-zinc-200 bg-zinc-50"}`}>
                <span className={`grid h-11 w-11 place-items-center rounded-xl ${item.status === "READY" ? "bg-zinc-900 text-white" : item.status === "FAILED" ? "bg-[#dc001c] text-white" : "bg-white text-[#dc001c]"}`}>{item.status === "READY" ? <Icon name="check" size={20}/> : item.status === "FAILED" ? <Icon name="info" size={20}/> : <b className="text-[11px]">{item.progress}%</b>}</span>
                <div className="min-w-0"><div className="flex items-center gap-2"><b className="grid h-5 min-w-5 place-items-center rounded-md bg-zinc-100 text-[9px] text-zinc-600">{index + 1}</b><strong className="truncate text-xs">{item.name}</strong></div><p className={`mt-1 text-[11px] ${item.status === "FAILED" ? "text-[#b00018]" : "text-zinc-500"}`}>{formatBytes(item.size)} · {item.status === "READY" ? "تم الرفع وأصبح جاهزًا" : item.status === "FAILED" ? item.error : "جارٍ الرفع..."}</p>{item.status === "UPLOADING" ? <span className="mt-2 block h-1.5 overflow-hidden rounded-full bg-zinc-200"><i className="block h-full rounded-full bg-[#dc001c] transition-all" style={{ width: `${item.progress}%` }}/></span> : null}</div>
                <div className="flex items-center gap-1">{item.status === "READY" && item.id ? <a href={`/api/files/${item.id}`} target="_blank" rel="noreferrer" className="grid h-9 w-9 place-items-center rounded-lg text-zinc-500 hover:bg-zinc-100 hover:text-[#dc001c]" aria-label={`معاينة ${item.name}`}><Icon name="eye" size={17}/></a> : null}{item.status === "FAILED" ? <button type="button" onClick={() => retryAttachment(item)} className="grid h-9 w-9 place-items-center rounded-lg text-[#dc001c] hover:bg-red-100" aria-label={`إعادة رفع ${item.name}`}><Icon name="refresh" size={17}/></button> : null}<button type="button" disabled={item.status === "UPLOADING"} onClick={() => void removeAttachment(item)} className="grid h-9 w-9 place-items-center rounded-lg text-zinc-400 hover:bg-red-50 hover:text-[#dc001c] disabled:opacity-30" aria-label={`حذف ${item.name}`}><Icon name="trash" size={17}/></button></div>
              </article>)}
              {!attachments.length ? <div className="rounded-2xl border border-zinc-200 bg-white py-8 text-center"><span className="mx-auto grid h-10 w-10 place-items-center rounded-xl bg-zinc-100 text-zinc-400"><Icon name="file" size={19}/></span><p className="mt-2 text-xs text-zinc-500">لم تُرفع مرفقات بعد</p></div> : null}
            </div>
          </div>
        </div> : null}

        {step === 5 && !completed && !loadingEdit ? <div>
          <div className="mb-4"><h3 className="text-sm font-extrabold">راجع الطلب قبل الإرسال</h3><p className="mt-1 text-xs text-zinc-500">بعد الإرسال سيذهب مباشرة إلى المسؤول الموضح أدناه.</p></div>
          <div className="grid gap-3 sm:grid-cols-2">
            <section className="rounded-2xl border border-zinc-200 bg-white p-4"><span className="text-[11px] font-bold text-zinc-400">التصنيف</span><strong className="mt-1 block text-sm">{selectedCategory.title}</strong><p className="mt-1 text-xs text-zinc-500">{form.expenseType}</p>{form.isMonthlyObligation ? <div className="mt-4 rounded-xl bg-red-50 p-3 text-xs"><b className="flex items-center gap-2 text-[#dc001c]"><Icon name="calendar" size={16}/>{form.obligationType}</b><p className="mt-1 text-zinc-600">الاستحقاق {form.dueDate} · التنبيه قبل {form.reminderDaysBefore} يوم</p></div> : null}<span className="mt-4 block text-[11px] font-bold text-zinc-400">المستفيد</span><strong className="mt-1 block text-sm">{form.beneficiaryName}</strong><p className="mt-1 text-xs text-zinc-500">{form.paymentMethod === "BANK" ? `تحويل بنكي · ${form.bankName}` : "نقدًا من الصندوق"}</p>{form.paymentMethod === "BANK" ? <p className={`mt-2 w-max rounded-lg px-2 py-1 text-[11px] font-bold ${form.accountNameMatch === "MATCHED" ? "bg-zinc-900 text-white" : "bg-red-50 text-[#dc001c]"}`}>{form.accountNameMatch === "MATCHED" ? "اسم الحساب مطابق" : "اسم الحساب غير مطابق · يوجد إثبات"}</p> : null}</section>
            <section className="rounded-2xl border border-zinc-200 bg-white p-4"><span className="text-[11px] font-bold text-zinc-400">المبلغ المطلوب</span><strong dir="ltr" className="mt-1 block text-right font-mono text-2xl text-zinc-950">{money(form.amount)} <small className="text-xs text-zinc-500">ر.س</small></strong><span className="mt-4 block text-[11px] font-bold text-zinc-400">الغرض</span><strong className="mt-1 block text-sm">{form.purpose}</strong><span className="mt-4 block text-[11px] font-bold text-zinc-400">البيان</span><p className="mt-1 whitespace-pre-wrap text-xs leading-6 text-zinc-700">{form.details}</p><span className="mt-4 flex items-center gap-2 text-xs font-bold"><Icon name="file" size={16}/>{readyAttachments.length} مرفق جاهز</span></section>
          </div>
          <section className="mt-3 rounded-2xl border border-zinc-200 bg-zinc-50 p-4"><span className="text-[11px] font-bold text-zinc-500">المسؤول الحالي بعد الإرسال</span><strong className="mt-1 block text-sm text-[#dc001c]">{selectedCategory.owner}</strong><div className="mt-3 flex flex-wrap items-center gap-1.5 text-[10px] text-zinc-600">{selectedCategory.route.map((item, index) => <span key={item} className="contents"><b className="rounded-lg bg-white px-2 py-1.5">{item}</b>{index < selectedCategory.route.length - 1 ? <Icon name="chevron" size={12}/> : null}</span>)}</div></section>
          <label className={`mt-4 flex cursor-pointer items-start gap-3 rounded-2xl border p-4 transition ${acknowledged ? "border-zinc-900 bg-zinc-900 text-white" : "border-zinc-200 bg-white text-zinc-700"}`}><input type="checkbox" checked={acknowledged} onChange={(event) => setAcknowledged(event.target.checked)} className="mt-0.5 h-5 w-5 shrink-0 accent-[#dc001c]"/><span><strong className="block text-xs">إقرار بصحة الطلب</strong><small className={`mt-1 block text-[11px] leading-5 ${acknowledged ? "text-zinc-300" : "text-zinc-500"}`}>أقر بصحة البيانات والمستندات، وأفهم أن أي تعديل لاحق سيكون بإجراء رسمي مسجل.</small></span></label>
        </div> : null}

        {completed ? <div className="mx-auto max-w-2xl py-2 text-center sm:py-5">
          <span className="mx-auto grid h-17 w-17 place-items-center rounded-full border-4 border-red-100 bg-[#dc001c] text-white shadow-[0_12px_30px_rgba(220,0,28,.18)]"><Icon name="check" size={30}/></span>
          <h3 className="mt-5 text-xl font-extrabold sm:text-2xl">{editMode ? "حُفظ التعديل بنجاح" : "أُرسل الطلب بنجاح"}</h3>
          <p className="mt-2 text-sm text-zinc-500">{editMode ? "تم إنشاء إصدار جديد وبقي الطلب داخل التسلسل الإداري الصحيح." : "أصبح الطلب داخل دورة الاعتماد ووصل التنبيه إلى المسؤول الحالي."}</p>
          <div className="mt-5 grid gap-3 rounded-2xl border border-zinc-200 bg-zinc-50 p-4 text-right sm:grid-cols-3">
            <div><small className="text-[10px] text-zinc-400">رقم الطلب</small><strong dir="ltr" className="mt-1 block text-right font-mono text-sm text-[#dc001c]">{completed.requestNumber}</strong></div>
            <div><small className="text-[10px] text-zinc-400">الحالة الحالية</small><strong className="mt-1 block text-sm">بانتظار اعتماد الإدارة</strong></div>
            <div><small className="text-[10px] text-zinc-400">المسؤول الحالي</small><strong className="mt-1 block text-sm">{selectedCategory.owner}</strong></div>
          </div>
          <div className="mt-4 rounded-2xl border border-zinc-200 bg-white p-4 text-right"><small className="text-[10px] font-bold text-zinc-400">مسار الطلب</small><div className="mt-3 space-y-2">{["إعداد الطلب", ...selectedCategory.route].map((item, index) => <div key={item} className="grid grid-cols-[28px_1fr_auto] items-center gap-2"><span className={`grid h-7 w-7 place-items-center rounded-full ${index === 0 ? "bg-zinc-900 text-white" : index === 1 ? "bg-[#dc001c] text-white" : "border border-zinc-200 bg-zinc-50 text-zinc-400"}`}>{index === 0 ? <Icon name="check" size={13}/> : index + 1}</span><strong className={`text-xs ${index === 1 ? "text-[#dc001c]" : index === 0 ? "text-zinc-900" : "text-zinc-500"}`}>{item}</strong><small className="text-[10px] text-zinc-400">{index === 0 ? "مكتمل" : index === 1 ? "المرحلة الحالية" : "لاحقًا"}</small></div>)}</div></div>

          <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
            <button type="button" onClick={() => setShowCompletedDetails(!showCompletedDetails)} className="flex h-12 items-center justify-center gap-2 rounded-xl bg-zinc-900 px-3 text-xs font-bold text-white"><Icon name="eye" size={17}/>{showCompletedDetails ? "إخفاء الطلب" : "فتح الطلب"}</button>
            <button type="button" onClick={() => openPrint("preview")} className="flex h-12 items-center justify-center gap-2 rounded-xl border border-zinc-200 bg-white px-3 text-xs font-bold text-zinc-700"><Icon name="eye" size={17}/>معاينة</button>
            <button type="button" disabled={exportBusy} onClick={() => openPrint("pdf")} className="flex h-12 items-center justify-center gap-2 rounded-xl border border-zinc-200 bg-white px-3 text-xs font-bold text-zinc-700 disabled:opacity-50"><Icon name="pdf" size={17}/>{exportBusy ? "جارٍ التجهيز" : "PDF"}</button>
            <button type="button" disabled={exportBusy} onClick={() => void shareWhatsApp()} className="flex h-12 items-center justify-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 text-xs font-bold text-emerald-700 disabled:opacity-50"><Icon name="whatsapp" size={18}/>واتساب</button>
            {!editMode ? <button type="button" onClick={() => openCompletedRequest("EDIT")} className="flex h-12 items-center justify-center gap-2 rounded-xl border border-blue-200 bg-blue-50 px-3 text-xs font-bold text-blue-700"><Icon name="file" size={17}/>تعديل الطلب</button> : null}
            <button type="button" onClick={() => openCompletedRequest("VIEW")} className="flex h-12 items-center justify-center gap-2 rounded-xl border border-zinc-200 bg-white px-3 text-xs font-bold text-zinc-700"><Icon name="close" size={16}/>عرض / إلغاء</button>
          </div>

          {showCompletedDetails ? <div className="mt-4 rounded-2xl border border-zinc-200 bg-white p-4 text-right">
            <div className="grid gap-4 sm:grid-cols-2"><div><small className="text-[10px] text-zinc-400">النوع والمستفيد</small><strong className="mt-1 block text-sm">{form.expenseType}</strong><p className="mt-1 text-xs text-zinc-500">{form.beneficiaryName}</p></div><div><small className="text-[10px] text-zinc-400">المبلغ وطريقة الدفع</small><strong dir="ltr" className="mt-1 block text-right font-mono text-sm">{money(form.amount)} ر.س</strong><p className="mt-1 text-xs text-zinc-500">{form.paymentMethod === "BANK" ? "تحويل بنكي" : "نقدًا من الصندوق"}</p></div></div>
            <div className="mt-4 border-t border-zinc-100 pt-4"><small className="text-[10px] text-zinc-400">البيان</small><p className="mt-1 whitespace-pre-wrap text-xs leading-6 text-zinc-700">{form.details}</p></div>
            <div className="mt-4 border-t border-zinc-100 pt-4"><small className="text-[10px] text-zinc-400">المرفقات</small><div className="mt-2 flex flex-wrap gap-2">{readyAttachments.length ? readyAttachments.map((item, index) => <a key={item.localId} href={item.id ? `/api/files/${item.id}` : undefined} target="_blank" rel="noreferrer" className="flex items-center gap-2 rounded-lg bg-zinc-100 px-3 py-2 text-[11px] text-zinc-700"><Icon name="file" size={14}/>{index + 1}. {item.name}</a>) : <span className="text-xs text-zinc-400">لا توجد مرفقات</span>}</div></div>
          </div> : null}

          <button type="button" onClick={goToTasks} className="mt-5 flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#dc001c] px-5 text-sm font-bold text-white shadow-[0_10px_22px_rgba(220,0,28,.16)]"><Icon name="tasks" size={19}/>العودة إلى مهامي</button>
        </div> : null}

        {error ? <div role="alert" className="mt-5 flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-3.5 py-3 text-xs leading-5 text-[#a40017]"><span className="mt-0.5 shrink-0"><Icon name="info" size={17}/></span>{error}</div> : null}
      </div>

      {!completed && !loadingEdit ? <footer className="flex min-h-[76px] items-center gap-2 border-t border-zinc-200 bg-white px-4 pb-[env(safe-area-inset-bottom)] sm:px-7">
        <button type="button" onClick={() => void save("DRAFT")} disabled={busy || uploading} className="h-11 rounded-xl border border-zinc-200 px-3 text-xs font-bold text-zinc-600 transition hover:border-red-200 hover:text-[#dc001c] disabled:opacity-50 sm:px-5">{editMode ? "حفظ التعديلات" : "حفظ مسودة"}</button>
        <div className="flex-1"/>
        {step > 1 ? <button type="button" onClick={() => { setError(""); setStep((current) => current - 1); }} disabled={busy} className="h-11 rounded-xl px-3 text-xs font-bold text-zinc-500 hover:bg-zinc-100 disabled:opacity-50 sm:px-5">السابق</button> : null}
        {step < 5 ? <button type="button" onClick={next} disabled={busy} className="flex h-11 min-w-28 items-center justify-center gap-2 rounded-xl bg-[#dc001c] px-4 text-xs font-bold text-white shadow-[0_8px_18px_rgba(220,0,28,.15)] disabled:opacity-50">متابعة <span className="rotate-180"><Icon name="arrow" size={16}/></span></button> : <button type="button" onClick={() => void save("SUBMIT")} disabled={busy || uploading} className="flex h-11 min-w-32 items-center justify-center gap-2 rounded-xl bg-[#dc001c] px-4 text-xs font-bold text-white shadow-[0_8px_18px_rgba(220,0,28,.15)] disabled:opacity-50">{busy ? "جارٍ الحفظ..." : editMode ? "اعتماد التعديلات" : "إرسال للاعتماد"}{!busy ? <Icon name="check" size={16}/> : null}</button>}
      </footer> : null}
    </section>
  </div>;
}
