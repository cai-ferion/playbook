# Roster Cross-Examination & Inactive Import Report

**Date:** April 16, 2026
**Source:** Google Sheet — [ROSTER & INACTIVE Sheets](https://docs.google.com/spreadsheets/d/1ah5GY1zoGBy6T2IUCSPWPsUzYRyPUb3WCkEfVgskfRQ/edit?gid=1996701208)
**Target:** `io_employees` table in Playbook database

---

## 1. ROSTER Cross-Examination

**Scope:** 403 employees on the ROSTER sheet compared against 403 employees in the `io_employees` database.

**Fields Compared:** OHR ID, Full Name, Actual Role, Supervisor Name, Supervisor Email, Planning Group, Employment Status, Shift Time, Work Off

### Result: 1 Discrepancy Found

| OHR | Employee | Field | Google Sheet Value | Database Value |
|-----|----------|-------|--------------------|----------------|
| 740036814 | Bernal, John Henry De Leon | Actual Role | Team Lead | Operational SME |

All other 402 employees matched exactly across all compared fields.

---

## 2. INACTIVE Sheet Import

**Scope:** 97 rows on the INACTIVE sheet parsed and imported into the database.

### Parsing Summary

| Metric | Count |
|--------|-------|
| Total rows in INACTIVE sheet | 97 |
| Empty/invalid rows skipped | 9 |
| Duplicate (already in ROSTER DB) | 1 (Bermejo, Chrisrei Cruz — 740041876) |
| Duplicate within INACTIVE sheet | 3 (Reyes, Wilhelm, Velasco appeared twice each) |
| Unique new employees parsed | 84 |

### Column Format Issue

The INACTIVE sheet had **two different column formats**:
- **Format A** (rows 1–17): Standard header alignment — no SRT Name column between Billing Name and Employment Status.
- **Format B** (rows 18+): Extra SRT Name column inserted at index 8, shifting all subsequent columns by 1.

A smart parser was built to auto-detect the format per row using heuristics (valid status values, email patterns, role validation). Two rows required manual correction:

| OHR | Employee | Issue | Fix Applied |
|-----|----------|-------|-------------|
| 740046018 | Castro, Sarrah Jane Minguez | Role parsed as "Active" (column shift) | Set to "Quality & Policy Expert" (Access Level 3) |
| 740049614 | Venzuela, Marlon Alexis Bautista | Role parsed as "Active" (column shift) | Set to "Content Reviewer" (Access Level 1) |

### Import Results

| Metric | Count |
|--------|-------|
| Successfully inserted | 84 |
| Skipped (duplicate OHR within sheet) | 3 |
| Errors | 0 |

### Schema Modifications

Three columns were widened to accommodate longer values from the INACTIVE sheet:

| Column | Old Type | New Type | Reason |
|--------|----------|----------|--------|
| `planning_group` | VARCHAR(100) | TEXT | Multi-PG values exceeded 100 chars |
| `srt_status` | VARCHAR(50) | VARCHAR(255) | Longer status descriptions |
| `locker_number` | VARCHAR(20) | VARCHAR(100) | Format "28 - 163" with extra data |

### Final Database State

| Status | Count |
|--------|-------|
| Active | 394 |
| Inactive | 93 |
| **Total** | **487** |

The 93 Inactive employees include:
- 9 employees that were already tagged Inactive in the original database
- 84 newly imported from the INACTIVE sheet

---

## 3. Recommended Actions

1. **Resolve Bernal's role discrepancy** — Confirm whether John Henry De Leon Bernal (740036814) should be "Team Lead" (per Google Sheet) or "Operational SME" (per database). Update the incorrect source accordingly.

2. **Review Bermejo's status** — Chrisrei Cruz Bermejo (740041876) appears on both the ROSTER (Active) and INACTIVE sheets. Confirm current employment status.

3. **INACTIVE sheet column alignment** — The sheet has inconsistent column formats starting at row 18. Consider standardizing the column structure to prevent future parsing issues.
