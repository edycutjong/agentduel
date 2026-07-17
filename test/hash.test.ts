/** pick_hash binding + canonical determinism + decision_hash. */
import { describe, it, expect } from 'vitest';
import { pickHash, verifyPickHash, canonicalize, decisionHash, sha256Hex } from '../arena/hash';

describe('pick_hash binding', () => {
  it('is deterministic for the same {duelId, side, rationale}', () => {
    const input = { duelId: 'duel-x', side: 'HOME' as const, rationale: 'edge on home' };
    expect(pickHash(input)).toBe(pickHash(input));
  });

  it('changes if the rationale is retro-edited (tamper-evident)', () => {
    const a = pickHash({ duelId: 'duel-x', side: 'HOME', rationale: 'original reasoning' });
    const b = pickHash({ duelId: 'duel-x', side: 'HOME', rationale: 'reasoning edited after the whistle' });
    expect(a).not.toBe(b);
  });

  it('changes if the side flips', () => {
    const home = pickHash({ duelId: 'duel-x', side: 'HOME', rationale: 'r' });
    const away = pickHash({ duelId: 'duel-x', side: 'AWAY', rationale: 'r' });
    expect(home).not.toBe(away);
  });

  it('verifyPickHash re-derives and matches', () => {
    const input = { duelId: 'duel-y', side: 'AWAY' as const, rationale: 'contrarian' };
    const h = pickHash(input);
    const check = verifyPickHash(input, h);
    expect(check.ok).toBe(true);
    expect(check.actual).toBe(h);
  });

  it('verifyPickHash fails a tampered rationale', () => {
    const h = pickHash({ duelId: 'duel-y', side: 'AWAY', rationale: 'real' });
    expect(verifyPickHash({ duelId: 'duel-y', side: 'AWAY', rationale: 'fake' }, h).ok).toBe(false);
  });

  it('canonicalize sorts keys recursively (insertion-order independent)', () => {
    expect(canonicalize({ b: 1, a: { d: 2, c: 3 } })).toBe(canonicalize({ a: { c: 3, d: 2 }, b: 1 }));
  });

  it('decisionHash excludes the decision_hash field itself', () => {
    const base = { duel_id: 'd', winner_side: 'HOME', x: 1 };
    const h1 = decisionHash(base);
    const h2 = decisionHash({ ...base, decision_hash: 'anything' });
    expect(h1).toBe(h2);
    expect(h1).toBe(sha256Hex(canonicalize(base)));
  });
});
