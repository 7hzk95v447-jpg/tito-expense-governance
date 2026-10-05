import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

const createdAt = () => integer("created_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date());

export const departments = sqliteTable("departments", {
  id: text("id").primaryKey(),
  nameAr: text("name_ar").notNull(),
  nameEn: text("name_en"),
  code: text("code").notNull().unique(),
  parentId: text("parent_id"),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
  createdAt: createdAt(),
});

export const branches = sqliteTable("branches", {
  id: text("id").primaryKey(),
  nameAr: text("name_ar").notNull(),
  code: text("code").notNull().unique(),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
  createdAt: createdAt(),
});

export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  fullName: text("full_name").notNull(),
  username: text("username").notNull().unique(),
  email: text("email").notNull().unique(),
  authIdentityEmail: text("auth_identity_email").unique(),
  mobile: text("mobile"),
  departmentId: text("department_id").references(() => departments.id),
  branchId: text("branch_id").references(() => branches.id),
  jobTitle: text("job_title"),
  systemRole: text("system_role").notNull().default("REQUESTER"),
  managerId: text("manager_id"),
  status: text("status").notNull().default("ACTIVE"),
  passwordHash: text("password_hash"),
  mustChangePassword: integer("must_change_password", { mode: "boolean" }).notNull().default(true),
  failedLoginCount: integer("failed_login_count").notNull().default(0),
  lockedUntil: integer("locked_until", { mode: "timestamp" }),
  lastLoginAt: integer("last_login_at", { mode: "timestamp" }),
  createdAt: createdAt(),
}, (table) => [index("users_department_idx").on(table.departmentId), index("users_branch_idx").on(table.branchId)]);

export const userSessions = sqliteTable("user_sessions", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  tokenHash: text("token_hash").notNull().unique(),
  expiresAt: integer("expires_at", { mode: "timestamp" }).notNull(),
  lastSeenAt: integer("last_seen_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
  revokedAt: integer("revoked_at", { mode: "timestamp" }),
  createdAt: createdAt(),
}, (table) => [
  index("user_sessions_user_idx").on(table.userId, table.revokedAt),
  index("user_sessions_expiry_idx").on(table.expiresAt),
]);

export const expenseTypes = sqliteTable("expense_types", {
  id: text("id").primaryKey(),
  categoryCode: text("category_code").notNull(),
  nameAr: text("name_ar").notNull(),
  settlementGroup: text("settlement_group").notNull(),
  defaultDepartmentCode: text("default_department_code"),
  workflowCode: text("workflow_code").notNull(),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
  createdAt: createdAt(),
}, (table) => [index("expense_types_category_idx").on(table.categoryCode)]);

export const beneficiaries = sqliteTable("beneficiaries", {
  id: text("id").primaryKey(),
  normalizedName: text("normalized_name").notNull(),
  displayName: text("display_name").notNull(),
  kind: text("kind").notNull(),
  referenceNumber: text("reference_number"),
  mobile: text("mobile"),
  bankName: text("bank_name"),
  iban: text("iban"),
  accountName: text("account_name"),
  createdByEmail: text("created_by_email").notNull(),
  createdAt: createdAt(),
}, (table) => [index("beneficiaries_name_idx").on(table.normalizedName), index("beneficiaries_iban_idx").on(table.iban)]);

export const expenseRequests = sqliteTable("expense_requests", {
  id: text("id").primaryKey(),
  requestNumber: text("request_number").notNull().unique(),
  draftKey: text("draft_key").notNull().unique(),
  createdByEmail: text("created_by_email").notNull(),
  createdByName: text("created_by_name").notNull(),
  departmentCode: text("department_code").notNull(),
  branchCode: text("branch_code"),
  categoryCode: text("category_code").notNull(),
  expenseType: text("expense_type").notNull(),
  settlementGroup: text("settlement_group").notNull(),
  paymentMethod: text("payment_method").notNull(),
  beneficiaryName: text("beneficiary_name").notNull(),
  beneficiaryType: text("beneficiary_type").notNull(),
  bankName: text("bank_name"),
  iban: text("iban"),
  accountHolderName: text("account_holder_name"),
  accountNameMatch: text("account_name_match"),
  accountMismatchReason: text("account_mismatch_reason"),
  cashRecipient: text("cash_recipient"),
  governmentBiller: text("government_biller"),
  totalDueMinor: integer("total_due_minor"),
  paidPreviouslyMinor: integer("paid_previously_minor"),
  amountMinor: integer("amount_minor").notNull(),
  currency: text("currency").notNull().default("SAR"),
  purpose: text("purpose").notNull(),
  details: text("details").notNull(),
  priority: text("priority").notNull().default("NORMAL"),
  prioritySetByEmail: text("priority_set_by_email"),
  prioritySetAt: integer("priority_set_at", { mode: "timestamp" }),
  monthlyObligationId: text("monthly_obligation_id"),
  status: text("status").notNull().default("DRAFT"),
  currentStage: text("current_stage").notNull().default("CREATOR"),
  currentAssignee: text("current_assignee"),
  revisionNumber: integer("revision_number").notNull().default(1),
  lockVersion: integer("lock_version").notNull().default(1),
  submittedAt: integer("submitted_at", { mode: "timestamp" }),
  closedAt: integer("closed_at", { mode: "timestamp" }),
  createdAt: createdAt(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
}, (table) => [
  index("requests_status_stage_idx").on(table.status, table.currentStage, table.createdAt),
  index("requests_creator_idx").on(table.createdByEmail, table.status, table.createdAt),
  index("requests_department_idx").on(table.departmentCode, table.status, table.createdAt),
  index("requests_batch_group_idx").on(table.paymentMethod, table.settlementGroup, table.status),
]);

export const requestRevisions = sqliteTable("request_revisions", {
  id: text("id").primaryKey(),
  requestId: text("request_id").notNull().references(() => expenseRequests.id, { onDelete: "restrict" }),
  revisionNumber: integer("revision_number").notNull(),
  snapshotJson: text("snapshot_json").notNull(),
  reason: text("reason"),
  changedByEmail: text("changed_by_email").notNull(),
  createdAt: createdAt(),
}, (table) => [uniqueIndex("request_revision_unique_idx").on(table.requestId, table.revisionNumber)]);

export const requestActions = sqliteTable("request_actions", {
  id: text("id").primaryKey(),
  requestId: text("request_id").notNull().references(() => expenseRequests.id, { onDelete: "restrict" }),
  action: text("action").notNull(),
  fromStatus: text("from_status"),
  toStatus: text("to_status").notNull(),
  actorEmail: text("actor_email").notNull(),
  actorName: text("actor_name").notNull(),
  note: text("note"),
  idempotencyKey: text("idempotency_key").notNull().unique(),
  createdAt: createdAt(),
}, (table) => [index("request_actions_request_idx").on(table.requestId, table.createdAt)]);

export const workItems = sqliteTable("work_items", {
  id: text("id").primaryKey(),
  requestId: text("request_id").references(() => expenseRequests.id, { onDelete: "restrict" }),
  paymentRunId: text("payment_run_id"),
  taskType: text("task_type").notNull(),
  assignedUserEmail: text("assigned_user_email"),
  assignedDepartmentCode: text("assigned_department_code"),
  assignedRole: text("assigned_role"),
  status: text("status").notNull().default("OPEN"),
  dueAt: integer("due_at", { mode: "timestamp" }),
  completedAt: integer("completed_at", { mode: "timestamp" }),
  createdAt: createdAt(),
}, (table) => [index("work_items_user_idx").on(table.assignedUserEmail, table.status, table.dueAt), index("work_items_department_idx").on(table.assignedDepartmentCode, table.assignedRole, table.status)]);

export const cashReceipts = sqliteTable("cash_receipts", {
  id: text("id").primaryKey(),
  voucherNumber: text("voucher_number").notNull().unique(),
  receivedFrom: text("received_from").notNull(),
  amountMinor: integer("amount_minor").notNull(),
  currency: text("currency").notNull().default("SAR"),
  purpose: text("purpose").notNull(),
  paymentMethod: text("payment_method").notNull().default("CASH"),
  destinationAccount: text("destination_account").notNull(),
  referenceNumber: text("reference_number"),
  branchCode: text("branch_code"),
  departmentCode: text("department_code"),
  status: text("status").notNull().default("CONFIRMED"),
  createdByEmail: text("created_by_email").notNull(),
  createdByName: text("created_by_name").notNull(),
  confirmedByEmail: text("confirmed_by_email").notNull(),
  confirmedAt: integer("confirmed_at", { mode: "timestamp" }).notNull(),
  createdAt: createdAt(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
}, (table) => [
  index("cash_receipts_status_date_idx").on(table.status, table.createdAt),
  index("cash_receipts_branch_date_idx").on(table.branchCode, table.createdAt),
]);

export const files = sqliteTable("files", {
  id: text("id").primaryKey(),
  draftKey: text("draft_key"),
  requestId: text("request_id").references(() => expenseRequests.id, { onDelete: "restrict" }),
  paymentRunId: text("payment_run_id"),
  monthlyObligationId: text("monthly_obligation_id"),
  receiptId: text("receipt_id").references(() => cashReceipts.id, { onDelete: "restrict" }),
  objectKey: text("object_key").notNull().unique(),
  originalName: text("original_name").notNull(),
  mimeType: text("mime_type").notNull(),
  sizeBytes: integer("size_bytes").notNull(),
  purpose: text("purpose").notNull().default("REQUEST_ATTACHMENT"),
  status: text("status").notNull().default("READY"),
  uploadedByEmail: text("uploaded_by_email").notNull(),
  createdAt: createdAt(),
}, (table) => [index("files_draft_idx").on(table.draftKey, table.status), index("files_request_idx").on(table.requestId, table.createdAt), index("files_receipt_idx").on(table.receiptId, table.createdAt)]);

export const paymentRuns = sqliteTable("payment_runs", {
  id: text("id").primaryKey(),
  runNumber: text("run_number").notNull().unique(),
  paymentMethod: text("payment_method").notNull(),
  settlementGroup: text("settlement_group").notNull(),
  sourceAccount: text("source_account").notNull(),
  currency: text("currency").notNull().default("SAR"),
  status: text("status").notNull().default("BATCH_DRAFT"),
  preparedByEmail: text("prepared_by_email").notNull(),
  approvedByEmail: text("approved_by_email"),
  approvedAt: integer("approved_at", { mode: "timestamp" }),
  digitalSignatureCode: text("digital_signature_code"),
  totalMinor: integer("total_minor").notNull().default(0),
  itemCount: integer("item_count").notNull().default(0),
  createdAt: createdAt(),
  closedAt: integer("closed_at", { mode: "timestamp" }),
}, (table) => [index("payment_runs_group_idx").on(table.paymentMethod, table.settlementGroup, table.status, table.createdAt)]);

export const monthlyObligations = sqliteTable("monthly_obligations", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  obligationType: text("obligation_type").notNull(),
  providerName: text("provider_name").notNull(),
  accountReference: text("account_reference"),
  paymentMethod: text("payment_method").notNull().default("BANK"),
  expectedAmountMinor: integer("expected_amount_minor"),
  dueDay: integer("due_day").notNull().default(28),
  reminderDaysBefore: integer("reminder_days_before").notNull().default(3),
  nextDueDate: integer("next_due_date", { mode: "timestamp" }).notNull(),
  responsibleEmail: text("responsible_email").notNull(),
  departmentCode: text("department_code").notNull(),
  status: text("status").notNull().default("ACTIVE"),
  lastNotifiedPeriod: text("last_notified_period"),
  createdByEmail: text("created_by_email").notNull(),
  createdAt: createdAt(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
}, (table) => [index("monthly_obligations_due_idx").on(table.status, table.nextDueDate), index("monthly_obligations_responsible_idx").on(table.responsibleEmail, table.status)]);

export const paymentRunItems = sqliteTable("payment_run_items", {
  id: text("id").primaryKey(),
  paymentRunId: text("payment_run_id").notNull().references(() => paymentRuns.id, { onDelete: "restrict" }),
  requestId: text("request_id").notNull().references(() => expenseRequests.id, { onDelete: "restrict" }),
  amountMinor: integer("amount_minor").notNull(),
  executionStatus: text("execution_status").notNull().default("PENDING"),
  bankReference: text("bank_reference"),
  failureReason: text("failure_reason"),
  createdAt: createdAt(),
}, (table) => [uniqueIndex("payment_run_request_unique_idx").on(table.paymentRunId, table.requestId), index("payment_run_items_request_idx").on(table.requestId)]);

export const paymentRunActions = sqliteTable("payment_run_actions", {
  id: text("id").primaryKey(),
  paymentRunId: text("payment_run_id").notNull().references(() => paymentRuns.id, { onDelete: "restrict" }),
  action: text("action").notNull(),
  fromStatus: text("from_status"),
  toStatus: text("to_status").notNull(),
  actorEmail: text("actor_email").notNull(),
  note: text("note"),
  idempotencyKey: text("idempotency_key").notNull().unique(),
  createdAt: createdAt(),
}, (table) => [index("payment_run_actions_run_idx").on(table.paymentRunId, table.createdAt)]);

export const executionAttempts = sqliteTable("execution_attempts", {
  id: text("id").primaryKey(),
  paymentRunItemId: text("payment_run_item_id").notNull().references(() => paymentRunItems.id, { onDelete: "restrict" }),
  attemptNumber: integer("attempt_number").notNull(),
  status: text("status").notNull(),
  executedAmountMinor: integer("executed_amount_minor"),
  bankReference: text("bank_reference"),
  reason: text("reason"),
  proofFileId: text("proof_file_id").references(() => files.id, { onDelete: "restrict" }),
  executedByEmail: text("executed_by_email").notNull(),
  executedAt: integer("executed_at", { mode: "timestamp" }),
  createdAt: createdAt(),
}, (table) => [uniqueIndex("execution_attempt_unique_idx").on(table.paymentRunItemId, table.attemptNumber), index("execution_attempt_status_idx").on(table.status, table.createdAt)]);

export const notifications = sqliteTable("notifications", {
  id: text("id").primaryKey(),
  recipientEmail: text("recipient_email").notNull(),
  title: text("title").notNull(),
  body: text("body").notNull(),
  entityType: text("entity_type").notNull(),
  entityId: text("entity_id").notNull(),
  actionUrl: text("action_url").notNull(),
  dedupeKey: text("dedupe_key").notNull(),
  sentByEmail: text("sent_by_email").notNull(),
  isRead: integer("is_read", { mode: "boolean" }).notNull().default(false),
  readAt: integer("read_at", { mode: "timestamp" }),
  createdAt: createdAt(),
}, (table) => [uniqueIndex("notifications_dedupe_idx").on(table.recipientEmail, table.dedupeKey), index("notifications_recipient_idx").on(table.recipientEmail, table.isRead, table.createdAt)]);

// Read state is per real user. Role/department notifications are shared inbox
// entries, so storing `isRead` on the notification itself would let one user
// hide the alert for everyone else who holds that role.
export const notificationReads = sqliteTable("notification_reads", {
  id: text("id").primaryKey(),
  notificationId: text("notification_id").notNull().references(() => notifications.id, { onDelete: "cascade" }),
  userEmail: text("user_email").notNull(),
  readAt: integer("read_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
}, (table) => [
  uniqueIndex("notification_reads_user_unique_idx").on(table.notificationId, table.userEmail),
  index("notification_reads_user_idx").on(table.userEmail, table.readAt),
]);

export const auditEvents = sqliteTable("audit_events", {
  id: text("id").primaryKey(),
  actorEmail: text("actor_email").notNull(),
  action: text("action").notNull(),
  entityType: text("entity_type").notNull(),
  entityId: text("entity_id").notNull(),
  beforeJson: text("before_json"),
  afterJson: text("after_json"),
  reason: text("reason"),
  correlationId: text("correlation_id").notNull(),
  previousHash: text("previous_hash"),
  eventHash: text("event_hash").notNull(),
  createdAt: createdAt(),
}, (table) => [index("audit_entity_idx").on(table.entityType, table.entityId, table.createdAt)]);

export const backupJobs = sqliteTable("backup_jobs", {
  id: text("id").primaryKey(),
  status: text("status").notNull(),
  objectKey: text("object_key"),
  requestedByEmail: text("requested_by_email").notNull(),
  errorMessage: text("error_message"),
  createdAt: createdAt(),
  completedAt: integer("completed_at", { mode: "timestamp" }),
});
