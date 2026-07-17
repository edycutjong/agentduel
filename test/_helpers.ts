/** Shared test helpers — build duels/slots in an in-memory ledger. */
import { openMemoryDb, upsertDuel, insertSlot, type DB } from '../db/ledger';
import { buildDuel } from '../db/seed';
import { pickHash } from '../arena/hash';
import type { Duel, Slot, Agent, Side } from '../arena/types';
import type { PayFn } from '../settle/pay';

export const FUTURE = '2099-01-01T00:00:00Z';
export const PAST = '2000-01-01T00:00:00Z';

export function makeDuel(overrides: Partial<Duel> = {}): Duel {
  const base = buildDuel({
    id: 'duel-test',
    match_id: 999001,
    fixture: 'SF: AAA vs BBB',
    competition: 'FIFA World Cup 2026',
    stage: 'SEMI_FINALS',
    kickoff_utc: FUTURE,
    home_label: 'AAA to advance',
    away_label: 'BBB to advance',
  });
  return { ...base, ...overrides };
}

export function makeSlot(duel: Duel, agent: Agent, side: Side, overrides: Partial<Slot> = {}): Slot {
  const rationale = `${agent} takes ${side}`;
  return {
    duel_id: duel.id,
    agent,
    side,
    side_label: side === 'HOME' ? duel.home_label : duel.away_label,
    rationale,
    pick_hash: pickHash({ duelId: duel.id, side, rationale }),
    wallet: agent === 'RED' ? '0xRED0000000000000000000000000000000000red' : '0xCYAN00000000000000000000000000000000cyan',
    receipt_tx: `0x${agent.toLowerCase()}${'0'.repeat(62 - agent.length)}`,
    receipt_block_time: '2098-12-31T00:00:00Z',
    is_placeholder: false,
    ...overrides,
  };
}

/** In-memory DB seeded with a duel and (optionally) both slots. */
export function seededDb(opts: { duel?: Partial<Duel>; withSlots?: boolean } = {}): { db: DB; duel: Duel } {
  const db = openMemoryDb();
  const duel = makeDuel(opts.duel);
  upsertDuel(db, duel);
  if (opts.withSlots) {
    insertSlot(db, makeSlot(duel, 'RED', 'HOME'));
    insertSlot(db, makeSlot(duel, 'CYAN', 'AWAY'));
  }
  return { db, duel };
}

/** A payWinner mock that counts calls (for idempotency proofs). */
export function countingPay(): { pay: PayFn; calls: () => number; log: () => string[] } {
  let n = 0;
  const seen: string[] = [];
  const pay: PayFn = async (to, units, ctx) => {
    n++;
    seen.push(`${ctx.agent}:${ctx.kind}:${units}->${to}`);
    return { tx: `mock-tx-${n}`, mock: true };
  };
  return { pay, calls: () => n, log: () => seen };
}
