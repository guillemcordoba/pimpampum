import { Card, CardType } from '../card.js';
import { DiceRoll } from '../dice.js';
import { ModifierDuration } from '../modifier.js';
import type { CharacterTemplate } from '../character.js';

export const GOBLIN_SHAMAN_TEMPLATE: CharacterTemplate = {
  id: 'goblin-shaman',
  displayName: 'Goblin Xaman',
  classCss: 'goblin-shaman',
  iconPath: 'icons/000000/transparent/1x1/delapouite/skull-staff.svg',
  category: 'enemy',
  baseStrength: 1,
  baseMagic: 5,
  baseDefense: 3,
  baseSpeed: 3,
  baseLives: 4,
  cardIcons: {
    'Llamp': 'icons/000000/transparent/1x1/lorc/lightning-arc.svg',
    'Possessió demoníaca': 'icons/000000/transparent/1x1/lorc/daemon-skull.svg',
    'Set de sang': 'icons/000000/transparent/1x1/skoll/blood.svg',
    'Pluja de flames': 'icons/000000/transparent/1x1/lorc/flame-spin.svg',
    'Absorvir dolor': 'icons/000000/transparent/1x1/lorc/back-pain.svg',
  },
  createCards: () => [
    new Card('Llamp', CardType.MagicAttack)
      .withMagicAttack(new DiceRoll(2, 4, -2))
      .withSpeedMod(0),
    new Card('Possessió demoníaca', CardType.Focus)
      .withSpeedMod(-3)
      .withEffect({ type: 'CharacteristicModifier', modifiers: [{ characteristic: 'magic', amount: 3, dice: new DiceRoll(1, 6) }], target: 'self', duration: ModifierDuration.RestOfCombat })
      .withDescription('{M}+1d6+3 per la resta del combat.'),
    new Card('Set de sang', CardType.Focus)
      .withSpeedMod(-4)
      .withEffect({ type: 'BloodThirst' })
      .withDescription('Cada enemic que hagi perdut una vida durant aquest combat perd una altra vida.'),
    new Card('Pluja de flames', CardType.MagicAttack)
      .withMagicAttack(new DiceRoll(1, 4, -2))
      .withSpeedMod(-4)
      .withEffect({ type: 'MultiTarget', count: 3 })
      .withDescription('Afecta a 3 enemics que triïs.'),
    new Card('Absorvir dolor', CardType.Defense)
      .withDefense(new DiceRoll(1, 8))
      .withSpeedMod(3)
      .withEffect({ type: 'AbsorbPain' })
      .withDescription('Si absorveix un atac, {D}+1 per la resta del combat.'),
  ],
};
