/**
 * SQLite schema for the AgentDuel ledger.
 *
 * Two tables:
 *   - duels  : one row per fixture-duel (economics + lifecycle + settlement).
 *   - slots  : two rows per duel (RED + CYAN), each the side + pick_hash +
 *              entry receipt tx + pre-kickoff block time.
 *
 * Idempotent: applying the schema and re-settling rebuilds the same rows.
 * A UNIQUE (duel_id, side) enforces opposing-sides-only at the storage layer,
 * and a UNIQUE (duel_id, agent) stops one agent from taking both slots.
 */
export const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS duels (
  id             TEXT PRIMARY KEY,
  match_id       INTEGER NOT NULL,
  fixture        TEXT    NOT NULL,
  competition    TEXT    NOT NULL,
  stage          TEXT    NOT NULL,
  kickoff_utc    TEXT    NOT NULL,
  home_label     TEXT    NOT NULL,
  away_label     TEXT    NOT NULL,
  stake_units    TEXT    NOT NULL,
  payout_units   TEXT    NOT NULL,
  refund_units   TEXT    NOT NULL,
  fee_units      TEXT    NOT NULL,
  state          TEXT    NOT NULL DEFAULT 'open',  -- open | locked | settled | void
  winner_side    TEXT,
  winner_agent   TEXT,
  home_score     INTEGER,
  away_score     INTEGER,
  outcome        TEXT,
  result_source  TEXT,
  decision_hash  TEXT,
  payout_tx      TEXT,
  settled_at     TEXT
);

CREATE TABLE IF NOT EXISTS slots (
  duel_id            TEXT    NOT NULL,
  agent              TEXT    NOT NULL,  -- RED | CYAN
  side               TEXT    NOT NULL,  -- HOME | AWAY
  side_label         TEXT    NOT NULL,
  rationale          TEXT    NOT NULL,
  pick_hash          TEXT    NOT NULL,
  wallet             TEXT    NOT NULL,
  receipt_tx         TEXT    NOT NULL,
  receipt_block_time TEXT    NOT NULL,
  is_placeholder     INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (duel_id, agent),
  UNIQUE (duel_id, side),
  FOREIGN KEY (duel_id) REFERENCES duels(id)
);

-- One payout/refund tx per (duel, agent): the second settlement run cannot
-- insert a duplicate, so a double-run can never double-pay (idempotency spine).
CREATE TABLE IF NOT EXISTS payouts (
  duel_id     TEXT    NOT NULL,
  agent       TEXT    NOT NULL,
  kind        TEXT    NOT NULL,   -- payout | refund
  units       TEXT    NOT NULL,
  tx          TEXT    NOT NULL,
  is_mock     INTEGER NOT NULL DEFAULT 1,
  created_at  TEXT    NOT NULL,
  PRIMARY KEY (duel_id, agent)
);

CREATE INDEX IF NOT EXISTS idx_slots_duel    ON slots(duel_id);
CREATE INDEX IF NOT EXISTS idx_slots_receipt ON slots(receipt_tx);
CREATE INDEX IF NOT EXISTS idx_duels_state   ON duels(state);
`;
