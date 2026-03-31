# Playbook — Workforce Management System TODO

## Database Schema
- [x] Create io_employees table (roster management)
- [x] Create io_attendance table (daily attendance logs)
- [x] Create io_coaching table (coaching session tracking)
- [x] Create io_coaching_rca table (root cause analysis)
- [x] Create io_coaching_ztp table (zero tolerance policy infractions)
- [x] Create io_notifications table
- [x] Create io_insights table
- [x] Create io_leaves table
- [x] Create io_audit_log table (attendance modification tracking)
- [x] Create io_tasks and io_task_comments tables

## Server-Side Integration
- [x] Integrate io-routes.ts (Express API for all IO operations)
- [x] Integrate io-backup.ts (data import/export routes)
- [x] Register IO routes in server index
- [x] Update drizzle schema.ts with all IO tables
- [x] Update server/db.ts with IO query helpers

## Client-Side (Playbook Desktop Site)
- [x] Integrate server/public/index.html (full desktop UI)
- [x] Integrate server/public/css/styles.css
- [x] Integrate server/public/js/app.js (UI rendering, view switching, filters)
- [x] Integrate server/public/js/data.js (data layer, KPI calculations, risk detection)
- [x] Integrate server/public/js/input-portal.js (bulk attendance entry)
- [x] Integrate server/public/js/billing.js (billing compliance)
- [x] Integrate server/public/js/admin.js (admin panel)
- [x] Integrate server/public/js/compass.js (coaching management)
- [x] Integrate server/public/js/compass-omnibar.js (coaching search)
- [x] Integrate server/public/js/haven.js (insights/proposals)
- [x] Integrate server/public/js/helm.js (task management)
- [x] Integrate server/public/js/sandbox.js (sandbox module)
- [x] Integrate server/public/js/roster.js (employee roster)
- [x] Integrate server/public/js/notifications.js
- [x] Integrate server/public/js/maintenance.js
- [x] Integrate server/public/js/automailer.js
- [x] Integrate server/public/js/anchor-analytics.js
- [x] Integrate server/public/js/dash-omnibar.js

## Static Assets
- [x] Upload favicon.png and logo.png to CDN
- [x] Update asset references in HTML/CSS

## Features
- [x] Employee roster management with detailed profiles
- [x] Attendance tracking with tags (P, LATE, UPL, PL, ML, WO, NYO, EXIT)
- [x] Input portal for bulk attendance entry
- [x] Dashboard with KPI metrics and breakdowns
- [x] Risk alerts system (UPL violations, NCNS, trends)
- [x] Coaching management with RCA and ZTP
- [x] Billing compliance module
- [x] Admin panel with user management
- [x] Role-based access control (admin vs user)
- [x] Audit logging for attendance modifications

## Testing & Verification
- [x] Write vitest tests for API routes
- [x] Verify database connectivity
- [x] Test static file serving
- [x] End-to-end verification

## Data Import
- [x] Import io_employees.csv into io_employees table (403 rows)
- [x] Import io_attendance.csv into io_attendance table (34,106 rows)
- [x] Import io_coaching.csv into io_coaching table (2,839 rows incl. group coaching)
- [x] Import io_coaching_rca.csv into io_coaching_rca table (85 rows)
- [x] Import io_coaching_ztp.csv into io_coaching_ztp table (19 rows)
- [x] Import io_coaching-to_separate.csv as group coaching rows (7 rows)

## Data Import — Batch 2
- [x] Import io_attendance_january_26.csv into io_attendance table (12,276 rows)
- [x] Import io_insights.csv into io_insights table (1,517 rows)

## Data Import — Batch 3
- [x] Import updated io_attendance.csv (merge/upsert — 34,153 rows processed, all existing updated in place)

## Bug Fixes & Features — Batch 4
- [x] Fix: Attendance records not showing when filters are applied (date format converted from 'Day, MM/DD' to 'YYYY-MM-DD')
- [x] Feature: Add editable filter functionality to all 5 omnibars (Input Portal, Dashboard, Roster, Compass, Sandbox)

## Bug Fixes — Batch 5
- [x] Fix: Input Portal pagination controls unstyled (added .pagination-btn CSS with proper borders, hover, active state)

## Google Sheets Sync — Batch 6
- [x] Create public CSV/JSON export endpoint for attendance data (/api/io/attendance/export)
- [x] Write Google Apps Script for automatic sync to user's Google Sheet
- [x] Test the export endpoint (verified JSON output for March 1-2 date range)

## Batch Revisions — Batch 7
- [x] Editable sort chips on all omnibars (click to toggle direction on all 5 omnibars)
- [x] Attendance lock mechanism: only current date editable past 11:00 AM PHT (past dates always locked, admin OHR 740045032 exempt)
- [x] Billing Compliance: show current week table with loaded data (auto-selects current Friday)
- [x] Billing Compliance: narrow Billing Code Reference widget (280px sidebar)
- [x] Billing Compliance: doughnut chart for 95% weekly compliance threshold (YTD data)
- [x] Billing Compliance: UPL reason trends + 3-month prediction analytics
- [x] Billing Compliance: LATE reason trends + 3-month prediction analytics
- [x] Billing Compliance: PL reason trends + 3-month prediction analytics
- [x] Hide pages: Compass, Sandbox, Haven, Helm, Regimen, Admin Tools (visible only to OHR 740045032)
- [x] Remove in-website notification systems/functions (bell hidden)
- [x] Auto-email system: UPL/LATE notifications at 2:30 AM and 11:30 AM PHT
- [x] Email to agent (meta_email), CC supervisor + senior manager (Polimetla, Ravikiran), BCC banarvinmaurice@meta.com
- [x] Professional email template with date, tag, reason, remarks

## Admin OHR Correction — Batch 8
- [x] Change admin OHR from 740045032 back to 740045023 across all files (9 JS files, 20 occurrences updated)
- [x] Simplify email closing to just "Playbook Reporting" (remove Regards and Workforce Management System)

## Billing Compliance Fix — Batch 9
- [x] Remove "EX" row from the first table in Anchor - Billing Compliance page
- [x] Fix: Billing Compliance page doesn't auto-load current week data on initial render

## Billing Compliance Calculation Fixes — Batch 10
- [x] Fix target hours: MS=222, MQ=148, CA=1665, CS=111, CQ=74, SO=185, FA=185, SM=407, QP=222 (MA=3293 and RM=5476 stay)
- [x] Fix goal thresholds from 95%/98%/100% to 98%/100%/102%
- [x] Fix surplus/deficit logic: surplus when ratio > 1.05 (surplus = total - 1.05×base), deficit when ratio < threshold, otherwise "Met"
- [x] Update column headers from "Goal | 95%" to "Goal | 98%" etc.
- [x] Remove p_vals from total calculation (keep total = Delivered + OT only, as intended)

## Employee Nesting Status Update — Batch 11
- [x] Update 15 employees to "Nesting" status in io_employees table
- [x] Ensure billing compliance code excludes employees with "Nesting" employement_status (already works — status field comes from emp.employement_status)

## Batch 12 — Comprehensive Revisions

### Compass - Coaching Profile
- [x] Make "Job ID" field required in New Coaching Log form

### Compass - Disputes Area (card section routing)
- [x] LV1 - PENDING SME REVIEW: Status = Pending SME Review
- [x] LV2 - PENDING QA DECISION: Status = Markdown Disputed - SME
- [x] LV3 - PENDING SME-QA DECISION: Status = Markdown Retained - QA
- [x] LV4 - PENDING TRAINER DECISION: Status = QA Decision Rejected
- [x] LV5 - PENDING SME-TRAINER DECISION: Status = Markdown Retained - Trainer
- [x] LV6 - PENDING QTP MANAGER DECISION: Status = Trainer Decision Rejected - SME

### Sandbox - Input Portal
- [x] Make "Created Date" column a date-time format
- [x] Default sort: newest at the top

### Sandbox - Review Area
- [x] Copy card styling from Compass - Disputes Area (kanban-card-styled with icon rows)
- [x] Fix card click: detail view now shows in Review Area overlay, not Input Portal
- [x] Reject form: made smaller, narrowed spacing between rejection reasons
- [x] Approve → Save routes insight to "Pending Final Review" section
- [x] Section conditions updated:
  - [x] Pending Initial Review: Status = Pending Initial Review
  - [x] Pending Final Review: Status = Pending Final Review
  - [x] Renamed "Approved (Trainer)" to "Trainer's Area", statuses: Approved - Final Review / Elevated - Task in Progress / Elevated - POC Rejected / Elevated - Pending POC Discussion / Elevated - No POC
  - [x] Renamed "Rejected (Trainer)" to "Implemented", Status = Implemented
  - [x] Removed "Elevated (POC)" sectionentirely

### Database Updates
- [x] Replace all "AES Discussion" with "Scorecard Discussion" in Compass session_goal values (removed from rows that already had Scorecard Discussion, replaced in others)
- [x] Replace all "New Session" with "General Coaching" in Compass coaching_type column display + database records

### Billing Compliance
- [x] Fix YTD COMPLIANCE — 95% THRESHOLD chart not loading on published site (moved to server-side aggregation)
- [x] Fix UPL REASON TRENDS & 3-MONTH PREDICTION chart not loading (server-side aggregation)
- [x] Fix LATE REASON TRENDS & 3-MONTH PREDICTION chart not loading (server-side aggregation)
- [x] Fix PL REASON TRENDS & 3-MONTH PREDICTION chart not loading (server-side aggregation)

### Performance Dashboard Migration (from MIGRATION_HANDOFF.md)
- [x] Create perf_ database tables (6 tables)
- [x] Create REST API routes at /api/io/performance/* (data, kpi, upload, resync, sync-history, sync-status)
- [x] Port parseMainMetrics.ts parser for .xlsb files
- [x] Build Performance view in sidebar with filter bar, KPI cards, and sortable table
- [x] Integrate with io_employees for roster enrichment

## Batch 14 — Rename Performance to Horizon (own nav group)
- [x] Move Performance out of Helm into its own top-level nav group called "Horizon"
- [x] Add Horizon to admin-only visibility list (nav-group-horizon added to both login and session restore)

## Batch 15 — Comprehensive Revisions

### Helm - Task Board
- [x] Make "Assign To" field multi-choice in New Task form
- [x] Send automated email to assigned users when a new task is created

### Anchor - Input Portal
- [x] Fix attendance locking mechanism (dates 03/30/26 and prior should not be editable)
- [x] Automated daily CSV email: filter by current date, send to ge-co-miswfmteam@meta.com, wfm-ctr-php@meta.com, io-teamleadsmla@meta.com

### Compass - Disputes Area
- [x] LV1 - Pending SME Review: add blank Status to the filter condition

### Sandbox - Review Area
- [x] Add pagination to each section when cards don't fit the screen
- [x] Fix card section routing:
  - [x] PENDING INITIAL REVIEW: Status = Pending Initial Review
  - [x] PENDING FINAL REVIEW: Status = Pending Final Review
  - [x] TRAINER'S AREA: Status = Approved - Final Review / Elevated - Task in Progress / Elevated - POC Rejected / Elevated - Pending POC Discussion / Elevated - No POC
  - [x] IMPLEMENTED: Status = Implemented

### Horizon
- [x] Rename "Performance" child page to "Main Metrics"
- [x] Add new child page "Productivity Hrs."

### Regimen
- [x] Move Regimen out of Admin Tools group into main nav bar (order: Anchor, Compass, Sandbox, Haven, Helm, Regimen, Horizon)
- [x] Check if Access Level column is used anywhere (has data: 4 distinct values across all 403 employees)
- [x] Remove columns: Billing Code, Actions (keeping Access Level since it has active data)

## Batch 16 — Revisions

### Compass - Disputes Area
- [x] Relocate pagination from bottom to top of each kanban section (above the cards)
- [x] Fix QA Feedback logs not showing in LV1 - Pending SME Review (root cause: ORDER BY created_at DESC with all NULL created_at + 2000 limit excluded new records; fixed to ORDER BY id DESC + increased limit to 5000)

### Helm - Task Board
- [x] Add search bar to "Assigned To" field in New Task form (already existed)
- [x] Remove "Priority" column from table and database
- [x] Remove "My Tasks" tab — keep only "All Tasks" view
- [x] Remove "Linked Entity" column from table and database
- [x] Remove "Actions" column from the table

### Regimen
- [x] Remove "Access Level" column from table and database
- [x] Add employee detail card view when clicking a row

### Anchor - Billing Compliance
- [x] Add "Target Hours" column to Billing Code Reference section (editable only for admin 740045023)
