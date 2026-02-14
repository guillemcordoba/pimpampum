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
  baseDefense: 2,
  baseSpeed: 3,
  baseMaxWounds: 3,
  cardIcons: {
    'Ràbia': 'icons/000000/transparent/1x1/lorc/wolf-howl.svg',
    'Destral de guerra': 'icons/000000/transparent/1x1/lorc/battle-axe.svg',
    'Atac temerari': 'icons/000000/transparent/1x1/lorc/deadly-strike.svg',
    'Escomesa salvatge': 'icons/000000/transparent/1x1/lorc/crossed-slashes.svg',
    'Resistir': 'icons/000000/transparent/1x1/lorc/muscle-up.svg',
    'Rugit intimidant': 'icons/000000/transparent/1x1/lorc/shouting.svg',
  },
  createCards: () => [
    new Card('Ràbia', CardType.Focus)
      .withSpeedMod(-4)
      .withEffect({ type: 'RageBoost', amount: 2, dice: new DiceRoll(1, 6), speedBoost: 3 })
      .withDescription('{F}+1d6+2 i {V}+3 per la resta del combat.'),
    new Card('Destral de guerra', CardType.PhysicalAttack)
      .withPhysicalAttack(new DiceRoll(1, 8))
      .withSpeedMod(-1),
    new Card('Atac temerari', CardType.PhysicalAttack)
      .withPhysicalAttack(new DiceRoll(1, 6))
      .withSpeedMod(1)
      .withEffect({ type: 'RecklessAttack' })
      .withDescription('Tu tens {D}-2 aquest torn i el següent.'),
    new Card('Escomesa salvatge', CardType.PhysicalAttack)
      .withPhysicalAttack(new DiceRoll(1, 4))
      .withSpeedMod(0)
      .withEffect({ type: 'MultiTarget', count: 2 })
      .withDescription('Afecta a 2 enemics que triïs.'),
    new Card('Resistir', CardType.Defense)
      .withDefense(new DiceRoll(1, 8))
      .withSpeedMod(2)
      .withEffect({ type: 'AbsorbPain' })
      .withDescription('Si absorveix un atac, {D}+1 per la resta del combat.'),
    new Card('Rugit intimidant', CardType.Focus)
      .withSpeedMod(1)
      .withEffect({ type: 'IntimidatingRoar' })
      .withDescription("Cada oponent tira 1d4. Els que treuen 2 o menys queden atordits i no actuen aquest torn."),
  ],
};
