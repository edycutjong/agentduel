/**
 * football-data.org client — FIFA World Cup 2026 fixtures + results (free tier).
 *
 * This is the arena's REFEREE for BOTH clocks:
 *   - entry clock  : a duel's `kickoff_utc` (utcDate) rejects post-kickoff entries.
 *   - result clock : a finished match's `score` settles the money.
 *
 * Free tier: 10 req/min, header `X-Auth-Token`. We cache to fixtures/wc-matches.json
 * and fall back to that snapshot offline, so results resolve deterministically in
 * tests/CI and the settlement worker degrades gracefully when the API is slow at
 * the final whistle (documented ~5-min lag; the worker retries).
 *
 * ToS: any UI showing this data must display
 * "Football data provided by the Football-Data.org API".
 */
import fs from 'node:fs';
import { FOOTBALL_DATA, FOOTBALL_DATA_KEY, PATHS } from '../config';
import type { ResultInput } from '../arena/core';
import { outcomeFromScore } from '../arena/core';

export interface FdMatch {
  id: number;
  utcDate: string;
  status: string; // SCHEDULED | TIMED | IN_PLAY | PAUSED | FINISHED
  stage: string; // GROUP_STAGE | LAST_16 | QUARTER_FINALS | SEMI_FINALS | FINAL | THIRD_PLACE
  homeTeam: { name: string; shortName?: string; tla?: string };
  awayTeam: { name: string; shortName?: string; tla?: string };
  score: {
    winner: string | null; // HOME_TEAM | AWAY_TEAM | DRAW | null
    duration?: string; // REGULAR | EXTRA_TIME | PENALTY_SHOOTOUT
    fullTime: { home: number | null; away: number | null };
  };
}

function readSnapshot(): FdMatch[] {
  if (!fs.existsSync(PATHS.wcMatches)) return [];
  const cached = JSON.parse(fs.readFileSync(PATHS.wcMatches, 'utf8'));
  return (cached.matches ?? []) as FdMatch[];
}

/** All WC matches — live if a key + force, else the cached snapshot. */
export async function fetchWorldCupMatches(
  opts: { force?: boolean } = {},
): Promise<{ matches: FdMatch[]; source: 'live' | 'cache' }> {
  const snapshot = readSnapshot();
  if (!opts.force || !FOOTBALL_DATA_KEY) {
    if (snapshot.length) return { matches: snapshot, source: 'cache' };
  }
  if (!FOOTBALL_DATA_KEY) throw new Error('FOOTBALL_DATA_KEY not set and no snapshot available');

  const url = `${FOOTBALL_DATA.base}/competitions/${FOOTBALL_DATA.competition}/matches?season=${FOOTBALL_DATA.season}`;
  const res = await fetch(url, { headers: { 'X-Auth-Token': FOOTBALL_DATA_KEY } });
  if (!res.ok) throw new Error(`football-data ${res.status}: ${await res.text()}`);
  const body = (await res.json()) as { matches: FdMatch[] };
  fs.writeFileSync(
    PATHS.wcMatches,
    JSON.stringify({ fetched_at: new Date().toISOString(), matches: body.matches }, null, 2),
  );
  return { matches: body.matches, source: 'live' };
}

export function findMatch(matches: FdMatch[], matchId: number): FdMatch | undefined {
  return matches.find((m) => m.id === matchId);
}

/** Turn a finished match into a settlement result. Returns null if not yet FINISHED. */
export function resultFromMatch(m: FdMatch | undefined): ResultInput | null {
  if (!m) return null;
  if (m.status !== 'FINISHED') return null;
  const outcome = outcomeFromScore(m.score.winner, m.score.fullTime.home, m.score.fullTime.away);
  if (!outcome) return null;
  return {
    match_id: m.id,
    outcome,
    home_score: m.score.fullTime.home ?? 0,
    away_score: m.score.fullTime.away ?? 0,
    result_source: `football-data.org match ${m.id} (${m.score.duration ?? 'REGULAR'})`,
  };
}

/** A ResultProvider bound to the current snapshot/live data — for the settlement worker. */
export async function fetchResult(matchId: number): Promise<ResultInput | null> {
  const { matches } = await fetchWorldCupMatches({ force: !!FOOTBALL_DATA_KEY });
  return resultFromMatch(findMatch(matches, matchId));
}

export function stageLabel(stage: string): string {
  const map: Record<string, string> = {
    GROUP_STAGE: 'GRP', LAST_16: 'R16', QUARTER_FINALS: 'QF',
    SEMI_FINALS: 'SF', FINAL: 'F', THIRD_PLACE: '3P',
  };
  return map[stage] ?? stage;
}

/** Short team token for a fixture label ("SF: FRA vs ESP"). */
export function fixtureLabel(m: FdMatch): string {
  const t = (x: { tla?: string; shortName?: string; name: string }) => x.tla ?? x.shortName ?? x.name;
  return `${stageLabel(m.stage)}: ${t(m.homeTeam)} vs ${t(m.awayTeam)}`;
}
