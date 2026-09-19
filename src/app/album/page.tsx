'use client';
import { useEffect, useState } from 'react';

interface Squad { id: string; teamName: string; teamCode: string; season: string; kind: string; country: string | null; strength: number; competitionName: string; era: string; }
interface Player { id: string; name: string; position: string; overall: number; shirt: number | null; nationality: string | null; }

export default function AlbumPage() {
  const [squads, setSquads] = useState<Squad[]>([]);
  const [total, setTotal] = useState(0);
  const [query, setQuery] = useState('');
  const [competition, setCompetition] = useState('');
  const [facets, setFacets] = useState<{ competitions: { id: string; name: string; squadCount: number }[] } | null>(null);
  const [open, setOpen] = useState<{ squad: Squad; players: Player[] } | null>(null);
  const [manifest, setManifest] = useState<{ counts: { squads: number; players: number } } | null>(null);

  useEffect(() => {
    fetch('/api/album?facets=1').then((r) => r.json()).then((d) => { setFacets(d.facets); setManifest(d.manifest); });
  }, []);

  useEffect(() => {
    const p = new URLSearchParams();
    if (query) p.set('q', query);
    if (competition) p.set('competition', competition);
    const t = setTimeout(() => {
      fetch('/api/album?' + p).then((r) => r.json()).then((d) => { setSquads(d.items || []); setTotal(d.total || 0); });
    }, 180);
    return () => clearTimeout(t);
  }, [query, competition]);

  return (
    <main className="stack">
      <div className="spread">
        <h1 style={{ fontSize: 'clamp(2rem,8vw,3.4rem)' }}>Album</h1>
        {manifest && <div className="label">{manifest.counts.squads} squads · {manifest.counts.players} players</div>}
      </div>

      <input className="input" placeholder="SEARCH SQUADS" value={query} onChange={(e) => setQuery(e.target.value)} />

      <div className="chips">
        <button className="chip" data-on={competition === ''} onClick={() => setCompetition('')}>All</button>
        {facets?.competitions.map((c) => (
          <button key={c.id} className="chip" data-on={competition === c.id} onClick={() => setCompetition(c.id)}>
            {c.name} {c.squadCount}
          </button>
        ))}
      </div>

      <div className="label">{total} squads</div>
      <div className="grid-3">
        {squads.map((s) => (
          <button key={s.id} className="comp-card" onClick={() => {
            fetch('/api/album?squad=' + encodeURIComponent(s.id)).then((r) => r.json()).then(setOpen);
          }}>
            <div className="bar" style={{ background: s.kind === 'nation' ? '#ffd12e' : '#2f7bff' }} />
            <h3 style={{ fontSize: '1rem' }}>{s.teamName}</h3>
            <div className="label" style={{ color: 'inherit', opacity: 0.7 }}>{s.season} · {s.competitionName}</div>
            <div className="big-number" style={{ fontSize: '1.6rem' }}>{s.strength}</div>
          </button>
        ))}
      </div>

      {open && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.65)', zIndex: 50, display: 'grid', placeItems: 'center', padding: 12 }} onClick={() => setOpen(null)}>
          <div className="block" style={{ width: '100%', maxWidth: 560, maxHeight: '88vh', overflowY: 'auto' }} onClick={(e) => e.stopPropagation()}>
            <div className="spread">
              <div>
                <h3>{open.squad.teamName}</h3>
                <div className="label">{open.squad.season} · {open.squad.competitionName}</div>
              </div>
              <button className="btn btn-sm btn-ghost" onClick={() => setOpen(null)}>Close</button>
            </div>
            <div className="player-list" style={{ marginTop: 12 }}>
              {open.players.map((p) => (
                <div key={p.id} className="player-card" style={{ cursor: 'default' }}>
                  <div className="pos-chip">{p.position}</div>
                  <div className="grow">
                    <div className="nm">{p.name}</div>
                    <div className="meta">{p.shirt ? `#${p.shirt} · ` : ''}{p.nationality || ''}</div>
                  </div>
                  <div className="ovr">{p.overall}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
