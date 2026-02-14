import { Card, CardType } from '../card.js';
import { DiceRoll } from '../dice.js';
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
  baseMaxWounds: 3,
  cardIcons: {
    'Toc de la mort': 'icons/000000/transparent/1x1/lorc/death-zone.svg',
    'Drenatge vital': 'icons/000000/transparent/1x1/lorc/bleeding-eye.svg',
    'Maledicció mortal': 'icons/000000/transparent/1x1/lorc/cursed-star.svg',
    'Sudari protector': 'icons/000000/transparent/1x1/lorc/shining-claw.svg',
    'Invocació espiritual': 'icons/000000/transparent/1x1/lorc/angel-wings.svg',
    'Càstig diví': 'icons/000000/transparent/1x1/lorc/holy-hand-grenade.svg',
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
      .withDescription('Si impacta, cura 1 ferida.'),
    new Card('Maledicció mortal', CardType.Focus)
      .withSpeedMod(-3)
      .withEffect({ type: 'DeathCurse', dice: new DiceRoll(1, 4) })
      .withDescription("Tria un enemic. Tu i tots els aliats rebeu +1d4 atacant-lo per la resta del combat."),
    new Card('Sudari protector', CardType.Defense)
      .withDefense(new DiceRoll(1, 8))
      .withSpeedMod(1)
      .withEffect({ type: 'ShroudDebuff', amount: 2 })
      .withDescription("L'atacant rep F-2 el següent torn."),
    new Card('Invocació espiritual', CardType.Focus)
      .withSpeedMod(-4)
      .withEffect({ type: 'SpiritInvocation', dice: new DiceRoll(1, 4) })
      .withDescription('Tu i tots els aliats {D}+1d4 per la resta del combat. Protecció mortal: la primera ferida es cura.'),
    new Card('Càstig diví', CardType.MagicAttack)
      .withMagicAttack(new DiceRoll(1, 4))
      .withSpeedMod(1)
      .withEffect({ type: 'MultiTarget', count: 2 })
      .withDescription('Afecta a 2 enemics que triïs.'),
  ],
};
