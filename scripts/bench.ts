/**
 * bench.ts — entry-handshake latency + settlement latency (no funds).
 *
 *   npm run bench                     # boots the app in-process, measures
 *
 * Measures:
 *   - entry 402 quote round-trip (p50/p95) — the "quote → commit" front half
 *     that a duelist pays against. No funds: it's the 402 emit + parse.
 *   - settlement decision latency (pure decideSettlement) — whistle → decision.
 * Writes fixtures/bench.json for the arena /verify section + README.
 */
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import type { Server } from 'node:http';
import { parsePaymentRequired } from '@injectivelabs/x402/client';
import { createApp } from '../api/server';
import { decideSettlement } from '../arena/core';
import type { ResultInput } from '../arena/core';
import { openMemoryDb, upsertDuel, insertSlot } from '../db/ledger';
import { buildDuel } from '../db/seed';
import { pickHash } from '../arena/hash';
import { PATHS } from '../config';

function pct(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const i = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length));
  return sorted[i];
}

async function main(): Promise<void> {
  const app = createApp();
  const server: Server = await new Promise((resolve) => {
    const s = app.listen(0, () => resolve(s));
  });
  const addr = server.address();
  const base = `http://127.0.0.1:${typeof addr === 'object' && addr ? addr.port : 0}`;

  const N = 60;
  const entryMs: number[] = [];
  for (let i = 0; i < N; i++) {
    const t0 = performance.now();
    const res = await fetch(`${base}/api/duel/enter`, { method: 'POST' });
    const header = res.headers.get('payment-required');
    if (header) parsePaymentRequired(header);
    entryMs.push(performance.now() - t0);
  }
  entryMs.sort((a, b) => a - b);
  server.close();

  // Settlement decision latency (pure).
  const db = openMemoryDb();
  const duel = buildDuel({
    id: 'bench', match_id: 1, fixture: 'F: A vs B', competition: 'WC26', stage: 'FINAL',
    kickoff_utc: '2099-01-01T00:00:00Z', home_label: 'A', away_label: 'B',
  });
  upsertDuel(db, duel);
  const mk = (agent: 'RED' | 'CYAN', side: 'HOME' | 'AWAY') => ({
    duel_id: duel.id, agent, side, side_label: side, rationale: `${agent}`,
    pick_hash: pickHash({ duelId: duel.id, side, rationale: agent }), wallet: `0x${agent}`,
    receipt_tx: `0x${agent}`, receipt_block_time: '2098-01-01T00:00:00Z', is_placeholder: false,
  });
  insertSlot(db, mk('RED', 'HOME'));
  insertSlot(db, mk('CYAN', 'AWAY'));
  const slots = [mk('RED', 'HOME'), mk('CYAN', 'AWAY')];
  const result: ResultInput = { match_id: 1, outcome: 'HOME_TEAM', home_score: 1, away_score: 0, result_source: 'bench' };
  const settleMs: number[] = [];
  for (let i = 0; i < 1000; i++) {
    const t0 = performance.now();
    decideSettlement(duel, slots, result);
    settleMs.push(performance.now() - t0);
  }
  settleMs.sort((a, b) => a - b);

  const out = {
    generated_at: new Date().toISOString(),
    entry_402_quote: {
      samples: N,
      p50_ms: Number(pct(entryMs, 50).toFixed(2)),
      p95_ms: Number(pct(entryMs, 95).toFixed(2)),
      note: 'Local 402 emit + parse round-trip (no on-chain settlement — funds-gated).',
    },
    settlement_decision: {
      samples: 1000,
      p50_ms: Number(pct(settleMs, 50).toFixed(4)),
      p95_ms: Number(pct(settleMs, 95).toFixed(4)),
      note: 'Pure decideSettlement() — whistle → winner decision + decision_hash.',
    },
  };
  fs.writeFileSync(PATHS.bench, JSON.stringify(out, null, 2));
  console.log(JSON.stringify(out, null, 2));
  console.log('\nwrote fixtures/bench.json');
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
