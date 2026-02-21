import { Card, CardType } from '../card.js';
import { DiceRoll } from '../dice.js';
import { ModifierDuration } from '../modifier.js';
import type { CharacterTemplate } from '../character.js';

export const CLERIC_TEMPLATE: CharacterTemplate = {
  id: 'cleric',
  displayName: 'Clergue',
  classCss: 'clergue',
  iconPath: 'icons/000000/transparent/1x1/lorc/holy-symbol.svg',
  category: 'player',
  baseStrength: 0,
  baseMagic: 3,
  baseDefense: 3,
  baseSpeed: 2,
  baseLives: 3,
  cardIcons: {
    'Toc de la mort': 'icons/000000/transparent/1x1/lorc/death-zone.svg',
    'Drenatge vital': 'icons/000000/transparent/1x1/lorc/bleeding-eye.svg',
    'Maledicció mortal': 'icons/000000/transparent/1x1/lorc/cursed-star.svg',
    'Mantell diví': 'icons/000000/transparent/1x1/lorc/shining-claw.svg',
    'Invocació espiritual': 'icons/000000/transparent/1x1/lorc/angel-wings.svg',
    'Curació': 'icons/000000/transparent/1x1/delapouite/healing.svg',
    'Benedicció': 'icons/000000/transparent/1x1/lorc/beams-aura.svg',
  },
  createCards: () => [
    new Card('Toc de la mort', CardType.MagicAttack)
      .withMagicAttack(new DiceRoll(1, 4))
      .withSpeedMod(0)
      .withEffect({ type: 'TouchOfDeath', strengthDebuff: 2, magicDebuff: 2 })
      .withDescription("El jugador atacat té {F}-2 i {M}-2 el següent torn."),
    new Card('Drenatge vital', CardType.MagicAttack)
      .withMagicAttack(new DiceRoll(1, 6))
      .withSpeedMod(-1)
      .withEffect({ type: 'LifeDrain' })
      .withDescription('Si fa mal, cura 1 vida.'),
    new Card('Maledicció mortal', CardType.Focus)
      .withSpeedMod(-3)
      .withEffect({ type: 'DeathCurse', dice: new DiceRoll(1, 4) })
      .withDescription("Tria un enemic. Tu i tots els aliats rebeu +1d4 atacant-lo per la resta del combat."),
    new Card('Mantell diví', CardType.Defense)
      .withDefense(new DiceRoll(1, 8))
      .withSpeedMod(2)
      .withEffect({ type: 'ShroudDebuff', amount: 2 })
      .withDescription("L'atacant rep {F}-2 el següent torn."),
    new Card('Invocació espiritual', CardType.Focus)
      .withSpeedMod(-4)
      .withEffect({ type: 'SpiritInvocation', dice: new DiceRoll(1, 6) })
      .withDescription('Tu i tots els aliats guanyeu {D}+1d6 per la resta del combat.'),
    new Card('Curació', CardType.Focus)
      .withSpeedMod(2)
      .withEffect({ type: 'HealAlly', amount: 2 })
      .withDescription('Tria un aliat. Cura 2 vides.'),
    new Card('Benedicció', CardType.Focus)
      .withSpeedMod(3)
      .withEffect({
        type: 'CharacteristicModifier',
        modifiers: [
          { characteristic: 'strength', amount: 2 },
          { characteristic: 'magic', amount: 2 },
        ],
        target: 'allies',
        duration: ModifierDuration.ThisTurn,
      })
      .withDescription("Tots els aliats reben {F}+2 i {M}+2 aquest torn."),
  ],
};
