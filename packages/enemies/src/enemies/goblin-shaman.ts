import { ActionType, EffectHandler, StatusBehavior } from '@pimpampum/engine';
import { SkillDefinition, action, d } from '@pimpampum/skills';
import { EnemyDefinition, ICON } from '../types.js';

/**
 * Maledicció de sang — the capstone, and the one card that makes the shaman
 * something other than a fourth attacker.
 *
 * The kit was the only TRUNCATED one on the scoreboard: bodies needed for an
 * even fight fell 12 → 4 → 3 → 2 as its level rose, i.e. it was still gaining
 * when it ran out of cards. A truncated kit wants more cards, not better ones.
 *
 * And a shaman's job in a horde is not to hit harder, it is to make the HORDE
 * hit harder — so the level-5 card turns every goblin jab on the cursed target
 * into a real wound. It is the answer to the thing that makes a swarm harmless
 * against armour: many small hits, each one shaved to nothing.
 */
const MALEIT: StatusBehavior = {
  modifyIncomingDamage(ctx, damage) {
    // Only a blow that actually landed is deepened — a curse does not wound on
    // its own, it makes other wounds worse.
    return damage > 0 ? damage + (ctx.entry.value || 2) : damage;
  },
  /** A burden on the cursed: every blow they take from now on is bigger. Priced
   *  at a few extra points against their own health, and no more — the curse
   *  only pays when someone connects. */
  positionValue(ref) {
    return -Math.min(0.5, (ref.entry.value * 2) / Math.max(1, ref.holder.maxPV));
  },
};

const SHAMAN_EFFECTS: Record<string, EffectHandler> = {
  blood_curse: {
    getTargetRequirement() { return 'enemy'; },
    onResolve(ctx) {
      const target = ctx.targets[0];
      if (!target || !target.isAlive()) return;
      const amount = (ctx.params?.amount as number) ?? 2;
      target.setStatus('maleit-de-sang', amount, -1, undefined, MALEIT);
      ctx.engine.log('focus', `${ctx.source.name} marca ${target.name} amb la maledicció de sang: cada ferida li farà ${amount} de dany de més.`, ctx.source.team);
    },
    aiWeight(ctx) { return ctx.allies.length >= 2 ? 1.7 : 0.8; },
  },
};

const GOBLIN_SHAMAN_SKILL: SkillDefinition = {
  id: 'goblin-shaman', displayName: 'Goblin Xaman', classCss: 'goblin-shaman', category: 'enemy',
  description: 'Màgia bruta de llamps i sang.',
  iconPath: ICON + 'delapouite/skull-staff.svg',
  actions: [
    action({ id: 'llamp', name: 'Llamp', skillId: 'goblin-shaman', unlock: 3, type: ActionType.Atac, speed: 0, dice: d(2, 6), desc: '', icon: 'lorc/lightning-arc.svg' }),
    action({ id: 'possessio-demoniaca', name: 'Possessió demoníaca', skillId: 'goblin-shaman', unlock: 4, type: ActionType.Focus, speed: -3, effects: [
      { type: 'skill_mod', params: { kind: 'attack', amount: 0, dice: d(1, 6), target: 'self', duration: 'restOfCombat' } },
      { type: 'weapon_buff', params: { amount: 3, target: 'self', name: 'possessió' } },
    ], desc: '{A}+1d6+3 per la resta del combat.', icon: 'lorc/daemon-skull.svg' }),
    action({ id: 'sang-encesa', name: 'Sang encesa', skillId: 'goblin-shaman', unlock: 2, type: ActionType.Focus, speed: -4, effects: [
      { type: 'weapon_buff', params: { amount: 2, target: 'allies', turns: -1, name: 'sang-encesa' } },
      { type: 'dot', params: { damage: 2, target: 'allies', turns: -1, name: 'sagnia' } },
    ], desc: 'Tots els aliats: {A}+2 la resta del combat, però perden 2 PV cada torn.', icon: 'skoll/blood.svg' }),
    action({ id: 'pluja-de-flames', name: 'Pluja de flames', skillId: 'goblin-shaman', unlock: 1, type: ActionType.Atac, speed: -4, dice: d(1, 6), targetCount: 3, desc: 'Afecta a 3 enemics que triïs.', icon: 'lorc/flame-spin.svg' }),
    action({
      id: 'maledicció-de-sang', name: 'Maledicció de sang', skillId: 'goblin-shaman',
      unlock: 5, type: ActionType.Focus, speed: -2,
      effects: [{ type: 'blood_curse', params: { amount: 2 } }],
      desc: 'Tria un enemic: mentre duri el combat, cada ferida que rebi li fa 2 de dany de més.',
      icon: 'lorc/bleeding-eye.svg',
    }),
  ],
  effects: SHAMAN_EFFECTS,
};

export const GOBLIN_SHAMAN: EnemyDefinition = {
  id: 'goblin-shaman', displayName: 'Goblin Xaman', classCss: 'goblin-shaman', iconPath: ICON + 'delapouite/skull-staff.svg',
  /** ~18 kg — goblin stock, older and leaner. */
  bulk: 0.64,
  skills: [GOBLIN_SHAMAN_SKILL],
};
