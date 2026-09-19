import type { Metadata, Viewport } from 'next';
import { Archivo_Black, Inter } from 'next/font/google';
import './globals.css';
import { Nav } from './nav';

// Heavy grotesk for scores, team names and headlines; a clean sans for everything you read.
const display = Archivo_Black({ weight: '400', subsets: ['latin'], variable: '--font-display' });
const body = Inter({ subsets: ['latin'], variable: '--font-body', display: 'swap' });

export const metadata: Metadata = {
  title: 'EL NIP GAME — Draft a team. Beat your friends.',
  description:
    'Create a private competition, invite up to 16 friends, draft your starting XI from real squads, and play a full season with minute-by-minute simulation.',
};

export const viewport: Viewport = {
  themeColor: '#0a0a0a',
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${display.variable} ${body.variable}`}>
      <body>
        <div className="shell">
          <Nav />
          {children}
        </div>
      </body>
    </html>
  );
}
