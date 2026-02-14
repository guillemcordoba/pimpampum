import { Card, CardType } from '../card.js';
import { DiceRoll } from '../dice.js';
import type { CharacterTemplate } from '../character.js';

export const ROGUE_TEMPLATE: CharacterTemplate = {
  id: 'rogue',
  displayName: 'Murri',
  classCss: 'murri',
  iconPath: 'icons/000000/transparent/1x1/lorc/rogue.svg',
  category: 'player',
  baseStrength: 2,
  baseMagic: 1,
  baseDefense: 2,
  baseSpeed: 4,
  baseMaxWounds: 3,
  cardIcons: {
    'Emboscada coordinada': 'icons/000000/transparent/1x1/lorc/hidden.svg',
    'Bomba de fum': 'icons/000000/transparent/1x1/lorc/dust-cloud.svg',
    'Clon de fum': 'icons/000000/transparent/1x1/lorc/two-shadows.svg',
    'Ballesta': 'icons/000000/transparent/1x1/carl-olsen/crossbow.svg',
    'Dagues': 'icons/000000/transparent/1x1/lorc/daggers.svg',
    'El·lusió': 'icons/000000/transparent/1x1/lorc/ghost.svg',
    'Enverinar arma': 'icons/000000/transparent/1x1/lorc/poison-bottle.svg',
    'Foc alquímic': 'icons/000000/transparent/1x1/lorc/fire-bottle.svg',
  },
  createCards: () => [
    new Card('Emboscada coordinada', CardType.Focus)
      .withSpeedMod(3)
      .withEffect({ type: 'CoordinatedAmbush' })
      .withDescription("Tria un enemic. Tots els aliats que l'ataquin reben +1d6+2 a la seva tirada."),
    new Card('Bomba de fum', CardType.Focus)
      .withSpeedMod(-1)
      .withEffect({ type: 'BlindingSmoke' })
      .withDescription('Enemics {V}-8 i {D}-8, aliats {V}+4 el següent torn.'),
    new Card('Clon de fum', CardType.Defense)
      .withDefense(new DiceRoll(1, 8))
      .withSpeedMod(2)
      .withEffect({ type: 'CounterThrow' })
      .withDescription("L'atacant rep {V}-3 el següent torn."),
    new Card('Ballesta', CardType.PhysicalAttack)
      .withPhysicalAttack(new DiceRoll(1, 6))
      .withSpeedMod(3),
    new Card('Dagues', CardType.PhysicalAttack)
      .withPhysicalAttack(new DiceRoll(1, 4))
      .withSpeedMod(3)
      .withEffect({ type: 'MultiTarget', count: 2 })
      .withDescription('Afecta a 2 enemics que triïs.'),
    new Card('El·lusió', CardType.Focus)
      .withSpeedMod(5)
      .withEffect({ type: 'DodgeWithSpeedBoost' })
      .withDescription("Esquiva tots els atacs rebuts aquest torn. {V}+5 i {F}+4 el següent torn."),
    new Card('Enverinar arma', CardType.Focus)
      .withSpeedMod(-4)
      .withEffect({ type: 'PoisonWeapon' })
      .withDescription('Tria 3 aliats (pot ser tu). Durant la resta del combat, els seus atacs físics causen una ferida addicional.'),
    new Card('Foc alquímic', CardType.MagicAttack)
      .withMagicAttack(new DiceRoll(1, 6))
      .withSpeedMod(1),
  ],
};
