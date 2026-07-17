/**
 * Commitment hashing for the arena.
 *
 * - pick_hash  = sha256(canonical {duelId, side, rationale}) — binds an agent's
 *   side + verbatim rationale so it cannot be retro-edited after the whistle.
 * - decision_hash = sha256(canonical settlement decision) — notarizes WHY the
 *   payout went where it did. `transfer_send` has no memo param (verified), so
 *   the decision is notarized here + in /proof + replay.ts, not in a memo.
 *
 * "Canonical" = keys sorted recursively so the same logical object always hashes
 * to the same value regardless of insertion order.
 */
import { createHash } from 'node:crypto';
import type { Side } from './types';

export function canonicalize(value: unknown): string {
  return JSON.stringify(sortDeep(value));
}

function sortDeep(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortDeep);
  if (value && typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(obj).sort()) out[key] = sortDeep(obj[key]);
    return out;
  }
  return value;
}

export function sha256Hex(input: string): string {
  return createHash('sha256').update(input, 'utf8').digest('hex');
}

/** Bind an agent's commitment: side + verbatim rationale under a duel id. */
export function pickHash(input: { duelId: string; side: Side; rationale: string }): string {
  return sha256Hex(canonicalize({ duelId: input.duelId, side: input.side, rationale: input.rationale }));
}

/** Re-derive and compare a pick_hash (auditor check). */
export function verifyPickHash(
  input: { duelId: string; side: Side; rationale: string },
  expected: string,
): { ok: boolean; actual: string } {
  const actual = pickHash(input);
  return { ok: actual === expected, actual };
}

/** Hash a settlement decision object (the decision_hash), excluding the field itself. */
export function decisionHash(decisionWithoutHash: Record<string, unknown>): string {
  const { decision_hash: _decision_hash, ...rest } = decisionWithoutHash as { decision_hash?: string };
  return sha256Hex(canonicalize(rest));
}
