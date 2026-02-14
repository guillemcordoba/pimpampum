import { Card, CardType } from '../card.js';
import { DiceRoll } from '../dice.js';
import type { CharacterTemplate } from '../character.js';

export const GOBLIN_TEMPLATE: CharacterTemplate = {
  id: 'goblin',
  displayName: 'Goblin',
  classCss: 'goblin',
  iconPath: 'icons/000000/transparent/1x1/delapouite/goblin-head.svg',
  category: 'enemy',
  baseStrength: 2,
  baseMagic: 0,
  baseDefense: 3,
  baseSpeed: 3,
  baseLives: 3,
  cardIcons: {
    'Fúria enfollida': 'icons/000000/transparent/1x1/delapouite/enrage.svg',
    'Maça de punxes': 'icons/000000/transparent/1x1/lorc/spiked-mace.svg',
    'Escut de fusta': 'icons/000000/transparent/1x1/willdabeast/round-shield.svg',
    'Venjança': 'icons/000000/transparent/1x1/lorc/fanged-skull.svg',
  },
  createCards: () => [
    new Card('Fúria enfollida', CardType.PhysicalAttack)
      .withPhysicalAttack(new DiceRoll(2, 6))
      .withSpeedMod(5)
      .withEffect({ type: 'SkipNextTurns', count: 1 })
      .withDescription('No jugues cap carta el següent torn.'),
    new Card('Maça de punxes', CardType.PhysicalAttack)
      .withPhysicalAttack(new DiceRoll(1, 6))
      .withSpeedMod(1),
    new Card('Escut de fusta', CardType.Defense)
      .withDefense(new DiceRoll(1, 8))
      .withSpeedMod(4),
    new Card('Venjança', CardType.Focus)
      .withSpeedMod(-3)
      .withEffect({ type: 'Vengeance' })
      .withDescription("Tria un jugador. Els jugadors que l'ataquin durant aquest combat reben un atac físic {F}+1d8."),
  ],
};
