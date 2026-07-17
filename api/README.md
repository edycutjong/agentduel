# 🔌 api/ — AgentDuel x402 arena API

> The Express server that fronts the duel ledger: it gates entries behind an Injective x402 paywall and serves the free, auditable read + proof surface the arena page and duelists poll.

**[↩ Root README](../README.md)** · **[🏗️ Architecture](../docs/ARCHITECTURE.md)** · **[▶ Demo](../docs/DEMO.md)**

## 📦 What's here

| File | Purpose |
| --- | --- |
| `server.ts` | Builds the Express app (`createApp`), CORS-opens the free API, mounts the x402 gate + routes, seeds the ledger, and boots on `PORT`. `--demo` skips the gate. |
| `middleware.ts` | The x402 entry gate — builds the `injectivePaymentMiddleware` route map for `POST /api/duel/enter` (0.10 USDC, native USDC/EIP-3009, `settlementPolicy: 'before'`) + `quoteSummary()` for `/verify`. |
| `routes.ts` | All HTTP handlers: enter, single duel, duels list, one-curl proof, verify, health. Shapes the `duelView` / proof JSON and labels placeholder/mock data. |

## 🔌 Endpoints

| Method | Path | x402-gated | Purpose |
| --- | --- | --- | --- |
| POST | `/api/duel/enter` | ✅ 0.10 USDC | Take one side of a duel; binds side + pick-hash to the receipt tx. Real receipt ⇒ 200, `--demo` ⇒ 202 (`is_placeholder:true`). |
| GET | `/api/duel/:id` | free | One duel — slots, receipts, economics, result, winner, payouts. |
| GET | `/api/duel/:id/proof` | free | One-curl falsifiability evidence: verifies each `pick_hash`, pre-kickoff deltas, payouts, honesty notes, replay command. |
| GET | `/api/duels` | free | Current (open/locked) + settled/void duels, with attribution + placeholder disclaimer. |
| GET | `/api/verify` | free | 402 quote, native-USDC info, CCTP V2 params, settlement/payout gate status, reproduce commands. |
| GET | `/health` | free | Liveness — service, active network, duel count, `allow_payout`. |
| GET | `/` | free | Service banner listing the main routes. |

## 🚀 Run it

```bash
npm run api          # arena API on http://localhost:8403 (seeds itself)
npm run api -- --demo  # x402 gate DISABLED — exercise slot logic without funds

# prove the entry gate with no funds:
curl -i -X POST http://localhost:8403/api/duel/enter   # → HTTP 402 + quote
```

`npm run settle` runs the settlement worker that pays winners / refunds draws (mock unless armed — see Notes).

## ⚙️ Environment

Read via `../config.ts` (from `build/.env.local`; see `../.env.example`):

- `PORT` — API port (default `8403`).
- `AGENTDUEL_NETWORK` — `mainnet` (default, `eip155:1776`) | `testnet` (`eip155:1439`).
- `OPS_WALLET_PK` — arena wallet key = x402 facilitator + payout sender. Absent ⇒ a throwaway dummy key so the 402 still constructs (no real settlement).
- `PAYTO_ADDRESS` — x402 receiver (address only, no key).
- `AGENTDUEL_ALLOW_PAYOUT` — hard funds gate; a real on-chain USDC transfer runs only when `=1` **and** the wallet holds funds. Otherwise settlement is a labeled mock.
- `AGENTDUEL_API_URL` — external base URL for the 402 (defaults to `http://localhost:$PORT`).
- `AGENTDUEL_STAKE_UNITS` — override the stake (default `100000` = 0.10 USDC).

## 🧪 Notes

- Covered by the root Vitest suite (`npm test`) — pay-gate, quote, slot-matching, settlement, idempotency, proof, hash, football.
- **Honesty rule:** emitting the 402 quote needs no funds; a real paid entry needs the facilitator wallet gassed. Until then a paid request returns `402 payment_settlement_failed` — never a fake receipt.
- Entries without a real x402 receipt (demo mode) get a labeled `demo-entry-…` id and `is_placeholder:true` — never a `0x` hash presented as real.
- Payouts are mock (`is_mock:true`, `mock-tx-…`) unless `AGENTDUEL_ALLOW_PAYOUT=1` on a funded wallet. `scripts/replay.ts` re-derives each `decision_hash` from the ledger for independent verification.
