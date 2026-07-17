/**
 * Seed → settle → /proof integration, against the REAL rehearsal fixture.
 * The proof JSON is the falsifiability claim as one diffable document.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { Server } from 'node:http';
import { openMemoryDb, getDuel, slotsFor } from '../db/ledger';
import { seedArena } from '../db/seed';
import { verifyPickHash } from '../arena/hash';
import { setDb } from '../api/routes';
import { createApp } from '../api/server';

describe('seed + settle integration (rehearsal duel)', () => {
  it('settles the rehearsal from the real FRA 2-0 MAR result, RED (HOME) wins', async () => {
    const db = openMemoryDb();
    const res = await seedArena(db);
    expect(res.open).toBeGreaterThanOrEqual(2);

    const reh = getDuel(db, 'duel-rehearsal-fra-mar')!;
    expect(reh.state).toBe('settled');
    expect(reh.winner_side).toBe('HOME');
    expect(reh.winner_agent).toBe('RED');
    expect(reh.decision_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(reh.payout_tx).toBeTruthy();
  });

  it('both rehearsal slots re-hash correctly and are pre-kickoff', async () => {
    const db = openMemoryDb();
    await seedArena(db);
    const duel = getDuel(db, 'duel-rehearsal-fra-mar')!;
    const slots = slotsFor(db, duel.id);
    expect(slots).toHaveLength(2);
    for (const s of slots) {
      expect(verifyPickHash({ duelId: duel.id, side: s.side, rationale: s.rationale }, s.pick_hash).ok).toBe(true);
      expect(new Date(s.receipt_block_time).getTime()).toBeLessThan(new Date(duel.kickoff_utc).getTime());
      expect(s.is_placeholder).toBe(true); // labeled rehearsal receipts
    }
  });

  it('open seed duels start empty and enterable', async () => {
    const db = openMemoryDb();
    await seedArena(db);
    const sf = getDuel(db, 'duel-sf-fra-esp')!;
    expect(sf.state).toBe('open');
    expect(slotsFor(db, sf.id)).toHaveLength(0);
  });
});

describe('GET /api/duel/:id/proof (HTTP)', () => {
  let server: Server;
  let base: string;

  beforeAll(async () => {
    const db = openMemoryDb();
    await seedArena(db);
    setDb(db); // route handlers use this seeded in-memory db
    const app = createApp({ demo: true });
    await new Promise<void>((resolve) => {
      server = app.listen(0, () => {
        const addr = server.address();
        base = `http://127.0.0.1:${typeof addr === 'object' && addr ? addr.port : 0}`;
        resolve();
      });
    });
  });
  afterAll(() => server?.close());

  it('emits the one-curl evidence JSON with verifying pick hashes + decision hash', async () => {
    const res = await fetch(`${base}/api/duel/duel-rehearsal-fra-mar/proof`);
    expect(res.status).toBe(200);
    const proof = (await res.json()) as any;
    expect(proof.duel_id).toBe('duel-rehearsal-fra-mar');
    expect(proof.entries).toHaveLength(2);
    expect(proof.entries.every((e: any) => e.pick_hash_verifies)).toBe(true);
    expect(proof.entries.every((e: any) => e.pre_kickoff_valid)).toBe(true);
    expect(proof.winner_agent).toBe('RED');
    expect(proof.decision_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(proof.payouts.every((p: any) => p.is_mock)).toBe(true); // labeled mock, honest
    expect(proof.reproduce.replay).toContain('replay');
  });
});
