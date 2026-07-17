# Contributing

Thanks for your interest in improving **AgentDuel**! 🎉

AgentDuel is two parts in one repo: the **root** package (pure `arena/` + `settle/`
logic and the x402 duel API, tested with **vitest**) and **`web/`** (the Next.js
arena page judges visit). Everything below works with **zero funds** — the
money-moving path is gated behind `AGENTDUEL_ALLOW_PAYOUT=1` and never faked.

## Getting Started

1. Fork the repo and branch from `main`: `git checkout -b feat/your-feature`
2. Install root deps: `npm install`
3. (Optional) Copy the env template: `cp .env.example .env.local`
   — not needed for tests or the demo page (both run in snapshot mode).
4. Run the arena API: `npm run api` (http://localhost:8403, self-seeds)
5. Run the arena page: `npm run web:dev` (http://localhost:3403)

## Before You Open a PR

- `npm run ci` passes (`tsc --noEmit` + vitest — 52 tests).
- `npm run e2e` passes (Playwright against `web/`, demo/snapshot mode).
- Add or update tests for any behavior change.
- **Never weaken the honesty rule:** mock settlements must return `mock-tx-…`
  (never a `0x` hash), placeholders must stay tagged `is_placeholder`, and the
  real payout must stay gated behind `AGENTDUEL_ALLOW_PAYOUT=1` + a funded wallet.
- Keep commits conventional (`feat:`, `fix:`, `docs:`, `chore:`).

## Reporting Bugs / Requesting Features

Open an issue using the provided templates. Include repro steps, expected vs.
actual behavior, and environment details (OS, Node version).
