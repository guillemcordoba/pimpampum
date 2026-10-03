import { ActionType, type Character, type EffectHandler, type EngineApi, type StatusBehavior } from '@pimpampum/engine';
import { SkillDefinition, action, d } from '../../players/types.js';
import { applyMod, num } from '../../players/effects/helpers.js';
import { EnemyDefinition, ICON } from '../types.js';

/** Hidden in the horde: nobody can pick the goblin out until the round ends. */
const AMAGAT: StatusBehavior = { untargetable() { return true; } };
/** Just came out of hiding: the horde has moved on, it cannot vanish again at once. */
const DESCOBERT: StatusBehavior = {};

/**
 * A goblin HIDES IN THE HORDE — it slips behind the others, and comes back out
 * with a knife. Two things follow from the fiction, and both are rules:
 *
 *  - no horde, no hiding: with no ally left in view there is nothing to hide
 *    behind, and the card does nothing;
 *  - not two rounds running: out of hiding, it is exposed for a round.
 *
 * Without them one surviving goblin hid every round forever: fights against a
 * horde ran to the round cap and drew (NEXT-STEPS §26), and the balancer could
 * not make them winnable at any PV.
 */
function hordeInView(engine: EngineApi, goblin: Character): boolean {
  return engine.alliesOf(goblin).some(a => !a.hasStatus('amagant-se'));
}

const GOBLIN_EFFECTS: Record<string, EffectHandler> = {
  horde_hide: {
    canPlay(actor) { return !actor.hasStatus('descobert'); },
    onResolve(ctx) {
      // Resolved, not planned: allies that hid first this round are no cover.
      if (!hordeInView(ctx.engine, ctx.source)) {
        ctx.engine.log('focus', `${ctx.source.name} no té on amagar-se.`, ctx.source.team);
        return;
      }
      ctx.source.setStatus('amagant-se', 1, 1, undefined, AMAGAT);
      ctx.source.setStatus('descobert', 1, 2, undefined, DESCOBERT);
      applyMod(ctx.source, 'attack', num(ctx.params, 'amount', 1), 'nextTurn', ctx.action.name);
    },
    aiWeight(ctx) {
      if (ctx.allies.length === 0) return 0;
      return ctx.actor.currentPV < ctx.actor.maxPV * 0.5 ? 1.6 : 0.7;
    },
  },
};

const GOBLIN_SKILL: SkillDefinition = {
  id: 'goblin', displayName: 'Goblin', classCss: 'goblin', category: 'enemy',
  description: 'Lluita en horda: febles sols, perillosos en grup.',
  iconPath: ICON + 'delapouite/goblin-head.svg',
  actions: [
    action({ id: 'punyalada-rapida', name: 'Punyalada ràpida', skillId: 'goblin', unlock: 1, type: ActionType.Atac, speed: 3, dice: d(1, 2), desc: '', icon: 'lorc/plain-dagger.svg' }),
    action({ id: 'punyalada-traidora', name: 'Punyalada traïdora', skillId: 'goblin', unlock: 2, type: ActionType.Atac, speed: -1, dice: d(1, 6), effects: [{ type: 'flanking' }], desc: "Si un altre goblin ha atacat el mateix objectiu aquest torn, l'objectiu té −3 {D}.", icon: 'lorc/backstab.svg' }),
    action({ id: 'amagar-se', name: 'Amagar-se', skillId: 'goblin', unlock: 3, type: ActionType.Focus, speed: 2, effects: [{ type: 'horde_hide', params: { amount: 5 } }], desc: 'Esquives tots els atacs aquest torn. El següent torn, {A}+5. Cal un aliat a la vista; no dos torns seguits.', icon: 'lorc/hidden.svg' }),
    action({ id: 'allau-de-la-horda', name: 'Allau de la horda', skillId: 'goblin', unlock: 4, type: ActionType.Atac, speed: -2, effects: [{ type: 'crossfire', params: { count: 'attackers', amount: 1 } }], desc: '+1 {A} per cada enemic que ataca.', icon: 'lorc/all-for-one.svg' }),
  ],
  effects: GOBLIN_EFFECTS,
};

export const GOBLIN: EnemyDefinition = {
  id: 'goblin', displayName: 'Goblin', classCss: 'goblin', iconPath: ICON + 'delapouite/goblin-head.svg',
  equipment: ['escut'],
  /** ~20 kg — D&D 3.5 gives 40-45 lb, Warhammer 18-20 kg. */
  bulk: 0.66,
  skills: [GOBLIN_SKILL],
};
