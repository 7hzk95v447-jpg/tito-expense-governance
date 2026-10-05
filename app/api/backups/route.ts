import { env } from "cloudflare:workers";
import { desc, eq, or } from "drizzle-orm";
import { getDb } from "../../../db";
import { auditEvents, backupJobs, beneficiaries, branches, cashReceipts, departments, executionAttempts, expenseRequests, files, monthlyObligations, notificationReads, notifications, paymentRunActions, paymentRunItems, paymentRuns, requestActions, requestRevisions, users, workItems } from "../../../db/schema";
import { authenticationRequired, getResolvedRequestUser } from "../../../lib/request-user";
import { sha256 } from "../../../lib/workflow";

async function requireAdmin(request: Request) {
  const actor = await getResolvedRequestUser(request);
  if (!actor) return null;
  const db = getDb();
  const [profile] = await db.select().from(users).where(or(eq(users.email, actor.email), eq(users.authIdentityEmail, actor.email))).limit(1);
  return profile?.status === "ACTIVE" && profile.systemRole === "ADMIN" ? actor : null;
}

export async function GET(request: Request) {
  const authenticated = await getResolvedRequestUser(request);
  if (!authenticated) return authenticationRequired();
  if (!await requireAdmin(request)) return Response.json({ error: "النسخ الاحتياطي متاح لمدير النظام فقط" }, { status: 403, headers: { "Cache-Control": "no-store" } });
  const db = getDb();
  const jobs = await db.select({ id: backupJobs.id, status: backupJobs.status, errorMessage: backupJobs.errorMessage, createdAt: backupJobs.createdAt, completedAt: backupJobs.completedAt }).from(backupJobs).orderBy(desc(backupJobs.createdAt)).limit(20);
  return Response.json({ backups: jobs }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  const actor = await getResolvedRequestUser(request);
  if (!actor) return authenticationRequired();
  const db = getDb();
  const [profile] = await db.select().from(users).where(or(eq(users.email, actor.email), eq(users.authIdentityEmail, actor.email))).limit(1);
  if (profile?.status !== "ACTIVE" || profile.systemRole !== "ADMIN") return Response.json({ error: "النسخ الاحتياطي متاح لمدير النظام فقط" }, { status: 403 });
  const id = crypto.randomUUID();
  await db.insert(backupJobs).values({ id, status: "RUNNING", requestedByEmail: actor.email });
  try {
    const [departmentRows, branchRows, userRows, beneficiaryRows, requestRows, revisionRows, actionRows, taskRows, runRows, runItemRows, runActionRows, executionRows, fileRows, obligationRows, receiptRows, notificationRows, notificationReadRows, auditRows] = await Promise.all([
      db.select().from(departments), db.select().from(branches), db.select().from(users), db.select().from(beneficiaries),
      db.select().from(expenseRequests), db.select().from(requestRevisions), db.select().from(requestActions), db.select().from(workItems),
      db.select().from(paymentRuns), db.select().from(paymentRunItems), db.select().from(paymentRunActions), db.select().from(executionAttempts), db.select().from(files), db.select().from(monthlyObligations), db.select().from(cashReceipts), db.select().from(notifications), db.select().from(notificationReads), db.select().from(auditEvents),
    ]);
    const safeUserRows = userRows.map((row) => ({ id: row.id, fullName: row.fullName, username: row.username, email: row.email, authIdentityEmail: row.authIdentityEmail, mobile: row.mobile, departmentId: row.departmentId, branchId: row.branchId, jobTitle: row.jobTitle, systemRole: row.systemRole, managerId: row.managerId, status: row.status, mustChangePassword: true, lastLoginAt: row.lastLoginAt, createdAt: row.createdAt }));
    const snapshot = JSON.stringify({ schemaVersion: 4, createdAt: new Date().toISOString(), createdBy: actor.email, data: { departments: departmentRows, branches: branchRows, users: safeUserRows, beneficiaries: beneficiaryRows, requests: requestRows, revisions: revisionRows, actions: actionRows, workItems: taskRows, paymentRuns: runRows, paymentRunItems: runItemRows, paymentRunActions: runActionRows, executionAttempts: executionRows, files: fileRows, monthlyObligations: obligationRows, cashReceipts: receiptRows, notifications: notificationRows, notificationReads: notificationReadRows, auditEvents: auditRows } });
    const objectKey = `backups/${new Date().toISOString().slice(0,10)}/${id}.json`;
    await env.BUCKET.put(objectKey, snapshot, { httpMetadata: { contentType: "application/json" }, customMetadata: { createdBy: actor.email, checksum: await sha256(snapshot) } });
    await db.update(backupJobs).set({ status: "SUCCEEDED", objectKey, completedAt: new Date() }).where(eq(backupJobs.id, id));
    const correlationId = crypto.randomUUID();
    const afterJson = JSON.stringify({ backupJobId: id, objectKey, schemaVersion: 4, excludesCredentials: true });
    await db.insert(auditEvents).values({ id: crypto.randomUUID(), actorEmail: actor.email, action: "CREATE_BACKUP", entityType: "BACKUP", entityId: id, afterJson, correlationId, eventHash: await sha256(`${correlationId}|${actor.email}|CREATE_BACKUP|${id}|${afterJson}`) });
    return Response.json({ backup: { id, status: "SUCCEEDED" } }, { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    await db.update(backupJobs).set({ status: "FAILED", errorMessage: error instanceof Error ? error.message : "Unexpected error", completedAt: new Date() }).where(eq(backupJobs.id, id));
    return Response.json({ error: "تعذر إنشاء النسخة الاحتياطية" }, { status: 500 });
  }
}
