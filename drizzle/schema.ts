import { int, mysqlEnum, mysqlTable, text, timestamp, varchar, boolean, decimal } from "drizzle-orm/mysql-core";

/**
 * Core user table backing auth flow.
 */
export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

// ============================================================
// IO Operations Tables
// ============================================================

export const ioEmployees = mysqlTable("io_employees", {
  ohr_id: varchar("ohr_id", { length: 20 }).primaryKey(),
  full_name: varchar("full_name", { length: 255 }),
  last_name: varchar("last_name", { length: 128 }),
  given_name: varchar("given_name", { length: 128 }),
  middle_name: varchar("middle_name", { length: 128 }),
  suffix: varchar("suffix", { length: 20 }),
  billing_name: varchar("billing_name", { length: 255 }),
  srt_name: varchar("srt_name", { length: 255 }),
  employement_status: varchar("employement_status", { length: 50 }),
  actual_role: varchar("actual_role", { length: 100 }),
  supervisor_name: varchar("supervisor_name", { length: 255 }),
  supervisor_email: varchar("supervisor_email", { length: 320 }),
  shift_time: varchar("shift_time", { length: 100 }),
  work_off: varchar("work_off", { length: 100 }),
  planning_group: varchar("planning_group", { length: 100 }),
  complete_planning_group: text("complete_planning_group"),
  srt_status: varchar("srt_status", { length: 50 }),
  srt_id: varchar("srt_id", { length: 50 }),
  workday_id: varchar("workday_id", { length: 50 }),
  meta_email: varchar("meta_email", { length: 320 }),
  macbook_asset_id: varchar("macbook_asset_id", { length: 50 }),
  chromebook_asset_id: varchar("chromebook_asset_id", { length: 50 }),
  hire_date: varchar("hire_date", { length: 30 }),
  regular_date: varchar("regular_date", { length: 30 }),
  dob: varchar("dob", { length: 30 }),
  personal_email: varchar("personal_email", { length: 320 }),
  contact_number: varchar("contact_number", { length: 50 }),
  primary_address: text("primary_address"),
  barangay: varchar("barangay", { length: 128 }),
  city: varchar("city", { length: 128 }),
  province: varchar("province", { length: 128 }),
  locker_floor: varchar("locker_floor", { length: 20 }),
  locker_number: varchar("locker_number", { length: 20 }),
  meta_onboarding_date: varchar("meta_onboarding_date", { length: 30 }),
  live_date: varchar("live_date", { length: 30 }),
  badge_id: varchar("badge_id", { length: 50 }),
  badge_serial: varchar("badge_serial", { length: 50 }),
  platform: varchar("platform", { length: 100 }),
  billing_code: varchar("billing_code", { length: 100 }),
  password: varchar("password", { length: 255 }),
  is_locked: boolean("is_locked").default(false),
  gchat_space_id: varchar("gchat_space_id", { length: 100 }),
});

export type IoEmployee = typeof ioEmployees.$inferSelect;
export type InsertIoEmployee = typeof ioEmployees.$inferInsert;

export const ioAttendance = mysqlTable("io_attendance", {
  id: varchar("id", { length: 64 }).primaryKey(),
  ohr_id: varchar("ohr_id", { length: 20 }),
  log_date: varchar("log_date", { length: 30 }),
  tag: varchar("tag", { length: 50 }),
  billing_code: varchar("billing_code", { length: 100 }),
  upl_reason: varchar("upl_reason", { length: 255 }),
  remarks: text("remarks"),
  ot_hours: varchar("ot_hours", { length: 20 }),
  created_at: varchar("created_at", { length: 64 }),
  snap_full_name: varchar("snap_full_name", { length: 255 }),
  snap_supervisor: varchar("snap_supervisor", { length: 255 }),
  snap_planning_group: varchar("snap_planning_group", { length: 100 }),
  snap_shift_time: varchar("snap_shift_time", { length: 100 }),
  snap_actual_role: varchar("snap_actual_role", { length: 100 }),
  snap_billing_name: varchar("snap_billing_name", { length: 255 }),
  snap_status: varchar("snap_status", { length: 50 }),
  is_locked: boolean("is_locked").default(false),
  locked_at: varchar("locked_at", { length: 64 }),
  role: varchar("role", { length: 100 }),
  planning_group: varchar("planning_group", { length: 100 }),
  internal_role: varchar("internal_role", { length: 100 }),
  internal_planning_group: varchar("internal_planning_group", { length: 100 }),
});

export type IoAttendance = typeof ioAttendance.$inferSelect;
export type InsertIoAttendance = typeof ioAttendance.$inferInsert;

export const ioCoaching = mysqlTable("io_coaching", {
  id: int("id").autoincrement().primaryKey(),
  coaching_id: varchar("coaching_id", { length: 20 }),
  coaching_type: varchar("coaching_type", { length: 100 }),
  coach: varchar("coach", { length: 255 }),
  coach_ohr: varchar("coach_ohr", { length: 20 }),
  coach_meta_email: varchar("coach_meta_email", { length: 320 }),
  coach_sup: varchar("coach_sup", { length: 255 }),
  coach_sup_email: varchar("coach_sup_email", { length: 320 }),
  coach_pg: varchar("coach_pg", { length: 100 }),
  coaching_date: varchar("coaching_date", { length: 64 }),
  ack_date: varchar("ack_date", { length: 64 }),
  week_ending: varchar("week_ending", { length: 30 }),
  month: varchar("month", { length: 30 }),
  coachee: varchar("coachee", { length: 255 }),
  coachee_ohr: varchar("coachee_ohr", { length: 20 }),
  coachee_meta_email: varchar("coachee_meta_email", { length: 320 }),
  coachee_sup: varchar("coachee_sup", { length: 255 }),
  coachee_sup_email: varchar("coachee_sup_email", { length: 320 }),
  coachee_pg: varchar("coachee_pg", { length: 100 }),
  sme_joiner: varchar("sme_joiner", { length: 255 }),
  sme_meta_email: varchar("sme_meta_email", { length: 320 }),
  session_goal: text("session_goal"),
  level_1_category: varchar("level_1_category", { length: 255 }),
  level_2_direct_cause: varchar("level_2_direct_cause", { length: 255 }),
  level_3_contributing_cause: varchar("level_3_contributing_cause", { length: 255 }),
  level_4_deficiency: varchar("level_4_deficiency", { length: 255 }),
  level_5_root_cause: varchar("level_5_root_cause", { length: 255 }),
  guidelines: text("guidelines"),
  coaching_details: text("coaching_details"),
  status: varchar("status", { length: 100 }),
  dispute_comments: text("dispute_comments"),
  dispute_attachments: text("dispute_attachments"),
  qa_comments: text("qa_comments"),
  qa_attachments: text("qa_attachments"),
  sme_qa_dispute_comments: text("sme_qa_dispute_comments"),
  sme_qa_dispute_attachments: text("sme_qa_dispute_attachments"),
  trainer_comments: text("trainer_comments"),
  trainer_attachments: text("trainer_attachments"),
  sme_trainer_comments: text("sme_trainer_comments"),
  sme_trainer_attachments: text("sme_trainer_attachments"),
  qtp_manager_comments: text("qtp_manager_comments"),
  qtp_manager_attachments: text("qtp_manager_attachments"),
  coachee_ack: text("coachee_ack"),
  coachee_commitments: text("coachee_commitments"),
  coaching_rating: varchar("coaching_rating", { length: 50 }),
  coachee_sentiments: text("coachee_sentiments"),
  attachments: text("attachments"),
  sme_dispute_stamp: varchar("sme_dispute_stamp", { length: 64 }),
  qa_decision_stamp: varchar("qa_decision_stamp", { length: 64 }),
  sme_qa_dispute_stamp: varchar("sme_qa_dispute_stamp", { length: 64 }),
  trainer_decision_stamp: varchar("trainer_decision_stamp", { length: 64 }),
  sme_trainer_dispute_stamp: varchar("sme_trainer_dispute_stamp", { length: 64 }),
  qtp_manager_stamp: varchar("qtp_manager_stamp", { length: 64 }),
  infraction_category: varchar("infraction_category", { length: 255 }),
  infraction: varchar("infraction", { length: 255 }),
  infraction_description: text("infraction_description"),
  severity: varchar("severity", { length: 10 }),
  locked_by: varchar("locked_by", { length: 255 }),
  coachee_list: text("coachee_list"),
  job_id: varchar("job_id", { length: 100 }),
  created_at: varchar("created_at", { length: 64 }),
  updated_at: varchar("updated_at", { length: 64 }),
});

export type IoCoaching = typeof ioCoaching.$inferSelect;
export type InsertIoCoaching = typeof ioCoaching.$inferInsert;

export const ioCoachingRca = mysqlTable("io_coaching_rca", {
  id: int("id").autoincrement().primaryKey(),
  rca_id: varchar("rca_id", { length: 50 }),
  coaching_id: varchar("coaching_id", { length: 50 }),
  level_1_category: varchar("level_1_category", { length: 255 }),
  level_2_direct_cause: varchar("level_2_direct_cause", { length: 255 }),
  level_3_contributing_cause: varchar("level_3_contributing_cause", { length: 255 }),
  level_4_deficiency: varchar("level_4_deficiency", { length: 255 }),
  level_5_root_cause: text("level_5_root_cause"),
  guidelines: text("guidelines"),
  created_at: varchar("created_at", { length: 64 }),
});

export type IoCoachingRca = typeof ioCoachingRca.$inferSelect;
export type InsertIoCoachingRca = typeof ioCoachingRca.$inferInsert;

export const ioCoachingZtp = mysqlTable("io_coaching_ztp", {
  id: int("id").autoincrement().primaryKey(),
  ztp_id: varchar("ztp_id", { length: 50 }),
  infraction_category: varchar("infraction_category", { length: 255 }),
  infraction: varchar("infraction", { length: 255 }),
  description: text("description"),
  severity: varchar("severity", { length: 10 }),
  created_at: varchar("created_at", { length: 64 }),
});

export type IoCoachingZtp = typeof ioCoachingZtp.$inferSelect;
export type InsertIoCoachingZtp = typeof ioCoachingZtp.$inferInsert;

export const ioNotifications = mysqlTable("io_notifications", {
  id: int("id").autoincrement().primaryKey(),
  type: varchar("type", { length: 50 }),
  title: varchar("title", { length: 255 }),
  message: text("message"),
  actor_ohr: varchar("actor_ohr", { length: 20 }),
  actor_name: varchar("actor_name", { length: 255 }),
  target_role: varchar("target_role", { length: 50 }),
  target_ohr: varchar("target_ohr", { length: 20 }),
  metadata: text("metadata"),
  is_read: boolean("is_read").default(false),
  created_at: varchar("created_at", { length: 64 }),
});

export type IoNotification = typeof ioNotifications.$inferSelect;
export type InsertIoNotification = typeof ioNotifications.$inferInsert;

export const ioGchatQueue = mysqlTable("io_gchat_queue", {
  id: int("id").autoincrement().primaryKey(),
  type: varchar("type", { length: 100 }).notNull(),
  target_space_id: varchar("target_space_id", { length: 100 }),
  target_name: varchar("target_name", { length: 255 }),
  card_json: text("card_json").notNull(),
  fallback_text: text("fallback_text"),
  status: varchar("status", { length: 20 }).default("pending"),
  metadata: text("metadata"),
  created_at: varchar("created_at", { length: 64 }),
  sent_at: varchar("sent_at", { length: 64 }),
  error_message: text("error_message"),
});

export type IoGchatQueue = typeof ioGchatQueue.$inferSelect;
export type InsertIoGchatQueue = typeof ioGchatQueue.$inferInsert;

export const ioInsights = mysqlTable("io_insights", {
  id: int("id").autoincrement().primaryKey(),
  insight_id: varchar("insight_id", { length: 50 }),
  insight_title: varchar("insight_title", { length: 500 }),
  status: varchar("status", { length: 255 }),
  meta_email: varchar("meta_email", { length: 320 }),
  submitter: varchar("submitter", { length: 255 }),
  ohr_id: varchar("ohr_id", { length: 20 }),
  week_ending: varchar("week_ending", { length: 30 }),
  supervisor: varchar("supervisor", { length: 255 }),
  supervisor_email: varchar("supervisor_email", { length: 320 }),
  planning_group: varchar("planning_group", { length: 100 }),
  insight_category: varchar("insight_category", { length: 100 }),
  proposal_type: varchar("proposal_type", { length: 100 }),
  platform: varchar("platform", { length: 100 }),
  implementation_standards: varchar("implementation_standards", { length: 255 }),
  queue: varchar("queue", { length: 255 }),
  problem_statement: text("problem_statement"),
  proposed_change: text("proposed_change"),
  job_id_1: text("job_id_1"),
  job_id_2: text("job_id_2"),
  job_id_3: text("job_id_3"),
  job_id_4: text("job_id_4"),
  job_id_5: text("job_id_5"),
  job_id_6: text("job_id_6"),
  job_id_7: text("job_id_7"),
  job_id_8: text("job_id_8"),
  job_id_9: text("job_id_9"),
  job_id_10: text("job_id_10"),
  impact: text("impact"),
  reach: text("reach"),
  created_date: varchar("created_date", { length: 64 }),
  ir_update_date: varchar("ir_update_date", { length: 64 }),
  tr_update_date: varchar("tr_update_date", { length: 64 }),
  implementation_date: varchar("implementation_date", { length: 64 }),
  initial_reviewer: varchar("initial_reviewer", { length: 255 }),
  initial_reviewer_comments: text("initial_reviewer_comments"),
  trainer: varchar("trainer", { length: 255 }),
  trainer_comments: text("trainer_comments"),
  attachments: text("attachments"),
  task_id: varchar("task_id", { length: 100 }),
  month: varchar("month", { length: 30 }),
  locked_by: varchar("locked_by", { length: 255 }),
  created_at: varchar("created_at", { length: 64 }),
  updated_at: varchar("updated_at", { length: 64 }),
});

export type IoInsight = typeof ioInsights.$inferSelect;
export type InsertIoInsight = typeof ioInsights.$inferInsert;

export const ioLeaves = mysqlTable("io_leaves", {
  id: int("id").autoincrement().primaryKey(),
  leave_id: varchar("leave_id", { length: 50 }),
  leave_type: varchar("leave_type", { length: 100 }),
  status: varchar("status", { length: 100 }),
  ohr_id: varchar("ohr_id", { length: 20 }),
  full_name: varchar("full_name", { length: 255 }),
  meta_email: varchar("meta_email", { length: 320 }),
  supervisor: varchar("supervisor", { length: 255 }),
  supervisor_email: varchar("supervisor_email", { length: 320 }),
  planning_group: varchar("planning_group", { length: 100 }),
  start_date: varchar("start_date", { length: 30 }),
  end_date: varchar("end_date", { length: 30 }),
  reason: text("reason"),
  remarks: text("remarks"),
  approver_comments: text("approver_comments"),
  attachments: text("attachments"),
  created_at: varchar("created_at", { length: 64 }),
  updated_at: varchar("updated_at", { length: 64 }),
});

export type IoLeave = typeof ioLeaves.$inferSelect;
export type InsertIoLeave = typeof ioLeaves.$inferInsert;

export const ioAuditLog = mysqlTable("io_audit_log", {
  id: int("id").autoincrement().primaryKey(),
  record_type: varchar("record_type", { length: 50 }),
  record_id: varchar("record_id", { length: 64 }),
  action: varchar("action", { length: 50 }),
  field_name: varchar("field_name", { length: 100 }),
  old_value: text("old_value"),
  new_value: text("new_value"),
  actor_ohr: varchar("actor_ohr", { length: 20 }),
  actor_name: varchar("actor_name", { length: 255 }),
  timestamp: varchar("timestamp", { length: 64 }),
  metadata: text("metadata"),
});

export type IoAuditLog = typeof ioAuditLog.$inferSelect;
export type InsertIoAuditLog = typeof ioAuditLog.$inferInsert;

export const ioTasks = mysqlTable("io_tasks", {
  id: int("id").autoincrement().primaryKey(),
  task_id: varchar("task_id", { length: 20 }),
  title: varchar("title", { length: 500 }),
  description: text("description"),
  status: varchar("status", { length: 100 }),
  assigned_to_ohr: text("assigned_to_ohr"),
  assigned_to_name: text("assigned_to_name"),
  assigned_to_pg: text("assigned_to_pg"),
  assigned_by_ohr: varchar("assigned_by_ohr", { length: 20 }),
  assigned_by_name: varchar("assigned_by_name", { length: 255 }),
  due_date: varchar("due_date", { length: 64 }),
  completed_date: varchar("completed_date", { length: 64 }),
   record_type: varchar("record_type", { length: 50 }).default("task"),
  request_type: varchar("request_type", { length: 100 }),
  approval_status: varchar("approval_status", { length: 50 }),
  attachments: text("attachments"),
  created_at: varchar("created_at", { length: 64 }),
  updated_at: varchar("updated_at", { length: 64 }),
});
export type IoTask = typeof ioTasks.$inferSelect;
export type InsertIoTask = typeof ioTasks.$inferInsert;

export const ioTaskComments = mysqlTable("io_task_comments", {
  id: int("id").autoincrement().primaryKey(),
  task_id: varchar("task_id", { length: 20 }),
  author_ohr: varchar("author_ohr", { length: 20 }),
  author_name: varchar("author_name", { length: 255 }),
  content: text("content"),
  attachments: text("attachments"),
  created_at: varchar("created_at", { length: 64 }),
});

export type IoTaskComment = typeof ioTaskComments.$inferSelect;
export type InsertIoTaskComment = typeof ioTaskComments.$inferInsert;

// ============================================================
// OT Request & Approval System
// ============================================================

export const ioOtRequests = mysqlTable("io_ot_requests", {
  id: int("id").autoincrement().primaryKey(),
  request_id: varchar("request_id", { length: 50 }).notNull(),
  ohr_id: varchar("ohr_id", { length: 20 }).notNull(),
  agent_name: varchar("agent_name", { length: 255 }).notNull(),
  planning_group: varchar("planning_group", { length: 100 }),
  requested_hours: varchar("requested_hours", { length: 10 }).notNull(),
  status: varchar("status", { length: 50 }).default("pending").notNull(),
  submitted_at: varchar("submitted_at", { length: 64 }).notNull(),
  approved_at: varchar("approved_at", { length: 64 }),
  applied_date: varchar("applied_date", { length: 30 }),
  approved_by: varchar("approved_by", { length: 255 }),
  approved_by_ohr: varchar("approved_by_ohr", { length: 20 }),
});

export type IoOtRequest = typeof ioOtRequests.$inferSelect;
export type InsertIoOtRequest = typeof ioOtRequests.$inferInsert;

export const ioOtConfig = mysqlTable("io_ot_config", {
  id: int("id").autoincrement().primaryKey(),
  planning_group: varchar("planning_group", { length: 100 }).notNull(),
  ot_form_open: boolean("ot_form_open").default(false).notNull(),
  open_count: int("open_count").default(0).notNull(),
  week_start: varchar("week_start", { length: 64 }),
  updated_at: varchar("updated_at", { length: 64 }),
  updated_by: varchar("updated_by", { length: 255 }),
});

export type IoOtConfig = typeof ioOtConfig.$inferSelect;
export type InsertIoOtConfig = typeof ioOtConfig.$inferInsert;

// ============================================================
// Productivity Hours (Horizon)
// ============================================================
export const ioProductivityHours = mysqlTable("io_productivity_hours", {
  id: int("id").autoincrement().primaryKey(),
  date: varchar("date", { length: 16 }).notNull(),          // YYYY-MM-DD
  ohr: varchar("ohr", { length: 32 }).notNull(),
  actual_projection: varchar("actual_projection", { length: 32 }).default("Actuals"),
  available: decimal("available", { precision: 8, scale: 2 }).default("0"),
  non_srt_production: decimal("non_srt_production", { precision: 8, scale: 2 }).default("0"),
  fb_training: decimal("fb_training", { precision: 8, scale: 2 }).default("0"),
  onboarding: decimal("onboarding", { precision: 8, scale: 2 }).default("0"),
  coaching: decimal("coaching", { precision: 8, scale: 2 }).default("0"),
  wellness_support: decimal("wellness_support", { precision: 8, scale: 2 }).default("0"),
  team_meeting: decimal("team_meeting", { precision: 8, scale: 2 }).default("0"),
  total_billable: decimal("total_billable", { precision: 8, scale: 2 }).default("0"),
  delivered_hours: decimal("delivered_hours", { precision: 8, scale: 2 }).default("0"),
  uploaded_at: varchar("uploaded_at", { length: 64 }),
});

export type IoProductivityHours = typeof ioProductivityHours.$inferSelect;
export type InsertIoProductivityHours = typeof ioProductivityHours.$inferInsert;

// ============================================================
// Billing Compliance V2 Tables
// ============================================================

/**
 * io_srt_bill — Daily SRT billing data per employee.
 * Source of truth: uploaded BILLINGTEMPLATE.xlsx (SRT_BILL sheet).
 * Each row = one employee on one date with their billing status, role, and planning group.
 */
export const ioSrtBill = mysqlTable("io_srt_bill", {
  id: int("id").autoincrement().primaryKey(),
  date: varchar("date", { length: 16 }).notNull(),              // YYYY-MM-DD
  ohr_id: varchar("ohr_id", { length: 20 }).notNull(),
  srt_id: varchar("srt_id", { length: 50 }),
  billing_name: varchar("billing_name", { length: 255 }),
  srt_status: varchar("srt_status", { length: 50 }),             // Production, Nesting, Exit, Training, Attrition Backfill Training
  actual_vs_projection: varchar("actual_vs_projection", { length: 20 }), // Actuals or Projection
  role: varchar("role", { length: 100 }),                        // Agent, Operational SME, Quality & Policy Expert
  planning_group: varchar("planning_group", { length: 100 }),    // e.g. MASA_MAFSA_CTR_SCALED_REVIEW
  created_at: varchar("created_at", { length: 64 }),
});

export type IoSrtBill = typeof ioSrtBill.$inferSelect;
export type InsertIoSrtBill = typeof ioSrtBill.$inferInsert;

/**
 * io_billing_targets_v2 — Weekly billing targets per Planning Group × Role.
 * Editable via Admin Tools. Used by Billing Compliance V2 to compute gap analysis.
 */
export const ioBillingTargetsV2 = mysqlTable("io_billing_targets_v2", {
  id: int("id").autoincrement().primaryKey(),
  week_ending: varchar("week_ending", { length: 16 }).notNull(), // YYYY-MM-DD (Saturday)
  planning_group: varchar("planning_group", { length: 100 }).notNull(),
  role: varchar("role", { length: 100 }).notNull(),
  target_hc: int("target_hc").default(0),
  target_hours: decimal("target_hours", { precision: 10, scale: 2 }).default("0"),
  created_at: varchar("created_at", { length: 64 }),
  updated_at: varchar("updated_at", { length: 64 }),
});

export type IoBillingTargetsV2 = typeof ioBillingTargetsV2.$inferSelect;
export type InsertIoBillingTargetsV2 = typeof ioBillingTargetsV2.$inferInsert;


// ============================================================
// Sync Log Table
// ============================================================

/**
 * io_sync_log — Tracks each sync run (DB → Google Sheets).
 * Used by the Sync History page for audit and troubleshooting.
 */
export const ioSyncLog = mysqlTable("io_sync_log", {
  id: int("id").autoincrement().primaryKey(),
  sync_type: varchar("sync_type", { length: 50 }).notNull(), // 'attendance', 'roster', etc.
  trigger: varchar("trigger", { length: 50 }).notNull(), // 'cron_0130', 'cron_1630', 'manual'
  status: varchar("status", { length: 20 }).notNull(), // 'success', 'error', 'running'
  started_at: varchar("started_at", { length: 64 }).notNull(),
  completed_at: varchar("completed_at", { length: 64 }),
  duration_ms: int("duration_ms"),
  rows_updated: int("rows_updated").default(0),
  rows_appended: int("rows_appended").default(0),
  total_db_rows: int("total_db_rows").default(0),
  total_sheet_rows: int("total_sheet_rows").default(0),
  error_message: text("error_message"),
  output_log: text("output_log"),
});
export type IoSyncLog = typeof ioSyncLog.$inferSelect;
export type InsertIoSyncLog = typeof ioSyncLog.$inferInsert;
