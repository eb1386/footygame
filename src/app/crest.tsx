/**
 * Team marks.
 *
 * Official club crests and national flags are licensed artwork, so the app renders its own:
 * a hard-edged block carrying the team's short code in that team's colours. Every mapping
 * lives here, so dropping in licensed imagery later means changing one component rather than
 * hunting image URLs through the app.
 */

const PALETTE: [string, string][] = [
  ['#e2231a', '#ffffff'],
  ['#0b2c5e', '#ffffff'],
  ['#0a7d33', '#ffffff'],
  ['#f5b301', '#111111'],
  ['#5b21b6', '#ffffff'],
  ['#0d9488', '#ffffff'],
  ['#c2410c', '#ffffff'],
  ['#111827', '#ffd12e'],
  ['#be123c', '#ffffff'],
  ['#1d4ed8', '#ffffff'],
  ['#7c2d12', '#ffffff'],
  ['#065f46', '#ffffff'],
];

/** Stable colour pair for any team name. */
export function teamColors(name: string): { bg: string; fg: string } {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  const [bg, fg] = PALETTE[h % PALETTE.length];
  return { bg, fg };
}

export function shortCode(name: string, fallback?: string | null): string {
  if (fallback && fallback.length <= 4) return fallback.toUpperCase();
  const words = name.replace(/[^A-Za-z\s]/g, ' ').split(/\s+/).filter(Boolean);
  if (words.length === 1) return words[0].slice(0, 3).toUpperCase();
  return words
    .slice(0, 3)
    .map((w) => w[0])
    .join('')
    .toUpperCase();
}

export function Crest({
  name,
  code,
  size = 30,
  colors,
}: {
  name: string;
  code?: string | null;
  size?: number;
  colors?: { primary: string; text: string };
}) {
  const c = colors ? { bg: colors.primary, fg: colors.text } : teamColors(name);
  return (
    <span
      className="crest"
      style={{
        width: size,
        height: size,
        background: c.bg,
        color: c.fg,
        fontSize: Math.max(8, Math.round(size * 0.36)),
      }}
      aria-hidden
    >
      {shortCode(name, code)}
    </span>
  );
}

/** Rating bands, so a number reads as good or bad at a glance. */
export function ratingBand(overall: number): 'elite' | 'great' | 'good' | 'ok' | 'weak' {
  if (overall >= 90) return 'elite';
  if (overall >= 84) return 'great';
  if (overall >= 78) return 'good';
  if (overall >= 70) return 'ok';
  return 'weak';
}
