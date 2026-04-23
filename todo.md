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
- [x] Implement expandable detail row (accordion) with tag editing, agent info, OT, remarks, audit
- [ ] Add micro-animations: row hover lift, expand/collapse smooth transition, tag chip colors
- [ ] Reimagine bulk edit UX with selection mode toggle and floating action bar
- [x] Preserve all existing functionality: filters, save, undo, export, OT lock, PL restriction, audit timeline
- [x] Add CSS for new compact table layout and animations
- [ ] Bump cache-busting

## Batch 115 — Input Portal Visual Polish & Animations
- [x] Refined color palette across entire Input Portal page
- [x] Responsive layout for mobile/tablet/desktop breakpoints
- [x] Fluid hover and click micro-animations on all interactive elements
- [x] Premium visual feel — shadows, gradients, transitions
- [x] Ensure filter bar, pagination, and toolbar are responsive

## Batch 116 — Input Portal Functionality Audit & Fix
- [ ] Audit all function references between input-compact.js, input-portal.js, and app.js
- [ ] Fix broken or incorrectly wired functions
- [ ] Verify filters, editing, saving, bulk ops, pagination all work end-to-end

## Batch 117 — Input Portal Filter Bar Audit & Fixes
- [x] Audit all filter bar functionalities (date range, multi-selects, sort, blanks toggle)
- [ ] Fix broken filter logic and wiring to compact table renderer
- [ ] Verify all filters apply correctly and re-render the table

## Batch 118 — Filter Dropdown Z-Index Fix
- [x] Fix filter dropdowns being hidden behind other elements in Input Portal

## Batch 119 — Inline Audit Trail in Detail Panel
- [x] Embed inline audit trail section within each compact detail panel (below Status/Billing/PG row)
- [x] Async fetch audit trail data on row expand with caching (auditCache)
- [x] Render timeline entries with action icons, field changes, old/new values, actor, and timestamps
- [x] Add CSS for inline audit trail (timeline, entries, spinner, empty state, animations)
- [x] Wire audit cache invalidation in handleCellEdit (confirmSave) for fresh data after edits
- [x] Wire audit cache invalidation in bulk tag operations (input-portal.js and input-compact.js)
- [x] compactRefreshDetailPanel re-fetches audit trail after panel re-render
- [x] Increase detail-panel max-height from 420px to 800px to accommodate audit trail section
- [x] Add missing CSS custom properties (ip-bg-hover, ip-bg-card, ip-fg-primary)
- [x] Bump cache versions to v=119

## Batch 120 — SME Save Not Reflecting Fix
- [x] Root cause: serverPagState.rows (server-side pagination cache) not synced after edits/saves
- [x] Fix handleCellEdit: sync serverPagState.rows on every cell edit
- [x] Fix confirmSave: sync serverPagState.rows + re-fetch current page via serverPageChange()
- [x] Fix bulkApplyTag (input-portal.js): sync serverPagState.rows + re-fetch
- [x] Fix fcbApplyTag (input-compact.js): sync serverPagState.rows + re-fetch
- [x] Fix handleUndoAll: sync serverPagState.rows from restored originalRecords
- [x] Bump cache versions to v=120

## Batch 121 — Anchor Dashboard UI Restyling
- [x] New color palette: dark navy-charcoal gradient, frosted glass cards, neon KPI accents
- [x] KPI cards: colored top accent bars (red=shrinkage, coral=UPL, blue=PL, amber=late), glow orbs
- [x] Animated number counters (ease-out cubic, 900ms duration)
- [x] Staggered card entrance animations (dashCardReveal keyframes)
- [x] Hover effects: card lift + shadow expansion + glow, table row highlight
- [x] Pulse animation on critical shrinkage KPI (>5%)
- [x] Dark-themed data tables (shift breakdown, supervisor wise, asset inventory)
- [x] Shift section headers with cyan accent, overall rows with emphasis background
- [x] Filter bar: dark glass pills with hover/active states
- [x] Clear Filters button: red accent styling
- [x] Record count badge: cyan accent
- [x] Custom scrollbars for data containers
- [x] Fullscreen overlay dark backdrop
- [x] Responsive breakpoints (1200px, 768px)
- [x] MutationObserver animation guard to prevent infinite re-entry loop
- [x] Dashboard title gradient text effect
- [x] Created dashboard-restyle.css (dedicated CSS file)
- [x] Created dashboard-anim.js (dedicated animation module)

## Batch 121b — Dashboard Light Theme Rework
- [x] Rework dashboard-restyle.css from dark mode to polished light theme
- [x] Preserve all animations, hover effects, and structural improvements
- [x] Update color palette: light background, dark text, accent colors adjusted for light context
- [x] Test in browser and verify readability

## Batch 122 — Billing Compliance V2 System
- [x] Create io_srt_bill database table (date, ohr_id, srt_id, billing_name, srt_status, actual_vs_projection, role, planning_group)
- [x] Create io_billing_targets_v2 database table (week_ending, planning_group, role, target_hc, target_hours)
- [x] POST /api/io/srt-bill/upload — parse XLSX batch, upsert into io_srt_bill
- [x] POST /api/io/billing-targets-v2 — upsert targets
- [x] GET /api/io/billing-targets-v2 — query targets by week_ending
- [x] GET /api/io/billing-compliance-v2/:weekEnding — core compliance engine (join SRT + attendance + targets)
- [x] Admin Tools: SRT Billing Upload panel with file upload and status badge
- [x] Admin Tools: Billing Targets V2 editor (editable table per week x PG x Role, + New Week, Copy from Previous)
- [x] Billing Compliance V2 page: week selector, placeholder message when no data
- [x] Billing Compliance V2 page: main compliance table (PG x Role with all columns)
- [x] Billing Compliance V2 page: daily drill-down panel on row click
- [x] Billing Compliance V2 page: color coding (At Risk red, Met green, Surplus blue)
- [x] Billing Compliance V2 tab added to existing Billing Compliance page (3rd tab)
- [x] Employee sync: SRT upload updates io_employees planning_group and actual_role from latest SRT data
- [x] Test end-to-end: all 6 API endpoints verified, Admin Tools panels render, V2 tab functional

## Batch 122b — SRT Billing Upload Performance Fix
- [x] Diagnose slow SRT Billing Upload (V2) — root cause: row-by-row INSERT for 10,041 rows
- [x] Optimize upload handler: bulk INSERT (500 rows/SQL), client batch 1000, skipSync on intermediate batches
- [x] Benchmarked: 10,003 rows uploaded in 6.8 seconds (was >30s before)

## Batch 123 — Attendance Detail Panel Revisions
- [x] Add role and planning_group columns to io_attendance table (per-day fields)
- [x] Update backend: return role/PG in attendance detail API, accept role/PG edits in save endpoint
- [x] Track role/PG changes in audit trail
- [x] Restructure detail panel layout: details (Tag, Reason, OT Hours, Role, PG, etc.) on left, Audit Trail on right
- [x] Add Role dropdown (specific options: Agent, Operational SME, Quality & Policy Expert, Team Lead, Manager)
- [x] Add Planning Group dropdown (specific options: S-ABF, CS-ABF, RM_CTR, FAD_CTR, QPE_CTR, SME_CTR, MULTIPLE)
- [x] Role/PG edits are part of "Edit" workflow — only saved on "Save Changes" click
- [x] Remove Billing Compliance V2 tab from Billing Compliance page

## Batch 124 — Input Portal & Task Board Fixes
- [x] Auto-populate Role and Planning Group per attendance day from employee data
- [x] Remove all Managers from Input Portal attendance list (exclude_managers filter + DB cleanup)
- [x] Fix locking: removed is_locked enforcement from PATCH and bulk-tag, only date-based 11 AM PHT + previous day lock remains
- [x] Remove Billing Code from detail panel, table columns, filters, sort, and edit section
- [x] Fix Task Board: ALL agents now see OT Request form on New Request (was only S-ABF/CS-ABF)

## Batch 125 — Internal Role/PG Fields in Attendance Detail
- [x] Add internal_role and internal_planning_group columns to io_attendance table
- [x] Backfill internal_role/internal_planning_group from io_employees for all existing records (44,900 rows)
- [x] Rename existing "Role" and "Planning Group" labels to "Billing Role" and "Billing Planning Group"
- [x] Add read-only "Internal Role" and "Internal Planning Group" fields in detail panel
- [x] Update normalizeRecord to include internal_role and internal_planning_group

## Batch 126 — Billing Compliance Dashboard Rebuild
- [x] Seed billing targets from screenshot into io_billing_targets_v2 table
- [x] Build compliance engine API: GET /api/io/billing-compliance (weekly compliance for 11 PG×Role combos)
- [x] Compliance %: delivered hours (P/Late/OT × 7.5) vs target hours
- [x] Goal to 98%, 100%, 102%: signed hour deltas
- [x] Predictive UPL: YTD weekly avg UPL rate per PG×Role, projected for remaining days
- [x] Predictive OT: YTD weekly avg OT hours per PG×Role, projected for remaining days
- [x] OTs needed: additional OT hours to close gap to target
- [x] HC needed: additional headcount (full shifts) to close gap to target
- [x] Rebuild Billing Compliance tab frontend: KPI summary cards + compliance table
- [x] Traffic light system (green ≥100%, amber 95-99.9%, red <95%)
- [x] Progress bars with 98%/100%/102% markers
- [x] Signed deltas with color coding
- [x] Row click drill-down: day-by-day breakdown
- [x] Retain OT Dashboard tab as-is
- [x] Ensure Saturday-Friday workweek scheme across all Playbook features

## Batch 127 — Billing Compliance Polish + Supervisor Realignment
- [x] Fix progress bar number overlap (98/100/102 markers overlapping)
- [x] Remove "Any" role label from PG-only combos (QPE_CTR, SME_CTR)
- [x] Remove "Billing Dashboard" tab — merge into single page with OT Dashboard as section below compliance table
- [x] Restyle OT Dashboard with modern UI improvements
- [x] Update 15 agent supervisor realignments effective April 7, 2026 (io_employees + historical attendance)
- [x] Update Renier Marilao → Cris Dacanay David as supervisor effective Feb 23, 2026 (io_employees + historical attendance)

## Batch 128 — Planning Group Realignment for New Alignees
- [x] Set planning_group to S-ABF for agents under Galula, Bantasan, Escamillas, Abiang, Javier (io_employees + historical attendance from Apr 7)
- [x] Set planning_group to CS-ABF for agents under Esmino, Natividad (io_employees + historical attendance from Apr 7)

## Batch 129 — UPL/PL Days in Billing Compliance Table
- [x] Update backend API to return upl_days and pl_days per PG×Role per week
- [x] Add UPL Days and PL Days columns to compliance table (after Target Hours, before Compliance %)
- [x] Add UPL/PL counts to drill-down summary stats
- [x] Include UPL/PL in the TOTAL row

## Batch 130 — Blanks Count as P in Billing Compliance
- [x] Treat blank/null tags as 'P' (billable) in the compliance engine

## Batch 131 — Perpetual Billing Targets + Admin Editor
- [x] Update compliance engine to carry forward targets perpetually (use most recent known targets for any week without explicit targets)
- [x] Build admin-only billing targets editor API (GET/PUT, restricted to OHR 740045023)
- [x] Build admin-only billing targets editor UI on the Billing Compliance page
- [x] Targets editable per PG×Role with effective date support

## Batch 132 — OT Approval Visibility Fix + Pred Rounding
- [x] Fix OM (740030270) not seeing OT approval controls on the OT Dashboard
- [x] Round Pred. UPL and Pred. OT to whole numbers in the compliance table

## Batch 133 — Attendance Tag Fixes + Roster Corrections
- [x] Fix 4 tag discrepancies (follow Sheet tag): Gabrillo LATE, Fernandez LATE, Cabural LATE, Amurao EXIT
- [x] Fix 23 conflicting tag discrepancies (follow Sheet tag, except blanks follow DB tag)
- [x] Generate full OT hours discrepancy report (all 107 mismatches)
- [x] Update Poblete (740032326) from Inactive to Active in io_employees
- [x] Update Reyes (740044575) role to Trainer in io_employees

## Batch 134 — DB → Google Sheets Attendance Sync
- [x] Build sync script: push io_attendance data to ATTEND_26 sheet (from 04/04/26 onward)
- [x] Handle existing rows (update) and new rows (append)
- [x] Map all 16 columns correctly (Concat, Tag, Billing Code, UPL Reason, Remarks, OT, Date, OHR, Agent, FLM, Role, PG, Shift, Status, Week Ending, Month)
- [x] Schedule twice-daily sync at 1:30 AM and 4:30 PM PHT
- [x] Test the sync with a dry run

## Batch 135 — Server-side Attendance Sync (node-cron)
- [x] Install node-cron dependency and wire into server
- [x] Build server-side sync module delegating to Python script with GWS token file auth
- [x] Wire cron jobs into server startup: 1:30 AM and 4:30 PM PHT
- [x] Add manual trigger endpoint (POST /api/io/sync-attendance, admin-only)
- [x] Test end-to-end sync from server (5,412 rows synced, 8 new rows appended)
- [x] Add .bashrc hook to auto-refresh GWS token file on sandbox startup

## Batch 136 — Sync History Page
- [x] Create io_sync_log DB table (id, sync_type, trigger, status, started_at, completed_at, duration_ms, rows_updated, rows_appended, total_db_rows, total_sheet_rows, error_message, output_log)
- [x] Build API endpoints: GET /api/io/sync-log (paginated list), GET /api/io/sync-log/latest (last sync status) — admin-only (OHR 740045023)
- [x] Build Sync History page UI with last sync status indicator card + full log table with expandable detail rows
- [x] Wire gsheets-sync.ts to parse Python script output and write log entries on each sync run (manual + cron triggers)
- [x] Add Sync History nav item visible only to OHR 740045023 (both login paths)
- [x] Add sync-history.css with status card, table, badge, toast, and pagination styles
- [x] Test end-to-end: manual sync trigger → log written → API returns correct data (2 test runs verified)

## Batch 137 — Move Sync History under Anchor
- [x] Move Sync History nav item from sidebar bottom into Anchor collapsible group
- [x] Update switchView anchorViews array to include sync-history
- [x] Remove standalone sync-history nav from sidebar bottom (kept only inside Anchor group)

## Batch 138 — Fix Absence Alert Routing
- [x] Investigate auto-mailer logic: backend routing is correct (agent + supervisor only)
- [x] Fix frontend filter: removed admin bypass in notifications.js line 123 that showed ALL targeted notifications to OHR 740045023
- [x] Admin (740045023) now only sees notifications targeted to their own OHR or broadcast notifications

## Batch 139 — Remove All GChat Functionality
- [x] Remove GChat card builder (buildUplLateGchatCard) and queue insertions from auto-mailer.ts
- [x] Remove gchat-notify-supervisor and gchat-notify-task endpoints from io-routes.ts
- [x] Remove GChat queue insertions from OT open-form and auto-open flows in io-routes.ts and auto-mailer.ts
- [x] Remove ioGchatQueue import from io-routes.ts (schema table kept for DB compatibility)
- [x] Remove gchat_space_id from employee select queries in auto-mailer.ts
- [x] Remove GChat ID column from roster.js table and detail modal
- [x] Remove GChat notification calls from helm.js (task assignment + supervisor backdate)
- [x] Update tests in batch15, batch25, batch26 to verify GChat removal
- [x] All 303 tests passing

## Batch 140 — Billing Sheet Sync + Admin Tools Cleanup
- [x] Add actual_vs_projection column to io_attendance schema + migration
- [x] Build server-side billing sync endpoint (reads BILLING Google Sheet, updates matching io_attendance rows with role, planning_group, snap_billing_name, snap_status, actual_vs_projection)
- [x] Rewrite gws CLI call from execSync (hung on 2MB output) to async exec with 10MB maxBuffer — sheet reads in ~1.5s
- [x] Rewrite batch UPDATE from row-by-row (hung for 20+ min on 10K rows) to temp table + UPDATE JOIN — completes in ~7s
- [x] Add composite index idx_ohr_date on io_attendance(ohr_id, log_date) for fast JOIN lookups
- [x] Add unique index idx_srt_date_ohr on io_srt_bill(date, ohr_id) for ON DUPLICATE KEY UPDATE
- [x] Add "Sync Billing Data" card in Admin Tools with status indicator + run button
- [x] Remove all CSV file upload functionality from Admin Tools (SRT upload + Billing CSV upload already removed)
- [x] Fix planning group long-to-short code mapping (MASA_MAFSA_CTR_SCALED_REVIEW → S-ABF, CEI_TASKFORCE_CTR → CS-ABF)
- [x] Log billing sync runs to io_sync_log (sync_type: billing_sheet)
- [x] Fix admin.js sync_type filter mismatch (billing-sheet → billing_sheet)
- [x] Sync latest Actuals data back to io_employees (planning_group + actual_role)
- [x] Upsert all billing rows into io_srt_bill for historical tracking
- [x] First successful run: 10,041 sheet rows → 9,979 attendance updated, 3 employees synced, 20,082 SRT bill upserted in 97s
- [x] All 303 tests passing
## Batch 141 — Remove Billing Code System Entirely
- [x] Drop billing_code column from io_attendance schema + DB migration
- [x] Drop billing_code column from io_srt_bill schema + DB migration
- [x] Remove dead YTD endpoints (/billing-ytd, /billing-ytd-weekly) from io-routes.ts
- [x] Remove billing_code_in filter from attendance GET endpoint
- [x] Remove billing_code from attendance save/edit/export flows in io-routes.ts
- [x] Remove BILLING_CODE_DESC_MAP and billing code edit functions from app.js
- [x] Remove billingCode from column visibility map and field mappings in app.js
- [x] Remove "Billing Code" filter from dash-omnibar.js
- [x] Remove billing_code_edit notification type from notifications.js
- [x] Remove billingCode from data.js data layer
- [x] Remove orphaned .billing-code-* and .billing-doughnut-* and .billing-ytd-* CSS
- [x] Run tests and verify all 301 tests pass (2 billing code tests correctly removed)
## Batch 142 — Fix DB→Sheet Sync Script (Lost on Sandbox Hibernation)
- [x] Recreate sync-attendance-to-gsheets.py inside project directory (was at /home/ubuntu/ outside repo)
- [x] Update column mapping: remove Billing Code column (now 15 cols A-O instead of 16 A-P)
- [x] Update gsheets-sync.ts to use path.join(__dirname) for script path (survives hibernation)
- [x] Inject GOOGLE_WORKSPACE_CLI_TOKEN from token file into subprocess env
- [x] Fix gws CLI syntax: --body → --json for update/append calls
- [x] Optimize updates: contiguous range grouping with 200-row batch cap (26 API calls vs 5120 row-by-row)
- [x] First successful run: 5120 updated + 7641 appended in 51.4s (12761 DB rows synced)

## Batch 143 — OT Cancellation with Waitlist Redistribution
- [x] Add cancel OT endpoint (POST /api/io/ot-requests/:id/cancel)
- [x] On cancel: set OT request status to "cancelled", remove OT from attendance row
- [x] On cancel: auto-redistribute OT slot to next pending agent in same PG (FIFO)
- [x] Apply redistributed OT to next agent's available shift (reuses findOtDay logic — skips WO/leave/past days)
- [x] Send ot_cancelled notification to cancelling agent
- [x] Send ot_applied notification to newly approved agent + supervisor
- [x] Add "Cancel OT" button in Task Board detail view (approved OT requests only, requesting agent only)
- [x] Guard: only requesting agent or admin can cancel; only approved status cancellable
- [x] All 301 tests passing; guard rails verified (404 non-existent, 400 wrong status)

- [x] Fix: "initBillingCodeEdit is not defined" error when filtering planning group in Compass Input Portal

## WFM Missing Attendance — Apr 2026
- [x] Insert 32 missing attendance records for OHRs 740053907, 740054053, 740041868, 740052326 (WO stays WO, all others P)
- [x] Update all "Nesting" employees to "Active" status in io_employees (15 employees updated)

## Compass Overhaul — Phase 1 (Foundation)
- [x] Create 5 new tables: compass_coaching_logs, compass_dispute_events, compass_ca_cases, compass_ca_timeline, compass_violation_catalog
- [x] Seed violation catalog from GPHR Policy v3.0 (132 violations across 7 categories)
- [x] Build tRPC procedures: coaching CRUD with role-based visibility (13 procedures)
- [x] Build tRPC procedures: QA Feedback dispute workflow (6-level escalation, server-enforced)
- [x] Build tRPC procedures: acknowledgement workflow
- [x] Build React frontend: Coaching Logs list with server-side pagination/filtering
- [x] Build React frontend: Coaching Log detail view with dispute actions
- [x] Build React frontend: New Coaching Log form (all 6 types)
- [x] Build React frontend: QA Disputes Kanban board
- [x] Build React frontend: Acknowledgement UI with privacy model
- [x] Migrate existing io_coaching data to new compass_coaching_logs schema (2005 logs, 28 dispute events)
- [x] Write vitest tests for coaching CRUD and dispute procedures (35 tests, all passing)

## Compass Overhaul — Phase 2 (CA Cases)
- [x] Build CA Cases tRPC procedures: CRUD, lifecycle transitions (Incident→NTE→Response→Hearing→NOD→CAP→Active→Closed)
- [x] Build attendance violation progression tracker (continuous, no cut-off, resets on CAP 1+ served)
- [x] Build DOCX generation from legal templates (NTE, CAP 0-3, CAP w/o Explanation Letter)
- [x] Build CA Cases React frontend: case list, detail view with timeline, new case form
- [x] Wire signed document upload requirement before case advancement
- [ ] Import existing violations from Google Sheet as historical CA cases

## Compass Overhaul — Phase 3 (AI CAP Assistant)
- [x] Build AI CAP Assistant backend: LLM advisory analyzing full employee history against GPHR Policy v3.0 (2 procedures: recommend + chat)
- [x] Build AI CAP Assistant React frontend: conversational page with employee context panel and quick prompts
- [x] Write vitest tests for CA and AI procedures (48 tests, all passing)

## Compass Integration into Legacy Anchor
- [ ] Replace old Compass sidebar items (Coaching Profile, Disputes Area) with new pages
- [ ] Port new Compass pages to vanilla JS within Anchor framework: Dashboard, Coaching Logs, QA Disputes, CA Cases, AI Assistant
- [ ] Wire all new pages to use existing tRPC/API endpoints
- [ ] Verify all pages render correctly in Anchor layout

## Compass Legacy Integration — Anchor Sidebar Replacement

### Backend: Compass REST API Bridge (compass-routes.ts)
- [x] Create Express REST routes for all Compass endpoints under /api/io/compass/*
- [x] Coaching CRUD: list, detail, create, acknowledge, dispute
- [x] CA Cases CRUD: list, detail, create, transition, generate-document, upload-signed
- [x] QA Disputes: list with status filtering
- [x] AI endpoints: recommend (CAP advisory), chat (policy Q&A)
- [x] Reference data: RCA catalog, ZTP catalog, violations catalog, attendance summary
- [x] Analytics endpoint: aggregated coaching + CA stats
- [x] Register compass-routes in Express server (_core/index.ts)

### Frontend: Sidebar Navigation Update
- [x] Replace old Compass nav items (Coaching Profile, Disputes Area) with 5 new items
- [x] New nav items: Dashboard, Coaching Logs, QA Disputes, CA Cases, AI Assistant
- [x] Update role-based visibility: Compass visible to ALL roles, CA Cases hidden from Agents, AI Assistant visible to TL/Manager/SME
- [x] Update switchView() with 5 new compass view IDs
- [x] Update view titles mapping

### Frontend: View Containers (index.html)
- [x] Replace old compass-input and compass-disputes view containers
- [x] Add 5 new view containers: compass-dashboard, compass-coaching, compass-disputes, compass-ca, compass-ai
- [x] Each container has loading overlay and detail/form overlays

### Frontend: Vanilla JS Files
- [x] compass-dashboard.js — Analytics summary with stat cards and quick actions
- [x] compass-coaching.js — List, detail, new form, acknowledge, RCA cascading dropdowns
- [x] compass-disputes-v2.js — Kanban board with 6-level escalation
- [x] compass-ca-cases.js — Full lifecycle management with transitions, doc generation, signed upload
- [x] compass-ai-assistant.js — Chat interface with quick prompts and markdown rendering

### Script Tags
- [x] Replace old compass.js and compass-omnibar.js script tags with 5 new JS files

## Bug Fix — Published Site Blank Page
- [ ] Fix: Compass section loads but sub-pages (Dashboard, Coaching, Disputes, CA Cases, AI Assistant) render blank content on published site

## Revert Compass to Original State (User Request)
- [x] Revert sidebar nav: restore old 2 Compass items (Coaching Profile, Disputes Area)
- [x] Revert view containers: restore old compass-input and compass-disputes views
- [x] Revert script tags: restore old compass.js and compass-omnibar.js
- [x] Revert switchView function: remove 5 new compass cases, restore old 2
- [x] Revert role-based visibility: restore original compass nav visibility logic
- [x] Remove compass-routes.ts registration from Express server

## Cross-Reference Employee Data & Compass Cleanup
- [x] Read Google Sheet employee data (roles, planning groups)
- [x] Query io_employees and cross-reference with Sheet
- [x] Generate discrepancy report for user review
- [x] Clean up Compass-related tables and data from database (5 tables dropped, schema definitions kept)
- [x] Apply 80 field corrections from Google Sheet to io_employees database (51 UPDATE statements, all verified)

## Revisions — April 13
- [x] Fix SRT ID scientific notation formatting in io_employees (402 records updated, 0 remaining)
- [x] Update blank dispute statuses to "Pending SME Review" in io_coaching (44 QA Feedback records updated)
- [x] Remove Reverse Markdown / Retain Markdown buttons from QA Feedback coaching logs in Coaching Profile
- [x] Copy Input Portal filtering style (persistent pill-based filter bar) to Coaching Profile
- [x] Re-run DB to G Sheet sync for ATTEND_26 (3 employees missing: 740053907, 740041868, 740052326)

## Revisions — April 13 (Batch 2)
- [x] QA Feedback: Hide Acknowledgement section when status is not acknowledgement-related (e.g. Markdown Dispute, QA Decision Rejected)
- [x] Filter bar: Move Add button to first position (leftmost), filters to its right
- [x] Filter bar: Fix empty dropdown choices when clicking filter buttons (values sourced from COMPASS.logs after fetch)
- [x] Root Cause Analysis: Indent values to fix L3 Contributing Cause alignment issue (min-width 140→170px)
- [x] Delete 5 experimental QA Feedback logs (CL-b7c94265, CL-57b90f69, CL-d49ae370, CL-9e5011b6, CL-e4063022)
- [x] Rename "General Coaching" to "CAP 0 Coaching" everywhere (code + 246 DB records updated)
- [x] Sync History: Wrap error/log text so it doesn't extend too far right (word-break, overflow-wrap, table-layout:fixed)

## Revisions — April 13 (Batch 3)
- [x] Fix empty filter dropdowns in Compass omnibar (root cause: window.COMPASS undefined for const-scoped variable)
- [x] Reduce session goal choices to 8 in alphabetical order
- [x] Add CAP radio group (No CAP, CAP 1, CAP 2, CAP 3) to CAP 0 Coaching and Follow Up Coaching forms
- [x] Create io_coaching_nte table for NTE records linked to coaching logs
- [x] Add cap_level column to io_coaching table
- [x] Build NTE form page with all fields + auto-redirect on CAP 1-3
- [x] Auto-populate previous warnings in NTE form from existing NTEs
- [x] Add NTE view/edit from coaching log detail view (CAP badge + View NTE button)
- [x] Server-side NTE CRUD routes (GET/POST/PATCH /api/io/coaching-nte)

## Revisions — April 13 (Batch 4)
- [x] Delete coaching log CL-53ba172e from DB
- [x] Add CAP radio button for Follow-Up Session (fixed hyphen mismatch: 'Follow Up Session' → 'Follow-Up Session')
- [x] Fix CAP 1-3 → NTE redirect (moved NTE form open before compassCloseForm)
- [x] Migrate old session goals in DB to nearest applicable new goal (1,996 rows updated)
- [x] Filter dropdowns: show all defined options via COMPASS_DEFINED_OPTIONS (Type, Status, Session Goal)

## Revisions — April 13 (Batch 5)
- [x] Fix NTE form not showing after CAP 1-3 selection (root cause: overlay.style.display='' resolved to 'none' from inline default; fixed to 'flex' + converted to async/await)
- [x] Change "Create" button text to "Next" when CAP 1-3 is selected (via compassOnCapLevelChange)

## Revisions — April 13 (Batch 6)
- [x] Fix blank Coaching Profile and Disputes Area pages (stray opening brace at line 3726 from .then() to async/await conversion)

## Revisions — April 13 (Batch 7)
- [x] Fix CAP 1-3 flow: defer coaching log creation until NTE is submitted (COMPASS_PENDING_COACHING_RECORD pattern)
- [x] Optimize Compass page performance: lean API query (5.1MB→1.4MB, 72% reduction), on-demand detail fetch for coaching_details

## Revisions — April 13 (Batch 8)
- [x] Complete visual overhaul of Coaching Profile page — modern, engaging, impressive design
  - [x] Hero stats strip with gradient accents, icons, and hover lift effects
  - [x] Glassmorphism filter bar with indigo Add button and pill badges
  - [x] Elevated dual table panels with 7fr/3fr split and accent headers
  - [x] Color-coded type badges (CAP 0, New Session, Follow Up, QA Feedback, etc.)
  - [x] Compact color-coded session goal badges (inline, truncated)
  - [x] Premium detail overlay with frosted backdrop, section dividers, and indigo accents
  - [x] Redesigned form overlays (inputs, selects, RTE, CAP radio group)
  - [x] Refined pagination, tabs, and subpage tabs
  - [x] Entrance animations (fadeUp, slideIn, countUp)
  - [x] Consistent indigo (#6366F1) accent color system throughout

## Revisions — April 14
- [x] Fix Team Lead Internal Roles in Input Portal (1,685 attendance records corrected: 12 Team Leads + 3 Trainers)
- [x] Grant non-agents visibility on all Anchor pages (Input Portal, Dashboard, Billing Compliance, Risk Intelligence) except Sync History
  - Updated both login and session-restore blocks in app.js
  - Risk Intelligence: was TL/Manager/Trainer only → now all non-agents (QPE included)
  - Billing Compliance: was TL/Manager only → now all non-agents (QPE, Trainer included)
  - Sync History: remains admin-only ✓
- [x] Confirm/fix Billing Role & Planning Group edit permissions for Managers and Team Leads
  - Added Team Lead and Trainer to ROLE_OPTIONS dropdown in compact detail panel
  - Added RECALL_MEASUREMENT_CTR and MULTIPLE to PG_OPTIONS dropdown
  - Server-side PATCH route already accepts role and planning_group — no actor-role restriction exists

## Revisions — April 14 (Batch 2)
- [x] Show Export CSV button for all non-agents (not just admin)
- [x] Restrict PL tag dropdown to Managers + OHR 740045023 + OHR 740044909 only (6 occurrences across input-compact.js, input-portal.js)

## Revisions — April 14 (Batch 3)
- [x] Bulk-update 44 blank-tag attendance records per WFM schedule (16 updated, 28 already had tags)
- [x] Verify alignment with Google Sheet after updates (226 rows synced, 12/12 spot-checks passed)

## Revisions — April 14 (Batch 4)
- [x] Diagnose and fix slow login/loading experience
  - [x] Added /employees/slim endpoint (8 fields vs 41, 104KB vs 462KB — 77% smaller)
  - [x] Parallelized employee + attendance fetch with Promise.all()
  - [x] Eliminated redundant count query for single-day loads
  - [x] Added idx_log_date index on io_attendance for faster date-range queries
  - [x] Deferred 8 non-critical scripts (compass, sandbox, haven, helm, roster, horizon, performance)
  - Result: ~0.26s parallel vs ~0.98s sequential = ~73% faster API load time

## Revisions — April 14 (Batch 5)
- [x] Integrate thinking fox mascot into loading spinner (14 instances: 13 in index.html + 1 in app.js progress bar)
- [x] Integrate waving fox mascot into login page (auth card hero image)
- [x] Integrate shrug fox mascot into empty states (16 instances across 9 JS files)
- [x] All mascot URLs migrated to webdev CDN lifecycle (--webdev flag)

## Revisions — April 14 (Batch 6)
- [x] Replace Playbook logo and favicon with the arctic fox icon face (3 locations: browser tab favicon, login page logo, sidebar logo)

## Revisions — April 14 (Batch 7)
- [x] Enhance fox mascot animations — add lively movement beyond floating
  - [x] Login waving fox: playful sway left-right with hop at peak (mascotWaveHello)
  - [x] Loading thinking fox: head tilt side-to-side with "aha" pop (mascotThinking)
  - [x] Progress bar thinking fox: pacing back-and-forth walk (mascotPacing)
  - [x] Empty state shrug fox: shoulders up, head tilt, bounce, settle (mascotShrugLoop)
  - [x] Sidebar logo fox: subtle idle breathing (mascotBreathe)
  - [x] Loading text: gentle pulse opacity animation (mascotTextPulse)
  - [x] Added prefers-reduced-motion media query for accessibility

## Revisions — April 14 (Batch 8)
- [x] Generate sprite sheet frames for waving fox (5 frames with arm/body movement)
- [x] Generate sprite sheet frames for thinking fox (5 frames with head tilt/paw movement)
- [x] Generate sprite sheet frames for shrugging fox (5 frames with shoulder/arm movement)
- [x] Stitch frames into horizontal sprite sheets (1280x256px each) and upload to CDN
- [x] Update mascot.css with CSS steps() sprite animations (ping-pong loop: 1→2→3→4→5→4→3→2→1)
- [x] Integrate sprite sheet animations into the site (14 HTML + 18 JS = 32 total sprite divs)

## Bug Fix — April 14 (Batch 9)
- [x] Fix incorrect billing compliance calculations after target hours adjustment
  - Root cause: Frontend editor used short role names (SME/QA/TL) and wrong PG (R-ABF) but server expected full names (Operational SME/Quality & Policy Expert) and RECALL_MEASUREMENT_CTR
  - [x] Corrected 7 target records in DB for week 2026-04-17 (renamed roles + PG)
  - [x] Fixed BILLING_PG_ROLE_COMBOS in billing.js to use full role names matching attendance data
  - [x] Frontend and server-side PG_ROLE_COMBOS now aligned (11 combos each)
  - Result: Total compliance went from 202.2% (wrong) to 109.4% (correct)

## Billing Targets Editor Overhaul

- [x] Remove CS-ABF × TL and R-ABF × SME from billing target combos (not billing groups)
- [x] Rename R-ABF × Agent to just RECALL_MEASUREMENT_CTR
- [x] Add CSO_CTR and FAD_CTR billing groups with 185 target hours each
- [x] Remove Target HC column from billing targets editor
- [x] Stylize the billing targets editor table
- [x] Ensure billing targets editable by OHR 740045023, OHR 740044909, and Managers

## Billing Targets — Manager Visibility Fix
- [x] Fix Edit Targets button not visible to Managers in Billing Compliance (verified — already working correctly)

## Admin Tools Cleanup & Compass Performance Fix
- [x] Remove "Upload Productivity Hours" section from Admin Tools
- [x] Remove "Billing Targets V2" section from Admin Tools
- [x] Fix Compass form lag/latency when filling the coaching form

## Coaching Profile — Role-Based Visibility Rules
- [x] Managers: see all coaching logs (verified: 1998 Given, 0 Received)
- [x] Team Leaders: see logs filed to their team (regardless of coach) + logs filed to them (verified: 44 Given, 1 Received)
- [x] SMEs: see logs filed to their TL's team + logs filed to them (verified via DB: 120 Given, 9 Received)
- [x] QAs & Trainers: see logs they filed + logs filed to them (verified via DB: 9 Given, 7 Received)
- [x] Agents: see only logs filed to them, hide Add button (verified: 6 Received, no Add button, no Given panel)

## Coaching Profile — Admin View Toggle
- [x] Add toggle for admin (740045023) to switch between "All Logs" and "TL View" in Coaching Profile (verified: All=1998, MyTeam=149)

## Bug Fix — Billing Role/Planning Group Save Failure
- [x] Fix: Saving Billing Role and Billing Planning Group changes fails with an error (root cause: saveRecords in data.js was not including role/planning_group in PATCH payload)

## Public API Endpoint — /api/public/data
- [x] Build GET /api/public/data endpoint exposing io_employees and io_attendance
- [x] Return JSON with items array: { id, title, category, description, url, updatedAt }
- [x] Enable CORS from any origin, no authentication required
- [x] Fix 401 Unauthorized on production /api/public/data endpoint (moved route to index.ts before auth middleware, added API key gating)
- [x] Generate 64-char hex API key and store as PUBLIC_API_KEY env var
- [x] Register /api/public/data route BEFORE auth middleware with X-API-Key check
- [x] Add CORS headers (Access-Control-Allow-Origin: *, Access-Control-Allow-Headers: X-API-Key, Content-Type)
- [x] Test on localhost (all 6 vitest tests pass, 430/430 total)

## Removal — Public API Endpoint & API Key
- [x] Remove /api/public/data route from index.ts
- [x] Remove /api/public/data route from io-routes.ts
- [x] Remove PUBLIC_API_KEY from env.ts
- [x] Remove public-api.test.ts
- [x] Remove PUBLIC_API_KEY env var (set to empty)

## Coaching Log Type Renaming
- [x] Rename all existing "New Session" logs to "General Coaching" in DB (1,497 rows)
- [x] Rename all existing "CAP 0 Coaching" logs to "General Coaching" in DB (248 rows)
- [x] Retain "CAP 0 Coaching" as a category option for violation tracking
- [x] Ensure "General Coaching" is available as a coaching type in the form (default for non-QA)

## Coaching Profile — Major Revisions Batch
- [x] Fix Add form latency in Coaching Profile
- [x] CAP 0 Coaching → Violation Tracker: Agent field (choose 1)
- [x] CAP 0 Coaching → Violation Tracker: Auto-set Session Goal to "Compliance & Behavior"
- [x] CAP 0 Coaching → Violation Tracker: Incident Timestamp (date + time, no seconds)
- [x] CAP 0 Coaching → Violation Tracker: Violation Type (cascading from HR Policy table)
- [x] CAP 0 Coaching → Violation Tracker: Incident Details with rich text
- [x] CAP 0 Coaching → Violation Tracker: Attachments (optional)
- [x] QA Feedback: Add Support Joiner 1 (required, SMEs + TLs)
- [x] QA Feedback: Add Support Joiner 2 (required, SMEs + TLs, excludes Joiner 1)
- [x] Disputes Area: Rename sections to shorter, clearer names
- [x] Disputes LV1: buttons visible to Support Joiner 1 & 2 only
- [x] Disputes LV2: buttons visible to coach only
- [x] Disputes LV3: buttons visible to Support Joiner 1 & 2 only
- [x] Disputes LV4: buttons visible to trainers whose PG matches coachee's PG
- [x] Disputes LV5: buttons visible to Support Joiner 1 & 2 only
- [x] Disputes LV6: buttons visible to QTP Manager Angelo Nieva only
- [x] Disputes ALL: Angelo Nieva has override access to all levels

## Role-Based Visibility & Maneuverability Audit
- [x] Audit: Inventory all non-agent roles and their expected access rules
- [x] Audit: Manager role — page visibility, buttons, actions
- [x] Audit: Team Lead role — page visibility, buttons, actions
- [x] Audit: Operational SME role — page visibility, buttons, actions
- [x] Audit: Quality & Policy Expert (QA) role — page visibility, buttons, actions
- [x] Audit: Trainer role — page visibility, buttons, actions
- [x] Audit: Admin (OHR 740045023) — page visibility, buttons, actions
- [x] Fix any discrepancies found during audit (SME missing Risk Intel + Billing - FIXED)
- [x] Browser verification for each role (all 6 roles tested via browser login)

## Roster Cross-Examination & Inactive Import
- [x] Fetch ROSTER sheet from Google Sheets
- [x] Fetch INACTIVE sheet from Google Sheets
- [x] Export current io_employees from DB
- [x] Cross-examine ROSTER vs io_employees — produce discrepancy report (1 discrepancy: Bernal role mismatch)
- [x] Import INACTIVE employees into io_employees DB tagged as "Inactive" (84 unique imported, 3 dupes skipped)

## Post-Roster Fixes & Attendance Audit
- [x] Update Bernal (740036814) actual_role from "Operational SME" to "Team Lead"
- [x] Clean SRT Name column from newly imported inactive employees (80 rows cleaned)
- [x] Audit all active employees against attendance records — found 45 employees with gaps
- [x] Backfill missing attendance rows for all 45 active non-Manager employees (48,842 total rows, 0 gaps remaining)
- [x] Confirmed Managers exempt from attendance (6 Managers, 0 attendance rows — committed to memory)

## Auto-Attendance & Sheet Sync
- [x] Auto-generate attendance rows when a new employee is added to io_employees (trigger in POST /employees, tested: 16 rows Apr 15→30)
- [x] Sync Bernal's role update (Team Lead) back to the ROSTER Google Sheet (already correct in row 74, col K)
- [x] Remove Bermejo from the INACTIVE Google Sheet (row 55 deleted, confirmed removed)
- [x] Fix 99 inactive employees with NULL srt_status → set to 'Inactive' in DB

## Roster Audit & May Attendance
- [ ] Verify roster integrity — active/inactive counts, Manager exclusions, anomalies
- [ ] Generate May 2026 attendance rows for all active non-Manager employees

## Batch — Sync Fix & Data Integrity

- [x] Fix sync cron: spawn /bin/sh ENOENT error (run #15) — rewrote from Python to native Node.js
- [x] Fix sync auth: No GWS token available error (run #16) — added token file fallback
- [x] Trigger manual DB→GSheet sync for this week — 461 updated, 11719 appended
- [x] Fix 4 conflicting employees: set employement_status='Active' (Poblete, Marcelo, Delen, Sy)
- [x] Fix Bermejo srt_status: Nesting → Production
- [x] Fix Castro srt_status: clean comma-separated billing groups → Production + employement_status → Active + backfill Jan-Apr attendance
- [x] Replace any srt_status='Active' with 'Production'
- [x] Fix Nimer srt_status: Nesting → Production
- [x] Backfill missing Apr 30 attendance for Marcelo, Sy, Delen (1 row each)
- [x] Set Gambito (740031642) employement_status=Inactive
- [x] Set Amurao (740054050) employement_status=Inactive
- [x] Set Almarquez (740049857) employement_status=Inactive
- [x] List the 37 employees with empty Apr 14 tags for user
- [x] Re-sync DB→GSheet after fixes — 0 updates, 0 appends (already in sync)

## Batch — Lambda Cold Start Optimization
- [x] Profile server startup to identify slow imports/init
- [x] Optimize heavy initialization (defer non-critical work) — lazy-loaded googleapis (-1.4s) and xlsx (-0.2s)
- [x] Verify startup time improvement — startup 2.31s (down from ~3.7s), sync still works, 456 tests pass

## Batch — WFM Attendance Backfill (All 321 employees through Apr 30)
- [x] Re-analyze WFM file and cross-reference all 321 employees against DB — all 321 have full Apr 1-30
- [x] Backfill May 1-31 for Gambito (740031642) — only employee missing May rows (31 rows inserted)
- [x] Verify backfill completeness — all 321 now have Jan-May coverage
- [x] Trigger DB→GSheet sync — 31 appended (Gambito May rows)

## Bug — Darryl Castillo locked out but not on Admin locked list
- [x] Diagnose why Castillo is locked but not visible in Admin Tools locked list — client-side failedAttempts lock desynced from DB is_locked
- [x] Fix root cause — added persistLockToDb() with 3x retry, added is_locked===1 check, sync local state from DB
- [x] Unlocked Castillo (740051210) in DB

## Batch — Attrition Data Incorporation
- [x] Add attrition columns to io_employees schema (offboarding_date, resignation_date, relieving_date, exit_date, exit_reason)
- [x] Apply migration to DB
- [x] Insert 13 missing employees from attrition sheet (2025 exits)
- [x] Update srt_status to Exit for 50 Inactive employees
- [x] Update srt_status to Exit + employement_status to Inactive for 11 Active employees (Delen, Marcelo, Sy, Castro, Gonzales, etc.)
- [x] Mark Hernandez and Maraña as Inactive (notice period, not Exit yet)
- [x] Populate attrition details (exit_date, exit_reason, offboarding_date, resignation_date, relieving_date) for all 86 entries
- [x] Update Supabase mirror with new columns and data — 500/500 rows upserted
- [x] Trigger DB→GSheet sync — 55 updated, 0 appended

## Feature — Auto-sync io_employees to Supabase
- [x] Create Supabase sync module (server/supabase-sync.ts) — fire-and-forget with 2x retry
- [x] Hook sync into all 5 io_employees mutation paths (PATCH, POST, DELETE, 2x billing bulk sync)
- [x] Add Supabase credentials as env secrets (SUPABASE_URL, SUPABASE_SERVICE_KEY)
- [x] Test end-to-end sync on employee update — 460 tests pass (4 new Supabase tests)

## Feature — Daily DB→ROSTER GSheet Sync
- [x] Inspect current ROSTER sheet structure and column mapping — 43 cols, 5 sheet-only preserved
- [x] Build roster sync module (server/roster-sync.ts) — full-replace with sheet-only column preservation
- [x] Add daily cron schedule (2:00 AM PHT) and manual trigger endpoint (/api/io/sync-roster)
- [x] Test end-to-end sync — 500 rows written (403 updated, 97 new), 9.5s, 460 tests pass

## Batch — Sync History Revisions + Attrition Columns
- [x] Add roster sync history tab to the Sync History page in desktop app
- [x] Add "Sync Roster" manual trigger button to the roster tab
- [x] Add "Sync Attendance" manual trigger button to the attendance tab
- [x] Add attrition columns (exit_date, exit_reason, offboarding_date, resignation_date, relieving_date) to ROSTER sheet headers and sync module — verified in sheet (AR-AV)

## Batch — Comprehensive Revisions (Roster Sheet, Compass, Regimen, Onboarding)

### ROSTER Sheet Cleanup
- [x] Remove InChat/InDistro columns (AN-AQ) from ROSTER sheet headers
- [x] Remove sheet-only column preservation logic from roster-sync.ts (only Access Level preserved now)
- [x] Remove columns from actual Google Sheet (will be cleared on next sync)

### Compass Visibility
- [x] Hide entire Compass nav from everyone except 740045023

### Regimen — Column Updates
- [x] Add all new io_employees columns to Regimen (including attrition fields: offboarding_date, resignation_date, relieving_date, exit_date, exit_reason)
- [x] Group columns logically: Identity → Role & Assignment → System IDs → Dates → Attrition → Asset & Logistics

### Regimen — Visibility Rules
- [x] Agents: Cannot see Regimen page at all (nav hidden for Agent role)
- [x] SMEs, QAs, Team Leads (except 740045023), Trainers: Limited column set (22 columns)
- [x] Managers & 740045023: Can see all columns (full tier)

### Regimen — Editability Rules
- [x] Only 740045023, 740044909, 703212987 can edit any field on any employee
- [x] All edits logged to io_audit_log with who/what/when (field-level diff)

### New Agent Onboarding Signup Flow
- [x] Prefilled OHR in io_employees triggers onboarding form on signup
- [x] Agent creates own password during signup (password set in step 1, profile in step 2)
- [x] Onboarding form collects: Last Name, Given Name, Middle Name, Suffix, Chromebook Asset, Hire Date, DOB, Personal Email, Contact Number, Primary Address, Barangay, City, Province, Locker Floor, Locker Number, Badge ID, Badge Serial
- [x] Field validation (DOB 16+ check, email regex, PH mobile format, required vs optional)
- [x] In-app notification to 740045023 and 740044909 on form completion
- [x] Non-prefilled OHR gets generic error message (same for not found, inactive, already has account)

## Batch — Onboarding Dashboard + Regimen Export

### Onboarding Completion Dashboard
- [x] Add "Onboarding" tab/view in Regimen page (visible only to OHR 740045023)
- [x] Show table of all employees with no password (pending onboarding) vs. completed
- [x] Missing-field indicators: highlight which required fields are still empty per agent
- [x] Summary stats: total pending, total completed, completion rate, no account count
- [x] Filter/search within the onboarding view

### Regimen CSV Export
- [x] Add CSV export button to Regimen page (visible to all who can see Regimen)
- [x] Export respects current filters (exports filtered view, not full dataset)
- [x] Export respects role-based column visibility (limited vs full columns)
- [x] Filename includes date stamp

### Bug Fix — Regimen Exit Details
- [x] Fix exit/attrition columns displaying in Regimen table for admin OHR 740045023 (all 42 columns including attrition group)
- [x] Port Anchor/Compass pill-based filter system to Regimen (with Select All/Deselect All, debounced auto-apply, search within dropdowns, sort buttons)

## Batch — RBAC Permission System

### Database & Schema
- [x] Create io_permissions table (ohr_id, permission_key, granted BOOLEAN, updated_by, updated_at)
- [x] Define all 21 permission keys covering nav visibility, sub-section visibility, and action controls
- [x] Seed default permissions based on current hardcoded role-based rules (all employees seeded)

### Permission Keys — Nav & Sub-section Visibility
- [x] Map all current hardcoded nav/sub-section visibility rules to permission keys
- [x] Define role-based defaults matching current behavior

### Permission Keys — Action Controls
- [x] anchor.edit_attendance (Can edit attendance records)
- [x] anchor.download_csv (Can download CSV in Input Portal)
- [x] anchor.sync_history (Can click Sync History in Attendance)
- [x] anchor.sync_roster (Can click Sync Roster)

### Server API
- [x] GET /api/io/permissions/:ohr_id — fetch permissions for an OHR
- [x] GET /api/io/permissions — fetch all permissions (admin only)
- [x] PUT /api/io/permissions/:ohr_id — update permissions for an OHR (admin only)
- [x] GET /api/io/my-permissions — fetch current user's permissions (merged defaults + DB overrides)

### Permissions Tab UI (Regimen, admin-only)
- [x] Add "Permissions" tab in Regimen (visible only to OHR 740045023)
- [x] Table of all employees with current access summary (granted count / total)
- [x] Detail panel with grouped permission toggles per OHR
- [x] Permission groups for quick toggling (6 groups)
- [x] Search/filter employees in permissions view

### Replace Hardcoded Rules
- [x] Replace all nav visibility checks in app.js with applyNavPermissions() function
- [x] Replace action checks with permission checks (CSV, sync, edit attendance, OT lock)
- [x] Load user permissions on login and cache in sessionStorage
- [x] Fallback to role-based defaults if no permission row exists (server-side merge)
- [x] Server-side sync endpoint checks (sync-roster, sync-attendance) now DB-driven

### Audit Trail
- [x] Log every permission change to io_audit_log (record_type='permission')

## Bug Fix — Auth Buttons Broken
- [x] Fix Sign Up button not working on auth page (syntax error in app.js line 1445 — stray `>` from RBAC edit)
- [x] Fix Login button not working on auth page (same root cause)

## Batch — Bug Fixes & Feature Revisions

### URGENT: Attendance Cron Fix
- [x] Fix "Google Sheets API not available (no auth token)" error — added rclone config fallback for token resolution

### Permissions Tab Not Showing
- [x] Fix Permissions tab not visible — code is correct, published site needed republish with latest checkpoint

### Sign Up Flow Revision
- [x] Replace OHR-is-new check with 2-option flow: "I am a Trainee for IO" vs "I am not a Trainee for IO"
- [x] Trainee path triggers existing onboarding form (handleSignUpTrainee)
- [x] Non-Trainee path asks only for OHR + password creation (handleSignUpProduction)

### Regimen Filter Improvements
- [x] Include ALL filterable columns in Regimen filter system (15 filters: Status, Role, PG, Supervisor, Shift, SRT Status, Platform, Work Off, City, Province, Barangay, Related PG, Exit Reason, Locker Floor, Search)
- [x] Align "Add Employee" and "Export CSV" buttons inline with filter bar (single line, flex-wrap)

### Regimen Details — Audit Trail
- [x] Add Audit Trail as lowest section in the employee detail card (inline, with field-level diffs)

### Onboarding Tab → Incomplete Rostering
- [x] Rename "Onboarding" tab to "Incomplete Rostering"
- [x] Change logic: list all employees with at least one blank column (checks all 42 columns, sorted by most missing first)

## Batch — Regimen Revisions (Round 2)

### Regimen Filter Bar — All Columns
- [x] Add ALL 43 columns as filter options in the Regimen filter bar
- [x] Date columns (DOB, Hire Date, Regular Date, Meta Onboarding Date, Go Live Date, Offboarding Date, Resignation Date, Relieving Date, Exit Date) use date-range pickers instead of multi-select
- [x] Non-date columns use multi-select dropdowns (existing pattern)

### Regimen Filter Bar — Z-Index Fix
- [x] Fix filter bar overlapping the nav bar when scrolling horizontally (z-index issue)

### Incomplete Rostering Overhaul
- [x] Remove summary cards (Total Employees, Completed, Pending, No Account, Completion Rate)
- [x] Remove Account and Onboarding Status columns from the table
- [x] Add Completion Rate column (percentage of filled fields per employee)
- [x] Add Input Portal-style filter bar to Incomplete Rostering tab

### Permissions Edit Button Fix
- [x] Fix Permissions "Edit" button not working

### Audit Trail Inline in Detail Card
- [x] Replace Audit Trail button with an inline section as the last section in the employee detail card

### Actor Info in Audit Trail
- [x] Include _actor_ohr and _actor_name in PATCH requests for proper audit trail attribution

### Test Alignment
- [x] Fix batch22 test: ROSTER.ALL_COLUMNS → ROSTER.getVisibleColumns() (code uses dynamic visibility)
- [x] Fix batch16 test: function rosterOpenDetail → window.rosterOpenDetail (window-assigned function)
- [x] Fix batch17 tests: formTitle.innerHTML → title.textContent, 'Asset & Logistics' → 'Assets & Logistics', roster-edit-field → data-field, regimen.edit_employee → regimen.edit_employees, rosterSaveDetailEdits → rosterSaveDetail

## Bug Fix — Attendance Sync Auth Token (Recurring)
- [x] Fix "Google Sheets API not available (no auth token)" error recurring on deployed site
- [x] Implement multi-source token resolution: process.env → shell env → rclone config → token file → webdev secret
- [x] Apply same fix to both gsheets-sync.ts (attendance) and roster-sync.ts (roster)
- [x] Verified: sync runs successfully (347 rows updated, 21849 DB rows, 21875 sheet rows)

## Batch — Sync Overhaul & CSV Export Fix
- [x] Remove sync history UI components (attendance + roster sync history pages)
- [x] Create SYNC_LOG tab in Google Sheet (who triggered, timestamp, details)
- [x] Delete January-February attendance rows from ATTEND_26 Google Sheet (22,791 rows removed)
- [x] Fix CSV export in Input Portal — server-side export with all omnibar filters

## Regimen Fixes — Batch (Post-Sync Overhaul)
- [x] Restore Incomplete Roster and Permissions tabs — added regimen.full_columns to ALL_PERMISSION_KEYS (was missing)
- [x] Group Regimen filters: "Filters" label for non-dates, "Dates" label for date-range, with border separator
- [x] Restore original employee card styling (detail-row/detail-label/detail-value CSS) with dropdown selects + Audit Trail section
- [x] Fix edit capability — regimen.edit_employees (plural) → regimen.edit_employee (singular) typo fixed

## Regimen Fixes — Round 2 (Post-Publish)
- [x] Fixed permission reading: sessionStorage('playbook_user').permissions instead of non-existent 'playbook_permissions' key
- [x] Restored exact 2-column grid card layout from deployed version (8a09692) with Audit Trail section appended
- [x] Fixed edit: removed stale playbook_token/playbook_ohr refs, using currentUser global for actor info
- [x] Removed Auth header from rosterFetchEmployees (unnecessary)

## Regimen Revisions — Batch (Filter Layout + Permissions Move)
- [x] Reorganize Regimen filter bars: line 1 = date filters ("Dates" label), lines 2-3 = search + non-date filters ("Filters" label)
- [x] Remove Supervisor and Planning Group filters from Incomplete Roster IR_FILTER_FIELDS
- [x] Permissions tab removed from Regimen entirely, admin-only via Admin Tools
- [x] Moved Permissions to Admin Tools as tabbed panel (Tools | Permissions) with adminSwitchTab()

## Regimen Filter Bar — Wrap Fix
- [x] Change Regimen filter bar from single horizontal scroll row to flex-wrap layout (dates row + wrapped non-date rows, no horizontal scroll)

## Regimen Filter Bar — 2-Column Layout
- [x] Left column: Add Employee + Export CSV buttons, search bar, filtered count + Clear
- [x] Right column: 3 stacked rows — row 1 = date filters, row 2 = identity filters, row 3 = role/system/asset/attrition
- [x] Filter bar uses inline-flex so it doesn't extend to full table width

## Regimen Filter Bar — Count Alignment & Clear Button Style
- [x] Left-align filtered count (#roster-filter-count) in the left column
- [x] Restyle Clear button to match Export CSV (btn btn-outline btn-sm)

## Regimen — Incomplete Roster Missing Field Color
- [x] Change missing-field highlight color to a mellower, less eye-straining tone

## Regimen — Filter Bar Layout on Published Site
- [ ] Fix filter pills stacking vertically (single column) instead of 2-column layout on published site
- [ ] Ensure the 2-column layout (left: buttons/search/count, right: 3 rows of pills) works after publish

## Input Portal — Attendance Lock Window
- [x] Change attendance lock from 1-day to 2-day window (current day + previous day editable)

## Compass — Remove CAP from Add Button & Rename CAP 0
- [x] Remove CAP functions from the Compass Add button (will be a dedicated page later)
- [x] Rename "CAP 0 Coaching" to "Incident Report"

## Compass — Remove Duplicate Add Form & Clean Up Dead Code
- [x] Remove duplicate ccShowNewForm/ccSubmitNewForm from compass-coaching.js
- [x] Wire Coaching Logs "New" button to use main compass.js compassShowNewForm
- [x] Remove dead CAP functions (compassOnCapLevelChange, compassGetSelectedCapLevel)

## Compass — Add Form Performance Optimization
- [x] Deep audit and fix lag on form open (compassShowNewForm) — form HTML cached after first build, reused with field reset
- [x] Fix lag on coaching type change (compassOnTypeChange) — cached DOM refs, prefetched ZTP/RCA catalogs
- [x] Fix lag on dropdown/field interactions — eliminated redundant getElementById calls via _formEls cache

## Compass — Lazy-Load HR_VIOLATIONS Catalog
- [x] Defer loading compass-violations.js until Compass is actually opened

## WFM Temporary User — Shared Credential Login
- [x] Add wfm_session_log table for traceability (IP, user-agent, timestamp)
- [x] Implement WFM login intercept (OHR: 00000, Password: 00000) — bypasses employee lookup
- [x] WFM session uses sessionStorage with role=WFM, permissions={nav.regimen:true}
- [x] Gate WFM role to Regimen only — all other nav groups hidden
- [x] Add Sync to Sheet button in Regimen toolbar (visible to WFM users)
- [x] WFM session restore skips heavy data loading, routes directly to Regimen
- [x] Backend wfm-session-log endpoint logs login + sync actions for audit trail

## WFM User — Change Visible Page to Input Portal
- [x] Change WFM permissions from nav.regimen to nav.anchor (Input Portal)
- [x] Update WFM session routing to land on Input Portal instead of Regimen

## WFM Credential Update
- [x] Change WFM username from 00000 to WFM (case-insensitive match)
- [x] Change WFM password from 00000 to wfm2026

## WFM User — Input Portal Full Visibility
- [x] WFM user sees all employees across all planning groups in Input Portal (via forceSync)
- [x] WFM user has Refresh Data and Export CSV buttons visible (anchor.download_csv permission added)

## WFM User — Read-Only Mode & Nav Restriction
- [x] Make WFM user read-only: disable tag editing, Save Changes, Undo All, Select Rows, bulk tag
- [x] Hide Dashboard, Risk Intelligence, Billing sub-nav items for WFM user (already permission-gated)

## WFM User — Filter Bar & Alerts Tab
- [x] Show filter bar (omnibar) for WFM users in Input Portal
- [x] Hide Alerts nav tab for WFM users (show only Menu)

## WFM Session Log — DB Fix
- [x] Fix wfm_session_log table: recreated via MySQL wire protocol (was originally created via Supabase SQL editor in PostgreSQL syntax, invisible to MySQL wire protocol)
- [x] Drizzle ORM insert/select now works correctly for wfm_session_log

## WFM User — Force Menu Tab & Hide Alerts Panel
- [x] WFM login: force sidebar to Menu tab (not Alerts) and hide entire Alerts panel/toggle
- [x] WFM session restore: same — default to Menu tab, hide Alerts

## WFM User — Fix Attendance Dropdowns Still Interactive
- [x] Attendance tag dropdowns should render as plain text (not selects) for WFM users

## Compass — Type-First Dropdown Refactor + NTE Build Assist
- [x] Refactor "Add" button to show type selector dropdown first (reduces form latency)
- [x] Type options: General Coaching, Follow-Up Session, Group Coaching, Triad Coaching, QA Feedback, Incident Report, ZTP Coaching, NTE Build Assist
- [x] Each type opens only its relevant form fields (lazy load via preselectedType)
- [x] Build NTE Build Assist wizard: Step 1 — Employee picker (searchable) + Violation type selector (from HR_VIOLATIONS)
- [x] Build NTE Build Assist wizard: Step 2 — Date range + auto-fetch attendance + previous NTEs + CAP level recommendation
- [x] Build NTE Build Assist wizard: Step 3 — AI-generated incident narrative + policy citations (editable)
- [x] Build NTE Build Assist wizard: Step 4 — Review & confirm + expected behavior + deadline + submit
- [x] Backend: /api/io/nte-build-assist/generate endpoint with LLM integration
- [x] Backend: Attendance data pull for Annexure A (from io_attendance via existing API)
- [x] Backend: DOCX generation from NTE template (nte-docx-generator.ts)
- [x] Backend: Auto-determine CAP level from violation history (progressive escalation)
- [x] Integration: Auto-create coaching log + NTE record on submission
- [x] Tests: vitest updated for type-first selector pattern

## NTE Build Assist — Document Draft Output (not coaching log tag)
- [x] Analyze sample NTE documents to map exact document structure (header, body, annexure)
- [x] Build server-side DOCX generation endpoint matching sample NTE format (/api/io/nte-build-assist/docx)
- [x] Update wizard Step 4 to generate and download NTE document draft ("Generate NTE Document" button)
- [x] NTE document includes: title, employee details, incident narrative, policy violated, mandate paragraph, Article 282, boilerplate legal paragraphs, signature blocks, Annexure A (color-coded attendance table)
- [x] Optional CWD acknowledgment page (checkbox in Step 4)
- [x] DOCX generated using `docx` library with Calibri font, proper formatting, and tag color-coding

## NTE DOCX Generator — Match Exact SampleNTE7 Template
- [x] Rewrite NTE DOCX generator to match exact SampleNTE7 format
- [x] Genpact logo in top-right header on every page
- [x] Horizontal rule under "Notice to Explain" title
- [x] Mandate: always 120 hours to HR (Jocelyn Ramos)
- [x] ALL CAPS BOLD "failure to submit" paragraph with termination language
- [x] Article 282 includes item (e) "Other causes analogous"
- [x] Supervisor title: "Supervisor, {Department}" (uses new department column)
- [x] "Classification: Genpact Confidential" centered footer on every page
- [x] Annexure A: blank page (user attaches evidence after generation)
- [x] Add "department" column to io_employees table (migration applied)
- [x] Fix Regimen table supervisor column showing blank (key mismatch: 'supervisor' vs 'supervisor_name')

## Fix __dirname ESM Error + Department Population
- [x] Fix __dirname not defined in nte-docx-generator.ts (ESM compatibility — used import.meta.url + fileURLToPath)
- [x] Populate department column: 20 QTP employees, 480 Ops (all matched)

## NTE DOCX — Formatting Fixes
- [x] Policy violations: hierarchical format (each line of multi-line policy_sections rendered separately with indent)
- [x] Whole document in Justified alignment (AlignmentType.JUSTIFIED on all paragraphs)
- [x] Add "sex" column to io_employees, pre-fill based on name inference (155F, 345M)
- [x] Gender-aware pronouns (he/she/his/her/him) + honorifics (Mr./Ms.) based on sex column
- [x] Consistent line spacing across all paragraphs (unified PARA_AFTER = 160 half-points)
- [x] Remove underline/lines from signature blocks (plain text only)
- [x] employees/slim endpoint now returns department and sex fields

## Regimen Table — Department + Sex Columns
- [x] Add Department column visible to all users in Regimen table
- [x] Add Sex column visible only to owner (740045023) in Regimen table

## NTE DOCX — Policy Section Formatting
- [x] Sections: highlighted gray background, bold text
- [x] Subsections: bold text only
- [x] Descriptions: normal text
- [x] Vertical stacking, no bullets
- [x] Remove "The alleged violation is in contravention of the following company policies:" text
- [x] Remove "This conduct may also constitute serious misconduct..." Article 282 reference text

## Coaching Profile — Remove Status Filter + Acknowledged Cleanup
- [x] Remove Status filter from Coaching Profile filter bar
- [x] Remove "Acknowledged" status from non-QA Feedback coaching logs (no non-QA logs had Acknowledged status in DB — filter dropdown removed)

## Disputes Area — Card Movement Animation
- [x] Add sleek, smooth animation when a card is moved to a new section (FLIP technique)
- [x] Make the animation impressive and polished (staggered entrance, color-coded columns, escalation timeline, glow effects)

## NTE Violation Picker — Sub-subsection Revision
- [x] Rewrite compass-violations.js with exact GP HR Policy 3.0 hierarchy (7 sections, subsections, sub-subsections)
- [x] Update NTE wizard Step 1 picker to select sub-subsections (x.y.z) as the violation items
- [x] Update Incident Report violation tracker cascade to use new 3-level structure
- [x] Update LLM prompt to pass full hierarchy context (section, subsection, sub-subsection)
- [x] DOCX generator already renders x.y.z as normal text — verified no changes needed
- [x] Update batch-disputes-visibility.test.ts to match new data shape (item.text, item.code, item.penalty)

## NTE Violation Picker — Fixes & Enhancements
- [x] Fix subsection showing "N/A" in DOCX — fixed operator precedence bug in LLM prompt interpolation + added subsection fields to API payload
- [x] Add type-ahead search filter to the NTE violation picker for 100+ sub-subsections
- [ ] CWD Sign-off Sheet option explained to user — keeping for now (adds extra page for Critical Workday acknowledgment)

## NTE Wizard — CWD Removal & Keyboard Navigation
- [x] Remove CWD Sign-off Sheet checkbox from NTE wizard Step 4
- [x] Remove CWD page generation from DOCX generator (hardcoded include_cwd_page: false)
- [x] Add keyboard navigation (arrow keys + Enter + Escape) to violation search dropdown

## NTE — Article 282 Reinstatement & Multi-Violation Support
- [x] Reinstate Article 282 block as hardcoded non-negotiable text in DOCX generator
- [x] Update NTE wizard Step 1 to support selecting multiple violations
- [x] Display selected violations as chips/tags with remove capability
- [x] Update API payload to send array of violations
- [x] Update LLM prompt to handle multiple violations
- [x] Implement smart hierarchy deduplication in DOCX generator (suppress repeated section/subsection)
- [x] Update Step 3 preview and Step 4 review to show multiple violations

## NTE & Coaching UX Improvements
- [x] Remove Expected Behavior / Corrective Action field from NTE wizard Step 4
- [x] Remove Deadline for Improvement field from NTE wizard Step 4
- [x] Remove same fields from old NTE form (CAP 1-3 flow) and NTE detail view
- [x] Change NTE Build Assist coaching_type from 'General Coaching' to 'NTE Log'
- [x] Add 'NTE Log' to COACHING_TYPES array
- [x] Remove coaching type select from inside the coaching form body (replaced with hidden field + type label)
- [x] Replace Add type selector overlay with dropdown menu on the Add button
- [x] Dropdown directly opens the correct form without intermediate overlay

## Bug Fix — NTE Creation Error
- [x] Fix "Failed to create coaching log" error when filing NTE via NTE Build Assist (cap_level VARCHAR(20) too short for 'Review for Termination' — widened to VARCHAR(50))

## Cleanup & NTE Log Styling
- [x] Delete 12 test coaching logs from database (12 coaching logs + 10 NTE records deleted)
- [x] Also delete associated NTE records for those coaching logs
- [x] Add NTE Log styling (indigo gradient badge) to match other coaching types in the table
- [x] Add Incident Report styling (amber gradient badge) to match other coaching types in the table

## Regimen — Add Employee Visibility Restriction
- [x] Restrict "Add Employee" button in Regimen to only owner (740045023) and assistant (740044909)
- [x] Set this restriction as the default permission in the Permissions tab for all employees (new regimen.add_employee key)

## Regimen — Edit Employee Visibility Restriction
- [x] Restrict "Edit Employee" (regimen.edit_employee) to only owner (740045023) and assistant (740044909) by default — removed 703212987 default grant

## Compass Audit — Status Filter & Acknowledged Cleanup
- [x] Remove Status filter from compass-omnibar.js COMPASS_PILL_FIELDS
- [x] Remove status from COMPASS_DEFINED_OPTIONS in compass-omnibar.js
- [x] Add 'NTE Log' to COMPASS_DEFINED_OPTIONS coaching_type list
- [x] Check DB for non-QA Feedback logs with 'Acknowledged' status — none found (0 rows). Only QA Feedback uses dispute statuses.
- [x] Remove dead compassShowTypeSelector function from compass.js

## Dead Code Cleanup
- [x] Remove compass-routes.ts (never imported/registered)
- [x] compass_* schema definitions kept — actively used by server/routers/compass.ts and ca-cases.ts (tRPC module)
- [x] No orphaned imports found — all compass_* references are in active tRPC routers

## Disputes Area — Full UI/UX Overhaul
- [x] Delete dead compass-disputes-v2.js (uses non-existent API)
- [x] Rewrite kanban CSS — column accent colors per level (LV1 blue, LV2 amber, LV3 orange, LV4 red, LV5 deep red, LV6 purple)
- [x] Richer cards — session goal tags, 48-hour aging indicator (green/amber/red), coach name, escalation progress dots
- [x] Add search/filter bar — filter disputes by coachee name or session goal
- [x] Add empty state for columns with no cards
- [x] Replace all prompt() calls (LV3-LV6) with proper styled action modals (overlay.classList.add/remove('active'))
- [x] Polish detail overlay — move inline styles to CSS classes, improve layout
- [x] Polish dispute trail — better visual differentiation between actors
- [x] Keep and polish FLIP animations for card movement
- [x] Clean up inline styles throughout disputes code (overlay.style.display → classList.add/remove('active'))

## Role-Based Visibility & Data Scoping — Compass
### Navigation Visibility
- [x] Coaching Profile: visible to ALL employees (agents included)
- [x] Disputes Area: visible to all NON-agents (TL, SME, QA, Manager)

### Coaching Profile — Data Scoping
- [x] Agent: only see coaching logs where they are the coachee
- [x] TL: see logs where they are coachee, coach, or coachee is one of their agents
- [x] SME: same as TL but "their agents" = agents under their supervisor's team
- [x] QA: see logs where they are coachee or coach
- [x] Manager: see all coaching logs

### Coaching Profile — Add Button Type Restrictions
- [x] Agent: no Add button at all
- [x] TL: all types EXCEPT QA Feedback
- [x] SME: all types EXCEPT QA Feedback and Triad Coaching
- [x] QA: only QA Feedback, ZTP Infraction, and Follow Up Session
- [x] Manager: all types

### Disputes Area — Data Scoping
- [x] TL: only cards where coachee is their agent OR they are Support Joiner 1/2
- [x] SME: same as TL (coachee under supervisor's team OR Support Joiner 1/2)
- [x] QA: segmented toggle "All Disputes" (default) vs "My Disputes" (where they are the coach)
- [x] Manager: see all disputes

## Coaching Profile & Disputes Area — Detail View Revisions
- [x] Hide "Coaching Rating" and "Coaching Sentiments" fields from everyone except the coach's 1-up supervisor
- [x] Refactor Disputes Area card detail overlay to match Coaching Profile detail layout/design

## Export CSV — Coaching Profile
- [x] Add Export CSV button to Coaching Profile page (near the "Coaching Given" table)
- [x] Export respects role-based data scoping (same filter as the table view)
- [x] Export includes ALL possible fields from coaching log records
- [x] Managers get dropdown toggle: "Export Filtered" vs "Export All" (bypasses role filter)
- [x] Non-managers get simple "Export CSV" button (filtered only)
- [x] Export covers all pages (not just current pagination)

## Compass Notification System
- [x] Register new notification types in notifications.js (icons, colors, labels, briefs)
- [x] #1 New coaching log created → notify coachee
- [x] #2 Coaching log acknowledged → notify coach
- [x] #3 Coaching rating submitted → notify coach's 1-up supervisor
- [x] #4 Dispute initiated (L1) → notify coach + coach's supervisor
- [x] #5 L2 Coach accepts/retains → notify coachee
- [x] #6 L2 Coach reverses → notify coachee
- [x] #7 L3 SME retains → notify coachee + coach
- [x] #8 L3 SME reverses → notify coachee + coach
- [x] #9 L4 QA accepts/rejects → notify coachee + coach + SME joiner
- [x] #10 L5 Trainer accepts/rejects → notify coachee + coach + SME joiner + QA
- [x] #11 L6 QTP Manager retains/reverses → notify all parties
- [x] #12 Dispute aging > 48 hours → notify next actor

## ZTP/Incident Report Elevated Notifications
- [x] Elevated titles for ZTP ("ZTP Infraction Issued") and Incident Report ("Incident Report Filed")
- [x] Broader recipient on creation — also notify coachee's supervisor (TL)
- [x] Dispute notifications include [HIGH PRIORITY] tag for ZTP/Incident
- [x] Aging alerts at 24 hours instead of 48 for ZTP/Incident disputes

## Remove Password System — OHR ID Only Login
- [x] Remove password field from login form (OHR ID only)
- [x] Remove is_locked checks from login flow
- [x] Update server-side auth to validate OHR ID existence only
- [x] Remove password comparison logic
- [x] Remove failed login attempt counter and lock mechanism
- [x] Clean up lock/unlock UI elements (admin panel, employee management)
- [x] Remove password management UI (change password, reset password)

## Post-Password Cleanup & UX Improvements
- [x] Remove `password` and `is_locked` columns from io_employees schema + migration
- [x] Add "Remember Me" toggle with localStorage to pre-fill OHR ID
- [x] Simplify Sign Up flow — unified single form, no trainee/production split
## Sign Up / Login UX Improvements
- [x] Auto-login after onboarding — skip redirect to login form, log user in directly
- [x] Login nudge — when OHR exists but profile incomplete, offer link to sign up/onboarding
## Session Management
- [x] 30-minute inactivity timeout — clears sessionStorage and returns to login screen
## Regimen UI
- [x] Relocate Refresh Data and Logout buttons beside Regimen page title (not far right)
## RBAC Permissions
- [x] Grant OHR 740044909 (assistant) full Regimen permissions: edit_employee, add_employee, full_columns, onboarding_tab, permissions_tab
- [x] Make OHR ID and Full Name editable in Regimen for OHR 740045023 and 740044909 only
## Prospective Cascade
- [x] Audit and ensure all new rows and displays pull employee data from live io_employees, not stale copies
- [x] Fix bulk tagging bug — "Bulk tagged 0 record(s)" when employees do bulk changes in Input Portal
## Bulk Tag Across Pages
- [x] Add "Select all X matching records" banner when all rows on current page are selected, to extend bulk tag across all filtered pages
## Bug Fix — Bulk Tag Still Showing 0 Records
- [x] Fix persistent "Bulk tagged 0 record(s)" in compact view for assistant OHR 740044909
## Bug Fix — Input Portal Empty After Refresh
- [x] Fix Input Portal showing empty/no records after refresh for assistant OHR 740044909
## Bug Fix — Input Portal Save Failed
- [x] Comprehensive fix for Input Portal save failures (individual and bulk) for assistant and all users
## Bug Fix — Save Failed for Specific Record
- [x] Fix save failure for Cardona, Karlyn Peña (04/09/26) by assistant 740044909
## Admin OHR Centralization
- [x] Add ADMIN_OHRS constant to io-routes.ts (replaces all hardcoded 740045023 checks)
- [x] Replace date-lock exemption in PATCH /attendance/:id with ADMIN_OHRS.includes()
- [x] Replace OT mechanism exemption with ADMIN_OHRS.includes()
- [x] Replace bulk-tag date-lock checks (2 occurrences) with ADMIN_OHRS.includes()
- [x] Replace OT cancel admin check with ADMIN_OHRS.includes()
- [x] Replace sync-log admin gate with ADMIN_OHRS.includes()
- [x] Replace sync-log/latest admin gate with ADMIN_OHRS.includes()
- [x] Replace billing-sheet-sync admin gate with ADMIN_OHRS.includes()
- [x] All 569 tests pass after migration
## Compass — NTE & CAP Module (Corrective Actions)
### Change A: Remove Acknowledgement for Awareness-Only Types
- [x] Define AWARENESS_ONLY_TYPES constant (ZTP Coaching, Incident Report, NTE Log)
- [x] Set status to 'Issued' on creation for awareness-only types
- [x] Hide Acknowledge button and ack section in detail view for awareness-only types
- [x] Exclude awareness-only types from Unacknowledged/Acknowledged sub-tabs
### Change B: Corrective Actions Tab
- [x] Create io_corrective_actions database table and migration
- [x] Backend: GET /api/io/corrective-actions (list with filters)
- [x] Backend: POST /api/io/corrective-actions (create NTE)
- [x] Backend: GET /api/io/corrective-actions/:id (single record)
- [x] Backend: PATCH /api/io/corrective-actions/:id (assign CAP, dismiss)
- [x] Backend: GET /api/io/corrective-actions/stats (summary card counts)
- [x] Backend: GET /api/io/corrective-actions/employee/:ohr_id/history (CAP history)
- [x] Frontend: Corrective Actions tab in Compass navigation
- [x] Frontend: Summary cards (Pending NTEs, Active CAPs, Expiring Soon, Dismissed)
- [x] Frontend: Filterable table with sort/filter
- [x] Frontend: Create NTE form
- [x] Frontend: Assign CAP form
- [x] Frontend: Dismiss form
- [x] Frontend: Detail overlay with employee info, NTE details, action panel
- [x] Frontend: Employee CAP history timeline in detail overlay
- [x] Notifications: NTE Created, CAP Issued, NTE Dismissed
- [x] Aging alerts: overdue badge for NTEs past response deadline
- [ ] NTE Build Assist bridge: Track in Corrective Actions button after wizard (deferred)
- [x] CAP expiry: auto-transition to Expired on stats fetch
- [ ] Tests for corrective actions endpoints (deferred)

## NTE Build Assist Relocation — Corrective Actions
- [x] Review current NTE Build Assist wizard in compass.js
- [x] Move NTE Build Assist code to corrective-actions.js
- [x] Wire wizard to "Issue NTE" button in Corrective Actions page
- [x] Route wizard output to io_corrective_actions table (POST /api/io/corrective-actions)
- [x] Remove NTE Build Assist button/code from Coaching Profile
- [x] Test end-to-end: wizard opens from CA page, creates record in CA table

## Bug Fix — NTE Build Assist Button Not Working
- [x] Rename "Issue NTE" button to "NTE Build Assist"
- [x] Fix wizard not showing when button is clicked (overlay.style.display='flex' instead of classList.add('active'), plus fallback HR_VIOLATIONS lazy-load)

## Document Build Assist — CAP 1 Integration
- [x] Rename "NTE Build Assist" button to "Document Build Assist"
- [x] Add document type picker (NTE vs CAP 1) as first step
- [x] CAP 1 wizard Step 1: Employee picker + linked NTE selector
- [x] CAP 1 wizard Step 2: Explanation date + summary + AI deliberation generation
- [x] CAP 1 wizard Step 3: Confirm + generate DOCX + auto-assign CAP
- [x] Backend: POST /cap-build-assist/docx (DOCX generation using template)
- [x] Backend: POST /cap-build-assist/generate (AI deliberation generation)
- [x] NTE wizard Step 1 back button returns to type picker
- [x] All 569 tests pass

## Knowledge Base — Corrective Actions
- [x] Extract all violation categories from HR Policy v3.0 (7 categories)
- [x] Extract CAP reference table (levels, active periods, response windows)
- [x] Extract process flowchart content (NTE → Explanation → CAP decision)
- [x] Generate starter FAQ for TLs
- [x] Build KB data file (ca-knowledge-base.js) with AI-ready chunked content
- [x] Build KB sidebar UI with collapsible panel, category browsing, article detail
- [x] Add keyword search across all KB articles
- [x] Add KB CSS styling matching Corrective Actions design system
- [x] Add KB toggle button to Corrective Actions filter bar

## Performance Optimization (April 2026)
- [x] Remove "Remember my OHR ID" checkbox from login page
- [x] S1: Add gzip compression middleware (compression npm package)
- [x] S2: Set static asset Cache-Control to max-age=86400
- [x] S3: Add database indexes on hot query columns (14/16 indexes created)
- [x] S4: Replace NOT IN subquery with cached manager OHR set (5-min TTL)
- [x] F2: Add preconnect hints for CDN origins
- [x] F3: Defer CDN scripts (Chart.js, SheetJS)
- [x] D1: Add debounce to all search/filter inputs (CA, Helm, updateAllViews)
- [ ] D2: Batch innerHTML writes using DocumentFragment in compass.js
- [ ] D3: Cache querySelector results in module-scoped variables
- [x] D4: Throttle updateAllViews during rapid filter changes (150ms coalesce)
- [x] Bump cache-bust version strings on all modified files

## Compass Visibility Rules (April 2026)
- [x] BUG: TLs, SMEs, QAs cannot see any Compass component — fixed (381 DB overrides deleted)
- [x] Restrict Corrective Actions to Team Leads and Managers only (server defaults updated)
- [x] Add server-side role enforcement on CA POST/PATCH endpoints (caEnforceRole)
- [x] Verify Disputes Area remains hidden from Agents, visible to all non-agents
- [x] Verify Coaching Profile visible to all with correct data scoping
- [x] Verify Document Build Assist accessible to TLs + Managers only

## Remove Sign Up + Onboarding Flow (April 2026)
- [x] Remove Sign Up button and flow from landing page
- [x] Simplify landing page to single Login with OHR ID input
- [x] Add help text: "Enter your OHR ID to access Playbook"
- [x] Build onboarding profile completion page (reused existing form)
- [x] Add server-side onboarding gate: redirect Onboarding users to profile form
- [x] Auto-flip employment_status from Onboarding to Active on form submission
- [x] Gate Onboarding users from accessing main app until form is completed
- [x] Clean up any remaining Sign Up references in codebase

## Login Page UI/UX Overhaul (April 2026)
- [x] Redesign login page layout (split-panel: hero left + form right)
- [x] New typography, color treatment, and visual hierarchy
- [x] Animated/polished mascot presentation (140px with drop-shadow)
- [x] Modernize input fields, button styles, and micro-interactions
- [x] Redesign onboarding form (sectioned grid layout with scrollable area)
- [x] Add subtle background texture (grid overlay, floating orb, radial gradients)
- [x] Ensure responsive design (stacks vertically below 900px)
- [x] Maintain all functional elements (OHR login, onboarding gate, WFM intercept)

## Data Cleanup — Input Portal (April 2026)
- [x] Fix attendance snap_status: backfilled from srt_status (42,692 records fixed — 42,026→Production, 629→Exit, 37→Inactive)
- [x] Reverted io_employees.employement_status back to "Active" (389 employees restored)
- [x] Remove all attendance records for Castro, Sarrah Jane Minguez (OHR 740046018, 151 records deleted)

## Regimen Filter Simplification
- [x] Replace Last Name, Given Name, Middle Name, Suffix, Billing Name, SRT Name filters with single Full Name filter

## WFM Tag Feature (April 2026)
- [x] Create io_wfm_schedules table (ohr_id, schedule_date, wfm_value)
- [x] Add wfm_tag column to io_attendance table
- [x] Build CSV upload endpoint with OHR x Date matrix parser
- [x] Backfill io_attendance.wfm_tag from io_wfm_schedules on upload
- [x] Build WFM Schedule upload UI in Admin Tools
- [x] Add read-only WFM Tag column to Input Portal table
- [x] Add WFM Tag filter to Input Portal filter bar
- [x] Test end-to-end: upload CSV → verify WFM Tag appears in Input Portal

## WFM Tag Column Position & Slim Endpoint (April 2026)
- [x] Move WFM Tag column to sit immediately after Tag in TABLE_COLUMNS
- [x] Move WFM Tag filter to sit immediately after Tag in OMNIBAR_FILTER_FIELDS
- [x] Build slim attendance endpoint with field projection (return only columns needed by Input Portal)
- [x] Update frontend to use slim endpoint for faster load times
- [x] Bump cache versions
- [x] Tests and checkpoint

## Bug Fix — WFM Tag Not Visible in Attendance Table
- [x] Investigate and fix WFM Tag column not appearing in the Input Portal attendance table

## WFM Tag Mapping Update (April 2026)
- [x] Update WFM upload parser: time values → "Scheduled", BOJ → "Scheduled", keep WO/PL/ML/LOA/Exit/NH Training as-is
- [x] Update tests and checkpoint

## PL Tag Restriction Removal + Billing CSV Upload + Remove actual_vs_projection (April 2026)
- [x] Remove PL tag restriction — all Input Portal users can tag PL (not just Managers/740045023/740044909)
- [x] Remove actual_vs_projection column from schema, queries, and all frontend references
- [x] Build billing CSV upload endpoint (large file support, YYYY-DD-MM date parsing, chunked inserts)
- [x] Build billing CSV upload Admin UI
- [x] Disable/remove G Sheet billing sync (replaced with CSV upload, legacy endpoint kept for backward compat)
- [x] Tests and checkpoint

## Bug Fix — WFM Schedule Upload Button Not Working (April 2026)
- [x] Fix WFM Schedule "Upload Schedule" button doing nothing after file selection (root cause: DD-Mon date format parsed to year 2001 + affectedRows extraction bug in flushWfmRecords)

## Upload UX — Loading Bars & Visual Feedback (April 2026)
- [x] Debug and fix WFM Schedule upload button not working on published site (root cause: CSS class mismatch — HTML used admin-progress-bar but CSS targeted .progress-bar)
- [x] Add loading bar / progress indicator to WFM Schedule upload
- [x] Add loading bar / progress indicator to Billing CSV upload
- [x] Bump cache versions and test

## Bug Fix — window.currentUserOhr Never Assigned (April 2026)
- [x] Fix window.currentUserOhr never assigned in app.js — isAdmin() always returned false, silently blocking all admin functions (WFM upload, billing upload, etc.)
- [x] Set window.currentUserOhr and window.currentUserName in all 3 login paths (loginAsEmployee, WFM login, session restore)
- [x] Clear window.currentUserOhr on logout
- [x] Bump app.js cache version

## Bug Fix — Billing CSV Upload "Unknown Error" (April 2026)
- [x] Fix billing CSV upload returning "Unknown error" toast (root cause: 10K rows caused HTTP timeout — optimized batch sizes to 2000, employee sync via staging table, added 5-min AbortController timeout on client)

## Bug Fix — Billing CSV Upload Proxy Payload Limit (April 2026)
- [x] Refactor billing CSV upload to use client-side chunking (2000 rows per request) to stay under proxy payload size limits (~1.2MB)
- [x] Progress bar shows chunk-by-chunk progress (e.g., "Uploading chunk 2/6 (rows 2001-4000 of 10,132)")
- [x] Aggregate results across all chunks (parsed, updated, skipped, employees synced, SRT bill upserted)
- [x] Handle partial failures gracefully (report last error while preserving successful chunks)
- [x] Bump admin.js cache version to v=107
- [x] Update test assertions for new cache version

## CAP 2 & CAP 3 Document Build Assist Integration (April 2026)
- [x] Convert "Document Build Assist" button to dropdown with NTE, CAP 1, CAP 2, CAP 3 options
- [x] Implement CAP 2 wizard (3-step: Employee+NTE link, Explanation+AI Deliberation, Review+Generate DOCX)
- [x] Implement CAP 3 wizard (3-step: same pattern as CAP 2 with 180-day active period)
- [x] Wire CAP 2/CAP 3 to existing /cap-build-assist/generate and /cap-build-assist/docx endpoints
- [x] Write cap-build-assist.test.ts (27 tests: config, payloads, active periods, template URLs)
- [x] Bump corrective-actions.js cache version to v=2
- [x] Update back buttons to close wizard instead of re-opening old type picker overlay

## Bug Fix — Document Build Assist Button Missing (April 2026)
- [x] Fix: Document Build Assist dropdown button not visible on Corrective Actions page for Team Leader role
- [x] Root cause: canCreate/canAct used hardcoded role strings ['Team Lead', 'Manager'] but user's actual_role is 'Operational SME'
- [x] Fix: switched to RBAC permission check (currentUser.permissions['compass.corrective_actions']) which correctly covers all authorized users
- [x] Bumped corrective-actions.js cache version to v=3

## Compass Notification Enhancements (April 2026)
### Fix: Missing Registration
- [x] Register nte_issued, cap_issued, nte_dismissed, ot_forfeited in notifications.js (labels, colors, icons)
### Priority 1 — Real-time
- [x] NTE Served Confirmation → notify issuing TL when employee responds
- [x] CAP Issued — Supervisor Copy → extend cap_issued to also notify agent's supervisor
### Priority 1 — Cron
- [x] CAP Expiry Warning (cap_expiring) → daily cron at 01:00 UTC (9 AM PHT), alert agent + TL when CAP expires in 7 days
- [x] NTE Deadline Reminder (nte_deadline_reminder) → cron every 4h, nudge agent when deadline is 12h out
### Priority 2
- [x] Coaching Acknowledgement Overdue (coaching_ack_overdue) → daily cron at 02:00 UTC (10 AM PHT), coaching not ack'd within 48h
- [x] Repeat Offender Alert (repeat_offender) → on NTE creation, 2nd+ NTE in 90 days
- [x] CAP Escalation Path (cap_escalated) → on CAP decision, notify TL + Manager when agent moves CAP 1→2 or 2→3
### Priority 3
- [x] Weekly Compass Digest (weekly_digest) → cron Monday 00:00 UTC (8 AM PHT), summary of coaching/CA activity
- [x] Document Build Assist Complete (docx_generated) → real-time on DOCX generation
- [x] Dispute Resolution Summary (dispute_resolved) → real-time on L2/L6 final decisions (4 trigger points)

## Coaching Data Import — DS.COACHING.xlsx (April 2026)
- [x] Parse COACH ID sheet (3,231 rows) and map to io_coaching schema
- [x] Parse COACH BULK sheet (7 groups → 105 individual records)
- [x] Transform: "New Session" → "General Coaching", "Group Coaching" → "General Coaching", "Triad Coaching" → "General Coaching"
- [x] Transform: Session Goal old values to current allowed values (11 mappings + 4 edge cases: AHT, Genome, PKT Result, Policy dissemination)
- [x] Transform: OHR floats to integer strings
- [x] Upsert: Updated 1,895 overlapping rows, inserted 1,336 new rows from COACH ID
- [x] Insert: 105 expanded COACH BULK records as individual General Coaching (with coachee_list traceability)
- [x] Verify final row count: 3,444 rows (was 2,003). All 726 tests pass. Zero unmapped session goals.

## NTE Log Cleanup & CA Visibility Rules (April 2026)
- [x] Remove NTE Log entries CL-945ccb9d from io_coaching table (already removed during earlier import; 0 NTE Logs remain)
- [x] Ensure NTE Logs are excluded from Coaching Profile (filtered out in compassApplyFilters, removed from COACHING_TYPES, AWARENESS_ONLY_TYPES, omnibar options)
- [x] Apply full role-based visibility rules to Corrective Actions (Manager/Admin=all, TL=team+own, SME=TL's team+own, QA/Trainer=own, Agent=own)
- [x] Add "All Logs | My Team" toggle to Corrective Actions for admin (740045023) and Manager roles

## Regimen Table Role Misalignment (April 2026)
- [ ] Investigate misaligned roles in Regimen table vs database
- [ ] Fix any role discrepancies

## Role Realignment + CA Cleanup + Sandbox Visibility (April 2026)
- [x] Bulk update 13 SMEs with direct reports to "Team Lead" in DB
- [x] Check Roster Google Sheet for other misaligned columns — DB already aligned (0 updates needed)
- [x] Remove Dismiss and Assign CAP buttons from CA detail panel + related code
- [x] Open Sandbox Input Portal to all employees with role-based visibility (agents=own, TL/SME=team+own, Managers/Admin=all)
- [x] Add Submitter column to Input Portal table for TL/SME/Manager views
- [x] Grant nav.sandbox to all roles in both client + server getPermissionDefaults
- [x] Update batch-rbac tests for new Agent defaults (nav.helm + nav.sandbox)
- [x] Bump cache versions: sandbox.js v=103, permissions.js v=2

## Portillo Reassignment & Coaching Log Audit (April 2026)
- [x] Reassign Portillo from TL Natividad to TL Esmino in io_employ- [x] Retrograde 58 attendance records from April 4, 2026 (snap_supervisor → Esmino)lect new supervisor
- [x] Audit coaching logs for supervisor misalignment — fixed 579 rows (coachee_sup aligned to current supervisor)
- [x] Fix coaching logs ack discrepancies — backfilled 107 ack_dates, filled 34 partial ack fields. Final: 1,797 acknowledged, 1,644 unacknowledged (before 2025 cleanup)

## Coaching Log Cleanup (April 2026)
- [x] Remove all coaching logs from 2025 (1,008 logs deleted, 2,433 remaining)

## Coaching Log Supervisor Restoration (April 2026)
- [x] Restore coaching log supervisors from DS.COACHING.xlsx — 298 rows updated to match spreadsheet's historical supervisors (269 now correctly differ from current employee supervisor due to transfers)

## Coaching Log Ack Status Fix — Round 2 (April 2026)
- [x] Thorough audit of compassIsAcknowledged logic vs actual DB data
- [x] Root cause: lean API endpoint omitted coachee_ack, coachee_commitments, coaching_rating, coachee_sentiments, ack_date fields — compassIsAcknowledged() always returned false for list view
- [x] Fix: Added 5 ack fields to lean query in io-routes.ts GET /api/io/coaching?lean=1
- [x] Verified: a1a037d9 and e857ffad now correctly show as Acknowledged in lean response

## CA Detail Panel — Dismiss/Assign CAP Buttons Still Visible (April 2026)
- [x] Remove Dismiss and Assign CAP buttons from NTE detail panel in Corrective Actions — buttons were already removed in code (checkpoint f2b61ce) but cache version was not bumped (both old and new used ?v=4), so user's browser served stale JS. Bumped corrective-actions.js to v=5 and corrective-actions.css to v=3.

## Coaching Profile — Inline Add Panel (April 2026)
- [x] Replace modal-based Add form with inline expandable panel below filter bar
- [x] Type selection via horizontal clickable chips (not dropdown)
- [x] Employee selection via type-to-search pattern (not full dropdown)
- [x] Form stays open after submit for consecutive entries
- [x] Manual collapse button to close the inline panel
- [x] Smooth CSS slide-down/slide-up animations
- [x] Role-based type filtering preserved (TL=all except QA Feedback, QA=QA Feedback+ZTP+Follow Up, SME=all except QA Feedback+Triad, Manager=all)
- [x] Old modal form code redirected to inline panel (legacy wrapper preserved for edit flows)
- [x] Success message shown inline after each create
- [x] Cache versions bumped (compass.js v=105, compass-redesign.css v=101)
- [x] 34 vitest tests covering HTML structure, JS functions, CSS styles

## UI Revisions — Inline Expansion Pattern (April 2026)
- [x] Remove "Collapse" text from inline add panel button, keep only the chevron icon
- [x] Coaching Profile: Replace modal detail popout with inline row expansion (accordion-style, click row to expand/collapse)
- [x] Corrective Actions: Document Build Assist as inline panel with type chips (NTE, CAP 1, CAP 2, CAP 3)
- [x] Corrective Actions: Each CA item expands inline to show details (no modal popout)
- [x] Cache versions bumped: corrective-actions.js v=6, corrective-actions.css v=4
- [x] All 762 tests passing

## Inline Detail Panel — Complete UI/UX Overhaul (April 2026)
- [x] Coaching Profile: Redesign inline expansion panel — card-based sections (cdp-*), 2-col grid, header with type badge + icon, staggered entrance animations
- [x] Corrective Actions: Redesign inline expansion panel — matching card-based design (ca-cdp-*), NTE type icons, status-colored header
- [x] Preserve all action buttons (Acknowledge, Close, etc.) in both panels — footer with all original buttons intact
- [x] Improved information density: 2-column grids, section cards with accent bars, multiline field support
- [x] Cache versions bumped: compass-redesign.css v=102, corrective-actions.css v=5, corrective-actions.js v=7
- [x] All 762 tests passing

## UI Revisions — CA Alignment + Disputes Side Panel (April 2026)
- [x] Remove "Close" button from CA inline detail expansion (click row to collapse instead)
- [x] Align CA inline detail styling/layout to match Coaching Profile cdp-* design system — refactored to use shared cdp-* classes directly
- [x] Replace Disputes Area modal popout with side panel (drawer) expansion — slides in from right, kanban board shrinks to make room
- [x] Disputes detail body refactored to cdp-* card-based layout (header, session details, RCA, dispute trail)
- [x] Cache versions bumped: compass.js v=106, compass-redesign.css v=103
- [x] All 762 tests passing

## Fixes — Coaching Profile Layout + Disputes Card Click (April 2026)
- [x] Coaching Profile inline expansion already uses same cdp-* classes as CA — both are aligned (user may have been seeing cached old version)
- [x] Disputes Area: added try-catch with visible error alert + fallback display:block + console.warn for missing log IDs
- [x] Bumped compass.js to v=107 to force cache refresh

## Bug Fixes — Disputes Expansion + Coaching Profile Styling (April 23, 2026)
- [x] Disputes Area: Rewrote side panel from flex-based layout to full-screen overlay pattern (display:none → display:flex, position:fixed, z-index:1000) — moved element to body-level for reliable rendering
- [x] Coaching Profile: Added font-style:normal !important override on .compass-detail-panel-row td to prevent td[colspan] italic rule from cascading into inline detail panel
- [x] Cache versions bumped: compass-redesign.css v=106, compass.js v=108

## Coaching Profile + CA Inline Expansion — Complete UI/UX Overhaul (April 2026)
- [x] CDP Design System v2: Left-aligned, compact layout with accent-bar section blocks, 2-col metadata grids, full-width content blocks
- [x] Overhaul Coaching Profile inline expansion — new cdp-content-block for Coaching Details, RCA Description, Infraction Description
- [x] Overhaul Corrective Actions inline expansion — updated to use cdp-content-block for Incident Description, Policy Violated
- [x] Tighter vertical spacing (5px field padding, 8px section margin), section titles with bottom border, no ::before accent bar
- [x] Unified animation timing (0.25s, staggered 20ms→170ms) across both CP and CA
- [x] Cache versions bumped: compass-redesign.css v=107, compass.js v=109, corrective-actions.css v=6, corrective-actions.js v=8
- [x] All 762 tests passing

## Bug Fix — Acknowledgement Action Failure (April 2026)
- [x] Root cause: PATCH endpoint only handled CL- prefix and numeric IDs; alphanumeric hashes (e.g. fadc6cc9) caused Number('fadc6cc9') = NaN → SQL WHERE id = NaN → 500 error
- [x] Fix: Treat any non-numeric ID as coaching_id lookup (not just CL- prefix)
- [x] Verified: CL-prefixed, numeric, and alphanumeric IDs all return 200 OK

## Inline Expansion for Disputes Buttons + Alerts Fix + Data Fix (April 2026)
- [x] Converted all 12 disputesShow* action buttons from modal overlay to inline downward expansion within the side panel
- [x] Added _disputesOpenInlineAction() helper, disputesCollapseInlineAction(), and CSS for .disputes-inline-action-panel
- [x] Fixed Clear All notifications — added proper error handling, optimistic UI update with rollback on failure
- [x] Updated coaching log 8866a5f2 status to "Markdown Retained - QTP Manager"
- [x] Cache versions bumped: compass-redesign.css v=108, compass.js v=110, notifications.js v=104
- [x] All 762 tests passing

## Disputes Buttons Fix + CA Inline Wizard + CP Table Alignment (April 2026)
- [x] Fix Disputes Area action buttons regression — added missing class="disputes-inline-action-panel" and removed inline style="display:none" override
- [x] Convert CA Document Build Assist wizard options to inline expansion — all 3 wizard renderers (NTE, CAP 1, CAP 2/3) now target ca-inline-form-* elements; caCloseWizard() updated
- [x] Realign Coaching Profile tables to near-equal width — grid-template-columns changed from 7fr 3fr to 1fr 1fr
- [x] Remove "Session Goal" column from both Coaching Profile tables — totalCols 5→4, thead/tbody updated, expand indicator moved to person column; Session Goal remains in inline detail panel
- [x] Cache versions bumped: compass-redesign.css v=109, compass.js v=111, corrective-actions.js v=9
- [x] All 762 tests passing

## Remove Inline Add Header Bars (April 2026)
- [x] Remove "New Coaching Log — Select Type" header bar from Coaching Profile inline add panel
- [x] Place collapse button inline with the coaching type chips row (margin-left:auto pushes it to the right)
- [x] Remove "Document Build Assist" header bar from CA inline add panel
- [x] Place collapse button inline with the CA type chips row
- [x] Cleaned up dead CSS (.compass-inline-add-header, .compass-inline-add-title) and dead JS references
- [x] Cache versions bumped: compass-redesign.css v=110, compass.js v=112, corrective-actions.js v=10
- [x] All 761 tests passing

## Coaching Profile Visibility Fix — Supervisor-Based Filtering (April 2026)
- [x] TLs: "Received" table now shows logs where coachee is any team member (supervisor_name match) OR coachee is the TL themselves
- [x] SMEs: "Received" table now shows logs for their TL's team members (supervisor_name match) OR coachee is the SME themselves
- [x] TL/SME "Given" table now strictly shows logs where coach_ohr === currentUser (logs they personally filed)
- [x] Coach field on each log is NOT changed — read/filter only
- [x] Managers and admin (740045023) unchanged — see all logs
- [x] Cache version bumped: compass.js v=113
- [x] All 761 tests passing

## Bug: My Team filter shows stale agents for 740045023 (April 2026)
- [x] Root cause: stale supervisor_name data in io_employees — Montallana/Castañeda still had Arvin as supervisor
- [x] 740045023 admin bypass was not the issue — the data was wrong
- [x] Fixed via roster update: 257 employees updated with correct supervisor_name from VMO + RECALL roster files

## Roster Update: Supervisor Realignment + Field Sync (April 2026)
- [x] Update io_employees supervisor_name from File 1 (non-RECALL, 166 agents matched in DB) using Supervisor OHR lookup
- [x] Update io_employees supervisor_name from File 2 (RECALL, 91 agents matched in DB) using name matching
- [x] Update supervisor_email for 61 affected agents
- [x] Update shift_time (150), planning_group (166) from roster files
- [x] Regimen reads from io_employees — same table, no separate update needed
- [x] Verified: Arvin now has 22 agents (21 from File 1 + 1 existing SME). Montallana/Castañeda correctly reassigned.
- [x] 257 total updates executed, 0 failures. 174 agents skipped (not in io_employees).

## Support Joiner Field Improvements (April 2026)
- [x] Remove person selected in Support Joiner 1 from Support Joiner 2 options (cross-exclusion already existed, verified working + re-filter on Joiner 1 change)
- [x] Add "No Other Joining Support" as first option in Support Joiner 2 (uses __none__ sentinel, stores empty string in DB)
- [x] Search/filter bar already existed on both dropdowns (verified working)
- [x] Cache version bumped: compass.js v=114
- [x] 759 tests passing (2 supabase-sync failures are pre-existing infra issue, unrelated)

## Admin Role-Switching Toggle (April 2026)
- [x] Add Admin/Team Lead toggle card in Admin Tools page (only for 740045023) with styled toggle buttons
- [x] Store active role in window.PLAYBOOK_ROLE_PREVIEW + sessionStorage (persists across page navigations)
- [x] Global helpers: isEffectiveAdmin(), getEffectiveRole(), setRolePreview(), clearRolePreview()
- [x] Wired into compass.js (8 admin checks), corrective-actions.js (3 checks), compass-omnibar.js (2 checks)
- [x] Persistent amber banner at top of page when viewing as Team Lead
- [x] Re-initializes current module on toggle (Compass, CA, etc.)
- [x] Cache versions bumped: maintenance.js v=103, compass.js v=115, corrective-actions.js v=11, compass-omnibar.js v=103
- [x] 759 tests passing (2 supabase-sync failures are pre-existing infra issue)

## Extended Role Preview — All 5 Roles + Haven & Anchor (April 2026)
- [x] Extended toggle UI to 5 roles: Admin, Team Lead, QA, SME, Agent — each with distinct badge color
- [x] Updated setRolePreview() with ROLE_PREVIEW_MAP, getEffectiveRole() handles all 5 modes
- [x] Banner shows role-specific label via #role-preview-banner-role; sessionStorage persists
- [x] Wired role preview into Haven (havenRenderReviewArea, havenShowForm action buttons)
- [x] Wired role preview into Anchor — app.js (2x filterByRole, isRowLocked)
- [x] Wired role preview into Anchor — billing.js (canEditTargets, canSaveTargets)
- [x] _rolePreviewUpdateNav() hides admin-only sidebar groups when previewing non-admin roles
- [x] _rolePreviewRefreshModules() triggers Haven/Anchor re-init on toggle
- [x] Cache versions bumped: maintenance.js v=104, app.js v=125, billing.js v=133, haven.js v=103
- [x] 759 tests passing (2 supabase-sync failures are pre-existing infra issue)

## Remove Role Preview Mechanism (April 2026)
- [x] Removed role preview system from maintenance.js (ROLE_PREVIEW_MAP, getEffectiveRole, isEffectiveAdmin, setRolePreview, clearRolePreview, _rolePreviewUpdateNav, _rolePreviewRefreshModules)
- [x] Reverted compass.js — 8 checks back to direct isAdmin740/actual_role
- [x] Reverted corrective-actions.js — 3 checks back to direct
- [x] Reverted compass-omnibar.js — 2 checks back to direct
- [x] Reverted haven.js — 2 checks back to direct
- [x] Reverted app.js — 3 checks back to direct
- [x] Reverted billing.js — 2 checks back to direct
- [x] Removed role preview toggle card from Admin Tools HTML
- [x] Removed role preview banner from main-content HTML
- [x] Zero references to role preview remain in /server/public/
- [x] Cache versions bumped: maintenance.js v=105, compass.js v=116, corrective-actions.js v=12, compass-omnibar.js v=104, haven.js v=104, app.js v=126, billing.js v=134
- [x] 759 tests passing (2 supabase-sync failures are pre-existing infra issue)

## Comprehensive Agent View + Coaching Types + Regimen Overhaul (April 2026)

### Database
- [x] Converged 14 "Content Reviewer" actual_role values to "Agent" in io_employees

### Coaching Profile
- [x] Removed KPI stats strip for all users (compassRenderStatsStrip now hides element)
- [x] Hidden "Coaching Given" table for agents (isAgent check in compassApplyFilters)
- [x] Hidden "Add" button for agents (isAgent check hides compass-add-btn)
- [x] QA coaching types: QA Feedback, Incident Report, ZTP Coaching only (qaAllowed)
- [x] SME coaching types: all except QA Feedback, ZTP Coaching, Triad Coaching (smeExcluded)
- [x] Team Lead coaching types: all except QA Feedback, ZTP Coaching (tlExcluded)
- [x] Manager + Admin: all coaching types
- [x] Trainer coaching types: all except QA Feedback, Triad Coaching (trainerExcluded)

### Regimen
- [x] OHR column hidden for roles other than Operational SME, Team Lead, Manager, and admin
- [x] DOB added to date filter line as date range picker (dob_from, dob_to)
- [x] Removed 12 filters: personal_email, primary_address, supervisor_email, workday_id, meta_email, macbook_asset, chromebook_asset, badge_id, srt_id, badge_serial, locker_floor, locker_number
- [x] Fixed "Related PG" filter to map to complete_planning_group column
- [x] Table columns slimmed to: OHR ID, Full Name, Employment Status, Supervisor, Role, Planning Group (via getTableColumns)
- [x] Replaced modal with inline expansion (rosterToggleInlineDetail) with grouped detail fields, edit/save, and inline audit trail
- [x] Cache versions bumped: compass.js v=117, roster.js v=104
- [x] 761 tests passing (2 supabase-sync failures are pre-existing infra issue)

## Fix Duplicate Buttons + Regimen UI/UX Overhaul (April 2026)

### Bug Fix
- [x] Remove duplicate Refresh Data / Logout buttons (bottom copies)

### Regimen UI/UX Overhaul
- [x] Sticky horizontal filter bar at top of table
- [x] Filter layout: date filters on top line, identity filters on second line, remaining on third line
- [x] Add Employee + Export CSV buttons retained
- [x] Search bar below buttons, filtered count below search
- [x] Inline editable fields (click field to edit directly in expanded row)
- [x] Paginated table (50 per page) for load efficiency
- [x] Match Playbook dark-header aesthetic
- [x] Overhaul both tabs: Roster Table and Incomplete Rostering
- [x] Latency reduction: lazy load details only on expansion

## UI Fixes Batch (April 23, 2026)

### Incomplete Rostering
- [x] Fix filter bar alignment on Incomplete Rostering tab (match Roster tab layout)

### Coaching Profile
- [x] Hide Coaching Received table for Managers (they don't receive coaching)
- [x] Left-align field titles (COMMITMENTS, RATING, SENTIMENTS) in coaching acknowledgement form

### Sidebar Navigation
- [x] Simplify sidebar for agents: show "Compass" instead of "Coaching Profile" sub-tab, show "Helm" instead of "Task Board" sub-tab (since agents only have one tab in each)

### Bug Fix
- [x] Fix Compass nav simplification: only flatten for agents, non-agents keep full expandable group with all sub-tabs
- [x] Grant nav.compass + compass sub-section permissions to all non-agent roles (TL, Manager, QA, SME, Trainer)
- [x] Agents get nav.compass too but with flattened nav (direct link to Coaching Profile only, no sub-items)

## QA Feedback Status Rename (April 24, 2026)
- [x] Replace all 'Pending SME Review' with 'Pending Support Review' in QA Feedback coaching logs
- [x] Rename 'SME Joiner' label to 'Support Joiner 1' in compass-coaching.js detail panel
- [x] Rename Kanban column title 'LV1 - SME REVIEW' to 'LV1 - SUPPORT REVIEW' (also LV3 and LV5)
- [x] Audit and rename all 'SME' references in notification/email text to 'Support'
- [x] Rename 'SME Joiner' form field labels in new coaching log creation form to 'Support Joiner'

## Sandbox UI/UX Overhaul (April 24, 2026)
- [x] Create dedicated sandbox-redesign.css with Playbook design system tokens
- [x] Convert New Insight modal to inline expansion panel (like Compass inline add)
- [x] Convert Detail View modal to inline row expansion (like Regimen roster)
- [x] Agent-only review history: show status changes + comments only, hide reviewer names
- [x] Compact Job IDs: 2x5 grid instead of 10 stacked inputs
- [x] Polish table: expand arrows, status badges, hover states, alternating rows
- [x] Refresh omnibar: tighter pill styling, better spacing
- [x] Overhaul Review Area Kanban board styling
- [x] Update tests and bump cache versions

## Sandbox Comprehensive Update (April 24, 2026)
- [x] Nav simplification: agents see "Sandbox" (direct link to Input Portal), non-agents see expandable group with Input Portal + Review Area
- [x] Review Area: inline card expansion (like Compass Disputes Area) instead of modal
- [x] Review Area: search bar + planning group filter
- [x] Review Area: pagination per Kanban column (10 cards per column)
- [x] Review Area: Pending Initial Review cards actionable only by Operational SMEs (read-only for others)
- [x] Review Area: all other section cards actionable only by Trainers (read-only for others)
- [x] Input Portal: "All | My Team" toggle for admin (740045023) only
- [x] Input Portal: pagination at 25 per page

## Corrective Actions Fixes & Manual CA Log (April 24, 2026)
- [x] Fix: NTE document missing logo — restore logo reference in generated document
- [x] Fix: Remove "NTE Type" section from UI (table, detail panel, header, history)
- [x] Feature: Manual CA Log tab beside Document Build Assist — TLs can log NTEs and CAP 1-3 they manually created

## Historical Incident Report Import (April 24, 2026)
- [x] Import 14 historical incident report records into Coaching Profile as "Incident Report" coaching type

## Sandbox Nav Visibility Fix (April 24, 2026)
- [x] Agents see "Sandbox" as direct link to Input Portal (no sub-items)
- [x] Non-agents see "Sandbox" expandable group with "Input Portal" + "Review Area"
