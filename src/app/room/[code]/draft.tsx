'use client';

import { useEffect, useMemo, useState } from 'react';
import { getFormation } from '@/lib/ui/formations.client';
import type { RoomView } from '@/lib/server/rooms';
import { Pitch, shortName } from './page';
import { Crest, ratingBand } from '@/app/crest';

const STYLES = [
  { id: 'balanced', name: 'BALANCED' },
  { id: 'attacking', name: 'ATTACKING' },
  { id: 'defensive', name: 'DEFENSIVE' },
  { id: 'possession', name: 'POSSESSION' },
  { id: 'counter', name: 'COUNTER' },
  { id: 'high-press', name: 'HIGH PRESS' },
  { id: 'direct', name: 'DIRECT' },
];

export function DraftScreen({
  room,
  act,
}: {
  room: RoomView;
  act: (body: Record<string, unknown>) => Promise<RoomView>;
}) {
  const draft = room.draft!;
  const formation = getFormation(draft.formationId);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [pendingPlayer, setPendingPlayer] = useState<string | null>(null);
  const [spinning, setSpinning] = useState(false);

  const picked = Object.keys(draft.picks).length;
  const total = formation.slots.length;

  // A short spin when a new squad arrives, so the roll feels like a roll.
  useEffect(() => {
    if (!draft.offer) return;
    setSpinning(true);
    const t = setTimeout(() => setSpinning(false), 320);
    return () => clearTimeout(t);
  }, [draft.offer?.squadId]);

  const pitchPicks = useMemo(() => {
    const out: Record<string, { name: string; position: string; overall: number }> = {};
    for (const [slotId, p] of Object.entries(draft.picks)) {
      out[slotId] = { name: p.name, position: p.position, overall: p.overall };
    }
    return out;
  }, [draft.picks]);

  const pending = draft.offer?.players.find((p) => p.playerId === pendingPlayer) ?? null;

  // The server orders each player's eligible slots best-fit first, so the head of that list
  // is where they would go. Group the offer by that, keeper first and attackers last, so the
  // list reads like a team sheet instead of an arbitrary squad dump.
  const slotOrder = new Map(formation.slots.map((slot, i) => [slot.id, i]));
  const slotPosition = new Map(formation.slots.map((slot) => [slot.id, slot.position]));
  const offerPlayers = [...(draft.offer?.players ?? [])].sort((a, b) => {
    const sa = slotOrder.get(a.eligibleSlotIds[0]) ?? 99;
    const sb = slotOrder.get(b.eligibleSlotIds[0]) ?? 99;
    return sa - sb || b.overall - a.overall;
  });

  const run = async (body: Record<string, unknown>) => {
    setBusy(true);
    setError('');
    try {
      await act(body);
      setPendingPlayer(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'That did not work');
    }
    setBusy(false);
  };

  // Tapping a player places them straight away, in the position that fits them best.
  // Requiring a second tap on a small pitch slot was the wrong default: the common case is
  // "put this player where he belongs", not "choose between three spots".
  const choose = (playerId: string, eligible: string[]) => {
    if (!eligible.length) return;
    run({ action: 'pick', playerId, slotId: eligible[0] });
  };

  if (draft.complete) {
    return (
      <main className="stack-lg">
        <section className="stack">
          <div className="label">Draft complete</div>
          <h2>Your XI is in</h2>
        </section>

        <div className="grid-2 wide-left">
          <Pitch formationId={draft.formationId} picks={pitchPicks} />
          <div className="stack">
            <div className="stat-block">
              <div className="label">Formation</div>
              <div className="v">{formation.name}</div>
              <div className="label" style={{ marginTop: 4 }}>{formation.shape}</div>
            </div>
            <div className="stack">
              <div className="label">Playing style</div>
              <div className="chips">
                {STYLES.map((s) => (
                  <button
                    key={s.id}
                    className="chip"
                    data-on={(room.you?.style ?? 'balanced') === s.id}
                    onClick={() => run({ action: 'style', style: s.id })}
                  >
                    {s.name}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        <section className="stack">
          <div className="label">Lobby</div>
          {room.members.map((m) => (
            <div key={m.id} className="member-row">
              <div className="avatar">{m.avatar}</div>
              <div className="grow">
                <div style={{ fontWeight: 900, textTransform: 'uppercase' }}>{m.name}</div>
                <div className="label">{m.complete ? 'Draft complete' : `Drafting ${m.picked}/${m.total}`}</div>
                <div className="progress" style={{ marginTop: 5 }}>
                  <i style={{ width: `${(m.picked / m.total) * 100}%` }} />
                </div>
              </div>
            </div>
          ))}
        </section>

        {error && <div className="banner banner-danger">{error}</div>}

        <div className="sticky-actions">
          {room.you?.isHost ? (
            <button className="btn btn-primary" disabled={busy} onClick={() => run({ action: 'start' })}>
              {busy ? 'Generating season…' : 'Start the competition'}
            </button>
          ) : (
            <div className="banner">Waiting for the host to kick off the season</div>
          )}
        </div>
      </main>
    );
  }

  return (
    <main className="stack">
      <section className="spread">
        <div>
          <div className="label">Your formation</div>
          <h2>{formation.name}</h2>
        </div>
        <div className="center">
          <div className="label">Pick</div>
          <div className="big-number" style={{ fontSize: '2.1rem' }}>
            {picked + 1}
            <span style={{ opacity: 0.45, fontSize: '0.55em' }}>/{total}</span>
          </div>
        </div>
      </section>

      <div className="progress">
        <i style={{ width: `${(picked / total) * 100}%` }} />
      </div>

      {draft.offer ? (
        <>
          <section
            className="squad-header"
            style={{ opacity: spinning ? 0.25 : 1, transition: 'opacity .18s ease' }}
          >
            <Crest name={draft.offer.squadName} code={draft.offer.squadCode} size={52} />
            <div className="grow">
              <div className="label label-ink">
                {draft.offer.kind === 'nation' ? 'National team' : 'Club'} · {draft.offer.season}
              </div>
              <div className="name">{draft.offer.squadName}</div>
            </div>
            <div className="center" style={{ flex: 'none' }}>
              <div className="label label-ink">Squad</div>
              <div className="big-number" style={{ fontSize: '1.9rem' }}>
                {draft.offer.strength}
              </div>
            </div>
          </section>

          {pending && (
            <div className="banner">
              Where should {shortName(pending.name)} play? Tap a highlighted position.
            </div>
          )}

          <div className="grid-2 wide-left">
            <div className="stack">
              <Pitch
                formationId={draft.formationId}
                picks={pitchPicks}
                highlightSlots={pending?.eligibleSlotIds}
                onSlotClick={(slotId) => {
                  if (!pending) return;
                  if (!pending.eligibleSlotIds.includes(slotId)) return;
                  run({ action: 'pick', playerId: pending.playerId, slotId });
                }}
              />
            </div>

            <div className="stack">
              <div className="spread">
                <div className="label">Choose one player</div>
                <button
                  className="btn btn-sm btn-warn"
                  disabled={busy || draft.rerollsLeft <= 0}
                  onClick={() => run({ action: 'reroll' })}
                >
                  Reroll · {draft.rerollsLeft}
                </button>
              </div>
              <div className="player-list scroll-y">
                {offerPlayers.map((p) => {
                  const target = slotPosition.get(p.eligibleSlotIds[0]);
                  const outOfPosition = target && target !== p.position;
                  return (
                    <div key={p.playerId} className="pick-row">
                      <button
                        className="player-card"
                        data-legend={p.legendary}
                        disabled={busy}
                        onClick={() => choose(p.playerId, p.eligibleSlotIds)}
                      >
                        <div className="pos-chip" data-out={outOfPosition || undefined}>
                          {target ?? p.position}
                        </div>
                        <div className="grow">
                          <div className="nm">{p.name}</div>
                          <div className="meta">
                            {p.shirt ? `#${p.shirt} · ` : ''}
                            {p.position}
                            {outOfPosition ? ` → ${target}` : ''}
                            {p.nationality ? ` · ${p.nationality}` : ''}
                          </div>
                        </div>
                        <div className="ovr" data-band={ratingBand(p.overall)}>
                          {p.overall}
                        </div>
                      </button>
                      {p.eligibleSlotIds.length > 1 && (
                        <button
                          className="alt-slots"
                          disabled={busy}
                          title="Choose a different position"
                          onClick={() => setPendingPlayer((c) => (c === p.playerId ? null : p.playerId))}
                        >
                          {pendingPlayer === p.playerId ? '×' : '⇄'}
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </>
      ) : (
        <div className="banner">No squad available — the draft is finishing up.</div>
      )}

      {error && <div className="banner banner-danger">{error}</div>}

      <section className="stack">
        <div className="label">Everyone else</div>
        <div className="grid-3">
          {room.members.map((m) => (
            <div key={m.id} className="stat-block">
              <div className="row">
                <div style={{ fontSize: '1.2rem' }}>{m.avatar}</div>
                <div style={{ fontWeight: 900, textTransform: 'uppercase', fontSize: '0.85rem' }}>{m.name}</div>
              </div>
              <div className="label" style={{ marginTop: 4 }}>
                {m.complete ? 'Complete' : `${m.picked}/${m.total}`}
              </div>
              <div className="progress" style={{ marginTop: 4 }}>
                <i style={{ width: `${(m.picked / m.total) * 100}%` }} />
              </div>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
