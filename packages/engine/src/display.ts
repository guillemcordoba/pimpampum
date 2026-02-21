import { CardType } from './card.js';

/** Catalan display names for card types */
export const CARD_TYPE_DISPLAY_NAMES: Record<CardType, string> = {
  [CardType.PhysicalAttack]: 'Atac físic',
  [CardType.MagicAttack]: 'Atac màgic',
  [CardType.Defense]: 'Defensa',
  [CardType.Focus]: 'Focus',
  [CardType.PhysicalDefense]: 'Defensa física',
};

/** CSS class names for card types */
export const CARD_TYPE_CSS: Record<CardType, string> = {
  [CardType.PhysicalAttack]: 'atac-fisic',
  [CardType.MagicAttack]: 'atac-magic',
  [CardType.Defense]: 'defensa',
  [CardType.Focus]: 'focus',
  [CardType.PhysicalDefense]: 'defensa',
};

/** Icon paths for stat types */
export const STAT_ICONS = {
  lives: 'icons/000000/transparent/1x1/lorc/heart-drop.svg',
  strength: 'icons/000000/transparent/1x1/lorc/crossed-swords.svg',
  magic: 'icons/000000/transparent/1x1/lorc/crystal-wand.svg',
  defense: 'icons/000000/transparent/1x1/willdabeast/round-shield.svg',
  speed: 'icons/000000/transparent/1x1/darkzaitzev/running-ninja.svg',
} as const;

/** Catalan display names for stats */
export const STAT_DISPLAY_NAMES = {
  lives: 'PV',
  strength: 'Força',
  magic: 'Màgia',
  defense: 'Defensa',
  speed: 'Velocitat',
} as const;

/** Structured rules summary content for the rules card */
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
      'Tria una carta i posa-la bocaterrosa',
      'Revela totes les cartes alhora',
      'Resol per ordre de Velocitat total',
    ],
  },
  {
    title: 'Atac (físic o màgic)',
    type: 'text',
    text: "Tria un enemic. Si la teva Força total o Màgia total supera la seva Defensa total, perd una vida. Si el personatge es queda sense vides, és derrotat. Es recupera si se li cura una vida.",
  },
  {
    title: 'Defensa',
    type: 'text',
    text: "Tria un aliat. Tots els atacs que rebi l'aliat triat durant aquest torn els rebràs tu.",
  },
  {
    title: 'Focus',
    type: 'text',
    text: "Efecte especial. Si reps un atac abans de que es resolgui, es cancel·la.",
  },
];
