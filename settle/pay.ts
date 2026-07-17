/**
 * payWinner — the ONE money-moving abstraction, and the honesty gate lives here.
 *
 * THE RULE (non-negotiable): a real on-chain USDC transfer runs ONLY when
 * AGENTDUEL_ALLOW_PAYOUT=1 AND the arena wallet actually holds funds. Otherwise
 * every settlement uses `mockPayWinner`, which returns an UNMISTAKABLY-fake tx id
 * (prefixed `mock-tx-…`, never a 0x… hash) tagged `mock: true`. A faked payout
 * hash would destroy the entire "picks that can't be faked" thesis, so we never
 * mint one.
 *
 * Settlement uses MCP `transfer_send` in the spec; for a headless worker the
 * robust equivalent is a direct USDC ERC-20 transfer via viem from the arena
 * wallet on Injective EVM (same result, no MCP process to babysit). Either sits
 * behind this same `PayFn` + funds gate.
 */
import { createHash } from 'node:crypto';
import type { Agent } from '../arena/types';
import {
  NET, OPS_WALLET_PK, ALLOW_PAYOUT, usdc,
} from '../config';

export interface PayResult {
  tx: string;
  mock: boolean;
}

export interface PayContext {
  duelId: string;
  agent: Agent;
  kind: 'payout' | 'refund';
}

export type PayFn = (to: string, units: string, ctx: PayContext) => Promise<PayResult>;

/** Deterministic, obviously-fake tx id for a mock settlement leg. Never a 0x hash. */
export function mockTxId(to: string, units: string, ctx: PayContext): string {
  const h = createHash('sha256')
    .update(`${ctx.duelId}|${ctx.agent}|${ctx.kind}|${to}|${units}`)
    .digest('hex')
    .slice(0, 16);
  return `mock-tx-${h}`;
}

/** The default non-funds path: returns a labeled fake tx. Used in tests + un-gated runs. */
export const mockPayWinner: PayFn = async (to, units, ctx) => ({
  tx: mockTxId(to, units, ctx),
  mock: true,
});

// Minimal ERC-20 transfer ABI (USDC).
const ERC20_TRANSFER_ABI = [
  {
    type: 'function',
    name: 'transfer',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'to', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [{ name: '', type: 'bool' }],
  },
  {
    type: 'function',
    name: 'balanceOf',
    stateMutability: 'view',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
] as const;

/**
 * Real USDC transfer from the arena wallet on Injective EVM. Imported lazily so
 * the mock path (and all tests) never pull viem chain setup. THROWS unless the
 * funds gate is open — it will NEVER silently degrade to a mock, because the
 * caller asked for a real payment and must get a real one or a hard error.
 */
export const realPayWinner: PayFn = async (to, units, ctx) => {
  if (!ALLOW_PAYOUT) {
    throw new Error(
      'realPayWinner refused: AGENTDUEL_ALLOW_PAYOUT != 1 (funds gate closed). ' +
        'Use the mock path or open the gate on a funded wallet. See STATUS.md.',
    );
  }
  if (!OPS_WALLET_PK) {
    throw new Error('realPayWinner refused: OPS_WALLET_PK not set — cannot sign a transfer.');
  }

  const { createWalletClient, createPublicClient, http, defineChain, getAddress } = await import('viem');
  const { privateKeyToAccount } = await import('viem/accounts');

  const chain = defineChain({
    id: NET.chainId,
    name: NET.name,
    nativeCurrency: { name: 'Injective', symbol: 'INJ', decimals: 18 },
    rpcUrls: { default: { http: [NET.rpc] } },
    blockExplorers: { default: { name: 'Blockscout', url: NET.explorer } },
  });

  const account = privateKeyToAccount(OPS_WALLET_PK);
  const publicClient = createPublicClient({ chain, transport: http(NET.rpc) });
  const walletClient = createWalletClient({ account, chain, transport: http(NET.rpc) });

  // Pre-flight balance check — refuse rather than emit a doomed tx.
  const bal = (await publicClient.readContract({
    address: NET.usdc,
    abi: ERC20_TRANSFER_ABI,
    functionName: 'balanceOf',
    args: [account.address],
  })) as bigint;
  if (bal < BigInt(units)) {
    throw new Error(
      `realPayWinner refused: arena USDC balance ${usdc(bal.toString())} < payout ${usdc(units)} ` +
        `(${ctx.kind} to ${ctx.agent}). Fund the wallet first — see STATUS.md.`,
    );
  }

  const hash = await walletClient.writeContract({
    address: NET.usdc,
    abi: ERC20_TRANSFER_ABI,
    functionName: 'transfer',
    args: [getAddress(to), BigInt(units)],
  });
  await publicClient.waitForTransactionReceipt({ hash });
  return { tx: hash, mock: false };
};

/**
 * Pick the payWinner the CLI/worker should use. Real ONLY behind the gate; the
 * default is always the labeled mock so an un-configured run can never fake a tx.
 */
export function defaultPayWinner(): { pay: PayFn; real: boolean } {
  if (ALLOW_PAYOUT && OPS_WALLET_PK) return { pay: realPayWinner, real: true };
  return { pay: mockPayWinner, real: false };
}
