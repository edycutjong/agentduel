/**
 * Agent RED — the edge duelist.
 *
 *   npm run red                      # analyze + dry-run the entry (NO funds)
 *   npm run red -- --duel <id>       # target a specific duel
 *   npm run red -- --pay             # FUNDS-GATED: buy the live edge + pay the entry
 *   npm run red -- --url <base>      # target a deployed arena
 *
 * Strategy: buy LineLock's paid edge (recorded fixture by default; live paid
 * call under --pay), take the side the model says has value, stake it.
 */
import { fileURLToPath } from 'node:url';
import { getRedEdge } from './edge';
import { dryRunEntry, payEntry, type EntryBody } from './enter';
import { API_BASE_URL, OPS_WALLET_ADDRESS } from '../config';

function argVal(flag: string): string | undefined {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main(): Promise<void> {
  const base = argVal('--url') ?? API_BASE_URL;
  const duelId = argVal('--duel') ?? 'duel-sf-fra-esp';
  const pay = process.argv.includes('--pay');

  console.log('🔴 Agent RED — edge duelist');
  console.log(`   arena: ${base} · duel: ${duelId} · mode: ${pay ? 'PAY (funds-gated)' : 'dry-run'}\n`);

  // 1. Read the duel card.
  const card: any = await fetch(`${base}/api/duel/${duelId}`).then((r) => (r.ok ? r.json() : null)).catch(() => null);
  if (card) {
    console.log(`   fixture: ${card.fixture} · kickoff ${card.kickoff_utc} · state ${card.state}`);
    console.log(`   rule: ${card.economics.rule}\n`);
    const taken = (card.slots ?? []).map((s: any) => `${s.agent}:${s.side}`);
    if (taken.length) console.log(`   slots taken: ${taken.join(', ')}`);
  } else {
    console.log('   (could not read duel card — is the API up? proceeding with the recorded edge)\n');
  }

  // 2. Get the edge (recorded by default; live paid under --pay).
  const edge = await getRedEdge({ pay });
  console.log(`   edge source : ${edge.source}`);
  console.log(`   pick        : ${edge.side} — ${edge.side_label}`);
  console.log(`   model/odds  : ${(edge.model_prob * 100).toFixed(0)}% @ ${edge.market_odds}  (edge +${(edge.edge_pct * 100).toFixed(1)} pts)`);
  console.log(`   rationale   : ${edge.rationale}\n`);

  const body: EntryBody = {
    duelId,
    agent: 'RED',
    side: edge.side,
    side_label: edge.side_label,
    rationale: edge.rationale,
    wallet: OPS_WALLET_ADDRESS || undefined,
  };

  // 3. Entry: dry-run always; pay only when gated on.
  const quote = await dryRunEntry(base, body);
  if (quote) {
    console.log('   x402 entry quote (parsed live):');
    console.log(`     ${quote.amount_usdc} USDC (${quote.amount_units}) · ${quote.network} · payTo ${quote.payTo}\n`);
  }

  if (!pay) {
    console.log('   ▶ dry-run complete. Re-run with --pay (funded wallet) to stake the entry on-chain.');
    return;
  }
  console.log('   ⚠️  --pay: attempting a REAL 0.10 USDC entry (needs a gassed wallet holding USDC)…');
  const result = await payEntry(base, body);
  if (result.ok) {
    console.log(`   ✓ committed. receipt ${result.receipt_tx}`);
    console.log(`     explorer ${result.explorer}`);
  } else {
    console.log(`   ✗ entry not settled: ${result.error}`);
    console.log('     (expected until the duelist wallet is funded — see STATUS.md → blocked-on-funding)');
    process.exitCode = 2;
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
