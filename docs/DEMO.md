# DEMO — AgentDuel (≤3 min, zero funds)

**The thesis, witnessable in under 5 minutes with NO wallet and NO funds:** two AI
agents take opposing sides of a real World Cup match, each faces a **real x402
payment gate** to commit, and reality settles the duel **deterministically** — you
can replay the settled decision from the ledger and get the *identical* hash every
time. Picks that can't be faked, because the commitment and the settlement are both
verifiable on the record.

> **What's real on camera vs. what's gated — stated up front.** Every beat below
> runs with **zero funds**: the live **402 handshake**, both agents' analysis, the
> **deterministic settlement replay**, the **arena page**, and the **one-curl
> proof** are all real and reproducible *now*. The literal on-chain **payout** is
> funds-gated (`AGENTDUEL_ALLOW_PAYOUT=1` + a funded wallet); until then settlement
> uses a **labeled MOCK** (`mock-tx-…`, never a `0x` hash). **The "oh" moment does
> not depend on a live paid transaction.** See [STATUS.md](STATUS.md).

---

## Setup (once)

```bash
npm install
npm run api            # terminal A — arena API on :8403 (self-seeds from fixtures)
npm run web:dev        # terminal B — arena page on :3403 (renders the committed snapshot)
```

---

## The beat sheet (timestamped, zero funds)

### 0:00–0:20 · The hook
On screen: the arena page (`:3403`), two agent cards facing off on **SF: FRA vs ESP**
and the **Final**. Say it plainly: *"Two AIs are about to disagree about a World Cup
match — and put real money on it. No human touches a button."*

### 0:20–0:50 · The gate is real, with no wallet
```bash
curl -i -X POST http://localhost:8403/api/duel/enter
```
→ **HTTP 402** + the x402 quote: `network eip155:1776 · amount 100000 (0.10 USDC) ·
payTo 0x4507…D0e3 · asset 0xa00C…235a · eip3009`. No wallet, no funds — **the
handshake itself proves this is real Injective x402**, not a mock. Point at the
`402` status line and the quote.

### 0:50–1:40 · Two agents, opposing sides (split screen)
```bash
npm run red  -- --duel duel-sf-fra-esp     # 🔴 buys LineLock's edge → HOME (France)
npm run cyan -- --duel duel-sf-fra-esp     # 🔵 free consensus odds, contrarian → AWAY (Spain)
```
Each reads the **same** duel card, prints its **rationale and pick**, then **parses
the live 402 quote it would pay to commit** (`0.10 USDC · eip155:1776 · payTo …`).
Two models, the same match, opposite sides, each staring down the same real payment
gate. *(Add `--pay` on a funded wallet to land the two receipts on-chain — funds-
gated; see STATUS.md. The dry-run is the honest zero-funds beat.)*

### 1:40–2:30 · Reality settles it — and it reproduces (THE "oh")
```bash
npm run replay -- --duel duel-rehearsal-fra-mar --render
```
The worker's settled decision is **re-derived from the ledger + the archived
football-data result** using the *same pure function*. On screen:

```
deterministic  : ✓ IDENTICAL — settlement reproduces
┌────────────────────────────────────────────────────────────────┐
│  ⚔  QF: FRA vs MAR   [QUARTER_FINALS]                            │
│  🔴 RED   HOME France to advance     receipt 0x0000…0000         │
│  🔵 CYAN  AWAY Morocco to advance    receipt 0x0000…0001         │
│  ⏱  LOCKED at kickoff — both stakes in (0.20 USDC pot)          │
│  🏁 FINAL 2-0  → HOME_TEAM                                       │
│  🏆 RED wins HOME — payout 0.18 USDC                             │
│     payout mock-tx-0530…5571  (mock — labeled)                  │
│     decision# d4c688d7…d98667   fee 0.02 USDC                   │
└────────────────────────────────────────────────────────────────┘
```
The line that lands the beat: **`✓ IDENTICAL — settlement reproduces`** — the
winner wasn't *asserted*, it was *recomputed* and the hash matched. Then:
```bash
npm run settle        # run it again → it PAYS ONCE (paid_now=0 on the re-run)
```
Idempotency, live: the payout can't double-fire. The payout is a **labeled MOCK**
on camera (`mock-tx-…`) — honest until the wallet is funded, same code path either way.

### 2:30–3:00 · The evidence + field your own
```bash
curl -s http://localhost:8403/api/duel/duel-rehearsal-fra-mar/proof | jq
```
One curl: every entry's `pick_hash_verifies:true`, `pre_kickoff_valid:true`, the
result, the `payout_tx`, the `decision_hash`. The arena page's **Verify** section
shows the same as a table with a plain-English **trust box**. Close on the Skill:
*"Field your own duelist — beat my model, on the record."*

---

## The single magic-moment beat (the "oh")

**At ~1:50**, `npm run replay -- --duel duel-rehearsal-fra-mar --render` prints
**`✓ IDENTICAL — settlement reproduces`** above the ASCII timeline — the judge
watches a settled AI-vs-AI duel re-derive itself from the ledger and reality, hash
included, then sees `npm run settle` refuse to pay twice. *The World Cup settled a
duel between two AIs, and you can prove it wasn't faked.* No wallet required.

## What's honest on camera
- Rehearsal receipts are **labeled all-zero** placeholders (`is_placeholder:true`);
  the rehearsal payout is a **labeled MOCK** (`is_mock:true`) — shown as such, never
  as a real `0x` tx.
- The **402 gate, the pick hashes, the determinism, and the idempotency are real**
  and reproducible with zero funds — that's the whole exhibit.

## Optional finale — the real on-chain duel (funds-gated · pending funding · TODO)
The **identical code path** runs a real mainnet duel the moment the arena wallet is
funded and the gate is opened:
```bash
AGENTDUEL_ALLOW_PAYOUT=1 npm run payout-smoke     # real USDC transfer (refuses unless funded)
npm run red -- --duel duel-sf-fra-esp --pay       # real 0.10 USDC entry (needs a gassed wallet)
```
`realPayWinner` does a **balance pre-flight and refuses** rather than emit a doomed
or faked tx. This is the "payout hash before the stadium empties" beat — captured on
the Final (Jul 19) if the wallet is funded, never faked if it isn't.

## Before submit — user steps (clearly-labeled TODO, not yet done)
- [x] **Record** the 3-min video — DONE: **https://youtu.be/Q7hxQKvnxyY** (2:03 zero-funds cut; README badge live).
- [ ] **Deploy** the arena page (`web/`) → replaces the gray `Live Demo` badge (no live URL is claimed until then).
- [ ] **(Optional, highest wow)** Fund the arena wallet (~0.3 INJ gas + USDC via CCTP), set `AGENTDUEL_ALLOW_PAYOUT=1`, and run **one real duel** (2 entries + 1 payout) on a Semi-Final or the Final for a real `0x` payout hash.

## Cross-harness beat (optional, 0 code)
Run RED in Claude Code and CYAN in a second harness (Cursor/Codex) using the same
`agent-duel` Skill — proving the Skill is harness-agnostic on camera.
