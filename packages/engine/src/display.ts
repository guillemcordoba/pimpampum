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
  pv: 'icons/000000/transparent/1x1/skoll/hearts.svg',
  speed: 'icons/000000/transparent/1x1/darkzaitzev/running-ninja.svg',
  attack: 'icons/000000/transparent/1x1/lorc/crossed-swords.svg',
  damage: 'icons/000000/transparent/1x1/lorc/broken-heart.svg',
  armor: 'icons/000000/transparent/1x1/delapouite/abdominal-armor.svg',
  defense: 'icons/000000/transparent/1x1/willdabeast/round-shield.svg',
  focus:'icons/000000/transparent/1x1/lorc/concentration-orb.svg',
  fatigue: 'icons/000000/transparent/1x1/delapouite/lungs.svg',
  charge: 'icons/000000/transparent/1x1/lorc/unlit-bomb.svg',
  pressure: 'icons/000000/transparent/1x1/delapouite/smoking-volcano.svg',
} as const;

export const STAT_DISPLAY_NAMES = {
  pv: 'PV',
  speed: 'Velocitat',
  damage: 'Dany',
  armor: 'Armadura',
  defense: 'Defensa',
  fatigue: 'Fatiga',
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
    text: "Dany = tirada d'atac − tirada de defensa (si el personatge atacat es defensa).",
  },
  {
    title: 'Defensa',
    icon: STAT_ICONS.defense,
    type: 'text',
    text: "Tria: defensar un aliat, redirigint tots els atacs cap a ell a tu, o bloquejar un atacant, fent que només et pugui atacar a tu.",
  },
  {
    title: 'Focus',
    icon: STAT_ICONS.focus,
    type: 'text',
    text: "Efecte especial. Es cancel·la si reps dany abans.",
  },
  {
    title: 'Fatiga',
    icon: STAT_ICONS.fatigue,
    type: 'text',
    text: "Comences el dia amb 0 fatiga. Cada acció que juguis suma 1 {FATIGA} a la teva fatiga (per defecte). Pots acumular un màxim de 20 de fatiga en un dia.",
  },
];
