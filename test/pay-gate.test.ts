/**
 * The honesty gate: real payouts are funds-gated; the mock is unmistakably fake.
 * (Tests run with AGENTDUEL_ALLOW_PAYOUT unset ⇒ gate closed.)
 */
import { describe, it, expect } from 'vitest';
import { mockPayWinner, realPayWinner, mockTxId, defaultPayWinner } from '../settle/pay';
import { ALLOW_PAYOUT, PLACEHOLDER_TX, isPlaceholderTx } from '../config';

describe('payout honesty gate', () => {
  it('the funds gate is CLOSED under test (no AGENTDUEL_ALLOW_PAYOUT)', () => {
    expect(ALLOW_PAYOUT).toBe(false);
  });

  it('realPayWinner REFUSES when the gate is closed — never fakes a tx', async () => {
    await expect(
      realPayWinner('0xabc', '180000', { duelId: 'd', agent: 'RED', kind: 'payout' }),
    ).rejects.toThrow(/funds gate closed|ALLOW_PAYOUT/);
  });

  it('defaultPayWinner picks the mock (real:false) when the gate is closed', () => {
    const { real } = defaultPayWinner();
    expect(real).toBe(false);
  });

  it('mock tx ids are NOT 0x hashes — cannot be mistaken for a real receipt', async () => {
    const r = await mockPayWinner('0xabc', '180000', { duelId: 'd', agent: 'RED', kind: 'payout' });
    expect(r.mock).toBe(true);
    expect(r.tx.startsWith('mock-tx-')).toBe(true);
    expect(r.tx.startsWith('0x')).toBe(false);
  });

  it('mockTxId is deterministic per (duel, agent, kind, to, units)', () => {
    const a = mockTxId('0xabc', '180000', { duelId: 'd', agent: 'RED', kind: 'payout' });
    const b = mockTxId('0xabc', '180000', { duelId: 'd', agent: 'RED', kind: 'payout' });
    const c = mockTxId('0xabc', '90000', { duelId: 'd', agent: 'RED', kind: 'refund' });
    expect(a).toBe(b);
    expect(a).not.toBe(c);
  });

  it('placeholder tx detection flags all-zero hashes', () => {
    expect(isPlaceholderTx(PLACEHOLDER_TX)).toBe(true);
    expect(isPlaceholderTx('0x0000000000000000000000000000000000000000000000000000000000000001')).toBe(true);
    expect(isPlaceholderTx('0xabc123')).toBe(false);
    expect(isPlaceholderTx(null)).toBe(true);
  });
});
