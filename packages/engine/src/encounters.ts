export interface EncounterEnemyGroup {
  templateId: string;
  count: number;
}

export interface EncounterDefinition {
  id: string;
  name: string;
  difficulty: 'tutorial' | 'normal' | 'hard';
  compositions: Record<number, EncounterEnemyGroup[]>;
}

export const ALL_ENCOUNTERS: EncounterDefinition[] = [
  {
    id: 'wolf-pack',
    name: 'Manada de llops',
    difficulty: 'tutorial',
    compositions: {
      3: [{ templateId: 'wolf', count: 2 }],
      4: [{ templateId: 'wolf', count: 3 }],
      5: [{ templateId: 'wolf', count: 3 }],
      6: [{ templateId: 'wolf', count: 4 }],
    },
  },
  {
    id: 'goblin-horde',
    name: 'Horda goblin',
    difficulty: 'normal',
    compositions: {
      3: [{ templateId: 'goblin', count: 6 }, { templateId: 'goblin-shaman', count: 1 }],
      4: [{ templateId: 'goblin', count: 7 }, { templateId: 'goblin-shaman', count: 1 }],
      5: [{ templateId: 'goblin', count: 8 }, { templateId: 'goblin-shaman', count: 1 }],
      6: [{ templateId: 'goblin', count: 10 }, { templateId: 'goblin-shaman', count: 1 }],
    },
  },
  {
    id: 'basilisk',
    name: 'Basilisc',
    difficulty: 'hard',
    compositions: {
      3: [{ templateId: 'basilisk', count: 1 }],
      4: [{ templateId: 'basilisk', count: 1 }],
      5: [{ templateId: 'basilisk', count: 1 }],
      6: [{ templateId: 'basilisk', count: 1 }],
    },
  },
  {
    id: 'devil-encounter',
    name: 'Trobada diabòlica',
    difficulty: 'normal',
    compositions: {
      3: [{ templateId: 'spined-devil', count: 2 }, { templateId: 'bone-devil', count: 1 }],
      4: [{ templateId: 'spined-devil', count: 3 }, { templateId: 'bone-devil', count: 1 }],
      5: [{ templateId: 'spined-devil', count: 4 }, { templateId: 'bone-devil', count: 1 }],
      6: [{ templateId: 'spined-devil', count: 5 }, { templateId: 'bone-devil', count: 1 }],
    },
  },
  {
    id: 'stone-golem',
    name: 'Gòlem de pedra',
    difficulty: 'normal',
    compositions: {
      3: [{ templateId: 'golem-de-pedra', count: 1 }],
      4: [{ templateId: 'golem-de-pedra', count: 2 }],
      5: [{ templateId: 'golem-de-pedra', count: 2 }],
      6: [{ templateId: 'golem-de-pedra', count: 3 }],
    },
  },
  {
    id: 'horned-devil',
    name: 'Diable banyut',
    difficulty: 'hard',
    compositions: {
      3: [{ templateId: 'horned-devil', count: 2 }],
      4: [{ templateId: 'horned-devil', count: 2 }],
      5: [{ templateId: 'horned-devil', count: 2 }],
      6: [{ templateId: 'horned-devil', count: 3 }],
    },
  },
];
