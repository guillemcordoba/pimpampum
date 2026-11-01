import type { Character, StatusEntry } from '@pimpampum/engine';

/**
 * EFECTE NEGATIU (rules.md): any state an enemy card has left on you —
 * penalties, poison, burns, marks, lost actions, sleep. Every set marks one
 * the same way, so a cleanse in any kit finds every one of them:
 *
 *  - a status or a modifier an enemy card sets carries `harm: 1` in its data
 *    (`HARM`). A cost a card makes its own player pay (a fatigue price, the
 *    master's own half of Bloqueig mutu, the attacker's lowered guard) does not;
 *  - lost actions are the `skipTurns` counter, and only enemy cards raise it;
 *  - a status that takes the BODY out of the fight (swallowed whole) carries
 *    `bodyOut: 1` instead: it is not an effect on the body but where the body
 *    is, and nothing but the fight frees it;
 *  - an ENGINE status kind (`STATUS_KINDS`) knows whether it is bad for its
 *    holder (`StatusBehavior.harmful`): it is an efecte negatiu when its
 *    `data.source` is not on the holder's side (a kind applied with no source
 *    counts as an enemy's). A cost a card makes its own player pay passes its
 *    player as the source.
 */
export const HARM = { harm: 1 } as const;
export const BODY_OUT = { bodyOut: 1 } as const;

export function isHarm(data: Record<string, unknown> | undefined): boolean {
  return data?.['harm'] === 1;
}

export function isTakenOut(c: Character): boolean {
  for (const entry of c.statuses.values()) if (entry.data?.['bodyOut'] === 1) return true;
  return false;
}

/** The statuses on `c` an enemy card left there. */
export function harmfulStatuses(c: Character): [string, StatusEntry][] {
  return [...c.statuses].filter(([, entry]) => isHarm(entry.data) || leftByAnEnemy(c, entry));
}

function leftByAnEnemy(c: Character, entry: StatusEntry): boolean {
  if (!entry.behavior?.harmful) return false;
  const source = entry.data?.['source'] as Character | undefined;
  return !source || source.team !== c.team;
}

/** Clears every efecte negatiu on `c` (statuses, modifiers, lost actions);
 *  how many it cleared. A body taken out of the fight is left as it is. */
export function clearHarm(c: Character): number {
  if (isTakenOut(c)) return 0;
  let cleared = 0;
  for (const [key] of harmfulStatuses(c)) { c.clearStatus(key); cleared++; }
  const kept = c.modifiers.filter(m => !isHarm(m.data));
  cleared += c.modifiers.length - kept.length;
  c.modifiers = kept;
  if (c.skipTurns > 0) { c.skipTurns = 0; cleared++; }
  return cleared;
}
