import { createCharacter, Character, ActionDefinition, EquipmentDefinition } from '@pimpampum/engine';
import { getAction, unlockedActions } from './catalog.js';
import { getEquipment } from './equipment/index.js';
import { getPotion } from './potions/index.js';
import { COP_DESESPERAT } from './desperation.js';

/** Declared once, beside the party spec that carries it (see `party.ts`). */
import type { CharacterBuildSpec } from '@pimpampum/bench/gameset';
export type { CharacterBuildSpec };

/** Build a Character from a spec, resolving action and equipment ids. */
export function buildCharacter(spec: CharacterBuildSpec): Character {
  let actionDefs: ActionDefinition[];
  if (spec.actions) {
    actionDefs = spec.actions.map(getAction).filter((a): a is ActionDefinition => !!a);
  } else {
    actionDefs = [];
    for (const [skillId, level] of Object.entries(spec.skills)) {
      actionDefs.push(...unlockedActions(skillId, level));
    }
  }
  for (const id of spec.potions ?? []) {
    const p = getPotion(id);
    if (p) actionDefs.push(p);
  }
  // Every character always holds the universal desperation card.
  actionDefs.push(COP_DESESPERAT);
  const equipment = (spec.equipment ?? [])
    .map(getEquipment)
    .filter((e): e is EquipmentDefinition => !!e);

  const c = createCharacter({
    name: spec.name,
    classCss: spec.classCss ?? 'objecte',
    iconPath: spec.iconPath ?? '',
    pv: spec.pv,
    skills: spec.skills,
    actions: actionDefs,
    equipment,
    category: spec.category ?? 'player',
  });
  if (spec.fatigue) c.setFatigue(spec.fatigue);
  return c;
}

