import { ActionType, EffectHandler, StatusBehavior } from '@pimpampum/engine';
import { SkillDefinition, action, ICON_PREFIX } from '../types.js';
import { num } from '../effects/helpers.js';

/**
 * Mestre d'Armes — a weapon-agnostic master-at-arms. Every attack deals the
 * damage of the WIELDED main-hand weapon (the generic `weapon_damage` effect, for
 * us the humble Bastó); the action's own {ATK} (skill ×2 precision) decides
 * whether it lands. The only skill elite at both attack and defense. No weapon →
 * no damage; there is no unarmed fallback. The signature mechanics live below:
 * the `cadena` compounding-chain status behaviour and the `flux` card-swap
 * charges (generic `cardSwap` status data, spent by the engine's flowSwap).
 */
const MESTRE_ARMES_EFFECTS: Record<string, EffectHandler> = {
  // Atac encadenat: arm the compounding attack chain (the `cadena` status
  // behaviour below does the doubling and the breaking).
  chain_attack: {
    getTargetRequirement() { return 'none'; },
    canPlay(actor) { return !actor.hasStatus('cadena'); },
    onResolve(ctx) {
      ctx.source.setStatus('cadena', 1, -1, { armedRound: ctx.engine.round });
      ctx.engine.log('focus', `${ctx.source.name} encadena els seus atacs!`, ctx.source.team);
    },
    // Worth arming when there are foes to grind down; nothing once already chained.
    aiWeight(ctx) { return ctx.actor.hasStatus('cadena') ? 0 : (ctx.enemies.length >= 1 ? 2.5 : 0); },
  },

  // Estat de flux: enter the flow state. The engine spends the `cardSwap`
  // charges on post-reveal swaps (flowSwapRefs / flowSwap).
  flow_state: {
    getTargetRequirement() { return 'none'; },
    canPlay(actor) { return !actor.hasStatus('flux'); },
    onResolve(ctx) {
      ctx.source.setStatus('flux', num(ctx.params, 'charges', 3), -1, { cardSwap: true });
      ctx.engine.log('focus', `${ctx.source.name} entra en estat de flux.`, ctx.source.team);
    },
    // The AI can't exploit post-reveal swaps, so keep it from picking this often.
    aiWeight() { return 0.2; },
  },
};

const MESTRE_ARMES_STATUSES: Record<string, StatusBehavior> = {
  // Atac encadenat: each attacking turn the chain multiplier doubles (×2, ×4…),
  // applied to the whole attack total and damage of every target struck. The
  // chain breaks at round end unless the holder attacked (arming round exempt).
  cadena: {
    onAttackAction(ctx) {
      const mult = ctx.entry.value * 2;
      ctx.holder.setStatus('cadena', mult, -1, ctx.entry.data);
      return { attackTotalMult: mult, damageMult: mult };
    },
    onRoundEnd(ctx) {
      if (ctx.entry.data?.['armedRound'] === ctx.engine.round) return;
      if (ctx.playedAction?.actionType !== ActionType.Atac) ctx.holder.clearStatus('cadena');
    },
    // Once chained, attacks are king and any non-attack throws the chain away.
    adjustActionWeight(_view, _holder, entry, actionDef, w) {
      switch (actionDef.actionType) {
        case ActionType.Atac: return w + 4 + entry.value;
        case ActionType.Defensa: return 0.05;
        case ActionType.Focus: return 0.05;
        default: return w;
      }
    },
  },
};

export const MESTRE_ARMES: SkillDefinition = {
  id: 'mestre-armes', displayName: "Mestre d'Armes", classCss: 'mestre-armes', category: 'player',
  description: "Mestre de totes les armes: el dany surt de l'arma que empunyes; la tècnica decideix si encerta. Excel·lent en atac i defensa.",
  iconPath: ICON_PREFIX + 'delapouite/fencer.svg',
  actions: [
    action({
      id: 'tall-precis', name: 'Tall precís', skillId: 'mestre-armes',
      unlock: 1, type: ActionType.Atac, speed: 1,
      effects: [{ type: 'weapon_damage' }, { type: 'precision', params: { levelMultiplier: 2 } }],
      desc: '{A} = nivell×2.',
      icon: 'lorc/sword-wound.svg',
    }),
    action({
      id: 'contraatac', name: 'Contraatac', skillId: 'mestre-armes',
      unlock: 12, type: ActionType.Defensa, speed: 4, rollBonus: 4,
      effects: [{ type: 'counter', params: { weapon: true } }],
      desc: "Si bloqueges, contraataques amb el dany de la teva arma.",
      icon: 'lorc/sword-clash.svg',
    }),
    action({
      id: 'estat-de-flux', name: 'Estat de flux', skillId: 'mestre-armes',
      unlock: 38, type: ActionType.Focus, speed: 2,
      effects: [{ type: 'flow_state', params: { charges: 3 } }],
      desc: "3 cops aquest combat, després de revelar les cartes, pots canviar la teva carta per una altra. No es pot tornar a jugar mentre dura.",
      icon: 'delapouite/card-exchange.svg',
    }),
    action({
      id: 'desequilibri', name: 'Desequilibri', skillId: 'mestre-armes',
      unlock: 40, type: ActionType.Defensa, speed: 4, rollBonus: 4,
      effects: [{ type: 'debuff_on_block', params: { kind: 'speed', amount: 6, duration: 'nextTurn' } }],
      desc: "Si bloqueges, l'atacant té {V}−6 el torn següent.",
      icon: 'delapouite/yin-yang.svg',
    }),
    action({
      id: 'finta', name: 'Finta', skillId: 'mestre-armes',
      unlock: 48, type: ActionType.Atac, speed: 2,
      effects: [{ type: 'weapon_damage' }, { type: 'ignore_defense' }],
      desc: 'No es pot defensar.',
      icon: 'felbrigg/thrust.svg',
    }),
    action({
      id: 'atac-encadenat', name: 'Atac encadenat', skillId: 'mestre-armes',
      unlock: 70, type: ActionType.Focus, speed: -2, fatigueCost: 2,
      effects: [{ type: 'chain_attack' }],
      desc: "Cada torn que ataquis, l'atac dobla {A} i el dany (×2, ×4, ×8…). Es trenca si no ataques.",
      icon: 'lorc/sword-spin.svg',
    }),
    action({
      id: 'cop-mestre', name: 'Cop mestre', skillId: 'mestre-armes',
      unlock: 85, type: ActionType.Atac, speed: 0, fatigueCost: 2,
      effects: [
        { type: 'weapon_damage', params: { times: 3 } },
        { type: 'precision', params: { levelMultiplier: 2 } },
        { type: 'piercing', params: {} },
      ],
      desc: "{A} = nivell×2. Ignora l'armadura.",
      icon: 'delapouite/sword-brandish.svg',
    }),
  ],
  effects: MESTRE_ARMES_EFFECTS,
  statusBehaviors: MESTRE_ARMES_STATUSES,
};

export const WEAPON_MASTER_SKILLS: SkillDefinition[] = [MESTRE_ARMES];
