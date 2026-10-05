"use client";

import { FormEvent, useState } from "react";

export default function ChangePasswordForm({ fullName }: { fullName: string }) {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async (event: FormEvent) => {
    event.preventDefault(); if (busy) return; setBusy(true); setError("");
    try {
      const response = await fetch("/api/auth/change-password", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ currentPassword, newPassword, confirmPassword }) });
      const result = await response.json().catch(() => null);
      if (!response.ok) throw new Error(result?.error || "تعذر تحديث كلمة المرور");
      window.location.assign("/");
    } catch (problem) { setError(problem instanceof Error ? problem.message : "تعذر تحديث كلمة المرور"); setBusy(false); }
  };
  const fields = [
    { label: "كلمة المرور المؤقتة", value: currentPassword, setValue: setCurrentPassword, autoComplete: "current-password" },
    { label: "كلمة المرور الجديدة", value: newPassword, setValue: setNewPassword, autoComplete: "new-password" },
    { label: "تأكيد كلمة المرور الجديدة", value: confirmPassword, setValue: setConfirmPassword, autoComplete: "new-password" },
  ];
  return <main className="grid min-h-screen place-items-center bg-[#f5f6f8] px-5 py-10" dir="rtl"><section className="w-full max-w-md rounded-3xl border border-zinc-200 bg-white p-6 shadow-xl sm:p-8"><span className="grid h-12 w-12 place-items-center rounded-2xl bg-[#dc001c] font-sans text-lg font-black text-white">T2</span><span className="mt-6 block text-xs font-bold text-[#dc001c]">أول دخول · {fullName}</span><h1 className="mt-2 text-2xl font-bold">أنشئ كلمة مرور جديدة</h1><p className="mt-2 text-sm leading-7 text-zinc-500">لأمان حسابك يجب تغيير كلمة المرور المؤقتة قبل الوصول إلى النظام.</p><form onSubmit={submit} className="mt-6 space-y-4">{fields.map((field) => <label key={field.label} className="block"><span className="mb-1.5 block text-sm font-bold text-zinc-700">{field.label}</span><input type="password" value={field.value} onChange={(event) => field.setValue(event.target.value)} autoComplete={field.autoComplete} dir="ltr" className="h-12 w-full rounded-xl border border-zinc-200 px-4 text-left outline-none focus:border-[#dc001c] focus:ring-4 focus:ring-red-50"/></label>)}{error ? <p role="alert" className="rounded-xl bg-red-50 p-3 text-xs leading-6 text-red-700">{error}</p> : null}<button disabled={busy || !currentPassword || !newPassword || !confirmPassword} className="h-12 w-full rounded-xl bg-[#dc001c] text-sm font-bold text-white disabled:opacity-50">{busy ? "جارٍ الحفظ..." : "حفظ والدخول إلى النظام"}</button></form><p className="mt-4 text-xs leading-6 text-zinc-400">استخدم 10 أحرف على الأقل ولا تشارك كلمة المرور مع أي شخص.</p></section></main>;
}
