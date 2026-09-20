import { ActionType, EffectHandler, StatusBehavior } from '@pimpampum/engine';
import { SkillDefinition, action, d, ICON_PREFIX } from '../types.js';

/**
 * Mestre d'Armes — a weapon-agnostic master-at-arms. Each attack card rolls
 * its OWN dice (the technique) and adds the wielded weapon's flat modifier
 * (the generic `weapon_damage` effect); weapon cards REQUIRE a weapon. The
 * only skill elite at both attack and defense. The signature mechanics live
 * below: the `cadena` compounding-chain status behaviour and the `flux`
 * card-swap charges (spent by the engine's flowSwap).
 */
// Atac encadenat: each attacking turn the chain multiplier climbs (×1, ×2,
// ×3, ×4…), applied to the whole attack total (which is also the damage
// margin). The chain breaks at round end unless the holder attacked (arming
// round exempt).
const CADENA: StatusBehavior = {
  /**
   * A live chain multiplies the NEXT attack, so holding one is worth something
   * before it is spent — which the evaluator could not see, since a chain moves
   * no PV until it fires. Scaled by how far the ladder has climbed, and capped:
   * a chain is only worth anything while you keep attacking, and any non-attack
   * throws it away.
   */
  positionValue(ref) {
    return Math.min(0.5, 0.15 * Math.max(0, ref.entry.value));
  },
  onAttackAction(ctx) {
    ctx.entry.value += 1; // advance the ladder in place (×value)
    return { attackTotalMult: ctx.entry.value };
  },
  onRoundEnd(ctx) {
    if (ctx.entry.data?.['armedRound'] === ctx.engine.round) return;
    if (ctx.playedAction?.actionType !== ActionType.Atac) ctx.holder.clearStatus('cadena');
  },
  // Once chained, attacks are king and any non-attack throws the chain away.
  adjustActionWeight(_view, ref, actionDef, w) {
    switch (actionDef.actionType) {
      case ActionType.Atac: return w + 4 + ref.entry.value;
      case ActionType.Defensa: return 0.05;
      case ActionType.Focus: return 0.05;
      default: return w;
    }
  },
};

// Estat de flux: post-reveal card swaps, unlimited for the rest of the combat
// (the engine's flowSwap checks/spends; spending is a no-op here).
const FLUX: StatusBehavior = {
  cardSwapCharges() { return 1; },
  spendCardSwapCharge() {},
  /** A held swap is the right card instead of the wrong one, once. Small and
   *  flat: it is real, and it is not worth a body. */
  positionValue() { return 0.15; },
};

const MESTRE_ARMES_EFFECTS: Record<string, EffectHandler> = {
  // Atac encadenat: arm the compounding attack chain (the CADENA behaviour
  // above does the doubling and the breaking).
  chain_attack: {
    getTargetRequirement() { return 'none'; },
    canPlay(actor) { return !actor.hasStatus('cadena'); },
    onResolve(ctx) {
      // Armed at 1, so the FIRST chained attack is already x2. It used to arm
      // at 0, which meant spending a whole turn to buy a x1 — nothing at all —
      // and only then climbing. A stance that costs a turn has to pay on the
      // turn after it, or nobody will ever enter it (2.0% of legal turns).
      ctx.source.setStatus('cadena', 1, -1, { armedRound: ctx.engine.round }, CADENA);
      ctx.engine.log('focus', `${ctx.source.name} encadena els seus atacs!`, ctx.source.team);
    },
    // Worth arming when there are foes to grind down; nothing once already chained.
    aiWeight(ctx) { return ctx.actor.hasStatus('cadena') ? 0 : (ctx.enemies.length >= 1 ? 2.5 : 0); },
  },

  // Estat de flux: enter the flow state (FLUX behaviour above).
  flow_state: {
    getTargetRequirement() { return 'none'; },
    canPlay(actor) { return !actor.hasStatus('flux'); },
    onResolve(ctx) {
      ctx.source.setStatus('flux', 1, -1, undefined, FLUX);
      ctx.engine.log('focus', `${ctx.source.name} entra en estat de flux.`, ctx.source.team);
    },
    // The AI can't exploit post-reveal swaps, so keep it from picking this often.
    aiWeight(ctx) { return ctx.actor.hasStatus('flux') ? 0 : 0.2; },
  },
};

export const MESTRE_ARMES: SkillDefinition = {
  id: 'mestre-armes', displayName: "Mestre d'Armes", classCss: 'mestre-armes', category: 'player',
  description: "Mestre de totes les armes: la tècnica és el que colpeja; l'arma que empunyes la potencia. Excel·lent en atac i defensa.",
  iconPath: ICON_PREFIX + 'delapouite/fencer.svg',
  actions: [
    action({
      id: 'atac-llampec', name: 'Atac llampec', skillId: 'mestre-armes',
      unlock: 1, type: ActionType.Atac, speed: 2, dice: d(1, 6),
      effects: [{ type: 'weapon_damage' }],
      desc: '',
      icon: 'lorc/quick-slash.svg',
    }),
    action({
      id: 'contraatac', name: 'Contraatac', skillId: 'mestre-armes',
      unlock: 2, type: ActionType.Defensa, speed: 2, dice: d(2, 6),
      effects: [{ type: 'counter', params: { dice: d(1, 6) } }],
      desc: 'Si bloqueges, contraataques amb 1d6.',
      icon: 'lorc/sword-clash.svg',
    }),
    action({
      id: 'tall-precis', name: 'Tall precís', skillId: 'mestre-armes',
      unlock: 3, type: ActionType.Atac, speed: -1, dice: d(3, 4),
      effects: [{ type: 'weapon_damage' }],
      desc: '',
      icon: 'lorc/sword-wound.svg',
    }),
    action({
      id: 'estat-de-flux', name: 'Estat de flux', skillId: 'mestre-armes',
      // Speed +1, not -4. A Focus is cancelled if its actor takes damage
      // first, so a Focus at -4 resolves only when nothing reached you all
      // round — which against four enemies is almost never. Both of this kit's
      // Focus cards sat under 2.5% of the turns they were legal for that
      // reason, and a master slipping into flow is not the slowest thing on
      // the field anyway.
      unlock: 4, type: ActionType.Focus, speed: 1,
      effects: [{ type: 'flow_state' }, { type: 'empower', params: { amount: 6, turns: 2 } }],
      desc: "Durant la resta del combat, després de revelar les cartes, pots canviar la teva carta per una altra. El teu proper atac té {A}+6.",
      icon: 'lorc/meditation.svg',
    }),
    action({
      id: 'atac-encadenat', name: 'Atac encadenat', skillId: 'mestre-armes',
      // Speed +1 for the same reason as Estat de flux above: a stance you
      // cannot enter is not a card.
      unlock: 5, type: ActionType.Focus, speed: 1,
      effects: [{ type: 'chain_attack' }],
      desc: "Cada torn que ataquis, l'atac es multiplica (×2, ×3, ×4…). Es trenca si no ataques.",
      icon: 'lorc/sword-spin.svg',
    }),
  ],
  effects: MESTRE_ARMES_EFFECTS,
};

export const WEAPON_MASTER_SKILLS: SkillDefinition[] = [MESTRE_ARMES];
