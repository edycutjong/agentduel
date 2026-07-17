import { getArena, type DuelView, type SlotView } from '../lib/arena';

export const dynamic = 'force-dynamic';

function short(x: string | null | undefined, head = 10, tail = 6): string {
  if (!x) return '—';
  return x.length > head + tail + 3 ? `${x.slice(0, head)}…${x.slice(-tail)}` : x;
}

function Seal({ slot }: { slot: SlotView | undefined }) {
  if (!slot) {
    return <div className="seal await">◻ awaiting duelist — stake 0.10 USDC to take this side</div>;
  }
  return (
    <div>
      <div className="seal">
        <span className="stamp">COMMITTED</span>
        <span>T {slot.pre_kickoff.human} before kickoff</span>
        {slot.is_placeholder ? <span className="tag-ph">rehearsal</span> : null}
      </div>
      <div className="hash" style={{ marginTop: 8 }}>
        receipt{' '}
        {slot.receipt_explorer ? (
          <a href={slot.receipt_explorer} target="_blank" rel="noreferrer">{short(slot.receipt_tx)} ↗</a>
        ) : (
          <span>{short(slot.receipt_tx)}</span>
        )}
      </div>
      <div className="hash">pick# {short(slot.pick_hash)}</div>
    </div>
  );
}

function Panel({ duel, agent }: { duel: DuelView; agent: 'RED' | 'CYAN' }) {
  const slot = duel.slots.find((s) => s.agent === agent);
  const isWin = duel.winner_agent === agent;
  const cls = agent === 'RED' ? 'red' : 'cyan';
  return (
    <div className={`panel ${cls}${isWin ? ' win' : ''}`}>
      <div className={`agent-tag ${cls}`}>{agent === 'RED' ? '🔴 AGENT RED' : '🔵 AGENT CYAN'}</div>
      <div className="side">{slot ? slot.side : '—'}</div>
      <div className="side-label">{slot ? slot.side_label : agent === 'RED' ? duel.home_label : duel.away_label}</div>
      {slot ? <div className="rationale">{slot.rationale}</div> : <div className="rationale" style={{ opacity: 0.6 }}>Strategy: {agent === 'RED' ? "buy LineLock's paid edge, stake the value side" : 'free consensus odds, contrarian by mandate'}.</div>}
      <Seal slot={slot} />
    </div>
  );
}

function VersusCard({ duel }: { duel: DuelView }) {
  const e = duel.economics;
  const win = duel.payouts.find((p) => p.kind === 'payout');
  return (
    <div className="duel">
      <div className="head">
        <div>
          <span className="fixture">{duel.fixture}</span>
          <span className="stage">{duel.stage}</span>
        </div>
        <span className={`state ${duel.state}`}>{duel.state}</span>
      </div>
      <div className="ribbon">
        <span className="kick">⏱ kickoff {duel.kickoff_utc}</span>
        <span className="rule">purse {e.payout_usdc} USDC · fee {e.fee_usdc} · draw ⇒ refund {e.refund_usdc} each</span>
      </div>
      <div className="arena">
        <Panel duel={duel} agent="RED" />
        <div className="vs-col"><span className="vs">VS</span></div>
        <Panel duel={duel} agent="CYAN" />
      </div>
      <div className="result">
        <div>
          {duel.result ? (
            <span className="score">{duel.result.home_score}–{duel.result.away_score}</span>
          ) : (
            <span className="purse">stakes in: <span className="amt">{(e.stake_usdc * (duel.slots.length)).toFixed(2)}</span> / {(e.stake_usdc * 2).toFixed(2)} USDC</span>
          )}
          {duel.winner_agent ? <span className="purse" style={{ marginLeft: 12 }}>winner <b>{duel.winner_agent}</b> ({duel.winner_side})</span> : null}
          {duel.state === 'void' ? <span className="purse" style={{ marginLeft: 12 }}>VOID — refunded</span> : null}
        </div>
        {win ? (
          <div className="payout-chip">
            transfer_send {win.usdc} USDC → {win.agent}
            {win.is_mock ? <span className="tag-mock">MOCK</span> : win.explorer ? <> · <a href={win.explorer} target="_blank" rel="noreferrer" style={{ color: 'var(--cyan)', textDecoration: 'none' }}>↗</a></> : null}
            {duel.decision_hash ? <div className="hash" style={{ marginTop: 6 }}>decision# {short(duel.decision_hash)}</div> : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}

export default async function Arena() {
  const { data, source } = await getArena();
  const rehearsal = data.settled[0];

  return (
    <>
      <div className="pill-row" style={{ marginTop: 16 }}>
        <span className="pill gold">Injective x402</span>
        <span className="pill">USDC CCTP</span>
        <span className="pill">MCP Server</span>
        <span className="pill">Agent Skills</span>
        <span className="pill">World Cup data</span>
        <span className="pill">data: {source}</span>
      </div>

      <section className="hero">
        <h1>Two agents. One match. <span className="g">The winner gets paid on-chain.</span></h1>
        <p>
          Two AIs watch the same World Cup fixture, disagree, and each stakes 0.10 USDC on the opposite
          side over Injective x402 — the entry receipt is the pre-kickoff commitment. Reality settles it:
          the winner is paid 0.18 USDC by the settlement worker; a draw refunds 0.09 each. Picks that
          can&apos;t be faked, because money actually moves.
        </p>
      </section>

      <section className="section">
        <h2>⚔ Live duels</h2>
        {data.open.length === 0 ? <div className="box">No open duels right now.</div> : null}
        {data.open.map((d) => <VersusCard key={d.id} duel={d} />)}
      </section>

      <section className="section">
        <h2>🏆 Settled</h2>
        {data.settled.length === 0 ? <div className="box">No settled duels yet.</div> : null}
        {data.settled.map((d) => <VersusCard key={d.id} duel={d} />)}
      </section>

      {/* /verify — evidence + honesty */}
      <section className="section" id="verify">
        <h2>Verify &amp; field your own</h2>
        <div className="box trust" style={{ marginBottom: 16 }}>
          <h3>Trust model (v1, stated plainly)</h3>
          <p>
            The arena is a <b>transparent operator</b>, not a smart contract: it holds the ~0.20 USDC pot
            between the whistle and payout (minutes). Every leg is on-chain and auditable, and{' '}
            <code>scripts/replay.ts</code> re-derives the exact settlement decision from the ledger + the
            archived result — identical input, identical <code>decision_hash</code>. Contract escrow is
            documented future work. Rows tagged <span className="tag-ph">rehearsal</span> use labeled
            all-zero receipts and <span className="tag-mock">MOCK</span> payouts (no real transfer) — the
            honest dev exhibit until the wallet is funded.
          </p>
        </div>

        {rehearsal ? (
          <div className="box" style={{ marginBottom: 16 }}>
            <h3>Evidence — {rehearsal.fixture}</h3>
            <div style={{ overflowX: 'auto' }}>
              <table className="evtable">
                <thead>
                  <tr><th>agent</th><th>side</th><th>pick_hash</th><th>receipt</th><th>pre-kickoff</th><th>P&amp;L</th></tr>
                </thead>
                <tbody>
                  {rehearsal.slots.map((s) => (
                    <tr key={s.agent}>
                      <td style={{ color: s.agent === 'RED' ? 'var(--red)' : 'var(--cyan)' }}>{s.agent}</td>
                      <td>{s.side}</td>
                      <td>{short(s.pick_hash, 8, 6)}</td>
                      <td>{s.receipt_explorer ? <a href={s.receipt_explorer}>{short(s.receipt_tx, 8, 6)} ↗</a> : short(s.receipt_tx, 8, 6)}</td>
                      <td>{s.pre_kickoff.before_kickoff ? `✓ ${s.pre_kickoff.human}` : '✗ after'}</td>
                      <td>{s.agent === rehearsal.winner_agent ? `+${(rehearsal.economics.payout_usdc - rehearsal.economics.stake_usdc).toFixed(2)}` : `−${rehearsal.economics.stake_usdc.toFixed(2)}`}</td>
                    </tr>
                  ))}
                  <tr>
                    <td colSpan={6}>
                      result <b>{rehearsal.result?.home_score}–{rehearsal.result?.away_score}</b> ({rehearsal.result?.outcome}) ·
                      payout {rehearsal.payouts[0]?.usdc} USDC → {rehearsal.payouts[0]?.agent}
                      {rehearsal.payouts[0]?.is_mock ? <span className="tag-mock">MOCK</span> : null} ·
                      decision# {short(rehearsal.decision_hash, 10, 6)}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p style={{ marginTop: 10 }}>
              Reproduce: <code>npm run replay -- --duel {rehearsal.id} --render</code> · one-curl JSON:{' '}
              <code>GET /api/duel/{rehearsal.id}/proof</code>
            </p>
          </div>
        ) : null}

        <div className="box">
          <h3>Field your own duelist</h3>
          <p>The shipped <code>agent-duel</code> Skill teaches any harness to play: read the duel card → pick a side → pay the x402 entry → poll → report. Beat my model, on the record.</p>
          <pre className="install">{`# install the Skill, then run a duelist against a duel
npm run red   -- --duel duel-sf-fra-esp     # buys LineLock's edge → picks a side
npm run cyan  -- --duel duel-sf-fra-esp     # free consensus odds, contrarian
#  add --pay (funded wallet) to stake the 0.10 USDC entry on-chain`}</pre>
        </div>
      </section>

      <div className="foot">
        {data.attribution} · Injective EVM mainnet (eip155:1776) · USDC 0xa00C…235a · not affiliated with FIFA.
      </div>
    </>
  );
}
