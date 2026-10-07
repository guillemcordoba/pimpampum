import { ActionType, Character, StatusBehavior } from '@pimpampum/engine';
import { SkillDefinition, action, d } from '../../players/types.js';
import { EnemyDefinition, ICON } from '../types.js';

/**
 * The giant eel of the bay: a lone beast that punishes a party for huddling.
 * Its jet goes through a guard into everyone behind it, it dives and comes up
 * where no guard is raised, and it swallows a hero whole — spat out only when
 * the party hurts it hard in one round. Needs water in the scene.
 */
const SKILL_ID = 'unagi';

/** PV the unagi must lose in one round to spit out whoever it swallowed. */
const SPIT_THRESHOLD = 6;
/** PV a swallowed hero loses at each round end. */
const DIGEST = 2;

/** Next round, nothing the holder strikes can defend. */
const CAPBUSSADA: StatusBehavior = {
  onAttackAction(ctx) { return ctx.entry.remaining <= 1 ? { ignoreDefense: true } : undefined; },
  positionValue() { return 0.08; },
};

/** The eel's belly: how much it was hurt this round. */
const PANXA: StatusBehavior = {
  modifyIncomingDamage(ctx, damage) {
    const data = ctx.entry.data ?? {};
    if (data['round'] !== ctx.engine.round) { data['round'] = ctx.engine.round; data['hurt'] = 0; }
    data['hurt'] = (data['hurt'] as number) + Math.max(0, damage);
    ctx.entry.data = data;
    return damage;
  },
};

/** Swallowed: out of the fight and out of reach, digesting, until spat out. */
const ENGOLIT: StatusBehavior = {
  untargetable() { return true; },
  onRoundEnd(ctx) {
    const eel = ctx.entry.data?.['eel'];
    const belly = eel instanceof Character ? eel.getStatus('panxa') : undefined;
    const hurt = belly?.data?.['round'] === ctx.engine.round ? (belly.data?.['hurt'] as number) : 0;
    if (!(eel instanceof Character) || !eel.isAlive() || hurt >= SPIT_THRESHOLD) {
      ctx.holder.clearStatus(ctx.key);
      ctx.holder.skipTurns = 0;
      eel instanceof Character && eel.clearStatus('panxa-plena');
      ctx.engine.log('info', `L'unagi escup ${ctx.holder.name}.`, ctx.holder.team);
      return;
    }
    ctx.engine.applyPvLoss(ctx.holder, DIGEST, eel);
    if (ctx.holder.isAlive()) ctx.holder.skipTurns = Math.max(ctx.holder.skipTurns, 1);
    else { ctx.holder.clearStatus(ctx.key); eel.clearStatus('panxa-plena'); }
  },
  positionValue() { return -0.3; },
};

const UNAGI_SKILL: SkillDefinition = {
  id: SKILL_ID, displayName: 'Unagi', classCss: 'aigua', category: 'enemy',
  description: "Una anguila gegant que escup aigua com un canó i s'empassa el que cau a la badia.",
  iconPath: ICON + 'lorc/sea-serpent.svg',
  actions: [
    action({
      id: 'cano-d-aigua', name: "Canó d'aigua", skillId: SKILL_ID,
      unlock: 1, type: ActionType.Atac, speed: 1, dice: d(3, 6),
      effects: [{ type: 'hits_defenders' }],
      desc: "Afecta també tots els qui defensen l'objectiu.",
      icon: 'lorc/water-bolt.svg',
    }),
    action({
      id: 'capbussada', name: 'Capbussada', skillId: SKILL_ID,
      unlock: 2, type: ActionType.Defensa, speed: 3, dice: d(4, 6),
      effects: [{ type: 'dive' }],
      desc: 'El torn següent, els seus atacs no es poden defensar.',
      icon: 'delapouite/wave-surfer.svg',
    }),
    action({
      id: 'onada-de-cua', name: 'Onada de cua', skillId: SKILL_ID,
      unlock: 3, type: ActionType.Atac, speed: 0, dice: d(3, 6), targetCount: 99,
      desc: 'Afecta tots els herois.',
      icon: 'lorc/big-wave.svg',
    }),
    action({
      id: 'engolir', name: 'Engolir', skillId: SKILL_ID,
      unlock: 4, type: ActionType.Atac, speed: -1, dice: d(4, 6),
      effects: [{ type: 'swallow' }],
      desc: `Si fereix, s'empassa l'objectiu (un alhora): no pot actuar ni ser atacat, perd ${DIGEST} PV al final de cada torn, i surt quan l'unagi perd ${SPIT_THRESHOLD} PV en un torn o cau.`,
      icon: 'delapouite/fish-monster.svg',
    }),
  ],
  effects: {
    dive: {
      onResolve(ctx) { ctx.source.setStatus('capbussada', 1, 2, undefined, CAPBUSSADA); },
      aiWeight() { return 0.4; },
    },
    swallow: {
      onCombatStart(ctx) { ctx.source.setStatus('panxa', 0, -1, { round: 0, hurt: 0 }, PANXA); },
      onAttackHit(ctx) {
        const t = ctx.target;
        if (!t || !t.isAlive() || (ctx.damageDealt ?? 0) <= 0 || ctx.source.hasStatus('panxa-plena')) return;
        ctx.engine.cancelPendingAction(t);
        t.setStatus('engolit', 1, -1, { eel: ctx.source, harm: 1 }, ENGOLIT);
        t.skipTurns = Math.max(t.skipTurns, 1);
        ctx.source.setStatus('panxa-plena', 1, -1);
        ctx.engine.log('attack', `L'unagi s'empassa ${t.name}!`, ctx.source.team);
      },
      aiWeight(ctx) { return ctx.actor.hasStatus('panxa-plena') ? -0.5 : 1; },
    },
  },
};

export const UNAGI: EnemyDefinition = {
  id: SKILL_ID, displayName: 'Unagi', classCss: 'aigua', iconPath: ICON + 'lorc/sea-serpent.svg',
  /** ~10 t of eel. */
  bulk: 5.2,
  skills: [UNAGI_SKILL],
};
