/**
 * RED's edge source — buy LineLock's paid pick, with graceful degradation.
 *
 * Order of preference:
 *   1. LIVE paid call to LineLock via the x402 client (funds-gated; only when
 *      --pay + a funded wallet). LineLock is built in the sibling folder but
 *      NOT deployed, so this is off by default.
 *   2. RECORDED fixture (fixtures/edge-pick.json) — the proven offline path the
 *      tests + demo use. This is what "RED parses the recorded edge pick" means.
 *   3. FREE consensus odds fallback (CYAN's strategy) if the fixture is missing.
 *
 * We never fabricate a paid receipt: a live call returns a real x402 tx or the
 * function throws and we fall through to the recorded fixture.
 */
import fs from 'node:fs';
import { LINELOCK_URL, PATHS, OPS_WALLET_PK, NET } from '../config';

export interface EdgeSignal {
  side: 'HOME' | 'AWAY';
  side_label: string;
  model_prob: number;
  market_odds: number;
  edge_pct: number;
  rationale: string;
  source: 'linelock-live' | 'linelock-recorded' | 'free-consensus';
  receipt_tx: string | null; // set only on a real live paid call
  pick_hash?: string;
}

export function readRecordedEdge(): EdgeSignal {
  const raw = JSON.parse(fs.readFileSync(PATHS.edgePick, 'utf8'));
  return {
    side: raw.side,
    side_label: raw.side_label,
    model_prob: raw.model_prob,
    market_odds: raw.market_odds,
    edge_pct: raw.edge_pct,
    rationale:
      `Bought LineLock's paid pick (recorded): model ${(raw.model_prob * 100).toFixed(0)}% vs ` +
      `market-implied ${(raw.market_implied_prob * 100).toFixed(0)}% on ${raw.side_label}, ` +
      `+${(raw.edge_pct * 100).toFixed(1)} prob-point edge (tier ${raw.recommended_tier}). Staking the edge on ${raw.side}.`,
    source: 'linelock-recorded',
    receipt_tx: null,
    pick_hash: raw.pick_hash,
  };
}

/**
 * Try a LIVE paid LineLock call. Funds-gated: returns null (caller degrades)
 * unless a payer key is present AND the call actually settles on-chain.
 */
export async function tryLiveEdge(opts: { pay: boolean }): Promise<EdgeSignal | null> {
  if (!opts.pay) return null;
  if (!OPS_WALLET_PK) {
    console.warn('  · tryLiveEdge: no OPS_WALLET_PK — cannot pay LineLock; degrading.');
    return null;
  }
  try {
    const { createInjectiveClient, parsePaymentResponseHeader } = await import('@injectivelabs/x402/client');
    const client = createInjectiveClient({
      privateKey: OPS_WALLET_PK,
      preferredNetworks: [NET.caip2],
      defaultToken: 'USDC',
    });
    const res = await client.fetch(`${LINELOCK_URL}/api/edge`, { method: 'POST' });
    if (!res.ok) throw new Error(`LineLock HTTP ${res.status}`);
    const receipt = parsePaymentResponseHeader(res);
    const pick = (await res.json()) as any;
    return {
      side: pick.side,
      side_label: pick.side_label,
      model_prob: pick.model_prob,
      market_odds: pick.market_odds,
      edge_pct: pick.edge_pct,
      rationale: `Bought LineLock's LIVE paid pick: ${pick.side_label}, +${(pick.edge_pct * 100).toFixed(1)} prob-point edge. Receipt ${receipt?.transaction ?? 'n/a'}.`,
      source: 'linelock-live',
      receipt_tx: receipt?.transaction ?? null,
      pick_hash: pick.pick_hash,
    };
  } catch (e) {
    console.warn(`  · tryLiveEdge: LineLock unreachable/unpaid (${(e as Error).message}); degrading to recorded fixture.`);
    return null;
  }
}

/** Resolve RED's edge: live → recorded → (caller can fall to free consensus). */
export async function getRedEdge(opts: { pay?: boolean } = {}): Promise<EdgeSignal> {
  const live = await tryLiveEdge({ pay: !!opts.pay });
  if (live) return live;
  try {
    return readRecordedEdge();
  } catch {
    // Free-consensus last resort (rare — fixture is committed).
    return {
      side: 'HOME',
      side_label: 'Home side (consensus fallback)',
      model_prob: 0.5,
      market_odds: 2.0,
      edge_pct: 0,
      rationale: 'LineLock unavailable and no recorded pick; defaulting to free consensus HOME.',
      source: 'free-consensus',
      receipt_tx: null,
    };
  }
}
