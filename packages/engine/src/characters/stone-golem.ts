import { Card, CardType } from '../card.js';
import { DiceRoll } from '../dice.js';
import { ModifierDuration } from '../modifier.js';
import type { CharacterTemplate } from '../character.js';

export const STONE_GOLEM_TEMPLATE: CharacterTemplate = {
  id: 'golem-de-pedra',
  displayName: 'Gòlem de Pedra',
  classCss: 'golem-de-pedra',
  iconPath: 'icons/000000/transparent/1x1/delapouite/rock-golem.svg',
  category: 'enemy',
  baseStrength: 6,
  baseMagic: 0,
  baseDefense: 7,
  baseSpeed: 1,
  baseLives: 5,
  cardIcons: {
    'Cop de pedra': 'icons/000000/transparent/1x1/lorc/fist.svg',
    'Destrossa': 'icons/000000/transparent/1x1/lorc/thor-fist.svg',
    'Terratrèmol': 'icons/000000/transparent/1x1/lorc/quake-stomp.svg',
    'Mur de pedra': 'icons/000000/transparent/1x1/delapouite/stone-wall.svg',
    'Enduriment': 'icons/000000/transparent/1x1/lorc/stone-sphere.svg',
  },
  createCards: () => [
    new Card('Cop de pedra', CardType.PhysicalAttack)
      .withPhysicalAttack(new DiceRoll(1, 6))
      .withSpeedMod(-1),
    new Card('Destrossa', CardType.PhysicalAttack)
      .withPhysicalAttack(new DiceRoll(1, 8))
      .withSpeedMod(-3)
      .withEffect({ type: 'DoubleWound' })
      .withDescription('Cop devastador que causa 2 ferides si fa mal.'),
    new Card('Terratrèmol', CardType.PhysicalAttack)
      .withPhysicalAttack(new DiceRoll(1, 4))
      .withSpeedMod(-2)
      .withEffect({ type: 'MultiTarget', count: 3 })
      .withDescription('Colpeja el terra amb força, afectant fins a 3 enemics.'),
    new Card('Mur de pedra', CardType.Defense)
      .withDefense(new DiceRoll(1, 4))
      .withSpeedMod(-1)
      .withEffect({ type: 'InfernalRetaliation' })
      .withDescription("El cos de pedra fa mal als atacants que colpegen el gòlem."),
    new Card('Enduriment', CardType.Focus)
      .withSpeedMod(-2)
      .withEffect({
        type: 'CharacteristicModifier',
        modifiers: [
          { characteristic: 'defense', amount: 2 },
          { characteristic: 'strength', amount: 1 },
        ],
        target: 'self',
        duration: ModifierDuration.RestOfCombat,
      })
      .withDescription('Endureix el cos de pedra permanentment: D+2, F+1.'),
  ],
};
