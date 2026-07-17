/**
 * Settlement idempotency — a double-run pays ONCE. This is the honesty spine:
 * if the worker could double-pay, the "money can't be faked" thesis would leak
 * funds. Proven two ways (duel-level guard + leg-level payouts UNIQUE).
 */
import { describe, it, expect } from 'vitest';
import { settleDuel } from '../settle/worker';
import { payoutsFor, getDuel } from '../db/ledger';
import type { ResultInput } from '../arena/core';
import { seededDb, countingPay } from './_helpers';

const HOME_WIN: ResultInput = {
  match_id: 999001, outcome: 'HOME_TEAM', home_score: 2, away_score: 0,
  result_source: 'football-data.org match 999001 (REGULAR)',
};
const DRAW: ResultInput = {
  match_id: 999001, outcome: 'DRAW', home_score: 1, away_score: 1,
  result_source: 'football-data.org match 999001 (REGULAR)',
};

describe('settlement idempotency', () => {
  it('a win settles once; a second run pays nothing (1 payWinner call total)', async () => {
    const { db, duel } = seededDb({ withSlots: true });
    const { pay, calls } = countingPay();

    const first = await settleDuel(db, duel.id, HOME_WIN, pay);
    expect(first.status).toBe('settled');
    expect(first.paid_now).toBe(1);
    expect(first.duel.winner_agent).toBe('RED');

    const second = await settleDuel(db, duel.id, HOME_WIN, pay);
    expect(second.status).toBe('already-settled');
    expect(second.paid_now).toBe(0);

    expect(calls()).toBe(1); // paid exactly once across two runs
    expect(payoutsFor(db, duel.id)).toHaveLength(1);
  });

  it('a void settles once; two refund legs, never re-refunded (2 calls total)', async () => {
    const { db, duel } = seededDb({ withSlots: true });
    const { pay, calls } = countingPay();

    const first = await settleDuel(db, duel.id, DRAW, pay);
    expect(first.status).toBe('settled'); // returns "settled" status wrapper; duel state is void
    expect(getDuel(db, duel.id)!.state).toBe('void');
    expect(first.paid_now).toBe(2);

    await settleDuel(db, duel.id, DRAW, pay);
    await settleDuel(db, duel.id, DRAW, pay);

    expect(calls()).toBe(2); // two refund legs, once each, across three runs
    expect(payoutsFor(db, duel.id)).toHaveLength(2);
  });

  it('persists decision_hash + payout_tx on the duel row after settling', async () => {
    const { db, duel } = seededDb({ withSlots: true });
    const { pay } = countingPay();
    await settleDuel(db, duel.id, HOME_WIN, pay);
    const row = getDuel(db, duel.id)!;
    expect(row.decision_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(row.payout_tx).toBeTruthy();
    expect(row.settled_at).toBeTruthy();
  });

  it('records the mock flag so a mock settlement is never mistaken for a real tx', async () => {
    const { db, duel } = seededDb({ withSlots: true });
    const { pay } = countingPay();
    await settleDuel(db, duel.id, HOME_WIN, pay);
    const [p] = payoutsFor(db, duel.id);
    expect(p.is_mock).toBe(true);
    expect(p.tx.startsWith('mock-tx-')).toBe(true);
  });

  it('refuses to settle an incomplete duel (only one slot)', async () => {
    const { db, duel } = seededDb({ withSlots: false });
    const { pay, calls } = countingPay();
    const res = await settleDuel(db, duel.id, HOME_WIN, pay);
    expect(res.status).toBe('incomplete');
    expect(calls()).toBe(0);
  });

  it('returns not-final (no pay) when the result is null', async () => {
    const { db, duel } = seededDb({ withSlots: true });
    const { pay, calls } = countingPay();
    const res = await settleDuel(db, duel.id, null, pay);
    expect(res.status).toBe('not-final');
    expect(calls()).toBe(0);
  });
});
