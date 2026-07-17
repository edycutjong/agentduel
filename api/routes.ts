/**
 * Arena HTTP handlers.
 *
 *   POST /api/duel/enter     (x402-gated) — take a side; the receipt is the commitment
 *   GET  /api/duel/:id       (free)       — slots, receipts, score, state, payout
 *   GET  /api/duel/:id/proof (free)       — one-curl falsifiability evidence JSON
 *   GET  /api/duels          (free)       — current + settled duels
 *   GET  /api/verify         (free)       — quote, USDC, CCTP, reproduce commands
 *   GET  /health
 */
import type { Request, Response } from 'express';
import { createHash } from 'node:crypto';
import { openDb, getDuel, allDuels, slotsFor, insertSlot, setDuelState, payoutsFor, type DB } from '../db/ledger';
import { seedIfEmpty } from '../db/seed';
import { prepareEntry, shouldLock, agentPnL } from '../arena/core';
import { verifyPickHash } from '../arena/hash';
import { ArenaError } from '../arena/types';
import type { Agent, Side, Slot, Duel } from '../arena/types';
import {
  PATHS, NET, CCTP, ACTIVE_NETWORK, HAS_REAL_FACILITATOR_KEY, FOOTBALL_DATA, ALLOW_PAYOUT,
  explorerTx, explorerAddress, usdc, isPlaceholderTx,
} from '../config';
import { quoteSummary } from './middleware';

// ── DB (seed on first touch) ─────────────────────────────────────────────────
let _db: DB | null = null;
export function getDb(): DB {
  if (_db) return _db;
  _db = openDb(PATHS.db);
  // seedIfEmpty is async; kick it and swallow (idempotent, next request sees it).
  void seedIfEmpty(_db);
  return _db;
}
/** Test/CLI hook to inject an in-memory DB. */
export function setDb(db: DB): void {
  _db = db;
}

// ── helpers ──────────────────────────────────────────────────────────────────
export function preKickoffDelta(kickoffUtc: string, receiptTime: string) {
  const ms = new Date(kickoffUtc).getTime() - new Date(receiptTime).getTime();
  const valid = ms > 0;
  const totalMin = Math.max(0, Math.round(ms / 60000));
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  const human = h >= 24 ? `${Math.floor(h / 24)}d ${h % 24}h ${m}m` : `${h}h ${m}m`;
  return { hours: ms / 3600000, human, valid, before_kickoff: valid };
}

function slotView(duel: Duel, s: Slot) {
  return {
    agent: s.agent,
    side: s.side,
    side_label: s.side_label,
    rationale: s.rationale,
    pick_hash: s.pick_hash,
    wallet: s.wallet,
    wallet_explorer: isPlaceholderTx(s.wallet) ? null : explorerAddress(s.wallet),
    receipt_tx: s.receipt_tx,
    receipt_block_time: s.receipt_block_time,
    receipt_explorer: s.is_placeholder ? null : explorerTx(s.receipt_tx),
    is_placeholder: s.is_placeholder,
    pre_kickoff: preKickoffDelta(duel.kickoff_utc, s.receipt_block_time),
  };
}

function duelView(db: DB, duel: Duel) {
  const slots = slotsFor(db, duel.id);
  const payouts = payoutsFor(db, duel.id);
  return {
    id: duel.id,
    match_id: duel.match_id,
    fixture: duel.fixture,
    competition: duel.competition,
    stage: duel.stage,
    kickoff_utc: duel.kickoff_utc,
    home_label: duel.home_label,
    away_label: duel.away_label,
    state: duel.state,
    economics: {
      stake_usdc: usdc(duel.stake_units),
      payout_usdc: usdc(duel.payout_units),
      refund_usdc: usdc(duel.refund_units),
      fee_usdc: usdc(duel.fee_units),
      rule: `Winner takes ${usdc(duel.payout_units)} USDC · arena fee ${usdc(duel.fee_units)} USDC · ` +
        `draw/void ⇒ each side refunded ${usdc(duel.refund_units)} USDC`,
    },
    slots: slots.map((s) => slotView(duel, s)),
    result:
      duel.outcome != null
        ? { outcome: duel.outcome, home_score: duel.home_score, away_score: duel.away_score, source: duel.result_source }
        : null,
    winner_side: duel.winner_side,
    winner_agent: duel.winner_agent,
    decision_hash: duel.decision_hash,
    payout_tx: duel.payout_tx,
    settled_at: duel.settled_at,
    payouts: payouts.map((p) => ({
      agent: p.agent,
      kind: p.kind,
      units: p.units,
      usdc: usdc(p.units),
      tx: p.tx,
      is_mock: p.is_mock,
      explorer: p.is_mock ? null : explorerTx(p.tx),
    })),
  };
}

// ── POST /api/duel/enter (x402-gated) ────────────────────────────────────────
/**
 * Reached only AFTER x402 verify+settle (real receipt in req.x402), or in --demo
 * mode (no receipt — a LABELED synthetic entry, is_placeholder:true, never a
 * fake 0x hash presented as real).
 */
export function enterHandler(req: Request, res: Response): void {
  const db = getDb();
  const x402 = (req as any).x402 as
    | { payer?: string; txHash?: string; network?: string; amount?: string; asset?: string }
    | undefined;

  const body = (req.body ?? {}) as {
    duelId?: string; agent?: Agent; side?: Side; side_label?: string; rationale?: string; wallet?: string;
  };
  if (!body.duelId || !body.agent || !body.side) {
    res.status(400).json({ error: 'BAD_REQUEST', message: 'duelId, agent, side are required' });
    return;
  }
  const duel = getDuel(db, body.duelId);
  if (!duel) {
    res.status(404).json({ error: 'DUEL_NOT_FOUND', message: `duel ${body.duelId} not found` });
    return;
  }

  const realReceipt = !!x402?.txHash;
  const wallet = x402?.payer ?? body.wallet ?? '0x0000000000000000000000000000000000000000';
  // Real paid entry → the on-chain tx. Demo/no-payment → a LABELED synthetic id
  // (prefixed demo-entry-, NOT a 0x hash) so local dev works without faking a receipt.
  const receipt_tx = realReceipt
    ? (x402!.txHash as string)
    : `demo-entry-${createHash('sha256').update(`${body.duelId}|${body.agent}|${body.side}`).digest('hex').slice(0, 12)}`;

  try {
    const existing = slotsFor(db, duel.id);
    const slot = prepareEntry(duel, existing, {
      duelId: duel.id,
      agent: body.agent,
      side: body.side,
      side_label: body.side_label,
      rationale: body.rationale ?? '',
      wallet,
      receipt_tx,
      receipt_block_time: new Date().toISOString(),
    });
    slot.is_placeholder = !realReceipt;
    insertSlot(db, slot);

    if (shouldLock(existing.length)) setDuelState(db, duel.id, 'locked');

    res.status(realReceipt ? 200 : 202).json({
      committed: true,
      real_receipt: realReceipt,
      duel_id: duel.id,
      agent: slot.agent,
      side: slot.side,
      side_label: slot.side_label,
      pick_hash: slot.pick_hash,
      receipt: {
        tx: slot.receipt_tx,
        is_placeholder: slot.is_placeholder,
        network: x402?.network ?? NET.caip2,
        payer: wallet,
        block_time: slot.receipt_block_time,
        explorer: slot.is_placeholder ? null : explorerTx(slot.receipt_tx),
      },
      pre_kickoff: preKickoffDelta(duel.kickoff_utc, slot.receipt_block_time),
      state: getDuel(db, duel.id)?.state,
      note: realReceipt
        ? 'Committed. This receipt is your pre-kickoff stake — block time < kickoff on the explorer.'
        : 'Demo entry (no on-chain receipt bound — is_placeholder:true). A real entry pays 0.10 USDC via x402.',
    });
  } catch (e) {
    if (e instanceof ArenaError) {
      res.status(e.http).json({ error: e.code, message: e.message });
      return;
    }
    res.status(500).json({ error: 'INTERNAL', message: (e as Error).message });
  }
}

// ── GET /api/duel/:id ────────────────────────────────────────────────────────
export function duelHandler(req: Request, res: Response): void {
  const db = getDb();
  const duel = getDuel(db, req.params.id);
  if (!duel) {
    res.status(404).json({ error: 'DUEL_NOT_FOUND', id: req.params.id });
    return;
  }
  res.json(duelView(db, duel));
}

// ── GET /api/duels ───────────────────────────────────────────────────────────
export function duelsHandler(_req: Request, res: Response): void {
  const db = getDb();
  const duels = allDuels(db);
  res.json({
    generated_at: new Date().toISOString(),
    active_network: ACTIVE_NETWORK,
    attribution: FOOTBALL_DATA.attribution,
    disclaimer:
      'Slots with is_placeholder:true are rehearsal/demo entries with labeled non-chain receipts. ' +
      'Payouts with is_mock:true are labeled mock settlements (no real transfer). See STATUS.md.',
    open: duels.filter((d) => d.state === 'open' || d.state === 'locked').map((d) => duelView(db, d)),
    settled: duels.filter((d) => d.state === 'settled' || d.state === 'void').map((d) => duelView(db, d)),
  });
}

// ── GET /api/duel/:id/proof — the falsifiability claim as one diffable doc ────
export function proofHandler(req: Request, res: Response): void {
  const db = getDb();
  const duel = getDuel(db, req.params.id);
  if (!duel) {
    res.status(404).json({ error: 'DUEL_NOT_FOUND', id: req.params.id });
    return;
  }
  const slots = slotsFor(db, duel.id);
  const payouts = payoutsFor(db, duel.id);

  res.json({
    duel_id: duel.id,
    fixture: duel.fixture,
    competition: duel.competition,
    stage: duel.stage,
    kickoff_utc: duel.kickoff_utc,
    economics: {
      stake_usdc: usdc(duel.stake_units),
      payout_usdc: usdc(duel.payout_units),
      refund_usdc: usdc(duel.refund_units),
      fee_usdc: usdc(duel.fee_units),
    },
    entries: slots.map((s) => {
      const hashCheck = verifyPickHash({ duelId: duel.id, side: s.side, rationale: s.rationale }, s.pick_hash);
      const delta = preKickoffDelta(duel.kickoff_utc, s.receipt_block_time);
      return {
        agent: s.agent,
        side: s.side,
        side_label: s.side_label,
        rationale: s.rationale,
        pick_hash: s.pick_hash,
        pick_hash_verifies: hashCheck.ok,
        wallet: s.wallet,
        receipt_tx: s.receipt_tx,
        receipt_block_time: s.receipt_block_time,
        pre_kickoff_valid: delta.before_kickoff,
        pre_kickoff: delta.human,
        is_placeholder: s.is_placeholder,
        receipt_explorer: s.is_placeholder ? null : explorerTx(s.receipt_tx),
        pnl_usdc: duel.settled_at ? usdc(pnlUnits(db, duel, s.agent)) : null,
      };
    }),
    result:
      duel.outcome != null
        ? { outcome: duel.outcome, home_score: duel.home_score, away_score: duel.away_score, source: duel.result_source }
        : null,
    state: duel.state,
    winner_side: duel.winner_side,
    winner_agent: duel.winner_agent,
    payout_tx: duel.payout_tx,
    decision_hash: duel.decision_hash,
    settled_at: duel.settled_at,
    payouts: payouts.map((p) => ({
      agent: p.agent, kind: p.kind, units: p.units, usdc: usdc(p.units),
      tx: p.tx, is_mock: p.is_mock, explorer: p.is_mock ? null : explorerTx(p.tx),
    })),
    honesty: {
      trust_model:
        'v1 transparent operator: the arena holds the pot between whistle and payout (~minutes). ' +
        'Every leg is on-chain and auditable; scripts/replay.ts re-derives this decision_hash from the ' +
        'ledger + archived result. Smart-contract escrow is documented future work.',
      placeholder_note: 'is_placeholder:true entries and is_mock:true payouts are labeled non-chain rehearsal/dev data.',
    },
    reproduce: {
      replay: `npm run replay -- --duel ${duel.id}`,
      note: 'replay.ts recomputes decision_hash from the same pure decideSettlement() the worker used — identical input ⇒ identical hash.',
    },
  });
}

function pnlUnits(db: DB, duel: Duel, agent: Agent): number {
  const payments = payoutsFor(db, duel.id).map((p) => ({ agent: p.agent as Agent, units: p.units }));
  return agentPnL(duel, { payments: payments as any }, agent);
}

// ── GET /api/verify ──────────────────────────────────────────────────────────
export function verifyHandler(_req: Request, res: Response): void {
  const db = getDb();
  const duels = allDuels(db);
  res.json({
    quote: quoteSummary(),
    usdc_native_info: {
      network: NET.caip2, address: NET.usdc, decimals: 6, symbol: 'USDC',
      name: 'USD Coin (native, Circle FiatTokenV2_2)', eip3009: true, explorer: `${NET.explorer}/token/${NET.usdc}`,
    },
    cctp: {
      version: 'V2', base_source_domain: CCTP.baseSourceDomain,
      token_messenger_v2: CCTP.tokenMessengerV2, message_transmitter_v2: CCTP.messageTransmitterV2,
      attestation_api: CCTP.attestationApi,
      note: 'Duelist funding (Base burn → Iris attest → cctp_mint) is funds-gated — see STATUS.md.',
    },
    settlement: {
      allow_payout: ALLOW_PAYOUT,
      facilitator_key_loaded: HAS_REAL_FACILITATOR_KEY,
      note: ALLOW_PAYOUT
        ? 'AGENTDUEL_ALLOW_PAYOUT=1 — real transfers armed (still require a funded wallet).'
        : 'AGENTDUEL_ALLOW_PAYOUT!=1 — settlement uses the labeled mock; no real transfer is emitted.',
    },
    duels: duels.map((d) => ({ id: d.id, fixture: d.fixture, state: d.state, decision_hash: d.decision_hash })),
    reproduce: {
      curl_402: 'curl -i -X POST ' + quoteSummary().route.split(' ')[1],
      note: 'POST /api/duel/enter with no PAYMENT-SIGNATURE header returns HTTP 402 + the quote above.',
    },
  });
}

export function healthHandler(_req: Request, res: Response): void {
  const db = getDb();
  res.json({
    ok: true, service: 'agentduel-api', active_network: ACTIVE_NETWORK,
    duels: allDuels(db).length, allow_payout: ALLOW_PAYOUT,
  });
}
