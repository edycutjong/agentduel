# AgentDuel — convenience targets. Every target wraps a real npm script.
.PHONY: help install dev api web test typecheck ci e2e lighthouse security-scan web-build replay clean

help:
	@echo "AgentDuel — make targets"
	@echo "  make install        Install root dependencies"
	@echo "  make api            Run the arena API on :8403 (self-seeds)"
	@echo "  make web            Run the arena page on :3403"
	@echo "  make test           vitest (52) — arena/settle logic + 402 quote"
	@echo "  make typecheck      tsc --noEmit"
	@echo "  make ci             typecheck + tests (quality gate)"
	@echo "  make e2e            Playwright E2E against web/ (demo/snapshot mode)"
	@echo "  make lighthouse     Lighthouse CI audit (build web/ first)"
	@echo "  make security-scan  npm audit + license check"
	@echo "  make web-build      Production build of web/"
	@echo "  make replay         Reproduce the rehearsal duel (decision_hash check)"

install:
	npm install

dev api:
	npm run api

web:
	npm run web:dev

test:
	npm test

typecheck:
	npm run typecheck

ci:
	npm run ci

e2e:
	@echo "🎭 Running Playwright E2E tests (demo/snapshot mode)..."
	npm run e2e

lighthouse: web-build
	@echo "🔦 Running Lighthouse CI audit..."
	npm run lighthouse

security-scan:
	@echo "=== NPM AUDIT ==="
	npm audit --audit-level=high || true
	@echo ""
	@echo "=== LICENSE CHECK ==="
	npx license-checker --production --failOn "GPL-3.0;AGPL-3.0" --summary || true

web-build:
	npm run web:build

replay:
	npm run replay -- --duel duel-rehearsal-fra-mar --render

clean:
	rm -rf web/.next test-results playwright-report .lighthouseci
