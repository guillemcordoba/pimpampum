import { ActionType, EffectHandler, StatusBehavior } from '@pimpampum/engine';
import { SkillDefinition, action, d, ICON_PREFIX } from '../types.js';
import { num, tspec, resolveTargets, targetReq } from '../effects/helpers.js';

/**
 * Nigromant — a doom-mark curse-caster. Marca de la perdició condemns a foe
 * (`condemnat`: disadvantage on all rolls, −3 speed, reapable — via generic
 * `rollMode` / `speedMod` status data); Mà de la tomba reaps every doomed
 * enemy through armour and defenses; Putrefacció is a contagious decay (its
 * spread is the `putrefaccio` status behaviour below); Xuclar la vida drains
 * to self-heal; Invocar l'ombra de l'infern condemns the whole enemy party.
 * Its one guard, Sudari de tomba, condemns whatever it turns away, so even
 * defending feeds the reaping. No pets — a Power-corner attrition controller.
 */
// The doom mark: every roll at disadvantage, 3 slower.
const CONDEMNAT: StatusBehavior = {
  rollMode() { return 'disadvantage'; },
  modifySpeed() { return -3; },
  /** Disadvantage on every roll plus −3 speed is a real handicap, and one the
   *  evaluator could not see at all: neither moves PV, bodies or fatigue. A
   *  third of a body, and no more — the marked still act, they just act
   *  worse. */
  positionValue() { return -0.3; },
};

// Contagious decay: ticks `value` PV each round. Each round, every living
// member of the holder's team who has never been infected rolls a d20 and
// catches a fresh infection on < 5 — once infected, a character can never
// catch it again (tracked per combat in `everInfected`). Only the first
// living infected member runs the contagion phase, so it happens once per
// team per round.
const everInfected = new WeakSet<object>();

const PUTREFACCIO: StatusBehavior = {
  /** Rot is damage already dealt, it simply has not landed yet. Priced as the
   *  ticks still to come, against the holder's own health — the same unit the
   *  PV term uses — so the search stops treating a poisoned enemy as healthy. */
  positionValue(ref) {
    const ticks = ref.entry.remaining < 0 ? 3 : Math.min(4, ref.entry.remaining);
    return -(ref.entry.value * ticks) / Math.max(1, ref.holder.maxPV);
  },
  onRoundEnd(ctx) {
    const { engine, holder, entry } = ctx;
    if (holder.isAlive() && entry.value > 0) {
      engine.log('poison', `${holder.name} pateix ${entry.value} de dany (putrefacció).`, holder.team);
      engine.applyPvLoss(holder, entry.value, undefined);
    }
    const living = engine.livingTeam(engine.teamOf(holder));
    const infected = living.filter(c => c.hasStatus('putrefaccio'));
    if (infected.length === 0 || infected[0] !== holder) return;

    const turns = (entry.data?.['turns'] as number) ?? entry.remaining;
    for (const victim of living) {
      if (everInfected.has(victim) || victim.hasStatus('putrefaccio')) continue;
      if (engine.rollDie(20) >= 5) continue; // catches it on a d20 < 5
      everInfected.add(victim);
      victim.setStatus('putrefaccio', entry.value, turns, { dot: entry.value, turns }, PUTREFACCIO);
      engine.log('poison', `La putrefacció s'estén a ${victim.name}.`, victim.team);
    }
  },
};

const NIGROMANT_EFFECTS: Record<string, EffectHandler> = {
  // Apply the doom mark to the targets (Marca de la perdició: 1 / Invocar
  // l'ombra de l'infern: all enemies). `turns` defaults to 3.
  condemn: {
    onResolve(ctx) {
      const turns = num(ctx.params, 'turns', 3);
      for (const t of resolveTargets(ctx, tspec(ctx.params, 'enemy'))) {
        t.setStatus('condemnat', 1, turns, undefined, CONDEMNAT);
      }
    },
    getTargetRequirement(p) { return targetReq(tspec(p, 'enemy')); },
    aiWeight(ctx) {
      // Worth more when there are undoomed enemies left to mark.
      const undoomed = ctx.enemies.filter(e => !e.hasStatus('condemnat')).length;
      return undoomed > 0 ? 1.5 : 0.1;
    },
  },

  // Sudari de tomba: the shroud is the kit's only guard, and it feeds the kit's
  // engine — whatever it turns away is marked for the reaping.
  condemn_on_block: {
    onDefend(ctx) {
      if (!ctx.target) return;
      ctx.target.setStatus('condemnat', 1, num(ctx.params, 'turns', 2), undefined, CONDEMNAT);
      ctx.engine.log('defense', `El sudari toca ${ctx.target.name}: queda condemnat.`, ctx.source.team);
    },
    aiWeight(ctx) {
      // Worth more while there are foes still undoomed to catch on it.
      return ctx.enemies.some(e => !e.hasStatus('condemnat')) ? 0.8 : 0.3;
    },
  },

  // Mà de la tomba: a reap that only strikes the doomed, ignoring armour and
  // defenses. Non-doomed targets are skipped entirely.
  reap: {
    modifyAttack(ctx) {
      if (!ctx.attackMods || !ctx.target) return;
      if (!ctx.target.hasStatus('condemnat')) { ctx.attackMods.skip = true; return; }
      ctx.attackMods.ignoreArmor = true;
      ctx.attackMods.ignoreDefense = true;
    },
    getTargetRequirement(p) { return targetReq(tspec(p, 'enemy')); },
    aiWeight(ctx) {
      const doomed = ctx.enemies.filter(e => e.hasStatus('condemnat')).length;
      return doomed > 0 ? 2 + doomed * 1.5 : -10; // useless without doomed foes
    },
  },

  // Putrefacció: a contagious decay. Ticks `damage`/turn (armour-ignored);
  // spread to never-infected teammates — see the PUTREFACCIO behaviour above.
  plague: {
    onResolve(ctx) {
      const dmg = num(ctx.params, 'damage', 3);
      const turns = num(ctx.params, 'turns', 3);
      for (const t of resolveTargets(ctx, tspec(ctx.params, 'enemy'))) {
        everInfected.add(t);
        t.setStatus('putrefaccio', dmg, turns, { dot: dmg, turns }, PUTREFACCIO);
      }
    },
    getTargetRequirement(p) { return targetReq(tspec(p, 'enemy')); },
    aiWeight(ctx) {
      const clean = ctx.enemies.filter(e => !e.hasStatus('putrefaccio')).length;
      return clean > 0 ? 1.3 : 0.2;
    },
  },
};

export const NIGROMANT: SkillDefinition = {
  id: 'nigromant', displayName: 'Nigromant', classCss: 'nigromant', category: 'player',
  description: 'Llançador de malediccions: condemna els enemics, els podreix i els xucla la vida.',
  iconPath: ICON_PREFIX + 'lorc/grim-reaper.svg',
  actions: [
    action({
      id: 'marca-de-la-perdicio', name: 'Marca de la perdició', skillId: 'nigromant',
      unlock: 2, type: ActionType.Focus, speed: 1,
      effects: [{ type: 'condemn', params: { turns: 2 } }],
      desc: 'Condemna un enemic (2 torns): tira amb desavantatge i té −3 de velocitat.',
      icon: 'lorc/cursed-star.svg',
    }),
    action({
      id: 'ma-de-la-tomba', name: 'Mà de la tomba', skillId: 'nigromant',
      unlock: 3, type: ActionType.Atac, speed: 1, dice: d(1, 6), targetCount: 99,
      effects: [{ type: 'reap', params: {} }],
      desc: 'Afecta tots els enemics condemnats. Ignora defenses i armadura.',
      icon: 'lorc/evil-hand.svg',
    }),
    action({
      id: 'sudari-de-tomba', name: 'Sudari de tomba', skillId: 'nigromant',
      unlock: 4, type: ActionType.Defensa, speed: 2, dice: d(3, 6),
      effects: [{ type: 'condemn_on_block', params: { turns: 1 } }],
      desc: "Si bloqueges un atac, l'atacant queda condemnat (1 torn).",
      icon: 'lorc/haunting.svg',
    }),
    action({
      id: 'putrefaccio', name: 'Putrefacció', skillId: 'nigromant',
      unlock: 5, type: ActionType.Focus, speed: -1,
      effects: [{ type: 'plague', params: { damage: 2, turns: 3 } }],
      desc: "L'objectiu perd 2 PV al final de cada torn durant 3 torns. Cada torn, cada enemic que no hagi estat infectat, d20 < 5: queda infectat.",
      icon: 'lorc/virus.svg',
    }),
    action({
      id: 'xuclar-la-vida', name: 'Xuclar la vida', skillId: 'nigromant',
      // LEVEL 1, and 2d6 rather than 1d6.
      //
      // The kit used to open on Marca de la perdicio — a Focus that only
      // marks — so a level-1 necromancer could not attack AT ALL. It measured
      // -25.7pp against a neutral kit, the worst opening level in the game,
      // and every other kit opens on a real attack. Draining the living is
      // also the most basic thing a necromancer does; mark-and-reap is the
      // cleverer trick and now sits at 2-3, still adjacent so the combo is
      // still learnt in one step. 1d6 was the weakest workhorse in the game
      // (peers run 2d4-2d6 at the same job).
      unlock: 1, type: ActionType.Atac, speed: 0, dice: d(2, 6),
      effects: [{ type: 'lifedrain', params: { ratio: 1 } }],
      desc: 'Recuperes tants PV com el mal infligit.',
      icon: 'lorc/life-tap.svg',
    }),
    action({
      id: 'invocar-ombra-infern', name: "Invocar l'ombra de l'infern", skillId: 'nigromant',
      unlock: 6, type: ActionType.Focus, speed: -5, targetCount: 99,
      effects: [{ type: 'condemn', params: { turns: 2 } }],
      desc: 'Condemna tots els enemics (2 torns): tiren amb desavantatge i tenen −3 de velocitat.',
      icon: 'lorc/tentacles-skull.svg',
    }),
  ],
  effects: NIGROMANT_EFFECTS,
};
