// Enrich players with Wikidata facts, batched 50 titles at a time.
//
// Source:  https://www.wikidata.org  (CC0)
// Output:  data/raw/wikidata.json
//
// We take three things:
//   * sitelinks  — how many Wikipedia language editions carry an article about this player.
//                  This is the single best openly available proxy for a footballer's stature,
//                  and it is what the rating model leans on where no match data exists.
//   * P569       — date of birth
//   * P27        — country of citizenship (nationality)
//   * P413       — position played on team
import { fetchWikidataByTitles, fetchWikidataLabels, readRaw, writeRaw, log } from './lib/wiki.mjs';

const POSITION_LABELS = {
  Q201330: 'GK', // goalkeeper
  Q336286: 'DF', // defender
  Q2005685: 'CB', // centre-back
  Q3341296: 'RB', // right-back
  Q3341297: 'LB', // left-back
  Q1339139: 'MF', // midfielder
  Q2262892: 'DM', // defensive midfielder
  Q5031802: 'CM', // central midfielder
  Q2739397: 'AM', // attacking midfielder
  Q17505824: 'RM',
  Q17505825: 'LM',
  Q13218361: 'FW', // forward
  Q17507140: 'ST', // striker
  Q21057452: 'RW',
  Q21057453: 'LW',
  Q380494: 'FW', // centre-forward
  Q1334322: 'MF', // wing half
};

function claimValue(entity, prop) {
  const claims = entity?.claims?.[prop];
  if (!claims || !claims.length) return null;
  const main = claims[0]?.mainsnak?.datavalue?.value;
  if (!main) return null;
  return main;
}

function allClaimIds(entity, prop) {
  const claims = entity?.claims?.[prop] || [];
  return claims.map((c) => c?.mainsnak?.datavalue?.value?.id).filter(Boolean);
}

async function labelsFor(ids) {
  // Nationality claims are Q-ids; resolve them to readable country names in batches, through
  // the shared throttled queue so Wikimedia's rate limiter does not silently drop most of them.
  const out = {};
  const unique = [...new Set(ids)];
  for (let i = 0; i < unique.length; i += 50) {
    const entities = await fetchWikidataLabels(unique.slice(i, i + 50));
    if (!entities) continue;
    for (const [id, ent] of Object.entries(entities)) {
      if (ent?.labels?.en?.value) out[id] = ent.labels.en.value;
    }
  }
  return out;
}

function collectTitles() {
  const titles = new Set();
  const tournaments = readRaw('tournaments.json');
  if (tournaments) {
    for (const t of tournaments.tournaments) {
      for (const squad of t.teams) {
        for (const p of squad.players) if (p.wikiTitle) titles.add(p.wikiTitle);
      }
    }
  }
  const clubs = readRaw('clubs.json');
  if (clubs) {
    for (const group of [clubs.current || [], clubs.historical || []]) {
      for (const squad of group) {
        for (const p of squad.players) if (p.wikiTitle) titles.add(p.wikiTitle);
      }
    }
  }
  return [...titles];
}

async function main() {
  const titles = collectTitles();
  log(`Enriching ${titles.length} distinct players from Wikidata...`);
  const existing = readRaw('wikidata.json') || { players: {} };
  const known = existing.players || {};
  const todo = titles.filter((t) => !known[t]);
  log(`  ${titles.length - todo.length} already cached, ${todo.length} to fetch.`);

  const nationalityIds = new Set();
  for (const rec of Object.values(known)) {
    for (const id of rec?.nationalityIds || []) nationalityIds.add(id);
  }
  let done = 0;

  for (let i = 0; i < todo.length; i += 50) {
    const chunk = todo.slice(i, i + 50);
    const entities = await fetchWikidataByTitles(chunk);
    if (!entities) {
      for (const t of chunk) known[t] = { sitelinks: null, missing: true };
      continue;
    }
    // Map returned entities back to the requested titles via their enwiki sitelink.
    const byTitle = new Map();
    for (const entity of Object.values(entities)) {
      const enwiki = entity?.sitelinks?.enwiki?.title;
      if (enwiki) byTitle.set(enwiki, entity);
    }
    for (const title of chunk) {
      const entity = byTitle.get(title) || byTitle.get(title.replace(/_/g, ' '));
      if (!entity) {
        known[title] = { sitelinks: null, missing: true };
        continue;
      }
      const dob = claimValue(entity, 'P569');
      const nats = allClaimIds(entity, 'P27');
      const positions = allClaimIds(entity, 'P413').map((id) => POSITION_LABELS[id]).filter(Boolean);
      nats.forEach((n) => nationalityIds.add(n));
      known[title] = {
        id: entity.id,
        sitelinks: Object.keys(entity.sitelinks || {}).length,
        birthDate: dob?.time ? dob.time.replace(/^\+/, '').slice(0, 10) : null,
        nationalityIds: nats.slice(0, 2),
        positions: [...new Set(positions)].slice(0, 3),
      };
    }
    done += chunk.length;
    if (done % 1000 < 50) {
      log(`  ...${done}/${todo.length}`);
      writeRaw('wikidata.json', { fetchedAt: new Date().toISOString(), players: known, nationalities: existing.nationalities || {} });
    }
  }

  log('Resolving nationality labels...');
  const nationalities = { ...(existing.nationalities || {}) };
  const unresolved = [...nationalityIds].filter((id) => !nationalities[id]);
  Object.assign(nationalities, await labelsFor(unresolved));

  writeRaw('wikidata.json', {
    fetchedAt: new Date().toISOString(),
    source: 'wikidata.org (CC0)',
    players: known,
    nationalities,
  });
  log(`Done: ${Object.keys(known).length} players enriched, ${Object.keys(nationalities).length} nationalities.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
