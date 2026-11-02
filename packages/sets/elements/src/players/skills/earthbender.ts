import { ActionType, Character, EffectContext, EffectHandler, StatusBehavior, createCharacter } from '@pimpampum/engine';
import { SkillDefinition, action, d } from '../types.js';
import { applyMod, num } from '../effects/helpers.js';
import { warded } from '../effects/generic.js';
import { BODY_PV } from '@pimpampum/set-common';

/**
 * MESTRE DE LA TERRA — the user's design ("Maestre de la terra — conceptes de
 * cartes", 2026-11-01): the robust, defensive bender. Heavy defense — walls,
 * armour, a bunker that shelters the whole party — where water's is fluid; a
 * trap that grips whoever attacks; a tunnel, quicksand, a living golem; and the
 * earthquake. The numbers are this file's, on the dice ladder (intentions.md).
 */

const SKILL_ID = 'earthbender';

/** `defender` covers `who` for the rest of the round, with this card's dice. */
function guardWith(defender: Character, who: Character, ctx: EffectContext): void {
  who.guards.push({ defender, action: ctx.action });
}

// --- 3 · Túnel --------------------------------------------------------------

const TUNNEL: StatusBehavior = {
  // Out of the tunnel at the foe's feet: no attack of the holder's this round can be defended.
  onAttackAction(ctx) {
    ctx.engine.log('attack', `${ctx.holder.name} surt del túnel just al costat de l'enemic.`, ctx.holder.team);
    return { ignoreDefense: true };
  },
  // About the defense its blows skip next round: a fair share of a body.
  positionValue(ref) { return ref.entry.remaining > 0 ? 0.15 : 0; },
};

// --- 7 · Roca viva ----------------------------------------------------------

const GOLEM_SKILL = 'golem-de-roca';
const GOLEM_PV = BODY_PV;
const GOLEM_CARDS = [
  action({ id: 'cop-de-roca', name: 'Cop de roca', skillId: GOLEM_SKILL, unlock: 0, type: ActionType.Atac, dice: d(3, 6), desc: '', icon: 'lorc/fist.svg' }),
  action({ id: 'cos-de-roca', name: 'Cos de roca', skillId: GOLEM_SKILL, unlock: 0, type: ActionType.Defensa, dice: d(2, 6), desc: '', icon: 'lorc/stone-block.svg' }),
];

function golem(maker: Character): Character {
  const g = createCharacter({ name: `Gòlem de ${maker.name}`, classCss: 'terra', pv: GOLEM_PV, skills: { [GOLEM_SKILL]: 0 }, actions: GOLEM_CARDS });
  g.aiControlled = true;
  return g;
}

const EARTH_EFFECTS: Record<string, EffectHandler> = {
  // 6 · Armadura de terra: rock plates on an ally — +`amount` on its defenses
  // for the next `turns` rounds.
  earth_armor: {
    getTargetRequirement() { return 'ally'; },
    onResolve(ctx) {
      const t = ctx.targets[0];
      if (!t || !t.isAlive()) return;
      const amount = num(ctx.params, 'amount', 3);
      applyMod(t, 'defense', amount, num(ctx.params, 'turns', 3), ctx.action.name);
      ctx.engine.log('focus', `Plaques de roca cobreixen ${t.name}: +${amount} a les defenses.`, ctx.source.team);
    },
    aiWeight() { return 0.6; },
  },

  // 3 · Túnel: next round no attack of the bender's group can be defended.
  tunnel: {
    getTargetRequirement() { return 'none'; },
    onResolve(ctx) {
      // Set in the Focus step: the round's end takes one, the next round remains.
      for (const a of ctx.engine.alliesOf(ctx.source, true)) a.setStatus('tunel', 1, 2, undefined, TUNNEL);
      ctx.engine.log('focus', `${ctx.source.name} obre túnels sota tot el camp.`, ctx.source.team);
    },
    aiWeight() { return 0.6; },
  },

  // 9 · Sorres movedisses: the chosen enemy sinks — its card this round
  // resolves last (a Defense, after every attack it was meant to stop).
  quicksand: {
    getTargetRequirement() { return 'enemy'; },
    onResolve(ctx) {
      const t = ctx.targets[0];
      if (!t || !t.isAlive() || warded(t)) return;
      if (ctx.engine.delayPendingAction(t)) {
        ctx.engine.log('focus', `${t.name} s'enfonsa a la sorra: la seva carta es resol l'última.`, ctx.source.team);
      }
    },
    aiWeight(ctx) { return ctx.enemies.length ? 0.6 : 0; },
  },

  // 8 · Búnquer: one defense over the whole party — and nobody inside attacks
  // this round.
  bunker: {
    getTargetRequirement() { return 'self'; },
    onResolve(ctx) {
      for (const ally of ctx.engine.alliesOf(ctx.source, false)) guardWith(ctx.source, ally, ctx);
      for (const p of ctx.engine.plannedThisRound()) {
        if (p.actor.team !== ctx.source.team || p.resolved || p.cancelled || p.action.actionType !== ActionType.Atac) continue;
        ctx.engine.cancelPendingAction(p.actor);
      }
      ctx.engine.log('defense', `${ctx.source.name} aixeca un búnquer de roca sobre tot el grup: ningú no en surt a atacar.`, ctx.source.team);
    },
    aiWeight(ctx) { return ctx.allies.some(a => a.currentPV < a.maxPV * 0.5) ? 0.9 : 0.3; },
  },

  // 7 · Roca viva: a stone golem rises and fights on the bender's side.
  living_rock: {
    getTargetRequirement() { return 'none'; },
    onResolve(ctx) {
      ctx.engine.addCombatant(ctx.source.team, golem(ctx.source));
      ctx.engine.log('focus', `La roca s'alça: un gòlem de pedra lluita al costat de ${ctx.source.name}.`, ctx.source.team);
    },
    aiWeight() { return 0.8; },
  },
};

export const EARTHBENDER: SkillDefinition = {
  id: SKILL_ID, displayName: 'Mestre de la terra', classCss: 'terra', category: 'player',
  description: 'La terra aguanta el cop, protegeix el grup i respon amb el seu pes.',
  iconPath: 'icons/000000/transparent/1x1/lorc/stone-tower.svg',
  actions: [
    action({
      id: 'llancament-de-roca', name: 'Llançament de roca', skillId: SKILL_ID,
      unlock: 1, type: ActionType.Atac, fast: true, dice: d(1, 4),
      desc: '',
      icon: 'lorc/stone-sphere.svg',
    }),
    action({
      id: 'mur-de-pedra', name: 'Mur de pedra', skillId: SKILL_ID,
      unlock: 2, type: ActionType.Defensa, dice: d(2, 4, 1),
      desc: '',
      icon: 'delapouite/stone-wall.svg',
    }),
    action({
      id: 'tunel', name: 'Túnel', skillId: SKILL_ID,
      unlock: 3, type: ActionType.Focus,
      effects: [{ type: 'tunnel' }],
      desc: 'El torn següent, els atacs del teu grup no es poden defensar.',
      icon: 'delapouite/hole.svg',
    }),
    action({
      id: 'allau', name: 'Allau', skillId: SKILL_ID,
      unlock: 4, type: ActionType.Atac, dice: d(2, 4),
      effects: [{ type: 'stun_on_hit', params: { turns: 1 } }],
      desc: "Si fereix, l'objectiu queda enterrat: perd el torn següent.",
      icon: 'delapouite/stone-pile.svg',
    }),
    action({
      id: 'trampa-de-terra', name: 'Trampa de terra', skillId: SKILL_ID,
      unlock: 5, type: ActionType.Defensa, dice: d(3, 4),
      effects: [{ type: 'lock_on_block', params: { types: [ActionType.Atac], turns: 1 } }],
      desc: "Si aguanta, l'atacant queda atrapat: el torn següent no pot atacar.",
      icon: 'lorc/stone-crafting.svg',
    }),
    action({
      id: 'armadura-de-terra', name: 'Armadura de terra', skillId: SKILL_ID,
      unlock: 6, type: ActionType.Focus,
      effects: [{ type: 'earth_armor', params: { amount: 6, turns: 3 } }],
      desc: 'Un aliat té +6 a les defenses els 3 torns següents.',
      icon: 'lorc/armor-vest.svg',
    }),
    action({
      id: 'roca-viva', name: 'Roca viva', skillId: SKILL_ID,
      unlock: 7, type: ActionType.Focus,
      effects: [{ type: 'fatigue_cost', params: { levels: 2 } }, { type: 'living_rock' }],
      desc: 'Puges 2 nivells de fatiga. Invoca un gòlem de pedra (26 PV) que lluita al teu costat: Cop de roca (Atac 3d6) i Cos de roca (Defensa 2d6).',
      icon: 'delapouite/rock-golem.svg',
    }),
    action({
      id: 'bunquer', name: 'Búnquer', skillId: SKILL_ID,
      unlock: 8, type: ActionType.Defensa, dice: d(4, 6),
      effects: [{ type: 'bunker' }],
      desc: 'Defensa tots els aliats. Aquest torn, cap de vosaltres no pot atacar.',
      icon: 'lorc/stone-tower.svg',
    }),
    action({
      id: 'sorres-movedisses', name: 'Sorres movedisses', skillId: SKILL_ID,
      unlock: 9, type: ActionType.Focus, fast: true,
      effects: [{ type: 'quicksand' }],
      desc: "La carta d'aquest torn de l'enemic que triïs es resol l'última.",
      icon: 'lorc/sands-of-time.svg',
    }),
    action({
      id: 'terratremol', name: 'Terratrèmol', skillId: SKILL_ID,
      unlock: 10, type: ActionType.Atac, dice: d(5, 4), targetCount: 99,
      desc: 'Afecta tots els enemics.',
      icon: 'lorc/earth-crack.svg',
    }),
  ],
  effects: EARTH_EFFECTS,
};
