import {
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  varchar,
  boolean,
  numeric,
  serial,
} from "drizzle-orm/pg-core";

// ── Enums ─────────────────────────────────────────────────────────────────────
export const userRoleEnum = pgEnum("user_role", ["user", "admin"]);

// ── Users ─────────────────────────────────────────────────────────────────────
export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: userRoleEnum("role").default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});
export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

// ── IO Employees ───────────────────────────────────────────────────────────────
export const ioEmployees = pgTable("io_employees", {
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
  gchat_space_id: varchar("gchat_space_id", { length: 100 }),
  offboarding_date: varchar("offboarding_date", { length: 30 }),
  resignation_date: varchar("resignation_date", { length: 30 }),
  relieving_date: varchar("relieving_date", { length: 30 }),
  exit_date: varchar("exit_date", { length: 30 }),
  exit_reason: varchar("exit_reason", { length: 255 }),
  department: varchar("department", { length: 128 }),
  floor: varchar("floor", { length: 10 }),
  sex: varchar("sex", { length: 2 }),
  version: integer("version").notNull().default(1),
});
export type IoEmployee = typeof ioEmployees.$inferSelect;
export type InsertIoEmployee = typeof ioEmployees.$inferInsert;

// ── IO Attendance ──────────────────────────────────────────────────────────────
export const ioAttendance = pgTable("io_attendance", {
  id: varchar("id", { length: 64 }).primaryKey(),
  ohr_id: varchar("ohr_id", { length: 20 }),
  log_date: varchar("log_date", { length: 30 }),
  tag: varchar("tag", { length: 50 }),
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
  wfm_tag: varchar("wfm_tag", { length: 50 }),
  batch_id: varchar("batch_id", { length: 50 }),
  version: integer("version").notNull().default(1),
});
export type IoAttendance = typeof ioAttendance.$inferSelect;
export type InsertIoAttendance = typeof ioAttendance.$inferInsert;

// ── IO Coaching ────────────────────────────────────────────────────────────────
export const ioCoaching = pgTable("io_coaching", {
  id: serial("id").primaryKey(),
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
  cap_level: varchar("cap_level", { length: 50 }),
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
  incident_timestamp: varchar("incident_timestamp", { length: 64 }),
  violation_type: varchar("violation_type", { length: 255 }),
  violation_subtype: text("violation_subtype"),
  sme_joiner_2: varchar("sme_joiner_2", { length: 255 }),
  sme_joiner_2_email: varchar("sme_joiner_2_email", { length: 320 }),
  locked_by: varchar("locked_by", { length: 255 }),
  coachee_list: text("coachee_list"),
  job_id: varchar("job_id", { length: 100 }),
  created_at: varchar("created_at", { length: 64 }),
  updated_at: varchar("updated_at", { length: 64 }),
  version: integer("version").notNull().default(1),
});
export type IoCoaching = typeof ioCoaching.$inferSelect;
export type InsertIoCoaching = typeof ioCoaching.$inferInsert;

// ── IO Coaching RCA ────────────────────────────────────────────────────────────
export const ioCoachingRca = pgTable("io_coaching_rca", {
  id: serial("id").primaryKey(),
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

// ── IO Coaching ZTP ────────────────────────────────────────────────────────────
export const ioCoachingZtp = pgTable("io_coaching_ztp", {
  id: serial("id").primaryKey(),
  ztp_id: varchar("ztp_id", { length: 50 }),
  infraction_category: varchar("infraction_category", { length: 255 }),
  infraction: varchar("infraction", { length: 255 }),
  description: text("description"),
  severity: varchar("severity", { length: 10 }),
  created_at: varchar("created_at", { length: 64 }),
});
export type IoCoachingZtp = typeof ioCoachingZtp.$inferSelect;
export type InsertIoCoachingZtp = typeof ioCoachingZtp.$inferInsert;

// ── IO Coaching NTE ────────────────────────────────────────────────────────────
export const ioCoachingNte = pgTable("io_coaching_nte", {
  id: varchar("id", { length: 36 }).primaryKey(),
  coaching_id: varchar("coaching_id", { length: 36 }).notNull(),
  employee_name: varchar("employee_name", { length: 255 }).notNull(),
  ohr_id: varchar("ohr_id", { length: 20 }).notNull(),
  cap_level: varchar("cap_level", { length: 50 }).notNull(),
  date_of_incident: varchar("date_of_incident", { length: 64 }),
  incident_description: text("incident_description"),
  policy_violated: text("policy_violated"),
  previous_warnings: text("previous_warnings"),
  expected_behavior: text("expected_behavior"),
  deadline_for_improvement: varchar("deadline_for_improvement", { length: 64 }),
  issued_by: varchar("issued_by", { length: 255 }),
  issued_by_ohr: varchar("issued_by_ohr", { length: 20 }),
  created_at: varchar("created_at", { length: 64 }),
  updated_at: varchar("updated_at", { length: 64 }),
  version: integer("version").notNull().default(1),
});
export type IoCoachingNte = typeof ioCoachingNte.$inferSelect;
export type InsertIoCoachingNte = typeof ioCoachingNte.$inferInsert;

// ── IO Notifications ───────────────────────────────────────────────────────────
export const ioNotifications = pgTable("io_notifications", {
  id: serial("id").primaryKey(),
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

// ── IO GChat Queue ─────────────────────────────────────────────────────────────
export const ioGchatQueue = pgTable("io_gchat_queue", {
  id: serial("id").primaryKey(),
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

// ── IO Insights ────────────────────────────────────────────────────────────────
export const ioInsights = pgTable("io_insights", {
  id: serial("id").primaryKey(),
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
  initial_review_date: varchar("initial_review_date", { length: 64 }),
  initial_review_comments: text("initial_review_comments"),
  initial_reviewer_comments: text("initial_reviewer_comments"),
  final_reviewer: varchar("final_reviewer", { length: 255 }),
  final_review_date: varchar("final_review_date", { length: 64 }),
  final_review_comments: text("final_review_comments"),
  trainer: varchar("trainer", { length: 255 }),
  trainer_comments: text("trainer_comments"),
  attachments: text("attachments"),
  task_id: varchar("task_id", { length: 100 }),
  month: varchar("month", { length: 30 }),
  locked_by: varchar("locked_by", { length: 255 }),
  batch_id: varchar("batch_id", { length: 50 }),
  created_at: varchar("created_at", { length: 64 }),
  updated_at: varchar("updated_at", { length: 64 }),
  version: integer("version").notNull().default(1),
});
export type IoInsight = typeof ioInsights.$inferSelect;
export type InsertIoInsight = typeof ioInsights.$inferInsert;

// ── IO Leaves ──────────────────────────────────────────────────────────────────
export const ioLeaves = pgTable("io_leaves", {
  id: serial("id").primaryKey(),
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
  tl_reviewer: varchar("tl_reviewer", { length: 255 }),
  tl_review_date: varchar("tl_review_date", { length: 64 }),
  om_reviewer: varchar("om_reviewer", { length: 255 }),
  om_review_date: varchar("om_review_date", { length: 64 }),
  rejection_reason: text("rejection_reason"),
  cancelled_at: varchar("cancelled_at", { length: 64 }),
  created_at: varchar("created_at", { length: 64 }),
  updated_at: varchar("updated_at", { length: 64 }),
  version: integer("version").notNull().default(1),
});
export type IoLeave = typeof ioLeaves.$inferSelect;
export type InsertIoLeave = typeof ioLeaves.$inferInsert;

// ── IO Audit Log ───────────────────────────────────────────────────────────────
export const ioAuditLog = pgTable("io_audit_log", {
  id: serial("id").primaryKey(),
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

// ── IO Shift Extensions ────────────────────────────────────────────────────────
export const ioShiftExtensions = pgTable("io_shift_extensions", {
  id: serial("id").primaryKey(),
  request_id: varchar("request_id", { length: 20 }),
  agent_ohr: varchar("agent_ohr", { length: 20 }),
  agent_name: varchar("agent_name", { length: 255 }),
  supervisor_ohr: varchar("supervisor_ohr", { length: 20 }),
  supervisor_name: varchar("supervisor_name", { length: 255 }),
  planning_group: varchar("planning_group", { length: 100 }),
  shift_date: varchar("shift_date", { length: 30 }),
  extension_minutes: integer("extension_minutes"),
  reason_details: text("reason_details"),
  tl_status: varchar("tl_status", { length: 30 }),
  tl_comments: text("tl_comments"),
  tl_actioned_by: varchar("tl_actioned_by", { length: 255 }),
  tl_actioned_at: varchar("tl_actioned_at", { length: 64 }),
  om_status: varchar("om_status", { length: 30 }),
  om_comments: text("om_comments"),
  om_actioned_by: varchar("om_actioned_by", { length: 255 }),
  om_actioned_at: varchar("om_actioned_at", { length: 64 }),
  overall_status: varchar("overall_status", { length: 30 }),
  created_at: varchar("created_at", { length: 64 }),
  updated_at: varchar("updated_at", { length: 64 }),
  version: integer("version").notNull().default(1),
});
export type IoShiftExtension = typeof ioShiftExtensions.$inferSelect;
export type InsertIoShiftExtension = typeof ioShiftExtensions.$inferInsert;

// ── IO Tasks ───────────────────────────────────────────────────────────────────
export const ioTasks = pgTable("io_tasks", {
  id: serial("id").primaryKey(),
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
  version: integer("version").notNull().default(1),
});
export type IoTask = typeof ioTasks.$inferSelect;
export type InsertIoTask = typeof ioTasks.$inferInsert;

// ── IO Task Comments ───────────────────────────────────────────────────────────
export const ioTaskComments = pgTable("io_task_comments", {
  id: serial("id").primaryKey(),
  task_id: varchar("task_id", { length: 20 }),
  author_ohr: varchar("author_ohr", { length: 20 }),
  author_name: varchar("author_name", { length: 255 }),
  content: text("content"),
  attachments: text("attachments"),
  created_at: varchar("created_at", { length: 64 }),
});
export type IoTaskComment = typeof ioTaskComments.$inferSelect;
export type InsertIoTaskComment = typeof ioTaskComments.$inferInsert;

// ── IO Group Tasks ─────────────────────────────────────────────────────────────
export const ioGroupTasks = pgTable("io_group_tasks", {
  id: serial("id").primaryKey(),
  task_id: varchar("task_id", { length: 20 }).notNull(),
  title: varchar("title", { length: 500 }).notNull(),
  description: text("description"),
  category: varchar("category", { length: 100 }),
  planning_groups: text("planning_groups"),
  departments: text("departments"),
  roles: text("roles"),
  excluded_ohrs: text("excluded_ohrs"),
  due_date: varchar("due_date", { length: 64 }),
  status: varchar("status", { length: 50 }).default("Active"),
  created_by_ohr: varchar("created_by_ohr", { length: 20 }).notNull(),
  created_by_name: varchar("created_by_name", { length: 255 }),
  created_at: varchar("created_at", { length: 64 }),
  updated_at: varchar("updated_at", { length: 64 }),
});
export type IoGroupTask = typeof ioGroupTasks.$inferSelect;
export type InsertIoGroupTask = typeof ioGroupTasks.$inferInsert;

// ── IO Task Assignments ────────────────────────────────────────────────────────
export const ioTaskAssignments = pgTable("io_task_assignments", {
  id: serial("id").primaryKey(),
  group_task_id: integer("group_task_id").notNull(),
  employee_ohr: varchar("employee_ohr", { length: 20 }).notNull(),
  employee_name: varchar("employee_name", { length: 255 }),
  status: varchar("status", { length: 50 }).default("Pending"),
  completed_at: varchar("completed_at", { length: 64 }),
  attachment_url: text("attachment_url"),
  created_at: varchar("created_at", { length: 64 }),
});
export type IoTaskAssignment = typeof ioTaskAssignments.$inferSelect;
export type InsertIoTaskAssignment = typeof ioTaskAssignments.$inferInsert;

// ── IO Productivity Hours ──────────────────────────────────────────────────────
export const ioProductivityHours = pgTable("io_productivity_hours", {
  id: serial("id").primaryKey(),
  date: varchar("date", { length: 16 }).notNull(),
  ohr: varchar("ohr", { length: 32 }).notNull(),
  actual_projection: varchar("actual_projection", { length: 32 }).default("Actuals"),
  available: numeric("available", { precision: 8, scale: 2 }).default("0"),
  non_srt_production: numeric("non_srt_production", { precision: 8, scale: 2 }).default("0"),
  fb_training: numeric("fb_training", { precision: 8, scale: 2 }).default("0"),
  onboarding: numeric("onboarding", { precision: 8, scale: 2 }).default("0"),
  coaching: numeric("coaching", { precision: 8, scale: 2 }).default("0"),
  wellness_support: numeric("wellness_support", { precision: 8, scale: 2 }).default("0"),
  team_meeting: numeric("team_meeting", { precision: 8, scale: 2 }).default("0"),
  total_billable: numeric("total_billable", { precision: 8, scale: 2 }).default("0"),
  delivered_hours: numeric("delivered_hours", { precision: 8, scale: 2 }).default("0"),
  uploaded_at: varchar("uploaded_at", { length: 64 }),
});
export type IoProductivityHours = typeof ioProductivityHours.$inferSelect;
export type InsertIoProductivityHours = typeof ioProductivityHours.$inferInsert;

// ── IO SRT Bill ────────────────────────────────────────────────────────────────
export const ioSrtBill = pgTable("io_srt_bill", {
  id: serial("id").primaryKey(),
  date: varchar("date", { length: 16 }).notNull(),
  ohr_id: varchar("ohr_id", { length: 20 }).notNull(),
  srt_id: varchar("srt_id", { length: 50 }),
  billing_name: varchar("billing_name", { length: 255 }),
  srt_status: varchar("srt_status", { length: 50 }),
  role: varchar("role", { length: 100 }),
  planning_group: varchar("planning_group", { length: 100 }),
  created_at: varchar("created_at", { length: 64 }),
});
export type IoSrtBill = typeof ioSrtBill.$inferSelect;
export type InsertIoSrtBill = typeof ioSrtBill.$inferInsert;

// ── IO Billing Targets V2 ──────────────────────────────────────────────────────
export const ioBillingTargetsV2 = pgTable("io_billing_targets_v2", {
  id: serial("id").primaryKey(),
  week_ending: varchar("week_ending", { length: 16 }).notNull(),
  planning_group: varchar("planning_group", { length: 100 }).notNull(),
  role: varchar("role", { length: 100 }).notNull(),
  target_hc: integer("target_hc").default(0),
  target_hours: numeric("target_hours", { precision: 10, scale: 2 }).default("0"),
  created_at: varchar("created_at", { length: 64 }),
  updated_at: varchar("updated_at", { length: 64 }),
});
export type IoBillingTargetsV2 = typeof ioBillingTargetsV2.$inferSelect;
export type InsertIoBillingTargetsV2 = typeof ioBillingTargetsV2.$inferInsert;

// ── IO Sync Log ────────────────────────────────────────────────────────────────
export const ioSyncLog = pgTable("io_sync_log", {
  id: serial("id").primaryKey(),
  sync_type: varchar("sync_type", { length: 50 }).notNull(),
  trigger: varchar("trigger", { length: 50 }).notNull(),
  status: varchar("status", { length: 20 }).notNull(),
  started_at: varchar("started_at", { length: 64 }).notNull(),
  completed_at: varchar("completed_at", { length: 64 }),
  duration_ms: integer("duration_ms"),
  rows_updated: integer("rows_updated").default(0),
  rows_appended: integer("rows_appended").default(0),
  total_db_rows: integer("total_db_rows").default(0),
  total_sheet_rows: integer("total_sheet_rows").default(0),
  error_message: text("error_message"),
  output_log: text("output_log"),
});
export type IoSyncLog = typeof ioSyncLog.$inferSelect;
export type InsertIoSyncLog = typeof ioSyncLog.$inferInsert;

// ── WFM Session Log ────────────────────────────────────────────────────────────
export const wfmSessionLog = pgTable("wfm_session_log", {
  id: serial("id").primaryKey(),
  login_at: varchar("login_at", { length: 64 }).notNull(),
  ip_address: varchar("ip_address", { length: 64 }),
  user_agent: text("user_agent"),
  action: varchar("action", { length: 50 }).default("login"),
  details: text("details"),
});
export type WfmSessionLog = typeof wfmSessionLog.$inferSelect;
export type InsertWfmSessionLog = typeof wfmSessionLog.$inferInsert;

// ── Compass Coaching Logs ──────────────────────────────────────────────────────
export const compassCoachingLogs = pgTable("compass_coaching_logs", {
  id: serial("id").primaryKey(),
  coaching_id: varchar("coaching_id", { length: 20 }).notNull().unique(),
  coaching_type: varchar("coaching_type", { length: 50 }).notNull(),
  coaching_date: varchar("coaching_date", { length: 64 }),
  session_goals: text("session_goals"),
  coaching_details: text("coaching_details"),
  status: varchar("status", { length: 100 }).default("Pending Acknowledgement"),
  coach_ohr: varchar("coach_ohr", { length: 20 }),
  coach_name: varchar("coach_name", { length: 255 }),
  coach_email: varchar("coach_email", { length: 320 }),
  coach_supervisor: varchar("coach_supervisor", { length: 255 }),
  coach_supervisor_email: varchar("coach_supervisor_email", { length: 320 }),
  coach_pg: varchar("coach_pg", { length: 100 }),
  coachee_ohr: varchar("coachee_ohr", { length: 20 }),
  coachee_name: varchar("coachee_name", { length: 255 }),
  coachee_email: varchar("coachee_email", { length: 320 }),
  coachee_supervisor: varchar("coachee_supervisor", { length: 255 }),
  coachee_supervisor_email: varchar("coachee_supervisor_email", { length: 320 }),
  coachee_pg: varchar("coachee_pg", { length: 100 }),
  sme_joiner_name: varchar("sme_joiner_name", { length: 255 }),
  sme_joiner_email: varchar("sme_joiner_email", { length: 320 }),
  sme_joiner_2_name: varchar("sme_joiner_2_name", { length: 255 }),
  sme_joiner_2_email: varchar("sme_joiner_2_email", { length: 320 }),
  job_id: varchar("job_id", { length: 100 }),
  rca_level_1: varchar("rca_level_1", { length: 255 }),
  rca_level_2: varchar("rca_level_2", { length: 255 }),
  rca_level_3: varchar("rca_level_3", { length: 255 }),
  rca_level_4: varchar("rca_level_4", { length: 255 }),
  rca_level_5: varchar("rca_level_5", { length: 255 }),
  rca_description: text("rca_description"),
  infraction_category: varchar("infraction_category", { length: 255 }),
  infraction: varchar("infraction", { length: 255 }),
  infraction_description: text("infraction_description"),
  severity: varchar("severity", { length: 10 }),
  incident_timestamp: varchar("incident_timestamp", { length: 64 }),
  violation_type: varchar("violation_type", { length: 255 }),
  violation_subtype: text("violation_subtype"),
  coachee_ack: boolean("coachee_ack").default(false),
  coachee_commitments: text("coachee_commitments"),
  coaching_rating: integer("coaching_rating"),
  coachee_sentiments: text("coachee_sentiments"),
  ack_date: varchar("ack_date", { length: 64 }),
  parent_coaching_id: varchar("parent_coaching_id", { length: 20 }),
  group_session_id: varchar("group_session_id", { length: 20 }),
  coachee_list: text("coachee_list"),
  linked_ca_case_id: varchar("linked_ca_case_id", { length: 20 }),
  attachments: text("attachments"),
  week_ending: varchar("week_ending", { length: 30 }),
  month: varchar("month", { length: 30 }),
  locked_by: varchar("locked_by", { length: 255 }),
  created_at: varchar("created_at", { length: 64 }),
  updated_at: varchar("updated_at", { length: 64 }),
});
export type CompassCoachingLog = typeof compassCoachingLogs.$inferSelect;
export type InsertCompassCoachingLog = typeof compassCoachingLogs.$inferInsert;

// ── Compass Dispute Events ─────────────────────────────────────────────────────
export const compassDisputeEvents = pgTable("compass_dispute_events", {
  id: serial("id").primaryKey(),
  coaching_id: varchar("coaching_id", { length: 20 }).notNull(),
  dispute_level: integer("dispute_level").notNull(),
  action: varchar("action", { length: 50 }).notNull(),
  actor_ohr: varchar("actor_ohr", { length: 20 }).notNull(),
  actor_name: varchar("actor_name", { length: 255 }).notNull(),
  actor_role: varchar("actor_role", { length: 100 }),
  comments: text("comments"),
  attachments: text("attachments"),
  created_at: varchar("created_at", { length: 64 }).notNull(),
});
export type CompassDisputeEvent = typeof compassDisputeEvents.$inferSelect;
export type InsertCompassDisputeEvent = typeof compassDisputeEvents.$inferInsert;

// ── Compass CA Cases ───────────────────────────────────────────────────────────
export const compassCaCases = pgTable("compass_ca_cases", {
  id: serial("id").primaryKey(),
  case_id: varchar("case_id", { length: 20 }).notNull().unique(),
  case_status: varchar("case_status", { length: 50 }).notNull().default("incident_reported"),
  employee_ohr: varchar("employee_ohr", { length: 20 }).notNull(),
  employee_name: varchar("employee_name", { length: 255 }),
  employee_pg: varchar("employee_pg", { length: 100 }),
  employee_supervisor: varchar("employee_supervisor", { length: 255 }),
  violation_category_number: integer("violation_category_number"),
  violation_category_name: varchar("violation_category_name", { length: 255 }),
  violation_subsection: varchar("violation_subsection", { length: 20 }),
  violation_text: text("violation_text"),
  violation_type: varchar("violation_type", { length: 50 }),
  incident_date: varchar("incident_date", { length: 64 }),
  incident_details: text("incident_details"),
  evidence_attachments: text("evidence_attachments"),
  ai_recommended_cap_level: varchar("ai_recommended_cap_level", { length: 20 }),
  ai_recommendation_reasoning: text("ai_recommendation_reasoning"),
  recommended_cap_level: varchar("recommended_cap_level", { length: 20 }),
  final_cap_level: varchar("final_cap_level", { length: 20 }),
  cap_override_reason: text("cap_override_reason"),
  active_period_days: integer("active_period_days"),
  active_period_start: varchar("active_period_start", { length: 64 }),
  active_period_end: varchar("active_period_end", { length: 64 }),
  nte_required: boolean("nte_required").default(true),
  nte_issued_date: varchar("nte_issued_date", { length: 64 }),
  nte_response_deadline: varchar("nte_response_deadline", { length: 64 }),
  nte_response_date: varchar("nte_response_date", { length: 64 }),
  nte_response_text: text("nte_response_text"),
  nte_document_url: text("nte_document_url"),
  nte_signed_url: text("nte_signed_url"),
  hearing_required: boolean("hearing_required").default(false),
  hearing_scheduled_date: varchar("hearing_scheduled_date", { length: 64 }),
  hearing_conducted: boolean("hearing_conducted").default(false),
  hearing_notes: text("hearing_notes"),
  nod_issued_date: varchar("nod_issued_date", { length: 64 }),
  nod_decision: varchar("nod_decision", { length: 20 }),
  nod_document_url: text("nod_document_url"),
  cap_document_url: text("cap_document_url"),
  cap_signed_url: text("cap_signed_url"),
  employee_signed: boolean("employee_signed").default(false),
  employee_signed_date: varchar("employee_signed_date", { length: 64 }),
  refusal_witnessed: boolean("refusal_witnessed").default(false),
  witness_names: text("witness_names"),
  linked_coaching_ids: text("linked_coaching_ids"),
  linked_prior_case_id: varchar("linked_prior_case_id", { length: 20 }),
  escalated_to_case_id: varchar("escalated_to_case_id", { length: 20 }),
  created_by_ohr: varchar("created_by_ohr", { length: 20 }),
  created_by_name: varchar("created_by_name", { length: 255 }),
  notes: text("notes"),
  created_at: varchar("created_at", { length: 64 }),
  updated_at: varchar("updated_at", { length: 64 }),
});
export type CompassCaCase = typeof compassCaCases.$inferSelect;
export type InsertCompassCaCase = typeof compassCaCases.$inferInsert;

// ── Compass CA Timeline ────────────────────────────────────────────────────────
export const compassCaTimeline = pgTable("compass_ca_timeline", {
  id: serial("id").primaryKey(),
  case_id: varchar("case_id", { length: 20 }).notNull(),
  event_type: varchar("event_type", { length: 50 }).notNull(),
  event_date: varchar("event_date", { length: 64 }),
  actor_ohr: varchar("actor_ohr", { length: 20 }),
  actor_name: varchar("actor_name", { length: 255 }),
  details: text("details"),
  attachments: text("attachments"),
  created_at: varchar("created_at", { length: 64 }).notNull(),
});
export type CompassCaTimeline = typeof compassCaTimeline.$inferSelect;
export type InsertCompassCaTimeline = typeof compassCaTimeline.$inferInsert;

// ── Compass Violation Catalog ──────────────────────────────────────────────────
export const compassViolationCatalog = pgTable("compass_violation_catalog", {
  id: serial("id").primaryKey(),
  category_number: integer("category_number").notNull(),
  category_name: varchar("category_name", { length: 255 }).notNull(),
  subsection: varchar("subsection", { length: 20 }).notNull(),
  violation_code: varchar("violation_code", { length: 20 }),
  violation_text: text("violation_text").notNull(),
  recommended_cap: varchar("recommended_cap", { length: 50 }),
  min_cap_level: integer("min_cap_level").default(0),
  max_cap_level: integer("max_cap_level").default(3),
  requires_nte: boolean("requires_nte").default(true),
  requires_hearing: boolean("requires_hearing").default(false),
  nte_response_hours: integer("nte_response_hours").default(48),
});
export type CompassViolationCatalog = typeof compassViolationCatalog.$inferSelect;
export type InsertCompassViolationCatalog = typeof compassViolationCatalog.$inferInsert;

// ── IO Permissions ─────────────────────────────────────────────────────────────
export const ioPermissions = pgTable("io_permissions", {
  id: serial("id").primaryKey(),
  ohr_id: varchar("ohr_id", { length: 20 }).notNull(),
  permission_key: varchar("permission_key", { length: 100 }).notNull(),
  granted: boolean("granted").notNull().default(false),
  updated_by: varchar("updated_by", { length: 20 }),
  updated_at: timestamp("updated_at").defaultNow(),
});
export type IoPermission = typeof ioPermissions.$inferSelect;
export type InsertIoPermission = typeof ioPermissions.$inferInsert;

// ── IO Corrective Actions ──────────────────────────────────────────────────────
export const ioCorrectiveActions = pgTable("io_corrective_actions", {
  id: varchar("id", { length: 36 }).primaryKey(),
  employee_name: varchar("employee_name", { length: 255 }).notNull(),
  ohr_id: varchar("ohr_id", { length: 20 }).notNull(),
  employee_email: varchar("employee_email", { length: 320 }),
  supervisor_name: varchar("supervisor_name", { length: 255 }),
  supervisor_ohr: varchar("supervisor_ohr", { length: 20 }),
  supervisor_email: varchar("supervisor_email", { length: 320 }),
  planning_group: varchar("planning_group", { length: 100 }),
  actual_role: varchar("actual_role", { length: 100 }),
  nte_type: varchar("nte_type", { length: 100 }),
  date_of_incident: varchar("date_of_incident", { length: 64 }),
  incident_description: text("incident_description"),
  policy_violated: text("policy_violated"),
  violations: text("violations"),
  response_deadline: varchar("response_deadline", { length: 64 }),
  status: varchar("status", { length: 50 }).notNull().default("Served"),
  served_date: varchar("served_date", { length: 64 }),
  cap_level: varchar("cap_level", { length: 50 }),
  cap_active_days: integer("cap_active_days"),
  cap_decision_date: varchar("cap_decision_date", { length: 64 }),
  cap_decision_by: varchar("cap_decision_by", { length: 255 }),
  cap_decision_by_ohr: varchar("cap_decision_by_ohr", { length: 20 }),
  cap_remarks: text("cap_remarks"),
  cap_start_date: varchar("cap_start_date", { length: 64 }),
  cap_expiry_date: varchar("cap_expiry_date", { length: 64 }),
  suspension_days: integer("suspension_days"),
  nod_issued: boolean("nod_issued").default(false),
  nod_date: varchar("nod_date", { length: 64 }),
  nod_summary: text("nod_summary"),
  linked_coaching_id: varchar("linked_coaching_id", { length: 36 }),
  attachments: text("attachments"),
  created_by: varchar("created_by", { length: 255 }),
  created_by_ohr: varchar("created_by_ohr", { length: 20 }),
  created_at: varchar("created_at", { length: 64 }),
  updated_at: varchar("updated_at", { length: 64 }),
  version: integer("version").notNull().default(1),
});
export type IoCorrectiveAction = typeof ioCorrectiveActions.$inferSelect;
export type InsertIoCorrectiveAction = typeof ioCorrectiveActions.$inferInsert;

// ── IO WFM Schedules ───────────────────────────────────────────────────────────
export const ioWfmSchedules = pgTable("io_wfm_schedules", {
  id: serial("id").primaryKey(),
  ohr_id: varchar("ohr_id", { length: 20 }).notNull(),
  schedule_date: varchar("schedule_date", { length: 10 }).notNull(),
  wfm_value: varchar("wfm_value", { length: 50 }).notNull(),
  uploaded_at: varchar("uploaded_at", { length: 64 }),
  uploaded_by: varchar("uploaded_by", { length: 255 }),
});
export type IoWfmSchedule = typeof ioWfmSchedules.$inferSelect;
export type InsertIoWfmSchedule = typeof ioWfmSchedules.$inferInsert;

// ── IO Tardiness ───────────────────────────────────────────────────────────────
export const ioTardiness = pgTable("io_tardiness", {
  id: serial("id").primaryKey(),
  ohr_id: varchar("ohr_id", { length: 20 }).notNull(),
  employee_name: varchar("employee_name", { length: 255 }).notNull(),
  supervisor_name: varchar("supervisor_name", { length: 255 }),
  planning_group: varchar("planning_group", { length: 100 }),
  actual_role: varchar("actual_role", { length: 100 }),
  shift_time: varchar("shift_time", { length: 100 }),
  date: varchar("date", { length: 16 }).notNull(),
  roster_login: varchar("roster_login", { length: 30 }),
  roster_logout: varchar("roster_logout", { length: 30 }),
  actual_login: varchar("actual_login", { length: 30 }),
  actual_logout: varchar("actual_logout", { length: 30 }),
  tardiness_minutes: integer("tardiness_minutes").default(0).notNull(),
  shift_type: varchar("shift_type", { length: 30 }),
  week_ending: varchar("week_ending", { length: 16 }).notNull(),
  validation_status: varchar("validation_status", { length: 20 }).default("Pending").notNull(),
  validated_by: varchar("validated_by", { length: 255 }),
  validated_by_ohr: varchar("validated_by_ohr", { length: 20 }),
  validated_at: varchar("validated_at", { length: 64 }),
  remarks: text("remarks"),
  upload_batch: varchar("upload_batch", { length: 64 }),
  created_at: varchar("created_at", { length: 64 }),
  version: integer("version").notNull().default(1),
});
export type IoTardiness = typeof ioTardiness.$inferSelect;
export type InsertIoTardiness = typeof ioTardiness.$inferInsert;

// ── IO Role Changes ────────────────────────────────────────────────────────────
export const ioRoleChanges = pgTable("io_role_changes", {
  id: serial("id").primaryKey(),
  ohr_id: varchar("ohr_id", { length: 20 }).notNull(),
  srt_id: varchar("srt_id", { length: 50 }),
  employee_name: varchar("employee_name", { length: 255 }).notNull(),
  original_role: varchar("original_role", { length: 100 }).notNull(),
  original_pg: varchar("original_pg", { length: 100 }).notNull(),
  new_role: varchar("new_role", { length: 100 }).notNull(),
  new_pg: varchar("new_pg", { length: 100 }).notNull(),
  date_from: varchar("date_from", { length: 10 }).notNull(),
  date_to: varchar("date_to", { length: 10 }).notNull(),
  week_ending: varchar("week_ending", { length: 10 }).notNull(),
  created_by: varchar("created_by", { length: 255 }),
  created_by_ohr: varchar("created_by_ohr", { length: 20 }),
  email_generated_at: varchar("email_generated_at", { length: 64 }),
  attendance_updated: boolean("attendance_updated").default(false),
  created_at: varchar("created_at", { length: 64 }),
});
export type IoRoleChange = typeof ioRoleChanges.$inferSelect;
export type InsertIoRoleChange = typeof ioRoleChanges.$inferInsert;

// ── IO Leave Periods ───────────────────────────────────────────────────────────
export const ioLeavePeriods = pgTable("io_leave_periods", {
  id: serial("id").primaryKey(),
  month: integer("month").notNull(),
  year: integer("year").notNull(),
  start_week_ending: varchar("start_week_ending", { length: 10 }).notNull(),
  created_by: varchar("created_by", { length: 255 }),
  created_by_ohr: varchar("created_by_ohr", { length: 20 }),
  created_at: varchar("created_at", { length: 64 }),
  updated_at: varchar("updated_at", { length: 64 }),
});
export type IoLeavePeriod = typeof ioLeavePeriods.$inferSelect;
export type InsertIoLeavePeriod = typeof ioLeavePeriods.$inferInsert;

// ── IO Admin OHRs ──────────────────────────────────────────────────────────────
export const ioAdminOhrs = pgTable("io_admin_ohrs", {
  id: serial("id").primaryKey(),
  ohr_id: varchar("ohr_id", { length: 20 }).notNull(),
  full_name: varchar("full_name", { length: 255 }),
  added_by: varchar("added_by", { length: 255 }),
  added_by_ohr: varchar("added_by_ohr", { length: 20 }),
  added_at: varchar("added_at", { length: 64 }),
});
export type IoAdminOhr = typeof ioAdminOhrs.$inferSelect;
export type InsertIoAdminOhr = typeof ioAdminOhrs.$inferInsert;
