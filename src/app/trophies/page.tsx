'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';

export default function TrophiesPage() {
  const [rooms, setRooms] = useState<{ code: string; phase: string; mode: string; champion: string | null }[]>([]);
  useEffect(() => {
    fetch('/api/rooms').then((r) => r.json()).then((d) => setRooms((d.rooms || []).filter((r: { phase: string }) => r.phase === 'complete')));
  }, []);
  return (
    <main className="stack-lg">
      <h1 style={{ fontSize: 'clamp(2.2rem,9vw,4rem)' }}>Our trophy room</h1>
      {!rooms.length && <div className="banner">No trophies yet. Finish a competition and it lands here.</div>}
      <div className="stack">
        {rooms.map((r) => (
          <Link key={r.code} className="trophy" href={`/room/${r.code}`} style={{ textDecoration: 'none', display: 'block' }}>
            <div className="label">{r.mode.replace(/-/g, ' ')}</div>
            <h2>{r.champion || 'Champion'}</h2>
          </Link>
        ))}
      </div>
    </main>
  );
}
