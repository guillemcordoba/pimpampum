import { createCharacter, Character, ActionDefinition, CharacterSize, EquipmentDefinition } from '@pimpampum/engine';
import { getAction, unlockedActions } from './catalog.js';
import { getEquipment } from './equipment/index.js';

/** Spec for building a character on the fly from skill ids and levels. */
export interface CharacterBuildSpec {
  name: string;
  classCss?: string;
  iconPath?: string;
  pv: number;
  /** Defaults to Mitjà; modifies PV and action speed. */
  size?: CharacterSize;
  /** skillId -> level. */
  skills: Record<string, number>;
  /** Explicit action ids; if omitted, all actions unlocked by the skill levels. */
  actions?: string[];
  /** Equipment ids. */
  equipment?: string[];
  category?: 'player' | 'enemy';
}

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
  const equipment = (spec.equipment ?? [])
    .map(getEquipment)
    .filter((e): e is EquipmentDefinition => !!e);

  return createCharacter({
    name: spec.name,
    classCss: spec.classCss ?? 'objecte',
    iconPath: spec.iconPath ?? '',
    pv: spec.pv,
    size: spec.size,
    skills: spec.skills,
    actions: actionDefs,
    equipment,
    category: spec.category ?? 'player',
  });
}

/** Total skill levels in a build spec (used for skill-sum balancing). */
export function buildSkillSum(spec: CharacterBuildSpec): number {
  return Object.values(spec.skills).reduce((s, v) => s + v, 0);
}
