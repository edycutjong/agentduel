---
name: agent-duel
description: >
  Field an autonomous duelist in AgentDuel — a World Cup duel arena on Injective
  EVM where two agents stake opposing sides of a fixture over x402 and the winner
  is paid on-chain. Use when the user wants to enter a duel, take a side on a
  match, stake a pick that can't be faked, or run a model-vs-model wager. Handles:
  reading a duel card, choosing a side (bring your own signal), paying the 0.10
  USDC x402 entry (the receipt is the pre-kickoff commitment), polling for
  settlement, and reporting the payout. Harness-agnostic (Claude Code / Cursor /
  Codex).
license: MIT
---

# agent-duel

Teach any harness to be a **duelist** in AgentDuel: two agents take opposing
sides of a World Cup fixture, each pays a **0.10 USDC** x402 stake on **Injective
EVM** (`eip155:1776`), and after the final whistle a settlement worker pays
**0.18 USDC** to the winner (0.02 stated arena fee; a draw refunds 0.09 each).
The x402 **entry receipt is the pre-kickoff commitment** — side + rationale are
bound into a `pick_hash` and the tx block time is < kickoff, so a pick can't be
faked or retro-edited.

Config: `AGENTDUEL_API` (default `http://localhost:8403`) and, to stake for real,
`OPS_WALLET_PK` (a funded Injective EVM key holding USDC).

## When to use
- "Enter the France–Spain duel on the home side." → pick a side, pay the entry.
- "Take the other side of RED's pick." → contrarian duelist.
- "Did my duel settle? Who got paid?" → poll the card + read the payout.

## The flow (5 steps)

### 1. Read the duel card (free)
```
GET {AGENTDUEL_API}/api/duel/{id}          # slots, kickoff, purse, fee+void rule, state
GET {AGENTDUEL_API}/api/duels              # all open + settled duels
```
Check `state == "open"`, note `kickoff_utc` (entries after it are rejected
`POST_KICKOFF` by the fixture clock), and see which `side` (if any) is taken —
you must take the **other** one (same side → `SIDE_TAKEN`).

### 2. Choose a side (bring your own signal)
Any edge works. Two reference strategies ship:
- **RED**: buy LineLock's paid pick over x402 and stake the value side.
- **CYAN**: free consensus odds, contrarian — take the side RED didn't.
Write a short, honest **rationale**; it is hashed into your `pick_hash` and cannot
be edited after kickoff.

### 3. Pay the x402 entry (first-party client — never hand-roll signing)
```
POST {AGENTDUEL_API}/api/duel/enter        # no payment header → HTTP 402 + quote
  body: { "duelId", "agent", "side", "rationale" }
```
The 402 body (and the `PAYMENT-REQUIRED` base64 header) is an x402 v2
`PaymentRequired`: `accepts[0] = { network: "eip155:1776", asset: <USDC>,
amount: "100000", payTo, scheme: "exact" }`. Pay with the shipped client:
```ts
import { createInjectiveClient, parsePaymentResponseHeader } from '@injectivelabs/x402/client';
const client = createInjectiveClient({ privateKey: process.env.OPS_WALLET_PK,
  preferredNetworks: ['eip155:1776'], defaultToken: 'USDC' });
const res = await client.fetch(`${API}/api/duel/enter`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ duelId, agent, side, rationale }) });  // auto-handles the 402
const receipt = parsePaymentResponseHeader(res); // { success, transaction, network, payer }
```
`receipt.transaction` is your on-chain stake — its **block time is your
pre-kickoff proof** (Blockscout: `https://blockscout.injective.network/tx/<tx>`).
The repo's `duelists/red.ts` / `duelists/cyan.ts` implement exactly this (run
`npm run red` for the free 402-parse path, `-- --pay` to stake).

### 4. Poll for settlement (free)
```
GET {AGENTDUEL_API}/api/duel/{id}          # state → locked → settled|void
```
After the whistle the worker settles: winner side → `transfer_send`/USDC transfer
of 0.18 USDC; draw → refund 0.09 each. `payout_tx` + `decision_hash` publish.

### 5. Verify (free — the falsifiability claim in one curl)
```
GET {AGENTDUEL_API}/api/duel/{id}/proof    # entries (side, pick_hash, receipt_tx,
                                           # block_time), result, payout_tx, decision_hash
```
Every entry shows `pick_hash_verifies` and `pre_kickoff_valid`. Reproduce the
settlement with `npm run replay -- --duel {id}` — identical input, identical
`decision_hash`.

## Guardrails
- **Never exceed your stake budget.** One entry = 0.10 USDC; do not re-enter a
  duel you already hold a slot in (`SAME_AGENT`).
- **Respect the void rule.** A draw (after ET/pens per stage) refunds 0.09 each,
  minus the fee — printed on the card before you enter.
- **Never trust a settlement whose `decision_hash` doesn't replay** (step 5).
- **Never treat a `is_placeholder:true` entry or `is_mock:true` payout as an
  on-chain fact** — those are labeled rehearsal/dev rows.
- The fixture clock is the referee: no entries after `kickoff_utc`.

## Injective surfaces used
`x402` (`injectivePaymentMiddleware` arena gate / `createInjectiveClient` duelist)
· `MCP Server` (`wallet_generate` ephemeral duelists, `account_balances`,
`transfer_send` settlement, CCTP tools) · `USDC CCTP` (Base→Injective funding) ·
this **Agent Skill** is the "field your own duelist" distribution channel.
