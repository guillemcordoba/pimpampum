import { Card, CardType } from '../card.js';
import { DiceRoll } from '../dice.js';
import type { CharacterTemplate } from '../character.js';

export const MONK_TEMPLATE: CharacterTemplate = {
  id: 'monk',
  displayName: 'Monjo',
  classCss: 'monjo',
  iconPath: 'icons/000000/transparent/1x1/delapouite/monk-face.svg',
  category: 'player',
  baseStrength: 3,
  baseMagic: 1,
  baseDefense: 1,
  baseSpeed: 4,
  baseLives: 3,
  cardIcons: {
    'Cop de puny': 'icons/000000/transparent/1x1/lorc/punch.svg',
    'Puntada voladora': 'icons/000000/transparent/1x1/delapouite/high-kick.svg',
    'Ràfega de cops': 'icons/000000/transparent/1x1/lorc/fulguro-punch.svg',
    'Contracop': 'icons/000000/transparent/1x1/lorc/grapple.svg',
    'Meditació': 'icons/000000/transparent/1x1/lorc/meditation.svg',
    'Cop de silenci': 'icons/000000/transparent/1x1/lorc/silence.svg',
  },
  createCards: () => [
    new Card('Cop de puny', CardType.PhysicalAttack)
      .withPhysicalAttack(new DiceRoll(1, 4))
      .withSpeedMod(3)
      .withEffect({ type: 'SwiftStrike' })
      .withDescription('Si impacta, rep {V}+3 el torn següent.'),
    new Card('Puntada voladora', CardType.PhysicalAttack)
      .withPhysicalAttack(new DiceRoll(1, 6))
      .withSpeedMod(-1)
      .withEffect({ type: 'PiercingStrike' })
      .withDescription("Ignora les cartes de Defensa — sempre colpeja l'objectiu original."),
    new Card('Ràfega de cops', CardType.PhysicalAttack)
      .withPhysicalAttack(new DiceRoll(1, 4, -1))
      .withSpeedMod(1)
      .withEffect({ type: 'FlurryOfBlows' })
      .withDescription('Ataca el mateix enemic dues vegades.'),
    new Card('Contracop', CardType.Defense)
      .withDefense(new DiceRoll(1, 8))
      .withSpeedMod(2)
      .withEffect({ type: 'Deflection', counterAttackDice: new DiceRoll(1, 4) })
      .withDescription("Si l'atac falla, contraataca l'atacant amb {F}+1d4."),
    new Card('Meditació', CardType.Focus)
      .withSpeedMod(-4)
      .withEffect({ type: 'MeditationBoost', defenseDice: new DiceRoll(1, 6), defenseFlat: 2, speedBoost: 2 })
      .withDescription('{D}+1d6+2 i {V}+2 per la resta del combat.'),
    new Card('Cop de silenci', CardType.PhysicalAttack)
      .withPhysicalAttack(new DiceRoll(1, 4))
      .withSpeedMod(1)
      .withEffect({ type: 'SilenceStrike' })
      .withDescription("Si impacta, les cartes Focus del defensor es cancel·len automàticament els proper 2 torns."),
  ],
};
