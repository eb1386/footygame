'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { buildTable } from '@/lib/core/schedule';
import { Crest } from '@/app/crest';
import type { CompetitionEntry, CompetitionState, StoredResult } from '@/lib/core/competition';
import type { RoomView } from '@/lib/server/rooms';
import type { Fixture, StandingRow } from '@/lib/core/types';

/** One second per matchday. A 38-matchday season is over in well under a minute. */
const MATCHDAY_MS = 1000;

/**
 * A team is its owner. Once you are in a room with friends, "EVAN" means far more than
 * "Tottenham Hotspur" — the club is the shirt, the person is the opponent.
 */
function teamLabel(entry: CompetitionEntry): string {
  return entry.ownerName ?? entry.teamName;
}

export function SeasonScreen({
  room,
  act,
}: {
  room: RoomView;
  act: (body: Record<string, unknown>) => Promise<RoomView>;
}) {
  const competition = room.competition!;
  const total = competition.totalMatchdays;

  const [matchday, setMatchday] = useState(() => Math.max(1, room.revealedMatchday || 1));
  const [playing, setPlaying] = useState(room.phase !== 'complete');
  const [openMatch, setOpenMatch] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const myEntry = useMemo(
    () => competition.entries.find((e) => e.ownerId === room.you?.memberId) ?? null,
    [competition.entries, room.you?.memberId],
  );
  const byId = useMemo(() => new Map(competition.entries.map((e) => [e.id, e])), [competition.entries]);

  const dayFixtures = useMemo(
    () => competition.fixtures.filter((f) => f.matchday === matchday),
    [competition.fixtures, matchday],
  );
  const myFixture = dayFixtures.find(
    (f) => myEntry && (f.homeEntryId === myEntry.id || f.awayEntryId === myEntry.id),
  );

  // Tick one matchday per second. The whole season already exists on the server, so this is
  // only revealing it.
  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    if (!playing) return;
    if (matchday >= total) {
      setPlaying(false);
      act({ action: 'reveal', matchday: total }).catch(() => {});
      return;
    }
    timer.current = setTimeout(() => setMatchday((m) => m + 1), MATCHDAY_MS);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [matchday, playing, total, act]);

  useEffect(() => {
    if (matchday % 8 === 0 || matchday === total) act({ action: 'reveal', matchday }).catch(() => {});
  }, [matchday, total, act]);

  const stage = dayFixtures[0]?.stage ?? 'league';
  const isLeagueStage = stage === 'league' || stage === 'league-phase' || stage === 'group';
  const myGroup = myEntry ? competition.groups.find((g) => g.entryIds.includes(myEntry.id)) : null;
  const groupScoped = stage === 'group' && myGroup;

  const table = useMemo(() => {
    const relevant = competition.fixtures.filter(
      (f) =>
        (f.stage === 'league' || f.stage === 'league-phase' || f.stage === 'group') &&
        f.matchday <= matchday &&
        (groupScoped ? f.groupId === myGroup!.id : true),
    );
    const ids = groupScoped ? myGroup!.entryIds : competition.entries.map((e) => e.id);
    const results = relevant
      .map((f) => {
        const r = competition.results[f.id];
        return r
          ? { homeEntryId: f.homeEntryId, awayEntryId: f.awayEntryId, homeScore: r.homeScore, awayScore: r.awayScore }
          : null;
      })
      .filter(Boolean) as { homeEntryId: string; awayEntryId: string; homeScore: number; awayScore: number }[];
    return buildTable(ids, results, { tiebreak: competition.tiebreak });
  }, [competition, matchday, groupScoped, myGroup]);

  const champion = competition.championEntryId ? byId.get(competition.championEntryId) : null;
  const finished = matchday >= total && !playing;

  return (
    <main className="stack">
      <div className="spread">
        <h2>{dayFixtures[0]?.label || `Matchday ${matchday}`}</h2>
        <div className="big-number" style={{ fontSize: '1.5rem' }}>
          {matchday}
          <span style={{ opacity: 0.4 }}>/{total}</span>
        </div>
      </div>

      <div className="progress">
        <i style={{ width: `${(matchday / total) * 100}%` }} />
      </div>

      {/* Your match */}
      {myFixture && myEntry && (
        <MyMatch
          result={competition.results[myFixture.id] ?? null}
          home={byId.get(myFixture.homeEntryId)!}
          away={byId.get(myFixture.awayEntryId)!}
          onOpen={() => setOpenMatch(myFixture.id)}
        />
      )}

      <div className="grid-2 wide-left">
        <section className="stack">
          <div className="label">Results</div>
          <div className="block">
            {dayFixtures
              .filter((f) => f.id !== myFixture?.id)
              .map((f) => {
                const r = competition.results[f.id];
                const home = byId.get(f.homeEntryId)!;
                const away = byId.get(f.awayEntryId)!;
                return (
                  <button key={f.id} className="result-row" onClick={() => setOpenMatch(f.id)}>
                    <span className="side">
                      <Crest name={home.teamName} code={home.teamCode} size={20} colors={home.colors} />
                      <span className="t">{teamLabel(home)}</span>
                    </span>
                    <span className="sc">{r ? `${r.homeScore}-${r.awayScore}` : '–'}</span>
                    <span className="side away">
                      <span className="t">{teamLabel(away)}</span>
                      <Crest name={away.teamName} code={away.teamCode} size={20} colors={away.colors} />
                    </span>
                  </button>
                );
              })}
          </div>
        </section>

        <section className="stack">
          <div className="label">{isLeagueStage ? 'Table' : 'Bracket'}</div>
          <div className="block" style={{ padding: 8 }}>
            {isLeagueStage ? (
              <LeagueTable table={table} byId={byId} myEntryId={myEntry?.id ?? null} />
            ) : (
              <Bracket competition={competition} byId={byId} upToMatchday={matchday} myEntryId={myEntry?.id ?? null} />
            )}
          </div>
        </section>
      </div>

      {finished && champion && (
        <section className="trophy stack">
          <div className="label">Champion</div>
          <h1 style={{ fontSize: 'clamp(2rem,9vw,3.4rem)' }}>{teamLabel(champion)}</h1>
          {champion.ownerName && <div className="label">{champion.teamName}</div>}
        </section>
      )}

      {!finished && (
        <div className="sticky-actions">
          <button
            className="btn"
            onClick={() => {
              setPlaying(false);
              setMatchday(total);
              act({ action: 'reveal', matchday: total }).catch(() => {});
            }}
          >
            Skip to the end
          </button>
        </div>
      )}

      {openMatch && <MatchModal code={room.code} fixtureId={openMatch} onClose={() => setOpenMatch(null)} />}
    </main>
  );
}

function MyMatch({
  result,
  home,
  away,
  onOpen,
}: {
  result: StoredResult | null;
  home: CompetitionEntry;
  away: CompetitionEntry;
  onOpen: () => void;
}) {
  return (
    <button className="my-match" onClick={onOpen}>
      <div className="scoreline">
        <div>
          <Crest name={home.teamName} code={home.teamCode} size={32} colors={home.colors} />
          <div className="team-name">{teamLabel(home)}</div>
        </div>
        <div className="score">
          {result ? `${result.homeScore}–${result.awayScore}` : '–'}
        </div>
        <div style={{ textAlign: 'right' }}>
          <Crest name={away.teamName} code={away.teamCode} size={32} colors={away.colors} />
          <div className="team-name">{teamLabel(away)}</div>
        </div>
      </div>
      {result && result.scorers.length > 0 && (
        <div className="scorers">
          {result.scorers.map((g, i) => (
            <span key={i}>
              {g.minute}' {g.playerName}
            </span>
          ))}
        </div>
      )}
    </button>
  );
}

function LeagueTable({
  table,
  byId,
  myEntryId,
}: {
  table: StandingRow[];
  byId: Map<string, CompetitionEntry>;
  myEntryId: string | null;
}) {
  return (
    <table className="table">
      <thead>
        <tr>
          <th>#</th>
          <th>Team</th>
          <th>P</th>
          <th>GD</th>
          <th>Pts</th>
        </tr>
      </thead>
      <tbody>
        {table.map((row) => {
          const entry = byId.get(row.entryId);
          if (!entry) return null;
          return (
            <tr key={row.entryId} data-you={row.entryId === myEntryId} data-human={!!entry.ownerId}>
              <td className="pos-cell">{row.position}</td>
              <td>
                <span className="team-cell">
                  <Crest name={entry.teamName} code={entry.teamCode} size={20} colors={entry.colors} />
                  <span className="t">{teamLabel(entry)}</span>
                </span>
              </td>
              <td>{row.played}</td>
              <td>{row.goalDifference > 0 ? `+${row.goalDifference}` : row.goalDifference}</td>
              <td className="pts">{row.points}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

/** Knockout rounds, with aggregate scores across two-legged ties. */
function Bracket({
  competition,
  byId,
  upToMatchday,
  myEntryId,
}: {
  competition: CompetitionState;
  byId: Map<string, CompetitionEntry>;
  upToMatchday: number;
  myEntryId: string | null;
}) {
  const stages = competition.stages.filter((s) => s !== 'league' && s !== 'league-phase' && s !== 'group');
  return (
    <div className="stack">
      {stages.map((stage) => {
        const fixtures = competition.fixtures.filter((f) => f.stage === stage);
        if (!fixtures.length) return null;
        const ties = new Map<string, Fixture[]>();
        for (const f of fixtures) {
          const key = f.tieId ?? f.id;
          if (!ties.has(key)) ties.set(key, []);
          ties.get(key)!.push(f);
        }
        return (
          <div key={stage} className="stack" style={{ gap: 3 }}>
            <div className="label">{stage.replace(/-/g, ' ')}</div>
            {[...ties.values()].map((legs) => {
              const first = legs[0];
              const home = byId.get(first.homeEntryId);
              const away = byId.get(first.awayEntryId);
              if (!home || !away) return null;
              const revealed = legs.filter((l) => l.matchday <= upToMatchday);
              let aggHome = 0;
              let aggAway = 0;
              for (const leg of revealed) {
                const r = competition.results[leg.id];
                if (!r) continue;
                if (leg.homeEntryId === first.homeEntryId) {
                  aggHome += r.homeScore;
                  aggAway += r.awayScore;
                } else {
                  aggAway += r.homeScore;
                  aggHome += r.awayScore;
                }
              }
              const played = revealed.length > 0;
              return (
                <div
                  key={first.tieId ?? first.id}
                  className="result-row"
                  data-mine={home.id === myEntryId || away.id === myEntryId}
                >
                  <span className="side">
                    <Crest name={home.teamName} code={home.teamCode} size={20} colors={home.colors} />
                    <span className="t">{teamLabel(home)}</span>
                  </span>
                  <span className="sc">{played ? `${aggHome}-${aggAway}` : '–'}</span>
                  <span className="side away">
                    <span className="t">{teamLabel(away)}</span>
                    <Crest name={away.teamName} code={away.teamCode} size={20} colors={away.colors} />
                  </span>
                </div>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Minute-by-minute viewer
// ---------------------------------------------------------------------------

interface MatchPayload {
  fixture: Fixture;
  home: { name: string; code: string; owner: string | null };
  away: { name: string; code: string; owner: string | null };
  result: {
    homeScore: number;
    awayScore: number;
    duration: number;
    events: { minute: number; type: string; text: string; homeScore: number; awayScore: number }[];
    home: { possession: number; shots: number; xg: number };
    away: { possession: number; shots: number; xg: number };
  };
}

function MatchModal({ code, fixtureId, onClose }: { code: string; fixtureId: string; onClose: () => void }) {
  const [data, setData] = useState<MatchPayload | null>(null);
  const [minute, setMinute] = useState(0);
  const [playing, setPlaying] = useState(true);

  useEffect(() => {
    fetch(`/api/match/${code}/${fixtureId}`)
      .then((r) => r.json())
      .then((d) => {
        if (!d.error) setData(d);
      })
      .catch(() => {});
  }, [code, fixtureId]);

  useEffect(() => {
    if (!data || !playing) return;
    const max = data.result.duration;
    const t = setInterval(() => {
      setMinute((m) => {
        if (m >= max) {
          setPlaying(false);
          return m;
        }
        return m + 1;
      });
    }, 55);
    return () => clearInterval(t);
  }, [data, playing]);

  const shown = data ? data.result.events.filter((e) => e.minute <= minute) : [];
  const last = shown[shown.length - 1];
  const homeName = data ? data.home.owner ?? data.home.name : '';
  const awayName = data ? data.away.owner ?? data.away.name : '';

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        {!data ? (
          <div className="label">Loading…</div>
        ) : (
          <div className="stack">
            <div className="spread">
              <div className="label">{data.fixture.label}</div>
              <button className="btn btn-sm btn-ghost" onClick={onClose}>
                Close
              </button>
            </div>

            <div className="scoreline">
              <div className="team-name" style={{ fontSize: '1rem' }}>{homeName}</div>
              <div className="score">
                {last?.homeScore ?? 0}–{last?.awayScore ?? 0}
              </div>
              <div className="team-name" style={{ fontSize: '1rem', textAlign: 'right' }}>{awayName}</div>
            </div>

            <div className="spread">
              <div className="clock" data-live={minute < data.result.duration}>
                {minute >= data.result.duration ? 'FULL TIME' : `${minute}'`}
              </div>
              <button className="btn btn-sm" onClick={() => setPlaying((p) => !p)}>
                {playing ? 'Pause' : 'Play'}
              </button>
            </div>

            <input
              type="range"
              min={0}
              max={data.result.duration}
              value={minute}
              onChange={(e) => {
                setPlaying(false);
                setMinute(Number(e.target.value));
              }}
            />

            <div className="feed">
              {[...shown].reverse().map((e, i) => (
                <div
                  key={i}
                  className="feed-item"
                  data-type={e.type}
                  data-goal={e.type === 'goal' || e.type === 'penalty-scored'}
                >
                  <div className="min">{e.minute}'</div>
                  <div>
                    <div className="kind">{e.type.replace(/-/g, ' ')}</div>
                    <div className="txt">{e.text}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
