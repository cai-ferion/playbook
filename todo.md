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
