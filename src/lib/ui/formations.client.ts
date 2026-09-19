// The formation table is plain data with no server dependencies, so the client imports it
// directly rather than fetching it.
export { FORMATIONS, FORMATION_BY_ID, getFormation } from '../core/formations';
export type { Formation, FormationSlot } from '../core/types';
