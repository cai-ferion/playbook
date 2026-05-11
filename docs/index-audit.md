# Database Index Audit — Phase 1

## Current State (May 4, 2026)

### Tables WITH indexes (already covered):
| Table | Rows | Existing Indexes |
|-------|------|-----------------|
| io_attendance | 60,842 | idx_ohr_date, idx_log_date, idx_attendance_ohr_id, idx_attendance_tag, idx_attendance_date_ohr, idx_attendance_snap_supervisor, idx_attendance_wfm_tag, idx_attendance_ohr_date, idx_attendance_tag_date |
| io_coaching | 2,622 | idx_coaching_coach(coach_ohr), idx_coaching_coachee(coachee_ohr), idx_coaching_date(coaching_date) |
| io_coaching_nte | 0 | idx_coaching_id, idx_ohr_id |
| io_corrective_actions | 22 | idx_ca_ohr(ohr_id), idx_ca_status(status) |
| io_employees | 500 | idx_employees_ohr_id, idx_employees_actual_role, idx_employees_supervisor, idx_employees_status |
| io_leaves | 41 | idx_leaves_status, idx_leaves_ohr_start(ohr_id, start_date), idx_leaves_start_status(start_date, status) |
| io_notifications | 599 | idx_notifications_target(target_ohr), idx_notifications_created(created_at), idx_notifications_target_read(target_ohr, is_read) |
| io_permissions | 7,067 | uq_ohr_perm(ohr_id, permission_key) |
| io_productivity_hours | 1,445 | uq_date_ohr(date, ohr), idx_prod_hours_ohr_date(ohr, date) |
| io_srt_bill | 19,397 | uq_srt_bill_date_ohr(date, ohr_id), idx_srt_bill_date, idx_srt_bill_ohr, idx_srt_bill_pg_role, idx_srt_date_ohr |
| io_shift_extensions | 2 | idx_shift_ext_date(shift_date), idx_shift_ext_status(overall_status) |
| io_tardiness | 383 | idx_tardiness_ohr_date(ohr_id, date), idx_tardiness_week(week_ending) |
| io_billing_targets_v2 | 55 | uq_targets_v2_we_pg_role(week_ending, planning_group, role), idx_targets_v2_we(week_ending) |
| io_wfm_schedules | 43,365 | idx_wfm_ohr_date(ohr_id, schedule_date) |

### Tables WITHOUT indexes (need attention):
| Table | Rows | Priority |
|-------|------|----------|
| io_audit_log | 15,656 | HIGH — queried by record_type, entity_id, actor_ohr, created_at |
| io_task_assignments | 6,613 | HIGH — queried by group_task_id, employee_ohr, status |
| io_group_tasks | 17 | MEDIUM — queried by status, created_by_ohr |
| io_insights | 877 | MEDIUM — queried by type, status, target_ohr |
| io_coaching_rca | 85 | MEDIUM — queried by coaching_id |
| io_coaching_ztp | 19 | LOW — queried by coaching_id, infraction_category |
| io_role_changes | 0 | LOW — queried by ohr_id, week_ending |
| io_gchat_queue | 6 | LOW — queried by status |
| io_sync_log | 86 | LOW — queried by sync_type, created_at |
| wfm_session_log | 25 | LOW — queried by ohr_id, session_date |
| io_task_comments | 1 | LOW — queried by task_id |
| io_tasks | 12 | LOW — queried by status, assigned_to |

## Proposed Indexes

### HIGH priority (data volume + frequent queries):
1. io_audit_log: (record_type, created_at), (entity_id), (actor_ohr)
2. io_task_assignments: (group_task_id, status), (employee_ohr, status)

### MEDIUM priority:
3. io_group_tasks: (status), (created_by_ohr)
4. io_insights: (type, status), (target_ohr)
5. io_coaching_rca: (coaching_id)
6. io_coaching_ztp: (coaching_id)

### LOW priority (small tables, still good practice):
7. io_role_changes: (ohr_id, week_ending)
8. io_gchat_queue: (status)
9. io_sync_log: (sync_type, created_at)
10. wfm_session_log: (ohr_id, session_date)
11. io_task_comments: (task_id)
12. io_tasks: (assigned_to), (status) — already has idx_tasks_status

### Existing tables needing additional coverage:
13. io_tardiness: (validation_status) — frequently filtered
14. io_coaching: (coaching_type) — filtered in GET queries
15. io_attendance: (snap_planning_group) — filtered in dashboard queries
