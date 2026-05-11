# Phase 1 Investigation Findings — Anchor Input Portal Enhancements

## Current Inline Expansion (input-compact.js → renderDetailPanel)

**Location:** `server/public/js/input-compact.js` lines 272–400

**Currently displayed fields:**
| Field | Key | Editable By | DB Column |
|-------|-----|-------------|-----------|
| TAG | tag | All editors (not WFM) | tag |
| WFM TAG | wfm_tag | Read-only for all | wfm_tag |
| REASON | uplReason | All editors (only when tag=UPL/LATE) | upl_reason |
| OT HOURS | ot | All editors (restricted for S-ABF/CS-ABF agents after 2026-04-10 unless admin) | ot_hours |
| REMARKS | remarks | All editors | remarks |
| STATUS | status | Managers + Admins only | snap_status |
| BILLING ROLE | role | All editors | role |
| BILLING PLANNING GROUP | actualPlanningGroup | All editors | planning_group |
| INTERNAL ROLE | internalRole | Read-only | — |
| INTERNAL PLANNING GROUP | internalPlanningGroup | Read-only | — |
| AUDIT TRAIL | — | Read-only | — |

**NOT currently in inline expansion:**
- Supervisor (flm / snap_supervisor)
- Shift Time (shiftTime / snap_shift_time)
- Billing Name (snap_billing_name)

## Save Flow

1. User edits field → `handleCellEdit(el)` in app.js (line 2019)
2. Stores in `appState.pendingEdits[recordId][key]`
3. User clicks Save → `confirmSave()` maps keys via `fieldMap`:
   - `{ tag: 'tag', uplReason: 'upl_reason', remarks: 'remarks', ot: 'ot_hours', role: 'role', actualPlanningGroup: 'planning_group', status: 'snap_status' }`
4. Calls `saveRecords(edits)` in data.js (line 722)
5. `saveRecords` builds payload per record and PATCHes `/api/io/attendance/:id`
6. **BUG:** `saveRecords` does NOT include `snap_status` in its payload builder — only tag, upl_reason, remarks, ot_hours, role, planning_group. Status edits may be silently dropped!

## Backend PATCH /:id (attendance.ts line 221)

**fieldMap for audit:** `{ tag, upl_reason, remarks, ot_hours, role, planning_group, snap_status }`
- Does NOT include: snap_supervisor, snap_shift_time, snap_billing_name

**Needs to be added for Phase 2:** snap_supervisor

## Bulk Tag (input-compact.js)

**Frontend:** Available to all users (the Select Rows button is always visible unless WFM).
**Backend:** No role gate — anyone can call `/attendance/bulk-tag` and `/attendance/bulk-tag-filtered`.
**Status:** Already available to all editors. ✅ (just need to verify WFM exclusion is correct)

## Bulk Status (input-compact.js)

**Frontend:** The `.fcb-status-only` elements are shown only when `isStatusEditor` is true:
```js
var isStatusEditor = cu && (cu.actual_role === 'Manager' || _ADMIN_OHRS_BULK.indexOf(cu.ohr_id) !== -1 || (cu.permissions && cu.permissions['anchor.edit_attendance']));
```
**Issue:** `anchor.edit_attendance` permission makes it available to non-managers too. Should be restricted to Manager + Admin ONLY.

**Backend:** Both `/attendance/bulk-status` and `/attendance/bulk-status-filtered` have role gate:
- Checks `ADMIN_OHRS.includes(actor_ohr)` OR `actor.role === "Manager"`
- ✅ Backend is correctly restricted.

**Fix needed:** Frontend `isStatusEditor` should NOT include `anchor.edit_attendance` permission check.

## Bulk Field Change (NEW — Phase 5)

**Does not exist yet.** Need to build:
- New endpoint: `/attendance/bulk-field-filtered` (POST)
- Frontend: New dropdown in floating command bar for field selection + value input
- Permission: Admin + Manager only (same as bulk status)

## Summary of Changes Needed

### Phase 2: Supervisor in inline expansion
- Add `flm` field to renderDetailPanel (editable select for admin/manager, readonly for others)
- Add `snap_supervisor` to backend PATCH fieldMap
- Add `snap_supervisor` to saveRecords payload builder
- Also fix: add `snap_status` to saveRecords payload (existing bug)

### Phase 3: Bulk tag permissions
- Already available to all editors ✅
- Just verify WFM users can't access it (already gated by select-mode-btn hidden for WFM) ✅

### Phase 4: Bulk status restriction
- Frontend: Remove `anchor.edit_attendance` from isStatusEditor check → only Manager + Admin
- Backend: Already correct ✅

### Phase 5: Bulk field change
- New backend endpoint with Manager/Admin gate
- New UI in floating command bar (field dropdown + value input)
- Applies to all records matching current filter
