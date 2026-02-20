import { Card, CardType } from '../card.js';
import { DiceRoll } from '../dice.js';
import { ModifierDuration } from '../modifier.js';
import type { CharacterTemplate } from '../character.js';

export const WIZARD_TEMPLATE: CharacterTemplate = {
  id: 'wizard',
  displayName: 'Mag',
  classCss: 'mag',
  iconPath: 'icons/000000/transparent/1x1/lorc/wizard-staff.svg',
  category: 'player',
  baseStrength: 0,
  baseMagic: 5,
  baseDefense: 1,
  baseSpeed: 2,
  baseLives: 3,
  cardIcons: {
    'Pantalla protectora': 'icons/000000/transparent/1x1/lorc/magic-shield.svg',
    'Bola de foc': 'icons/000000/transparent/1x1/lorc/fireball.svg',
    'Míssils arcans': 'icons/000000/transparent/1x1/lorc/missile-swarm.svg',
    'Cadena de llamps': 'icons/000000/transparent/1x1/lorc/lightning-helix.svg',
    'Contrahechís': 'icons/000000/transparent/1x1/lorc/magic-gate.svg',
    'Polimorfisme': 'icons/000000/transparent/1x1/lorc/frog.svg',
  },
  createCards: () => [
    new Card('Pantalla protectora', CardType.Defense)
      .withDefense(new DiceRoll(1, 8))
      .withSpeedMod(2)
      .withEffect({ type: 'DefendMultiple', count: 2 })
      .withDescription('Defensa a 2 jugadors que triïs.'),
    new Card('Bola de foc', CardType.MagicAttack)
      .withMagicAttack(new DiceRoll(1, 6))
      .withSpeedMod(0),
    new Card('Míssils arcans', CardType.MagicAttack)
      .withMagicAttack(new DiceRoll(1, 4, -1))
      .withSpeedMod(2)
      .withEffect({ type: 'PiercingStrike' })
      .withDescription("Ignora les cartes de Defensa — sempre colpeja l'objectiu original."),
    new Card('Cadena de llamps', CardType.MagicAttack)
      .withMagicAttack(new DiceRoll(1, 4, -1))
      .withSpeedMod(-1)
      .withEffect({ type: 'MultiTarget', count: 2 })
      .withDescription('Afecta a 2 enemics que triïs.'),
    new Card('Contrahechís', CardType.Focus)
      .withSpeedMod(3)
      .withEffect({ type: 'Counterspell' })
      .withDescription("Tria un enemic. Si juga una carta màgica o de Focus, s'anul·la. No afecta atacs físics ni defenses."),
    new Card('Polimorfisme', CardType.Focus)
      .withSpeedMod(-3)
      .withEffect({ type: 'CharacteristicModifier', modifiers: [{ characteristic: 'strength', amount: -4 }, { characteristic: 'magic', amount: -4 }, { characteristic: 'defense', amount: -3 }], target: 'enemy', duration: ModifierDuration.NextTwoTurns })
      .withDescription("Transforma un enemic en un gripau. L'enemic té {F}-4, {M}-4 i {D}-3 els dos pròxims torns."),
  ],
};
