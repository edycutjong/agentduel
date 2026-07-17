/**
 * Settlement worker — the honesty core.
 *
 * `settleDuel` is idempotent TWO ways, so a double-run can never double-pay:
 *   Guard 1 (duel-level):  if `settled_at` is set, it's a no-op that returns the
 *                          stored decision — zero payWinner calls.
 *   Guard 2 (leg-level):   before paying a leg it checks the `payouts` table
 *                          (UNIQUE(duel_id, agent)); an already-recorded leg is
 *                          skipped, and a raced INSERT is rejected — so even if
 *                          Guard 1 were bypassed, a leg is paid at most once.
 *
 * The decision itself is computed by the PURE `decideSettlement` (arena/core),
 * the same function scripts/replay.ts calls — identical input ⇒ identical
 * decision_hash, so settlement is reproducible and auditable.
 */
import { decideSettlement } from '../arena/core';
import type { ResultInput } from '../arena/core';
import { ArenaError } from '../arena/types';
import type { Duel } from '../arena/types';
import {
  getDuel, slotsFor, payoutsFor, recordPayout, writeDuelSettlement, unsettledLockedDuels,
  type DB, type PayoutRow,
} from '../db/ledger';
import type { PayFn } from './pay';

export type SettleStatus = 'settled' | 'already-settled' | 'incomplete' | 'not-final';

export interface SettleOutcome {
  status: SettleStatus;
  duel: Duel;
  decision_hash: string | null;
  payouts: PayoutRow[];
  paid_now: number; // legs actually paid THIS run (0 on a re-run — the idempotency proof)
  reason?: string;
}

/** Settle one duel against a result. Idempotent. `pay` is injected (mock in tests). */
export async function settleDuel(
  db: DB,
  duelId: string,
  result: ResultInput | null,
  pay: PayFn,
): Promise<SettleOutcome> {
  const duel = getDuel(db, duelId);
  if (!duel) throw new ArenaError('DUEL_NOT_FOUND', `duel ${duelId} not found`, 404);

  // Guard 1: already settled → no-op.
  if (duel.settled_at) {
    return {
      status: 'already-settled',
      duel,
      decision_hash: duel.decision_hash,
      payouts: payoutsFor(db, duelId),
      paid_now: 0,
    };
  }

  if (!result) {
    return { status: 'not-final', duel, decision_hash: null, payouts: [], paid_now: 0, reason: 'match not final yet' };
  }

  const slots = slotsFor(db, duelId);
  if (slots.length < 2) {
    return {
      status: 'incomplete',
      duel,
      decision_hash: null,
      payouts: [],
      paid_now: 0,
      reason: `duel has ${slots.length}/2 slots — cannot settle`,
    };
  }

  const decision = decideSettlement(duel, slots, result);

  const already = payoutsFor(db, duelId);
  const executed: PayoutRow[] = [];
  let paidNow = 0;

  for (const p of decision.payments) {
    // Guard 2: leg already paid?
    const prior = already.find((r) => r.agent === p.agent);
    if (prior) {
      executed.push(prior);
      continue;
    }
    const { tx, mock } = await pay(p.to, p.units, { duelId, agent: p.agent, kind: p.kind });
    const row: PayoutRow = {
      duel_id: duelId,
      agent: p.agent,
      kind: p.kind,
      units: p.units,
      tx,
      is_mock: mock,
      created_at: new Date().toISOString(),
    };
    const inserted = recordPayout(db, row); // UNIQUE-guarded
    if (inserted) {
      paidNow++;
      executed.push(row);
    } else {
      // Raced: another run inserted first. Use the persisted row; do NOT re-pay.
      const persisted = payoutsFor(db, duelId).find((r) => r.agent === p.agent);
      if (persisted) executed.push(persisted);
    }
  }

  const payout_tx = executed.map((r) => r.tx).join('+') || null;

  writeDuelSettlement(db, duelId, {
    state: decision.state,
    winner_side: decision.winner_side,
    winner_agent: decision.winner_agent,
    home_score: decision.home_score,
    away_score: decision.away_score,
    outcome: decision.outcome,
    result_source: decision.result_source,
    decision_hash: decision.decision_hash,
    payout_tx,
    settled_at: new Date().toISOString(),
  });

  return {
    status: 'settled',
    duel: getDuel(db, duelId)!,
    decision_hash: decision.decision_hash,
    payouts: executed,
    paid_now: paidNow,
  };
}

/** A source of finished-match results, keyed by football-data match id. */
export type ResultProvider = (matchId: number) => Promise<ResultInput | null>;

/**
 * Sweep every unsettled, filled duel once; settle those whose match is final.
 * Returns a per-duel log. Used by the cron loop and by scripts/settle.ts.
 */
export async function settlePass(
  db: DB,
  getResult: ResultProvider,
  pay: PayFn,
): Promise<SettleOutcome[]> {
  const out: SettleOutcome[] = [];
  for (const duel of unsettledLockedDuels(db)) {
    const slots = slotsFor(db, duel.id);
    if (slots.length < 2) continue; // half-open duels are not settle-able
    const result = await getResult(duel.match_id).catch(() => null);
    out.push(await settleDuel(db, duel.id, result, pay));
  }
  return out;
}
