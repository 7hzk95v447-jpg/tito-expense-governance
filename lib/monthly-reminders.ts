import { eq } from "drizzle-orm";
import { getDb } from "../db";
import { monthlyObligations, notifications } from "../db/schema";

export const RIYADH_TIME_ZONE = "Asia/Riyadh";
const DAY_MS = 24 * 60 * 60 * 1000;
export type RiyadhDate = { year: number; month: number; day: number };

const formatter = new Intl.DateTimeFormat("en-US", {
  timeZone: RIYADH_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

export function riyadhParts(value: Date): RiyadhDate {
  const parts = formatter.formatToParts(value);
  const read = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((part) => part.type === type)?.value);
  return { year: read("year"), month: read("month"), day: read("day") };
}

export function periodOf(parts: RiyadhDate) {
  return `${parts.year}-${String(parts.month).padStart(2, "0")}`;
}

export function ordinal(parts: RiyadhDate) {
  return Math.floor(Date.UTC(parts.year, parts.month - 1, parts.day) / DAY_MS);
}

export function daysInMonth(year: number, month: number) {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** Midnight in Riyadh represented by its UTC instant. */
export function riyadhDate(year: number, month: number, day: number) {
  return new Date(Date.UTC(year, month - 1, day, -3, 0, 0, 0));
}

export function dueDateFor(year: number, month: number, dueDay: number) {
  return riyadhDate(year, month, Math.min(dueDay, daysInMonth(year, month)));
}

export function followingMonthDue(value: Date, dueDay: number) {
  const parts = riyadhParts(value);
  const nextMonth = parts.month === 12 ? 1 : parts.month + 1;
  const nextYear = parts.month === 12 ? parts.year + 1 : parts.year;
  return dueDateFor(nextYear, nextMonth, dueDay);
}

export function parseRiyadhDate(value: string | undefined) {
  if (!value) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const parts = { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]) };
  if (parts.month < 1 || parts.month > 12 || parts.day < 1 || parts.day > daysInMonth(parts.year, parts.month)) return null;
  return riyadhDate(parts.year, parts.month, parts.day);
}

export function normalizedDueDate(obligation: typeof monthlyObligations.$inferSelect, today: RiyadhDate) {
  const stored = riyadhParts(obligation.nextDueDate);
  const currentPeriod = periodOf(today);
  let due = obligation.nextDueDate;
  if (periodOf(stored) < currentPeriod) due = dueDateFor(today.year, today.month, obligation.dueDay);
  const dueParts = riyadhParts(due);
  if (obligation.lastNotifiedPeriod === periodOf(dueParts) && ordinal(today) > ordinal(dueParts)) {
    due = followingMonthDue(due, obligation.dueDay);
  }
  return due;
}

export async function createDueReminders(
  db: ReturnType<typeof getDb>,
  rows: Array<typeof monthlyObligations.$inferSelect>,
  now: Date,
) {
  const today = riyadhParts(now);
  let created = 0;
  for (const obligation of rows) {
    if (obligation.status !== "ACTIVE") continue;
    const due = normalizedDueDate(obligation, today);
    const dueParts = riyadhParts(due);
    const duePeriod = periodOf(dueParts);
    const daysUntilDue = ordinal(dueParts) - ordinal(today);
    if (due.getTime() !== obligation.nextDueDate.getTime()) {
      await db.update(monthlyObligations).set({ nextDueDate: due, updatedAt: now }).where(eq(monthlyObligations.id, obligation.id));
    }
    if (daysUntilDue > obligation.reminderDaysBefore || obligation.lastNotifiedPeriod === duePeriod) continue;
    const result = await db.insert(notifications).values({
      id: crypto.randomUUID(),
      recipientEmail: obligation.responsibleEmail,
      title: daysUntilDue < 0 ? "التزام شهري متأخر" : "موعد التزام شهري يقترب",
      body: `${obligation.title} · ${obligation.providerName} · الاستحقاق ${String(dueParts.day).padStart(2, "0")}/${String(dueParts.month).padStart(2, "0")}/${dueParts.year}`,
      entityType: "MONTHLY_OBLIGATION",
      entityId: obligation.id,
      actionUrl: `/monthly-obligations?obligation=${encodeURIComponent(obligation.id)}`,
      dedupeKey: `MONTHLY_OBLIGATION:${obligation.id}:${duePeriod}`,
      sentByEmail: "system@tito.local",
    }).onConflictDoNothing().returning({ id: notifications.id });
    await db.update(monthlyObligations).set({ lastNotifiedPeriod: duePeriod, nextDueDate: due, updatedAt: now }).where(eq(monthlyObligations.id, obligation.id));
    if (result.length) created += 1;
  }
  return created;
}
