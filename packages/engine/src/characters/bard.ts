import { Card, CardType } from '../card.js';
import { DiceRoll } from '../dice.js';
import { ModifierDuration } from '../modifier.js';
import type { CharacterTemplate } from '../character.js';

export const BARD_TEMPLATE: CharacterTemplate = {
  id: 'bard',
  displayName: 'Trobador',
  classCss: 'trobador',
  iconPath: 'icons/000000/transparent/1x1/lorc/lyre.svg',
  category: 'player',
  baseStrength: 1,
  baseMagic: 3,
  baseDefense: 2,
  baseSpeed: 3,
  baseLives: 3,
  cardIcons: {
    'Acord dissonant': 'icons/000000/transparent/1x1/lorc/sonic-boom.svg',
    'Veu del valor': 'icons/000000/transparent/1x1/lorc/rally-the-troops.svg',
    'Eco protector': 'icons/000000/transparent/1x1/lorc/shield-echoes.svg',
'Cançó hipnòtica': 'icons/000000/transparent/1x1/lorc/oily-spiral.svg',
    'Rèquiem': 'icons/000000/transparent/1x1/lorc/death-note.svg',
    'Balada heroica': 'icons/000000/transparent/1x1/delapouite/musical-notes.svg',
  },
  createCards: () => [
    new Card('Acord dissonant', CardType.MagicAttack)
      .withMagicAttack(new DiceRoll(1, 4))
      .withSpeedMod(0)
      .withEffect({ type: 'Dissonance' })
      .withDescription("Si fa mal, tots els enemics reben {F}-1, {M}-1, {D}-1 i {V}-1 el següent torn."),
    new Card('Veu del valor', CardType.Focus)
      .withSpeedMod(-2)
      .withEffect({ type: 'VoiceOfValor' })
      .withDescription("Tria un aliat ferit. Cura 1 vida i guanya {F}+2 i {M}+2 per la resta del combat."),
    new Card('Eco protector', CardType.Defense)
      .withDefense(new DiceRoll(1, 6))
      .withSpeedMod(1)
      .withEffect({ type: 'DefendMultiple', count: 2 })
      .withDescription('Defensa a 2 aliats que triïs.'),
new Card('Cançó hipnòtica', CardType.MagicAttack)
      .withMagicAttack(new DiceRoll(1, 4))
      .withSpeedMod(0)
      .withEffect({ type: 'HypnoticSong', dice: new DiceRoll(1, 20), threshold: 10, turns: 2 })
      .withDescription("**1d20 > 10**: l'enemic juga una carta aleatòria durant els següents 2 torns."),
    new Card('Rèquiem', CardType.Focus)
      .withSpeedMod(-4)
      .withEffect({ type: 'Requiem' })
      .withDescription("Tots els enemics que hagin perdut vides en perden una altra."),
    new Card('Balada heroica', CardType.Focus)
      .withSpeedMod(-3)
      .withEffect({
        type: 'CharacteristicModifier',
        modifiers: [
          { characteristic: 'strength', amount: 2 },
          { characteristic: 'magic', amount: 2 },
        ],
        target: 'allies',
        duration: ModifierDuration.RestOfCombat,
      })
      .withDescription('Tots els aliats guanyen {F}+2 i {M}+2 per la resta del combat.'),
  ],
};
