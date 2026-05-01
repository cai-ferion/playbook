-- Blueprint Phase 1: Performance Indexes
-- Applied: 2026-05-01

-- io_attendance: frequently filtered by date, ohr_id+date, tag+date
CREATE INDEX idx_attendance_log_date ON io_attendance (log_date);
CREATE INDEX idx_attendance_ohr_date ON io_attendance (ohr_id, log_date);
CREATE INDEX idx_attendance_tag_date ON io_attendance (tag, log_date);

-- io_employees: frequently filtered by supervisor, planning_group+role, status
CREATE INDEX idx_employees_supervisor ON io_employees (supervisor_name);
CREATE INDEX idx_employees_pg_role ON io_employees (planning_group, actual_role);
CREATE INDEX idx_employees_status ON io_employees (employement_status);

-- io_leaves: filtered by status, ohr+start_date, start_date+status
CREATE INDEX idx_leaves_status ON io_leaves (status);
CREATE INDEX idx_leaves_ohr_start ON io_leaves (ohr_id, start_date);
CREATE INDEX idx_leaves_start_status ON io_leaves (start_date, status);

-- io_coaching: filtered by coachee_ohr, coaching_date
CREATE INDEX idx_coaching_coachee_ohr ON io_coaching (coachee_ohr);
CREATE INDEX idx_coaching_date ON io_coaching (coaching_date);

-- io_notifications: filtered by target_ohr+is_read, sorted by created_at
CREATE INDEX idx_notifications_target_read ON io_notifications (target_ohr, is_read);
CREATE INDEX idx_notifications_created ON io_notifications (created_at);

-- io_shift_extensions: filtered by shift_date, overall_status
CREATE INDEX idx_shift_ext_date ON io_shift_extensions (shift_date);
CREATE INDEX idx_shift_ext_status ON io_shift_extensions (overall_status);

-- io_productivity_hours: filtered by ohr+date
CREATE INDEX idx_prod_hours_ohr_date ON io_productivity_hours (ohr, date);

-- io_tardiness: filtered by ohr+date, week_ending
CREATE INDEX idx_tardiness_ohr_date ON io_tardiness (ohr_id, date);
CREATE INDEX idx_tardiness_week ON io_tardiness (week_ending);

-- io_srt_bill: filtered by date, ohr_id
CREATE INDEX idx_srt_bill_date ON io_srt_bill (date);
CREATE INDEX idx_srt_bill_ohr ON io_srt_bill (ohr_id);
