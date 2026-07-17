# STATUS — AgentDuel

Snapshot of what's real, what runs now with zero funds, and what's gated. The
honesty rule governs this file: money-moving items are **gated, not faked**.

_Built 2026-07-12 · `@injectivelabs/x402@0.0.1` · 52 tests green._

---

## ✅ Done (built + verified)

- **Arena core** (pure, tested): slot matching with typed errors
  (`SIDE_TAKEN`/`DUEL_FULL`/`POST_KICKOFF`/`SAME_AGENT`/`BAD_SIDE`/`DUEL_NOT_OPEN`),
  opposing-sides-only, fixture-clock lock, `pick_hash` binding, void/fee math with
  a `fee invariant` guard (`pot − Σpayments === fee`).
- **Settlement worker** with a **mock** `payWinner`, idempotent **two ways**
  (duel-level `settled_at` guard + leg-level `payouts` UNIQUE) — a double-run pays
  once. Winner selection + draw→refund proven.
- **`decideSettlement`** is a single pure function shared by the worker and
  `replay.ts` → identical input, identical `decision_hash` (determinism proven).
- **x402 entry gate** on `POST /api/duel/enter` using the REAL routes-map
  middleware; emits a valid **402 quote with no funds** (proven via curl + a test
  that parses it with `parsePaymentRequired`).
- **Free API**: `GET /api/duel/:id`, `/api/duels`, `/api/duel/:id/proof` (one-curl
  evidence JSON), `/api/verify`.
- **Duelists**: RED parses the recorded LineLock pick and picks its side; CYAN
  takes the contrarian/opposing side. Both parse the live 402 quote.
- **Next.js arena page** (one route): versus cards, receipt seals, score, payout
  chip, fee+void rule printed before entry, `/verify` evidence table + trust box +
  Skill install. Builds clean; renders from the API or a committed snapshot.
- **`agent-duel` Skill**, README ("Injective technologies used"), ARCHITECTURE.md,
  DEMO.md, this STATUS.md.
- **Seed data**: 2 open duels (real SF + Final `match_id`/kickoff) + a **settled
  rehearsal** (real QF FRA 2-0 MAR) settled through the real worker with the
  labeled mock — so the page never demos empty and nothing is faked.

**Tests: 52 passing** (8 files) — `hash` (7) · `slot-matching` (10) ·
`settlement` (11) · `idempotency` (6) · `pay-gate` (6) · `football` (4) ·
`quote` (4) · `proof` (4).

---

## ▶ Runnable now (zero funds)

| Command | What it proves |
|---|---|
| `npm test` | 52 tests incl. "double-run pays once" + void math + 402 parse |
| `npm run api` + `curl -i -X POST …/api/duel/enter` | live **402 + quote** (eip155:1776, 100000 units, arena payTo, native USDC) |
| `npm run red` / `npm run cyan` | duelists analyze + parse the live 402 (dry-run) |
| `npm run replay -- --render` | rehearsal reproduces: recomputed `decision_hash` == stored → ASCII timeline |
| `npm run settle` | settlement pass (mock payouts, labeled) |
| `npm run bench` | 402 round-trip p50/p95 + settlement-decision latency |
| `npm run readiness` | pre-submission checklist (11 runnable checks green) |
| `GET /api/duel/:id/proof` | one-curl falsifiability JSON (pick hashes verify, pre-kickoff valid) |
| `npm run web:dev` | arena page from the committed snapshot |

---

## ⛔ Blocked on funding (gated — real tx, wallet unfunded)

Wallet state (2026-07-12): **13 USDC on Base, 0 INJ / 0 Base ETH / 0 USDC on
Injective**. So these need funding first; the logic is built + tested against the
gate, and refuses rather than fakes:

- **Real duel entries** — `npm run red -- --pay` / `npm run entry-smoke`. Needs a
  duelist wallet gassed with INJ + holding USDC on Injective. Until then the paid
  call returns HTTP 402 (honest), never a fake receipt.
- **CCTP duelist funding** — `npm run spawn-duelists` prints the runbook (Base
  burn → Iris attest → `cctp_mint`); executing it needs USDC on Base + gas.
- **Settlement payout transfer** — `AGENTDUEL_ALLOW_PAYOUT=1 npm run payout-smoke`.
  `realPayWinner` does a pre-flight balance check and **refuses** unless the gate
  is open AND the arena wallet holds USDC. Default runs use the labeled mock.

To go live: fund the arena wallet → `AGENTDUEL_ALLOW_PAYOUT=1` → run one real duel
(2 entries + 1 payout) on a live SF/Final. Everything else is wired.

---

## 🟡 Blocked on LineLock (sibling not deployed)

- **RED's live paid edge** — LineLock is built in
  `../../hackquest-injective-linelock/build/` but not deployed. `LINELOCK_URL`
  defaults to `http://localhost:8402`; RED tries a live paid call only under
  `--pay`, and **degrades to the recorded `fixtures/edge-pick.json`** otherwise
  (and to free consensus odds if even that is missing). No live dependency at
  build/test time. To wire live: run LineLock's API, set `LINELOCK_URL`, and
  fund the RED wallet.

---

## Notes / decisions
- **`transfer_send` has no memo** (verified) → the settlement is notarized via
  `decision_hash` in `/proof` + `replay.ts`, not a memo.
- Default real settlement path is a **direct USDC ERC-20 transfer via viem** (same
  result as MCP `transfer_send`, no MCP process to babysit); both sit behind the
  same `payWinner()` + funds gate.
- The runtime SQLite DB (`db/arena.sqlite`) is gitignored and self-seeds on first
  boot from `fixtures/`.
