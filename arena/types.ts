/** Core domain types for the AgentDuel arena. */

/** Which agent holds a slot. RED buys LineLock's edge; CYAN plays free odds contrarian. */
export type Agent = 'RED' | 'CYAN';

/** A pick is always HOME or AWAY (opposing-sides-only; no odds pricing). */
export type Side = 'HOME' | 'AWAY';

/** Duel lifecycle. The state machine IS the visual story on the arena card. */
export type DuelState = 'open' | 'locked' | 'settled' | 'void';

/** How a finished match resolves (football-data `score.winner`, incl. ET/pens). */
export type MatchOutcome = 'HOME_TEAM' | 'AWAY_TEAM' | 'DRAW';

/** A single agent's committed entry (one of the two duel slots). */
export interface Slot {
  duel_id: string;
  agent: Agent;
  side: Side;
  side_label: string; // human: "France to advance"
  rationale: string; // verbatim agent reasoning — hashed, cannot be retro-edited
  pick_hash: string; // sha256(canonical {duelId, side, rationale})
  wallet: string; // duelist wallet (ephemeral)
  receipt_tx: string; // x402 entry receipt — the stake + the commitment
  receipt_block_time: string; // ISO — must be < kickoff_utc (pre-kickoff proof)
  is_placeholder: boolean; // true = seed/rehearsal row w/ labeled all-zero tx
}

/** A duel = a fixture + two opposing slots + a legible micro-economy + state. */
export interface Duel {
  id: string;
  match_id: number; // football-data match id (the referee)
  fixture: string; // "SF: FRA vs ESP"
  competition: string;
  stage: string; // GROUP_STAGE | LAST_16 | ... | FINAL
  kickoff_utc: string; // ISO — the entry clock AND the result clock
  home_label: string;
  away_label: string;
  // economics, in USDC smallest units (6dp)
  stake_units: string; // 100000 = 0.10 per side
  payout_units: string; // 180000 = 0.18 to the winner
  refund_units: string; // 90000  = 0.09 each on void
  fee_units: string; // 20000  = 0.02 stated arena fee
  // lifecycle
  state: DuelState;
  winner_side: Side | null; // set on settle (null on void)
  winner_agent: Agent | null;
  home_score: number | null;
  away_score: number | null;
  outcome: MatchOutcome | null;
  result_source: string | null; // "football-data.org match 537383"
  decision_hash: string | null; // sha256 of the canonical settlement decision
  payout_tx: string | null; // the winner-payout tx (or refund summary)
  settled_at: string | null; // ISO — the idempotency guard
}

/** Typed arena errors (never thrown as bare strings — the API maps them to codes). */
export type ArenaErrorCode =
  | 'SIDE_TAKEN'
  | 'DUEL_FULL'
  | 'POST_KICKOFF'
  | 'DUEL_NOT_FOUND'
  | 'DUEL_NOT_OPEN'
  | 'BAD_SIDE'
  | 'SAME_AGENT';

export class ArenaError extends Error {
  code: ArenaErrorCode;
  http: number;
  constructor(code: ArenaErrorCode, message: string, http = 409) {
    super(message);
    this.name = 'ArenaError';
    this.code = code;
    this.http = http;
  }
}

/** An entry request as it arrives at POST /api/duel/enter (after x402 verify). */
export interface EntryRequest {
  duelId: string;
  agent: Agent;
  side: Side;
  side_label?: string;
  rationale: string;
  wallet: string;
  receipt_tx: string;
  receipt_block_time: string; // ISO — from the on-chain receipt (or now)
}

/** One leg of a settlement: who gets paid, how much, and why. */
export interface Payment {
  to: string; // recipient wallet
  agent: Agent;
  units: string; // USDC smallest units
  kind: 'payout' | 'refund';
}

/** The full, deterministic settlement decision (hashes into decision_hash). */
export interface SettlementDecision {
  duel_id: string;
  match_id: number;
  outcome: MatchOutcome;
  home_score: number;
  away_score: number;
  result_source: string;
  state: 'settled' | 'void';
  winner_side: Side | null;
  winner_agent: Agent | null;
  payments: Payment[];
  fee_units: string;
  decision_hash: string;
}
