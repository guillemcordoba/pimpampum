import { ActionDefinition, TargetRequirement, isAttack, isDefenseAction } from './types.js';
import { EffectRegistry } from './effects.js';

/** Runtime instance of an action in a character's hand. */
export class ActionInstance {
  /** Set once a consumable action has been used. */
  public consumed = false;

  constructor(public readonly def: ActionDefinition) {}

  get id(): string { return this.def.id; }
  get name(): string { return this.def.name; }
  get speed(): number { return this.def.speed; }

  /** Available to play this round (consumables become unavailable once used). */
  isAvailable(): boolean {
    return !(this.def.isConsumable && this.consumed);
  }
}

/**
 * What the player must target for an action. Attacks target an enemy; defenses
 * make the dual choice (an ally to guard — self allowed — or an enemy to
 * block); focus actions delegate to their effect handlers' getTargetRequirement.
 */
export function getActionTargetRequirement(def: ActionDefinition, registry: EffectRegistry): TargetRequirement {
  if (isAttack(def.actionType)) return 'enemy';
  if (isDefenseAction(def.actionType)) return 'defense';
  for (const eff of def.effects) {
    const req = registry.getHandler(eff.type)?.getTargetRequirement?.(eff.params ?? {});
    if (req && req !== 'none') return req;
  }
  return 'none';
}

/** How many targets the action selects (multi-attack / multi-defend). */
export function getActionTargetCount(def: ActionDefinition): number {
  return def.targetCount ?? 1;
}
