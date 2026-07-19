import type { SolvedEncounter } from '@pimpampum/enemies';

/**
 * One-shot hand-off from the encounter creator to the combat view: the
 * creator stores the solved encounter (plus the per-player level inputs)
 * and navigates to /combat, where useGame() consumes it to pre-fill the
 * enemy roster and auto-build the heroes.
 */
export interface EncounterHandoff {
  encounter: SolvedEncounter;
  /** Per-player total skill levels, as entered in the creator. */
  playerLevels: number[];
  /** Per-player passive armour (0-2) — each hero is equipped to match. */
  playerArmor: number[];
}

let pending: EncounterHandoff | null = null;

export function setPendingEncounter(encounter: SolvedEncounter, playerLevels: number[], playerArmor: number[]): void {
  pending = { encounter, playerLevels, playerArmor };
}

export function takePendingEncounter(): EncounterHandoff | null {
  const e = pending;
  pending = null;
  return e;
}
