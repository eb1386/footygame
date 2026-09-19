'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AVATARS } from './avatars';

interface CompetitionOption {
  mode: string;
  name: string;
  tagline: string;
  teamCount: number;
  seasonLabel: string;
  accent: string;
}

interface RoomSummary {
  code: string;
  phase: string;
  mode: string;
  players: number;
  champion: string | null;
}

export default function Home() {
  const router = useRouter();
  const [competitions, setCompetitions] = useState<CompetitionOption[]>([]);
  const [rooms, setRooms] = useState<RoomSummary[]>([]);
  const [storage, setStorage] = useState<string>('');
  const [view, setView] = useState<'home' | 'create' | 'join'>('home');
  const [name, setName] = useState('');
  const [avatar, setAvatar] = useState(AVATARS[0]);
  const [mode, setMode] = useState('premier-league');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    setName(localStorage.getItem('nip_name') || '');
    setAvatar(localStorage.getItem('nip_avatar') || AVATARS[0]);
    fetch('/api/rooms')
      .then((r) => r.json())
      .then((d) => {
        setCompetitions(d.competitions || []);
        setRooms(d.rooms || []);
        setStorage(d.storage || '');
      })
      .catch(() => {});
  }, []);

  const remember = () => {
    localStorage.setItem('nip_name', name);
    localStorage.setItem('nip_avatar', avatar);
  };

  const create = async () => {
    if (!name.trim()) return setError('Enter your name first');
    setBusy(true);
    setError('');
    remember();
    try {
      const res = await fetch('/api/rooms', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name, avatar, mode }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      router.push(`/room/${data.room.code}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not create the room');
      setBusy(false);
    }
  };

  const join = async () => {
    const clean = code.trim().toUpperCase();
    if (clean.length < 4) return setError('Enter the 5-character room code');
    remember();
    router.push(`/room/${clean}`);
  };

  return (
    <main className="stack-lg">
      {view === 'home' && (
        <>
          <section className="stack">
            <div className="hero-title">
              DRAFT
              <br />
              YOUR <em>XI.</em>
              <br />
              BEAT YOUR
              <br />
              FRIENDS.
            </div>
            <div className="block-ink">
              <p className="promise">
                Create a competition. Share the code. Everyone drafts a starting XI from real
                squads, then the whole season plays out matchday by matchday.
              </p>
            </div>
          </section>

          <section className="stack">
            <button className="btn btn-primary" onClick={() => setView('create')}>
              Create game
            </button>
            <button className="btn" onClick={() => setView('join')}>
              Join with code
            </button>
          </section>

          {rooms.length > 0 && (
            <section className="stack">
              <div className="label">Your rooms</div>
              {rooms.map((r) => (
                <button
                  key={r.code}
                  className="member-row"
                  style={{ cursor: 'pointer', textAlign: 'left' }}
                  onClick={() => router.push(`/room/${r.code}`)}
                >
                  <div className="avatar">{r.phase === 'complete' ? '🏆' : '⚽'}</div>
                  <div className="grow">
                    <div className="nm">{r.mode.replace(/-/g, ' ')}</div>
                    <div className="label">
                      {r.code} · {r.players} {r.players === 1 ? 'player' : 'players'} ·{' '}
                      {r.champion ? `Won by ${r.champion}` : r.phase}
                    </div>
                  </div>
                  <div style={{ fontWeight: 900 }}>→</div>
                </button>
              ))}
            </section>
          )}

          {storage === 'memory' && (
            <div className="banner">
              Dev storage: rooms live in memory. Set DATABASE_URL for real multiplayer.
            </div>
          )}
        </>
      )}

      {view === 'create' && (
        <section className="stack-lg">
          <div className="spread">
            <h2>Create game</h2>
            <button className="btn btn-sm btn-ghost" onClick={() => setView('home')}>
              Back
            </button>
          </div>

          <div className="stack">
            <div className="label">1 — Choose competition</div>
            <div className="comp-grid">
              {competitions.map((c) => (
                <button
                  key={c.mode}
                  className="comp-card"
                  data-selected={mode === c.mode}
                  onClick={() => setMode(c.mode)}
                >
                  <div className="bar" style={{ background: c.accent }} />
                  <div className="body">
                    <h3>{c.name}</h3>
                    <div className="label">
                      {c.teamCount} teams · {c.seasonLabel}
                    </div>
                    <div className="tag">{c.tagline}</div>
                  </div>
                </button>
              ))}
            </div>
          </div>

          <div className="stack">
            <div className="label">2 — Your name</div>
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

          <button className="btn btn-primary" disabled={busy} onClick={create}>
            {busy ? 'Creating…' : 'Create room'}
          </button>
        </section>
      )}

      {view === 'join' && (
        <section className="stack-lg">
          <div className="spread">
            <h2>Join game</h2>
            <button className="btn btn-sm btn-ghost" onClick={() => setView('home')}>
              Back
            </button>
          </div>
          <div className="stack">
            <div className="label">Room code</div>
            <input
              className="input code-input"
              value={code}
              maxLength={5}
              autoCapitalize="characters"
              placeholder="K7F4Q"
              onChange={(e) => setCode(e.target.value.toUpperCase())}
            />
          </div>
          <div className="stack">
            <div className="label">Your name</div>
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
          <button className="btn btn-primary" onClick={join}>
            Join
          </button>
        </section>
      )}
    </main>
  );
}
