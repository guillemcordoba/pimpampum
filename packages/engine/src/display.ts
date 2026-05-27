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
  damage: 'icons/000000/transparent/1x1/lorc/crossed-swords.svg',
  armor: 'icons/000000/transparent/1x1/willdabeast/round-shield.svg',
  skill: 'icons/000000/transparent/1x1/lorc/skills.svg',
} as const;

export const STAT_DISPLAY_NAMES = {
  pv: 'PV',
  speed: 'Velocitat',
  damage: 'Dany',
  armor: 'Armadura',
  skill: 'Habilitat',
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
      'Resol per ordre de velocitat (més alta primer)',
    ],
  },
  {
    title: 'Atac',
    type: 'text',
    text: "Tira d20 + nivell d'habilitat. Si supera la defensa de l'objectiu (o si no en té), impactes: tira els daus de dany, resta l'armadura passiva i el resultat es resta dels PV.",
  },
  {
    title: 'Defensa',
    type: 'text',
    text: 'Tria un aliat a protegir. Cada atac que rebi ell o tu es resol contra la teva tirada de defensa. Si un atac penetra, el dany el reps tu.',
  },
  {
    title: 'Focus',
    type: 'text',
    text: "Efecte especial, normalment lent. Es cancel·la si reps un atac sense defensa abans que es resolgui.",
  },
  {
    title: 'Pujar de nivell',
    type: 'text',
    text: "Després de cada tirada: si falles per menys de 10 o encertes per menys de 5, l'habilitat puja un nivell.",
  },
];
