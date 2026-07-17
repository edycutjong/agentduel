/**
 * Seeder — hydrates the arena ledger from fixtures. Idempotent.
 *
 *   - seed-duels.json      → OPEN, enterable duels (no fake slots/receipts).
 *   - duel-rehearsal.json  → one duel + two slots with LABELED all-zero
 *                            placeholder receipts, then settled through the SAME
 *                            worker path via the MOCK payWinner (payout tx is a
 *                            labeled mock-tx-…). The honest dev exhibit.
 *
 * Run: `npm run api` calls seedIfEmpty(); or `tsx db/seed.ts` to (re)seed.
 */
import fs from 'node:fs';
import { openDb, upsertDuel, upsertSlot, getDuel, duelCount, type DB } from './ledger';
import { pickHash } from '../arena/hash';
import { settleDuel } from '../settle/worker';
import { mockPayWinner } from '../settle/pay';
import { resultFromMatch, findMatch, type FdMatch } from '../data/football';
import type { Duel, Slot } from '../arena/types';
import {
  PATHS, STAKE_UNITS, PAYOUT_UNITS, REFUND_UNITS, FEE_UNITS,
} from '../config';

/** Build a full Duel from a fixture partial + the shared economics. */
export function buildDuel(p: {
  id: string; match_id: number; fixture: string; competition: string; stage: string;
  kickoff_utc: string; home_label: string; away_label: string;
}): Duel {
  return {
    ...p,
    stake_units: STAKE_UNITS,
    payout_units: PAYOUT_UNITS,
    refund_units: REFUND_UNITS,
    fee_units: FEE_UNITS,
    state: 'open',
    winner_side: null,
    winner_agent: null,
    home_score: null,
    away_score: null,
    outcome: null,
    result_source: null,
    decision_hash: null,
    payout_tx: null,
    settled_at: null,
  };
}

function readJson<T>(path: string): T {
  return JSON.parse(fs.readFileSync(path, 'utf8')) as T;
}

export async function seedArena(db: DB): Promise<{ open: number; rehearsal: string | null }> {
  // 1. Open duels.
  const seed = readJson<{ duels: any[] }>(PATHS.seedDuels);
  for (const d of seed.duels) upsertDuel(db, buildDuel(d));

  // 2. Rehearsal duel + two placeholder slots, then settle via mock.
  const reh = readJson<{ duel: any; slots: any[] }>(PATHS.rehearsal);
  const duel = buildDuel(reh.duel);
  upsertDuel(db, duel);
  for (const s of reh.slots) {
    const slot: Slot = {
      duel_id: duel.id,
      agent: s.agent,
      side: s.side,
      side_label: s.side_label,
      rationale: s.rationale,
      pick_hash: pickHash({ duelId: duel.id, side: s.side, rationale: s.rationale }),
      wallet: s.wallet,
      receipt_tx: s.receipt_tx,
      receipt_block_time: s.receipt_block_time,
      is_placeholder: true,
    };
    upsertSlot(db, slot);
  }

  // Settle the rehearsal from its REAL football-data result, mock payout.
  const { matches } = readMatches();
  const result = resultFromMatch(findMatch(matches, duel.match_id));
  if (result) {
    await settleDuel(db, duel.id, result, mockPayWinner);
  }

  return { open: seed.duels.length, rehearsal: getDuel(db, duel.id)?.state ?? null };
}

function readMatches(): { matches: FdMatch[] } {
  const cached = JSON.parse(fs.readFileSync(PATHS.wcMatches, 'utf8'));
  return { matches: cached.matches ?? [] };
}

/** Seed only if the ledger is empty (safe to call on every API boot). */
export async function seedIfEmpty(db: DB): Promise<void> {
  if (duelCount(db) === 0) await seedArena(db);
}

async function main(): Promise<void> {
  const db = openDb(PATHS.db);
  const res = await seedArena(db);
  console.log(`seeded: ${res.open} open duel(s) + rehearsal (state=${res.rehearsal})`);
}

import { fileURLToPath } from 'node:url';
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
