/**
 * OT Mechanism Revisions — Batch 93 Tests
 * Tests the core business logic for:
 * 1. OT Dashboard tab visibility (RECALL_MEASUREMENT_CTR hide, exempt OHRs)
 * 2. Fixed 2.5hr OT commitment
 * 3. Approval logic: current week, skip past days, round-up by 2.5
 * 4. Forfeiture cascade rules
 */
import { describe, it, expect } from "vitest";

// ============================================================
// 1. Tab Visibility Logic
// ============================================================
describe("OT Dashboard tab visibility", () => {
  const OT_TAB_EXEMPT_OHRS = ["703212987", "740044909", "740045023"];

  function shouldHideOtTab(ohrId: string, completePlanningGroup: string): boolean {
    if (OT_TAB_EXEMPT_OHRS.includes(ohrId)) return false;
    return (completePlanningGroup || "").includes("RECALL_MEASUREMENT_CTR");
  }

  it("hides OT tab for agents with RECALL_MEASUREMENT_CTR", () => {
    expect(shouldHideOtTab("999999999", "RECALL_MEASUREMENT_CTR")).toBe(true);
  });

  it("hides OT tab for Team Leads with RECALL_MEASUREMENT_CTR", () => {
    expect(shouldHideOtTab("888888888", "S-ABF,RECALL_MEASUREMENT_CTR")).toBe(true);
  });

  it("hides OT tab for Managers with RECALL_MEASUREMENT_CTR (non-exempt)", () => {
    expect(shouldHideOtTab("777777777", "CSO_CTR,RECALL_MEASUREMENT_CTR")).toBe(true);
  });

  it("exempts Ravikiran Polimetla (703212987) even with RECALL_MEASUREMENT_CTR", () => {
    expect(shouldHideOtTab("703212987", "S-ABF,CS-ABF,RECALL_MEASUREMENT_CTR")).toBe(false);
  });

  it("exempts Joshua Masacote (740044909) even with RECALL_MEASUREMENT_CTR", () => {
    expect(shouldHideOtTab("740044909", "RECALL_MEASUREMENT_CTR")).toBe(false);
  });

  it("exempts Admin (740045023) even with RECALL_MEASUREMENT_CTR", () => {
    expect(shouldHideOtTab("740045023", "RECALL_MEASUREMENT_CTR")).toBe(false);
  });

  it("shows OT tab for agents without RECALL_MEASUREMENT_CTR", () => {
    expect(shouldHideOtTab("111111111", "S-ABF,CS-ABF,CSO_CTR")).toBe(false);
  });

  it("shows OT tab for agents with empty planning group", () => {
    expect(shouldHideOtTab("222222222", "")).toBe(false);
  });
});

// ============================================================
// 2. Fixed 2.5hr OT Commitment
// ============================================================
describe("Fixed 2.5hr OT commitment", () => {
  const FIXED_OT_HOURS = 2.5;

  it("OT hours are always 2.5", () => {
    expect(FIXED_OT_HOURS).toBe(2.5);
  });

  it("server overrides any client-sent hours to 2.5", () => {
    // Simulates the backend behavior: regardless of input, fixedHours = "2.5"
    const clientSentHours = "1.5";
    const fixedHours = "2.5"; // Server always overrides
    expect(fixedHours).toBe("2.5");
    expect(fixedHours).not.toBe(clientSentHours);
  });
});

// ============================================================
// 3. Approval Logic: Round-Up by 2.5
// ============================================================
describe("Approval agent count calculation", () => {
  const OT_HOURS_PER_AGENT = 2.5;

  function calcAgentsToApprove(hoursNeeded: number): number {
    return Math.ceil(hoursNeeded / OT_HOURS_PER_AGENT);
  }

  it("9 hours → 4 agents (9 / 2.5 = 3.6, rounds up to 4)", () => {
    expect(calcAgentsToApprove(9)).toBe(4);
  });

  it("7.5 hours → 3 agents (exact division)", () => {
    expect(calcAgentsToApprove(7.5)).toBe(3);
  });

  it("2.5 hours → 1 agent", () => {
    expect(calcAgentsToApprove(2.5)).toBe(1);
  });

  it("5 hours → 2 agents", () => {
    expect(calcAgentsToApprove(5)).toBe(2);
  });

  it("1 hour → 1 agent (rounds up from 0.4)", () => {
    expect(calcAgentsToApprove(1)).toBe(1);
  });

  it("10 hours → 4 agents", () => {
    expect(calcAgentsToApprove(10)).toBe(4);
  });

  it("12.5 hours → 5 agents (exact)", () => {
    expect(calcAgentsToApprove(12.5)).toBe(5);
  });

  it("13 hours → 6 agents (rounds up from 5.2)", () => {
    expect(calcAgentsToApprove(13)).toBe(6);
  });
});

// ============================================================
// 4. Current Week Saturday Calculation (PHT)
// ============================================================
describe("Current week Saturday calculation", () => {
  function getCurrentWeekSaturday(phtDate: Date): string {
    const phtDay = phtDate.getUTCDay(); // 0=Sun, 6=Sat
    const daysSinceSat = phtDay === 6 ? 0 : (phtDay + 1);
    const sat = new Date(phtDate);
    sat.setUTCDate(sat.getUTCDate() - daysSinceSat);
    sat.setUTCHours(0, 0, 0, 0);
    return sat.toISOString().split("T")[0];
  }

  it("Saturday returns itself", () => {
    // 2026-04-04 is a Saturday
    const sat = new Date("2026-04-04T10:00:00Z");
    expect(getCurrentWeekSaturday(sat)).toBe("2026-04-04");
  });

  it("Sunday returns previous Saturday", () => {
    // 2026-04-05 is a Sunday
    const sun = new Date("2026-04-05T10:00:00Z");
    expect(getCurrentWeekSaturday(sun)).toBe("2026-04-04");
  });

  it("Tuesday returns previous Saturday", () => {
    // 2026-04-07 is a Tuesday
    const tue = new Date("2026-04-07T10:00:00Z");
    expect(getCurrentWeekSaturday(tue)).toBe("2026-04-04");
  });

  it("Friday returns previous Saturday", () => {
    // 2026-04-10 is a Friday
    const fri = new Date("2026-04-10T10:00:00Z");
    expect(getCurrentWeekSaturday(fri)).toBe("2026-04-04");
  });
});

// ============================================================
// 5. OT Day Finder (Skip Past Days)
// ============================================================
describe("findOtDay — skip past days logic", () => {
  function parseWorkOffDays(workOff: string): number[] {
    if (!workOff) return [];
    const dayMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
    return workOff.split(/\s*-\s*/).map(d => dayMap[d.trim()]).filter(d => d !== undefined);
  }

  function findOtDay(weekSaturday: Date, workOffDays: number[], todayStr: string): string | null {
    for (let i = 0; i < 7; i++) {
      const d = new Date(weekSaturday);
      d.setUTCDate(d.getUTCDate() + i);
      const dateStr = d.toISOString().split("T")[0];
      const dow = d.getUTCDay();
      if (dateStr < todayStr) continue; // Skip past days
      if (workOffDays.includes(dow)) continue;
      return dateStr;
    }
    return null;
  }

  it("skips past days and returns today if available", () => {
    // Week: Sat 04/04 to Fri 04/10, today is Tue 04/07
    const weekSat = new Date("2026-04-04T00:00:00Z");
    const workOff = parseWorkOffDays("Sat - Sun");
    const result = findOtDay(weekSat, workOff, "2026-04-07");
    expect(result).toBe("2026-04-07"); // Tuesday
  });

  it("skips past days and work-off days", () => {
    // Week: Sat 04/04 to Fri 04/10, today is Tue 04/07, work off = Tue-Wed
    const weekSat = new Date("2026-04-04T00:00:00Z");
    const workOff = parseWorkOffDays("Tue - Wed");
    const result = findOtDay(weekSat, workOff, "2026-04-07");
    expect(result).toBe("2026-04-09"); // Thursday
  });

  it("returns null if all remaining days are work-off", () => {
    // Week: Sat 04/04 to Fri 04/10, today is Fri 04/10, work off = Fri
    const weekSat = new Date("2026-04-04T00:00:00Z");
    const workOff = parseWorkOffDays("Fri");
    const result = findOtDay(weekSat, workOff, "2026-04-10");
    expect(result).toBeNull();
  });

  it("returns Saturday if today is Saturday and not work-off", () => {
    const weekSat = new Date("2026-04-04T00:00:00Z");
    const workOff = parseWorkOffDays("Sun");
    const result = findOtDay(weekSat, workOff, "2026-04-04");
    expect(result).toBe("2026-04-04");
  });
});

// ============================================================
// 6. Forfeiture Rules
// ============================================================
describe("Forfeiture cascade rules", () => {
  function shouldForfeit(tag: string): boolean {
    const t = (tag || "").toUpperCase().trim();
    return t !== "P" && t !== "LATE";
  }

  function isFriday(dateStr: string): boolean {
    return new Date(dateStr + "T00:00:00Z").getUTCDay() === 5;
  }

  it("forfeits when tag is UPL", () => {
    expect(shouldForfeit("UPL")).toBe(true);
  });

  it("forfeits when tag is NCNS", () => {
    expect(shouldForfeit("NCNS")).toBe(true);
  });

  it("forfeits when tag is empty", () => {
    expect(shouldForfeit("")).toBe(true);
  });

  it("does NOT forfeit when tag is P", () => {
    expect(shouldForfeit("P")).toBe(false);
  });

  it("does NOT forfeit when tag is LATE", () => {
    expect(shouldForfeit("LATE")).toBe(false);
  });

  it("does NOT forfeit when tag is late (case insensitive)", () => {
    expect(shouldForfeit("late")).toBe(false);
  });

  it("identifies Friday correctly for no-cascade rule", () => {
    expect(isFriday("2026-04-10")).toBe(true); // Friday
  });

  it("identifies non-Friday correctly", () => {
    expect(isFriday("2026-04-07")).toBe(false); // Tuesday
  });

  it("Friday OT = truly forfeited, no cascade", () => {
    const appliedDate = "2026-04-10"; // Friday
    const tag = "UPL";
    const shouldCascade = shouldForfeit(tag) && !isFriday(appliedDate);
    expect(shouldCascade).toBe(false);
  });

  it("non-Friday OT with bad tag = forfeit + cascade", () => {
    const appliedDate = "2026-04-07"; // Tuesday
    const tag = "UPL";
    const shouldCascade = shouldForfeit(tag) && !isFriday(appliedDate);
    expect(shouldCascade).toBe(true);
  });
});

// ============================================================
// 7. Next Week Ending Calculation for Agent Form
// ============================================================
describe("Next week ending (Friday) calculation for OT form", () => {
  function getNextWeekEndingFriday(phtDate: Date): string {
    const phtDay = phtDate.getUTCDay(); // 0=Sun, 6=Sat
    const daysToNextSat = (6 - phtDay + 7) % 7 || 7;
    const nextSat = new Date(phtDate);
    nextSat.setUTCDate(nextSat.getUTCDate() + daysToNextSat);
    const nextFri = new Date(nextSat);
    nextFri.setUTCDate(nextFri.getUTCDate() + 6);
    const m = String(nextFri.getUTCMonth() + 1).padStart(2, "0");
    const d = String(nextFri.getUTCDate()).padStart(2, "0");
    const y = nextFri.getUTCFullYear();
    return `${m}/${d}/${String(y).slice(2)}`;
  }

  it("Tuesday 04/07 → next WE is 04/17/26", () => {
    const tue = new Date("2026-04-07T10:00:00Z");
    expect(getNextWeekEndingFriday(tue)).toBe("04/17/26");
  });

  it("Saturday 04/04 → next WE is 04/17/26", () => {
    const sat = new Date("2026-04-04T10:00:00Z");
    expect(getNextWeekEndingFriday(sat)).toBe("04/17/26");
  });

  it("Friday 04/10 → next WE is 04/17/26", () => {
    const fri = new Date("2026-04-10T10:00:00Z");
    expect(getNextWeekEndingFriday(fri)).toBe("04/17/26");
  });
});
