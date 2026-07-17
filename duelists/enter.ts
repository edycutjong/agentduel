/**
 * Duelist entry client — the x402 side of taking a duel slot.
 *
 *   dryRunEntry()  parse-only: POST with no payment → HTTP 402 → parse the quote.
 *                  Runnable NOW, no funds. Proves the handshake.
 *   payEntry()     full pay via the shipped createInjectiveClient().fetch()
 *                  (FUNDS-GATED — needs the duelist wallet gassed + holding USDC).
 *
 * We never hand-roll signing; the first-party client owns the EIP-3009 flow.
 */
import { parsePaymentRequired, parsePaymentResponseHeader, createInjectiveClient } from '@injectivelabs/x402/client';
import type { Agent, Side } from '../arena/types';
import { NET, OPS_WALLET_PK, explorerTx } from '../config';

export interface EntryBody {
  duelId: string;
  agent: Agent;
  side: Side;
  side_label?: string;
  rationale: string;
  wallet?: string;
}

export interface QuoteView {
  network: string;
  asset: string;
  amount_units: string;
  amount_usdc: number;
  payTo: string;
  scheme: string;
}

/** Parse-only: fetch the 402 for an entry and return the quote. No funds needed. */
export async function dryRunEntry(base: string, body: EntryBody): Promise<QuoteView | null> {
  const res = await fetch(`${base}/api/duel/enter`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (res.status !== 402) {
    console.log(`  (expected 402, got ${res.status} — is the API running with the gate on? \`npm run api\`)`);
    return null;
  }
  const header = res.headers.get('payment-required');
  if (!header) return null;
  const quote = parsePaymentRequired(header);
  const req = quote.accepts[0];
  return {
    network: req.network,
    asset: req.asset,
    amount_units: req.amount,
    amount_usdc: Number(req.amount) / 1e6,
    payTo: req.payTo,
    scheme: req.scheme,
  };
}

export interface PaidEntryResult {
  ok: boolean;
  receipt_tx?: string;
  explorer?: string;
  payer?: string;
  body?: unknown;
  error?: string;
}

/** Full paid entry (FUNDS-GATED). Returns a real receipt or an honest error. */
export async function payEntry(base: string, body: EntryBody): Promise<PaidEntryResult> {
  if (!OPS_WALLET_PK) return { ok: false, error: 'OPS_WALLET_PK not set — cannot sign an entry.' };
  try {
    const client = createInjectiveClient({
      privateKey: OPS_WALLET_PK,
      preferredNetworks: [NET.caip2],
      defaultToken: 'USDC',
    });
    const res = await client.fetch(`${base}/api/duel/enter`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const receipt = parsePaymentResponseHeader(res);
    const payload = await res.json().catch(() => null);
    if (!res.ok || !receipt?.transaction) {
      return { ok: false, error: `entry not settled (HTTP ${res.status})`, body: payload };
    }
    return {
      ok: true,
      receipt_tx: receipt.transaction,
      explorer: explorerTx(receipt.transaction),
      payer: receipt.payer,
      body: payload,
    };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}
