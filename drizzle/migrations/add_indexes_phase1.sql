-- ============================================================
-- Blueprint Phase 1: Database Index Migration
-- Adds indexes to all tables missing them, based on query patterns
-- TiDB supports online DDL — safe to apply without downtime
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- io_audit_log (15,656 rows) — queried by record_type, record_id, actor_ohr, ordered by timestamp
-- ────────────────────────────────────────────────────────────
CREATE INDEX idx_audit_record_type ON io_audit_log (record_type);
CREATE INDEX idx_audit_record_id ON io_audit_log (record_id);
CREATE INDEX idx_audit_actor_ohr ON io_audit_log (actor_ohr);
CREATE INDEX idx_audit_timestamp ON io_audit_log (timestamp);

-- ────────────────────────────────────────────────────────────
-- io_task_assignments (6,613 rows) — queried by group_task_id, employee_ohr, status
-- ────────────────────────────────────────────────────────────
CREATE INDEX idx_ta_group_task ON io_task_assignments (group_task_id);
CREATE INDEX idx_ta_employee_ohr ON io_task_assignments (employee_ohr);
CREATE INDEX idx_ta_group_task_status ON io_task_assignments (group_task_id, status);
CREATE INDEX idx_ta_employee_status ON io_task_assignments (employee_ohr, status);

-- ────────────────────────────────────────────────────────────
-- io_group_tasks (17 rows) — queried by status, created_by_ohr, task_id
-- ────────────────────────────────────────────────────────────
CREATE INDEX idx_gt_status ON io_group_tasks (status);
CREATE INDEX idx_gt_created_by ON io_group_tasks (created_by_ohr);
CREATE INDEX idx_gt_task_id ON io_group_tasks (task_id);

-- ────────────────────────────────────────────────────────────
-- io_insights (877 rows) — queried by insight_id, status, ohr_id, ordered by created_at
-- ────────────────────────────────────────────────────────────
CREATE INDEX idx_insights_insight_id ON io_insights (insight_id);
CREATE INDEX idx_insights_status ON io_insights (status);
CREATE INDEX idx_insights_ohr ON io_insights (ohr_id);
CREATE INDEX idx_insights_created ON io_insights (created_at);

-- ────────────────────────────────────────────────────────────
-- io_coaching_rca (85 rows) — queried by coaching_id
-- ────────────────────────────────────────────────────────────
CREATE INDEX idx_rca_coaching_id ON io_coaching_rca (coaching_id);

-- ────────────────────────────────────────────────────────────
-- io_coaching_ztp (19 rows) — queried by ztp_id (which stores coaching_id), infraction_category
-- ────────────────────────────────────────────────────────────
CREATE INDEX idx_ztp_ztp_id ON io_coaching_ztp (ztp_id);
CREATE INDEX idx_ztp_infraction ON io_coaching_ztp (infraction_category);

-- ────────────────────────────────────────────────────────────
-- io_role_changes (0 rows) — will be queried by ohr_id, week_ending
-- ────────────────────────────────────────────────────────────
CREATE INDEX idx_rc_ohr ON io_role_changes (ohr_id);
CREATE INDEX idx_rc_week_ending ON io_role_changes (week_ending);
CREATE INDEX idx_rc_ohr_week ON io_role_changes (ohr_id, week_ending);

-- ────────────────────────────────────────────────────────────
-- io_gchat_queue (6 rows) — queried by status for processing pending messages
-- ────────────────────────────────────────────────────────────
CREATE INDEX idx_gchat_status ON io_gchat_queue (status);

-- ────────────────────────────────────────────────────────────
-- io_sync_log (86 rows) — queried by sync_type, status, ordered by started_at
-- ────────────────────────────────────────────────────────────
CREATE INDEX idx_sync_type ON io_sync_log (sync_type);
CREATE INDEX idx_sync_started ON io_sync_log (started_at);
CREATE INDEX idx_sync_type_status ON io_sync_log (sync_type, status);

-- ────────────────────────────────────────────────────────────
-- wfm_session_log (25 rows) — queried by login_at for audit trail
-- ────────────────────────────────────────────────────────────
CREATE INDEX idx_wfm_session_login ON wfm_session_log (login_at);

-- ────────────────────────────────────────────────────────────
-- io_task_comments (1 row) — queried by task_id
-- ────────────────────────────────────────────────────────────
CREATE INDEX idx_tc_task_id ON io_task_comments (task_id);

-- ────────────────────────────────────────────────────────────
-- io_tasks (12 rows) — already has idx_tasks_status; add assigned_by_ohr, record_type
-- ────────────────────────────────────────────────────────────
CREATE INDEX idx_tasks_assigned_by ON io_tasks (assigned_by_ohr);
CREATE INDEX idx_tasks_record_type ON io_tasks (record_type);

-- ────────────────────────────────────────────────────────────
-- SUPPLEMENTAL: Additional indexes on already-indexed tables
-- for query patterns not yet covered
-- ────────────────────────────────────────────────────────────

-- io_tardiness: validation_status is frequently filtered
CREATE INDEX idx_tardiness_validation ON io_tardiness (validation_status);

-- io_coaching: coaching_id lookups (used in RCA/ZTP/NTE joins)
CREATE INDEX idx_coaching_coaching_id ON io_coaching (coaching_id);

-- io_coaching: coaching_type + coachee for dedup check
CREATE INDEX idx_coaching_dedup ON io_coaching (coach_ohr, coachee_ohr, coaching_type, coaching_date);

-- perf_sync_history: ordered by created_at for recent history
CREATE INDEX idx_perf_sync_created ON perf_sync_history (created_at);

-- ────────────────────────────────────────────────────────────
-- io_billing_target_hours (11 rows) — queried by code
-- ────────────────────────────────────────────────────────────
CREATE INDEX idx_bth_code ON io_billing_target_hours (code);
