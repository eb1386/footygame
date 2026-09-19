import type { Metadata, Viewport } from 'next';
import './globals.css';
import { Nav } from './nav';

export const metadata: Metadata = {
  title: 'GOLAZO CLASH — Draft a team. Beat your friends.',
  description:
    'Create a private competition, invite up to 16 friends, draft your starting XI from real squads, and play a full season with minute-by-minute simulation.',
};

export const viewport: Viewport = {
  themeColor: '#f2f0e9',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <div className="shell">
          <Nav />
          {children}
        </div>
      </body>
    </html>
  );
}
