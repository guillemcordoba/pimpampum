import { Card, CardType } from '../card.js';
import { DiceRoll } from '../dice.js';
import type { CharacterTemplate } from '../character.js';

export const BONE_DEVIL_TEMPLATE: CharacterTemplate = {
  id: 'bone-devil',
  displayName: "Diable d'Os",
  classCss: 'diable-dos',
  iconPath: 'icons/000000/transparent/1x1/lorc/daemon-skull.svg',
  category: 'enemy',
  baseStrength: 3,
  baseMagic: 2,
  baseDefense: 2,
  baseSpeed: 3,
  baseLives: 2,
  cardIcons: {
    'Fibló verinós': 'icons/000000/transparent/1x1/lorc/poison-gas.svg',
    'Esgarrapada': 'icons/000000/transparent/1x1/lorc/claw-slashes.svg',
    'Udol de terror': 'icons/000000/transparent/1x1/lorc/screaming.svg',
    'Defensa esquelètica': 'icons/000000/transparent/1x1/lorc/ribcage.svg',
    'Marca de la mort': 'icons/000000/transparent/1x1/lorc/death-zone.svg',
  },
  createCards: () => [
    new Card('Fibló verinós', CardType.PhysicalAttack)
      .withPhysicalAttack(new DiceRoll(1, 6))
      .withSpeedMod(0)
      .withEffect({ type: 'DebilitatingVenom', defenseReduction: 2 })
      .withDescription("Si fa ferida, l'enemic perd D-2 permanentment."),
    new Card('Esgarrapada', CardType.PhysicalAttack)
      .withPhysicalAttack(new DiceRoll(1, 4))
      .withSpeedMod(3),
    new Card('Udol de terror', CardType.Focus)
      .withSpeedMod(-2)
      .withEffect({ type: 'TerrorAura', statReduction: 2 })
      .withDescription("Tots els enemics reben F-2, M-2, D-2, V-2 durant 2 torns."),
    new Card('Defensa esquelètica', CardType.Defense)
      .withDefense(new DiceRoll(1, 8))
      .withSpeedMod(3),
    new Card('Marca de la mort', CardType.Focus)
      .withSpeedMod(-1)
      .withEffect({ type: 'DoomMark' })
      .withDescription("Marca un enemic. La pròxima ferida que rebi li costa una vida addicional."),
  ],
};
