import { Card, CardType } from '../card.js';
import { DiceRoll } from '../dice.js';
import type { CharacterTemplate } from '../character.js';

export const FIGHTER_TEMPLATE: CharacterTemplate = {
  id: 'fighter',
  displayName: 'Guerrer',
  classCss: 'guerrer',
  iconPath: 'icons/000000/transparent/1x1/delapouite/black-knight-helm.svg',
  category: 'player',
  baseStrength: 2,
  baseMagic: 0,
  baseDefense: 4,
  baseSpeed: 2,
  baseMaxWounds: 3,
  cardIcons: {
    'Espasa llarga': 'icons/000000/transparent/1x1/lorc/broadsword.svg',
    'Sacrifici': 'icons/000000/transparent/1x1/lorc/bleeding-heart.svg',
    'Ràbia traumada': 'icons/000000/transparent/1x1/lorc/screaming.svg',
    'Embestida': 'icons/000000/transparent/1x1/lorc/bull.svg',
    'Crit de guerra': 'icons/000000/transparent/1x1/lorc/shouting.svg',
    'Formació defensiva': 'icons/000000/transparent/1x1/lorc/rally-the-troops.svg',
  },
  createCards: () => [
    new Card('Espasa llarga', CardType.PhysicalAttack)
      .withPhysicalAttack(new DiceRoll(1, 6))
      .withSpeedMod(-2)
      .withEffect({ type: 'Stun' })
      .withDescription('Aturdeix: anul·la els atacs que el jugador atacat anés a fer aquest combat.'),
    new Card('Sacrifici', CardType.Defense)
      .withSpeedMod(6)
      .withEffect({ type: 'Sacrifice' })
      .withDescription('Tria un jugador. Rep tots els atacs que li farien aquest torn.'),
    new Card('Ràbia traumada', CardType.Focus)
      .withSpeedMod(-3)
      .withEffect({ type: 'StrengthBoost', amount: 4, dice: new DiceRoll(1, 8) })
      .withDescription('{F}+1d8+4 per la resta del combat.'),
    new Card('Embestida', CardType.PhysicalAttack)
      .withPhysicalAttack(new DiceRoll(1, 4))
      .withSpeedMod(2)
      .withEffect({ type: 'EmbestidaEffect' })
      .withDescription('El jugador atacat té {V}-2 el següent torn. Tu tens {V}-3 el següent torn.'),
    new Card('Crit de guerra', CardType.PhysicalAttack)
      .withPhysicalAttack(new DiceRoll(1, 4))
      .withSpeedMod(1)
      .withEffect({ type: 'AllyStrengthThisTurn', amount: 2 })
      .withDescription('Tots els aliats reben {F}+2 aquest torn.'),
    new Card('Formació defensiva', CardType.Focus)
      .withSpeedMod(-2)
      .withEffect({ type: 'DefenseBoostDuration', dice: new DiceRoll(1, 6), turns: 2 })
      .withDescription('Tu i tots els aliats {D}+1d6 per la resta del combat.'),
  ],
};
