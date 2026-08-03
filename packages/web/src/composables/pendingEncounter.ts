import type { SolvedEncounter } from '@pimpampum/enemies';

/**
 * One-shot hand-off from the encounter creator to the combat view: the
 * creator stores the solved encounter and navigates to /combats/ia, where
 * useGame() consumes it to pre-fill the enemy roster.
 *
 * Only the enemies travel. The players do not need handing over — both screens
 * read the same stored party (see `party.ts`), so the fight the combat view
 * runs is the fight the creator priced.
 */
export interface EncounterHandoff {
  encounter: SolvedEncounter;
}

let pending: EncounterHandoff | null = null;

export function setPendingEncounter(encounter: SolvedEncounter): void {
  pending = { encounter };
}

export function takePendingEncounter(): EncounterHandoff | null {
  const e = pending;
  pending = null;
  return e;
}
