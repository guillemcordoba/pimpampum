import { Card, CardType } from '../card.js';
import { DiceRoll } from '../dice.js';
import type { CharacterTemplate } from '../character.js';

export const SPINED_DEVIL_TEMPLATE: CharacterTemplate = {
  id: 'spined-devil',
  displayName: 'Diable Espinós',
  classCss: 'diable-espinos',
  iconPath: 'icons/000000/transparent/1x1/lorc/imp.svg',
  category: 'enemy',
  baseStrength: 2,
  baseMagic: 1,
  baseDefense: 2,
  baseSpeed: 4,
  baseLives: 2,
  cardIcons: {
    'Espina de foc': 'icons/000000/transparent/1x1/lorc/fire-ray.svg',
    'Mossegada en vol': 'icons/000000/transparent/1x1/lorc/bat-wing.svg',
    'Cortina de foc': 'icons/000000/transparent/1x1/lorc/fire-shield.svg',
    'Foc persistent': 'icons/000000/transparent/1x1/lorc/flame-spin.svg',
  },
  createCards: () => [
    new Card('Espina de foc', CardType.MagicAttack)
      .withMagicAttack(new DiceRoll(1, 4))
      .withSpeedMod(1)
      .withEffect({ type: 'Crossfire', maxBonus: 3 })
      .withDescription("Guanyes +1 a l'atac per cada aliat que també ataqui (màx +3)."),
    new Card('Mossegada en vol', CardType.PhysicalAttack)
      .withPhysicalAttack(new DiceRoll(1, 4, -1))
      .withSpeedMod(4)
      .withEffect({ type: 'FireAndRetreat' })
      .withDescription("Després d'atacar, esquives tots els atacs aquest torn."),
    new Card('Cortina de foc', CardType.Defense)
      .withDefense(new DiceRoll(1, 6))
      .withSpeedMod(2),
    new Card('Foc persistent', CardType.Focus)
      .withSpeedMod(0)
      .withEffect({ type: 'LingeringFire' })
      .withDescription("L'enemic seleccionat perd una vida al començament del pròxim torn."),
  ],
};
