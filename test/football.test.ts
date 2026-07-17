/** football-data result mapping against the REAL WC-2026 snapshot. */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { resultFromMatch, findMatch, fixtureLabel, type FdMatch } from '../data/football';
import { PATHS } from '../config';

function snapshot(): FdMatch[] {
  return JSON.parse(fs.readFileSync(PATHS.wcMatches, 'utf8')).matches as FdMatch[];
}

describe('football-data results (real snapshot)', () => {
  it('maps a FINISHED knockout (QF FRA 2-0 MAR, match 537383) to a HOME_TEAM result', () => {
    const m = findMatch(snapshot(), 537383);
    const r = resultFromMatch(m);
    expect(r).not.toBeNull();
    expect(r!.outcome).toBe('HOME_TEAM');
    expect(r!.home_score).toBe(2);
    expect(r!.away_score).toBe(0);
    expect(r!.result_source).toContain('537383');
  });

  it('maps a penalty-shootout finish (SUI beat COL, 537382) to the reported winner', () => {
    const r = resultFromMatch(findMatch(snapshot(), 537382));
    expect(r).not.toBeNull();
    expect(r!.outcome).toBe('HOME_TEAM'); // football-data resolves ET/pens into a winner
    expect(r!.result_source).toMatch(/PENALTY|REGULAR|EXTRA/);
  });

  it('returns null for a not-yet-played fixture (SF FRA vs ESP, 537387 TIMED)', () => {
    const r = resultFromMatch(findMatch(snapshot(), 537387));
    expect(r).toBeNull();
  });

  it('builds a stage-prefixed fixture label', () => {
    const m = findMatch(snapshot(), 537383)!;
    expect(fixtureLabel(m)).toMatch(/^QF: /);
  });
});
