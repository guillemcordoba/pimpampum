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
// Atac encadenat: each attacking turn the chain climbs, adding to the attack
// total (which is also the damage margin). The chain breaks at round end
// unless the holder attacked (arming round exempt).
const CHAIN_BONUS = [0, 5, 10];

const CADENA: StatusBehavior = {
  /**
   * A live chain strengthens the NEXT attack, so holding one is worth something
   * before it is spent — which the evaluator could not see, since a chain moves
   * no PV until it fires. Scaled by how far the ladder has climbed, and capped:
   * a chain is only worth anything while you keep attacking, and any non-attack
   * throws it away.
   */
  positionValue(ref) {
    return Math.min(0.5, 0.15 * Math.max(0, ref.entry.value));
  },
  onAttackAction(ctx) {
    ctx.entry.value += 1; // advance the ladder in place
    // +0, +5, +10 and there it holds. ADDED, not multiplied: it was ×1.5 then
    // ×2, which plays the same but asks the table for fractions (13.5 damage,
    // 0.5 PV left; NEXT-STEPS §40). Uncapped doubling once made the one card
    // carry the whole kit.
    return { attackRollBonus: CHAIN_BONUS[Math.min(CHAIN_BONUS.length - 1, ctx.entry.value - 1)] };
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
    // On PLAY, before the blow's own status hooks: armed at 0, so this blow
    // climbs it to ×1 and the next attack is ×2.
    onPlay(ctx) {
      ctx.source.setStatus('cadena', 0, -1, { armedRound: ctx.engine.round }, CADENA);
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
      // An ATTACK that starts the chain. As a Focus it spent a whole turn on a
      // stance, and in fights of ~5 rounds that turn never paid back: it was
      // never once the right play (NEXT-STEPS §26).
      unlock: 5, type: ActionType.Atac, speed: 1, dice: d(1, 6),
      effects: [{ type: 'weapon_damage' }, { type: 'chain_attack' }],
      desc: "Encadena: cada torn següent que ataquis, {A}+5, després +10. Es trenca si no ataques.",
      icon: 'lorc/sword-spin.svg',
    }),
  ],
  effects: MESTRE_ARMES_EFFECTS,
};

