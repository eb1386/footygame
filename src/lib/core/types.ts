/** Shared domain types. Football data and gameplay state are deliberately separate. */

// ---------------------------------------------------------------------------
// Football data (produced by the ingestion pipeline, never written at runtime)
// ---------------------------------------------------------------------------

export type CoarsePosition = 'GK' | 'DF' | 'MF' | 'FW';

export type Position =
  | 'GK'
  | 'RB'
  | 'CB'
  | 'LB'
  | 'DM'
  | 'CM'
  | 'AM'
  | 'RM'
  | 'LM'
  | 'RW'
  | 'LW'
  | 'ST';

export const ALL_POSITIONS: Position[] = ['GK', 'RB', 'CB', 'LB', 'DM', 'CM', 'AM', 'RM', 'LM', 'RW', 'LW', 'ST'];

export type SquadKind = 'club' | 'nation';

/** A player as they existed in one specific squad, in one specific season. */
export interface PlayerSeason {
  /** Stable id: `${squadId}:${playerSlug}` */
  id: string;
  /** Stable identity across seasons, so the same footballer can be tracked through a career. */
  personId: string;
  name: string;
  squadId: string;
  nationality: string | null;
  birthDate: string | null;
  shirt: number | null;
  position: Position;
  secondary: Position[];
  /** 40-99 */
  overall: number;
  attack: number;
  defence: number;
  goalkeeping: number;
  /** Was this player a likely starter in that squad? */
  starter: boolean;
  /** Awarded to the highest-rated, most celebrated player-seasons. */
  legendary: boolean;
}

/** One squad = one team in one season (Arsenal 2025-26, Brazil 1970, ...). */
export interface Squad {
  id: string;
  teamId: string;
  teamName: string;
  teamCode: string;
  kind: SquadKind;
  country: string | null;
  season: string;
  /** e.g. 'premier-league', 'world-cup', 'champions-league' */
  competitionId: string;
  competitionName: string;
  /** Sort key for era browsing. */
  year: number;
  era: Era;
  /** 40-99 squad strength derived from its players. */
  strength: number;
  playerIds: string[];
  source: string;
}

export type Era = 'pre-1970' | '1970s' | '1980s' | '1990s' | '2000s' | '2010s' | 'modern';

export interface Team {
  id: string;
  name: string;
  code: string;
  kind: SquadKind;
  country: string | null;
  /** Which asset key to use for the crest / flag. */
  badge: string;
  colors: { primary: string; secondary: string; text: string };
}

export interface DatasetManifest {
  generatedAt: string;
  counts: { teams: number; squads: number; players: number; competitions: number };
  sources: { name: string; url: string; licence: string; covers: string }[];
}

// ---------------------------------------------------------------------------
// Gameplay
// ---------------------------------------------------------------------------

export type CompetitionMode = 'premier-league' | 'la-liga' | 'champions-league' | 'world-cup';

export type PlayingStyle =
  | 'balanced'
  | 'attacking'
  | 'defensive'
  | 'possession'
  | 'counter'
  | 'high-press'
  | 'direct';

export interface FormationSlot {
  id: string;
  /** Natural position for this slot. */
  position: Position;
  /** Positions that can fill this slot with only a small penalty. */
  alternates: Position[];
  /** Pitch coordinates, 0-100, x = left→right, y = own goal (0) → opposition goal (100). */
  x: number;
  y: number;
  /** Weight of this slot's contribution to each team phase. */
  weights: { attack: number; midfield: number; defence: number };
}

export interface Formation {
  id: string;
  name: string;
  shape: string;
  slots: FormationSlot[];
  modifiers: {
    attack: number;
    midfield: number;
    defence: number;
    width: number;
    counter: number;
  };
  description: string;
}

export interface SquadSelection {
  formationId: string;
  style: PlayingStyle;
  /** slotId → playerSeasonId */
  picks: Record<string, string>;
}

export interface TeamAttributes {
  attack: number;
  midfield: number;
  defence: number;
  goalkeeper: number;
  finishing: number;
  creativity: number;
  possession: number;
  counter: number;
  width: number;
  setPieces: number;
  discipline: number;
  overall: number;
}

// ---------------------------------------------------------------------------
// Match
// ---------------------------------------------------------------------------

export type MatchEventType =
  | 'kickoff'
  | 'chance'
  | 'big-chance'
  | 'shot'
  | 'shot-on-target'
  | 'save'
  | 'goal'
  | 'own-goal'
  | 'offside'
  | 'corner'
  | 'free-kick'
  | 'yellow-card'
  | 'red-card'
  | 'penalty-awarded'
  | 'penalty-scored'
  | 'penalty-missed'
  | 'substitution'
  | 'injury'
  | 'woodwork'
  | 'half-time'
  | 'second-half'
  | 'full-time'
  | 'extra-time'
  | 'extra-time-half'
  | 'extra-time-end'
  | 'shootout-start'
  | 'shootout-kick'
  | 'shootout-end';

export interface MatchEvent {
  /** Match minute the event belongs to (1-120). */
  minute: number;
  /** Fractional offset within the minute so events order naturally. */
  tick: number;
  type: MatchEventType;
  /** 'home' | 'away' | null for neutral events. */
  side: 'home' | 'away' | null;
  playerId?: string;
  playerName?: string;
  assistId?: string;
  assistName?: string;
  /** Score after this event. */
  homeScore: number;
  awayScore: number;
  text: string;
  /** Expected-goals value for shot-like events. */
  xg?: number;
  detail?: string;
}

export interface MatchStats {
  possession: number;
  shots: number;
  shotsOnTarget: number;
  bigChances: number;
  corners: number;
  offsides: number;
  fouls: number;
  yellowCards: number;
  redCards: number;
  xg: number;
  saves: number;
}

export interface ShootoutKick {
  side: 'home' | 'away';
  index: number;
  scored: boolean;
  playerId: string;
  playerName: string;
  homeScore: number;
  awayScore: number;
}

export interface MatchResult {
  seed: string;
  homeScore: number;
  awayScore: number;
  /** Score at 90 minutes, before extra time. */
  regulationHome: number;
  regulationAway: number;
  extraTime: boolean;
  shootout: { home: number; away: number; kicks: ShootoutKick[] } | null;
  /** Final duration in minutes, 90 or 120. */
  duration: number;
  events: MatchEvent[];
  home: MatchStats;
  away: MatchStats;
  /** playerSeasonId → per-match contributions, used for competition leaderboards. */
  playerStats: Record<string, MatchPlayerStats>;
  motm: { playerId: string; playerName: string; side: 'home' | 'away' } | null;
}

export interface MatchPlayerStats {
  goals: number;
  assists: number;
  yellowCards: number;
  redCards: number;
  cleanSheet: boolean;
  penaltiesScored: number;
  rating: number;
  motm: boolean;
}

// ---------------------------------------------------------------------------
// Competition
// ---------------------------------------------------------------------------

export type CompetitionStage =
  | 'league'
  | 'league-phase'
  | 'group'
  | 'playoff'
  | 'round-of-32'
  | 'round-of-16'
  | 'quarter-final'
  | 'semi-final'
  | 'third-place'
  | 'final';

export interface Fixture {
  id: string;
  matchday: number;
  stage: CompetitionStage;
  /** Label shown in the UI, e.g. "Matchday 12" or "Quarter-final, 2nd leg". */
  label: string;
  homeEntryId: string;
  awayEntryId: string;
  /** Two-legged ties link both legs through the same tieId. */
  tieId?: string;
  leg?: 1 | 2;
  neutralVenue: boolean;
  /** Knockout matches must produce a winner. */
  knockout: boolean;
  groupId?: string;
}

export interface StandingRow {
  entryId: string;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDifference: number;
  points: number;
  form: ('W' | 'D' | 'L')[];
  position: number;
  previousPosition: number | null;
}
