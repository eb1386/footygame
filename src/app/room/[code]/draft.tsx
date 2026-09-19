'use client';

import { useEffect, useState } from 'react';
import { getFormation } from '@/lib/ui/formations.client';
import { Crest, ratingBand } from '@/app/crest';
import type { RoomView } from '@/lib/server/rooms';
import { Pitch } from './page';

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
  const [spinning, setSpinning] = useState(false);

  const picked = Object.keys(draft.picks).length;
  const total = formation.slots.length;

  // A brief flicker when a new squad lands, so the roll reads as a roll.
  useEffect(() => {
    if (!draft.offer) return;
    setSpinning(true);
    const t = setTimeout(() => setSpinning(false), 220);
    return () => clearTimeout(t);
  }, [draft.offer?.squadId]);

  const pitchPicks: Record<string, { name: string; position: string; overall: number }> = {};
  for (const [slotId, p] of Object.entries(draft.picks)) {
    pitchPicks[slotId] = { name: p.name, position: p.position, overall: p.overall };
  }

  const run = async (body: Record<string, unknown>) => {
    setBusy(true);
    setError('');
    try {
      await act(body);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'That did not work');
    }
    setBusy(false);
  };

  const slotPosition = new Map(formation.slots.map((s) => [s.id, s.position]));
  // Best players first. You are picking one name off a list, so the list leads with the one
  // you most want.
  const players = [...(draft.offer?.players ?? [])].sort((a, b) => b.overall - a.overall);

  // --- Finished ------------------------------------------------------------
  if (draft.complete) {
    const waiting = room.members.filter((m) => !m.complete).length;
    return (
      <main className="stack">
        <div className="center stack">
          <div className="label">Your XI is in</div>
          <h2>{formation.name}</h2>
        </div>

        <Pitch formationId={draft.formationId} picks={pitchPicks} />

        <div className="stack">
          {room.members.map((m) => (
            <div key={m.id} className="member-row">
              <div className="avatar">{m.avatar}</div>
              <div className="grow">
                <div className="nm">{m.name}</div>
                <div className="label">{m.complete ? 'Ready' : `Drafting ${m.picked}/11`}</div>
              </div>
            </div>
          ))}
        </div>

        {error && <div className="banner banner-danger">{error}</div>}

        <div className="sticky-actions">
          {room.you?.isHost ? (
            <button className="btn btn-primary" disabled={busy} onClick={() => run({ action: 'start' })}>
              {busy ? 'Building season…' : waiting ? `Play season (${waiting} still drafting)` : 'Play season'}
            </button>
          ) : (
            <div className="banner">Waiting for the host</div>
          )}
        </div>
      </main>
    );
  }

  // --- Drafting ------------------------------------------------------------
  return (
    <main className="stack">
      <div className="draft-top">
        <div>
          <div className="label">Pick</div>
          <div className="big-number" style={{ fontSize: '1.6rem' }}>
            {picked + 1}
            <span style={{ opacity: 0.4 }}>/{total}</span>
          </div>
        </div>
        <div className="center">
          <div className="label">Formation</div>
          <div className="big-number" style={{ fontSize: '1.6rem' }}>{formation.name}</div>
        </div>
        <button
          className="btn btn-sm btn-warn"
          disabled={busy || draft.rerollsLeft <= 0}
          onClick={() => run({ action: 'reroll' })}
        >
          Reroll {draft.rerollsLeft}
        </button>
      </div>

      <div className="progress">
        <i style={{ width: `${(picked / total) * 100}%` }} />
      </div>

      {draft.offer ? (
        <>
          <div
            className="squad-header"
            style={{ opacity: spinning ? 0.2 : 1, transition: 'opacity .15s ease' }}
          >
            <Crest name={draft.offer.squadName} code={draft.offer.squadCode} size={46} />
            <div className="grow">
              <div className="name">{draft.offer.squadName}</div>
              <div className="label label-ink">{draft.offer.season}</div>
            </div>
            <div className="big-number" style={{ fontSize: '1.7rem' }}>
              {draft.offer.strength}
            </div>
          </div>

          <div className="player-list">
            {players.map((p) => {
              const target = slotPosition.get(p.eligibleSlotIds[0]);
              return (
                <button
                  key={p.playerId}
                  className="player-card"
                  data-legend={p.legendary}
                  disabled={busy}
                  onClick={() => run({ action: 'pick', playerId: p.playerId, slotId: p.eligibleSlotIds[0] })}
                >
                  <div className="pos-chip" data-out={target !== p.position || undefined}>
                    {target ?? p.position}
                  </div>
                  <div className="grow">
                    <div className="nm">{p.name}</div>
                    <div className="meta">
                      {p.position}
                      {p.nationality ? ` · ${p.nationality}` : ''}
                    </div>
                  </div>
                  <div className="ovr" data-band={ratingBand(p.overall)}>
                    {p.overall}
                  </div>
                </button>
              );
            })}
          </div>

          <Pitch formationId={draft.formationId} picks={pitchPicks} />
        </>
      ) : (
        <div className="banner">Finishing up…</div>
      )}

      {error && <div className="banner banner-danger">{error}</div>}
    </main>
  );
}
