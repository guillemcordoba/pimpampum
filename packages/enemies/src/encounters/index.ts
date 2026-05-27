/** One enemy group within an encounter composition. */
export interface EncounterEnemyGroup {
  templateId: string;
  count: number;
  /** Optional per-skill level overrides for this group's enemies. */
  level?: number;
}

/** A predefined encounter, with compositions scaled by player count. */
export interface EncounterDefinition {
  id: string;
  name: string;
  difficulty: 'easy' | 'medium' | 'hard' | 'boss';
  description: string;
  /** Compositions keyed by number of players (3..6). */
  compositions: Record<number, EncounterEnemyGroup[]>;
}

/** Build a composition that scales a base group count with the player count. */
function scaled(templateId: string, base: number, perPlayer: number, level?: number): Record<number, EncounterEnemyGroup[]> {
  const out: Record<number, EncounterEnemyGroup[]> = {};
  for (let p = 3; p <= 6; p++) out[p] = [{ templateId, count: base + Math.round((p - 3) * perPlayer), level }];
  return out;
}

export const ALL_ENCOUNTERS: EncounterDefinition[] = [
  {
    id: 'horda-de-goblins', name: 'Horda de goblins', difficulty: 'easy',
    description: 'Una colla nombrosa de goblins febles.',
    compositions: scaled('goblin', 5, 2),
  },
  {
    id: 'patrulla-goblin', name: 'Patrulla goblin', difficulty: 'medium',
    description: 'Goblins liderats per un xaman.',
    compositions: {
      3: [{ templateId: 'goblin', count: 3 }, { templateId: 'goblin-shaman', count: 1 }],
      4: [{ templateId: 'goblin', count: 4 }, { templateId: 'goblin-shaman', count: 1 }],
      5: [{ templateId: 'goblin', count: 5 }, { templateId: 'goblin-shaman', count: 1 }],
      6: [{ templateId: 'goblin', count: 6 }, { templateId: 'goblin-shaman', count: 2 }],
    },
  },
  {
    id: 'manada-de-llops', name: 'Manada de llops', difficulty: 'easy',
    description: 'Una manada de llops que caça en grup.',
    compositions: scaled('wolf', 4, 1.5),
  },
  {
    id: 'incursio-diabolica', name: 'Incursió diabòlica', difficulty: 'hard',
    description: "Diables espinosos i un diable d'os al capdavant.",
    compositions: {
      3: [{ templateId: 'spined-devil', count: 2 }, { templateId: 'bone-devil', count: 1 }],
      4: [{ templateId: 'spined-devil', count: 3 }, { templateId: 'bone-devil', count: 1 }],
      5: [{ templateId: 'spined-devil', count: 3 }, { templateId: 'bone-devil', count: 2 }],
      6: [{ templateId: 'spined-devil', count: 4 }, { templateId: 'bone-devil', count: 2 }],
    },
  },
  {
    id: 'guardia-de-pedra', name: 'Guàrdia de pedra', difficulty: 'hard',
    description: 'Gòlems de pedra implacables.',
    compositions: scaled('stone-golem', 1, 0.7),
  },
  {
    id: 'senyor-banyut', name: 'El senyor banyut', difficulty: 'boss',
    description: 'Un diable banyut amb els seus servents.',
    compositions: {
      3: [{ templateId: 'horned-devil', count: 1 }, { templateId: 'spined-devil', count: 1 }],
      4: [{ templateId: 'horned-devil', count: 1 }, { templateId: 'spined-devil', count: 2 }],
      5: [{ templateId: 'horned-devil', count: 1 }, { templateId: 'spined-devil', count: 3 }],
      6: [{ templateId: 'horned-devil', count: 2 }, { templateId: 'spined-devil', count: 3 }],
    },
  },
  {
    id: 'el-basilisc', name: 'El basilisc', difficulty: 'boss',
    description: 'Una bèstia colossal amb mirada petrificant.',
    compositions: scaled('basilisk', 1, 0),
  },
];

const encounterIndex = new Map(ALL_ENCOUNTERS.map(e => [e.id, e]));
export function getEncounter(id: string): EncounterDefinition | undefined {
  return encounterIndex.get(id);
}
