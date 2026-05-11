/**
 * Tests for the revised leave filing date restriction.
 * Rule: Earliest filing date = Saturday of the last Sat-Fri week
 * whose week still overlaps with the current month.
 */
import { describe, it, expect } from 'vitest';
import { getEarliestFilingDate } from './io/leaves';

describe('getEarliestFilingDate', () => {
  // Helper: create a date in a specific month/year
  function makeDate(year: number, month: number, day: number): Date {
    return new Date(year, month - 1, day); // month is 0-indexed in JS
  }

  describe('May 2026 (31 days, May 31 = Sunday)', () => {
    it('should return 2026-05-30 (Saturday before May 31)', () => {
      // May 31, 2026 is a Sunday. Saturday on or before = May 30.
      const now = makeDate(2026, 5, 4); // May 4, 2026
      expect(getEarliestFilingDate(now)).toBe('2026-05-30');
    });

    it('should return same result regardless of which day in May we check', () => {
      expect(getEarliestFilingDate(makeDate(2026, 5, 1))).toBe('2026-05-30');
      expect(getEarliestFilingDate(makeDate(2026, 5, 15))).toBe('2026-05-30');
      expect(getEarliestFilingDate(makeDate(2026, 5, 31))).toBe('2026-05-30');
    });
  });

  describe('June 2026 (30 days, June 30 = Tuesday)', () => {
    it('should return 2026-06-27 (Saturday before June 30)', () => {
      // June 30, 2026 is a Tuesday. Saturday on or before = June 27.
      const now = makeDate(2026, 6, 1);
      expect(getEarliestFilingDate(now)).toBe('2026-06-27');
    });
  });

  describe('July 2026 (31 days, July 31 = Friday)', () => {
    it('should return 2026-07-25 (Saturday before July 31)', () => {
      // July 31, 2026 is a Friday. Saturday on or before = July 25.
      const now = makeDate(2026, 7, 1);
      expect(getEarliestFilingDate(now)).toBe('2026-07-25');
    });
  });

  describe('August 2026 (31 days, Aug 31 = Monday)', () => {
    it('should return 2026-08-29 (Saturday before Aug 31)', () => {
      // Aug 31, 2026 is a Monday. Saturday on or before = Aug 29.
      const now = makeDate(2026, 8, 1);
      expect(getEarliestFilingDate(now)).toBe('2026-08-29');
    });
  });

  describe('September 2026 (30 days, Sep 30 = Wednesday)', () => {
    it('should return 2026-09-26 (Saturday before Sep 30)', () => {
      // Sep 30, 2026 is a Wednesday. Saturday on or before = Sep 26.
      const now = makeDate(2026, 9, 1);
      expect(getEarliestFilingDate(now)).toBe('2026-09-26');
    });
  });

  describe('October 2026 (31 days, Oct 31 = Saturday)', () => {
    it('should return 2026-10-31 (last day IS a Saturday)', () => {
      // Oct 31, 2026 is a Saturday. Saturday on or before = Oct 31 itself.
      const now = makeDate(2026, 10, 1);
      expect(getEarliestFilingDate(now)).toBe('2026-10-31');
    });
  });

  describe('November 2026 (30 days, Nov 30 = Monday)', () => {
    it('should return 2026-11-28 (Saturday before Nov 30)', () => {
      // Nov 30, 2026 is a Monday. Saturday on or before = Nov 28.
      const now = makeDate(2026, 11, 1);
      expect(getEarliestFilingDate(now)).toBe('2026-11-28');
    });
  });

  describe('December 2026 (31 days, Dec 31 = Thursday)', () => {
    it('should return 2026-12-26 (Saturday before Dec 31)', () => {
      // Dec 31, 2026 is a Thursday. Saturday on or before = Dec 26.
      const now = makeDate(2026, 12, 1);
      expect(getEarliestFilingDate(now)).toBe('2026-12-26');
    });
  });

  describe('February 2026 (28 days, Feb 28 = Saturday)', () => {
    it('should return 2026-02-28 (last day IS a Saturday)', () => {
      // Feb 28, 2026 is a Saturday. Saturday on or before = Feb 28 itself.
      const now = makeDate(2026, 2, 1);
      expect(getEarliestFilingDate(now)).toBe('2026-02-28');
    });
  });

  describe('February 2028 (29 days, leap year, Feb 29 = Tuesday)', () => {
    it('should return 2028-02-26 (Saturday before Feb 29)', () => {
      // Feb 29, 2028 is a Tuesday. Saturday on or before = Feb 26.
      const now = makeDate(2028, 2, 1);
      expect(getEarliestFilingDate(now)).toBe('2028-02-26');
    });
  });

  describe('January 2026 (31 days, Jan 31 = Saturday)', () => {
    it('should return 2026-01-31 (last day IS a Saturday)', () => {
      // Jan 31, 2026 is a Saturday. Saturday on or before = Jan 31 itself.
      const now = makeDate(2026, 1, 1);
      expect(getEarliestFilingDate(now)).toBe('2026-01-31');
    });
  });

  describe('Edge case: month where last day is Sunday (May 2026)', () => {
    it('should return the Saturday before (May 30)', () => {
      // Already tested above, but explicit: Sun -> back 1 day = Sat
      const now = makeDate(2026, 5, 7);
      expect(getEarliestFilingDate(now)).toBe('2026-05-30');
    });
  });

  describe('Verification: the returned Saturday starts a week that overlaps the current month', () => {
    it('May 2026: Sat May 30 is in May (overlaps)', () => {
      const result = getEarliestFilingDate(makeDate(2026, 5, 1));
      // The Saturday (May 30) is still in May — the week Sat May 30 - Fri June 5 overlaps May
      const satDate = new Date(result + 'T00:00:00');
      expect(satDate.getMonth()).toBeLessThanOrEqual(4); // May = month index 4
    });

    it('October 2026: Sat Oct 31 is in October (overlaps)', () => {
      const result = getEarliestFilingDate(makeDate(2026, 10, 1));
      const satDate = new Date(result + 'T00:00:00');
      expect(satDate.getMonth()).toBe(9); // October = month index 9
    });
  });
});
