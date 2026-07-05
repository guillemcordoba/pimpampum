import { ActionType } from './types.js';

/** Catalan display names for action types. */
export const ACTION_TYPE_DISPLAY_NAMES: Record<ActionType, string> = {
  [ActionType.Atac]: 'Atac',
  [ActionType.Defensa]: 'Defensa',
  [ActionType.Focus]: 'Focus',
};

/** CSS class names for action types (reuses existing card header palette). */
export const ACTION_TYPE_CSS: Record<ActionType, string> = {
  [ActionType.Atac]: 'atac-fisic',
  [ActionType.Defensa]: 'defensa',
  [ActionType.Focus]: 'focus',
};

/** Icon paths for the per-action stat row and character sheets. */
export const STAT_ICONS = {
  pv: 'icons/000000/transparent/1x1/lorc/heart-drop.svg',
  speed: 'icons/000000/transparent/1x1/darkzaitzev/running-ninja.svg',
  damage: 'icons/000000/transparent/1x1/lorc/broken-heart.svg',
  armor: 'icons/000000/transparent/1x1/delapouite/abdominal-armor.svg',
  defense: 'icons/000000/transparent/1x1/willdabeast/round-shield.svg',
  focus:'icons/000000/transparent/1x1/lorc/concentration-orb.svg',
  fatigue: 'icons/000000/transparent/1x1/lorc/sleepy.svg',
  charge: 'icons/000000/transparent/1x1/lorc/unlit-bomb.svg',
  pressure: 'icons/000000/transparent/1x1/delapouite/smoking-volcano.svg',
  size: 'icons/000000/transparent/1x1/delapouite/body-height.svg',
} as const;

export const STAT_DISPLAY_NAMES = {
  pv: 'PV',
  speed: 'Velocitat',
  damage: 'Dany',
  armor: 'Armadura',
  defense: 'Defensa',
  fatigue: 'Fatiga',
  size: 'Mida',
} as const;

/** Equipment slot Catalan labels. */
export const SLOT_LABELS: Record<string, string> = {
  Torso: 'Tors',
  Head: 'Cap',
  Arms: 'Braços',
  Legs: 'Cames',
  MainHand: 'Mà principal',
  OffHand: 'Mà secundària',
};

export interface RulesSection {
  title: string;
  /** Optional icon shown next to the title (raw path, no BASE_URL prefix). */
  icon?: string;
  type: 'ordered-list' | 'text';
  items?: string[];
  text?: string;
}

export const RULES_SUMMARY: RulesSection[] = [
  {
    title: 'Ronda de combat',
    type: 'ordered-list',
    items: [
      'Tria una acció i posa-la bocaterrosa',
      'Revela totes les accions alhora',
      'Resol per ordre de velocitat',
    ],
  },
  {
    title: 'Atac',
    icon: 'icons/000000/transparent/1x1/lorc/crossed-swords.svg',
    type: 'text',
    text: "Ataca un enemic. Si impacta, tira els daus de dany, resta-li l'armadura del defensor, i resta el resultat dels seus PV.",
  },
  {
    title: 'Defensa',
    icon: STAT_ICONS.defense,
    type: 'text',
    text: "Protegeix un aliat. Cada atac contra ell o contra tu tira d20 + nivell contra el teu d20 + nivell; si guanya, el dany el reps tu.",
  },
  {
    title: 'Focus',
    icon: STAT_ICONS.focus,
    type: 'text',
    text: "Efecte especial. Es cancel·la si reps un atac abans.",
  },
  {
    title: 'Pujar de nivell',
    type: 'text',
    text: "Cada tirada d'habilitat que falli per menys de 10 fa pujar l'habilitat un nivell.",
  },
  {
    title: 'Fatiga',
    icon: STAT_ICONS.fatigue,
    type: 'text',
    text: "Cada acció afegeix la seva {FATIGA} a la teva {FATIGA} actual (per defecte 1). Descansar permet recuperar {FATIGA}. Resta a les tirades d'habilitat: <br>0-5 {FATIGA}: 0 | 6{FATIGA}: -5 | 7{FATIGA}: -10 | 8{FATIGA}: -20 | 9{FATIGA}: -40 | 10{FATIGA}: -80",
  },
];
