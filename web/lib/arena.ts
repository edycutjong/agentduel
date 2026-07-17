import 'server-only';
import snapshot from './arena-snapshot.json';

/** Shapes mirror GET /api/duels (api/routes.ts duelView). */
export interface SlotView {
  agent: 'RED' | 'CYAN';
  side: 'HOME' | 'AWAY';
  side_label: string;
  rationale: string;
  pick_hash: string;
  wallet: string;
  receipt_tx: string;
  receipt_block_time: string;
  receipt_explorer: string | null;
  is_placeholder: boolean;
  pre_kickoff: { human: string; before_kickoff: boolean };
}
export interface PayoutView {
  agent: string; kind: string; units: string; usdc: number; tx: string; is_mock: boolean; explorer: string | null;
}
export interface DuelView {
  id: string; match_id: number; fixture: string; competition: string; stage: string;
  kickoff_utc: string; home_label: string; away_label: string;
  state: 'open' | 'locked' | 'settled' | 'void';
  economics: { stake_usdc: number; payout_usdc: number; refund_usdc: number; fee_usdc: number; rule: string };
  slots: SlotView[];
  result: { outcome: string; home_score: number; away_score: number; source: string } | null;
  winner_side: string | null; winner_agent: string | null;
  decision_hash: string | null; payout_tx: string | null; settled_at: string | null;
  payouts: PayoutView[];
}
export interface DuelsResponse {
  generated_at: string; active_network: string; attribution: string; disclaimer: string;
  open: DuelView[]; settled: DuelView[];
}

const API_ENV_KEY = 'AGENTDUEL_API_URL';
const apiBase = () => process.env[API_ENV_KEY] || '';

/** Live API if AGENTDUEL_API_URL is set + reachable, else the committed snapshot. */
export async function getArena(): Promise<{ data: DuelsResponse; source: 'api' | 'snapshot' }> {
  const API = apiBase();
  if (API) {
    try {
      const res = await fetch(`${API}/api/duels`, { cache: 'no-store' });
      if (res.ok) return { data: (await res.json()) as DuelsResponse, source: 'api' };
    } catch {
      /* fall through to snapshot */
    }
  }
  return { data: snapshot as unknown as DuelsResponse, source: 'snapshot' };
}

export const EXPLORER = 'https://blockscout.injective.network';
