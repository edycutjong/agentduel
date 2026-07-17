/**
 * payout-smoke.ts — a REAL settlement payout (FUNDS-GATED, double-locked).
 *
 *   AGENTDUEL_ALLOW_PAYOUT=1 npm run payout-smoke -- --duel <id>
 *
 * Runs settlement with the REAL payWinner (defaultPayWinner picks it only when
 * AGENTDUEL_ALLOW_PAYOUT=1 AND OPS_WALLET_PK is set). realPayWinner then does a
 * pre-flight USDC balance check and REFUSES rather than emit a doomed/fake tx.
 * With the gate closed (default) this prints the closed status and exits — it
 * will NOT emit a mock here (that would muddy a "real payout" smoke).
 */
import { fileURLToPath } from 'node:url';
import { openDb, getDuel } from '../db/ledger';
import { seedIfEmpty } from '../db/seed';
import { settleDuel } from '../settle/worker';
import { defaultPayWinner } from '../settle/pay';
import { fetchResult } from '../data/football';
import { PATHS, ALLOW_PAYOUT, HAS_REAL_FACILITATOR_KEY, explorerTx, usdc } from '../config';

function argVal(flag: string, dflt: string): string {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? process.argv[i + 1] : dflt;
}

async function main(): Promise<void> {
  const duelId = argVal('--duel', 'duel-rehearsal-fra-mar');
  console.log('payout-smoke (funds-gated)');
  console.log(`  AGENTDUEL_ALLOW_PAYOUT: ${ALLOW_PAYOUT ? '1 (open)' : 'unset/0 (CLOSED)'}`);
  console.log(`  OPS_WALLET_PK loaded  : ${HAS_REAL_FACILITATOR_KEY}\n`);

  const { pay, real } = defaultPayWinner();
  if (!real) {
    console.log('  ▶ gate closed — refusing to run a real payout. Nothing sent.');
    console.log('    To arm: fund the arena wallet with USDC on Injective, then');
    console.log('    `AGENTDUEL_ALLOW_PAYOUT=1 npm run payout-smoke -- --duel <id>`.');
    console.log('    (Mock settlement lives in `npm run settle`; this smoke is real-only.)');
    return;
  }

  const db = openDb(PATHS.db);
  await seedIfEmpty(db);
  const duel = getDuel(db, duelId);
  if (!duel) {
    console.error(`  duel ${duelId} not found`);
    process.exit(1);
  }
  const result = await fetchResult(duel.match_id).catch(() => null);
  console.log(`  settling ${duelId} with REAL payWinner…`);
  const o = await settleDuel(db, duelId, result, pay);
  console.log(`  status ${o.status} · paid_now ${o.paid_now}`);
  for (const p of o.payouts) {
    console.log(`    ${p.kind} ${usdc(p.units)} USDC → ${p.agent}: ${p.tx}` + (p.is_mock ? '' : `  ${explorerTx(p.tx)}`));
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
