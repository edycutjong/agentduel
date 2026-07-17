/** Settlement decision + void/fee math (every leg auditable). */
import { describe, it, expect } from 'vitest';
import {
  decideSettlement, outcomeFromScore, winningSide, assertFeeInvariant, agentPnL,
} from '../arena/core';
import type { ResultInput } from '../arena/core';
import { makeDuel, makeSlot } from './_helpers';

function slots(duel = makeDuel()) {
  return [makeSlot(duel, 'RED', 'HOME'), makeSlot(duel, 'CYAN', 'AWAY')];
}

const HOME_WIN: ResultInput = {
  match_id: 999001, outcome: 'HOME_TEAM', home_score: 2, away_score: 0,
  result_source: 'football-data.org match 999001 (REGULAR)',
};
const AWAY_WIN: ResultInput = {
  match_id: 999001, outcome: 'AWAY_TEAM', home_score: 0, away_score: 1,
  result_source: 'football-data.org match 999001 (REGULAR)',
};
const DRAW: ResultInput = {
  match_id: 999001, outcome: 'DRAW', home_score: 1, away_score: 1,
  result_source: 'football-data.org match 999001 (REGULAR)',
};

describe('outcome mapping', () => {
  it('maps football-data winner fields', () => {
    expect(outcomeFromScore('HOME_TEAM', 2, 0)).toBe('HOME_TEAM');
    expect(outcomeFromScore('AWAY_TEAM', 0, 1)).toBe('AWAY_TEAM');
    expect(outcomeFromScore('DRAW', 1, 1)).toBe('DRAW');
  });
  it('returns null when the match is not final (no winner, no score)', () => {
    expect(outcomeFromScore(null, null, null)).toBeNull();
  });
  it('infers from a complete score when winner is absent', () => {
    expect(outcomeFromScore(null, 3, 1)).toBe('HOME_TEAM');
    expect(outcomeFromScore(null, 0, 2)).toBe('AWAY_TEAM');
  });
  it('winningSide maps outcome → side; DRAW ⇒ null (void)', () => {
    expect(winningSide('HOME_TEAM')).toBe('HOME');
    expect(winningSide('AWAY_TEAM')).toBe('AWAY');
    expect(winningSide('DRAW')).toBeNull();
  });
});

describe('decideSettlement — win', () => {
  it('pays the winning side 0.18 and retains the 0.02 fee', () => {
    const duel = makeDuel();
    const d = decideSettlement(duel, slots(duel), HOME_WIN);
    expect(d.state).toBe('settled');
    expect(d.winner_side).toBe('HOME');
    expect(d.winner_agent).toBe('RED');
    expect(d.payments).toHaveLength(1);
    expect(d.payments[0]).toMatchObject({ agent: 'RED', units: '180000', kind: 'payout' });
    // pot 200000 − payout 180000 = fee 20000
    expect(assertFeeInvariant(duel, d.payments)).toBeUndefined();
  });

  it('routes the payout to whichever agent holds the winning side (AWAY→CYAN)', () => {
    const duel = makeDuel();
    const d = decideSettlement(duel, slots(duel), AWAY_WIN);
    expect(d.winner_side).toBe('AWAY');
    expect(d.winner_agent).toBe('CYAN');
    expect(d.payments[0].to).toBe(slots(duel)[1].wallet);
  });

  it('per-agent P&L: winner +0.08, loser −0.10', () => {
    const duel = makeDuel();
    const d = decideSettlement(duel, slots(duel), HOME_WIN);
    expect(agentPnL(duel, d, 'RED')).toBe(80000); // 180000 payout − 100000 stake
    expect(agentPnL(duel, d, 'CYAN')).toBe(-100000); // staked, paid 0
  });
});

describe('decideSettlement — void (draw)', () => {
  it('refunds both sides 0.09 and retains the 0.02 fee', () => {
    const duel = makeDuel();
    const d = decideSettlement(duel, slots(duel), DRAW);
    expect(d.state).toBe('void');
    expect(d.winner_side).toBeNull();
    expect(d.winner_agent).toBeNull();
    expect(d.payments).toHaveLength(2);
    expect(d.payments.every((p) => p.units === '90000' && p.kind === 'refund')).toBe(true);
    // pot 200000 − 2×90000 = fee 20000
    expect(assertFeeInvariant(duel, d.payments)).toBeUndefined();
  });

  it('void P&L: each agent −0.01 (their share of the fee)', () => {
    const duel = makeDuel();
    const d = decideSettlement(duel, slots(duel), DRAW);
    expect(agentPnL(duel, d, 'RED')).toBe(-10000); // 90000 refund − 100000 stake
    expect(agentPnL(duel, d, 'CYAN')).toBe(-10000);
  });
});

describe('fee invariant guard', () => {
  it('throws if payments do not leave exactly the stated fee', () => {
    const duel = makeDuel();
    expect(() => assertFeeInvariant(duel, [{ to: '0x', agent: 'RED', units: '200000', kind: 'payout' }])).toThrowError(
      /fee invariant/,
    );
  });

  it('decision_hash is deterministic for identical inputs', () => {
    const duel = makeDuel();
    const a = decideSettlement(duel, slots(duel), HOME_WIN);
    const b = decideSettlement(duel, slots(duel), HOME_WIN);
    expect(a.decision_hash).toBe(b.decision_hash);
    expect(a.decision_hash).toMatch(/^[0-9a-f]{64}$/);
  });
});
