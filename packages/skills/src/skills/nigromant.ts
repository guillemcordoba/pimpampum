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
 * No pets, no defense — a Power-corner attrition controller.
 */
// The doom mark: every d20 at disadvantage, 3 slower.
const CONDEMNAT: StatusBehavior = {
  rollMode() { return 'disadvantage'; },
  modifySpeed() { return -3; },
};

// Contagious decay: ticks `value` PV each round and may jump to one more
// uninfected member of the holder's team — on a d20 < 10, once per infected
// team per round (only the first living infected member runs the check).
const PUTREFACCIO: StatusBehavior = {
  onRoundEnd(ctx) {
    const { engine, holder, entry } = ctx;
    if (holder.isAlive() && entry.value > 0) {
      engine.log('poison', `${holder.name} pateix ${entry.value} de dany (putrefacció).`, holder.team);
      engine.applyPvLoss(holder, entry.value, undefined);
    }
    const living = engine.livingTeam(engine.teamOf(holder));
    const infected = living.filter(c => c.hasStatus('putrefaccio'));
    if (infected.length === 0 || infected[0] !== holder) return;
    const clean = living.filter(c => !c.hasStatus('putrefaccio'));
    if (clean.length === 0) return;
    if (engine.rollD20() >= 10) return; // contagion spreads on a d20 < 10

    const turns = (entry.data?.['turns'] as number) ?? entry.remaining;
    const victim = clean.sort((a, b) => a.currentPV - b.currentPV)[0];
    victim.setStatus('putrefaccio', entry.value, turns, { dot: entry.value, turns }, PUTREFACCIO);
    engine.log('poison', `La putrefacció s'estén a ${victim.name}.`, victim.team);
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

  // Profecia de la fi: cancel one enemy's still-pending (slower) action.
  cancel_action: {
    onResolve(ctx) {
      for (const t of resolveTargets(ctx, tspec(ctx.params, 'enemy'))) {
        const ok = ctx.engine.cancelPendingAction(t);
        ctx.engine.log('focus', ok
          ? `${ctx.source.name} preveu i cancel·la l'acció de ${t.name}.`
          : `${ctx.source.name} no arriba a temps de cancel·lar ${t.name}.`, ctx.source.team);
      }
    },
    getTargetRequirement(p) { return targetReq(tspec(p, 'enemy')); },
    aiWeight() { return 1.4; },
  },

  // Putrefacció: a contagious decay. Ticks `damage`/turn (armour-ignored) and
  // spreads +1 enemy/round — see the PUTREFACCIO behaviour above.
  plague: {
    onResolve(ctx) {
      const dmg = num(ctx.params, 'damage', 3);
      const turns = num(ctx.params, 'turns', 3);
      for (const t of resolveTargets(ctx, tspec(ctx.params, 'enemy'))) {
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
      unlock: 1, type: ActionType.Focus, speed: 1,
      effects: [{ type: 'condemn', params: { turns: 2 } }],
      desc: 'Condemna un enemic (2 torns): tira amb desavantatge i té −3 de velocitat.',
      icon: 'lorc/cursed-star.svg',
    }),
    action({
      id: 'ma-de-la-tomba', name: 'Mà de la tomba', skillId: 'nigromant',
      unlock: 12, type: ActionType.Atac, speed: 1, damage: d(1, 4), targetCount: 99,
      effects: [{ type: 'reap', params: {} }],
      desc: 'Afecta tots els enemics condemnats. Ignora defenses i armadura.',
      icon: 'lorc/evil-hand.svg',
    }),
    action({
      id: 'profecia-de-la-fi', name: 'Profecia de la fi', skillId: 'nigromant',
      unlock: 25, type: ActionType.Focus, speed: 2,
      effects: [{ type: 'cancel_action', params: {} }],
      desc: "Cancel·la l'acció d'un enemic.",
      icon: 'lorc/dead-eye.svg',
    }),
    action({
      id: 'putrefaccio', name: 'Putrefacció', skillId: 'nigromant',
      unlock: 40, type: ActionType.Focus, speed: -1,
      effects: [{ type: 'plague', params: { damage: 2, turns: 3 } }],
      desc: "L'objectiu perd 2 PV al final de cada torn durant 3 torns. Cada torn, d20 < 10: s'estén a un nou enemic.",
      icon: 'lorc/virus.svg',
    }),
    action({
      id: 'xuclar-la-vida', name: 'Xuclar la vida', skillId: 'nigromant',
      unlock: 55, type: ActionType.Atac, speed: 0, damage: d(1, 8),
      effects: [{ type: 'lifedrain', params: { ratio: 1 } }],
      desc: 'Recuperes tants PV com el mal infligit.',
      icon: 'lorc/life-tap.svg',
    }),
    action({
      id: 'invocar-ombra-infern', name: "Invocar l'ombra de l'infern", skillId: 'nigromant',
      unlock: 72, type: ActionType.Focus, speed: -5, fatigueCost: 3, targetCount: 99,
      effects: [{ type: 'condemn', params: { turns: 2 } }],
      desc: 'Condemna tots els enemics (2 torns): tiren amb desavantatge i tenen −3 de velocitat.',
      icon: 'lorc/tentacles-skull.svg',
    }),
  ],
  effects: NIGROMANT_EFFECTS,
};
