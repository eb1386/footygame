import { albumFacets, browseSquads, dataset, searchPlayers, squadWithPlayers } from '@/lib/data/dataset';
import { json, withDevice } from '@/lib/server/respond';
import type { Era } from '@/lib/core/types';

export const dynamic = 'force-dynamic';

export const GET = withDevice(async (req) => {
  const url = new URL(req.url);
  const squadId = url.searchParams.get('squad');
  if (squadId) {
    const found = squadWithPlayers(squadId);
    return found ? json(found) : json({ error: 'Squad not found' }, { status: 404 });
  }
  const player = url.searchParams.get('player');
  if (player) return json({ players: searchPlayers(player) });

  if (url.searchParams.get('facets')) {
    return json({ facets: albumFacets(), manifest: dataset().manifest });
  }

  const page = browseSquads(
    {
      competitionId: url.searchParams.get('competition') || undefined,
      era: (url.searchParams.get('era') as Era) || undefined,
      country: url.searchParams.get('country') || undefined,
      kind: (url.searchParams.get('kind') as 'club' | 'nation') || undefined,
      year: url.searchParams.get('year') ? Number(url.searchParams.get('year')) : undefined,
      search: url.searchParams.get('q') || undefined,
    },
    60,
    Number(url.searchParams.get('offset') || 0),
  );
  return json(page);
});
