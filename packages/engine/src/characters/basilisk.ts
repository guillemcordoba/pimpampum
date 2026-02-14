import { Card, CardType } from '../card.js';
import { DiceRoll } from '../dice.js';
import type { CharacterTemplate } from '../character.js';

export const BASILISK_TEMPLATE: CharacterTemplate = {
  id: 'basilisk',
  displayName: 'Basilisc',
  classCss: 'basilisc',
  iconPath: 'icons/000000/transparent/1x1/delapouite/spiked-dragon-head.svg',
  category: 'enemy',
  baseStrength: 7,
  baseMagic: 3,
  baseDefense: 8,
  baseSpeed: 1,
  baseMaxWounds: 8,
  cardIcons: {
    'Mossegada verinosa': 'icons/000000/transparent/1x1/lorc/snake-bite.svg',
    'Cop de cua': 'icons/000000/transparent/1x1/lorc/spiked-tail.svg',
    'Esclafament': 'icons/000000/transparent/1x1/lorc/stoned-skull.svg',
    'Mirada petrificant': 'icons/000000/transparent/1x1/lorc/gaze.svg',
    'Escames impenetrables': 'icons/000000/transparent/1x1/lorc/lizardman.svg',
    'Regeneració': 'icons/000000/transparent/1x1/lorc/snake.svg',
  },
  createCards: () => [
    new Card('Mossegada verinosa', CardType.PhysicalAttack)
      .withPhysicalAttack(new DiceRoll(1, 8))
      .withSpeedMod(0)
      .withEffect({ type: 'VenomBite' })
      .withDescription("Si fa ferida, l'enemic rep una ferida addicional el començament del següent torn."),
    new Card('Cop de cua', CardType.PhysicalAttack)
      .withPhysicalAttack(new DiceRoll(1, 8))
      .withSpeedMod(2)
      .withEffect({ type: 'MultiTarget', count: 3 })
      .withDescription('Colpeja fins a 3 enemics amb la cua.'),
    new Card('Esclafament', CardType.PhysicalAttack)
      .withPhysicalAttack(new DiceRoll(2, 6))
      .withSpeedMod(-3)
      .withEffect({ type: 'SkipNextTurn' })
      .withDescription("L'atac més brutal. Saltes el proper torn."),
    new Card('Mirada petrificant', CardType.Focus)
      .withSpeedMod(-2)
      .withEffect({ type: 'PetrifyingGaze', dice: new DiceRoll(1, 6), threshold: 3, turns: 3 })
      .withDescription('Cada enemic tira 1d6. Els que treuen 3 o menys queden petrificats: atordits i salten els 3 propers torns.'),
    new Card('Escames impenetrables', CardType.Defense)
      .withDefense(new DiceRoll(1, 8))
      .withSpeedMod(4),
    new Card('Regeneració', CardType.Focus)
      .withSpeedMod(-4)
      .withEffect({ type: 'Regenerate', amount: 2 })
      .withDescription('Cura 2 ferides.'),
  ],
};
