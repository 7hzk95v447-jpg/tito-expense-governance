import { asc, eq, or } from "drizzle-orm";
import { getDb } from "../../../db";
import { monthlyObligations, users } from "../../../db/schema";
import { createDueReminders, dueDateFor, followingMonthDue, normalizedDueDate, ordinal, parseRiyadhDate, RIYADH_TIME_ZONE, riyadhParts } from "../../../lib/monthly-reminders";
import { authenticationRequired, getResolvedRequestUser } from "../../../lib/request-user";

type ObligationPayload = {
  title?: string;
  obligationType?: string;
  providerName?: string;
  accountReference?: string;
  paymentMethod?: "BANK" | "CASH";
  expectedAmountMinor?: number | null;
  dueDay?: number;
  reminderDaysBefore?: number;
  nextDueDate?: string;
  responsibleEmail?: string;
  departmentCode?: string;
};


async function profileFor(email: string) {
  const db = getDb();
  const [profile] = await db.select().from(users).where(or(eq(users.email, email), eq(users.authIdentityEmail, email))).limit(1);
  return profile;
}

export async function GET(request: Request) {
  const actor = await getResolvedRequestUser(request);
  if (!actor) return authenticationRequired();
  const db = getDb();
  const profile = await profileFor(actor.email);
  if (profile?.status !== "ACTIVE") return Response.json({ error: "الحساب غير مرتبط أو موقوف" }, { status: 403 });
  const privileged = ["ADMIN", "ACCOUNTING", "EXECUTIVE"].includes(profile.systemRole);
  const beforeReminderRows = await db.select().from(monthlyObligations).orderBy(asc(monthlyObligations.nextDueDate)).limit(250);
  const remindersCreated = await createDueReminders(db, beforeReminderRows, new Date());
  const rows = await db.select().from(monthlyObligations).orderBy(asc(monthlyObligations.nextDueDate)).limit(250);
  const visible = privileged ? rows : rows.filter((item) => item.responsibleEmail === actor.email);
  const today = riyadhParts(new Date());

  return Response.json({
    obligations: visible,
    remindersCreated,
    overdue: visible.filter((item) => ordinal(riyadhParts(normalizedDueDate(item, today))) < ordinal(today)).length,
    timeZone: RIYADH_TIME_ZONE,
  });
}

export async function POST(request: Request) {
  const actor = await getResolvedRequestUser(request);
  if (!actor) return authenticationRequired();
  const profile = await profileFor(actor.email);
  if (profile?.status !== "ACTIVE") return Response.json({ error: "الحساب غير مرتبط أو موقوف" }, { status: 403 });
  const canManage = ["ADMIN", "ACCOUNTING"].includes(profile.systemRole);
  if (!canManage) return Response.json({ error: "إدارة الالتزامات الشهرية متاحة لمدير النظام والحسابات فقط" }, { status: 403 });

  let payload: ObligationPayload;
  try {
    payload = (await request.json()) as ObligationPayload;
  } catch {
    return Response.json({ error: "بيانات الالتزام غير صالحة" }, { status: 400 });
  }

  const title = payload.title?.trim();
  const obligationType = payload.obligationType?.trim().toUpperCase();
  const providerName = payload.providerName?.trim();
  const responsibleEmail = (payload.responsibleEmail || actor.email).trim().toLowerCase();
  const departmentCode = payload.departmentCode?.trim().toUpperCase();
  const dueDay = payload.dueDay ?? 28;
  const reminderDaysBefore = payload.reminderDaysBefore ?? 3;
  const paymentMethod = payload.paymentMethod || "BANK";
  const expectedAmountMinor = payload.expectedAmountMinor ?? null;

  if (!title || !obligationType || !providerName || !departmentCode) return Response.json({ error: "اسم الالتزام ونوعه والجهة والإدارة مطلوبة" }, { status: 400 });
  if (!/^\S+@\S+\.\S+$/.test(responsibleEmail)) return Response.json({ error: "البريد المسؤول غير صحيح" }, { status: 400 });
  if (!Number.isInteger(dueDay) || dueDay < 1 || dueDay > 31) return Response.json({ error: "يوم الاستحقاق يجب أن يكون بين 1 و31" }, { status: 400 });
  if (!Number.isInteger(reminderDaysBefore) || reminderDaysBefore < 0 || reminderDaysBefore > 31) return Response.json({ error: "مدة التنبيه يجب أن تكون بين 0 و31 يومًا" }, { status: 400 });
  if (expectedAmountMinor !== null && (!Number.isInteger(expectedAmountMinor) || expectedAmountMinor <= 0)) return Response.json({ error: "المبلغ المتوقع غير صحيح" }, { status: 400 });
  if (!(["BANK", "CASH"] as const).includes(paymentMethod)) return Response.json({ error: "طريقة السداد غير مدعومة" }, { status: 400 });

  const today = riyadhParts(new Date());
  const explicitDueDate = parseRiyadhDate(payload.nextDueDate);
  if (payload.nextDueDate && !explicitDueDate) return Response.json({ error: "تاريخ الاستحقاق يجب أن يكون بصيغة YYYY-MM-DD" }, { status: 400 });
  const thisMonthDue = dueDateFor(today.year, today.month, dueDay);
  const nextDueDate = explicitDueDate || (ordinal(today) <= ordinal(riyadhParts(thisMonthDue)) ? thisMonthDue : followingMonthDue(thisMonthDue, dueDay));
  const db = getDb();
  const id = crypto.randomUUID();
  const [created] = await db.insert(monthlyObligations).values({
    id,
    title,
    obligationType,
    providerName,
    accountReference: payload.accountReference?.trim() || null,
    paymentMethod,
    expectedAmountMinor,
    dueDay,
    reminderDaysBefore,
    nextDueDate,
    responsibleEmail,
    departmentCode,
    status: "ACTIVE",
    createdByEmail: actor.email,
  }).returning();

  await createDueReminders(db, [created], new Date());
  const [saved] = await db.select().from(monthlyObligations).where(eq(monthlyObligations.id, id)).limit(1);
  return Response.json({ obligation: saved }, { status: 201 });
}
