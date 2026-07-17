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
  attack: 'icons/000000/transparent/1x1/lorc/crossed-swords.svg',
  damage: 'icons/000000/transparent/1x1/lorc/broken-heart.svg',
  armor: 'icons/000000/transparent/1x1/delapouite/abdominal-armor.svg',
  defense: 'icons/000000/transparent/1x1/willdabeast/round-shield.svg',
  focus:'icons/000000/transparent/1x1/lorc/concentration-orb.svg',
  fatigue: 'icons/000000/transparent/1x1/lorc/sleepy.svg',
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
    text: "Tria un objectiu i tira els daus d'atac. Si es defensa, el dany és el marge (atac − defensa); si empata o perd, la defensa aguanta. Sense defensa, el dany és la tirada sencera. Resta l'armadura passiva (mínim 0) i el resultat es perd de PV.",
  },
  {
    title: 'Defensa',
    icon: STAT_ICONS.defense,
    type: 'text',
    text: "Tria un aliat (defensar) o un enemic (bloquejar). Sempre et defenses a tu mateix: tires els daus de defensa contra cada atac que t'arribi. Defensar: els atacs a l'aliat es resolen contra tu; si penetren, el dany el reps tu. Bloquejar: els enemics bloquejats fan totes les seves tirades d'atac contra el defensor (els atacs que no trien objectiu no en són afectats).",
  },
  {
    title: 'Focus',
    icon: STAT_ICONS.focus,
    type: 'text',
    text: "Efecte especial. Es cancel·la si reps un atac sense defensa abans.",
  },
  {
    title: 'Pujar de nivell',
    type: 'text',
    text: "Després de cada tirada enfrontada, el perdedor puja un nivell si ha perdut per 2 o menys, i aprèn la següent acció de l'habilitat. El nivell d'una habilitat és el nombre d'accions que en coneixes.",
  },
  {
    title: 'Fatiga',
    icon: STAT_ICONS.fatigue,
    type: 'text',
    text: "Cada acció suma la seva {FATIGA} (1 per defecte; les esgotadores més). Màxim 15 al dia: no pots jugar una carta que el superaria. Dormir una nit neteja tota la {FATIGA}. Si ningú no pot jugar cap acció, guanya qui conserva més fracció dels seus PV.",
  },
];
