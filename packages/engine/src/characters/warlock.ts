import { Card, CardType } from '../card.js';
import { DiceRoll } from '../dice.js';
import { ModifierDuration } from '../modifier.js';
import type { CharacterTemplate } from '../character.js';

export const WARLOCK_TEMPLATE: CharacterTemplate = {
  id: 'warlock',
  displayName: 'Bruixot',
  classCss: 'bruixot',
  iconPath: 'icons/000000/transparent/1x1/lorc/magic-swirl.svg',
  category: 'player',
  baseStrength: 0,
  baseMagic: 4,
  baseDefense: 1,
  baseSpeed: 4,
  baseLives: 3,
  cardIcons: {
    'Dard arcà': 'icons/000000/transparent/1x1/lorc/magic-palm.svg',
    'Raig corrosiu': 'icons/000000/transparent/1x1/lorc/fire-ray.svg',
    'Sobrecàrrega': 'icons/000000/transparent/1x1/lorc/explosion-rays.svg',
    'Raig vampíric': 'icons/000000/transparent/1x1/lorc/drop.svg',
    'Barrera arcana': 'icons/000000/transparent/1x1/lorc/shield-reflect.svg',
    'Màgia de sang': 'icons/000000/transparent/1x1/lorc/droplets.svg',
  },
  createCards: () => [
    new Card('Dard arcà', CardType.MagicAttack)
      .withMagicAttack(new DiceRoll(1, 6))
      .withSpeedMod(2),
    new Card('Raig corrosiu', CardType.MagicAttack)
      .withMagicAttack(new DiceRoll(1, 6))
      .withSpeedMod(0)
      .withEffect({ type: 'CharacteristicModifier', modifiers: [{ characteristic: 'defense', amount: -2 }], target: 'enemy', duration: ModifierDuration.NextTurn })
      .withDescription('Si impacta, l\'enemic rep {D}-2 el pròxim torn.'),
    new Card('Sobrecàrrega', CardType.MagicAttack)
      .withMagicAttack(new DiceRoll(1, 8))
      .withSpeedMod(-2)
      .withEffect({ type: 'Overcharge' })
      .withDescription('Atac a tots els enemics. Després, et fas 1 ferida a tu mateix.'),
    new Card('Raig vampíric', CardType.MagicAttack)
      .withMagicAttack(new DiceRoll(1, 4))
      .withSpeedMod(1)
      .withEffect({ type: 'LifeDrain' })
      .withDescription('Si impacta, recuperes 1 vida.'),
    new Card('Barrera arcana', CardType.Defense)
      .withDefense(new DiceRoll(1, 8))
      .withSpeedMod(2)
      .withEffect({ type: 'SpellReflection' })
      .withDescription('Si un atac màgic falla, l\'atacant rep 1 ferida.'),
    new Card('Màgia de sang', CardType.Focus)
      .withSpeedMod(-3)
      .withEffect({ type: 'BloodMagic' })
      .withDescription('Sacrifica 1 vida. Guanyes {M}+3 i {V}+2 per la resta del combat.'),
  ],
};
