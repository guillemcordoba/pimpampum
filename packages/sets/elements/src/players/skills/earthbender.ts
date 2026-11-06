import { ActionType, Character, EffectContext, EffectHandler, StatusBehavior, applyKind, createCharacter } from '@pimpampum/engine';
import { SkillDefinition, action, d } from '../types.js';
import { applyMod, num } from '../effects/helpers.js';
import { warded } from '../effects/generic.js';
import { heroPV } from '../hero-pv.js';

/**
 * MESTRE DE LA TERRA — the user's design ("Maestre de la terra — conceptes de
 * cartes", 2026-11-01): the robust, defensive bender. Heavy defense — walls,
 * armour, a bunker that shelters the whole party — where water's is fluid; a
 * trap that grips whoever attacks; a crack that opens under whoever stands firm,
 * quicksand, a living golem; and the
 * earthquake. The numbers are this file's, on the dice ladder (intentions.md).
 */

const SKILL_ID = 'earthbender';

function stoodFirm(c: Character, plan: readonly { actor: Character; action: { actionType: ActionType }; cancelled?: boolean }[]): boolean {
  return plan.some(p => p.actor === c && !p.cancelled && p.action.actionType === ActionType.Defensa);
}

/** `defender` covers `who` for the rest of the round, with this card's dice. */
function guardWith(defender: Character, who: Character, ctx: EffectContext): void {
  who.guards.push({ defender, action: ctx.action });
}

// --- 7 · Roca viva ----------------------------------------------------------

const GOLEM_SKILL = 'golem-de-roca';
/** As sturdy as a hero of the card's level (it was "a body's PV" while that was one value). */
const GOLEM_PV = heroPV({ earthbender: 7 });
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

  // 2 · Mur de pedra: the stone stays up — next round it still stands before
  // whoever it covered, a standing wall with the card's dice.
  stone_wall: {
    postRound(ctx) {
      const dice = ctx.action.dice;
      const covered = ctx.targets.find(t => t.team === ctx.source.team) ?? ctx.source;
      if (!dice || !ctx.source.isAlive() || !covered.isAlive()) return;
      // Set at the round's end: its turn advance takes one, the next round remains.
      applyKind(covered, 'standingWall', 'mur-de-pedra', 1, 2,
        { caster: ctx.source, dice, skillId: SKILL_ID, rollBonus: ctx.action.rollBonus ?? 0, name: 'Mur de pedra' });
    },
    aiWeight() { return 0.4; },
  },

  // 3 · Esquerda: the ground cracks open under whoever stood firm — the chosen
  // enemy loses the card's dice in PV, but only if it played a Defense this round.
  fissure: {
    getTargetRequirement() { return 'enemy'; },
    onResolve(ctx) {
      const t = ctx.targets[0];
      const dice = ctx.action.dice;
      if (!t?.isAlive() || !dice) return;
      if (!stoodFirm(t, ctx.engine.plannedThisRound())) {
        ctx.engine.log('focus', `La terra s'esquerda sota ${t.name}, però ja no hi és.`, ctx.source.team);
        return;
      }
      const loss = ctx.engine.contestRoll(ctx.source, dice, { kind: 'attack', skillId: SKILL_ID, rollBonus: ctx.action.rollBonus }).total;
      ctx.engine.log('focus', `La terra s'esquerda sota ${t.name}: ${loss} PV.`, ctx.source.team);
      ctx.engine.applyPvLoss(t, loss, ctx.source);
    },
    // Aim at an enemy who defended this round: the crack opens under it only.
    aiTargetPriority(ctx, candidate) { return stoodFirm(candidate, ctx.plan) ? 10 : -10; },
    aiWeight(ctx) { return ctx.enemies.length ? 0.6 : 0; },
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
    // "Aquest torn, cap de vosaltres no pot atacar": the whole round, so it is
    // settled at the reveal, before a fast attack could slip out first.
    onReveal(ctx) {
      for (const p of ctx.engine.plannedThisRound()) {
        if (p.actor.team !== ctx.source.team || p.cancelled || p.action.actionType !== ActionType.Atac) continue;
        ctx.engine.cancelPendingAction(p.actor);
      }
    },
    onResolve(ctx) {
      for (const ally of ctx.engine.alliesOf(ctx.source, false)) guardWith(ctx.source, ally, ctx);
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
      effects: [{ type: 'stone_wall' }],
      desc: 'Defensa també el torn següent.',
      icon: 'delapouite/stone-wall.svg',
    }),
    action({
      id: 'esquerda', name: 'Esquerda', skillId: SKILL_ID,
      unlock: 3, type: ActionType.Focus, dice: d(3, 4, 3),
      effects: [{ type: 'fissure' }],
      desc: "Si l'enemic que triïs ha jugat una Defensa aquest torn, perd tants PV com aquests daus.",
      icon: 'lorc/earth-crack.svg',
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
      effects: [{ type: 'lock_on_block', params: { types: [ActionType.Atac], turns: 2 } }],
      desc: "Si aguanta, l'atacant queda atrapat: els 2 torns següents no pot atacar.",
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
