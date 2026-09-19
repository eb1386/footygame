'use client';

import { use, useCallback, useEffect, useRef, useState } from 'react';
import { AVATARS } from '@/app/avatars';
import { getFormation } from '@/lib/ui/formations.client';
import { DraftScreen } from './draft';
import { SeasonScreen } from './season';
import type { RoomView } from '@/lib/server/rooms';

export default function RoomPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = use(params);
  const roomCode = code.toUpperCase();

  const [room, setRoom] = useState<RoomView | null>(null);
  const [error, setError] = useState('');
  const [needsJoin, setNeedsJoin] = useState(false);
  const [name, setName] = useState('');
  const [avatar, setAvatar] = useState(AVATARS[0]);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const act = useCallback(
    async (body: Record<string, unknown>) => {
      const res = await fetch(`/api/rooms/${roomCode}/action`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setRoom(data.room);
      return data.room as RoomView;
    },
    [roomCode],
  );

  // Initial load: fetch the room, and show the join form when this device has no seat.
  useEffect(() => {
    setName(localStorage.getItem('golazo_name') || '');
    setAvatar(localStorage.getItem('golazo_avatar') || AVATARS[0]);
    fetch(`/api/rooms/${roomCode}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.error) return setError(d.error);
        setRoom(d.room);
        if (!d.room.you) setNeedsJoin(true);
      })
      .catch(() => setError('Could not reach the server'));
  }, [roomCode]);

  // Poll while in the lobby or drafting so everyone sees each other in near real time.
  // Once the competition is running the whole thing is already generated, so we stop.
  useEffect(() => {
    if (!room?.you) return;
    const shouldPoll = room.phase === 'lobby' || room.phase === 'drafting';
    if (pollRef.current) clearInterval(pollRef.current);
    if (!shouldPoll) return;
    pollRef.current = setInterval(() => {
      act({ action: 'heartbeat' }).catch(() => {});
    }, 2000);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [room?.phase, room?.you, act]);

  const join = async () => {
    if (!name.trim()) return setError('Enter your name');
    setBusy(true);
    setError('');
    localStorage.setItem('golazo_name', name);
    localStorage.setItem('golazo_avatar', avatar);
    try {
      await act({ action: 'join', name, avatar });
      setNeedsJoin(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not join');
    }
    setBusy(false);
  };

  const shareUrl = typeof window !== 'undefined' ? `${window.location.origin}/room/${roomCode}` : '';

  const copyInvite = async () => {
    try {
      if (navigator.share) {
        await navigator.share({ title: 'Join my competition', text: `Room code ${roomCode}`, url: shareUrl });
        return;
      }
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      /* user dismissed the share sheet */
    }
  };

  if (error && !room) {
    return (
      <main className="stack">
        <h2>{error}</h2>
        <a className="btn" href="/">
          Back to home
        </a>
      </main>
    );
  }

  if (!room) {
    return (
      <main className="stack">
        <div className="label">Loading room {roomCode}…</div>
      </main>
    );
  }

  // --- Join screen ---------------------------------------------------------
  if (needsJoin || !room.you) {
    return (
      <main className="stack-lg">
        <div className="stack">
          <div className="label">You have been invited to</div>
          <h1 style={{ fontSize: 'clamp(2.2rem, 9vw, 4rem)' }}>
            {room.settings.mode.replace(/-/g, ' ')}
          </h1>
          <div className="block-ink spread">
            <div>
              <div className="label label-ink">Room code</div>
              <div className="big-number" style={{ fontSize: '2.2rem', letterSpacing: '0.2em' }}>
                {room.code}
              </div>
            </div>
            <div className="center">
              <div className="label label-ink">Players</div>
              <div className="big-number" style={{ fontSize: '2.2rem' }}>
                {room.members.length}/{room.settings.maxHumans}
              </div>
            </div>
          </div>
        </div>

        <div className="stack">
          <div className="label">Choose your name</div>
          <input
            className="input"
            value={name}
            maxLength={18}
            placeholder="EVAN"
            onChange={(e) => setName(e.target.value)}
          />
          <div className="chips">
            {AVATARS.map((a) => (
              <button key={a} className="chip" data-on={avatar === a} onClick={() => setAvatar(a)}>
                {a}
              </button>
            ))}
          </div>
        </div>

        {error && <div className="banner banner-danger">{error}</div>}
        <button className="btn btn-primary" disabled={busy} onClick={join}>
          {busy ? 'Joining…' : 'Join competition'}
        </button>
      </main>
    );
  }

  // --- Drafting ------------------------------------------------------------
  if (room.phase === 'drafting' && room.draft) {
    return <DraftScreen room={room} act={act} />;
  }

  // --- Running / complete --------------------------------------------------
  if ((room.phase === 'running' || room.phase === 'complete') && room.competition) {
    return <SeasonScreen room={room} act={act} />;
  }

  // --- Lobby ---------------------------------------------------------------
  const isHost = room.you.isHost;
  return (
    <main className="stack-lg">
      <section className="stack">
        <div className="label">Private competition</div>
        <h1 style={{ fontSize: 'clamp(2.2rem, 9vw, 4.2rem)' }}>
          {room.settings.mode.replace(/-/g, ' ')}
        </h1>
        <div className="block-ink">
          <div className="spread">
            <div>
              <div className="label label-ink">Room code</div>
              <div className="big-number" style={{ fontSize: 'clamp(2.4rem,11vw,3.6rem)', letterSpacing: '0.16em' }}>
                {room.code}
              </div>
            </div>
            <div className="center">
              <div className="label label-ink">Players</div>
              <div className="big-number" style={{ fontSize: 'clamp(2.4rem,11vw,3.6rem)' }}>
                {room.members.length}
                <span style={{ opacity: 0.5, fontSize: '0.5em' }}>/{room.settings.maxHumans}</span>
              </div>
            </div>
          </div>
        </div>
        <button className="btn btn-warn" onClick={copyInvite}>
          {copied ? 'Invite link copied' : 'Copy / share invite'}
        </button>
      </section>

      <section className="stack">
        <div className="label">In the lobby</div>
        {room.members.map((m) => (
          <div key={m.id} className="member-row">
            <div className="avatar">{m.avatar}</div>
            <div className="grow">
              <div style={{ fontWeight: 900, textTransform: 'uppercase' }}>{m.name}</div>
              <div className="label">
                {m.isHost ? 'Host' : 'Player'} · {m.online ? 'Online' : 'Away'}
              </div>
            </div>
            {m.id === room.you?.memberId && <div className="label">You</div>}
          </div>
        ))}
        {room.members.length < room.settings.maxHumans && (
          <div className="member-row" style={{ borderStyle: 'dashed', opacity: 0.6 }}>
            <div className="avatar" style={{ background: 'transparent' }}>
              +
            </div>
            <div className="grow">
              <div style={{ fontWeight: 900, textTransform: 'uppercase' }}>Waiting for friends</div>
              <div className="label">
                Remaining teams are played by AI
              </div>
            </div>
          </div>
        )}
      </section>

      <section className="stack">
        <div className="label">Room settings</div>
        <div className="grid-3">
          <div className="stat-block">
            <div className="label">Rerolls</div>
            <div className="v">{room.settings.rerolls}</div>
          </div>
          <div className="stat-block">
            <div className="label">AI difficulty</div>
            <div className="v" style={{ fontSize: '1.1rem', textTransform: 'uppercase' }}>
              {room.settings.aiDifficulty}
            </div>
          </div>
          <div className="stat-block">
            <div className="label">Season</div>
            <div className="v" style={{ fontSize: '1.1rem' }}>{room.settings.seasonLabel}</div>
          </div>
        </div>
      </section>

      {error && <div className="banner banner-danger">{error}</div>}

      <div className="sticky-actions">
        {isHost ? (
          <button
            className="btn btn-primary"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              setError('');
              try {
                await act({ action: 'begin-draft' });
              } catch (e) {
                setError(e instanceof Error ? e.message : 'Could not start');
              }
              setBusy(false);
            }}
          >
            {busy ? 'Starting…' : 'Start draft'}
          </button>
        ) : (
          <div className="banner">Waiting for the host to start the draft</div>
        )}
      </div>
    </main>
  );
}

/** Shared by the draft and squad screens: render an eleven on a pitch. */
export function Pitch({
  formationId,
  picks,
  highlightSlots,
  onSlotClick,
}: {
  formationId: string;
  picks: Record<string, { name: string; position: string; overall: number } | undefined>;
  highlightSlots?: string[];
  onSlotClick?: (slotId: string) => void;
}) {
  const formation = getFormation(formationId);
  return (
    <div className="pitch">
      <div className="markings" />
      <div className="halfway" />
      <div className="circle" />
      <div className="box top" />
      <div className="box bottom" />
      {formation.slots.map((slot) => {
        const player = picks[slot.id];
        const highlighted = highlightSlots?.includes(slot.id);
        return (
          <div
            key={slot.id}
            className="slot"
            style={{ left: `${slot.x}%`, bottom: `${slot.y}%` }}
            onClick={() => onSlotClick?.(slot.id)}
          >
            <div className={`card ${player ? 'filled' : 'empty'} ${highlighted ? 'target' : ''}`}>
              <div className="pos">{slot.position}</div>
              {player ? (
                <>
                  <div className="nm">{shortName(player.name)}</div>
                  <div className="ovr">{player.overall}</div>
                </>
              ) : (
                <div className="nm" style={{ opacity: 0.85 }}>
                  —
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function shortName(name: string): string {
  const parts = name.split(' ').filter(Boolean);
  if (parts.length === 1) return parts[0];
  const last = parts[parts.length - 1];
  return last.length > 12 ? last.slice(0, 12) : last;
}
