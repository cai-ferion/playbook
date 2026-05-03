# Database Migrations SOP

**Document Owner:** TL Arvin  
**Last Updated:** May 2026  
**Applies To:** Playbook BPO Workforce Management Application  
**Stack:** Drizzle ORM + MySQL/TiDB + Manus Platform

---

## 1. Overview

This Standard Operating Procedure defines the workflow for making schema changes to the Playbook production database. The goal is to ensure every migration is traceable, reversible, and applied without data loss or downtime.

Playbook uses **Drizzle ORM** as the schema-first source of truth. The TypeScript schema file (`drizzle/schema.ts`) is the canonical definition of the database structure. All changes flow through a generate-review-apply pipeline.

---

## 2. Migration Workflow

The migration lifecycle follows four stages. Every schema change must pass through all four in order.

| Stage | Action | Tool | Output |
|-------|--------|------|--------|
| **1. Define** | Edit `drizzle/schema.ts` | Code editor | Updated TypeScript schema |
| **2. Generate** | Run `pnpm drizzle-kit generate` | CLI | `.sql` migration file in `drizzle/` |
| **3. Review** | Read the generated SQL file | Manual inspection | Verified migration intent |
| **4. Apply** | Execute SQL via `webdev_execute_sql` | Manus Platform | Schema applied to database |

### 2.1 Stage 1 — Define the Schema Change

Edit `drizzle/schema.ts` to reflect the desired end state. Drizzle uses a declarative model: you describe what the schema **should look like**, not what changed.

**Rules:**
- One logical change per migration (do not bundle unrelated table changes)
- Add columns as nullable or with defaults to avoid breaking existing rows
- Never rename columns directly — add new column, migrate data, drop old column (three-step rename)
- Document the business reason in a comment above the changed field

### 2.2 Stage 2 — Generate the Migration SQL

```bash
pnpm drizzle-kit generate
```

This produces a numbered `.sql` file (e.g., `0032_cool_hero_name.sql`) in the `drizzle/` directory. The file contains the exact DDL statements that will be executed.

**Important:** This step only generates the file. It does NOT execute anything against the database.

### 2.3 Stage 3 — Review the Generated SQL

Before applying, **always read the generated SQL file** and verify:

| Check | What to look for |
|-------|-----------------|
| **Additive only?** | Prefer `ADD COLUMN` over `MODIFY COLUMN` or `DROP COLUMN` |
| **Default values?** | New NOT NULL columns must have a `DEFAULT` clause |
| **Index impact?** | Large table index additions may lock the table — schedule during low traffic |
| **Data preservation?** | No `TRUNCATE`, `DROP TABLE`, or `DELETE` unless explicitly intended |
| **Foreign key order?** | Referenced tables must exist before FK constraints are added |

### 2.4 Stage 4 — Apply the Migration

Use the Manus Platform's `webdev_execute_sql` tool to run the SQL against the live database. This is the point of no return — once applied, the schema change is live.

**Pre-apply checklist:**
- [ ] Schema change tested locally (TypeScript compiles without errors)
- [ ] Generated SQL reviewed and understood
- [ ] Backup awareness: know what data could be affected
- [ ] Low-traffic window preferred for destructive operations

---

## 3. Rollback Strategy

Database schema changes are inherently difficult to reverse. The rollback strategy depends on the type of change.

### 3.1 Rollback Matrix

| Change Type | Rollback Method | Risk Level |
|-------------|----------------|------------|
| Add column | `ALTER TABLE DROP COLUMN` | Low — no data loss |
| Add table | `DROP TABLE` | Low — if table is empty |
| Add index | `DROP INDEX` | Low — no data loss |
| Modify column type | Reverse `ALTER TABLE MODIFY` | Medium — potential data truncation |
| Drop column | **Not reversible** — data is gone | High |
| Drop table | **Not reversible** — data is gone | Critical |
| Rename column | Reverse rename (if no code deployed) | Medium |

### 3.2 Rollback Procedure

1. **Identify the migration** that needs reversal (check `drizzle/` directory for the file)
2. **Write the reverse SQL** manually (Drizzle does not auto-generate rollbacks)
3. **Review the reverse SQL** — ensure it won't break dependent code
4. **Apply via `webdev_execute_sql`** in a low-traffic window
5. **Revert `drizzle/schema.ts`** to match the rolled-back state
6. **Run `pnpm drizzle-kit generate`** to confirm schema and DB are in sync (should produce empty migration)

### 3.3 Rollback Script Template

For every migration that modifies or drops existing structures, write a companion rollback script and store it in `drizzle/migrations/`:

```sql
-- Rollback for: 0032_cool_hero_name.sql
-- Reason: [describe why this rollback might be needed]
-- Date: YYYY-MM-DD

ALTER TABLE io_employees DROP COLUMN IF EXISTS new_column_name;
```

---

## 4. Naming Conventions

Drizzle auto-generates migration file names with a sequential number and random codename (e.g., `0032_cool_hero_name.sql`). Do not rename these files — the sequence number is used for ordering.

For manual migration scripts stored in `drizzle/migrations/`, use descriptive names:

```
add_indexes_phase1.sql
add_version_columns.sql
rollback_0032_cool_hero_name.sql
```

---

## 5. Dangerous Operations Checklist

Before executing any of the following, pause and verify with the team:

| Operation | Required Verification |
|-----------|----------------------|
| `DROP TABLE` | Confirm no code references the table; data is backed up or expendable |
| `DROP COLUMN` | Confirm no code reads/writes the column; data is expendable |
| `TRUNCATE TABLE` | Confirm data loss is intentional and approved |
| `ALTER TABLE MODIFY` (type change) | Confirm existing data fits the new type without truncation |
| `ALTER TABLE RENAME` | Confirm all code references are updated simultaneously |
| Adding `NOT NULL` without default | Confirm all existing rows have values (or add default first) |

---

## 6. Environment-Specific Notes

### 6.1 Manus Platform (Production)

- Database: TiDB (MySQL-compatible)
- Connection: Via `DATABASE_URL` environment variable (auto-injected)
- SSL: Required — enabled by default in the connection string
- Execution: Via `webdev_execute_sql` tool only (no direct CLI access)
- **Data is NOT recoverable** — exercise extreme caution with destructive commands

### 6.2 Local Development

- The dev server uses the same production database (no separate dev DB)
- All schema changes in development immediately affect production data
- Test schema changes on a branch with non-destructive operations first

---

## 7. Migration History

The project currently has **32 numbered migrations** (0000–0031) plus one out-of-sequence migration (0099) and two manual scripts. All migrations are stored in the `drizzle/` directory and serve as the audit trail.

To view migration history:
```bash
ls drizzle/00*.sql
```

---

## 8. Common Patterns

### 8.1 Adding a New Column

```typescript
// drizzle/schema.ts
export const ioEmployees = mysqlTable("io_employees", {
  // ... existing columns ...
  newField: varchar("new_field", { length: 255 }).default(""),  // Always nullable or with default
});
```

Then: `pnpm drizzle-kit generate` → review SQL → `webdev_execute_sql`

### 8.2 Adding an Index

```typescript
// drizzle/schema.ts — add to table definition or use index helper
import { index } from "drizzle-orm/mysql-core";

// In table definition:
(table) => ({
  nameIdx: index("idx_employees_name").on(table.full_name),
})
```

### 8.3 Safe Column Rename (Three-Step)

**Step 1:** Add new column with desired name
```sql
ALTER TABLE io_employees ADD COLUMN preferred_name VARCHAR(255);
UPDATE io_employees SET preferred_name = old_name;
```

**Step 2:** Deploy code that reads/writes both columns (transition period)

**Step 3:** Drop old column after confirming no code uses it
```sql
ALTER TABLE io_employees DROP COLUMN old_name;
```

---

## 9. Emergency Procedures

If a migration causes a production incident:

1. **Do NOT panic-rollback** without understanding the impact
2. Check if the issue is code-related (deploy rollback via checkpoint) or data-related
3. If code rollback fixes it → rollback the checkpoint, then plan a proper schema fix
4. If data is corrupted → assess scope, notify stakeholders, apply targeted fix SQL
5. Document the incident in the audit log for the weekly ops review

---

## 10. Audit & Compliance

Every migration must be traceable. The audit trail consists of:

- **Git history** of `drizzle/schema.ts` changes (who changed what, when)
- **Migration SQL files** in `drizzle/` directory (what was executed)
- **Manus checkpoint history** (when it was deployed)
- **todo.md entries** (why the change was made)

For SOX/compliance reviews, the combination of these four artifacts provides full change traceability from business requirement to production execution.
