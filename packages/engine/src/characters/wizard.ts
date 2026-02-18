import { Card, CardType } from '../card.js';
import { DiceRoll } from '../dice.js';
import { ModifierDuration } from '../modifier.js';
import type { CharacterTemplate } from '../character.js';

export const WIZARD_TEMPLATE: CharacterTemplate = {
  id: 'wizard',
  displayName: 'Mag',
  classCss: 'mag',
  iconPath: 'icons/000000/transparent/1x1/lorc/wizard-staff.svg',
  category: 'player',
  baseStrength: 0,
  baseMagic: 5,
  baseDefense: 1,
  baseSpeed: 2,
  baseLives: 3,
  cardIcons: {
    'Pantalla protectora': 'icons/000000/transparent/1x1/lorc/magic-shield.svg',
    'Bola de foc': 'icons/000000/transparent/1x1/lorc/fireball.svg',
    'Raig de gel': 'icons/000000/transparent/1x1/lorc/ice-bolt.svg',
    'Trampa de gel': 'icons/000000/transparent/1x1/lorc/frozen-block.svg',
    'Cadena de llamps': 'icons/000000/transparent/1x1/lorc/lightning-helix.svg',
    'Camp de distorsió': 'icons/000000/transparent/1x1/lorc/psychic-waves.svg',
  },
  createCards: () => [
    new Card('Pantalla protectora', CardType.Defense)
      .withDefense(new DiceRoll(1, 8))
      .withSpeedMod(2)
      .withEffect({ type: 'DefendMultiple', count: 2 })
      .withDescription('Defensa a 2 jugadors que triïs.'),
    new Card('Bola de foc', CardType.MagicAttack)
      .withMagicAttack(new DiceRoll(1, 6))
      .withSpeedMod(0),
    new Card('Raig de gel', CardType.MagicAttack)
      .withMagicAttack(new DiceRoll(1, 4))
      .withSpeedMod(0)
      .withEffect({ type: 'CharacteristicModifier', modifiers: [{ characteristic: 'speed', amount: -2 }], target: 'enemy', duration: ModifierDuration.NextTurn })
      .withDescription('El jugador atacat té {V}-2 el següent torn.'),
    new Card('Trampa de gel', CardType.Focus)
      .withSpeedMod(-3)
      .withEffect({ type: 'CharacteristicModifier', modifiers: [{ characteristic: 'speed', amount: -8 }], target: 'enemies', duration: ModifierDuration.NextTwoTurns })
      .withDescription('Tots els enemics reben {V}-8 els dos pròxims torns.'),
    new Card('Cadena de llamps', CardType.MagicAttack)
      .withMagicAttack(new DiceRoll(1, 4, -1))
      .withSpeedMod(-1)
      .withEffect({ type: 'MultiTarget', count: 2 })
      .withDescription('Afecta a 2 enemics que triïs.'),
    new Card('Camp de distorsió', CardType.Focus)
      .withSpeedMod(-5)
      .withEffect({ type: 'CharacteristicModifier', modifiers: [{ characteristic: 'speed', amount: 4 }], target: 'team', duration: ModifierDuration.RestOfCombat })
      .withDescription('Tots els jugadors aliats reben {V}+4 per la resta del combat.'),
  ],
};
