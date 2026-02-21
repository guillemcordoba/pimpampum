import { Card, CardType } from '../card.js';
import { DiceRoll } from '../dice.js';
import { ModifierDuration } from '../modifier.js';
import type { CharacterTemplate } from '../character.js';

export const HORNED_DEVIL_TEMPLATE: CharacterTemplate = {
  id: 'horned-devil',
  displayName: 'Diable Banyut',
  classCss: 'diable-banyut',
  iconPath: 'icons/000000/transparent/1x1/delapouite/devil-mask.svg',
  category: 'enemy',
  baseStrength: 8,
  baseMagic: 4,
  baseDefense: 6,
  baseSpeed: 2,
  baseLives: 6,
  cardIcons: {
    'Forquilla del diable': 'icons/000000/transparent/1x1/lorc/trident.svg',
    'Alè de l\'infern': 'icons/000000/transparent/1x1/lorc/fire-breath.svg',
    'Pilar de foc': 'icons/000000/transparent/1x1/lorc/fire-zone.svg',
    'Flames de l\'avern': 'icons/000000/transparent/1x1/lorc/flame-tunnel.svg',
    'Defensa diabòlica': 'icons/000000/transparent/1x1/lorc/spiked-armor.svg',
    'Sentència infernal': 'icons/000000/transparent/1x1/lorc/flaming-trident.svg',
  },
  createCards: () => [
    new Card('Forquilla del diable', CardType.PhysicalAttack)
      .withPhysicalAttack(new DiceRoll(1, 8))
      .withSpeedMod(0)
      .withEffect({ type: 'Impale' })
      .withDescription("Si fa ferida, l'enemic no pot ser defensat durant 2 torns."),
    new Card('Alè de l\'infern', CardType.MagicAttack)
      .withMagicAttack(new DiceRoll(1, 4))
      .withSpeedMod(0)
      .withEffect({ type: 'MultiTarget', count: 3 })
      .withDescription("Crema tres enemics amb un alè de foc infernal."),
    new Card('Pilar de foc', CardType.MagicAttack)
      .withMagicAttack(new DiceRoll(1, 6))
      .withSpeedMod(-2)
      .withEffect({ type: 'InfernalBurn', strengthReduction: 3 })
      .withDescription("Si fa ferida, l'enemic perd F-3 durant 2 torns."),
    new Card('Flames de l\'avern', CardType.Focus)
      .withSpeedMod(-3)
      .withEffect({
        type: 'CharacteristicModifier',
        modifiers: [{ characteristic: 'defense', amount: -2 }],
        target: 'enemies',
        duration: ModifierDuration.RestOfCombat,
      })
      .withDescription("Invoca les flames de l'avern. Tots els enemics perden D-2 permanentment."),
    new Card('Defensa diabòlica', CardType.Defense)
      .withDefense(new DiceRoll(1, 8))
      .withSpeedMod(1)
      .withEffect({ type: 'InfernalRetaliation' })
      .withDescription("Si bloqueges un atac, l'atacant perd una vida."),
    new Card('Sentència infernal', CardType.PhysicalAttack)
      .withPhysicalAttack(new DiceRoll(2, 6))
      .withSpeedMod(-4)
      .withEffect({ type: 'DoubleWound' })
      .withDescription("Si fa ferida, l'enemic perd 2 vides en total."),
  ],
};
