/**
 * AgentDuel API — Express app.
 *
 *   POST /api/duel/enter     gated by injectivePaymentMiddleware (x402, 0.10 USDC)
 *   GET  /api/duel/:id        free — one duel (slots, receipts, score, payout)
 *   GET  /api/duel/:id/proof  free — one-curl falsifiability evidence JSON
 *   GET  /api/duels           free — current + settled
 *   GET  /api/verify          free — quote, USDC, CCTP, reproduce
 *   GET  /health
 *
 * The 402 quote requires NO funds; a real paid entry requires the facilitator
 * wallet gassed (see STATUS.md). `--demo` bypasses the gate so slot logic can be
 * exercised without funds (entries are then LABELED is_placeholder).
 */
import express from 'express';
import type { Request, Response, NextFunction } from 'express';
import { fileURLToPath } from 'node:url';
import { buildPaymentMiddleware } from './middleware';
import {
  enterHandler, duelHandler, duelsHandler, proofHandler, verifyHandler, healthHandler, getDb,
} from './routes';
import { PORT, ACTIVE_NETWORK, HAS_REAL_FACILITATOR_KEY, API_BASE_URL, ALLOW_PAYOUT } from '../config';
import { seedIfEmpty } from '../db/seed';

/** CORS-open the free API so the arena is a public, reusable proof layer. */
function cors(req: Request, res: Response, next: NextFunction): void {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, PAYMENT-SIGNATURE, X-PAYMENT');
  res.setHeader('Access-Control-Expose-Headers', 'PAYMENT-REQUIRED, PAYMENT-RESPONSE, X-PAYMENT-RESPONSE');
  if (req.method === 'OPTIONS') {
    res.sendStatus(204);
    return;
  }
  next();
}

export function createApp(opts: { demo?: boolean } = {}): express.Express {
  const app = express();
  app.disable('x-powered-by');
  app.use(cors);
  app.use(express.json());

  // x402 gate — runs on every request, only protects the routes in the map.
  // In --demo mode we skip the gate so slot logic renders without funds.
  if (!opts.demo) app.use(buildPaymentMiddleware());

  app.post('/api/duel/enter', enterHandler);
  app.get('/api/duel/:id/proof', proofHandler);
  app.get('/api/duel/:id', duelHandler);
  app.get('/api/duels', duelsHandler);
  app.get('/api/verify', verifyHandler);
  app.get('/health', healthHandler);
  app.get('/', (_req, res) =>
    res.json({ service: 'agentduel-api', see: ['/api/duels', '/api/verify', '/health'] }),
  );

  return app;
}

async function main(): Promise<void> {
  const demo = process.argv.includes('--demo');
  const app = createApp({ demo });
  await seedIfEmpty(getDb()); // warm + seed the ledger
  app.listen(PORT, () => {
    console.log(`AgentDuel API on http://localhost:${PORT} (${ACTIVE_NETWORK})`);
    console.log(`  base url: ${API_BASE_URL}`);
    console.log(`  facilitator key loaded: ${HAS_REAL_FACILITATOR_KEY} (real paid entries need gas — see STATUS.md)`);
    console.log(`  payout gate (AGENTDUEL_ALLOW_PAYOUT): ${ALLOW_PAYOUT ? 'OPEN (real transfers armed)' : 'closed (mock settlement)'}`);
    if (demo) console.log('  ⚠️  --demo: x402 gate DISABLED (entries labeled is_placeholder, no payment)');
    console.log(`  try: curl -i -X POST http://localhost:${PORT}/api/duel/enter`);
  });
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
