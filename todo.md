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

## Batch 17 — Revisions

### Anchor - Billing Compliance
- [x] Widen Billing Code Reference table (Target Hours column is cropped)
- [x] Decrease size of YTD Compliance doughnut chart so other charts fit beside the reference widget
- [x] Change YTD Compliance threshold from 95% to 100%

### Coaching - Disputes Area
- [x] Remove the horizontal lines between kanban column headers and pagination controls
- [x] Fix LV3 → LV4 routing: "QA Decision Rejected" with remarks should route to LV4 - Pending Trainer Decision (was setting status to 'QA Retention Rejected - SME' instead of 'QA Decision Rejected')

### Sandbox - Review Area
- [x] Restyle Review History section to match Dispute Trail template (timeline with dots, date/name, remarks, attachment status)

### Helm
- [x] Fix task assignment emails not being received by assigned users (emails ARE being sent successfully via Resend — delivery to @meta.com likely blocked by corporate email filters; improved error logging for diagnosis)

### Regimen - Detail Card
- [x] Remove card title
- [x] Add Primary Address, Barangay, City after Contact Number in Personal Details
- [x] Rename "Complete PG" to "Related PG"
- [x] Put "Platform" after "SRT ID"
- [x] Fix SRT ID showing scientific notation — display as whole number
- [x] Add "Meta Onboarding Date" and "Go Live Date" (renamed from "Live Date") under Dates
- [x] Add Locker Floor and Locker Number to Asset & Logistics (renamed from "Meta & Assets")
- [x] Move Meta Email & Workday ID to Work Information section
- [x] Add "Role" under Work Information
- [x] Make all fields editable only for admin (OHR: 740045023)

### Regimen - Filter Bar
- [x] Move "Add Filter" button from bottom-right to bottom-left of dropdown
- [x] Shorten filter bar width to not cover the whole table (set dropdown to 320px fixed width)

## Batch 18 — Webhook Endpoints for Meta Agentic Workflow Builder

- [x] Create/verify webhook endpoint for task assignment emails
- [x] Create/verify webhook endpoint for daily attendance CSV email
- [x] Create/verify webhook endpoint for UPL/LATE attendance notification emails
- [x] Create webhook for general/custom email sending
- [x] Document all webhook URLs and payloads for the Workflow Builder

## Batch 19 — Replace Resend with Brevo

- [x] Store Brevo API key as environment variable
- [x] Install Brevo SDK (using HTTP API directly)
- [x] Replace Resend in auto-mailer.ts (UPL/LATE notifications + daily CSV)
- [x] Replace Resend in io-routes.ts (task assignment emails)
- [x] Replace Resend in webhook send-email endpoint
- [x] Test email delivery to @meta.com addresses via Brevo (all 4 webhooks tested successfully)

## Batch 20 — Replace Brevo with Gmail for Email Delivery (CANCELLED)
- [x] Cancelled — Gmail MCP requires per-send confirmation, gws CLI lacks Gmail scopes

## Batch 21 — In-App Notification System (Replace All Email)

### Remove Email Components
- [x] Remove all Resend imports and code
- [x] Remove all Brevo imports and code
- [x] Remove sendTaskAssignmentEmails — replaced with sendTaskAssignmentNotifications
- [x] Remove all webhook email endpoints (/api/io/webhooks/*)
- [x] Remove email cron jobs from auto-mailer.ts — replaced with notification cron jobs
- [x] Remove resend and @getbrevo/brevo dependencies

### Notification Database & API
- [x] io_notifications table already exists (id, type, title, message, actor_ohr, target_ohr, is_read, created_at)
- [x] GET /api/io/notifications endpoint already exists
- [x] PATCH /api/io/notifications/:id/read endpoint already exists
- [x] PATCH /api/io/notifications/read-all endpoint already exists

### Notification Triggers (replace email triggers)
- [x] UPL/LATE attendance tags → create notification for the tagged employee (auto-mailer cron)
- [x] Task assignment in Helm → create notification for each assigned user (sendTaskAssignmentNotifications)
- [x] Daily attendance summary → create notification for admin (auto-mailer cron)

### Toggle Sidebar UI
- [x] Add toggle mechanism to sidebar — switch between main nav and notifications panel
- [x] Build notifications panel with list of notifications, read/unread styling, timestamps
- [x] Show unread count badge on the notifications toggle
- [x] Remove old notification bell dropdown from header
- [x] Convert all old positional-arg createNotification calls to object syntax (compass, haven, roster, sandbox)
- [x] Add notification type icons for UPL/LATE/task/daily_summary
- [x] Filter notifications by target_ohr for current user
- [x] Fix stale tests (batch15, io-routes) for removed columns/email code
- [x] Write comprehensive notification system test suite (28 tests)

### Notification Triggers (already working)
- [x] UPL/LATE attendance tags → create notification for the tagged employee (auto-mailer cron)
- [x] Task assignment in Helm → create notification for each assigned user (sendTaskAssignmentNotifications)
- [x] Daily attendance summary → create notification for admin (auto-mailer cron)

## Batch 22 — Multi-Module Revisions

### Anchor - Billing Compliance
- [x] Widen Billing Code Reference table so "Target Hrs" column title fits on one line
- [x] Center-align values in the Billing Code Reference table
- [x] Add UPL REASON TRENDS & 3-MONTH PREDICTION chart beside YTD Compliance, stacked vertically
- [x] Add LATE REASON TRENDS & 3-MONTH PREDICTION chart beside YTD Compliance, stacked vertically
- [x] Add PL REASON TRENDS & 3-MONTH PREDICTION chart beside YTD Compliance, stacked vertically

### Compass - Coaching Profile
- [x] Verify Group Coaching already creates separate "General Coaching" logs per coachee (already implemented)

### Compass - Disputes Area
- [x] LV4 "Retain Markdown" → popout with remarks + attachments → status "Markdown Retained - Trainer"
- [x] LV4 "Reverse Markdown" → popout confirmation → status "Markdown Accepted - Trainer" → routes to Coachee acknowledgement

### Helm - Task Board
- [x] Add "New Request" button next to "New Task" button
- [x] Request Type: "Attendance Backdated Change Tag" with date, agent, reason fields
- [x] Request submission creates a notification

### Regimen - Roster Table
- [x] Fix missing roster table (syntax error in createNotification call broke roster.js parsing)
- [x] Fix duplicate disputeRemoveFile function in compass.js

### Sandbox - Review Area
- [x] Remove "Elevate" button from review footer
- [x] Approve button opens popout with 4 status choices: Elevated - Task in Progress, Elevated - POC Rejected, Elevated - Pending POC Discussion, Elevated - No POC

## Batch 23 — Process Flow Corrections

### Anchor - Billing Compliance
- [x] Revert YTD Compliance doughnut chart to original size (own column)
- [x] Move UPL/LATE/PL trend charts to the right of the doughnut

### Compass - Disputes Area (Full 6-Level Flow Correction)
- [x] LV1 - PENDING SME REVIEW: Accept Markdown (→ "Markdown Accepted") / Dispute Markdown (→ "Markdown Disputed")
- [x] LV2 - PENDING QA DECISION: Reverse Markdown (→ "Markdown Reversed - QA") / Retain Markdown (→ "Markdown Retained - QA")
- [x] LV3 - PENDING SME-QA DECISION: Accept Decision (→ "QA Decision Accepted") / Reject Decision (→ "QA Decision Rejected")
- [x] LV4 - PENDING TRAINER DECISION: Reverse Markdown (→ "Markdown Reversed - Trainer") / Retain Markdown (→ "Markdown Retained - Trainer")
- [x] LV5 - PENDING SME-TRAINER DECISION: Accept Decision (→ "Trainer Decision Accepted") / Reject Decision (→ "Trainer Decision Rejected")
- [x] LV6 - PENDING QTP MANAGER DECISION: Reverse Markdown (→ "Markdown Reversed - QTP Manager") / Retain Markdown (→ "Markdown Retained - QTP Manager")
- [x] Removed all old status names (Markdown Disputed - SME, etc.)
- [x] Removed Pending Acknowledgement override — each level sets its own terminal status

### Sandbox - Review Area (Full Flow Correction)
- [x] Pending Initial Review: Approve (→ "Pending Final Review") / Reject (→ rejection reason)
- [x] Pending Final Review: Approve (→ popout with 4 elevated status choices) / Reject (→ rejection reason)
- [x] Trainer's Area: Change Status button → interchange between 4 elevated statuses + Implemented
- [x] Implemented: no actions (final phase)
- [x] Removed Approved - Final Review status (no longer used)
- [x] Added sandboxShowTrainerStatusPopout with current-status filtering

## Daily Google Sheet Sync

- [x] Build incremental sync script: export current day's DB records to ATTEND_26 sheet
- [x] Schedule recurring task at 2:30 AM and 5:30 AM Philippine Time (GMT+8)

## ROSTER Google Sheet Sync

- [x] Read io_employees schema and determine columns for ROSTER sheet
- [x] Build ROSTER sync script (full overwrite each run)
- [x] Run initial sync to populate the blank ROSTER sheet (403 employees)
- [x] Add ROSTER sync to the daily 2:30 AM / 5:30 AM PHT schedule
- [x] Apps Script emailer column indices already match — no changes needed

## GChat UPL/LATE Rich Card Notification System

- [ ] Build script to query DB for today's UPL/LATE attendance records
- [ ] Build rich card payloads with red (UPL) / amber (LATE) themes
- [ ] Look up employee DM spaces and send cards via Google Chat MCP
- [ ] Schedule daily runs at 2:30 AM and 11:30 AM PHT
- [x] Add gchat_space_id column to io_employees table (VARCHAR 100, nullable)
- [x] Import 403 Google Chat space IDs into io_employees.gchat_space_id (385 with IDs, 18 NULL)
- [x] Dashboard: Remove role-based data scoping — all roles see all data (Team Lead, Manager, Trainer, Operational SME, Admin)
- [x] Reverse sync: Read ATTEND_26 sheet for April 1-3 records and sync to Playbook DB
- [x] Schedule reverse sync to run until April 3, then switch to normal DB→Sheets from April 4
- [x] Fix: Current date attendance locked before 11 AM PHT — should be editable before 11 AM, locked after
- [x] Input Portal: Put Start Date and End Date filter on one line (inline layout)
- [x] Remove UPL/LATE admin alerts and daily attendance summary notifications (keep employee UPL/LATE notices)
- [x] Fix: Billing Code edit — added Apply button to stage changes to pendingEdits before Save
- [x] Helm Task Board: Copy "New Task" button styling to "New Request" button
- [x] Helm Task Board: New Request form — add "Current Tag" field after Name showing current tag
- [x] Helm Task Board: New Request form — rename Agent to Name, Date to Change to Date, shorten field bar, rename Submit Request to Submit
- [x] Helm Task Board: Split into two tables — "Tasks" and "Approvals" (requests route to Approvals)
- [x] Backdate tag change request: Create notification for supervisor (title, date, requester)
- [x] Backdate tag change request: Send GChat card to supervisor with Approve/Reject buttons (queue-based, every 5 min)

## Batch 24 — Multi-Module Revisions

### Helm - Task Board
- [x] Make Helm Task Board visible to all roles except Agents
- [x] Delete task with Task ID: TK-c912d7a0
- [x] Add GChat notification queue entry when tasks are assigned (sent to assignees)

### Notification Bar Redesign
- [x] Clean up empty/broken notifications (Jan 1, 1970 entries with no content)
- [x] Redesign notification bar: brief/concise alert overview, card detail view on clickor notification details on click
- [x] Make notifications briefer and more concise in the alert bar

### Notification Triggers
- [x] Add notification on saving attendance records (timestamp, users, brief explanation)
- [x] Add notification on changing billing code (timestamp, users, brief explanation)
- [ - [x] Add notification on backdate tag change request (timestamp, users, brief explanation)ion)

### Haven - Analytics
- [x] Hide Helm Analytics page except for admin OHR 740045023

### Regimen
- [x] Add GChat ID column to Regimen roster table
- [x] Add GChat ID field to Regimen detail card view (below Workday ID)

### GChat Queue
- [ ] When processing GChat queue, only show request summary in chat (not full notification contents)

## Batch 25 — Fixes & Enhancements (Apr 2)

### Fixes
- [x] Fix: Attendance save notification shows N/A for timestamp (added created_at to server + client)
- [x] Fix: Helm Analytics page not properly hidden for non-admin users (added to second visibility block)

### Helm - Task Board
- [x] Add "New Tag" picker to backdate request form (exclude current tag from choices)
- [x] Ensure GChat rich card notification sent to supervisor on backdate request (with New Tag in payload)
- [x] Refactor Task Board: side-by-side Tasks and Approvals tables (not tabs)

### GChat Templates
- [x] Send sample GChat rich card templates for all notification types to admin (740045023)

## Batch 26 — Revisions (Apr 2)

### Navigation & Defaults
- [x] Default sidebar to "Alerts" tab instead of "Menu" on login for all users
- [x] Change default landing page to Anchor - Risk Intelligence for all users
- [x] Reorder Anchor sub-pages: Risk Intelligence, Dashboard, Billing Compliance, Input Portal

### Audit Trail Fix
- [x] Fix audit timeline showing "by System" — should show the actual user who made the change
- [x] Add audit log entry when a row is locked for editing (lock event)

### Helm - Task Board
- [x] Align "Assign To" input width to match "Description" field in New Task form
- [x] Remove the stats bar (Total/Open/In Progress/Completed/Overdue/Pending/Approved/Rejected counts) from Task Board
- [x] Remove duplicate filter bars from Task Board

### Anchor - Billing Compliance Charts
- [x] Fix doughnut chart — now uses selected week's data instead of YTD (shows failing planning groups correctly)
- [x] UPL/LATE/PL trend charts use actual monthly data from server (Jan-Apr data confirmed working)

### Anchor - Dashboard
- [x] Add "Asset Inventory & Endorsement" widget to Dashboard (left of Shrink Details)
- [x] Widget shows Present count by Role (Agent/SME/FLM) and Shift Time (Midshift/GY Shift)
- [x] Chromebook/Mac and Yubikey columns copy the Present count value

### GChat Notification Cards
- [x] Redesign UPL/LATE GChat card to match provided template (Notification header, Attendance Details section, Action Required section, Playbook Reporting footer)
- [x] Update Action Required text: "Please coordinate with your supervisor, {supervisor_name}, regarding this attendance record. If you believe this tag was applied in error, you may request for your supervisor to change this."
- [x] Remove the black-boxed section (supervisor shift/PG info) from UPL/LATE card
- [x] Remove Daily Attendance Summary card and discontinue from GChat notification queue
- [x] Keep Backdate Request card as-is

### Helm - New Request Form
- [x] Limit "New Tag" dropdown options to only the tags available in Input Portal Tag dropdown (P, LATE, UPL, PL, ML, WO, NYO, EXIT)

## Batch 27 — Revisions (Apr 2)

### Anchor - Input Portal Locking
- [x] Change locking to lock rows for the day before current day and earlier (not current day)
- [x] Keep the 11:00 AM cutoff mechanism (locks apply after 11:00 AM PHT)
- [x] Example: If today is 04/02/26, after 11 AM lock 04/01/26 and before; current day (04/02/26) stays editable

## Batch 28 — Revisions (Apr 3)

### Anchor - Input Portal: Date Range Filter Width
- [x] Extend the date range filter chip so the full date range text is visible (max-width 220px → 360px)

### Anchor - Input Portal: Billing Code Descriptions
- [x] In "Edit Billing Code" dropdown, show code description beside each option (e.g. "MA (S-ABF; Agent)", "MS (S-ABF; Operational SME)", "SV (Any; Team Lead)")
- [x] Format: CODE (Planning Group; Role) — if no role, use "Any"

### Helm - Task Board: New Request Name Field
- [x] Change "Name" field in New Request form — search input hides after selection, shows on clear (single-select UX)

### Anchor - Input Portal: Omnibar Filter Bug
- [x] Fix FLM filter: comma in names broke comma delimiter — switched all filters to pipe (|) delimiter
- [x] Fix Agent filter: same pipe delimiter fix + employeeLookup fallback for value picker
- [x] Verified all filters: FLM=38 rows, Agent=2 rows, Tag UPL|LATE=5 rows — all working

## Batch 28b — Date Range Filter Fix (Apr 3)
- [x] Removed max-width limit on chip-text, now uses white-space:nowrap so full dates always visible
- [x] Widened date input fields to min-width:140px so full dates are visible

## Batch 28c — Date Range Picker Popout Width (Apr 3)
- [x] Widened omnibar popout menu from 320px to 520px so date range picker fits without scrolling

## Batch 29 — Status Column Fix (Apr 3)
- [x] Fix "Status" column in Input Portal to show SRT Status (Production/Nesting/Exit) instead of Employee Status (Active/Nesting/Inactive)
- [x] Backfill snap_status in io_attendance from io_employees.srt_status (41,911 rows updated via JOIN)
- [x] Fix 127 remaining Inactive records (3 employees not in io_employees: 740032254, 740044548, 740053516) — set to Exit
- [x] Update normalizeRecord to prefer snap_status from attendance record, fallback to emp.srt_status
- [x] Update omnibar filter empFieldMap to use srt_status instead of employement_status for Status filter
- [x] Final distribution: Production=41,310, Nesting=751, Exit=911, Active=0, Inactive=0 (3,410 records with null/empty srt_status from source data)
- [x] All 210 tests passing across 12 test files

## Batch 30 — Billing Compliance YTD Chart Fix (Apr 3)
- [x] Fix YTD chart to show correct ratio: (count of PG-weeks passing 100%) / (total PG-weeks YTD)
- [x] Added new server endpoint /api/io/attendance/billing-ytd-weekly for per-week per-billing-code aggregation
- [x] Rewrote doughnut chart to use renderYTDComplianceDoughnut (iterates all weeks, counts PG-week pass/fail)
- [x] YTD now correctly shows 81.8% (126/154 PG-weeks passing) instead of 100%
- [x] Legend shows which billing codes fail most often with week counts
- [x] Updated chart title to "YTD COMPLIANCE — 100% THRESHOLD"
- [x] All 211 tests passing across 12 test files

## Batch 31 — Billing Compliance Enhancements (Apr 3)
- [x] Add weekly breakdown table below doughnut chart showing which billing codes failed each week
- [x] Collapsible table with checkmark/percentage per code per week, color-coded pass/fail
- [x] Add threshold selector (98%/100%/102%) to toggle the doughnut compliance calculation
- [x] Threshold buttons update title, doughnut, legend, and breakdown table instantly from cached data
- [x] All 211 tests passing across 12 test files

## Batch 31b — Threshold Button Styling Fix (Apr 3)
- [x] Fix inactive threshold buttons to appear grayed out instead of white/invisible

## Batch 31c — Active Threshold Button Fix (Apr 3)
- [x] Fix active (selected) threshold button appearing white — changed to solid dark gray (#4b5563) instead of accent color

## Batch 31d — Billing Doughnut Table Cleanup (Apr 3)
- [x] Remove legend text ("Below X%...") below the doughnut chart
- [x] Remove the toggle button — table always visible
- [x] Freeze first column (Week) when scrolling horizontally
- [x] Ensure header row and first column have opaque backgrounds (solid colors, no transparency)

## Batch 31e — Extend Breakdown Table Height (Apr 3)
- [x] Removed max-height:300px constraint so table extends to fill available space

## Batch 32 — Fix UPL/LATE/PL Trend & Prediction Charts (Apr 3)
- [x] Root cause: April (incomplete month with only 5 records) was included in regression, pulling predictions to near-zero
- [x] Fix: exclude current incomplete month from linear regression; only use completed months (Jan-Mar) for trend calculation
- [x] Predictions now realistic: UPL Apr=275/May=158/Jun=41, LATE Apr=187/May=159/Jun=132, PL Apr=233/May=174/Jun=114
- [x] Current incomplete month excluded from actual data display; prediction line starts from last completed month
- [x] All 211 tests passing

## Batch 33 — Card Details Approvals Table Revisions (Apr 3)
- [x] Rename "Title" column to "Request Type" — shows only type (e.g., "Attendance Backdated Change Tag"), no employee name
- [x] Rename "Created" column to "Request Date"
- [x] Remove "Description" field from detail view
- [x] Fix "Reject" — updates approval_status to Rejected, record stays in table, old tag retained on attendance
- [x] Fix "Approve" — updates approval_status to Approved, record stays in table, applies new tag to attendance record via API
- [x] Added helmExtractRequestType() helper to parse title format
- [x] Added helmApplyApprovedTagChange() to parse description and update attendance record on approval
- [x] All 211 tests passing

## Batch 33b — Bug: Rejected request not showing in Approvals table (Apr 3)
- [x] Fix rejected request not appearing — default filter was set to "Pending" (selected), changed to "All" so all statuses show by default

## Batch 34 — Approvals Detail & Table Revisions (Apr 3)
- [x] Remove "Assigned To" column from the approvals table listing (5 columns → 5 columns)
- [x] In card details view for Attendance Backdated Change Tag: remove "Assigned To"
- [x] Add "Employee" field (parsed from description Agent line, OHR stripped)
- [x] Add "Date Changed" field (parsed from description Date line)
- [x] Add "Tag Change" field showing Previous Tag → New Tag with color-coded badges (red/green)
- [x] Updated request creation to also store Previous Tag in description for future requests
- [x] All 211 tests passing

## Batch 35 — Anchor Dashboard Layout & Asset Inventory Fixes (Apr 3)
- [x] Match Shift Breakdown and Supervisor Wise section heights (align-items:stretch + flex layout on flm-card)
- [x] Remove duplicate "ASSET INVENTORY & ENDORSEMENT" header row inside the table (kept only the card-header title)
- [x] Right-align the Role column in Asset Inventory table (both inline widget and fullscreen)
- [x] Add Expand button to Asset Inventory with fullscreen modal overlay (same as Shift Breakdown / Shrink Details)
- [x] All 211 tests passing

## Batch 35b — Shrink Details Height Alignment (Apr 3)
- [x] Match Shrink Details card height to Asset Inventory card — both cards use flex column layout with grid stretch alignment

## Batch 36 — Scheduled DB→Sheets Sync (Apr 3)
- [x] Investigated ATTEND_26 sheet: 46,382 rows, 17 columns (A-Q), dates through Apr 30
- [x] Built DB→Sheets sync script (db_to_sheets_sync.py): fetches DB records from Apr 1+, matches by ID, updates existing rows, appends new ones
- [x] Tested manually: 11,580 records synced in 24 batches (~40 seconds), all rows updated correctly
- [x] Scheduled task: runs at 3:30 PM PHT and 11:00 PM PHT daily (cron fires 4x but script is idempotent)

## Batch 37 — Asset Inventory Exclude RECALL_MEASUREMENT_CTR (Apr 3)
- [x] Exclude employees with "RECALL_MEASUREMENT_CTR" in complete_planning_group from Present count in Asset Inventory
- [x] Added completePlanningGroup to normalizeRecord from employee lookup
- [x] Updated both renderAssetInventory and buildAssetInventoryHTML (fullscreen) with the exclusion filter
- [x] All 211 tests passing

## Batch 38 — Fix Billing Compliance Breakdown Table Calculations (Apr 3)
- [x] Root cause: partial weeks (01/02 = 2 days, 04/03 = 6 days) compared against full 7-day target hours
- [x] Fix: added day_count per week from server (COUNT DISTINCT log_date), pro-rate target hours as target * (days/7)
- [x] Week 01/02 now shows MA=108.4% (was 31.0%), MS=103.3% (was 29.5%), CA=104.6% (was 29.9%)
- [x] Week 04/03 now shows MA=104.6% (was 89.6%), CS=102.5% (was 87.8%)
- [x] All 211 tests passing

## Batch 39 — Helm Default Expanded Tabs (Apr 3)
- [x] Helm nav group now auto-expands on login and session restore (both paths)
- [x] Previously only Anchor was auto-expanded; now both Anchor and Helm expand by default
- [x] All 211 tests passing

## Batch 40 — Helm Task Board: Tasks Given / Tasks Received / Approvals (Apr 3)
- [x] Rename "Tasks" table to "Tasks Given" — show only tasks where current user is the creator (assigned_by)
- [x] Add new "Tasks Received" table between Tasks Given and Approvals — show tasks where current user is in Assigned To
- [x] Each table has its own filters (status dropdown + search), table rendering, and pagination
- [x] Tasks Given shows Assigned To column; Tasks Received shows Assigned By column
- [x] Approvals table maintained as-is
- [x] Layout changed from 2-column to 3-column grid
- [x] All 225 tests passing (14 new tests added)

## Batch 40b — Remove Assigned By column from Tasks Received (Apr 3)
- [x] Remove "Assigned By" column from Tasks Received table header and body
- [x] All 225 tests passing

## Batch 40c — Verify Tasks Received shows all assigned tasks (Apr 3)
- [x] Verified helmApplyReceivedFilters correctly matches current user's ohr_id in assigned_to_ohr field
- [x] Verified task creation stores assigned_to_ohr as comma-separated string from multi-select picker
- [x] Added .trim() and filter(Boolean) for robust whitespace/empty-string handling
- [x] Added fallback to empty list when no user is logged in (both Tasks Given and Tasks Received)
- [x] All 225 tests passing

## Batch 41 — Roster WO/PL Import & Sync Pause

- [x] Reviewed all sync processes — no automated DB-to-GSheet sync exists in the server code
- [x] Parsed roster file: 2,522 WO/PL entries (2,336 WO + 186 PL) for April 4-24, 2026
- [x] Batch imported into io_attendance: 2,468 existing records updated, 36 new records inserted
- [x] All WO/PL records locked: 2,318 WO locked, 197 PL locked (100%)
- [x] Employee snapshots populated for all new records

## Batch 42 — Helm Task Board Loading Screen

- [x] Hide all Task Board content (tables, filters, buttons) while loading
- [x] Show only a centered loading spinner/screen until data is fully loaded
- [x] Reveal content once data fetch completes
- [x] All 225 tests passing

## Batch 43 — Data Cleanup

- [x] Updated 50 blank statuses to "Pending SME Review" for QA Feedback coaching logs
- [x] io_attendance: 0 pre-2026 rows (already clean)
- [x] io_coaching: deleted 2,831 pre-2026 rows (13 remaining)
- [x] io_coaching_ztp: 0 pre-2026 rows (already clean)
- [x] io_insights: 0 pre-2026 rows (already clean)
- [x] io_tasks / io_task_comments: 0 pre-2026 rows (already clean)
- [x] io_notifications: 0 pre-2026 rows (already clean)
- [x] io_audit_log: 0 pre-2026 rows (already clean)
- [x] io_leaves / io_gchat_queue: 0 pre-2026 rows (already clean)
- [x] Verified: 0 pre-2026 rows remaining across all tables

## Batch 44 — Input Portal Data Cleanup

- [x] Removed all attendance rows for Polimetla, Ravikiran (OHR 703212987) — 6 rows deleted
- [x] Removed all attendance rows for 6 Manager-role employees — 36 rows total deleted
- [x] Checked Aspera, Brianna (OHR 740049320) — she has 120 attendance rows, records present through Apr 30

## Batch 45 — Billing Compliance Tabs

- [x] Add two-tab layout below the first table in Billing Compliance
- [x] Tab 1 "Billing Dashboard" — contains existing charts and tables
- [x] Tab 2 "OT Dashboard" — empty placeholder with clock icon and "Coming soon" message
- [x] All 225 tests passing

## Batch 46 — OT Request & Approval System

- [x] Create io_ot_requests DB table (id, request_id, ohr_id, agent_name, planning_group, requested_hours, status, submitted_at, approved_at, applied_date, approved_by, approved_by_ohr)
- [x] Create io_ot_config DB table (id, planning_group, ot_form_open, updated_at, updated_by)
- [x] Add API endpoints: POST /ot-requests, GET /ot-requests, POST /ot-requests/approve, POST /ot-requests/open-form, GET /ot-config
- [x] Add "OT Request" category to New Request form in Task Board (helm.js)
- [x] OT Request form: single field — hours dropdown (1, 1.5, 2, 2.5)
- [x] Prevent duplicate pending OT requests per agent (server-side check)
- [x] Agent must wait for OM to open form before submitting (checks ot_config)
- [x] Exclude RECALL_MEASUREMENT_CTR employees from OT request form
- [x] Build OT Dashboard table in Billing Compliance (Date Submitted, Agent Name, Planning Group, Requested Hours, Approved Date)
- [x] Add Planning Group dropdown filter (Apply button grayed out until PG selected)
- [x] Add OT hours needed input field + Apply button for FIFO auto-approval
- [x] On Apply: approve FIFO, write OT to attendance for today, fill Approved Date, close form
- [x] Add "Open OT Form" button — sends in-app + GChat notification to eligible agents
- [x] Lock OT column in Input Portal for all employees except RECALL_MEASUREMENT_CTR
- [x] Hide tab bar in Billing Compliance for RECALL_MEASUREMENT_CTR employees
- [x] Add summary cards: Pending Requests | Pending Hours | Approved Today
- [x] Audit trail for approval actions (io_audit_log)
- [x] 23 new tests written — all 248 tests passing

## Batch 46b — OT Dashboard Cleanup

- [x] Removed summary cards (Pending Requests, Pending Hours, Approved Today) from OT Dashboard
- [x] All 248 tests passing

## Batch 46c — OT Dashboard Approval Controls

- [x] Move "Open OT Form" button to the right of the "Apply" button (removed margin-left:auto)
- [x] Restrict approval controls section to OHR 740030270 (OM/approver) only
- [x] All 248 tests passing

## Batch 47 — Helm Task Board Agent Visibility

- [x] Hide "New Task" button from agents on Task Board
- [x] Hide "Tasks Given" panel (heading, filters, table, pagination) from agents on Task Board
- [x] Grid switches from 3-column to 2-column for agents (Tasks Received + Approvals)
- [x] Agents still see New Request button, Tasks Received, and Approvals
- [x] All 248 tests passing
## Batch 48 — Default Page & Nav Bar for Agents
- [x] Make Helm Task Board the default starting page for Agents
- [x] Ensure left nav bar defaults to Alerts view (not Menu) for all users
- [x] All 248 tests passing
## Batch 49 — Hide Backdated Change Tag from Agents
- [x] Remove "Attendance Backdated Change Tag" option from New Request form for agents
- [x] All 248 tests passing
## Batch 50 — Auto-Select OT Request for Agents
- [x] Auto-select OT Request and hide dropdown for agents in New Request form
- [x] Ensure OT fields display correctly on form open for agents
- [x] Compile list of all in-app notification triggers
- [x] All 248 tests passing
## Batch 50b — OT Request Form Title for Agents
- [x] Show "OT Request" title in the New Request form for agents when dropdown is hidden
- [x] All 248 tests passing
## Batch 51 — Remove Unnecessary In-App Notifications
- [x] Remove #3: Duplicate client-side task_assigned notification (helm.js)
- [x] Remove #11: User login notification (notifyUserLogin)
- [x] Remove #12: Coaching log issued notification (notifyCoachingIssued)
- [x] Remove #13: All coaching dispute notifications (compass.js — 14 triggers)
- [x] Remove #14-16: Leave filed/approved/rejected notifications (haven.js)
- [x] Remove #17-18: Insight submitted/reviewed notifications (sandbox.js)
- [x] Remove #19: Roster add/edit/delete notifications (roster.js)
- [x] Remove #5: Attendance record save notification (notifyRecordSave)
- [x] Remove #7: Billing code change notification (notifyBillingCodeChange)
- [x] Remove #8: Billing file upload notification (notifyBillingFileUpload)
- [x] Remove #9: SRT file upload notification (notifySrtUpload)
- [x] Remove #21: System alert notification (notifySystemAlert)
- [x] Updated batch22 test to reflect removal
- [x] All 248 tests passing
## Batch 52 — OT Requests in Approvals Table
- [x] Fix OT requests not showing in Approvals table on Task Board for agents
- [x] Submitted OT requests should show as "Pending" in Approvals
- [x] Approved OT requests should remain visible in Approvals
- [x] OT requests merged from io_ot_requests into Approvals table
- [x] Agents only see their own requests; non-agents see all
- [x] OT request detail view shows hours, planning group, approval info
- [x] After OT submission, auto-refreshes and switches to Approvals tab
- [x] All 248 tests passing
## Batch 53 — Remove Comments from OT Request Detail
- [x] Hide Comments section in approval detail view for agents and OT Request category
- [x] All 248 tests passing
## Batch 54 — Fix Blank Date in OT Requests
- [x] Fix blank "Date Submitted" column for OT requests in Approvals table
- [x] Added fallback date from _otData.submitted_at in both table and detail view
- [x] All 248 tests passing
## Batch 55 — Fix Blank Date in OT Dashboard
- [x] Fix blank "Date Submitted" column in OT Dashboard table (Billing section)
- [x] Changed from r.created_at to r.submitted_at (correct field from API)
- [x] Also fixed sort to use submitted_at
- [x] All 248 tests passing
## Batch 56 — Prevent Duplicate OT Requests Per Week
- [x] Prevent agents from submitting duplicate OT requests for the same week
- [x] Allow new submission only if OM opens a new OT form AFTER last submission
- [x] Add server-side validation to reject duplicate OT requests (week-based check)
- [x] Server returns 409 with clear error message; client already shows server errors
- [x] All 248 tests passing
## Batch 57 — Already Submitted Indicator on New Request Form
- [x] Pre-check if agent already submitted OT this week when opening New Request form
- [x] Show "Already Submitted" indicator with existing request details instead of form fields
- [x] Shows request ID, hours, submitted date, and status
- [x] Respects OM re-open logic (allows resubmit if form opened after last submission)
- [x] All 248 tests passing
## Batch 58 — OT Dashboard Status Column
- [x] Add "Status" column to OT Dashboard table
- [x] Show "Waitlisted" for pending OT requests (amber badge)
- [x] Show "Applied" after OM clicks Apply (green badge)
- [x] All 248 tests passing
## Batch 59 — OT Apply Validation: Insufficient Waitlisted Hours
- [x] Show error if OM enters more OT hours than total waitlisted requests can cover
- [x] Advise OM to reopen the OT form to collect more requests
- [x] Also handles zero waitlisted requests case
- [x] All 248 tests passing
## Batch 60 — OT Form Auto-Open on Saturdays + OM Re-Open as Limit Increase
- [x] Remove requirement for OM to open OT form before first submission
- [x] Auto-open OT form every Saturday at 1:00 AM Manila time (first submission always allowed, no cron needed)
- [x] Agents blocked after submitting once per week (one-per-week rule)
- [x] OM "Open OT Form" click increases the limit by 1 (allows additional submission)
- [x] Added open_count and week_start columns to io_ot_config
- [x] Server tracks submissions vs open_count per week
- [x] Client pre-check updated to use open_count logic
- [x] All 248 tests passing
## Batch 61 — Open OT Form Success Toast
- [x] Add success toast when OM clicks "Open OT Form" (already implemented)
- [x] Fixed open-form endpoint timeout: batched 93+ notification inserts instead of sequential
- [x] All 248 tests passing
## Batch 62 — OT Next-Week Reservation + Smart Apply Logic
- [x] Show in OT Request form that the request is for next week with actual Week Ending date
- [x] Apply OT to a day when agent is NOT on work off or leave (forward first, then backward)
- [x] If no valid day found in the week, keep request waitlisted
- [x] Update OT Dashboard apply logic with smart day selection
- [x] Renamed "Approved Date" to "Applied Date" in OT Dashboard
- [x] Updated toast to show waitlisted count
- [x] All 248 tests passing
## Batch 63 — OT Workflow In-App Notifications
- [x] Notif #1: When an OT request is made, notify the requester
- [x] Notif #2: When OT requesting opens (first time), notify all applicable agents (already existed)
- [x] Notif #3: When OT has been applied, notify all agents with OT requests and their supervisors (include applied dat- [x] Notif #4: When OT approved but request is waitlisted, notify the OT requester- [x] Notif #5: When OT form has been reopened, notify all applicable agents and OM Jenifer Rosales (740030270)
- [x] Differentiated first-open vs re-open messaging in notifications and GChat
- [x] All 248 tests passing
## Batch 64 — OT Submission View Fix & Alerts Panel Notifications
- [x] Fix: After OT submission, Task Board incorrectly shows "Tasks Given" table for agents
- [x] Verify OT notifications appear in the Alerts sidebar panel (not just toasts)
- [x] Fixed helmSwitchBoardTab re-showing Tasks Given panel for agents
- [x] Added OT notification icons and colors to Alerts panel (5 new types)
- [x] All 248 tests passing
## Batch 65 — Fix OT Submission Alert Not Appearing
- [x] Fix: OT request submission not creating in-app notification (alert) for requester
- [x] Root cause: initNotifications() was never called — notification polling never started
- [x] Added initNotifications() calls in both login handler and session restore
- [x] All 248 tests passing

## Batch 66 — Reduce Notification Polling Interval
- [x] Change notification polling interval from 30s to 10s for faster alert delivery

## Batch 67 — OT Process Deck, Email Draft, Senior Manager Capabilities
- [x] Clear all OT test data from the database
- [x] Grant OHR 703212987 (Senior Manager) OM-level capabilities in OT process
- [x] Grant OHR 703212987 OM-level capabilities in Anchor processes (already has Manager role = same access)
- [x] Create OT process presentation deck for all employees
- [x] Draft announcement email for OT process rollout

## Batch 68 — OT Status Display Change
- [x] Change OT request status to "Approved" on Task Board and OT Dashboard when OT has been applied

## Batch 69 — Compass Full Visibility for TL
- [x] Grant OHR 740045023 full visibility of all Compass records regardless of team hierarchy (already in place via isAdmin740 override)

## Batch 70 — Compass Coaching Profile & Disputes Visibility for TL
- [x] Grant OHR 740045023 full visibility of all logs in Coaching Profile page (already in place)
- [x] Grant OHR 740045023 full visibility of all logs in Disputes Area page (already in place + fixed related logs search)

## Batch 71 — OT Apply: Target Next Week Dates
- [x] Update OT apply logic so approved OT is applied to nearest available day next week (Sat-Fri), skipping Work Off and PL dates
- [x] Remove backward pass from findOtDay — if no forward Sat→Fri day found, waitlist the request

## Batch 72 — Task Board Tabs, Alerts Style, Disputes Modals, Password Reset
- [x] Task Board: Add tabs for Tasks Given, Tasks Received, Approvals (filters stay page-level)
- [x] Approvals tab: Managers & 740045023 see all; TLs see their team; others see only own requests
- [x] Tasks Given tab: Everyone sees only tasks they created
- [x] Tasks Received tab: Everyone sees only tasks where they are in Assigned To; hide tab for 703212987
- [x] Remove password for Jenifer Rosales (740030270) — already null, can sign up fresh
- [x] Stylize the Alerts sidebar notification cards
- [x] Disputes: Retain Markdown modal template (LV2, LV4, LV6) — remarks + attachments + Cancel/Save
- [x] Disputes: Reverse Markdown modal template (LV2, LV4, LV6) — warning icon + confirmation + Cancel/Save(green)
- [x] Disputes: Reject Decision modal template (LV3, LV5) — plain title + remarks + attachments + Cancel/Save(red)
- [x] Disputes: Accept Decision modal template (LV3, LV5) — plain title + checkmark + confirmation + Cancel/Save(green), no yellow box

## Batch 73 — Hide OT Request for TLs/Managers
- [x] Remove OT Request option from New Request form for Team Leaders and Managers

## Batch 74 — LV6 Disputes Template & Group Coaching Separation
- [x] LV6 Retain Markdown: Use Retain template (Remarks + Attachments + Cancel/Save) with title "Retain Markdown"
- [x] LV6 Reverse Markdown: Use same Retain template with title "Reverse Markdown" (not the confirmation-only template)
- [x] LV6: After either decision, log goes back to agent for acknowledgement (status → Pending Acknowledgement)
- [x] Compass: Separate Group Coaching from General Coaching sessions (already implemented — Group Coaching creates individual General Coaching records per coachee)

## Batch 75 — Horizon Productivity, Coaching Import, QA Filter, Group Coaching Split
- [x] Horizon: Build weekly agent productivity hours table from BillingHours template (1,445 records imported, Mar 28-31)
- [x] Horizon: Add Admin Tools upload button for productivity hours data (.xlsb/.xlsx upload with batch upsert)
- [x] Compass: Import new coaching logs from DS.COACHING.xlsx (1,894 records imported, total now 2,005)
- [x] Compass: Filter out QA Feedback with dispute statuses from Coaching Profile page (5 statuses hidden)
- [x] Compass: Convert existing Group Coaching records into individual General Coaching records (147 converted → 246 General Coaching)

## Batch 76 — Account Reset for OHR 740030270
- [x] Delete existing user record for OHR 740030270 (Jenifer Rosales) so she can sign up fresh (password cleared from io_employees)

## Batch 77 — QA Feedback Detail View Restructure
- [x] Move L1-L5 + RCA Description from Session Details into a separate "Root Cause Analysis" section
- [x] Add "Markdown Status" field under Root Cause Analysis section showing current dispute status

## Batch 78 — Align io_attendance with ATTEND_26 Google Sheet
- [x] Read ATTEND_26 sheet and export all data (46,382 rows)
- [x] Compare with io_attendance table and identify differences (4,957 inserts, 3,231 updates, 24 deletes)
- [x] Apply changes (inserts, updates, deletes) to align DB with sheet
- [x] Double-check: re-read sheet and verify alignment (found & fixed missing snapshot fields on inserts)
- [x] Triple-check: re-read sheet and verify alignment — 0 inserts, 0 updates, 0 deletes remaining

## Batch 79 — Fix Billing Compliance % Discrepancy
- [x] Diagnose why Actual Weekly Compliance % differs between G Sheet and Playbook (CA and RM target hours were outdated)
- [x] Fix the compliance calculation formula in billing.js to match G Sheet (CA: 1665→2405, RM: 5476→4736)
- [x] Fix Goal columns (98%, 100%, 102%) — automatically fixed by correcting target hours

## Batch 80 — Fix YTD Compliance 100% Threshold Chart
- [x] Investigate why some weeks are not showing correctly in the YTD compliance chart (root cause: single static target hours used for all weeks)
- [x] Fix the chart data computation and rendering (date-based getTargetHours applied to YTD doughnut, breakdown table, and selected-week table)
- [x] Implement date-based target hours: old targets before WE 04/03, new targets from WE 04/03 onwards
- [x] Exclude current incomplete week from YTD compliance chart (blanks already counted as P)

## Batch 81 — Anchor Dashboard & Input Portal Improvements
- [x] Add "Select All" button inside each Dashboard and Input Portal filter dropdown
- [x] Set default for all Anchor Dashboard filters to all-selected (except date)
- [x] Add "Shift Time" column to Anchor Input Portal table (data.js TABLE_COLUMNS)
- [x] Add "Shift Time" filter to Anchor Input Portal (already existed, added Select All button)
- [x] Add "Shift Time" filter to Anchor Dashboard omnibar

## Batch 82 — Input Portal Default Filters
- [x] Set default for all Input Portal multi-select filters to all-selected on load (except date)

## Batch 83 — Filter Bar Overhaul (Input Portal + Dashboard)
- [x] Replace Input Portal omnibar with persistent filter bar (all filters always visible as pills)
- [x] Replace Dashboard omnibar with persistent filter bar
- [x] Each filter pill: compact dropdown with checkboxes, Select All/Deselect All, inline sort toggle
- [x] Instant-apply on every checkbox toggle (no Apply button)
- [x] Clear Filters button resets to all-selected defaults
- [x] Date filter remains as date range picker
- [x] Sort integrated into each filter dropdown (A→Z / Z→A)

## Batch 84 — Filtered Records Counter Fix
- [x] Fix "Filtered Records" counter on Input Portal filter bar — stays visible and updates on filter change
- [x] Fix "Filtered Records" counter on Dashboard filter bar — stays visible and updates on filter change

## Batch 85 — Remove Duplicate Filtered Records Box
- [x] Remove the standalone "Filtered Records: X" element below the Input Portal filter bar (duplicate of inline count)

## Batch 86 — Attendance Locking Mechanism Fix
- [x] Fix attendance locking so past dates (before today) are not editable in Input Portal (confirmed working — Manager/admin exempt by design)

## Batch 86 — Shrinkage & Scheduled Formula Update
- [x] Update Shrinkage formula to (PL + UPL) / (P + PL + UPL) everywhere
- [x] Update Scheduled formula to P + PL + UPL everywhere
- [x] Update KPI display labels/tooltips to reflect new formulas

## Batch 87 — Shift Breakdown Table Revision
- [x] Remove "Shift / Workflow" column header, replace with "Planning Group"
- [x] Column headers (Schedule, Present, PL, UPL, Shrinkage, Late) in GY Shift and Mid-Shift header rows
- [x] Fixed planning groups: GY (S-ABF, CS-ABF, CSO_CTR, FAD_CTR, RECALL_MEASUREMENT_CTR, SME_CTR, QPE_CTR), Mid (S-ABF, CS-ABF, RECALL_MEASUREMENT_CTR, SME_CTR, QPE_CTR)
- [x] Ensure data is sourced from Input Portal data only

## Batch 87b — Shift Breakdown Header Merge
- [x] Merge column headers (Schedule, Present, PL, UPL, Shrinkage, Late) into the GY Shift and Mid-Shift rows on the same line

## Batch 87c — Shift Breakdown Section Separators
- [x] Add thin separator lines between GY Shift, Mid-Shift, and Overall sections for better UX visibility

## Batch 88 — OHR 740044909 Input Portal Blank Page Fix
- [x] Fix blank page and "Refresh Failed" error for OHR 740044909 on Input Portal — comprehensive null guards added to all getElementById chains in app.js (updateAllViews, updateRefreshDisplay, switchView, renderInputTable) and input-portal.js (renderInputTableServerSide, renderInputTable, closeAuditModal)

## Batch 89 — Dashboard & Billing Compliance Data Source Alignment
- [x] Audit Dashboard data flow — confirmed all KPIs, charts, and tables use appState.records (Input Portal data)
- [x] Audit Billing Compliance data flow — weekly table uses appState.records; YTD analytics use server-side aggregation of same io_attendance table (kept server-side per user request)
- [x] No divergent data paths found — all data traces back to io_attendance table

## Batch 90 — Supervisor Wise Alphabetical Sort
- [x] Sort supervisors alphabetically in the Supervisor Wise breakdown on Anchor - Dashboard

## Batch 91 — G Sheet Attendance Sync (04/04–04/07)
- [x] Read G Sheet attendance data for 04/04/26–04/07/26 (1,544 rows from ATTEND_26 sheet)
- [x] Upsert data into io_attendance database (176 changed records: 156 via PATCH + 20 locked via bulk-update)
- [x] First verification — all 1,544 records match field-by-field
- [x] Second verification — 90/90 spot-checks passed (20 locked + 40 random + 30 tag changes)
- [x] Third verification — all counts, tag/billing/supervisor/planning group distributions match (1 null vs empty string cosmetic diff)

## Batch 92 — Asset Inventory Uses Dashboard Filters
- [ ] Make Asset Inventory & Endorsement table use Dashboard-filtered records instead of fixed/hardcoded counts

## Batch 92 — OT Dashboard Visibility Fix
- [x] Fix: Senior Manager (Ravikiran Polimetla, OHR 703212987) cannot see OT Dashboard tab — RECALL_MEASUREMENT_CTR check in billing.js hides tab bar for anyone with that planning group, including Managers who manage multiple groups. Exempt Manager role from the hide logic.

## Batch 93 — OT Mechanism Comprehensive Revision
- [x] OT Dashboard tab visibility: hide for anyone with RECALL_MEASUREMENT_CTR in complete_planning_group (including TL/Manager), exempt only Ravikiran (703212987), Joshua (740044909), and Admin (740045023)
- [x] Agent OT form: remove hours dropdown, fixed 2.5hrs, Yes/No commitment buttons with next WE date
- [x] Backend approval: apply OT to current week (not next week), skip past days, search from today→Friday
- [x] Backend approval: divide requested hours by 2.5, always round up for agent count
- [x] Forfeiture cascade: daily check after 11AM PHT lock, if tag ≠ P or LATE → forfeit and cascade to next waitlisted agent (same week, skip past days). Friday OT = no cascade, truly forfeited.
- [x] Update all notifications for revised OT flows

## Batch 94 — OT Dashboard Cleanup
- [x] Remove "Requested Hours" column from OT Dashboard table (since OT is now fixed at 2.5hrs)

## Batch 95 — Billing Compliance Table Enhancements
- [x] Add headcount needed beside each goal column (hours ÷ 7.5, round up)
- [x] Add Forecasted OT column (average of all previous weeks' OT for that billing code), left of PL Count
- [x] Add Forecasted UPL column (average of all previous weeks' UPL for that billing code), between Forecasted OT and PL Count
- [x] Forecasted OT and Forecasted UPL only visible when viewing next week (WE after current WE)

## Batch 96 — OT Edit Lock Mechanism
- [x] Allow OT editing for all users until end of this week (Friday 04/10) with 11 AM lock
- [x] From next week (04/11 onward), lock OT field for non-RECALL agents (role=Agent, planning group does NOT contain RECALL_MEASUREMENT_CTR)
- [x] RECALL agents and non-agent roles (SME, TL, Manager, etc.) always edit OT normally, only 11 AM lock applies
- [x] Apply lock on both frontend (Input Portal) and backend (PATCH endpoint)
- [x] Hide "OT Request" option from Task Board for non-agent roles (SME, TL, Manager, etc.)

## Batch 97 — Approvals Tab Visibility
- [ ] TL: show own items + items from their agents
- [ ] Manager: show all items
- [ ] Admin (740045023): show all items
- [ ] All other roles (agents, SME, etc.): show only their own items

## Batch 97 — OT Workflow Gap Fixes
- [x] Add Saturday auto-open cron job at 1 AM PHT for all non-RECALL planning groups
- [x] Add server-side validation on POST /ot-requests to reject submissions when OT form is closed
- [x] Add "Forfeited" status badge in OT Dashboard table
- [x] Add forfeiture notifications to agent and supervisor
- [ ] (Hold) Forfeiture check timing — only checks yesterday, may miss retroactive tag changes

## Batch 98 — Bug Fixes
- [x] Fix: Tag update failing for user 740044792 updating 740035562 with WO
- [x] Fix: OT fields not editable for current week ending 04/10 (should be editable until 04/10 for all, locked from 04/11 onward for non-RECALL agents only)
- [x] Remove is_locked enforcement from backend PATCH endpoint
- [x] Remove is_locked auto-set during attendance sync (work-off and future week auto-lock)
- [x] Remove is_locked visual indicators from frontend (row-locked class, lock icons)
- [x] Unlock all currently locked attendance records in database

## Batch 99 — Input Portal Performance
- [x] Reduce loading screens: replaced full-screen progress bar with subtle table overlay for filter/sort/pagination changes (initial load still uses full progress bar)

## Batch 100 — Final Cut Schedule Import
- [x] Read cleaned Final Cut Schedule (04/09-04/24), extract WO/PL per OHR+date (1,797 entries: 1,658 WO + 139 PL)
- [x] Re-enable is_locked enforcement in backend PATCH + bulk-tag (Managers + admin 740045023 can override)
- [x] For existing records with empty tag: set WO/PL from schedule (1,279 updated)
- [x] For missing records (04/11+): create with WO/PL tag + employee snapshot (40 created; 12 skipped — 3 OHRs not in employee DB)
- [x] Lock all WO/PL records from schedule (is_locked = true) (465 lock-only + all updates/creates)
- [x] Verify import accuracy (1,784/1,797 match, 1 mismatch=UPL override, 12 missing=employees not in DB)
- [x] Bump cache-busting version to ?v=100
- [x] Add bulk-import endpoint (POST /attendance/bulk-import) for admin-only batch operations

## Batch 100b — Remove Non-Roster OHRs
- [x] Delete all records for OHR 703188146 from all tables (attendance, employees, etc.) — 0 attendance, 0 employee records found (never in DB)
- [x] Delete all records for OHR 740043139 from all tables — 0 attendance, 0 employee records found (never in DB)
- [x] Delete all records for OHR 740044631 from all tables — 0 attendance, 0 employee records found (never in DB)
- [x] Verify no remaining data for these 3 OHRs — confirmed clean

## Batch 100c — Fix is_locked Enforcement Bug
- [x] Bug: OHR 740043993 can edit locked WO record for Mansalay, Jandy Mahinay on 04/09
- [x] Investigate: backend enforcement confirmed working (PATCH returns 403); issue was frontend-only
- [x] Fix: Added is_locked to normalizeRecord() in data.js + isRowLocked() in app.js now checks record.is_locked
- [x] Lock icon tooltip differentiates schedule lock vs date lock
- [x] Bumped data.js cache-busting to ?v=100

## Batch 101 — Scope OT Mechanism to S-ABF & CS-ABF Agents Only
- [x] Audit all OT mechanism touchpoints (backend + frontend) — 10 touchpoints identified
- [x] Backend: PATCH OT field lock — check planning_group S-ABF/CS-ABF instead of !RECALL
- [x] Backend: open-form eligible agents — filter to S-ABF & CS-ABF Agents only
- [x] Backend: autoOpenOtForms cron — only S-ABF & CS-ABF PGs
- [x] Frontend app.js: OT column lock — S-ABF & CS-ABF Agents only (both locked-row and unlocked-row paths)
- [x] Frontend input-portal.js: OT column lock — S-ABF & CS-ABF Agents only
- [x] Frontend billing.js: OT Dashboard tab visibility — show only for S-ABF & CS-ABF employees
- [x] Frontend billing.js: OT Dashboard PG dropdown — only S-ABF & CS-ABF
- [x] Frontend helm.js: OT Request visibility in Task Board — S-ABF & CS-ABF Agents only
- [x] Frontend helm.js: OT submission guard — S-ABF & CS-ABF Agents only
- [x] Bumped all cache-busting to ?v=101
- [x] Backend verified: S-ABF Agent blocked (403), RECALL Agent allowed (200), Team Lead allowed (200)

## Batch 101b — Fix Unlocked WO/PL Records from 04/09 Onward
- [x] Investigate: 132 unlocked WO/PL records found (out of 1,916 total from 04/09+)
- [x] Fix: set is_locked=true on all 132 records (0 errors)
- [x] Verify: confirmed 0 unlocked WO/PL remaining from 04/09+

## Batch 102 — Alerts Restyle & UPL/LATE Notification Fixes
- [x] Restyle Alerts sidebar notification cards (larger icons, tag badges, better spacing, polished detail overlay)
- [x] UPL alert: send to the tagged agent first, then to their supervisor (via name→OHR lookup)
- [x] LATE alert: send to the tagged agent first, then to their supervisor (via name→OHR lookup)
- [x] UPL alert: include reason and remarks in metadata + detail card
- [x] LATE alert: include reason and remarks in metadata + detail card
- [x] Absent alert: send to agent first, then supervisor (frontend notifyAbsentTag updated)
- [x] Added getNotifTagLabel() for type-based tag badges on sidebar cards
- [x] Bumped cache-busting to ?v=102

## Batch 102b — Fix Risk Intelligence Month Filter Refresh
- [x] Bug: Month dropdown change doesn't immediately refresh data (requires page switch)
- [x] Bug: Nav badge shows "0" instead of actual alert count after month change
- [x] Fix: applyAlertFilters() now calls updateAlertNavBadge() after renderAlerts()
- [x] Fix: New updateAlertNavBadge() computes filtered count respecting month/week filters
- [x] Fix: populateAlertFilterDropdowns() now preserves user-selected filters instead of resetting to current month

## Batch 102c — Fix Risk Intelligence Week Dropdown + Nav Badge
- [x] Week Ending dropdown auto-filters to show only weeks whose Sun-Sat span overlaps the selected month
- [x] Nav badge count updates via updateAlertNavBadge() after every applyAlertFilters() call
- [x] When month changes, week resets to "All Weeks" if current selection doesn't overlap
- [x] Added getAllWeekEndings() and getWeeksForMonth() helper functions
- [x] populateAlertFilterDropdowns() now uses month-aware week filtering on init too

## Batch 102d — Fix Risk Intelligence Async Data Load Race Condition
- [x] Bug: Switching months doesn't populate data immediately
- [x] Bug: Nav badge stays at 0 after month switch
- [x] Root cause: loadAllDataForAlerts() only called renderAlerts() without loading data for selected month
- [x] Fix: loadAllDataForAlerts() now calls await applyAlertFilters() to load data + render
- [x] Fix: onchange handlers use void applyAlertFilters() for proper async invocation
- [x] Bumped cache-busting to ?v=102d

## Batch 102e — Fix Risk Intelligence Render Chain
- [x] Bug: Data only renders after clicking a tab button, not on month switch or page load
- [x] Root cause 1: switchView didn't await loadAllDataForAlerts() — fire-and-forget
- [x] Root cause 2: filterAlertsByRole used r.supervisor instead of r.flm — Team Lead saw 0 alerts
- [x] Root cause 3: currentUser missing planning_group/complete_planning_group fields
- [x] Root cause 4: updateAlertNavBadge didn't apply role-based filtering
- [x] Fix: Added await to loadAllDataForAlerts in switchView
- [x] Fix: loadAllDataForAlerts calls populateAlertFilterDropdowns first, defaults to current month
- [x] Fix: currentUser now includes planning_group, complete_planning_group, actualPlanningGroup
- [x] Fix: filterAlertsByRole uses r.flm instead of r.supervisor
- [x] Fix: updateAlertNavBadge now applies same role-based filtering as renderAlerts
- [x] Removed debug console.log statements
- [x] Bumped cache-busting to ?v=102e3

## Batch 102f — Fix Risk Intelligence Completely Broken After 102e
- [x] Bug: Tabs not rendering, data not loading, page is blank after 102e changes
- [x] Root cause: Lines 2362-2363 in applyAlertFilters accessed dash-start-date/dash-end-date .value without null checks — crashed the entire async function before renderAlerts() could run
- [x] Fix: Added null-safe checks (dashStartEl/dashEndEl) before setting .value
- [x] Bumped cache-busting to ?v=102f

## Batch 102g — Fix Risk Intelligence (Console Errors)
- [x] Root cause 1: omnibarState.filters.filter is not a function (app.js:2371) — omnibarState.filters not yet an array when alerts load
- [x] Fix: Added Array.isArray(omnibarState.filters) guard before calling .filter()
- [x] Root cause 2: ADMIN_OHR already declared (maintenance.js + admin.js both use const ADMIN_OHR)
- [x] Fix: Moved maintenance.js before admin.js in script load order, removed duplicate const from admin.js
- [x] Bumped all cache-busting to ?v=102g

## Batch 103 — UPL Violations: Show Dates + Supervisor
- [x] Update detectUPLViolations to collect UPL dates (sorted, formatted MM/DD) and supervisor (from r.flm)
- [x] Update alert card rendering to display Supervisor and UPL Dates below each UPL Violations card
- [x] Added .alert-card-meta and .alert-meta-label CSS styles
- [x] Bumped data.js, app.js, styles.css cache-busting to ?v=103

## Batch 103b — Add Metadata to All Risk Intelligence Alert Cards
- [x] NCNS Pipeline: add NCNS dates (MM/DD sorted) and supervisor
- [x] Offboarding Risk: add consecutive UPL dates and supervisor
- [x] Weekly Late: add late dates and supervisor
- [x] Monthly Late: add late dates and supervisor
- [x] Active ML: add ML dates and supervisor
- [x] Update alert card rendering — generic metadata display for all categories (supervisor + labeled dates)
- [x] Bumped data.js, app.js cache-busting to ?v=103b

## Batch 104 — Add Blank/Clear Option to Tag Dropdown
- [x] Add a blank/clear option to the Tag column dropdown in Input Portal for clearing mistaken logs
- [x] Ensure backend PATCH accepts empty string for tag field (already supported)
- [x] Bump cache-busting to ?v=104

## Batch 105 — Apply Tag Loading Indicator
- [x] Add loading state to bulk "Apply Tag" button: change text to "Applying..." with spinner while processing
- [x] Bump cache-busting to ?v=105

## Batch 106 — Bulk Select Checkbox & Blank Tag Improvements
- [x] Header checkbox (topmost) should select/deselect all tickable (non-locked) rows in current filter
- [x] Remove the separate "Select All" checkbox from the bulk select toolbar
- [x] Add blank option to bulk tag dropdown to clear tags on selected rows
- [x] Bump cache-busting to ?v=106

## Batch 107 — Remove PL Column from Shift Breakdown
- [x] Remove PL column from Shift Breakdown modal table
- [x] Bump cache-busting to ?v=107

## Batch 108 — Asset Inventory Date from Filter End Date
- [x] Update Asset Inventory & Endorsement modal DATE to use end date of current date range filter
- [x] Bump cache-busting to ?v=108

## Batch 109 — Asset Inventory Should Follow Dashboard Filters
- [x] Ensure Asset Inventory modal uses getFilteredDashboardRecords() so it respects all dashboard filters (FLM, PG, Day, date range)
- [x] Bump cache-busting to ?v=109

## Batch 110 — Fix Asset Inventory Not Responding to Multi-Select Filters
- [x] Debug why Asset Inventory counts don't change when planning group or FLM filters are modified
- [x] Bump cache-busting to ?v=110

## Batch 111 — Rename Task Board Request Type Label
- [x] Replace "Attendance Backdated Change Tag" with "I want to change an already locked tag on a previous date." in Task Board New Request form
- [x] Bump cache-busting

## Batch 112 — OT Column Editable for Dates <= 04/10
- [x] Make OT column in Input Portal editable for all dates up to and including 2026-04-10; new OT mechanism applies only after that
- [x] Bump cache-busting

## Batch 113 — Remove Extra Locks & Restrict PL Tag
- [x] Remove all Input Portal locks except the 11 AM PHT daily cutoff lock
- [x] Restrict PL tag option to Managers and OHR 740045023 only — hide from all other users
- [x] Bump cache-busting

## Batch 113b — Restore dates-before-yesterday lock
- [x] Restore "dates before yesterday are always locked" rule in isRowLocked
- [x] Bump cache-busting

## Batch 114 — Input Portal Redesign (Stylized Compact Table)
- [ ] Redesign table to 3 compact columns: Employee (name+role badge), Tag (color chip), Date
- [ ] Implement expandable detail row (accordion) with tag editing, agent info, OT, remarks, audit
- [ ] Add micro-animations: row hover lift, expand/collapse smooth transition, tag chip colors
- [ ] Reimagine bulk edit UX with selection mode toggle and floating action bar
- [x] Preserve all existing functionality: filters, save, undo, export, OT lock, PL restriction, audit timeline
- [ ] Add CSS for new compact table layout and animations
- [ ] Bump cache-busting
