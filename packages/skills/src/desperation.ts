import { ActionDefinition, ActionType } from '@pimpampum/engine';
import { action, d } from './types.js';

/**
 * Cop desesperat — the universal fallback (Pokémon-Struggle inspired): a
 * skill-less, 0-fatigue card in every combatant's hand that only becomes
 * playable when NOTHING else is (the engine's generic `lastResort` flag) —
 * typically when the daily fatigue budget is spent. Weak and self-wounding
 * (1 PV after the swing, hit or miss), so exhausted fights end through
 * desperate, bleeding play instead of a stand-still.
 */
export const COP_DESESPERAT: ActionDefinition = action({
  id: 'cop-desesperat', name: 'Cop desesperat', skillId: 'desesperacio',
  unlock: 0, type: ActionType.Atac, speed: -2, dice: d(1, 4), fatigueCost: 0, lastResort: true,
  effects: [{ type: 'self_damage', params: { amount: 1 } }],
  desc: "Només quan no pots jugar cap altra carta. Després de l'atac, encertis o no, perds 1 PV.",
  icon: 'lorc/fist.svg',
});
