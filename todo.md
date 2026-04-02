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
