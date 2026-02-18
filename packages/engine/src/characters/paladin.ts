import { Card, CardType } from '../card.js';
import { DiceRoll } from '../dice.js';
import { ModifierDuration } from '../modifier.js';
import type { CharacterTemplate } from '../character.js';

export const PALADIN_TEMPLATE: CharacterTemplate = {
  id: 'paladin',
  displayName: 'Paladí',
  classCss: 'paladi',
  iconPath: 'icons/000000/transparent/1x1/lorc/winged-sword.svg',
  category: 'player',
  baseStrength: 2,
  baseMagic: 1,
  baseDefense: 4,
  baseSpeed: 2,
  baseLives: 3,
  cardIcons: {
    'Escomesa sagrada': 'icons/000000/transparent/1x1/lorc/sword-clash.svg',
    'Càstig diví': 'icons/000000/transparent/1x1/lorc/shining-sword.svg',
    'Aura protectora': 'icons/000000/transparent/1x1/lorc/beams-aura.svg',
    'Escut de fe': 'icons/000000/transparent/1x1/lorc/bolt-shield.svg',
    'Imposició de mans': 'icons/000000/transparent/1x1/lorc/glowing-hands.svg',
    'Jurament sagrat': 'icons/000000/transparent/1x1/lorc/aura.svg',
  },
  createCards: () => [
    new Card('Escomesa sagrada', CardType.PhysicalAttack)
      .withPhysicalAttack(new DiceRoll(1, 6))
      .withSpeedMod(0)
      .withEffect({ type: 'CharacteristicModifier', modifiers: [{ characteristic: 'defense', amount: 1 }], target: 'self', duration: ModifierDuration.NextTurn })
      .withDescription('Guanyes {D}+1 el pròxim torn.'),
    new Card('Càstig diví', CardType.PhysicalAttack)
      .withPhysicalAttack(new DiceRoll(1, 4))
      .withSpeedMod(-1)
      .withEffect({ type: 'DivineSmite' })
      .withDescription('Suma la teva {M} a la tirada d\'atac.'),
    new Card('Aura protectora', CardType.Defense)
      .withDefense(new DiceRoll(1, 8))
      .withSpeedMod(1)
      .withEffect({ type: 'DefendMultiple', count: 10 })
      .withDescription('Defensa tots els aliats a la vegada.'),
    new Card('Escut de fe', CardType.Defense)
      .withDefense(new DiceRoll(1, 8))
      .withSpeedMod(1)
      .withEffect({ type: 'DivineBulwark' })
      .withDescription("Si un atac falla, l'aliat defensat guanya {D}+1 per la resta del combat."),
    new Card('Imposició de mans', CardType.Focus)
      .withSpeedMod(-2)
      .withEffect({ type: 'LayOnHands' })
      .withDescription('Cura 1 vida a un aliat (o a tu mateix) i elimina efectes negatius.'),
    new Card('Jurament sagrat', CardType.Focus)
      .withSpeedMod(-4)
      .withEffect({ type: 'CharacteristicModifier', modifiers: [{ characteristic: 'strength', amount: 2 }, { characteristic: 'magic', amount: 2 }], target: 'self', duration: ModifierDuration.RestOfCombat })
      .withDescription('Guanyes {F}+2 i {M}+2 per la resta del combat.'),
  ],
};
