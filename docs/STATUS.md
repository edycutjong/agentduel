# STATUS — AgentDuel

Snapshot of what's real, what runs now with zero funds, and what's gated. The
honesty rule governs this file: money-moving items are **gated, not faked**.

_Built 2026-07-12 · `@injectivelabs/x402@0.0.1` · 53 tests green._

---

## 🔴🔵 2026-07-18 — REAL duel LIVE on the actual Final (real on-chain stakes)

`duel-final-2026` — the real FIFA World Cup 2026 **Final** (match `537390`,
kickoff `2026-07-19T19:00Z`) — is **LOCKED on the live arena with two REAL
0.10 USDC x402 stakes**, both paid through the live 402 gate on Injective EVM
mainnet (`eip155:1776`):

- **RED · HOME** — entry receipt
  [`0xc106c929dc00d902d1b690648e422cab81678cfb36fc06ce3a643c709eeba383`](https://blockscout.injective.network/tx/0xc106c929dc00d902d1b690648e422cab81678cfb36fc06ce3a643c709eeba383).
  RED first **bought its edge from LineLock's live API** with another real x402
  payment:
  [`0x8848e7798a4ff28f1c817a74f052b75f3462b33bcd4cba9400cc86b18143045e`](https://blockscout.injective.network/tx/0x8848e7798a4ff28f1c817a74f052b75f3462b33bcd4cba9400cc86b18143045e).
- **CYAN · AWAY** — entry receipt
  [`0x7e595b277b771ec98b1280af862e5699b30d31534f9013f5eaa9cbd512206073`](https://blockscout.injective.network/tx/0x7e595b277b771ec98b1280af862e5699b30d31534f9013f5eaa9cbd512206073)
  (contrarian, free consensus odds).
- **CCTP funding executed for real** — Base burn
  [`0x66ce1116e75f780e60259e394304e86f7565b52276f9d49e4c7fc66209427b37`](https://basescan.org/tx/0x66ce1116e75f780e60259e394304e86f7565b52276f9d49e4c7fc66209427b37)
  → Injective mint
  [`0xd757a98d6abb3e760898fc8c30447f6a8b86d35c0745db4f474ea56d3c4464ac`](https://blockscout.injective.network/tx/0xd757a98d6abb3e760898fc8c30447f6a8b86d35c0745db4f474ea56d3c4464ac).

One-curl proof (both entries `is_placeholder:false`, `pick_hash_verifies:true`,
`pre_kickoff_valid:true`):

```bash
curl https://api.agentduel.edycu.dev/api/duel/duel-final-2026/proof
```

**Settlement + real payout are still PENDING** — they run after the final
whistle (~Jul 19 evening) via the same funds-gated settle
(`AGENTDUEL_ALLOW_PAYOUT=1`, wallet now funded). No payout has happened yet;
this file will get the payout hash when it exists, not before.

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

**Tests: 53 passing** (8 files) — `hash` (7) · `slot-matching` (10) ·
`settlement` (11) · `idempotency` (6) · `pay-gate` (6) · `football` (4) ·
`quote` (4) · `proof` (4).

---

## ▶ Runnable now (zero funds)

| Command | What it proves |
|---|---|
| `npm test` | 53 tests incl. "double-run pays once" + void math + 402 parse |
| `npm run api` + `curl -i -X POST …/api/duel/enter` | live **402 + quote** (eip155:1776, 100000 units, arena payTo, native USDC) |
| `npm run red` / `npm run cyan` | duelists analyze + parse the live 402 (dry-run) |
| `npm run replay -- --render` | rehearsal reproduces: recomputed `decision_hash` == stored → ASCII timeline |
| `npm run settle` | settlement pass (mock payouts, labeled) |
| `npm run bench` | 402 round-trip p50/p95 + settlement-decision latency |
| `npm run readiness` | pre-submission checklist (11 runnable checks green) |
| `GET /api/duel/:id/proof` | one-curl falsifiability JSON (pick hashes verify, pre-kickoff valid) |
| `npm run web:dev` | arena page from the committed snapshot |

---

## ⛔ Blocked on funding (as of 2026-07-12 — superseded 2026-07-18, see top)

> **Superseded 2026-07-18:** CCTP funding executed, real entries paid, real duel
> live (hashes in the dated section at the top). Only the **payout** remains
> pending — it runs post-whistle through the same gate. Kept for the record:

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

## 🟡 Blocked on LineLock (as of 2026-07-12 — resolved 2026-07-18)

> **Resolved 2026-07-18:** LineLock's API is live and RED made a **real paid
> x402 call** for its edge —
> `0x8848e7798a4ff28f1c817a74f052b75f3462b33bcd4cba9400cc86b18143045e`
> (see the dated section at the top). Kept for the record:

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
