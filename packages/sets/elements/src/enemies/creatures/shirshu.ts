import { ActionType, Character, EffectContext, StatusBehavior, random } from '@pimpampum/engine';
import { SkillDefinition, action, d } from '../../players/types.js';
import { EnemyDefinition, ICON } from '../types.js';

/**
 * The eyeless tracker, a grizzly-sized beast with a star of feelers for a
 * nose. It takes away ACTIONS: its tongue and its slobber paralyse, its nose
 * finds one hero through any escort, and blinded it lashes at everyone, its
 * own side included. Never a lock: a hero who already has to lose an action
 * is not paralysed again.
 */
const SKILL_ID = 'shirshu';

/** Hunted by scent: shirshus strike the holder through any escort. */
const RASTRE: StatusBehavior = {
  excludesAllyGuards(_ref, attacker) { return attacker.skills.has(SKILL_ID); },
  positionValue() { return -0.08; },
};

/** Blind frenzy: this round every lash of the holder goes at a random
 *  combatant, friend or foe. */
const CEGUES: StatusBehavior = {
  redirectAttackTarget(ctx, intended) {
    const everyone = [...ctx.engine.livingTeam(0), ...ctx.engine.livingTeam(1)].filter(c => c !== ctx.holder);
    return everyone.length ? everyone[Math.floor(random() * everyone.length)] : intended;
  },
};

/** Paralyse `t` for `turns` actions — unless it already has to lose one. */
function paralyse(ctx: EffectContext, t: Character | undefined, turns: number): void {
  if (!t || !t.isAlive() || t.skipTurns > 0) return;
  t.skipTurns += turns;
  ctx.engine.log('attack', `${t.name} queda paralitzat: perd ${turns === 1 ? 'la seva acció següent' : `les ${turns} accions següents`}.`, ctx.source.team);
}

const SHIRSHU_SKILL: SkillDefinition = {
  id: SKILL_ID, displayName: 'Shirshu', classCss: 'shirshu', category: 'enemy',
  description: 'Cec, i no perd mai un rastre. Un toc de la llengua i el mestre queda estès, rígid.',
  iconPath: ICON + 'caro-asercion/mole.svg',
  actions: [
    action({
      id: 'llengua-paralitzant', name: 'Llengua paralitzant', skillId: SKILL_ID,
      unlock: 1, type: ActionType.Atac, fast: true, dice: d(2, 6),
      effects: [{ type: 'paralysing_tongue' }],
      desc: "Si fereix, l'objectiu perd la seva acció següent (les 2 següents si li treu 5 PV o més). No afecta qui ja ha de perdre una acció.",
      icon: 'delapouite/tongue.svg',
    }),
    action({
      id: 'bava-paralitzant', name: 'Bava paralitzant', skillId: SKILL_ID,
      unlock: 2, type: ActionType.Defensa, dice: d(3, 6),
      effects: [{ type: 'paralysing_slobber' }],
      desc: "Si aguanta, l'atacant perd la seva acció següent. No afecta qui ja ha de perdre una acció.",
      icon: 'lorc/dripping-goo.svg',
    }),
    action({
      id: 'rastre-d-olor', name: "Rastre d'olor", skillId: SKILL_ID,
      unlock: 3, type: ActionType.Focus,
      effects: [{ type: 'scent_track' }],
      desc: 'Tria un heroi: la resta del combat, ningú no el pot defensar dels shirshus.',
      icon: 'delapouite/sniffing-dog.svg',
    }),
    action({
      id: 'llengotades-a-cegues', name: 'Llengotades a cegues', skillId: SKILL_ID,
      unlock: 4, type: ActionType.Atac, dice: d(3, 6), targetCount: 3, rollPerTarget: true,
      effects: [{ type: 'blind_lashes' }],
      desc: "Tres cops, cadascun contra un combatent a l'atzar. Els que fereix perden la seva acció següent. No afecta qui ja ha de perdre una acció.",
      icon: 'lorc/whiplash.svg',
    }),
  ],
  effects: {
    paralysing_tongue: {
      onAttackHit(ctx) {
        const dmg = ctx.damageDealt ?? 0;
        if (dmg > 0) paralyse(ctx, ctx.target, dmg >= 5 ? 2 : 1);
      },
      aiWeight() { return 0.8; },
    },
    paralysing_slobber: {
      onDefend(ctx) { paralyse(ctx, ctx.target, 1); },
      aiWeight() { return 0.5; },
    },
    scent_track: {
      getTargetRequirement() { return 'enemy'; },
      onResolve(ctx) {
        const t = ctx.targets[0];
        if (!t || !t.isAlive()) return;
        t.setStatus('rastre-d-olor', 1, -1, { harm: 1 }, RASTRE);
        ctx.engine.log('focus', `${ctx.source.name} té el rastre de ${t.name}.`, ctx.source.team);
      },
      aiWeight(ctx) { return ctx.enemies.some(e => !e.hasStatus('rastre-d-olor')) ? 0.7 : -1; },
    },
    blind_lashes: {
      onPlay(ctx) { ctx.source.setStatus('a-cegues', 1, 1, undefined, CEGUES); },
      onAttackHit(ctx) { if ((ctx.damageDealt ?? 0) > 0) paralyse(ctx, ctx.target, 1); },
      aiWeight() { return 0.6; },
    },
  },
};

export const SHIRSHU: EnemyDefinition = {
  id: SKILL_ID, displayName: 'Shirshu', classCss: 'shirshu', iconPath: ICON + 'caro-asercion/mole.svg',
  /** ~400 kg, grizzly-sized. */
  bulk: 1.8,
  skills: [SHIRSHU_SKILL],
};
