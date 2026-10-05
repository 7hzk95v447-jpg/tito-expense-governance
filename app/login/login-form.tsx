"use client";

import { FormEvent, useState } from "react";

export default function LoginForm({ ownerSignInPath }: { ownerSignInPath?: string }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (busy) return;
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username, password }) });
      const result = await response.json().catch(() => null);
      if (!response.ok) throw new Error(result?.error || "تعذر تسجيل الدخول");
      window.location.assign(result.mustChangePassword ? "/change-password" : "/");
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : "تعذر تسجيل الدخول");
      setBusy(false);
    }
  };

  return <main className="grid min-h-screen bg-white lg:grid-cols-[1.05fr_.95fr]" dir="rtl">
    <section className="relative hidden overflow-hidden bg-[#dc001c] p-12 text-white lg:flex lg:flex-col lg:justify-between">
      <div className="absolute -left-28 -top-28 h-96 w-96 rounded-full border border-white/15"/><div className="absolute -left-12 -top-12 h-64 w-64 rounded-full border border-white/15"/>
      <div className="relative z-10 flex items-center gap-3"><span className="grid h-12 w-12 place-items-center rounded-2xl bg-white font-sans text-xl font-black tracking-[-.16em] text-[#dc001c] [direction:ltr]">T2</span><div><strong className="block font-sans text-lg tracking-wider [direction:ltr]">TITO</strong><small className="text-white/70">تيتو · تسوق كل جديد</small></div></div>
      <div className="relative z-10 mx-auto w-full max-w-[420px] text-center">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/tito-brand.jpeg" alt="هوية TITO الرسمية" width="900" height="900" className="mx-auto h-auto w-full max-w-[330px] rounded-[32px] shadow-[0_30px_80px_rgba(95,0,12,.28)]"/>
        <h1 className="mt-8 text-3xl font-bold">حوكمة الصرف بوضوح</h1><p className="mx-auto mt-3 max-w-sm text-sm leading-7 text-white/72">كل طلب، اعتماد، مرفق ومسير في مكان واحد، بسجل زمني واضح لا يضيع.</p>
      </div>
      <div className="relative z-10 flex items-center justify-between text-xs text-white/65"><span>نظام TITO الداخلي</span><span>اعتماد · تدقيق · تنفيذ</span></div>
    </section>
    <section className="flex min-h-screen items-center justify-center px-5 py-10 sm:px-10">
      <div className="w-full max-w-[400px]">
        <div className="mb-10 flex items-center gap-3 lg:hidden"><span className="grid h-11 w-11 place-items-center rounded-xl bg-[#dc001c] font-sans text-lg font-black text-white [direction:ltr]">T2</span><div><strong className="font-sans tracking-wider [direction:ltr]">TITO</strong><small className="block text-xs text-zinc-500">تيتو · تسوق كل جديد</small></div></div>
        <span className="text-xs font-bold text-[#dc001c]">دخول فريق العمل</span><h2 className="mt-2 text-3xl font-bold tracking-tight">الدخول إلى النظام</h2><p className="mt-3 text-sm leading-7 text-zinc-600">أدخل اسم المستخدم وكلمة المرور الصادرة من مدير النظام.</p>
        <form onSubmit={submit} className="mt-7 space-y-4">
          <label className="block"><span className="mb-2 block text-sm font-bold text-zinc-700">اسم المستخدم</span><input value={username} onChange={(event) => setUsername(event.target.value)} autoComplete="username" dir="ltr" className="h-12 w-full rounded-xl border border-zinc-200 px-4 text-left text-sm outline-none transition focus:border-[#dc001c] focus:ring-4 focus:ring-red-50" placeholder="username"/></label>
          <label className="block"><span className="mb-2 block text-sm font-bold text-zinc-700">كلمة المرور</span><input value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" type="password" dir="ltr" className="h-12 w-full rounded-xl border border-zinc-200 px-4 text-left text-sm outline-none transition focus:border-[#dc001c] focus:ring-4 focus:ring-red-50" placeholder="••••••••••"/></label>
          {error ? <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-xs leading-6 text-red-700">{error}</p> : null}
          <button disabled={busy || !username || !password} className="flex h-12 w-full items-center justify-center rounded-xl bg-[#dc001c] text-sm font-bold text-white shadow-[0_10px_25px_rgba(220,0,28,.18)] disabled:opacity-50">{busy ? "جارٍ التحقق..." : "دخول الفريق"}</button>
        </form>
        <div className="mt-5 rounded-2xl border border-emerald-200 bg-emerald-50 p-4"><strong className="text-sm text-emerald-900">دخول مستقل وآمن</strong><p className="mt-1 text-xs leading-6 text-emerald-800">لا يحتاج الموظف إلى حساب ChatGPT، وسيُطلب تغيير كلمة المرور المؤقتة عند أول دخول.</p></div>
        {ownerSignInPath ? <div className="mt-6 border-t border-zinc-100 pt-5 text-center"><a href={ownerSignInPath} target="_top" className="text-xs font-bold text-zinc-500 underline decoration-zinc-300 underline-offset-4">دخول مالك النظام عبر ChatGPT</a></div> : null}
        <p className="mt-10 text-center text-xs text-zinc-400">© 2026 TITO · جميع الإجراءات مسجلة في سجل التدقيق</p>
      </div>
    </section>
  </main>;
}
