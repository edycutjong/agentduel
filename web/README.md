# 🖥️ web/ — AgentDuel arena page

> The Next.js 14 arena poster: a single server-rendered page that renders live duels, settled results, and the verify/evidence panel from the API — falling back to a committed snapshot when no API is reachable.

**[↩ Root README](../README.md)** · **[🏗️ Architecture](../docs/ARCHITECTURE.md)** · **[▶ Demo](../docs/DEMO.md)**

## 📦 What's here

| File | Purpose |
| --- | --- |
| `app/page.tsx` | The arena screen — RED vs CYAN versus cards, seals/receipts, live + settled sections, and the verify/evidence + "field your own duelist" panel. `force-dynamic`. |
| `app/layout.tsx` | Root layout, metadata, topbar (network `eip155:1776`) and background mesh/scan-line chrome. |
| `app/globals.css` | All styling for the arena (panels, seals, pills, evidence table). |
| `lib/arena.ts` | `getArena()` data loader + `DuelView`/`SlotView` types mirroring `GET /api/duels`; picks live API or snapshot. |
| `lib/arena-snapshot.json` | Committed offline fallback so the page renders with no API running. |
| `public/icon.svg` | Arena mark used in the topbar + favicon. |

## 🖥️ Screens

| Route | Shows |
| --- | --- |
| `/` | The full arena: hero, **⚔ Live duels** (open/locked versus cards), **🏆 Settled** (results + payouts), and **Verify & field your own** — the v1 trust model, a reproducible evidence table for a settled duel, and the duelist quickstart. A `data: api\|snapshot` pill flags the source. |

## 🚀 Run it

From the repo root (proxies into `web/`):

```bash
npm run web:dev     # arena page on http://localhost:3403 (Next dev)
npm run web:build   # production build
npm run web:start   # serve the production build on :3403
```

## ⚙️ Environment

- `AGENTDUEL_API_URL` — base URL of the arena API (e.g. `http://localhost:8403`). If set **and** reachable, the page fetches `GET /api/duels` live (`source: 'api'`); otherwise it renders the committed snapshot (`source: 'snapshot'`).

No other env vars are read by the web component; no keys are needed to render.

## 🧪 Notes

- Server-only data loading (`lib/arena.ts` imports `server-only`, `cache: 'no-store'`) — no secrets reach the client.
- **Snapshot fallback:** with no `AGENTDUEL_API_URL` (or an unreachable API) the page renders `lib/arena-snapshot.json`, so the arena is always demonstrable offline. The source pill makes live-vs-snapshot explicit.
- Honesty labels carry through from the API: entries flagged `is_placeholder` render a `rehearsal` tag, and `is_mock` payouts render a `MOCK` chip — never presented as real on-chain transfers.
- E2E coverage lives at the repo root (`npm run e2e`: `e2e/arena.spec.ts`, `demo-mode.spec.ts`, `responsive.spec.ts`).
