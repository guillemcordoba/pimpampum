import { Card, CardType } from '../card.js';
import { DiceRoll } from '../dice.js';
import type { CharacterTemplate } from '../character.js';

export const WOLF_TEMPLATE: CharacterTemplate = {
  id: 'wolf',
  displayName: 'Llop',
  classCss: 'llop',
  iconPath: 'icons/000000/transparent/1x1/lorc/wolf-head.svg',
  category: 'enemy',
  baseStrength: 2,
  baseMagic: 0,
  baseDefense: 0,
  baseSpeed: 5,
  baseLives: 1,
  cardIcons: {
    'Mossegada de la manada': 'icons/000000/transparent/1x1/delapouite/neck-bite.svg',
    'Urpa ràpida': 'icons/000000/transparent/1x1/delapouite/claws.svg',
    'Protegir la manada': 'icons/000000/transparent/1x1/lorc/paw-front.svg',
    'Udol': 'icons/000000/transparent/1x1/lorc/wolf-howl.svg',
  },
  createCards: () => [
    new Card('Mossegada de la manada', CardType.PhysicalAttack)
      .withPhysicalAttack(new DiceRoll(1, 4))
      .withSpeedMod(1)
      .withEffect({ type: 'PackTactics', alliesPerBonus: 4 })
      .withDescription("Guanyes +1 a l'atac per cada 4 aliats vius."),
    new Card('Urpa ràpida', CardType.PhysicalAttack)
      .withPhysicalAttack(new DiceRoll(1, 4, -1))
      .withSpeedMod(3),
    new Card('Protegir la manada', CardType.Defense)
      .withDefense(new DiceRoll(1, 4))
      .withSpeedMod(1),
    new Card('Udol', CardType.Focus)
      .withSpeedMod(-2)
      .withEffect({ type: 'SummonAlly', templateId: 'wolf' })
      .withDescription("Crida un llop nou al combat. S'interromp si rep un atac."),
  ],
};
