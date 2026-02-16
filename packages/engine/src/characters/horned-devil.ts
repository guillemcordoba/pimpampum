import { Card, CardType } from '../card.js';
import { DiceRoll } from '../dice.js';
import type { CharacterTemplate } from '../character.js';

export const HORNED_DEVIL_TEMPLATE: CharacterTemplate = {
  id: 'horned-devil',
  displayName: 'Diable Banyut',
  classCss: 'diable-banyut',
  iconPath: 'icons/000000/transparent/1x1/delapouite/devil-mask.svg',
  category: 'enemy',
  baseStrength: 7,
  baseMagic: 4,
  baseDefense: 6,
  baseSpeed: 2,
  baseLives: 6,
  cardIcons: {
    'Forquilla del diable': 'icons/000000/transparent/1x1/lorc/trident.svg',
    'Càrrega imparable': 'icons/000000/transparent/1x1/lorc/charging-bull.svg',
    'Contracte de sang': 'icons/000000/transparent/1x1/lorc/scroll-unfurled.svg',
    'Fúria creixent': 'icons/000000/transparent/1x1/lorc/enrage.svg',
    'Defensa diabòlica': 'icons/000000/transparent/1x1/lorc/spiked-armor.svg',
    'Sentència infernal': 'icons/000000/transparent/1x1/lorc/fiery-sword.svg',
  },
  createCards: () => [
    new Card('Forquilla del diable', CardType.PhysicalAttack)
      .withPhysicalAttack(new DiceRoll(1, 8))
      .withSpeedMod(0)
      .withEffect({ type: 'Impale' })
      .withDescription("Si fa ferida, l'enemic no pot ser defensat durant 2 torns."),
    new Card('Càrrega imparable', CardType.PhysicalAttack)
      .withPhysicalAttack(new DiceRoll(1, 6))
      .withSpeedMod(2),
    new Card('Contracte de sang', CardType.Focus)
      .withSpeedMod(-4)
      .withEffect({ type: 'BloodContract' })
      .withDescription("Lliga un enemic amb un contracte de sang. Cada cop que ataqui el teu equip, perd una vida."),
    new Card('Fúria creixent', CardType.Focus)
      .withSpeedMod(-3)
      .withEffect({ type: 'FuryScaling' })
      .withDescription("Guanya +1 F permanent per cada vida perduda."),
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
