/**
 * Manager's Nook API Routes
 * Consolidated supervisor scorecard: tardiness, coaching coverage, insights, shrinkage.
 * Access: Managers + Admin only.
 */
import { Router, Request, Response } from "express";
import { getDb } from "./db.js";
import { sql } from "drizzle-orm";

const router = Router();

// ── Helper: get list of months for the rolling window ──
function getMonthRange(months: number): string[] {
  const result: string[] = [];
  const now = new Date();
  for (let i = 0; i < months; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    result.push(`${yyyy}-${mm}`);
  }
  return result;
}

// ── Helper: derive month from YYYY-MM-DD date string ──
function dateToMonth(dateStr: string): string {
  return dateStr ? dateStr.substring(0, 7) : "";
}

/**
 * GET /api/io/managers-nook/scorecard
 * Query params:
 *   months (optional, default=3) — rolling window
 *   month  (optional) — specific month YYYY-MM to focus on
 * Returns: { months: string[], supervisors: SupervisorRow[] }
 */
router.get("/scorecard", async (req: Request, res: Response) => {
  try {
    const db = await getDb();
    if (!db) return res.status(500).json({ error: "DB unavailable" });

    const monthCount = parseInt(req.query.months as string) || 3;
    const specificMonth = req.query.month as string;
    const monthRange = specificMonth ? [specificMonth] : getMonthRange(monthCount);
    const oldestMonth = monthRange[monthRange.length - 1]; // e.g. "2026-02"
    const newestMonth = monthRange[0];

    // ── 1. Get active supervisors: only those who are active TLs AND have active agents ──
    const [supervisorRows] = (await db.execute(sql`
      SELECT DISTINCT e.supervisor_name
      FROM io_employees e
      WHERE e.actual_role = 'Agent'
        AND e.supervisor_name IS NOT NULL
        AND e.supervisor_name != ''
        AND e.employement_status != 'Offboarded'
        AND EXISTS (
          SELECT 1 FROM io_employees sup
          WHERE sup.full_name = e.supervisor_name
            AND sup.employement_status != 'Offboarded'
            AND sup.actual_role IN ('Team Lead', 'TL', 'Supervisor')
        )
      ORDER BY e.supervisor_name ASC
    `)) as unknown as [any[], any];
    const supervisors = supervisorRows.map((r: any) => r.supervisor_name);

    // ── 2. Get agent counts per supervisor ──
    const [agentCountRows] = (await db.execute(sql`
      SELECT supervisor_name, COUNT(DISTINCT ohr_id) as agent_count
      FROM io_employees
      WHERE actual_role = 'Agent'
        AND supervisor_name IS NOT NULL
        AND supervisor_name != ''
        AND employement_status != 'Offboarded'
      GROUP BY supervisor_name
    `)) as unknown as [any[], any];
    const agentCountMap: Record<string, number> = {};
    for (const row of agentCountRows) {
      agentCountMap[row.supervisor_name] = Number(row.agent_count) || 0;
    }

    // ── 3. Valid tardiness count per supervisor per month ──
    // io_tardiness.date is YYYY-MM-DD, supervisor_name is the supervisor
    const [tardinessRows] = (await db.execute(sql`
      SELECT supervisor_name,
             LEFT(date, 7) as month,
             COUNT(*) as valid_count
      FROM io_tardiness
      WHERE validation_status = 'Valid'
        AND LEFT(date, 7) >= ${oldestMonth}
        AND LEFT(date, 7) <= ${newestMonth}
      GROUP BY supervisor_name, LEFT(date, 7)
    `)) as unknown as [any[], any];
    // Map: supervisor -> month -> count
    const tardinessMap: Record<string, Record<string, number>> = {};
    for (const row of tardinessRows) {
      const sup = row.supervisor_name;
      const m = row.month;
      if (!tardinessMap[sup]) tardinessMap[sup] = {};
      tardinessMap[sup][m] = Number(row.valid_count) || 0;
    }

    // ── 4. Coaching coverage per supervisor per month ──
    // coaching_date is the date, coachee_sup is the supervisor
    // Count unique coachees per supervisor per month
    const [coachingRows] = (await db.execute(sql`
      SELECT coachee_sup as supervisor_name,
             LEFT(coaching_date, 7) as month,
             COUNT(DISTINCT coachee_ohr) as unique_agents_coached,
             COUNT(*) as total_sessions
      FROM io_coaching
      WHERE LEFT(coaching_date, 7) >= ${oldestMonth}
        AND LEFT(coaching_date, 7) <= ${newestMonth}
        AND coachee_sup IS NOT NULL
        AND coachee_sup != ''
      GROUP BY coachee_sup, LEFT(coaching_date, 7)
    `)) as unknown as [any[], any];
    const coachingMap: Record<string, Record<string, { unique: number; total: number }>> = {};
    for (const row of coachingRows) {
      const sup = row.supervisor_name;
      const m = row.month;
      if (!coachingMap[sup]) coachingMap[sup] = {};
      coachingMap[sup][m] = {
        unique: Number(row.unique_agents_coached) || 0,
        total: Number(row.total_sessions) || 0,
      };
    }

    // ── 4b. Get coached agent OHRs per supervisor per month (for missing agents) ──
    const [coachedAgentRows] = (await db.execute(sql`
      SELECT coachee_sup as supervisor_name,
             LEFT(coaching_date, 7) as month,
             GROUP_CONCAT(DISTINCT coachee_ohr) as coached_ohrs
      FROM io_coaching
      WHERE LEFT(coaching_date, 7) >= ${oldestMonth}
        AND LEFT(coaching_date, 7) <= ${newestMonth}
        AND coachee_sup IS NOT NULL
        AND coachee_sup != ''
      GROUP BY coachee_sup, LEFT(coaching_date, 7)
    `)) as unknown as [any[], any];
    const coachedOhrsMap: Record<string, Record<string, Set<string>>> = {};
    for (const row of coachedAgentRows) {
      const sup = row.supervisor_name;
      const m = row.month;
      if (!coachedOhrsMap[sup]) coachedOhrsMap[sup] = {};
      const ohrs = row.coached_ohrs ? String(row.coached_ohrs).split(",") : [];
      coachedOhrsMap[sup][m] = new Set(ohrs);
    }

    // ── 4c. Get all ACTIVE agent names per supervisor for missing coaching detection ──
    const [agentsBySupRows] = (await db.execute(sql`
      SELECT supervisor_name, ohr_id, full_name
      FROM io_employees
      WHERE actual_role = 'Agent'
        AND supervisor_name IS NOT NULL
        AND supervisor_name != ''
        AND employement_status != 'Offboarded'
      ORDER BY supervisor_name, full_name
    `)) as unknown as [any[], any];
    const agentsBySup: Record<string, { ohr_id: string; full_name: string }[]> = {};
    for (const row of agentsBySupRows) {
      if (!agentsBySup[row.supervisor_name]) agentsBySup[row.supervisor_name] = [];
      agentsBySup[row.supervisor_name].push({ ohr_id: row.ohr_id, full_name: row.full_name });
    }

    // ── 5. Insights per supervisor per month ──
    // io_insights.supervisor is the supervisor name, week_ending is YYYY-MM-DD
    const [insightRows] = (await db.execute(sql`
      SELECT supervisor,
             LEFT(week_ending, 7) as month,
             COUNT(*) as total_submitted,
             SUM(CASE WHEN status = 'Approved' THEN 1 ELSE 0 END) as total_approved
      FROM io_insights
      WHERE LEFT(week_ending, 7) >= ${oldestMonth}
        AND LEFT(week_ending, 7) <= ${newestMonth}
        AND supervisor IS NOT NULL
        AND supervisor != ''
      GROUP BY supervisor, LEFT(week_ending, 7)
    `)) as unknown as [any[], any];
    const insightsMap: Record<string, Record<string, { submitted: number; approved: number }>> = {};
    for (const row of insightRows) {
      const sup = row.supervisor;
      const m = row.month;
      if (!insightsMap[sup]) insightsMap[sup] = {};
      insightsMap[sup][m] = {
        submitted: Number(row.total_submitted) || 0,
        approved: Number(row.total_approved) || 0,
      };
    }

    // ── 6. Shrinkage per supervisor per month ──
    // Formula: (PL + UPL) / (P + PL + UPL) * 100
    // P = tag IN ('P', 'LATE', 'OT', '') i.e. present
    // PL = tag = 'PL' or 'ML'
    // UPL = tag = 'UPL'
    const [shrinkageRows] = (await db.execute(sql`
      SELECT snap_supervisor as supervisor_name,
             LEFT(log_date, 7) as month,
             SUM(CASE WHEN tag IN ('P','LATE','OT','') OR tag IS NULL THEN 1 ELSE 0 END) as present_days,
             SUM(CASE WHEN tag IN ('PL','ML') THEN 1 ELSE 0 END) as pl_days,
             SUM(CASE WHEN tag = 'UPL' THEN 1 ELSE 0 END) as upl_days
      FROM io_attendance
      WHERE LEFT(log_date, 7) >= ${oldestMonth}
        AND LEFT(log_date, 7) <= ${newestMonth}
        AND snap_supervisor IS NOT NULL
        AND snap_supervisor != ''
      GROUP BY snap_supervisor, LEFT(log_date, 7)
    `)) as unknown as [any[], any];
    const shrinkageMap: Record<string, Record<string, { p: number; pl: number; upl: number; pct: number }>> = {};
    for (const row of shrinkageRows) {
      const sup = row.supervisor_name;
      const m = row.month;
      const p = Number(row.present_days) || 0;
      const pl = Number(row.pl_days) || 0;
      const upl = Number(row.upl_days) || 0;
      const denom = p + pl + upl;
      const pct = denom > 0 ? ((pl + upl) / denom) * 100 : 0;
      if (!shrinkageMap[sup]) shrinkageMap[sup] = {};
      shrinkageMap[sup][m] = { p, pl, upl, pct };
    }

    // ── Assemble response ──
    const result = supervisors.map((sup: string) => {
      const months: Record<string, any> = {};
      for (const m of monthRange) {
        const coaching = coachingMap[sup]?.[m] || { unique: 0, total: 0 };
        const totalAgents = agentCountMap[sup] || 0;
        const coachedSet = coachedOhrsMap[sup]?.[m] || new Set();
        const allAgents = agentsBySup[sup] || [];
        const missingAgents = allAgents.filter(a => !coachedSet.has(a.ohr_id));

        months[m] = {
          tardiness: tardinessMap[sup]?.[m] || 0,
          coaching: {
            unique_agents_coached: coaching.unique,
            total_sessions: coaching.total,
            total_agents: totalAgents,
            coverage_pct: totalAgents > 0 ? Math.round((coaching.unique / totalAgents) * 100) : 0,
            missing_agents: missingAgents.map(a => ({ ohr_id: a.ohr_id, full_name: a.full_name })),
          },
          insights: insightsMap[sup]?.[m] || { submitted: 0, approved: 0 },
          shrinkage: shrinkageMap[sup]?.[m] || { p: 0, pl: 0, upl: 0, pct: 0 },
        };
      }
      return {
        supervisor_name: sup,
        total_agents: agentCountMap[sup] || 0,
        months,
      };
    });

    res.json({
      months: monthRange,
      supervisors: result,
    });
  } catch (err: any) {
    console.error("[MANAGERS-NOOK] Scorecard error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/io/managers-nook/available-months
 * Returns list of months that have attendance data.
 */
router.get("/available-months", async (req: Request, res: Response) => {
  try {
    const db = await getDb();
    if (!db) return res.status(500).json({ error: "DB unavailable" });

    const [rows] = (await db.execute(sql`
      SELECT DISTINCT LEFT(log_date, 7) as month
      FROM io_attendance
      WHERE log_date IS NOT NULL AND log_date != ''
      ORDER BY month DESC
      LIMIT 12
    `)) as unknown as [any[], any];
    const months = rows.map((r: any) => r.month).filter(Boolean);
    res.json({ months });
  } catch (err: any) {
    console.error("[MANAGERS-NOOK] Available months error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

export function registerManagersNookRoutes(parentRouter: Router) {
  parentRouter.use("/api/io/managers-nook", router);
}

export default router;
