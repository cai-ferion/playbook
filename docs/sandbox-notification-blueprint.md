# Sandbox Notification Blueprint

**Module:** Sandbox (Insights Tracker)
**Author:** Manus AI — Principal Solutions Architect
**Date:** April 24, 2026
**Version:** 1.0

---

## 1. Executive Summary

The Sandbox module currently operates with **zero in-app notification integration**. Every state transition — from submission to initial review, final review, elevation, trainer status changes, and implementation — produces only a `showToast()` confirmation visible to the actor performing the action. The submitter, their supervisor, and downstream reviewers receive no automated alerts when an insight moves through the pipeline. This blueprint defines the complete notification architecture for Sandbox, mapping every process trigger to its target audience, notification type, message template, and metadata payload.

---

## 2. Process Analysis — Current State

### 2.1 Insight Lifecycle

The Sandbox module manages a six-stage Kanban workflow for process improvement insights submitted by agents and reviewed by Operational SMEs and Trainers.

| Stage | Status Value | Actor | Current Notification | Gap |
|-------|-------------|-------|---------------------|-----|
| Submission | `Pending Initial Review` | Agent (any role) | Toast to submitter only | Reviewer not alerted |
| Initial Accept | `Pending Final Review` | Operational SME | Toast to reviewer only | Submitter not alerted |
| Initial Reject | `Rejected - Initial Review [Reason]` | Operational SME | Toast to reviewer only | Submitter not alerted |
| Final Accept | `Elevated - *` (4 sub-statuses) | Trainer | Toast to reviewer only | Submitter + SME not alerted |
| Final Reject | `Rejected - Final Review [Reason]` | Trainer | Toast to reviewer only | Submitter + SME not alerted |
| Trainer Status Change | `Elevated - *` or `Implemented` | Trainer | Toast to reviewer only | Submitter + SME not alerted |

### 2.2 Role Matrix

| Role | Can Submit | Can Review (Initial) | Can Review (Final) | Can Change Trainer Status | Receives Notifications (Current) |
|------|-----------|---------------------|-------------------|--------------------------|--------------------------------|
| Agent / Process Associate | Yes | No | No | No | None |
| Team Lead | Yes | No | No | No | None |
| Operational SME | Yes | Yes | No | No | None |
| Trainer | Yes | No | Yes | Yes | None |
| Content Reviewer | Yes | Yes | No | No | None |
| Manager | Yes | No | No | No | None |
| Admin (OHR 740045023) | Yes | Yes | Yes | Yes | None |

### 2.3 Key Observations

**No feedback loop exists.** When an agent submits an insight, they have no way to know it has been reviewed unless they manually check the Input Portal. This creates a "fire and forget" dynamic that discourages participation.

**Reviewers have no queue alerts.** Operational SMEs and Trainers must manually open the Review Area to discover new items. There is no nudge mechanism, which means insights can sit in "Pending" status indefinitely without anyone noticing.

**Status changes in the Trainer's Area are silent.** When a Trainer moves an insight from "Task in Progress" to "Implemented," the original submitter and the initial reviewer who championed it receive no closure notification.

**No escalation or aging mechanism.** Unlike Compass (which has dispute aging alerts every 4 hours), Sandbox has no time-based reminders for stale insights.

---

## 3. Proposed Notification Types

### 3.1 Type Registry

| Notification Type | Trigger | Target(s) | Priority |
|-------------------|---------|-----------|----------|
| `insight_submitted` | Agent submits a new insight | All Operational SMEs in the submitter's PG | Medium |
| `insight_initial_accepted` | SME accepts at Initial Review | Submitter (agent) | Medium |
| `insight_initial_rejected` | SME rejects at Initial Review | Submitter (agent) | Medium |
| `insight_final_accepted` | Trainer accepts at Final Review | Submitter + Initial Reviewer | Medium |
| `insight_final_rejected` | Trainer rejects at Final Review | Submitter + Initial Reviewer | Medium |
| `insight_status_changed` | Trainer changes elevated status | Submitter + Initial Reviewer | Low |
| `insight_implemented` | Trainer marks as Implemented | Submitter + Initial Reviewer + Supervisor | High |
| `insight_review_pending` | Cron: insight pending > 48h | Applicable reviewers (SME or Trainer) | Medium |
| `insight_weekly_summary` | Cron: Monday 8:30 AM PHT | All SMEs + Trainers + Admin | Low |

### 3.2 Detailed Specifications

#### `insight_submitted`

This notification fires when any user submits a new insight via `sandboxSubmitNew()`. It targets all Operational SMEs and Content Reviewers whose planning group matches the submitter's planning group, alerting them that a new item has entered the "Pending Initial Review" queue.

```
Title:    "New Insight Submitted — {insight_title}"
Message:  "{submitter_name} submitted a new insight: {insight_title} ({insight_id})"
Metadata: { insight_id, submitter, planning_group, category, proposal_type }
Target:   Each SME/Content Reviewer OHR in the same PG (individual notifications)
```

#### `insight_initial_accepted`

This notification fires when an Operational SME or Content Reviewer accepts an insight at the Initial Review stage, moving it to "Pending Final Review." It notifies the original submitter that their insight has progressed.

```
Title:    "Insight Accepted — Initial Review"
Message:  "Your insight '{insight_title}' has been accepted and is now pending final review."
Metadata: { insight_id, reviewer, comments }
Target:   Submitter OHR
```

#### `insight_initial_rejected`

This notification fires when an SME rejects an insight at Initial Review. The submitter receives the rejection reason and any reviewer comments, providing actionable feedback.

```
Title:    "Insight Rejected — Initial Review"
Message:  "Your insight '{insight_title}' was rejected: {reason}."
Metadata: { insight_id, reviewer, reason, comments }
Target:   Submitter OHR
```

#### `insight_final_accepted`

This notification fires when a Trainer accepts an insight at Final Review, elevating it to one of the Trainer's Area statuses. Both the submitter and the initial reviewer are notified.

```
Title:    "Insight Elevated — {elevated_status}"
Message:  "Insight '{insight_title}' has been elevated to '{elevated_status}' after final review."
Metadata: { insight_id, reviewer, elevated_status, comments }
Target:   Submitter OHR + Initial Reviewer OHR (2 notifications)
```

#### `insight_final_rejected`

This notification fires when a Trainer rejects an insight at Final Review. Both the submitter and the initial reviewer are notified with the rejection reason.

```
Title:    "Insight Rejected — Final Review"
Message:  "Insight '{insight_title}' was rejected at final review: {reason}."
Metadata: { insight_id, reviewer, reason, comments }
Target:   Submitter OHR + Initial Reviewer OHR (2 notifications)
```

#### `insight_status_changed`

This notification fires when a Trainer changes the status of an elevated insight within the Trainer's Area (e.g., from "Task in Progress" to "Pending POC Discussion"). It keeps stakeholders informed of progress.

```
Title:    "Insight Status Updated — {new_status}"
Message:  "Insight '{insight_title}' status changed from '{old_status}' to '{new_status}'."
Metadata: { insight_id, old_status, new_status, changed_by }
Target:   Submitter OHR + Initial Reviewer OHR (2 notifications)
```

#### `insight_implemented`

This is the highest-priority Sandbox notification. It fires when a Trainer marks an insight as "Implemented," closing the loop. The submitter, initial reviewer, and the submitter's supervisor are all notified.

```
Title:    "Insight Implemented — {insight_title}"
Message:  "Congratulations! Your insight '{insight_title}' has been implemented."
Metadata: { insight_id, implementation_date, implemented_by }
Target:   Submitter OHR + Initial Reviewer OHR + Supervisor OHR (3 notifications)
```

#### `insight_review_pending` (Cron)

This is a time-based reminder that fires when an insight has been sitting in "Pending Initial Review" for more than 48 hours or "Pending Final Review" for more than 72 hours. It nudges the appropriate reviewers to take action.

```
Title:    "Insight Awaiting Review — {insight_title}"
Message:  "{count} insight(s) pending your review for {hours}+ hours."
Metadata: { insight_ids, pending_since, review_tier }
Target:   Applicable SMEs/Trainers by PG (individual notifications)
Schedule: Every 12 hours (06:00 UTC, 18:00 UTC → 2:00 PM PHT, 2:00 AM PHT)
Dedup:    Skip if already notified within 24 hours for the same insight
```

#### `insight_weekly_summary` (Cron)

A weekly digest summarizing Sandbox activity, similar to the existing Compass weekly digest. It provides a snapshot of submission volume, review throughput, and implementation count.

```
Title:    "Weekly Sandbox Summary"
Message:  "This week: {submitted} submitted, {reviewed} reviewed, {implemented} implemented, {pending} pending."
Metadata: { submitted, reviewed, implemented, pending, rejected }
Target:   All SMEs + Trainers + Admin (individual notifications)
Schedule: Monday 8:30 AM PHT (00:30 UTC Monday)
```

---

## 4. UI Registry Additions

The following entries must be added to `notifications.js` to support the new Sandbox notification types.

### 4.1 Icon Registry (`getNotifIcon`)

| Type | Icon Concept | Stroke Color |
|------|-------------|-------------|
| `insight_submitted` | Lightbulb | `#3B82F6` (blue) |
| `insight_initial_accepted` | Check circle | `#22c55e` (green) |
| `insight_initial_rejected` | X circle | `#EF4444` (red) |
| `insight_final_accepted` | Double check | `#10B981` (emerald) |
| `insight_final_rejected` | X circle | `#DC2626` (dark red) |
| `insight_status_changed` | Refresh/arrows | `#8B5CF6` (purple) |
| `insight_implemented` | Star/trophy | `#7C3AED` (violet) |
| `insight_review_pending` | Clock/alert | `#F59E0B` (amber) |
| `insight_weekly_summary` | Calendar/chart | `#06B6D4` (cyan) |

### 4.2 Label Registry (`getNotifTagLabel`)

| Type | Label |
|------|-------|
| `insight_submitted` | `Insight` |
| `insight_initial_accepted` | `Accepted` |
| `insight_initial_rejected` | `Rejected` |
| `insight_final_accepted` | `Elevated` |
| `insight_final_rejected` | `Rejected` |
| `insight_status_changed` | `Updated` |
| `insight_implemented` | `Implemented` |
| `insight_review_pending` | `Pending` |
| `insight_weekly_summary` | `Digest` |

### 4.3 Color Registry (`getNotifColor`)

| Type | Hex Color |
|------|-----------|
| `insight_submitted` | `#3B82F6` |
| `insight_initial_accepted` | `#22c55e` |
| `insight_initial_rejected` | `#EF4444` |
| `insight_final_accepted` | `#10B981` |
| `insight_final_rejected` | `#DC2626` |
| `insight_status_changed` | `#8B5CF6` |
| `insight_implemented` | `#7C3AED` |
| `insight_review_pending` | `#F59E0B` |
| `insight_weekly_summary` | `#06B6D4` |

### 4.4 Brief Renderer (`getNotifBrief`)

A new `case` block should be added for Sandbox types:

```
case 'insight_submitted':
case 'insight_initial_accepted':
case 'insight_initial_rejected':
case 'insight_final_accepted':
case 'insight_final_rejected':
case 'insight_status_changed':
case 'insight_implemented': {
  const meta = tryParseMeta(n.metadata);
  return meta.insight_id ? `${meta.insight_id} — ${n.message?.substring(0, 60) || ''}` : n.message?.substring(0, 60) || '';
}
case 'insight_review_pending': {
  const meta = tryParseMeta(n.metadata);
  return `${meta.count || ''} insight(s) awaiting your review`;
}
```

### 4.5 Detail Renderer (`showNotifDetailCard`)

A new `case` block for the detail card overlay:

```
case 'insight_submitted':
case 'insight_initial_accepted':
case 'insight_initial_rejected':
case 'insight_final_accepted':
case 'insight_final_rejected':
case 'insight_status_changed':
case 'insight_implemented':
  if (meta.insight_id) detailRows += row('Insight ID', meta.insight_id);
  if (meta.reviewer) detailRows += row('Reviewer', meta.reviewer);
  if (meta.reason) detailRows += row('Reason', meta.reason);
  if (meta.elevated_status) detailRows += row('Status', meta.elevated_status);
  if (meta.comments) detailRows += row('Comments', meta.comments);
  break;
```

---

## 5. Implementation Approach

### 5.1 Client-Side Triggers (sandbox.js)

The following functions in `sandbox.js` need notification calls added:

| Function | Notification Type | Insert Point |
|----------|------------------|-------------|
| `sandboxSubmitNew()` | `insight_submitted` | After successful POST, before `sandboxCloseInlineForm()` |
| `sandboxSubmitAccept(tier)` | `insight_initial_accepted` or `insight_final_accepted` | After successful PATCH |
| `sandboxSubmitReject(tier)` | `insight_initial_rejected` or `insight_final_rejected` | After successful PATCH |
| `sandboxSubmitFinalApprove()` | `insight_final_accepted` | After successful PATCH |
| `sandboxSubmitTrainerStatus()` | `insight_status_changed` or `insight_implemented` | After successful PATCH |

Each call should follow the existing pattern used in `compass.js` and `helm.js`:

```javascript
createNotification({
  type: 'insight_submitted',
  title: 'New Insight Submitted — ' + title,
  message: submitterName + ' submitted: ' + title + ' (' + insightId + ')',
  target_ohr: reviewerOhr,
  metadata: { insight_id: insightId, submitter: submitterName, planning_group: pg, category: cat }
});
```

### 5.2 Reviewer OHR Resolution

To target the correct reviewers, the notification logic needs to resolve OHRs from the employee list. The pattern already exists in `sandboxRenderKanban()` where role-based PG filtering is applied:

```javascript
// Find all SMEs in the submitter's planning group
const reviewers = SANDBOX_MOD.employees.filter(e =>
  (e.actual_role === 'Operational SME' || e.actual_role === 'Content Reviewer') &&
  e.planning_group === submitterPg
);
for (const reviewer of reviewers) {
  createNotification({ type: 'insight_submitted', ..., target_ohr: reviewer.ohr_id });
}
```

For notifications that need the submitter's OHR (accept/reject/implement), the insight record already contains `ohr_id` and `submitter` fields.

### 5.3 Server-Side Cron Jobs (auto-mailer.ts)

Two new cron functions should be added to `auto-mailer.ts`:

**`checkInsightReviewPending`** — Runs every 12 hours, queries `io_insights` for items where `status = 'Pending Initial Review'` and `created_at < NOW() - 48h`, or `status = 'Pending Final Review'` and the initial review date is older than 72 hours. Deduplicates by checking for existing `insight_review_pending` notifications within the last 24 hours for the same insight.

**`sendInsightWeeklyDigest`** — Runs Monday 8:30 AM PHT, counts submissions, reviews, implementations, and pending items from the last 7 days. Sends to all SMEs, Trainers, and Admin.

Both functions should follow the exact pattern of the existing `checkCoachingAckOverdue` and `sendWeeklyDigest` functions, including manual trigger endpoints:

```
POST /api/io/insight-review-pending-check
POST /api/io/insight-weekly-digest
```

---

## 6. Recommendations

### 6.1 Priority Implementation Order

The notifications should be implemented in the following order, based on impact and complexity:

| Priority | Type(s) | Rationale |
|----------|---------|-----------|
| **P0 — Critical** | `insight_initial_accepted`, `insight_initial_rejected` | Closes the feedback loop for agents. Highest impact on participation. |
| **P0 — Critical** | `insight_implemented` | Celebrates success, reinforces the value of submitting insights. |
| **P1 — High** | `insight_submitted` | Alerts reviewers to new items, reduces review latency. |
| **P1 — High** | `insight_final_accepted`, `insight_final_rejected` | Keeps submitters informed through the full pipeline. |
| **P2 — Medium** | `insight_review_pending` | Prevents insights from going stale. Requires cron job. |
| **P2 — Medium** | `insight_status_changed` | Keeps stakeholders informed of trainer-area progress. |
| **P3 — Low** | `insight_weekly_summary` | Operational visibility. Can be deferred. |

### 6.2 Additional Recommendations

**Deep-link from notification to insight.** When a user clicks a Sandbox notification in the sidebar, the detail card should include a "View Insight" button that navigates to the Sandbox Input Portal and auto-expands the relevant row. This requires passing `insight_id` in the metadata and adding a click handler in `handleNotifClick()` that calls `sandboxToggleDetail(insightId)`.

**Consider server-side notification creation for accept/reject.** Currently, the PATCH endpoint in `io-routes.ts` is a generic update that does not inspect what changed. For robustness, the server could detect status transitions and create notifications server-side (similar to how OT and NTE notifications work in `io-routes.ts`). This eliminates the risk of client-side notification failures and ensures notifications fire even if the reviewer's browser loses connectivity after the PATCH succeeds.

**Add a "My Insights" notification filter.** The notification sidebar currently groups by date. Adding a filter chip for "Sandbox" would let agents quickly see only insight-related notifications, especially useful for prolific submitters.

**Implement a "Thank You" notification on implementation.** When an insight reaches "Implemented" status, the notification to the submitter should include a congratulatory tone and optionally reference the implementation date. This small touch reinforces the culture of continuous improvement.

**Rate-limit reviewer notifications.** If multiple insights are submitted in rapid succession (e.g., during a team submission drive), batch them into a single "X new insights submitted" notification instead of sending one per insight. A 15-minute batching window would prevent notification fatigue.

---

## 7. Testing Strategy

The notification simulation test (`notification-simulation.test.ts`) should be extended with a new `describe("Sandbox Module Notifications")` block that validates:

1. All 9 new notification types are registered in the icon, label, and color registries.
2. `sandbox.js` calls `createNotification()` with the correct type for each process trigger.
3. The cron functions `checkInsightReviewPending` and `sendInsightWeeklyDigest` exist in `auto-mailer.ts`.
4. Manual trigger endpoints exist for both cron functions.
5. Role-based targeting is correct (SMEs for initial review, Trainers for final review).
6. Deduplication logic prevents duplicate pending-review alerts within 24 hours.

---

## 8. Summary

The Sandbox module handles a critical operational process — capturing and implementing agent-driven improvements — but currently operates in a notification vacuum. Implementing the 9 notification types defined in this blueprint will close the feedback loop for submitters, reduce review latency through proactive alerts, and provide operational visibility through weekly digests. The implementation follows the exact patterns already established in Compass and the auto-mailer, ensuring consistency across the Playbook platform.
