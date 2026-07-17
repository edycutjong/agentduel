/**
 * AgentDuel — central config.
 *
 * All Injective/x402 constants are pinned from the SHIPPED @injectivelabs/x402
 * types (`node_modules/@injectivelabs/x402/dist/*.d.ts`), NOT from prose. Where
 * the spec's ARCHITECTURE.md sketch disagreed (it sketched a flat middleware
 * config; the real one is a routes map), the shipped types win — see README
 * "x402: the real surface" and STATUS.md.
 */
import { config as loadEnv } from 'dotenv';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

// Load build/.env.local (gitignored). Falls back to process env in CI.
const HERE = path.dirname(fileURLToPath(import.meta.url));
loadEnv({ path: path.join(HERE, '.env.local') });

export const ROOT = HERE;

// ── Injective EVM networks (CAIP-2), pinned from x402/networks ──────────────
export const NETWORKS = {
  mainnet: {
    caip2: 'eip155:1776' as const,
    chainId: 1776,
    name: 'Injective EVM',
    rpc: 'https://sentry.evm-rpc.injective.network',
    explorer: 'https://blockscout.injective.network',
    usdc: '0xa00C59fF5a080D2b954d0c75e46E22a0c371235a' as `0x${string}`,
  },
  testnet: {
    caip2: 'eip155:1439' as const,
    chainId: 1439,
    name: 'Injective EVM Testnet',
    rpc: 'https://k8s.testnet.json-rpc.injective.network',
    explorer: 'https://testnet.blockscout.injective.network',
    usdc: '0x0C382e685bbeeFE5d3d9C29e29E341fEE8E84C5d' as `0x${string}`,
  },
} as const;

export type NetworkKey = keyof typeof NETWORKS;

/** Active network for the API middleware. Mainnet per PRD; override with AGENTDUEL_NETWORK=testnet. */
export const ACTIVE_NETWORK: NetworkKey =
  (process.env.AGENTDUEL_NETWORK as NetworkKey) === 'testnet' ? 'testnet' : 'mainnet';

export const NET = NETWORKS[ACTIVE_NETWORK];

// ── Economics (USDC, 6 decimals). The one-sentence micro-economy. ───────────
export const USDC_DECIMALS = 6;
/** 0.10 USDC per side — the stake IS the receipt IS the pre-kickoff commitment. */
export const STAKE_UNITS = process.env.AGENTDUEL_STAKE_UNITS ?? '100000';
/** Winner is paid 0.18 USDC (pot 0.20 in, 0.02 stated arena fee retained). */
export const PAYOUT_UNITS = '180000';
/** Draw/void: each side refunded 0.09 USDC (fee still retained). */
export const REFUND_UNITS = '90000';
/** Stated, auditable arena fee: 0.02 USDC. pot(0.20) - payout(0.18) = fee(0.02). */
export const FEE_UNITS = '20000';

export const units = (u: string | number): number => Number(u);
export const usdc = (u: string | number): number => Number(u) / 10 ** USDC_DECIMALS;
export const STAKE_USDC = usdc(STAKE_UNITS); // 0.10
export const PAYOUT_USDC = usdc(PAYOUT_UNITS); // 0.18
export const REFUND_USDC = usdc(REFUND_UNITS); // 0.09
export const FEE_USDC = usdc(FEE_UNITS); // 0.02

// ── Wallet / payment config ─────────────────────────────────────────────────
function normalizePk(pk: string | undefined): `0x${string}` | undefined {
  if (!pk) return undefined;
  const trimmed = pk.trim();
  const withPrefix = trimmed.startsWith('0x') ? trimmed : `0x${trimmed}`;
  return /^0x[0-9a-fA-F]{64}$/.test(withPrefix) ? (withPrefix as `0x${string}`) : undefined;
}

/** Arena wallet private key = x402 facilitator + settlement payout sender. May be undefined in CI. */
export const OPS_WALLET_PK = normalizePk(process.env.OPS_WALLET_PK);
export const OPS_WALLET_ADDRESS = (process.env.OPS_WALLET_ADDRESS ?? '') as string;

/** x402 receiver (payTo). Address only, no key. */
export const PAYTO_ADDRESS = (process.env.PAYTO_ADDRESS ??
  '0x45078eD96C2bB171009A47a57aF5C085Bf4fD0e3') as `0x${string}`;

/**
 * A deterministic, well-known THROWAWAY key used ONLY when no real key is set
 * (tests / CI / example). It never holds funds; it exists so the middleware can
 * construct (it requires a facilitator or facilitatorUrl) and emit a valid 402.
 * anvil account #0 — public, do not fund.
 */
export const DUMMY_TEST_PK =
  '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80' as `0x${string}`;

/** The key the middleware facilitator uses. Real key if present, else dummy (402 still works). */
export const FACILITATOR_PK: `0x${string}` = OPS_WALLET_PK ?? DUMMY_TEST_PK;
export const HAS_REAL_FACILITATOR_KEY = OPS_WALLET_PK !== undefined;

/**
 * HARD FUNDS GATE for the settlement payout (THE honesty rule).
 * A real on-chain USDC transfer runs ONLY when this is "1" AND the wallet holds
 * funds. Otherwise settlement uses a labeled mock and never emits a real tx.
 */
export const ALLOW_PAYOUT = process.env.AGENTDUEL_ALLOW_PAYOUT === '1';

// ── Data API keys ───────────────────────────────────────────────────────────
export const FOOTBALL_DATA_KEY = process.env.FOOTBALL_DATA_KEY ?? '';
export const ODDS_API_KEY = process.env.ODDS_API_KEY ?? '';

// football-data.org — FIFA World Cup 2026 (the referee for entry clock AND result)
export const FOOTBALL_DATA = {
  base: 'https://api.football-data.org/v4',
  competition: 2000, // WC
  season: 2026,
  attribution: 'Football data provided by the Football-Data.org API',
};

// the-odds-api.com — CYAN's free consensus-odds strategy
export const ODDS_API = {
  base: 'https://api.the-odds-api.com/v4',
  sportH2H: 'soccer_fifa_world_cup',
  regions: 'eu,uk',
  markets: 'h2h',
  oddsFormat: 'decimal',
};

// ── LineLock (RED's paid-pick source — funds-gated / degrade-friendly) ─────
export const LINELOCK_URL = process.env.LINELOCK_URL ?? 'http://localhost:8402';

// ── Server ──────────────────────────────────────────────────────────────────
export const PORT = Number(process.env.PORT ?? 8403);
export const API_BASE_URL = process.env.AGENTDUEL_API_URL ?? `http://localhost:${PORT}`;

// ── Paths ───────────────────────────────────────────────────────────────────
export const PATHS = {
  db: path.join(HERE, 'db', 'arena.sqlite'),
  wcMatches: path.join(HERE, 'fixtures', 'wc-matches.json'),
  seedDuels: path.join(HERE, 'fixtures', 'seed-duels.json'),
  rehearsal: path.join(HERE, 'fixtures', 'duel-rehearsal.json'),
  edgePick: path.join(HERE, 'fixtures', 'edge-pick.json'),
  duelists: path.join(HERE, 'fixtures', 'duelists.json'),
  bench: path.join(HERE, 'fixtures', 'bench.json'),
};

// ── CCTP V2 (mainnet) — duelist funding runbook (funds-gated) ───────────────
export const CCTP = {
  tokenMessengerV2: '0x28b5a0e9C621a5BadaA536219b3a228C8168cf5d',
  messageTransmitterV2: '0x81D40F21F12A8F0E3252Bccb954D722d4c464B64',
  attestationApi: 'https://iris-api.circle.com',
  baseSourceDomain: 6,
};

export function explorerTx(txhash: string, net: NetworkKey = ACTIVE_NETWORK): string {
  return `${NETWORKS[net].explorer}/tx/${txhash}`;
}
export function explorerAddress(addr: string, net: NetworkKey = ACTIVE_NETWORK): string {
  return `${NETWORKS[net].explorer}/address/${addr}`;
}

/** An obviously-fake, labeled placeholder tx hash for seed/rehearsal data (NEVER a real receipt). */
export const PLACEHOLDER_TX = '0x0000000000000000000000000000000000000000000000000000000000000000';
/**
 * True for the obviously-fake placeholder pattern: empty, or a 0x value whose
 * first 38+ nibbles are zero (covers the zero address 0x0…0 and all-zero tx
 * hashes, incl. ones with a tiny non-zero suffix like …0001 used to keep two
 * seed receipts distinct). Real addresses/hashes never have 38 leading zeros.
 */
export function isPlaceholderTx(tx: string | null | undefined): boolean {
  return !tx || /^0x0{38,}/i.test(tx);
}
