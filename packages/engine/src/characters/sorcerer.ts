import { Card, CardType } from '../card.js';
import { DiceRoll } from '../dice.js';
import { ModifierDuration } from '../modifier.js';
import type { CharacterTemplate } from '../character.js';

export const SORCERER_TEMPLATE: CharacterTemplate = {
  id: 'sorcerer',
  displayName: 'Bruixot',
  classCss: 'bruixot',
  iconPath: 'icons/000000/transparent/1x1/delapouite/fire-spell-cast.svg',
  category: 'player',
  baseStrength: 0,
  baseMagic: 4,
  baseDefense: 1,
  baseSpeed: 3,
  baseLives: 3,
  cardIcons: {
    'Robatori arcà': 'icons/000000/transparent/1x1/lorc/hand.svg',
    'Marca bessona': 'icons/000000/transparent/1x1/lorc/double-face-mask.svg',
    'Raig potenciat': 'icons/000000/transparent/1x1/lorc/beam-wake.svg',
    'Absorció màgica': 'icons/000000/transparent/1x1/lorc/magic-shield.svg',
    'Detonació arcana': 'icons/000000/transparent/1x1/sbed/blast.svg',
    'Distorsió temporal': 'icons/000000/transparent/1x1/lorc/time-trap.svg',
  },
  createCards: () => [
    new Card('Robatori arcà', CardType.MagicAttack)
      .withMagicAttack(new DiceRoll(1, 4))
      .withSpeedMod(1)
      .withEffect({ type: 'SpellLeech' })
      .withDescription('Si fa mal, roba un modificador de l\'enemic.'),
    new Card('Marca bessona', CardType.MagicAttack)
      .withMagicAttack(new DiceRoll(1, 4))
      .withSpeedMod(0)
      .withEffect({ type: 'ArcaneMark', count: 2 })
      .withDescription('Ataca 2 enemics. Els marca amb una marca arcana.'),
    new Card('Raig potenciat', CardType.MagicAttack)
      .withMagicAttack(new DiceRoll(1, 8))
      .withSpeedMod(-1)
      .withEffect({ type: 'ArcaneMark' })
      .withDescription('Marca l\'enemic amb una marca arcana.'),
    new Card('Absorció màgica', CardType.Defense)
      .withDefense(new DiceRoll(1, 6))
      .withSpeedMod(2)
      .withEffect({ type: 'SpellAbsorption' })
      .withDescription('En defensar d\'un atac, guanyes {M}+2 i l\'atacant perd {M}+2 el següent torn.'),
    new Card('Detonació arcana', CardType.Focus)
      .withSpeedMod(-3)
      .withEffect({ type: 'ArcaneDetonation' })
      .withDescription('Detona totes les marques arcanes. Cada marca causa 1 ferida.'),
    new Card('Distorsió temporal', CardType.Focus)
      .withSpeedMod(-4)
      .withEffect({ type: 'CharacteristicModifier', modifiers: [{ characteristic: 'speed', amount: -2 }], target: 'enemies', duration: ModifierDuration.NextNTurns(3) })
      .withDescription('Tots els enemics reben {V}-2 durant 3 torns.'),
  ],
};
