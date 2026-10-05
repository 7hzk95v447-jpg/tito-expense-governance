-- Synthetic inspection data only. No production or employee data is included.
-- Apply after the migrations in ../drizzle/ when using a disposable database.

INSERT OR IGNORE INTO branches (id, name_ar, code, active, created_at)
VALUES ('branch-demo', 'الفرع التجريبي', 'DEMO', 1, unixepoch());

INSERT OR IGNORE INTO departments (id, name_ar, name_en, code, active, created_at)
VALUES
  ('dept-demo-ops', 'إدارة التشغيل التجريبية', 'Demo Operations', 'DEMO_OPS', 1, unixepoch()),
  ('dept-demo-finance', 'الحسابات التجريبية', 'Demo Finance', 'DEMO_FINANCE', 1, unixepoch());

-- The demo user intentionally has no password_hash. Create a password through
-- the application's Users administration screen so it is hashed correctly.
INSERT OR IGNORE INTO users
  (id, full_name, username, email, department_id, branch_id, job_title,
   system_role, status, must_change_password, failed_login_count, created_at)
VALUES
  ('user-demo-requester', 'مستخدم تجريبي', 'demo.requester',
   'demo.requester@example.invalid', 'dept-demo-ops', 'branch-demo',
   'مُعد طلب تجريبي', 'REQUESTER', 'ACTIVE', 1, 0, unixepoch());

