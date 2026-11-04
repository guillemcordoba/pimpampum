/**
 * VANILLA KITS — the structure of the game with no real card in it: the
 * tuning process's third layer (the user, 2026-11-04: settle the layers top
 * down). At a level: one attack and one defense on that level's ladder dice,
 * and an Aim — a slow Focus after which your next attack adds the ladder dice
 * again, a Focus worth a doubled blow. Fights between them measure what the
 * ladder, PV and the defense premium alone make of a fight; real kits are then
 * read against them.
 */
import { ActionType, DiceRoll, type ActionDefinition, type EffectHandler, type StatusBehavior } from '@pimpampum/engine';
import { actionPrint, type SubjectKit } from '@pimpampum/bench';
import type { LadderRung } from './feasibility.js';

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
