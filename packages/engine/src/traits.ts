// =============================================================================
// TRAITS (TRETS) — Out-of-combat resolution tags
// =============================================================================

export interface TraitDefinition {
  id: string;
  displayName: string;
  description: string;
  iconPath: string;
  domain: 'physical' | 'mental' | 'social' | 'supernatural';
}

export interface RaceDefinition {
  id: string;
  displayName: string;
  description: string;
  iconPath: string;
  traitIds: string[];
}

// ---------------------------------------------------------------------------
// All 18 traits
// ---------------------------------------------------------------------------

export const ALL_TRAITS: TraitDefinition[] = [
  {
    id: 'intimidant',
    displayName: 'Intimidant',
    description: 'Imposes respecte o por amb la teva presència',
    iconPath: 'icons/000000/transparent/1x1/lorc/shouting.svg',
    domain: 'social',
  },
  {
    id: 'sigilos',
    displayName: 'Sigilós',
    description: 'Et mous sense fer soroll i passes desapercebut',
    iconPath: 'icons/000000/transparent/1x1/lorc/hidden.svg',
    domain: 'physical',
  },
  {
    id: 'persuasiu',
    displayName: 'Persuasiu',
    description: 'Convenços els altres amb paraules o encant',
    iconPath: 'icons/000000/transparent/1x1/lorc/conversation.svg',
    domain: 'social',
  },
  {
    id: 'perceptiu',
    displayName: 'Perceptiu',
    description: 'Notes detalls que els altres passen per alt',
    iconPath: 'icons/000000/transparent/1x1/lorc/awareness.svg',
    domain: 'mental',
  },
  {
    id: 'erudit',
    displayName: 'Erudit',
    description: "Tens coneixements amplis d'història i el món",
    iconPath: 'icons/000000/transparent/1x1/lorc/open-book.svg',
    domain: 'mental',
  },
  {
    id: 'atletic',
    displayName: 'Atlètic',
    description: 'Ets fort, ràpid i capaç de proeses físiques',
    iconPath: 'icons/000000/transparent/1x1/lorc/muscle-up.svg',
    domain: 'physical',
  },
  {
    id: 'agil',
    displayName: 'Àgil',
    description: 'Tens reflexos ràpids i equilibri excepcional',
    iconPath: 'icons/000000/transparent/1x1/lorc/sprint.svg',
    domain: 'physical',
  },
  {
    id: 'devot',
    displayName: 'Devot',
    description: 'La teva fe et guia i et connecta amb forces divines',
    iconPath: 'icons/000000/transparent/1x1/lorc/prayer.svg',
    domain: 'supernatural',
  },
  {
    id: 'arcanista',
    displayName: 'Arcanista',
    description: 'Comprens els misteris de la màgia i els seus usos',
    iconPath: 'icons/000000/transparent/1x1/lorc/crystal-ball.svg',
    domain: 'supernatural',
  },
  {
    id: 'naturalista',
    displayName: 'Naturalista',
    description: 'Coneixes els secrets de la natura i els animals',
    iconPath: 'icons/000000/transparent/1x1/lorc/curled-leaf.svg',
    domain: 'mental',
  },
  {
    id: 'curador',
    displayName: 'Curador',
    description: 'Saps tractar ferides i malalties',
    iconPath: 'icons/000000/transparent/1x1/delapouite/healing.svg',
    domain: 'supernatural',
  },
  {
    id: 'resistent',
    displayName: 'Resistent',
    description: 'Aguantes el dolor, la fatiga i les adversitats',
    iconPath: 'icons/000000/transparent/1x1/lorc/armor-vest.svg',
    domain: 'physical',
  },
  {
    id: 'diplomatic',
    displayName: 'Diplomàtic',
    description: 'Medies en conflictes i trobes solucions pacífiques',
    iconPath: 'icons/000000/transparent/1x1/delapouite/shaking-hands.svg',
    domain: 'social',
  },
  {
    id: 'enginyos',
    displayName: 'Enginyós',
    description: 'Trobes solucions creatives als problemes',
    iconPath: 'icons/000000/transparent/1x1/lorc/brainstorm.svg',
    domain: 'mental',
  },
  {
    id: 'artista',
    displayName: 'Artista',
    description: "Tens talent per la música, l'art o l'espectacle",
    iconPath: 'icons/000000/transparent/1x1/lorc/lyre.svg',
    domain: 'social',
  },
  {
    id: 'sagac',
    displayName: 'Sagaç',
    description: 'Detectes mentides, intencions ocultes i enganys',
    iconPath: 'icons/000000/transparent/1x1/lorc/third-eye.svg',
    domain: 'mental',
  },
  {
    id: 'salvatge',
    displayName: 'Salvatge',
    description: 'Sobrevius en la natura i et mous pel terreny salvatge',
    iconPath: 'icons/000000/transparent/1x1/lorc/campfire.svg',
    domain: 'physical',
  },
  {
    id: 'temeros',
    displayName: 'Temerós',
    description: 'Inspires por sobrenatural o inquietud en els altres',
    iconPath: 'icons/000000/transparent/1x1/lorc/imp.svg',
    domain: 'supernatural',
  },
];

// ---------------------------------------------------------------------------
// Class → trait mapping (keyed by CharacterTemplate.id)
// ---------------------------------------------------------------------------

export const CLASS_TRAITS: Record<string, string[]> = {
  fighter:    ['atletic', 'resistent'],
  rogue:      ['sigilos', 'agil'],
  wizard:     ['erudit', 'arcanista'],
  barbarian:  ['intimidant', 'salvatge'],
  cleric:     ['devot', 'curador'],
  monk:       ['agil', 'perceptiu'],
  bard:       ['persuasiu', 'artista'],
  warlock:    ['arcanista', 'temeros'],
  paladin:    ['devot', 'intimidant'],
  druid:      ['naturalista', 'curador'],
};

// ---------------------------------------------------------------------------
// 9 core PHB races
// ---------------------------------------------------------------------------

export const ALL_RACES: RaceDefinition[] = [
  {
    id: 'human',
    displayName: 'Humà',
    description: 'Versàtils i ambiciosos, els humans s\'adapten a qualsevol situació.',
    iconPath: 'icons/000000/transparent/1x1/delapouite/person.svg',
    traitIds: ['persuasiu', 'enginyos'],
  },
  {
    id: 'elf',
    displayName: 'Elf',
    description: 'Éssers longeus amb una connexió profunda amb la màgia i la natura.',
    iconPath: 'icons/000000/transparent/1x1/delapouite/elf-ear.svg',
    traitIds: ['perceptiu', 'arcanista'],
  },
  {
    id: 'dwarf',
    displayName: 'Nan',
    description: 'Forts i tossuts, els nans són mestres artesans i guerrers resilients.',
    iconPath: 'icons/000000/transparent/1x1/delapouite/dwarf-face.svg',
    traitIds: ['resistent', 'erudit'],
  },
  {
    id: 'halfling',
    displayName: 'Mitjà',
    description: 'Petits i àgils, els mitjans passen desapercebuts i tenen una sort innata.',
    iconPath: 'icons/000000/transparent/1x1/lorc/clover.svg',
    traitIds: ['sigilos', 'agil'],
  },
  {
    id: 'half-orc',
    displayName: 'Mig orc',
    description: 'Poderosos i intimidants, combinen la força orca amb la voluntat humana.',
    iconPath: 'icons/000000/transparent/1x1/delapouite/orc-head.svg',
    traitIds: ['intimidant', 'salvatge'],
  },
  {
    id: 'half-elf',
    displayName: 'Mig elf',
    description: 'Amb un peu en dos mons, els mig elfs són diplomàtics naturals.',
    iconPath: 'icons/000000/transparent/1x1/delapouite/woman-elf-face.svg',
    traitIds: ['persuasiu', 'perceptiu'],
  },
  {
    id: 'gnome',
    displayName: 'Gnom',
    description: 'Curiosos i enginyosos, els gnoms viuen per descobrir i inventar.',
    iconPath: 'icons/000000/transparent/1x1/delapouite/wizard-face.svg',
    traitIds: ['enginyos', 'arcanista'],
  },
  {
    id: 'tiefling',
    displayName: 'Tiefling',
    description: 'Amb sang infernal, els tieflings inspiren tant temor com fascinació.',
    iconPath: 'icons/000000/transparent/1x1/lorc/imp.svg',
    traitIds: ['temeros', 'arcanista'],
  },
  {
    id: 'dragonborn',
    displayName: 'Dracònic',
    description: 'Descendents de dracs, combinen força, honor i un alè devastador.',
    iconPath: 'icons/000000/transparent/1x1/lorc/dragon-head.svg',
    traitIds: ['intimidant', 'atletic'],
  },
];

// ---------------------------------------------------------------------------
// Out-of-combat rules explanation
// ---------------------------------------------------------------------------

export const OUT_OF_COMBAT_RULES = {
  title: 'Resolució fora de combat',
  paragraphs: [
    'Quan un personatge intenta una acció fora de combat (convèncer un guarda, escalar un mur, desxifrar un encanteri...), el Director de Joc (DJ) decideix la dificultat i el jugador tira daus.',
    'El nombre de daus depèn de quants <strong>trets</strong> s\'apliquen a l\'acció:',
  ],
  table: [
    { traits: '0 trets', dice: '2d20, queda\'t el pitjor', label: 'Desavantatge' },
    { traits: '1 tret', dice: '1d20', label: 'Normal' },
    { traits: '2 trets', dice: '2d20, queda\'t el millor', label: 'Avantatge' },
    { traits: '3 trets', dice: '3d20, queda\'t el millor', label: 'Gran avantatge' },
    { traits: '4 trets', dice: '4d20, queda\'t el millor', label: 'Avantatge màxim' },
  ],
  footer: 'El jugador ha d\'explicar com cada tret s\'aplica a la situació. El DJ decideix si l\'argument és vàlid. Els trets provenen de la <strong>classe</strong> i de la <strong>raça</strong> del personatge.',
};

// ---------------------------------------------------------------------------
// Helper functions
// ---------------------------------------------------------------------------

const traitIndex = new Map(ALL_TRAITS.map(t => [t.id, t]));

export function getTraitById(id: string): TraitDefinition | undefined {
  return traitIndex.get(id);
}

export function getTraitsForClass(classId: string): TraitDefinition[] {
  const ids = CLASS_TRAITS[classId];
  if (!ids) return [];
  return ids.map(id => traitIndex.get(id)).filter((t): t is TraitDefinition => t !== undefined);
}

export function getTraitsForRace(raceId: string): TraitDefinition[] {
  const race = ALL_RACES.find(r => r.id === raceId);
  if (!race) return [];
  return race.traitIds.map(id => traitIndex.get(id)).filter((t): t is TraitDefinition => t !== undefined);
}
