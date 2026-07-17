/** Slot matching: opposing-sides-only + typed errors + fixture-clock lock. */
import { describe, it, expect } from 'vitest';
import { prepareEntry, shouldLock, isPreKickoff, OTHER_SIDE } from '../arena/core';
import { ArenaError } from '../arena/types';
import type { EntryRequest } from '../arena/types';
import { makeDuel, makeSlot, FUTURE, PAST } from './_helpers';

function entry(over: Partial<EntryRequest> = {}): EntryRequest {
  return {
    duelId: 'duel-test',
    agent: 'RED',
    side: 'HOME',
    rationale: 'model edge on the home side',
    wallet: '0xRED',
    receipt_tx: '0xreceipt',
    receipt_block_time: '2098-12-31T00:00:00Z',
    ...over,
  };
}

describe('slot matching', () => {
  it('accepts the first entrant and binds a pick_hash', () => {
    const duel = makeDuel();
    const slot = prepareEntry(duel, [], entry());
    expect(slot.agent).toBe('RED');
    expect(slot.side).toBe('HOME');
    expect(slot.pick_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(slot.side_label).toBe(duel.home_label);
  });

  it('rejects a same-side second entrant with SIDE_TAKEN', () => {
    const duel = makeDuel();
    const red = makeSlot(duel, 'RED', 'HOME');
    try {
      prepareEntry(duel, [red], entry({ agent: 'CYAN', side: 'HOME' }));
      expect.unreachable('should have thrown');
    } catch (e) {
      expect(e).toBeInstanceOf(ArenaError);
      expect((e as ArenaError).code).toBe('SIDE_TAKEN');
      expect((e as ArenaError).http).toBe(409);
    }
  });

  it('accepts the opposing side as the second entrant', () => {
    const duel = makeDuel();
    const red = makeSlot(duel, 'RED', 'HOME');
    const slot = prepareEntry(duel, [red], entry({ agent: 'CYAN', side: 'AWAY' }));
    expect(slot.side).toBe('AWAY');
    expect(OTHER_SIDE[red.side]).toBe(slot.side);
  });

  it('rejects a third entrant with DUEL_FULL', () => {
    const duel = makeDuel();
    const red = makeSlot(duel, 'RED', 'HOME');
    const cyan = makeSlot(duel, 'CYAN', 'AWAY');
    expect(() => prepareEntry(duel, [red, cyan], entry({ agent: 'RED', side: 'HOME' }))).toThrowError(
      /DUEL_FULL|two duelists/,
    );
  });

  it('rejects the same agent taking both slots with SAME_AGENT', () => {
    const duel = makeDuel();
    const red = makeSlot(duel, 'RED', 'HOME');
    try {
      prepareEntry(duel, [red], entry({ agent: 'RED', side: 'AWAY' }));
      expect.unreachable('should have thrown');
    } catch (e) {
      expect((e as ArenaError).code).toBe('SAME_AGENT');
    }
  });

  it('rejects a post-kickoff entry by the FIXTURE clock, not server time', () => {
    const duel = makeDuel({ kickoff_utc: PAST });
    try {
      prepareEntry(duel, [], entry());
      expect.unreachable('should have thrown');
    } catch (e) {
      expect((e as ArenaError).code).toBe('POST_KICKOFF');
    }
  });

  it('rejects an entry to a non-open duel with DUEL_NOT_OPEN', () => {
    const duel = makeDuel({ state: 'locked' });
    try {
      prepareEntry(duel, [], entry());
      expect.unreachable('should have thrown');
    } catch (e) {
      expect((e as ArenaError).code).toBe('DUEL_NOT_OPEN');
    }
  });

  it('rejects a malformed side with BAD_SIDE (400)', () => {
    const duel = makeDuel();
    try {
      prepareEntry(duel, [], entry({ side: 'DRAW' as any }));
      expect.unreachable('should have thrown');
    } catch (e) {
      expect((e as ArenaError).code).toBe('BAD_SIDE');
      expect((e as ArenaError).http).toBe(400);
    }
  });

  it('isPreKickoff uses the fixture clock', () => {
    expect(isPreKickoff({ kickoff_utc: FUTURE })).toBe(true);
    expect(isPreKickoff({ kickoff_utc: PAST })).toBe(false);
  });

  it('locks the duel once the second slot fills', () => {
    expect(shouldLock(0)).toBe(false); // after 1st entry, 1 slot → still open
    expect(shouldLock(1)).toBe(true); // after 2nd entry, 2 slots → lock
  });
});
