/**
 * Arena core — PURE domain logic (no DB, no HTTP, no chain). Tested first.
 *
 *  1. Slot matching with typed errors (opposing-sides-only, fixture-clock lock).
 *  2. pick_hash binding (rationale cannot be retro-edited).
 *  3. Settlement decision + void/fee math (every leg auditable, one-sentence econ).
 */
import { ArenaError } from './types';
import type {
  Agent, Duel, EntryRequest, MatchOutcome, Payment, Side, Slot, SettlementDecision,
} from './types';
import { pickHash, decisionHash } from './hash';

export const OTHER_SIDE: Record<Side, Side> = { HOME: 'AWAY', AWAY: 'HOME' };

/** Is a duel enterable right now? Uses the FIXTURE clock (kickoff), not server time. */
export function isPreKickoff(duel: Pick<Duel, 'kickoff_utc'>, now = new Date()): boolean {
  return now.getTime() < new Date(duel.kickoff_utc).getTime();
}

/**
 * Validate + prepare a new slot. Enforces:
 *   - BAD_SIDE      side must be HOME | AWAY
 *   - DUEL_NOT_OPEN duel already locked/settled/void
 *   - POST_KICKOFF  now >= kickoff_utc (fixture clock is the referee)
 *   - DUEL_FULL     both slots already taken
 *   - SIDE_TAKEN    requested side already held
 *   - SAME_AGENT    an agent cannot take both slots
 * Returns the Slot to persist (pick_hash bound here). Does NOT mutate inputs.
 */
export function prepareEntry(
  duel: Duel,
  existing: Slot[],
  entry: EntryRequest,
  now = new Date(),
): Slot {
  if (entry.side !== 'HOME' && entry.side !== 'AWAY') {
    throw new ArenaError('BAD_SIDE', `side must be HOME or AWAY, got "${entry.side}"`, 400);
  }
  if (duel.state !== 'open') {
    throw new ArenaError('DUEL_NOT_OPEN', `duel ${duel.id} is ${duel.state}, not open`, 409);
  }
  if (!isPreKickoff(duel, now)) {
    throw new ArenaError(
      'POST_KICKOFF',
      `entries closed: kickoff ${duel.kickoff_utc} has passed (fixture clock)`,
      409,
    );
  }
  if (existing.length >= 2) {
    throw new ArenaError('DUEL_FULL', `duel ${duel.id} already has two duelists`, 409);
  }
  if (existing.some((s) => s.side === entry.side)) {
    throw new ArenaError('SIDE_TAKEN', `side ${entry.side} is already taken in ${duel.id}`, 409);
  }
  if (existing.some((s) => s.agent === entry.agent)) {
    throw new ArenaError('SAME_AGENT', `agent ${entry.agent} already holds a slot in ${duel.id}`, 409);
  }

  const rationale = (entry.rationale ?? '').trim();
  return {
    duel_id: duel.id,
    agent: entry.agent,
    side: entry.side,
    side_label: entry.side_label?.trim() || sideLabelFor(duel, entry.side),
    rationale,
    pick_hash: pickHash({ duelId: duel.id, side: entry.side, rationale }),
    wallet: entry.wallet,
    receipt_tx: entry.receipt_tx,
    receipt_block_time: entry.receipt_block_time,
    is_placeholder: false,
  };
}

/** Default human label for a side from the duel's team labels. */
export function sideLabelFor(duel: Pick<Duel, 'home_label' | 'away_label'>, side: Side): string {
  return side === 'HOME' ? duel.home_label : duel.away_label;
}

/** After a valid entry, should the duel lock? (both slots filled). */
export function shouldLock(existingCount: number): boolean {
  return existingCount + 1 >= 2;
}

// ── Settlement math ──────────────────────────────────────────────────────────

/** Map a football-data result to a duel outcome. Null score ⇒ not final yet. */
export function outcomeFromScore(
  winner: string | null,
  home: number | null,
  away: number | null,
): MatchOutcome | null {
  if (winner === 'HOME_TEAM') return 'HOME_TEAM';
  if (winner === 'AWAY_TEAM') return 'AWAY_TEAM';
  if (winner === 'DRAW') return 'DRAW';
  // No explicit winner field: infer only from a complete score.
  if (home == null || away == null) return null;
  if (home > away) return 'HOME_TEAM';
  if (away > home) return 'AWAY_TEAM';
  return 'DRAW';
}

/** Which side wins under an outcome. DRAW ⇒ null (void). */
export function winningSide(outcome: MatchOutcome): Side | null {
  if (outcome === 'HOME_TEAM') return 'HOME';
  if (outcome === 'AWAY_TEAM') return 'AWAY';
  return null;
}

export interface ResultInput {
  match_id: number;
  outcome: MatchOutcome;
  home_score: number;
  away_score: number;
  result_source: string;
}

/**
 * Compute the deterministic settlement decision for a duel + its two slots.
 *
 * Win:  winner gets payout_units (0.18); pot 0.20 in − 0.02 fee.
 * Void: both sides refunded refund_units (0.09 each); 0.20 in − 0.02 fee = 0.18 out.
 * The fee is ALWAYS fee_units — asserted below so the economics can't drift.
 *
 * This function is the single source of truth the settlement worker AND
 * scripts/replay.ts call — identical input ⇒ identical decision_hash.
 */
export function decideSettlement(duel: Duel, slots: Slot[], result: ResultInput): SettlementDecision {
  const winner_side = winningSide(result.outcome);
  const payments: Payment[] = [];
  let state: 'settled' | 'void';
  let winner_agent: Agent | null = null;

  if (winner_side === null) {
    // Draw / void — refund both.
    state = 'void';
    for (const s of slots) {
      payments.push({ to: s.wallet, agent: s.agent, units: duel.refund_units, kind: 'refund' });
    }
  } else {
    state = 'settled';
    const winnerSlot = slots.find((s) => s.side === winner_side);
    if (!winnerSlot) {
      // Result resolved a side that no agent took (shouldn't happen for a full duel).
      // Fail safe: treat as void so no one is wrongly paid.
      state = 'void';
      for (const s of slots) {
        payments.push({ to: s.wallet, agent: s.agent, units: duel.refund_units, kind: 'refund' });
      }
    } else {
      winner_agent = winnerSlot.agent;
      payments.push({ to: winnerSlot.wallet, agent: winnerSlot.agent, units: duel.payout_units, kind: 'payout' });
    }
  }

  // Fee invariant: pot(2×stake) − Σpayments === fee_units, always.
  assertFeeInvariant(duel, payments);

  const base = {
    duel_id: duel.id,
    match_id: result.match_id,
    outcome: result.outcome,
    home_score: result.home_score,
    away_score: result.away_score,
    result_source: result.result_source,
    state,
    winner_side: state === 'void' ? null : winner_side,
    winner_agent,
    payments,
    fee_units: duel.fee_units,
  };
  return { ...base, decision_hash: decisionHash(base) };
}

/** pot(2×stake) − Σ(payments) must equal the stated fee. Throws if the math drifts. */
export function assertFeeInvariant(
  duel: Pick<Duel, 'stake_units' | 'fee_units'>,
  payments: Payment[],
): void {
  const pot = 2 * Number(duel.stake_units);
  const out = payments.reduce((a, p) => a + Number(p.units), 0);
  const fee = pot - out;
  if (fee !== Number(duel.fee_units)) {
    throw new Error(
      `fee invariant violated: pot ${pot} − paid ${out} = ${fee} ≠ stated fee ${duel.fee_units}`,
    );
  }
}

/** Per-agent P&L in USDC units for a settled/void duel (for the card + /proof). */
export function agentPnL(
  duel: Pick<Duel, 'stake_units'>,
  decision: Pick<SettlementDecision, 'payments'>,
  agent: Agent,
): number {
  const paid = decision.payments
    .filter((p) => p.agent === agent)
    .reduce((a, p) => a + Number(p.units), 0);
  return paid - Number(duel.stake_units);
}
