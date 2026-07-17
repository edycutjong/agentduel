/**
 * 402 handshake — the entry gate emits a valid x402 quote with NO funds.
 * Parsed with the shipped @injectivelabs/x402 parsePaymentRequired (not by hand).
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { Server } from 'node:http';
import { parsePaymentRequired } from '@injectivelabs/x402/client';
import { createApp } from '../api/server';
import { quoteSummary } from '../api/middleware';
import { NET, STAKE_UNITS, PAYTO_ADDRESS } from '../config';

let server: Server;
let base: string;

beforeAll(async () => {
  const app = createApp(); // real x402 gate
  await new Promise<void>((resolve) => {
    server = app.listen(0, () => {
      const addr = server.address();
      const port = typeof addr === 'object' && addr ? addr.port : 0;
      base = `http://127.0.0.1:${port}`;
      resolve();
    });
  });
});

afterAll(() => {
  server?.close();
});

describe('POST /api/duel/enter — 402 quote', () => {
  it('returns HTTP 402 with a PAYMENT-REQUIRED header and no funds', async () => {
    const res = await fetch(`${base}/api/duel/enter`, { method: 'POST' });
    expect(res.status).toBe(402);
    expect(res.headers.get('payment-required')).toBeTruthy();
  });

  it('parses to the exact entry quote: eip155:1776, 100000 units, arena payTo, native USDC', async () => {
    const res = await fetch(`${base}/api/duel/enter`, { method: 'POST' });
    const header = res.headers.get('payment-required')!;
    const quote = parsePaymentRequired(header);
    const req = quote.accepts[0];
    expect(req.network).toBe(NET.caip2);
    expect(req.network).toBe('eip155:1776');
    expect(req.amount).toBe(STAKE_UNITS);
    expect(req.amount).toBe('100000'); // 0.10 USDC
    expect(req.asset.toLowerCase()).toBe(NET.usdc.toLowerCase());
    expect(req.payTo.toLowerCase()).toBe(PAYTO_ADDRESS.toLowerCase());
    expect(req.scheme).toBe('exact');
  });

  it('the 402 JSON body mirrors the header quote', async () => {
    const res = await fetch(`${base}/api/duel/enter`, { method: 'POST' });
    const body = (await res.json()) as { accepts: Array<{ amount: string; network: string }> };
    expect(body.accepts[0].amount).toBe('100000');
    expect(body.accepts[0].network).toBe('eip155:1776');
  });

  it('quoteSummary() matches (used by /verify + docs)', () => {
    const q = quoteSummary();
    expect(q.amount_units).toBe('100000');
    expect(q.amount_usdc).toBe(0.1);
    expect(q.network).toBe('eip155:1776');
    expect(q.asset_transfer_method).toBe('eip3009');
  });
});
