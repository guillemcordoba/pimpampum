import { Card, CardType } from '../card.js';
import { DiceRoll } from '../dice.js';
import type { CharacterTemplate } from '../character.js';

export const BARBARIAN_TEMPLATE: CharacterTemplate = {
  id: 'barbarian',
  displayName: 'Bàrbar',
  classCss: 'barbar',
  iconPath: 'icons/000000/transparent/1x1/delapouite/barbarian.svg',
  category: 'player',
  baseStrength: 4,
  baseMagic: 0,
  baseDefense: 1,
  baseSpeed: 3,
  baseLives: 3,
  cardIcons: {
    'Ràbia': 'icons/000000/transparent/1x1/lorc/wolf-howl.svg',
    'Destral de guerra': 'icons/000000/transparent/1x1/lorc/battle-axe.svg',
    'Cop Demolidor': 'icons/000000/transparent/1x1/lorc/hammer-drop.svg',
    'Frenesia': 'icons/000000/transparent/1x1/lorc/flame-claws.svg',
    'Ira imparable': 'icons/000000/transparent/1x1/lorc/spiked-armor.svg',
    'Rugit intimidant': 'icons/000000/transparent/1x1/lorc/shouting.svg',
  },
  createCards: () => [
    new Card('Ràbia', CardType.Focus)
      .withSpeedMod(-5)
      .withEffect({ type: 'RageBoost', amount: 2, dice: new DiceRoll(1, 6), speedBoost: 3 })
      .withDescription('{F}+1d6+2 i {V}+3 per la resta del combat.'),
    new Card('Destral de guerra', CardType.PhysicalAttack)
      .withPhysicalAttack(new DiceRoll(1, 8))
      .withSpeedMod(-1),
    new Card('Cop Demolidor', CardType.PhysicalAttack)
      .withPhysicalAttack(new DiceRoll(1, 10))
      .withSpeedMod(-3),
    new Card('Frenesia', CardType.PhysicalAttack)
      .withPhysicalAttack(new DiceRoll(1, 4))
      .withSpeedMod(1)
      .withEffect({ type: 'Frenzy', bonusDicePerLostLife: new DiceRoll(1, 4) })
      .withDescription('+1d4 per cada vida perduda.'),
    new Card('Ira imparable', CardType.Defense)
      .withDefense(new DiceRoll(0, 0, 1))
      .withSpeedMod(3)
      .withEffect({ type: 'BerserkerEndurance', strengthDice: new DiceRoll(1, 4), counterAttackDice: new DiceRoll(1, 6) })
      .withDescription('Si perd una vida, {F}+1d4 per la resta del combat i contraatac amb {F}+1d6.'),
    new Card('Rugit intimidant', CardType.Focus)
      .withSpeedMod(1)
      .withEffect({ type: 'IntimidatingRoar' })
      .withDescription("Cada oponent tira 1d4. Els que treuen 2 o menys queden atordits i no actuen aquest torn."),
  ],
};
