// Club rosters for the four shipped competitions, plus the historical club-seasons
// that give the Album its depth.
//
// `wiki` is the English Wikipedia article title that carries the {{Fs player}} current-squad
// template. `code` is the three letter short code used in tables and scoreboards.

export const PREMIER_LEAGUE_2025_26 = [
  { name: 'Arsenal', code: 'ARS', wiki: 'Arsenal F.C.', city: 'London', fpl: 'Arsenal' },
  { name: 'Aston Villa', code: 'AVL', wiki: 'Aston Villa F.C.', city: 'Birmingham', fpl: 'Aston Villa' },
  { name: 'Bournemouth', code: 'BOU', wiki: 'AFC Bournemouth', city: 'Bournemouth', fpl: 'Bournemouth' },
  { name: 'Brentford', code: 'BRE', wiki: 'Brentford F.C.', city: 'London', fpl: 'Brentford' },
  { name: 'Brighton & Hove Albion', code: 'BHA', wiki: 'Brighton & Hove Albion F.C.', city: 'Brighton', fpl: 'Brighton' },
  { name: 'Burnley', code: 'BUR', wiki: 'Burnley F.C.', city: 'Burnley', fpl: 'Burnley' },
  { name: 'Chelsea', code: 'CHE', wiki: 'Chelsea F.C.', city: 'London', fpl: 'Chelsea' },
  { name: 'Crystal Palace', code: 'CRY', wiki: 'Crystal Palace F.C.', city: 'London', fpl: 'Crystal Palace' },
  { name: 'Everton', code: 'EVE', wiki: 'Everton F.C.', city: 'Liverpool', fpl: 'Everton' },
  { name: 'Fulham', code: 'FUL', wiki: 'Fulham F.C.', city: 'London', fpl: 'Fulham' },
  { name: 'Leeds United', code: 'LEE', wiki: 'Leeds United F.C.', city: 'Leeds', fpl: 'Leeds' },
  { name: 'Liverpool', code: 'LIV', wiki: 'Liverpool F.C.', city: 'Liverpool', fpl: 'Liverpool' },
  { name: 'Manchester City', code: 'MCI', wiki: 'Manchester City F.C.', city: 'Manchester', fpl: 'Man City' },
  { name: 'Manchester United', code: 'MUN', wiki: 'Manchester United F.C.', city: 'Manchester', fpl: 'Man Utd' },
  { name: 'Newcastle United', code: 'NEW', wiki: 'Newcastle United F.C.', city: 'Newcastle', fpl: 'Newcastle' },
  { name: "Nottingham Forest", code: 'NFO', wiki: 'Nottingham Forest F.C.', city: 'Nottingham', fpl: "Nott'm Forest" },
  { name: 'Sunderland', code: 'SUN', wiki: 'Sunderland A.F.C.', city: 'Sunderland', fpl: 'Sunderland' },
  { name: 'Tottenham Hotspur', code: 'TOT', wiki: 'Tottenham Hotspur F.C.', city: 'London', fpl: 'Spurs' },
  { name: 'West Ham United', code: 'WHU', wiki: 'West Ham United F.C.', city: 'London', fpl: 'West Ham' },
  { name: 'Wolverhampton Wanderers', code: 'WOL', wiki: 'Wolverhampton Wanderers F.C.', city: 'Wolverhampton', fpl: 'Wolves' },
];

export const LA_LIGA_2025_26 = [
  { name: 'Deportivo Alavés', code: 'ALA', wiki: 'Deportivo Alavés', city: 'Vitoria-Gasteiz' },
  { name: 'Athletic Club', code: 'ATH', wiki: 'Athletic Bilbao', city: 'Bilbao' },
  { name: 'Atlético Madrid', code: 'ATM', wiki: 'Atlético Madrid', city: 'Madrid' },
  { name: 'FC Barcelona', code: 'BAR', wiki: 'FC Barcelona', city: 'Barcelona' },
  { name: 'Real Betis', code: 'BET', wiki: 'Real Betis', city: 'Seville' },
  { name: 'Celta Vigo', code: 'CEL', wiki: 'RC Celta de Vigo', city: 'Vigo' },
  { name: 'Elche CF', code: 'ELC', wiki: 'Elche CF', city: 'Elche' },
  { name: 'RCD Espanyol', code: 'ESP', wiki: 'RCD Espanyol', city: 'Barcelona' },
  { name: 'Getafe CF', code: 'GET', wiki: 'Getafe CF', city: 'Getafe' },
  { name: 'Girona FC', code: 'GIR', wiki: 'Girona FC', city: 'Girona' },
  { name: 'Levante UD', code: 'LEV', wiki: 'Levante UD', city: 'Valencia' },
  { name: 'RCD Mallorca', code: 'MLL', wiki: 'RCD Mallorca', city: 'Palma' },
  { name: 'CA Osasuna', code: 'OSA', wiki: 'CA Osasuna', city: 'Pamplona' },
  { name: 'Rayo Vallecano', code: 'RAY', wiki: 'Rayo Vallecano', city: 'Madrid' },
  { name: 'Real Madrid', code: 'RMA', wiki: 'Real Madrid CF', city: 'Madrid' },
  { name: 'Real Oviedo', code: 'OVI', wiki: 'Real Oviedo', city: 'Oviedo' },
  { name: 'Real Sociedad', code: 'RSO', wiki: 'Real Sociedad', city: 'San Sebastián' },
  { name: 'Sevilla FC', code: 'SEV', wiki: 'Sevilla FC', city: 'Seville' },
  { name: 'Valencia CF', code: 'VAL', wiki: 'Valencia CF', city: 'Valencia' },
  { name: 'Villarreal CF', code: 'VIL', wiki: 'Villarreal CF', city: 'Villarreal' },
];

// 2025-26 UEFA Champions League league phase. Clubs already covered above are referenced
// by name so their squad is only fetched once.
export const CHAMPIONS_LEAGUE_2025_26 = [
  { name: 'Arsenal', code: 'ARS', wiki: 'Arsenal F.C.', country: 'England' },
  { name: 'Aston Villa', code: 'AVL', wiki: 'Aston Villa F.C.', country: 'England' },
  { name: 'Liverpool', code: 'LIV', wiki: 'Liverpool F.C.', country: 'England' },
  { name: 'Manchester City', code: 'MCI', wiki: 'Manchester City F.C.', country: 'England' },
  { name: 'Newcastle United', code: 'NEW', wiki: 'Newcastle United F.C.', country: 'England' },
  { name: 'Tottenham Hotspur', code: 'TOT', wiki: 'Tottenham Hotspur F.C.', country: 'England' },
  { name: 'FC Barcelona', code: 'BAR', wiki: 'FC Barcelona', country: 'Spain' },
  { name: 'Real Madrid', code: 'RMA', wiki: 'Real Madrid CF', country: 'Spain' },
  { name: 'Atlético Madrid', code: 'ATM', wiki: 'Atlético Madrid', country: 'Spain' },
  { name: 'Athletic Club', code: 'ATH', wiki: 'Athletic Bilbao', country: 'Spain' },
  { name: 'Villarreal CF', code: 'VIL', wiki: 'Villarreal CF', country: 'Spain' },
  { name: 'Bayern Munich', code: 'BAY', wiki: 'FC Bayern Munich', country: 'Germany' },
  { name: 'Bayer Leverkusen', code: 'B04', wiki: 'Bayer 04 Leverkusen', country: 'Germany' },
  { name: 'Borussia Dortmund', code: 'BVB', wiki: 'Borussia Dortmund', country: 'Germany' },
  { name: 'Eintracht Frankfurt', code: 'SGE', wiki: 'Eintracht Frankfurt', country: 'Germany' },
  { name: 'Inter Milan', code: 'INT', wiki: 'Inter Milan', country: 'Italy' },
  { name: 'Juventus', code: 'JUV', wiki: 'Juventus FC', country: 'Italy' },
  { name: 'Atalanta', code: 'ATA', wiki: 'Atalanta BC', country: 'Italy' },
  { name: 'Napoli', code: 'NAP', wiki: 'SSC Napoli', country: 'Italy' },
  { name: 'Paris Saint-Germain', code: 'PSG', wiki: 'Paris Saint-Germain FC', country: 'France' },
  { name: 'Olympique de Marseille', code: 'OM', wiki: 'Olympique de Marseille', country: 'France' },
  { name: 'AS Monaco', code: 'ASM', wiki: 'AS Monaco FC', country: 'France' },
  { name: 'PSV Eindhoven', code: 'PSV', wiki: 'PSV Eindhoven', country: 'Netherlands' },
  { name: 'Ajax', code: 'AJA', wiki: 'AFC Ajax', country: 'Netherlands' },
  { name: 'Sporting CP', code: 'SCP', wiki: 'Sporting CP', country: 'Portugal' },
  { name: 'Benfica', code: 'SLB', wiki: 'S.L. Benfica', country: 'Portugal' },
  { name: 'Club Brugge', code: 'CLB', wiki: 'Club Brugge KV', country: 'Belgium' },
  { name: 'Union Saint-Gilloise', code: 'USG', wiki: 'Royale Union Saint-Gilloise', country: 'Belgium' },
  { name: 'Galatasaray', code: 'GAL', wiki: 'Galatasaray S.K. (football)', country: 'Turkey' },
  { name: 'Olympiacos', code: 'OLY', wiki: 'Olympiacos F.C.', country: 'Greece' },
  { name: 'Slavia Prague', code: 'SLA', wiki: 'SK Slavia Prague', country: 'Czechia' },
  { name: 'FC Copenhagen', code: 'FCK', wiki: 'F.C. Copenhagen', country: 'Denmark' },
  { name: 'Bodø/Glimt', code: 'BOD', wiki: 'FK Bodø/Glimt', country: 'Norway' },
  { name: 'Qarabağ FK', code: 'QAR', wiki: 'Qarabağ FK', country: 'Azerbaijan' },
  { name: 'Kairat Almaty', code: 'KAI', wiki: 'FC Kairat', country: 'Kazakhstan' },
  { name: 'Pafos FC', code: 'PAF', wiki: 'Pafos FC', country: 'Cyprus' },
];

// Extra clubs worth having in the Album / draft pool even outside the shipped competitions.
export const EXTRA_CLUBS = [
  { name: 'AC Milan', code: 'MIL', wiki: 'AC Milan', country: 'Italy' },
  { name: 'AS Roma', code: 'ROM', wiki: 'A.S. Roma', country: 'Italy' },
  { name: 'Lazio', code: 'LAZ', wiki: 'S.S. Lazio', country: 'Italy' },
  { name: 'Fiorentina', code: 'FIO', wiki: 'ACF Fiorentina', country: 'Italy' },
  { name: 'RB Leipzig', code: 'RBL', wiki: 'RB Leipzig', country: 'Germany' },
  { name: 'VfB Stuttgart', code: 'VFB', wiki: 'VfB Stuttgart', country: 'Germany' },
  { name: 'Olympique Lyonnais', code: 'OL', wiki: 'Olympique Lyonnais', country: 'France' },
  { name: 'LOSC Lille', code: 'LIL', wiki: 'Lille OSC', country: 'France' },
  { name: 'OGC Nice', code: 'NIC', wiki: 'OGC Nice', country: 'France' },
  { name: 'RC Lens', code: 'LEN', wiki: 'RC Lens', country: 'France' },
  { name: 'Stade Rennais', code: 'REN', wiki: 'Stade Rennais F.C.', country: 'France' },
  { name: 'FC Porto', code: 'POR', wiki: 'FC Porto', country: 'Portugal' },
  { name: 'Feyenoord', code: 'FEY', wiki: 'Feyenoord', country: 'Netherlands' },
  { name: 'Celtic', code: 'CEL', wiki: 'Celtic F.C.', country: 'Scotland' },
  { name: 'Rangers', code: 'RAN', wiki: 'Rangers F.C.', country: 'Scotland' },
  { name: 'River Plate', code: 'RIV', wiki: 'Club Atlético River Plate', country: 'Argentina' },
  { name: 'Boca Juniors', code: 'BOC', wiki: 'Boca Juniors', country: 'Argentina' },
  { name: 'Flamengo', code: 'FLA', wiki: 'CR Flamengo', country: 'Brazil' },
  { name: 'Palmeiras', code: 'PAL', wiki: 'Sociedade Esportiva Palmeiras', country: 'Brazil' },
  { name: 'Al Hilal', code: 'HIL', wiki: 'Al Hilal SFC', country: 'Saudi Arabia' },
  { name: 'Al Nassr', code: 'NAS', wiki: 'Al Nassr FC', country: 'Saudi Arabia' },
  { name: 'Inter Miami', code: 'MIA', wiki: 'Inter Miami CF', country: 'United States' },
];

// Historical club seasons: Wikipedia season articles that carry a squad list.
// Each entry becomes a browsable Album squad and a draftable historical team.
export const HISTORICAL_CLUB_SEASONS = (() => {
  const out = [];
  const add = (club, code, country, seasons, titlePattern) => {
    for (const s of seasons) out.push({ club, code, country, season: s, wiki: titlePattern(s) });
  };
  const dash = (s) => s.replace('-', '–');
  const seasons = (from, to) => {
    const r = [];
    for (let y = from; y <= to; y++) r.push(`${y}-${String((y + 1) % 100).padStart(2, '0')}`);
    return r;
  };
  add('Real Madrid', 'RMA', 'Spain', seasons(2000, 2025), (s) => `${dash(s)} Real Madrid CF season`);
  add('FC Barcelona', 'BAR', 'Spain', seasons(2000, 2025), (s) => `${dash(s)} FC Barcelona season`);
  add('Manchester United', 'MUN', 'England', seasons(2000, 2025), (s) => `${dash(s)} Manchester United F.C. season`);
  add('Arsenal', 'ARS', 'England', seasons(2000, 2025), (s) => `${dash(s)} Arsenal F.C. season`);
  add('Liverpool', 'LIV', 'England', seasons(2000, 2025), (s) => `${dash(s)} Liverpool F.C. season`);
  add('Chelsea', 'CHE', 'England', seasons(2000, 2025), (s) => `${dash(s)} Chelsea F.C. season`);
  add('Manchester City', 'MCI', 'England', seasons(2004, 2025), (s) => `${dash(s)} Manchester City F.C. season`);
  add('Tottenham Hotspur', 'TOT', 'England', seasons(2008, 2025), (s) => `${dash(s)} Tottenham Hotspur F.C. season`);
  add('Bayern Munich', 'BAY', 'Germany', seasons(2005, 2025), (s) => `${dash(s)} FC Bayern Munich season`);
  add('Borussia Dortmund', 'BVB', 'Germany', seasons(2008, 2025), (s) => `${dash(s)} Borussia Dortmund season`);
  add('Juventus', 'JUV', 'Italy', seasons(2005, 2025), (s) => `${dash(s)} Juventus FC season`);
  add('AC Milan', 'MIL', 'Italy', seasons(2004, 2025), (s) => `${dash(s)} AC Milan season`);
  add('Inter Milan', 'INT', 'Italy', seasons(2005, 2025), (s) => `${dash(s)} Inter Milan season`);
  add('Paris Saint-Germain', 'PSG', 'France', seasons(2010, 2025), (s) => `${dash(s)} Paris Saint-Germain FC season`);
  add('Olympique de Marseille', 'OM', 'France', seasons(2010, 2025), (s) => `${dash(s)} Olympique de Marseille season`);
  add('Olympique Lyonnais', 'OL', 'France', seasons(2010, 2025), (s) => `${dash(s)} Olympique Lyonnais season`);
  add('AS Monaco', 'ASM', 'France', seasons(2012, 2025), (s) => `${dash(s)} AS Monaco FC season`);
  add('LOSC Lille', 'LIL', 'France', seasons(2014, 2025), (s) => `${dash(s)} Lille OSC season`);
  add('Atlético Madrid', 'ATM', 'Spain', seasons(2010, 2025), (s) => `${dash(s)} Atlético Madrid season`);
  add('Sevilla FC', 'SEV', 'Spain', seasons(2012, 2025), (s) => `${dash(s)} Sevilla FC season`);
  add('Valencia CF', 'VAL', 'Spain', seasons(2010, 2025), (s) => `${dash(s)} Valencia CF season`);
  add('Ajax', 'AJA', 'Netherlands', seasons(2014, 2025), (s) => `${dash(s)} AFC Ajax season`);
  add('Benfica', 'SLB', 'Portugal', seasons(2014, 2025), (s) => `${dash(s)} S.L. Benfica season`);
  add('FC Porto', 'POR', 'Portugal', seasons(2014, 2025), (s) => `${dash(s)} FC Porto season`);
  add('Napoli', 'NAP', 'Italy', seasons(2014, 2025), (s) => `${dash(s)} SSC Napoli season`);
  add('Bayer Leverkusen', 'B04', 'Germany', seasons(2015, 2025), (s) => `${dash(s)} Bayer 04 Leverkusen season`);
  add('Newcastle United', 'NEW', 'England', seasons(2015, 2025), (s) => `${dash(s)} Newcastle United F.C. season`);
  add('Aston Villa', 'AVL', 'England', seasons(2015, 2025), (s) => `${dash(s)} Aston Villa F.C. season`);
  add('West Ham United', 'WHU', 'England', seasons(2015, 2025), (s) => `${dash(s)} West Ham United F.C. season`);
  add('Everton', 'EVE', 'England', seasons(2015, 2025), (s) => `${dash(s)} Everton F.C. season`);
  return out;
})();

export function allCurrentClubs() {
  const byWiki = new Map();
  const push = (club, tag) => {
    const key = club.wiki;
    if (!byWiki.has(key)) byWiki.set(key, { ...club, competitions: [] });
    const entry = byWiki.get(key);
    if (!entry.competitions.includes(tag)) entry.competitions.push(tag);
    if (club.fpl) entry.fpl = club.fpl;
    if (club.country && !entry.country) entry.country = club.country;
    if (club.city && !entry.city) entry.city = club.city;
  };
  PREMIER_LEAGUE_2025_26.forEach((c) => push({ ...c, country: 'England' }, 'premier-league'));
  LA_LIGA_2025_26.forEach((c) => push({ ...c, country: 'Spain' }, 'la-liga'));
  CHAMPIONS_LEAGUE_2025_26.forEach((c) => push(c, 'champions-league'));
  EXTRA_CLUBS.forEach((c) => push(c, 'album'));
  return [...byWiki.values()];
}
