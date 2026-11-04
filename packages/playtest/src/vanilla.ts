/**
 * VANILLA KITS — the structure of the game with no real card in it: the
 * tuning process's third layer (the user, 2026-11-04: settle the layers top
 * down). At a level: one attack and one defense on that level's ladder dice,
 * and an Aim — a slow Focus after which your next attack adds the ladder dice
 * again, a Focus worth a doubled blow. Fights between them measure what the
 * ladder, PV and the defense premium alone make of a fight; real kits are then
 * read against them.
 */
import { ActionType, applyKind, DiceRoll, type ActionDefinition, type EffectHandler, type StatusBehavior } from '@pimpampum/engine';
import { actionPrint, kitsDynamics, theSet, type SubjectKit } from '@pimpampum/bench';
import { summarise, type DynamicsSummary } from './dynamics.js';
import { installSet, type RunContext } from './prepare.js';
import type { CensusCard } from './census.js';
import type { LadderRung } from './feasibility.js';
import { diceStep } from './tune.js';
import { withControlKit } from './control-kits.js';

const AIMED_KEY = 'vanilla-aimed';

export function vanillaKit(level: number, rung: LadderRung, aim = 1): SubjectKit {
  const id = `vanilla-${level}-${aim}`;
  const extra = new DiceRoll(rung.attack.numDice * aim, rung.attack.sides, rung.attack.modifier * aim);
  /** Aimed: the holder's next attack adds the dice. Priced as that blow's mean
   *  share of a body, the currency the evaluator reads. */
  const AIMED: StatusBehavior = { positionValue: ref => (rung.attack.average() * aim) / Math.max(1, ref.holder.maxPV) };
  const effects: Record<string, EffectHandler> = {
    [`${id}-aim`]: { onResolve(ctx) { ctx.source.setStatus(AIMED_KEY, 1, -1, undefined, AIMED); } },
    [`${id}-strike`]: {
      modifyAttack(ctx) {
        if (!ctx.source.hasStatus(AIMED_KEY) || !ctx.attackMods) return;
        ctx.attackMods.extraDamageDice.push(extra);
        ctx.source.clearStatus(AIMED_KEY);
      },
    },
  };
  const card = (n: number, name: string, actionType: ActionType, over: Partial<ActionDefinition>): ActionDefinition => ({
    id: `${id}-${n}`, name, skillId: id, unlockLevel: 1, actionType, effects: [], description: '', iconPath: '', ...over,
  } as ActionDefinition);
  return {
    id,
    actions: [
      card(1, 'Strike', ActionType.Atac, { dice: rung.attack, effects: [{ type: `${id}-strike` }] }),
      card(2, 'Guard', ActionType.Defensa, { dice: rung.defense }),
      card(3, 'Aim', ActionType.Focus, { effects: [{ type: `${id}-aim` }] }),
    ],
    effects,
  };
}

/** The kit's content, for the cache. */
export function vanillaPrint(kit: SubjectKit): string {
  return kit.actions.map(actionPrint).join('|');
}

// --- vanilla twins ----------------------------------------------------------------

/** The few numbers a twin's generic effects carry: what calibration may move. */
export interface TwinParams {
  /** A rider's burn: PV at each round's end, for `burnTurns` rounds. */
  burn: number; burnTurns: number;
  /** A payoff defense's riposte rolls the attack ladder this many levels lower. */
  riposteDrop: number;
  /** A damaging Focus rolls its level's attack dice plus this, through any guard. */
  blastBoost: number;
  /** A heal rolls its level's attack dice plus this. */
  healBoost: number;
  /** A hex keeps the chosen enemy from attacking for this many rounds. */
  hexTurns: number;
  /** A utility Focus (the Aim): the next attack adds its level's dice × this. */
  aim: number;
}

export const TWIN_DEFAULTS: TwinParams = { burn: 2, burnTurns: 2, riposteDrop: 2, blastBoost: 3, healBoost: 0, hexTurns: 1, aim: 1 };

/**
 * A REAL KIT'S VANILLA TWIN: the same roles at the same levels (the census),
 * each a generic card on the ladder's dice — so the vanilla set has the real
 * game's shape (when the damage comes in, who can get around a guard) without
 * any card's quirks.
 */
export function vanillaTwin(kit: string, cards: readonly CensusCard[], ladder: Readonly<Record<number, LadderRung>>, p: TwinParams = TWIN_DEFAULTS): SubjectKit {
  const id = `twin-${kit}`;
  const effects: Record<string, EffectHandler> = {};
  const actions: ActionDefinition[] = [];
  /** The Aims the twin's utility Focus set, spent by its next attack. */
  const aims: { key: string; extra: DiceRoll }[] = [];
  for (const c of cards.filter(x => x.kit === kit).sort((a, b) => a.unlock - b.unlock)) {
    const rung = ladder[Math.max(1, Math.min(10, c.unlock))];
    const own = `${id}-${c.unlock}`;
    const fx: { type: string; params?: Record<string, unknown> }[] = c.fatigue ? [{ type: 'fatigue_cost', params: { levels: c.fatigue } }] : [];
    const base = { id: own, name: `${c.role} ${c.unlock}`, skillId: id, unlockLevel: c.unlock, fast: c.fast, description: '', iconPath: '' };
    const lift = (d: DiceRoll, by: number) => new DiceRoll(d.numDice, d.sides, d.modifier + by);
    switch (c.role) {
      case 'attack':
        actions.push({ ...base, actionType: ActionType.Atac, dice: rung.attack, effects: fx } as ActionDefinition);
        break;
      case 'area':
        actions.push({ ...base, actionType: ActionType.Atac, dice: rung.attack, targetCount: 99, effects: fx } as ActionDefinition);
        break;
      case 'rider':
        effects[`${own}-burn`] = {
          onAttackHit(ctx) {
            if ((ctx.damageDealt ?? 0) > 0 && ctx.target?.isAlive()) applyKind(ctx.target, 'damageOverTime', `${own}-burn`, p.burn, p.burnTurns, { source: ctx.source, harm: 1 });
          },
        };
        actions.push({ ...base, actionType: ActionType.Atac, dice: diceStep(rung.attack, -1) ?? rung.attack, effects: [...fx, { type: `${own}-burn` }] } as ActionDefinition);
        break;
      case 'guard':
        actions.push({ ...base, actionType: ActionType.Defensa, dice: rung.defense, effects: fx } as ActionDefinition);
        break;
      case 'payoff': {
        const riposte = ladder[Math.max(1, c.unlock - p.riposteDrop)].attack;
        effects[`${own}-riposte`] = {
          onDefend(ctx) { if (ctx.target?.isAlive()) ctx.engine.performExtraAttack(ctx.source, ctx.target, riposte, { ignoreDefense: true, label: `${ctx.source.name} riposte` }); },
        };
        actions.push({ ...base, actionType: ActionType.Defensa, dice: rung.defense, effects: [...fx, { type: `${own}-riposte` }] } as ActionDefinition);
        break;
      }
      case 'blast':
        effects[`${own}-blast`] = {
          getTargetRequirement: () => 'enemy',
          onResolve(ctx) {
            const t = ctx.targets[0];
            if (!t?.isAlive() || !ctx.action.dice) return;
            ctx.engine.applyPvLoss(t, ctx.engine.contestRoll(ctx.source, ctx.action.dice, { kind: 'attack', skillId: id }).total, ctx.source);
          },
        };
        actions.push({ ...base, actionType: ActionType.Focus, dice: lift(rung.attack, p.blastBoost), effects: [...fx, { type: `${own}-blast` }] } as ActionDefinition);
        break;
      case 'heal':
        effects[`${own}-heal`] = {
          getTargetRequirement: () => 'ally',
          onResolve(ctx) {
            const t = ctx.targets.find(x => x.isAlive());
            if (t && ctx.action.dice) ctx.engine.heal(t, ctx.engine.rollDiceFor(ctx.source, ctx.action.dice));
          },
        };
        actions.push({ ...base, actionType: ActionType.Focus, dice: lift(rung.attack, p.healBoost), effects: [...fx, { type: `${own}-heal` }] } as ActionDefinition);
        break;
      case 'hex':
        effects[`${own}-hex`] = {
          getTargetRequirement: () => 'enemy',
          onResolve(ctx) {
            const t = ctx.targets[0];
            if (t?.isAlive()) applyKind(t, 'locked', `${own}-hex`, 1, p.hexTurns + 1, { types: [ActionType.Atac], harm: 1 });
          },
        };
        actions.push({ ...base, actionType: ActionType.Focus, effects: [...fx, { type: `${own}-hex` }] } as ActionDefinition);
        break;
      case 'boost': {
        const extra = new DiceRoll(rung.attack.numDice * p.aim, rung.attack.sides, rung.attack.modifier * p.aim);
        const key = `${own}-aimed`;
        const AIMED: StatusBehavior = { positionValue: ref => extra.average() / Math.max(1, ref.holder.maxPV) };
        effects[`${own}-aim`] = { onResolve(ctx) { ctx.source.setStatus(key, 1, -1, undefined, AIMED); } };
        actions.push({ ...base, actionType: ActionType.Focus, effects: [...fx, { type: `${own}-aim` }] } as ActionDefinition);
        aims.push({ key, extra });
        break;
      }
    }
  }
  // The Aims land on the twin's attacks, whichever they are.
  const spend: EffectHandler = {
    modifyAttack(ctx) {
      if (!ctx.attackMods) return;
      for (const a of aims) if (ctx.source.hasStatus(a.key)) { ctx.attackMods.extraDamageDice.push(a.extra); ctx.source.clearStatus(a.key); }
    },
  };
  effects[`${id}-spend`] = spend;
  for (const a of actions) if (a.actionType === ActionType.Atac) a.effects = [...a.effects, { type: `${id}-spend` }];
  return { id, actions, effects };
}

/** Several control kits at once, installed for the length of `fn`. */
export function withVanillaSet<T>(kits: readonly SubjectKit[], fn: () => T): T {
  const [first, ...rest] = kits;
  return first ? withControlKit(first, () => withVanillaSet(rest, fn)) : fn();
}

/** The vanilla set's dynamics at `levels`, in a child process (bench
 *  `isolated`): install the set, build the twins from the census and `p`, play.
 *  The ladder travels as notation. */
export async function twinDynamics(
  set: RunContext['set'], cards: readonly CensusCard[], ladder: Record<number, { attack: string; defense: string }>,
  p: TwinParams, levels: readonly number[], fights: number,
): Promise<Record<number, DynamicsSummary>> {
  await installSet(set);
  const rungs: Record<number, LadderRung> = Object.fromEntries(Object.entries(ladder).map(([l, r]) => [l, { attack: DiceRoll.parse(r.attack), defense: DiceRoll.parse(r.defense) }]));
  const twins = theSet().calibration.mainKits.map(k => vanillaTwin(k, cards, rungs, p));
  const print = `${twins.map(vanillaPrint).join('|')}#${JSON.stringify(p)}`;
  return withVanillaSet(twins, () => Object.fromEntries(levels.map(level =>
    [level, summarise(kitsDynamics(level, fights, {}, { kits: twins.map(t => t.id), print }))])));
}
