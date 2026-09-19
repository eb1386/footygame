'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';

export default function RoomsPage() {
  const [rooms, setRooms] = useState<{ code: string; phase: string; mode: string; players: number; champion: string | null }[]>([]);
  useEffect(() => {
    fetch('/api/rooms').then((r) => r.json()).then((d) => setRooms(d.rooms || [])).catch(() => {});
  }, []);
  return (
    <main className="stack-lg">
      <h1 style={{ fontSize: 'clamp(2.2rem,9vw,4rem)' }}>Your rooms</h1>
      {!rooms.length && <div className="banner">No rooms yet. Create one from the Play tab.</div>}
      <div className="stack">
        {rooms.map((r) => (
          <Link key={r.code} className="member-row" href={`/room/${r.code}`} style={{ textDecoration: 'none' }}>
            <div className="avatar">{r.phase === 'complete' ? '🏆' : '⚽'}</div>
            <div className="grow">
              <div style={{ fontWeight: 900, textTransform: 'uppercase' }}>{r.mode.replace(/-/g, ' ')}</div>
              <div className="label">{r.code} · {r.players} players · {r.champion ? `Won by ${r.champion}` : r.phase}</div>
            </div>
            <div style={{ fontWeight: 900 }}>→</div>
          </Link>
        ))}
      </div>
    </main>
  );
}
