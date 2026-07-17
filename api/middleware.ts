/**
 * x402 payment middleware — the entry gate. The stake IS the receipt IS the
 * pre-kickoff commitment.
 *
 * Signature pinned from the SHIPPED types
 * (node_modules/@injectivelabs/x402/dist/middleware/index.d.ts):
 *
 *   injectivePaymentMiddleware(routes: RouteMap, options: MiddlewareOptions)
 *
 * `routes` is a MAP keyed "METHOD /path" (NOT the flat {endpoint,network,asset,
 * amount} object sketched in ../ARCHITECTURE.md — that prose is stale; the
 * shipped types win). LineLock's build/api/middleware.ts is the proven twin.
 */
import { injectivePaymentMiddleware } from '@injectivelabs/x402/middleware';
import type { RouteMap, MiddlewareOptions } from '@injectivelabs/x402/middleware';
import type { RequestHandler } from 'express';
import {
  NET, PAYTO_ADDRESS, STAKE_UNITS, FACILITATOR_PK, API_BASE_URL, ACTIVE_NETWORK, usdc,
} from '../config';

export const ENTER_ROUTE_KEY = 'POST /api/duel/enter';

export const ENTER_DESCRIPTION =
  'AgentDuel — stake 0.10 USDC to take one side of a World Cup duel. The x402 ' +
  'receipt is your pre-kickoff commitment: side + pick-hash are bound to the tx, ' +
  'and the winner is paid 0.18 USDC on-chain after the final whistle.';

/** The routes map for x402-gated endpoints. */
export function buildRoutes(): RouteMap {
  return {
    [ENTER_ROUTE_KEY]: {
      description: ENTER_DESCRIPTION,
      mimeType: 'application/json',
      accepts: [
        {
          network: NET.caip2, // eip155:1776 (mainnet) | eip155:1439 (testnet)
          asset: NET.usdc, // native Circle USDC (EIP-3009), 6dp
          amount: STAKE_UNITS, // "100000" = 0.10 USDC — the stake
          payTo: PAYTO_ADDRESS, // arena receiver — address only, decoupled from facilitator
          maxTimeoutSeconds: 120,
        },
      ],
    },
  };
}

/**
 * Build the Express middleware.
 *
 * settlementPolicy "before": verify → settle → run handler, so the entry handler
 * can read req.x402.txHash and bind pick_hash → receipt tx in the SAME ledger
 * row. Emitting the 402 quote needs NO funds; a real paid entry needs the
 * facilitator wallet gassed (see STATUS.md) — until then a paid request returns
 * 402 payment_settlement_failed (honest), never a fake receipt.
 */
export function buildPaymentMiddleware(): RequestHandler {
  const options: MiddlewareOptions = {
    facilitator: { privateKey: FACILITATOR_PK, confirmations: 1 },
    baseUrl: API_BASE_URL,
    settlementPolicy: 'before',
  };
  return injectivePaymentMiddleware(buildRoutes(), options);
}

/** The quote a duelist sees in the 402 (mirrors what send402 emits) — for /verify + docs. */
export function quoteSummary() {
  return {
    route: ENTER_ROUTE_KEY,
    network: NET.caip2,
    network_name: NET.name,
    asset: NET.usdc,
    amount_units: STAKE_UNITS,
    amount_usdc: usdc(STAKE_UNITS),
    payTo: PAYTO_ADDRESS,
    scheme: 'exact',
    asset_transfer_method: 'eip3009',
    active_network: ACTIVE_NETWORK,
    explorer: NET.explorer,
    rpc: NET.rpc,
  };
}
