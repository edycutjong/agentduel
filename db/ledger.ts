/**
 * Duel ledger repository (better-sqlite3). Pure data access — no HTTP, no chain.
 * The settlement worker's idempotency rests on the `payouts` UNIQUE(duel_id,
 * agent) here: a second run's INSERT collides and is rejected, so it cannot pay
 * twice even if `settled_at` were somehow clear.
 */
import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { SCHEMA_SQL } from './schema';
import type { Duel, Slot, Payment, Agent } from '../arena/types';

export type DB = Database.Database;

export function openDb(dbPath: string): DB {
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.exec(SCHEMA_SQL);
  return db;
}

export function openMemoryDb(): DB {
  const db = new Database(':memory:');
  db.exec(SCHEMA_SQL);
  return db;
}

// ── duels ─────────────────────────────────────────────────────────────────────
const DUEL_COLS = [
  'id', 'match_id', 'fixture', 'competition', 'stage', 'kickoff_utc', 'home_label', 'away_label',
  'stake_units', 'payout_units', 'refund_units', 'fee_units', 'state', 'winner_side', 'winner_agent',
  'home_score', 'away_score', 'outcome', 'result_source', 'decision_hash', 'payout_tx', 'settled_at',
] as const;

export function upsertDuel(db: DB, duel: Duel): void {
  const placeholders = DUEL_COLS.map((c) => `@${c}`).join(', ');
  db.prepare(`INSERT OR REPLACE INTO duels (${DUEL_COLS.join(', ')}) VALUES (${placeholders})`).run(
    duel as unknown as Record<string, unknown>,
  );
}

function hydrateDuel(r: any): Duel {
  return r as Duel;
}

export function getDuel(db: DB, id: string): Duel | undefined {
  const r = db.prepare('SELECT * FROM duels WHERE id = ?').get(id);
  return r ? hydrateDuel(r) : undefined;
}

export function allDuels(db: DB): Duel[] {
  return db.prepare('SELECT * FROM duels ORDER BY kickoff_utc DESC').all().map(hydrateDuel);
}

export function duelsByState(db: DB, state: string): Duel[] {
  return db.prepare('SELECT * FROM duels WHERE state = ? ORDER BY kickoff_utc DESC').all(state).map(hydrateDuel);
}

/** Duels that are locked (both slots filled, kickoff passed-ish) and not yet settled. */
export function unsettledLockedDuels(db: DB): Duel[] {
  return db
    .prepare("SELECT * FROM duels WHERE state IN ('open','locked') AND settled_at IS NULL ORDER BY kickoff_utc ASC")
    .all()
    .map(hydrateDuel);
}

export function setDuelState(db: DB, id: string, state: Duel['state']): void {
  db.prepare('UPDATE duels SET state = ? WHERE id = ?').run(state, id);
}

/** Persist a settlement result on the duel row (single UPDATE, part of the settle tx). */
export function writeDuelSettlement(
  db: DB,
  id: string,
  patch: Pick<Duel, 'state' | 'winner_side' | 'winner_agent' | 'home_score' | 'away_score' | 'outcome' | 'result_source' | 'decision_hash' | 'payout_tx' | 'settled_at'>,
): void {
  db.prepare(
    `UPDATE duels SET state=@state, winner_side=@winner_side, winner_agent=@winner_agent,
       home_score=@home_score, away_score=@away_score, outcome=@outcome, result_source=@result_source,
       decision_hash=@decision_hash, payout_tx=@payout_tx, settled_at=@settled_at
     WHERE id=@id`,
  ).run({ id, ...patch });
}

// ── slots ──────────────────────────────────────────────────────────────────────
const SLOT_COLS = [
  'duel_id', 'agent', 'side', 'side_label', 'rationale', 'pick_hash', 'wallet',
  'receipt_tx', 'receipt_block_time', 'is_placeholder',
] as const;

export function insertSlot(db: DB, slot: Slot): void {
  const placeholders = SLOT_COLS.map((c) => `@${c}`).join(', ');
  db.prepare(`INSERT INTO slots (${SLOT_COLS.join(', ')}) VALUES (${placeholders})`).run({
    ...slot,
    is_placeholder: slot.is_placeholder ? 1 : 0,
  });
}

/** Insert-or-replace (used only by the seeder for rehearsal rows). */
export function upsertSlot(db: DB, slot: Slot): void {
  const placeholders = SLOT_COLS.map((c) => `@${c}`).join(', ');
  db.prepare(`INSERT OR REPLACE INTO slots (${SLOT_COLS.join(', ')}) VALUES (${placeholders})`).run({
    ...slot,
    is_placeholder: slot.is_placeholder ? 1 : 0,
  });
}

function hydrateSlot(r: any): Slot {
  return { ...r, is_placeholder: !!r.is_placeholder } as Slot;
}

export function slotsFor(db: DB, duelId: string): Slot[] {
  return db.prepare('SELECT * FROM slots WHERE duel_id = ? ORDER BY agent').all(duelId).map(hydrateSlot);
}

export function slotByReceipt(db: DB, tx: string): Slot | undefined {
  const r = db.prepare('SELECT * FROM slots WHERE receipt_tx = ?').get(tx);
  return r ? hydrateSlot(r) : undefined;
}

// ── payouts (idempotency ledger) ────────────────────────────────────────────────
export interface PayoutRow {
  duel_id: string;
  agent: Agent;
  kind: Payment['kind'];
  units: string;
  tx: string;
  is_mock: boolean;
  created_at: string;
}

/**
 * Record one payout leg. Returns false if a row for (duel, agent) already exists
 * (the idempotency guard: a double settlement run cannot insert twice).
 */
export function recordPayout(db: DB, row: PayoutRow): boolean {
  try {
    db.prepare(
      `INSERT INTO payouts (duel_id, agent, kind, units, tx, is_mock, created_at)
       VALUES (@duel_id, @agent, @kind, @units, @tx, @is_mock, @created_at)`,
    ).run({ ...row, is_mock: row.is_mock ? 1 : 0 });
    return true;
  } catch (e) {
    if (String((e as Error).message).includes('UNIQUE')) return false;
    throw e;
  }
}

export function payoutsFor(db: DB, duelId: string): PayoutRow[] {
  return db
    .prepare('SELECT * FROM payouts WHERE duel_id = ? ORDER BY agent')
    .all(duelId)
    .map((r: any) => ({ ...r, is_mock: !!r.is_mock }));
}

export function duelCount(db: DB): number {
  return (db.prepare('SELECT COUNT(*) AS n FROM duels').get() as { n: number }).n;
}
