/**
 * Agent CYAN — the contrarian duelist.
 *
 *   npm run cyan                     # analyze + dry-run the entry (NO funds)
 *   npm run cyan -- --duel <id>      # target a specific duel
 *   npm run cyan -- --pay            # FUNDS-GATED: pay the entry on-chain
 *   npm run cyan -- --url <base>     # target a deployed arena
 *
 * Strategy: FREE consensus odds, contrarian by mandate. If RED has already taken
 * a side, CYAN takes the other (guaranteeing opposition + a valid duel). If the
 * duel is empty, CYAN backs the market underdog. Runs the SAME agent-duel flow
 * as RED — proving the Skill is strategy- and harness-agnostic.
 */
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import { dryRunEntry, payEntry, type EntryBody } from './enter';
import { OTHER_SIDE } from '../arena/core';
import type { Side } from '../arena/types';
import { API_BASE_URL, PATHS } from '../config';

function argVal(flag: string): string | undefined {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

/** Free consensus: back the market underdog (higher decimal odds = less likely). */
function underdogSide(): { side: Side; label: string; note: string } {
  try {
    const edge = JSON.parse(fs.readFileSync(PATHS.edgePick, 'utf8'));
    // edge-pick market_odds are on `side`; the OTHER side is the contrarian/underdog lean.
    const other = OTHER_SIDE[edge.side as Side];
    return {
      side: other,
      label: other === 'HOME' ? 'Home side' : 'Away side',
      note: `market prices ${edge.side} at ${edge.market_odds}; taking the contrarian ${other} on live upset equity`,
    };
  } catch {
    return { side: 'AWAY', label: 'Away side', note: 'no odds available; defaulting contrarian to AWAY' };
  }
}

async function main(): Promise<void> {
  const base = argVal('--url') ?? API_BASE_URL;
  const duelId = argVal('--duel') ?? 'duel-sf-fra-esp';
  const pay = process.argv.includes('--pay');

  console.log('🔵 Agent CYAN — contrarian duelist');
  console.log(`   arena: ${base} · duel: ${duelId} · mode: ${pay ? 'PAY (funds-gated)' : 'dry-run'}\n`);

  // 1. Read the duel card to see what RED (if anyone) already took.
  const card: any = await fetch(`${base}/api/duel/${duelId}`).then((r) => (r.ok ? r.json() : null)).catch(() => null);
  let side: Side;
  let rationale: string;
  let side_label: string;

  const redSlot = card?.slots?.find((s: any) => s.agent === 'RED');
  if (redSlot) {
    side = OTHER_SIDE[redSlot.side as Side];
    side_label = side === 'HOME' ? card.home_label : card.away_label;
    rationale =
      `Free consensus odds only, contrarian by mandate: RED took ${redSlot.side} (${redSlot.side_label}), ` +
      `so I take ${side}. Backing the other outcome on value at these prices.`;
    console.log(`   RED holds ${redSlot.side} → CYAN takes the opposing ${side}\n`);
  } else {
    const u = underdogSide();
    side = u.side;
    side_label = card ? (side === 'HOME' ? card.home_label : card.away_label) : u.label;
    rationale = `Free consensus odds, contrarian: ${u.note}.`;
    console.log(`   duel open (RED not in yet) → CYAN leans ${side} by free-odds contrarian rule\n`);
  }

  if (card) {
    console.log(`   fixture: ${card.fixture} · kickoff ${card.kickoff_utc} · state ${card.state}`);
    console.log(`   rule: ${card.economics.rule}\n`);
  }
  console.log(`   pick      : ${side} — ${side_label}`);
  console.log(`   rationale : ${rationale}\n`);

  const body: EntryBody = { duelId, agent: 'CYAN', side, side_label, rationale };

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
