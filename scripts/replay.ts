/**
 * replay.ts — determinism proof + ASCII timeline.
 *
 *   npm run replay                    # replay the seeded rehearsal duel
 *   npm run replay -- --duel <id>     # replay a specific duel
 *   npm run replay -- --render        # also print the ASCII timeline
 *
 * Re-derives the settlement decision from the ledger (duel + slots) + the
 * archived football-data result, using the SAME pure decideSettlement() the
 * worker used. If the recomputed decision_hash matches the stored one, the
 * settlement is reproducible — the honesty claim, as a runnable check.
 */
import { fileURLToPath } from 'node:url';
import { openDb, getDuel, slotsFor, payoutsFor } from '../db/ledger';
import { seedIfEmpty } from '../db/seed';
import { decideSettlement } from '../arena/core';
import { resultFromMatch, findMatch, type FdMatch } from '../data/football';
import fs from 'node:fs';
import { PATHS, usdc } from '../config';

function argVal(flag: string): string | undefined {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

function archivedMatches(): FdMatch[] {
  return JSON.parse(fs.readFileSync(PATHS.wcMatches, 'utf8')).matches as FdMatch[];
}

async function main(): Promise<void> {
  const duelId = argVal('--duel') ?? 'duel-rehearsal-fra-mar';
  const render = process.argv.includes('--render');

  const db = openDb(PATHS.db);
  await seedIfEmpty(db);

  const duel = getDuel(db, duelId);
  if (!duel) {
    console.error(`duel ${duelId} not found. Try \`npm run replay -- --duel duel-rehearsal-fra-mar\`.`);
    process.exit(1);
  }
  const slots = slotsFor(db, duelId);
  if (slots.length < 2) {
    console.error(`duel ${duelId} has ${slots.length}/2 slots — nothing to replay.`);
    process.exit(1);
  }

  const result = resultFromMatch(findMatch(archivedMatches(), duel.match_id));
  if (!result) {
    console.error(`no archived FINAL result for match ${duel.match_id} — cannot replay.`);
    process.exit(1);
  }

  const recomputed = decideSettlement(duel, slots, result);
  const stored = duel.decision_hash;
  const match = stored === recomputed.decision_hash;

  console.log(`replay: ${duelId}`);
  console.log(`  match_id       : ${duel.match_id}  (${duel.fixture})`);
  console.log(`  archived result: ${result.home_score}-${result.away_score} · ${result.outcome} · ${result.result_source}`);
  console.log(`  stored hash    : ${stored ?? '(unsettled)'}`);
  console.log(`  recomputed hash: ${recomputed.decision_hash}`);
  console.log(`  deterministic  : ${match ? '✓ IDENTICAL — settlement reproduces' : '✗ MISMATCH'}`);

  if (render) {
    console.log('\n' + renderTimeline(duel, slots, result, recomputed, payoutsFor(db, duelId)));
  }

  if (!match && stored) process.exit(3);
}

function renderTimeline(duel: any, slots: any[], result: any, decision: any, payouts: any[]): string {
  const red = slots.find((s) => s.agent === 'RED');
  const cyan = slots.find((s) => s.agent === 'CYAN');
  const winTx = payouts[0]?.tx ?? decision.payments[0]?.to ?? '—';
  const L: string[] = [];
  const bar = '─'.repeat(64);
  L.push(`┌${bar}┐`);
  L.push(pad(`  ⚔  ${duel.fixture}   [${duel.stage}]`));
  L.push(pad(`     kickoff ${duel.kickoff_utc}`));
  L.push(`├${bar}┤`);
  L.push(pad(`  🔴 RED   ${red?.side.padEnd(4)} ${trunc(red?.side_label, 40)}`));
  L.push(pad(`     receipt ${short(red?.receipt_tx)}  T ${red?.receipt_block_time}`));
  L.push(pad(`     pick#  ${short(red?.pick_hash)}`));
  L.push(pad(`  🔵 CYAN  ${cyan?.side.padEnd(4)} ${trunc(cyan?.side_label, 40)}`));
  L.push(pad(`     receipt ${short(cyan?.receipt_tx)}  T ${cyan?.receipt_block_time}`));
  L.push(pad(`     pick#  ${short(cyan?.pick_hash)}`));
  L.push(`├${bar}┤`);
  L.push(pad(`  ⏱  LOCKED at kickoff — both stakes in (0.20 USDC pot)`));
  L.push(pad(`  🏁 FINAL ${result.home_score}-${result.away_score}  → ${result.outcome}`));
  L.push(`├${bar}┤`);
  if (decision.state === 'void') {
    L.push(pad(`  ⚖  VOID (draw) — refund ${usdc(duel.refund_units)} USDC to each side`));
  } else {
    L.push(pad(`  🏆 ${decision.winner_agent} wins ${decision.winner_side} — payout ${usdc(duel.payout_units)} USDC`));
    L.push(pad(`     P&L  RED ${pnl(decision, 'RED', duel)}   CYAN ${pnl(decision, 'CYAN', duel)}`));
  }
  L.push(pad(`     payout ${short(winTx)}${payouts[0]?.is_mock ? '  (mock — labeled)' : ''}`));
  L.push(pad(`     decision# ${short(decision.decision_hash)}   fee ${usdc(duel.fee_units)} USDC`));
  L.push(`└${bar}┘`);
  return L.join('\n');
}

function pnl(decision: any, agent: string, duel: any): string {
  const paid = decision.payments.filter((p: any) => p.agent === agent).reduce((a: number, p: any) => a + Number(p.units), 0);
  const v = (paid - Number(duel.stake_units)) / 1e6;
  return (v >= 0 ? '+' : '') + v.toFixed(2);
}
function short(x?: string): string {
  if (!x) return '—';
  return x.length > 20 ? `${x.slice(0, 10)}…${x.slice(-6)}` : x;
}
function trunc(x: string | undefined, n: number): string {
  if (!x) return '';
  return x.length > n ? x.slice(0, n - 1) + '…' : x;
}
/** Display width, counting emoji/symbols as 2 cols and variation selectors as 0. */
function visualWidth(s: string): number {
  let w = 0;
  for (const ch of s) {
    const cp = ch.codePointAt(0)!;
    if (cp === 0xfe0f) continue; // variation selector — width 0
    if (cp >= 0x1f300 || (cp >= 0x2600 && cp <= 0x27bf) || (cp >= 0x2300 && cp <= 0x23ff)) w += 2;
    else w += 1;
  }
  return w;
}
function pad(s: string): string {
  const width = 64;
  return `│${s}${' '.repeat(Math.max(0, width - visualWidth(s)))}│`;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
