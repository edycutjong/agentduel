/**
 * entry-smoke.ts — a REAL x402 duel entry (FUNDS-GATED).
 *
 *   npm run entry-smoke -- --duel <id> --agent RED --side HOME
 *   npm run entry-smoke                 # defaults: duel-sf-fra-esp / RED / HOME
 *
 * Always prints the parsed 402 quote (runnable now). Then attempts a real paid
 * entry via the shipped client — which needs the duelist wallet gassed + holding
 * USDC. Until funded it prints exactly what's missing; it never fakes a receipt.
 */
import { fileURLToPath } from 'node:url';
import { dryRunEntry, payEntry, type EntryBody } from '../duelists/enter';
import { API_BASE_URL, HAS_REAL_FACILITATOR_KEY } from '../config';
import type { Agent, Side } from '../arena/types';

function argVal(flag: string, dflt: string): string {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? process.argv[i + 1] : dflt;
}

async function main(): Promise<void> {
  const base = argVal('--url', API_BASE_URL);
  const body: EntryBody = {
    duelId: argVal('--duel', 'duel-sf-fra-esp'),
    agent: argVal('--agent', 'RED') as Agent,
    side: argVal('--side', 'HOME') as Side,
    rationale: 'entry-smoke: proving the x402 entry handshake end to end',
  };
  console.log(`entry-smoke → ${base} · duel ${body.duelId} · ${body.agent}/${body.side}`);
  console.log(`  payer key loaded: ${HAS_REAL_FACILITATOR_KEY}\n`);

  const quote = await dryRunEntry(base, body);
  if (!quote) {
    console.error('  ✗ no 402 quote — is the API running with the gate on? `npm run api`');
    process.exit(1);
  }
  console.log(`  ✓ 402 quote: ${quote.amount_usdc} USDC (${quote.amount_units}) · ${quote.network} · payTo ${quote.payTo}\n`);

  console.log('  attempting REAL entry (funds-gated)…');
  const res = await payEntry(base, body);
  if (res.ok) {
    console.log(`  ✓ REAL entry settled: ${res.receipt_tx}`);
    console.log(`    explorer ${res.explorer}`);
  } else {
    console.log(`  ✗ entry not settled: ${res.error}`);
    console.log('    Expected until the wallet is funded (0 USDC on Injective). See STATUS.md → blocked-on-funding.');
    process.exitCode = 2;
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
