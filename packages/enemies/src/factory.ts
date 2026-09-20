import { Character, ActionDefinition, EquipmentDefinition, EquipmentSlot, createCharacter } from '@pimpampum/engine';
import { getEquipment, COP_DESESPERAT } from '@pimpampum/skills';
import { EnemyDefinition, fullKitLevel } from './types.js';
import { getEnemy, unlockedEnemyActions } from './catalog.js';

export interface EnemySpec {
  /** PV this body stands up with. Required: a creature has no printed PV —
   *  the encounter decides, exactly as it does for a player. */
  pv: number;
  /** Kit ordinal (actions known). Defaults to the creature's full kit. */
  level?: number;
  /** Display name; defaults to the creature's own. */
  name?: string;
  /** Extra gear on top of what the creature already carries. */
  equipment?: string[];
  /**
   * Card ids to leave OUT of this body's hand — the leave-one-out ablation
   * (`simulator/bench`). The creature keeps its skill LEVELS, and therefore its
   * roll bonus; it simply never holds these cards.
   *
   * Here rather than in the simulator because a hand is built here, once, and a
   * second builder that "also makes a body but without card X" is exactly the
   * kind of parallel path that drifts. Cop desesperat is never removable: every
   * combatant always holds it, which is a rule and not part of any kit.
   */
  without?: string[];
}

/** Instantiate one body of a creature. */
export function createEnemyFrom(def: EnemyDefinition, spec: EnemySpec): Character {
  const level = spec.level ?? fullKitLevel(def);
  const skills: Record<string, number> = {};
  const actions: ActionDefinition[] = [];
  for (const skill of def.skills) {
    skills[skill.id] = level;
    actions.push(...unlockedEnemyActions(skill.id, level));
  }
  const kit = spec.without?.length ? actions.filter(a => !spec.without!.includes(a.id)) : actions;
  // Every combatant always holds the universal desperation card.
  kit.push(COP_DESESPERAT);
  const equipment = [...(def.equipment ?? []), ...(spec.equipment ?? [])]
    .map(getEquipment)
    .filter((e): e is EquipmentDefinition => !!e);
  if (def.naturalArmor) {
    equipment.push({
      id: `${def.id}-armadura-natural`,
      name: 'Armadura natural',
      slot: EquipmentSlot.Armor,
      passiveArmor: def.naturalArmor,
      speedPenalty: 0,
      rollBonuses: [],
      iconPath: '',
      description: `Armadura natural ${def.naturalArmor}.`,
    });
  }
  const c = createCharacter({
    name: spec.name ?? def.displayName,
    classCss: def.classCss,
    iconPath: def.iconPath,
    pv: spec.pv,
    skills,
    actions: kit,
    equipment,
    category: 'enemy',
  });
  c.aiControlled = true;
  return c;
}

/** Convenience: build a body by creature id. */
export function createEnemy(id: string, spec: EnemySpec): Character | undefined {
  const def = getEnemy(id);
  return def ? createEnemyFrom(def, spec) : undefined;
}
