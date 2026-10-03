import { Character, ActionDefinition, EquipmentDefinition, EquipmentSlot, createCharacter } from '@pimpampum/engine';
import type { FieldedGroup } from '@pimpampum/combat-balancer';
import { getEquipment } from '../players/equipment/index.js';
import { COP_DESESPERAT } from '../players/desperation.js';
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
  // Every combatant always holds the universal desperation card.
  actions.push(COP_DESESPERAT);
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
    actions,
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

/** Every body of a composition, numbered when a group has more than one. An
 *  unknown creature id contributes no bodies. */
export function buildComposition(groups: FieldedGroup[]): Character[] {
  return groups.flatMap(g => {
    const def = getEnemy(g.enemyId);
    if (!def) return [];
    return Array.from({ length: Math.max(0, g.count) }, (_, i) => {
      const name = g.count > 1 ? `${def.displayName} ${i + 1}` : def.displayName;
      return createEnemyFrom(def, { pv: g.pv, level: g.level, name });
    });
  });
}
