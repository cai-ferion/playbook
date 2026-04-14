import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

const compassJs = readFileSync(join(__dirname, 'public', 'js', 'compass.js'), 'utf-8');
const ioRoutesTs = readFileSync(join(__dirname, 'io-routes.ts'), 'utf-8');

describe('Disputes Area — Renamed Kanban Columns', () => {
  it('LV1 renamed to SME REVIEW (no PENDING prefix)', () => {
    expect(compassJs).toContain("title: 'LV1 - SME REVIEW'");
  });
  it('LV2 renamed to QA DECISION', () => {
    expect(compassJs).toContain("title: 'LV2 - QA DECISION'");
  });
  it('LV3 renamed to SME-QA DECISION', () => {
    expect(compassJs).toContain("title: 'LV3 - SME-QA DECISION'");
  });
  it('LV4 renamed to TRAINER DECISION', () => {
    expect(compassJs).toContain("title: 'LV4 - TRAINER DECISION'");
  });
  it('LV5 renamed to SME-TRAINER DECISION', () => {
    expect(compassJs).toContain("title: 'LV5 - SME-TRAINER DECISION'");
  });
  it('LV6 renamed to QTP MANAGER DECISION', () => {
    expect(compassJs).toContain("title: 'LV6 - QTP MANAGER DECISION'");
  });
});

describe('Disputes Area — Role-Based Button Visibility', () => {
  it('LV1 buttons visible to Support Joiner 1 & 2 (isSupportJoiner)', () => {
    // The LV1 block should check isSupportJoiner, not role === SME
    expect(compassJs).toContain("// LV1 - Support Joiner 1 & 2 only");
    expect(compassJs).toMatch(/isSupportJoiner.*\|\|.*isQTPManager.*\|\|.*isAdmin/);
  });

  it('LV2 buttons visible to coach only (isCoach)', () => {
    expect(compassJs).toContain("// LV2 - Coach only");
    expect(compassJs).toMatch(/isCoach.*\|\|.*isQTPManager.*\|\|.*isAdmin/);
  });

  it('LV3 buttons visible to Support Joiner 1 & 2', () => {
    expect(compassJs).toContain("// LV3 - Support Joiner 1 & 2 only");
  });

  it('LV4 buttons visible to trainers whose PG matches coachee PG', () => {
    expect(compassJs).toContain("// LV4 - Trainers whose PG matches coachee's PG");
    expect(compassJs).toMatch(/isMatchingTrainer.*\|\|.*isQTPManager.*\|\|.*isAdmin/);
  });

  it('LV5 buttons visible to Support Joiner 1 & 2', () => {
    expect(compassJs).toContain("// LV5 - Support Joiner 1 & 2 only");
  });

  it('LV6 buttons visible to QTP Manager Angelo Nieva only', () => {
    expect(compassJs).toContain("// LV6 - QTP Manager Angelo Nieva only");
    // Only isQTPManager or isAdmin, no other role check
    const lv6Block = compassJs.slice(compassJs.indexOf('// LV6 - QTP Manager Angelo Nieva only'));
    const lv6Condition = lv6Block.slice(0, lv6Block.indexOf('{'));
    expect(lv6Condition).toContain('isQTPManager');
    expect(lv6Condition).toContain('isAdmin');
    expect(lv6Condition).not.toContain('isSupportJoiner');
    expect(lv6Condition).not.toContain('isCoach');
  });
});

describe('Disputes Area — Angelo Nieva QTP Manager Override', () => {
  it('Angelo Nieva OHR 740049863 is defined as QTP Manager', () => {
    expect(compassJs).toContain("cu.ohr_id === '740049863'");
  });

  it('isQTPManager is checked at every dispute level', () => {
    // Count occurrences of isQTPManager in the footer logic
    const footerSection = compassJs.slice(compassJs.indexOf('// Angelo Nieva (QTP Manager)'));
    const matches = footerSection.match(/isQTPManager/g) || [];
    // Should appear at least 7 times: 1 definition + 6 level checks
    expect(matches.length).toBeGreaterThanOrEqual(7);
  });
});

describe('Disputes Area — Support Joiner matching logic', () => {
  it('isSupportJoiner checks both sme_joiner and sme_joiner_2', () => {
    expect(compassJs).toContain("log.sme_joiner || ''");
    expect(compassJs).toContain("log.sme_joiner_2 || ''");
  });

  it('isMatchingTrainer checks planning_group MULTIPLE or exact match', () => {
    expect(compassJs).toContain("cu.planning_group === 'MULTIPLE'");
    expect(compassJs).toContain("cu.planning_group === log.coachee_pg");
  });
});

describe('Lean Query — sme_joiner fields included', () => {
  it('lean query returns sme_joiner', () => {
    expect(ioRoutesTs).toContain('sme_joiner: ioCoaching.sme_joiner');
  });
  it('lean query returns sme_meta_email', () => {
    expect(ioRoutesTs).toContain('sme_meta_email: ioCoaching.sme_meta_email');
  });
  it('lean query returns sme_joiner_2', () => {
    expect(ioRoutesTs).toContain('sme_joiner_2: ioCoaching.sme_joiner_2');
  });
  it('lean query returns sme_joiner_2_email', () => {
    expect(ioRoutesTs).toContain('sme_joiner_2_email: ioCoaching.sme_joiner_2_email');
  });
});

describe('Violation Tracker — Property name fix', () => {
  it('uses v.type (not v.name) for violation catalog options', () => {
    // The cascading dropdown should reference v.type from HR_VIOLATIONS
    expect(compassJs).toContain('v.type');
  });
});
