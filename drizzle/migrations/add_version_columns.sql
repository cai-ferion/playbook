-- Blueprint Phase 3: Optimistic Locking — Add version columns to editable tables
-- Each table gets a `version` INT DEFAULT 1 NOT NULL column.
-- On every UPDATE, version is incremented. Conflict detection uses WHERE version = ?.

-- 1. io_attendance — multiple TLs editing same day's records
ALTER TABLE io_attendance ADD COLUMN version INT NOT NULL DEFAULT 1;

-- 2. io_coaching — TL editing while OM reviews
ALTER TABLE io_coaching ADD COLUMN version INT NOT NULL DEFAULT 1;

-- 3. io_coaching_nte — NTE records edited by TL/OM
ALTER TABLE io_coaching_nte ADD COLUMN version INT NOT NULL DEFAULT 1;

-- 4. io_corrective_actions — CA cases edited by TL/OM/HR
ALTER TABLE io_corrective_actions ADD COLUMN version INT NOT NULL DEFAULT 1;

-- 5. io_employees — employee details edited by admin/TL
ALTER TABLE io_employees ADD COLUMN version INT NOT NULL DEFAULT 1;

-- 6. io_insights — insights edited by TL
ALTER TABLE io_insights ADD COLUMN version INT NOT NULL DEFAULT 1;

-- 7. io_leaves — leave records edited by TL/agent
ALTER TABLE io_leaves ADD COLUMN version INT NOT NULL DEFAULT 1;

-- 8. io_tasks — tasks edited by assignee/TL
ALTER TABLE io_tasks ADD COLUMN version INT NOT NULL DEFAULT 1;

-- 9. io_tardiness — tardiness records validated by TL/OM
ALTER TABLE io_tardiness ADD COLUMN version INT NOT NULL DEFAULT 1;

-- 10. io_shift_extensions — shift ext approved by TL then OM (sequential workflow)
ALTER TABLE io_shift_extensions ADD COLUMN version INT NOT NULL DEFAULT 1;
