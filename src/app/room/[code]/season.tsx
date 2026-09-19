'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { buildTable } from '@/lib/core/schedule';
import type { CompetitionEntry, CompetitionState, StoredResult } from '@/lib/core/competition';
import type { RoomView } from '@/lib/server/rooms';
import type { Fixture, StandingRow } from '@/lib/core/types';
import { Crest } from '@/app/crest';

/** How long one matchday takes to reveal, in milliseconds. */
const SPEEDS: Record<string, { normal: number; feature: number }> = {
  live: { normal: 9000, feature: 30000 },
  fast: { normal: 2500, feature: 7000 },
  instant: { normal: 550, feature: 1400 },
  skip: { normal: 60, feature: 60 },
};

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
  const [speed, setSpeed] = useState(room.settings.simulationSpeed || 'fast');
  const [clock, setClock] = useState(0);
  const [openMatch, setOpenMatch] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const myEntry = useMemo(
    () => competition.entries.find((e) => e.ownerId === room.you?.memberId) ?? null,
    [competition.entries, room.you?.memberId],
  );

  const byId = useMemo(
    () => new Map(competition.entries.map((e) => [e.id, e])),
    [competition.entries],
  );

  const fixturesByDay = useMemo(() => {
    const map = new Map<number, Fixture[]>();
    for (const f of competition.fixtures) {
      if (!map.has(f.matchday)) map.set(f.matchday, []);
      map.get(f.matchday)!.push(f);
    }
    return map;
  }, [competition.fixtures]);

  const dayFixtures = fixturesByDay.get(matchday) ?? [];
  const myFixture = dayFixtures.find(
    (f) => myEntry && (f.homeEntryId === myEntry.id || f.awayEntryId === myEntry.id),
  );
  // A matchday where you face another human gets the long treatment.
  const isFeature = !!(
    myFixture &&
    (byId.get(myFixture.homeEntryId)?.ownerId || byId.get(myFixture.awayEntryId)?.ownerId) &&
    byId.get(myFixture.homeEntryId)?.ownerId !== byId.get(myFixture.awayEntryId)?.ownerId
  );

  const duration = SPEEDS[speed]?.[isFeature ? 'feature' : 'normal'] ?? 2500;

  // Drive the matchday clock. The whole competition is already generated, so this is pure
  // presentation — we are revealing a result, never waiting on one.
  useEffect(() => {
    if (timer.current) clearInterval(timer.current);
    setClock(0);
    if (!playing) return;
    const started = Date.now();
    timer.current = setInterval(() => {
      const elapsed = Date.now() - started;
      const pct = Math.min(1, elapsed / duration);
      setClock(pct);
      if (pct >= 1) {
        if (matchday >= total) {
          setPlaying(false);
          act({ action: 'reveal', matchday: total }).catch(() => {});
        } else {
          setMatchday((m) => m + 1);
        }
      }
    }, 60);
    return () => {
      if (timer.current) clearInterval(timer.current);
    };
  }, [matchday, playing, duration, total, act]);

  // Persist progress occasionally so a refresh picks up where you were.
  useEffect(() => {
    if (matchday % 5 === 0 || matchday === total) {
      act({ action: 'reveal', matchday }).catch(() => {});
    }
  }, [matchday, total, act]);

  const minute = Math.min(90, Math.round(clock * 90));
  const stage = dayFixtures[0]?.stage ?? 'league';
  const isLeagueStage = stage === 'league' || stage === 'league-phase' || stage === 'group';

  // Table up to and including the current matchday, but only counting the current match
  // once its clock has run out.
  const includeCurrent = clock >= 1;

  // In a group stage the meaningful table is your own group, not all forty-eight nations.
  const myGroup = useMemo(
    () => (myEntry ? competition.groups.find((g) => g.entryIds.includes(myEntry.id)) ?? null : null),
    [competition.groups, myEntry],
  );
  const groupScoped = stage === 'group' && myGroup;

  const table = useMemo(() => {
    const upTo = includeCurrent ? matchday : matchday - 1;
    const relevant = competition.fixtures.filter(
      (f) =>
        (f.stage === 'league' || f.stage === 'league-phase' || f.stage === 'group') &&
        f.matchday <= upTo &&
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
  }, [competition, matchday, includeCurrent, groupScoped, myGroup]);

  const champion = competition.championEntryId ? byId.get(competition.championEntryId) : null;
  const finished = matchday >= total && clock >= 1;

  return (
    <main className="stack">
      <section className="spread">
        <div>
          <div className="label">{competition.name} · {competition.seasonLabel}</div>
          <h2>{dayFixtures[0]?.label || `Matchday ${matchday}`}</h2>
        </div>
        <div className="center">
          <div className="label">Progress</div>
          <div className="big-number" style={{ fontSize: '1.8rem' }}>
            {matchday}
            <span style={{ opacity: 0.45, fontSize: '0.55em' }}>/{total}</span>
          </div>
        </div>
      </section>

      <div className="tick-bar">
        <i style={{ width: `${clock * 100}%` }} />
      </div>

      <div className="row-wrap">
        <button className="btn btn-sm" onClick={() => setPlaying((p) => !p)}>
          {playing ? 'Pause' : finished ? 'Replay' : 'Play'}
        </button>
        {(['live', 'fast', 'instant', 'skip'] as const).map((s) => (
          <button key={s} className="chip" data-on={speed === s} onClick={() => setSpeed(s)}>
            {s}
          </button>
        ))}
        <button
          className="btn btn-sm btn-ghost"
          onClick={() => {
            setPlaying(false);
            setMatchday(total);
            setClock(1);
            act({ action: 'reveal', matchday: total }).catch(() => {});
          }}
        >
          Jump to end
        </button>
      </div>

      {/* Your match, front and centre */}
      {myFixture && myEntry && (
        <FeaturedMatch
          fixture={myFixture}
          result={competition.results[myFixture.id] ?? null}
          home={byId.get(myFixture.homeEntryId)!}
          away={byId.get(myFixture.awayEntryId)!}
          minute={minute}
          progress={clock}
          myEntryId={myEntry.id}
          onOpen={() => setOpenMatch(myFixture.id)}
        />
      )}

      <div className="grid-2 wide-left">
        <section className="stack">
          <div className="label">Other results</div>
          <div className="block">
            {dayFixtures
              .filter((f) => f.id !== myFixture?.id)
              .map((f) => {
                const r = competition.results[f.id];
                const home = byId.get(f.homeEntryId)!;
                const away = byId.get(f.awayEntryId)!;
                const done = clock >= 1;
                const partial = partialScore(r, clock);
                return (
                  <button
                    key={f.id}
                    className="result-row"
                    data-mine={!!(home.ownerId || away.ownerId)}
                    onClick={() => setOpenMatch(f.id)}
                  >
                    <span className="side">
                      <Crest name={home.teamName} code={home.teamCode} size={22} colors={home.colors} />
                      <span className="t">
                        {home.ownerId ? `${home.avatar} ` : ''}
                        {home.teamName}
                      </span>
                    </span>
                    <span className="sc">{r ? `${partial.home}-${partial.away}` : '–'}</span>
                    <span className="side away">
                      <span className="t">
                        {away.teamName}
                        {away.ownerId ? ` ${away.avatar}` : ''}
                      </span>
                      <Crest name={away.teamName} code={away.teamCode} size={22} colors={away.colors} />
                    </span>
                  </button>
                );
              })}
            {!dayFixtures.length && <div className="label">No fixtures</div>}
          </div>
        </section>

        <section className="stack">
          <div className="label">
            {stage === 'group' ? (myGroup ? groupName(competition, myGroup.id) : 'Group') : isLeagueStage ? 'Table' : 'Bracket'}
          </div>
          <div className="block" style={{ padding: 8 }}>
            {isLeagueStage ? (
              <LeagueTable table={table} byId={byId} myEntryId={myEntry?.id ?? null} />
            ) : (
              <Bracket competition={competition} byId={byId} upToMatchday={includeCurrent ? matchday : matchday - 1} myEntryId={myEntry?.id ?? null} />
            )}
          </div>
        </section>
      </div>

      {finished && champion && (
        <section className="trophy stack">
          <div className="label">Champion</div>
          <h1 style={{ fontSize: 'clamp(2rem,9vw,3.6rem)' }}>{champion.teamName}</h1>
          <div style={{ fontWeight: 900, textTransform: 'uppercase' }}>
            {champion.ownerName ? `${champion.avatar} ${champion.ownerName}` : 'AI'}
          </div>
        </section>
      )}

      {openMatch && (
        <MatchModal
          code={room.code}
          fixtureId={openMatch}
          onClose={() => setOpenMatch(null)}
        />
      )}
    </main>
  );
}

/** Reveal a scoreline gradually across the matchday clock. */
function partialScore(result: StoredResult | null, progress: number) {
  if (!result) return { home: 0, away: 0 };
  if (progress >= 1) return { home: result.homeScore, away: result.awayScore };
  const minute = progress * 92;
  let home = 0;
  let away = 0;
  for (const g of result.scorers) {
    if (g.minute > minute) continue;
    if (g.side === 'home') home++;
    else away++;
  }
  return { home, away };
}

function FeaturedMatch({
  fixture,
  result,
  home,
  away,
  minute,
  progress,
  myEntryId,
  onOpen,
}: {
  fixture: Fixture;
  result: StoredResult | null;
  home: CompetitionEntry;
  away: CompetitionEntry;
  minute: number;
  progress: number;
  myEntryId: string;
  onOpen: () => void;
}) {
  const score = partialScore(result, progress);
  const live = progress < 1;
  const events = (result?.scorers ?? [])
    .filter((g) => g.minute <= progress * 92)
    .slice(-4)
    .reverse();

  return (
    <section className="block-ink stack" style={{ padding: 16 }}>
      <div className="spread">
        <div className="label label-ink">
          {home.ownerId ? 'You' : 'AI'} v {away.ownerName ?? 'AI'} · {fixture.label}
        </div>
        <div className="clock" data-live={live}>
          {live ? `${minute}'` : 'FT'}
        </div>
      </div>

      <div className="scoreline">
        <div>
          <Crest name={home.teamName} code={home.teamCode} size={34} colors={home.colors} />
          <div className="team-name" style={{ fontSize: 'clamp(0.95rem,3.8vw,1.4rem)', marginTop: 6 }}>
            {home.ownerId ? `${home.avatar} ` : ''}
            {home.teamName}
          </div>
          <div className="label label-ink">{home.ownerName ?? 'AI'}</div>
        </div>
        <div className="score">
          {score.home}–{score.away}
        </div>
        <div style={{ textAlign: 'right' }}>
          <Crest name={away.teamName} code={away.teamCode} size={34} colors={away.colors} />
          <div className="team-name" style={{ fontSize: 'clamp(0.95rem,3.8vw,1.4rem)', marginTop: 6 }}>
            {away.teamName}
            {away.ownerId ? ` ${away.avatar}` : ''}
          </div>
          <div className="label label-ink">{away.ownerName ?? 'AI'}</div>
        </div>
      </div>

      {events.length > 0 && (
        <div style={{ display: 'grid', gap: 3 }}>
          {events.map((g, i) => (
            <div key={i} className="row" style={{ fontSize: '0.82rem', fontWeight: 700 }}>
              <span className="mono" style={{ width: 34, fontWeight: 900 }}>
                {g.minute}'
              </span>
              <span>⚽ {g.playerName}</span>
              <span className="label label-ink">{g.side === 'home' ? home.teamCode : away.teamCode}</span>
            </div>
          ))}
        </div>
      )}

      <button className="btn btn-sm btn-warn" onClick={onOpen} style={{ justifySelf: 'start' }}>
        Watch minute by minute
      </button>
    </section>
  );
}

function groupName(competition: CompetitionState, groupId: string): string {
  return competition.groups.find((g) => g.id === groupId)?.name ?? 'Group';
}

/** Every knockout round played so far, with aggregate scores for two-legged ties. */
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
  const knockoutStages = competition.stages.filter(
    (s) => s !== 'league' && s !== 'league-phase' && s !== 'group',
  );

  return (
    <div className="stack">
      {knockoutStages.map((stage) => {
        const fixtures = competition.fixtures.filter((f) => f.stage === stage);
        if (!fixtures.length) return null;
        // Group the legs of each tie together.
        const ties = new Map<string, typeof fixtures>();
        for (const f of fixtures) {
          const key = f.tieId ?? f.id;
          if (!ties.has(key)) ties.set(key, []);
          ties.get(key)!.push(f);
        }
        return (
          <div key={stage} className="stack" style={{ gap: 4 }}>
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
              const played = revealed.length > 0 && revealed.every((l) => competition.results[l.id]);
              const mine = home.id === myEntryId || away.id === myEntryId;
              return (
                <div key={first.tieId ?? first.id} className="result-row" data-mine={mine}>
                  <span className="side">
                    <Crest name={home.teamName} code={home.teamCode} size={22} colors={home.colors} />
                    <span className="t">
                      {home.ownerId ? `${home.avatar} ` : ''}
                      {home.teamName}
                    </span>
                  </span>
                  <span className="sc">{played ? `${aggHome}-${aggAway}` : '–'}</span>
                  <span className="side away">
                    <span className="t">
                      {away.teamName}
                      {away.ownerId ? ` ${away.avatar}` : ''}
                    </span>
                    <Crest name={away.teamName} code={away.teamCode} size={22} colors={away.colors} />
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
          <th className="hide-sm">W</th>
          <th className="hide-sm">D</th>
          <th className="hide-sm">L</th>
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
                  <span className="t">
                    {entry.ownerId ? `${entry.avatar} ` : ''}
                    {entry.teamName}
                  </span>
                </span>
              </td>
              <td>{row.played}</td>
              <td className="hide-sm">{row.won}</td>
              <td className="hide-sm">{row.drawn}</td>
              <td className="hide-sm">{row.lost}</td>
              <td>{row.goalDifference > 0 ? `+${row.goalDifference}` : row.goalDifference}</td>
              <td className="pts">{row.points}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

// ---------------------------------------------------------------------------
// Minute-by-minute viewer
// ---------------------------------------------------------------------------

interface MatchPayload {
  fixture: Fixture;
  home: { name: string; code: string; owner: string | null; avatar: string | null };
  away: { name: string; code: string; owner: string | null; avatar: string | null };
  result: {
    homeScore: number;
    awayScore: number;
    duration: number;
    events: {
      minute: number;
      type: string;
      side: 'home' | 'away' | null;
      text: string;
      homeScore: number;
      awayScore: number;
      playerName?: string;
    }[];
    home: { possession: number; shots: number; shotsOnTarget: number; xg: number };
    away: { possession: number; shots: number; shotsOnTarget: number; xg: number };
    shootout: { home: number; away: number } | null;
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
    }, 60);
    return () => clearInterval(t);
  }, [data, playing]);

  const shown = data ? data.result.events.filter((e) => e.minute <= minute) : [];
  const last = shown[shown.length - 1];
  const homeScore = last?.homeScore ?? 0;
  const awayScore = last?.awayScore ?? 0;

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        {!data ? (
          <div className="label">Loading match…</div>
        ) : (
          <div className="stack">
            <div className="spread">
              <div className="label">{data.fixture.label}</div>
              <button className="btn btn-sm btn-ghost" onClick={onClose}>
                Close
              </button>
            </div>

            <div className="scoreline">
              <div className="row">
                <Crest name={data.home.name} code={data.home.code} size={28} />
                <span className="team-name" style={{ fontSize: 'clamp(.9rem,3.4vw,1.2rem)' }}>
                  {data.home.name}
                </span>
              </div>
              <div className="score">
                {homeScore}–{awayScore}
              </div>
              <div className="row" style={{ justifyContent: 'flex-end' }}>
                <span className="team-name" style={{ fontSize: 'clamp(.9rem,3.4vw,1.2rem)' }}>
                  {data.away.name}
                </span>
                <Crest name={data.away.name} code={data.away.code} size={28} />
              </div>
            </div>

            <div className="spread">
              <div className="clock" data-live={minute < data.result.duration}>
                {minute >= data.result.duration ? 'FULL TIME' : `${minute}'`}
              </div>
              <div className="row">
                <button className="btn btn-sm" onClick={() => setPlaying((p) => !p)}>
                  {playing ? 'Pause' : 'Play'}
                </button>
                <button
                  className="btn btn-sm btn-ghost"
                  onClick={() => {
                    setMinute(0);
                    setPlaying(true);
                  }}
                >
                  Restart
                </button>
              </div>
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
              style={{ width: '100%' }}
            />

            <div className="grid-3">
              <div className="stat-block">
                <div className="label">Possession</div>
                <div className="v" style={{ fontSize: '1.3rem' }}>
                  {data.result.home.possession}–{data.result.away.possession}
                </div>
              </div>
              <div className="stat-block">
                <div className="label">Shots</div>
                <div className="v" style={{ fontSize: '1.3rem' }}>
                  {data.result.home.shots}–{data.result.away.shots}
                </div>
              </div>
              <div className="stat-block">
                <div className="label">xG</div>
                <div className="v" style={{ fontSize: '1.3rem' }}>
                  {data.result.home.xg.toFixed(1)}–{data.result.away.xg.toFixed(1)}
                </div>
              </div>
            </div>

            <div className="feed">
              {[...shown].reverse().map((e, i) => (
                <div
                  key={i}
                  className="feed-item"
                  data-type={e.type}
                  data-goal={e.type === 'goal' || e.type === 'penalty-scored'}
                >
                  <div className="min mono">{e.minute}'</div>
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
