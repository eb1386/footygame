'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const LINKS = [
  { href: '/', label: 'Play' },
  { href: '/rooms', label: 'Rooms' },
  { href: '/album', label: 'Album' },
  { href: '/trophies', label: 'Trophies' },
];

export function Nav() {
  const path = usePathname();
  return (
    <header className="topbar">
      <Link className="wordmark" href="/">
        <span className="dot" />
        EL NIP GAME
      </Link>
      <nav className="nav">
        {LINKS.map((l) => (
          <Link key={l.href} href={l.href} className={path === l.href ? 'active' : ''}>
            {l.label}
          </Link>
        ))}
      </nav>
    </header>
  );
}
