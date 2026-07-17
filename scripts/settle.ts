/**
 * settle.ts — the settlement worker CLI.
 *
 *   npm run settle                    # one pass over unsettled, filled duels
 *   npm run settle -- --duel <id>     # settle one duel now
 *   npm run settle -- --cron          # poll every 5 min (node-cron) until whistle
 *
 * Payouts go through defaultPayWinner(): the LABELED MOCK unless
 * AGENTDUEL_ALLOW_PAYOUT=1 AND the wallet holds USDC (funds gate). A double-run
 * is a no-op (idempotent) — safe to leave the cron loop running.
 */
import { fileURLToPath } from 'node:url';
import cron from 'node-cron';
import { openDb, getDuel } from '../db/ledger';
import { seedIfEmpty } from '../db/seed';
import { settleDuel, settlePass } from '../settle/worker';
import { defaultPayWinner } from '../settle/pay';
import { fetchResult } from '../data/football';
import { PATHS, usdc, explorerTx } from '../config';
import type { SettleOutcome } from '../settle/worker';

function argVal(flag: string): string | undefined {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

function report(o: SettleOutcome): void {
  const tag =
    o.status === 'settled' ? (o.duel.state === 'void' ? '⚖ VOID' : '🏆 SETTLED') :
    o.status === 'already-settled' ? '· already-settled' :
    o.status === 'incomplete' ? '· incomplete' : '· not-final';
  console.log(`  ${tag}  ${o.duel.id}  (${o.duel.fixture})`);
  if (o.status === 'settled') {
    console.log(`      result ${o.duel.home_score}-${o.duel.away_score} ${o.duel.outcome}` +
      (o.duel.winner_agent ? ` → ${o.duel.winner_agent} wins` : ' → refund both'));
    for (const p of o.payouts) {
      const link = p.is_mock ? '(mock — labeled, no real tx)' : explorerTx(p.tx);
      console.log(`      ${p.kind} ${usdc(p.units)} USDC → ${p.agent}: ${p.tx} ${link}`);
    }
    console.log(`      decision_hash ${o.duel.decision_hash}  · paid_now=${o.paid_now}`);
  } else if (o.reason) {
    console.log(`      ${o.reason}`);
  }
}

async function main(): Promise<void> {
  const db = openDb(PATHS.db);
  await seedIfEmpty(db);
  const { pay, real } = defaultPayWinner();
  console.log(`settlement worker — payout mode: ${real ? 'REAL (funds gate OPEN)' : 'MOCK (gate closed / labeled)'}\n`);

  const duelId = argVal('--duel');

  const runOnce = async () => {
    if (duelId) {
      const duel = getDuel(db, duelId);
      if (!duel) {
        console.error(`duel ${duelId} not found`);
        process.exit(1);
      }
      const result = await fetchResult(duel.match_id).catch(() => null);
      report(await settleDuel(db, duelId, result, pay));
    } else {
      const outcomes = await settlePass(db, fetchResult, pay);
      if (outcomes.length === 0) console.log('  (no filled, unsettled duels)');
      outcomes.forEach(report);
    }
  };

  if (process.argv.includes('--cron')) {
    console.log('cron mode: polling every 5 minutes (Ctrl-C to stop). Idempotent — safe to re-run.\n');
    await runOnce();
    cron.schedule('*/5 * * * *', () => {
      console.log(`\n[${new Date().toISOString()}] settlement pass`);
      runOnce().catch((e) => console.error(e));
    });
  } else {
    await runOnce();
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
