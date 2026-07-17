# Deploy

Two automated pipelines ship this repo. Both live in `.github/workflows/`.

## 1. GitHub Pages — landing + pitch (`pages.yml`)

Publishes the `docs/` folder (landing `docs/index.html`, pitch `docs/pitch/index.html`, assets).

**One-time setup:** GitHub → repo **Settings → Pages → Build and deployment → Source = "GitHub Actions"**.

**Triggers:** push to `main` touching `docs/**`, any published Release, or manual (`workflow_dispatch`).

**Live URLs:**
- Landing → https://edycutjong.github.io/agentduel/
- Pitch → https://edycutjong.github.io/agentduel/pitch/

## 2. Railway — x402 API (`railway.yml`)

Builds the `Dockerfile` and deploys the Express API. The server honours `$PORT`
(`config.ts`: `process.env.PORT ?? 8403`), which Railway injects.

**One-time setup:**
1. Create a Railway project + service for this API.
2. Repo **Settings → Secrets and variables → Actions**:
   - **Secret** `RAILWAY_TOKEN` — a Railway **project token** (Project → Settings → Tokens).
   - **Variable** `RAILWAY_SERVICE` — the Railway service name (e.g. `agentduel-api`).
3. Set the app's runtime env vars in Railway (facilitator key, RPC, `AGENTDUEL_ALLOW_PAYOUT`, etc.).

**Triggers:** push to `main` (ignoring `docs/**`, `web/**`, `*.md`), any published Release, or manual.

> The **web/** Next.js arena page is deployed separately (e.g. Vercel) and points at the Railway API URL via env — it is not part of these workflows.

## Existing quality gates
`ci.yml` (typecheck + tests) and `codeql.yml` (security) run on every push/PR — unchanged.
