import { buildMatchContext } from '@/lib/core/competition';
import { simulateMatch } from '@/lib/core/match';
import { resolveTeam } from '@/lib/core/team';
import { dataset } from '@/lib/data/dataset';
import { json, fail, withDevice } from '@/lib/server/respond';
import { getStore } from '@/lib/server/store';

export const dynamic = 'force-dynamic';

/**
 * Regenerate a match's full minute-by-minute timeline from its stored seed.
 * Replays never re-roll anything: the same seed and the same two elevens always give the
 * same match, so this is the stored match, not a new one.
 */
export const GET = withDevice(async (_req, { params }) => {
  const store = await getStore();
  const room = await store.get(String(params.code).toUpperCase());
  if (!room?.competition) return fail('Match not found', 404);

  const competition = room.competition;
  const fixture = competition.fixtures.find((f) => f.id === params.fixtureId);
  if (!fixture) return fail('Fixture not found', 404);

  const home = competition.entries.find((e) => e.id === fixture.homeEntryId);
  const away = competition.entries.find((e) => e.id === fixture.awayEntryId);
  if (!home || !away) return fail('Teams not found', 404);

  const ds = dataset();
  const ctx = buildMatchContext(
    { state: competition, homeAdvantage: competition.homeAdvantage },
    fixture,
    home.teamName,
    away.teamName,
  );
  const result = simulateMatch(
    resolveTeam(home.selection, ds.playersById),
    resolveTeam(away.selection, ds.playersById),
    ctx,
  );

  return json({
    fixture,
    home: { id: home.id, name: home.teamName, code: home.teamCode, colors: home.colors, owner: home.ownerName, avatar: home.avatar },
    away: { id: away.id, name: away.teamName, code: away.teamCode, colors: away.colors, owner: away.ownerName, avatar: away.avatar },
    result,
  });
});
