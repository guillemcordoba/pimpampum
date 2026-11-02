import { Character, EngineApi, applyKind } from '@pimpampum/engine';

/**
 * CREMAT, the set's burn (the user's firebender design, 2026-11-01): the
 * engine's damage over time, BURN_PV at the end of this round and the next.
 * Burning again restarts the two rounds; it never stacks. Shared because
 * whoever burns in this world burns the same way, and a healer can put it out.
 */
export const BURN_KEY = 'cremat';
export const BURN_PV = 2;
export const BURN_TURNS = 2;

export function setAlight(target: Character, source: Character, engine: EngineApi): void {
  if (!target.isAlive()) return;
  applyKind(target, 'damageOverTime', BURN_KEY, BURN_PV, BURN_TURNS, { source });
  engine.log('attack', `${target.name} queda cremat.`, source.team);
}
