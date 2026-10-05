import { ActionDefinition, ActionType } from '@pimpampum/engine';
import { action, d } from './types.js';

/**
 * Cop desesperat — the universal fallback (Pokémon-Struggle inspired): a
 * skill-less card in every combatant's hand that only becomes playable when
 * NOTHING else is (the engine's generic `lastResort` flag) — every other card
 * consumed or blocked by a status. Weak and self-wounding (1 PV after the
 * swing, hit or miss), so a cornered fight ends through desperate, bleeding
 * play instead of a stand-still. (It used to be the card of a spent daily
 * fatigue budget; fatigue is a DM-assigned level now and costs no cards.)
 */
export const COP_DESESPERAT: ActionDefinition = action({
  id: 'cop-desesperat', name: 'Cop desesperat', skillId: 'desesperacio',
  unlock: 0, type: ActionType.Atac, speed: -2, dice: d(1, 4), lastResort: true,
  effects: [{ type: 'self_damage', params: { amount: 1 } }],
  desc: "Només quan no pots jugar cap altra carta. Després de l'atac, encertis o no, perds 1 PV.",
  icon: 'lorc/fist.svg',
});
