import { Card, CardType } from '../card.js';
import { DiceRoll } from '../dice.js';
import type { CharacterTemplate } from '../character.js';

export const BARD_TEMPLATE: CharacterTemplate = {
  id: 'bard',
  displayName: 'Trobador',
  classCss: 'trobador',
  iconPath: 'icons/000000/transparent/1x1/lorc/lyre.svg',
  category: 'player',
  baseStrength: 1,
  baseMagic: 4,
  baseDefense: 2,
  baseSpeed: 3,
  baseLives: 3,
  cardIcons: {
    'Acord dissonant': 'icons/000000/transparent/1x1/lorc/sonic-boom.svg',
    'Veu del valor': 'icons/000000/transparent/1x1/lorc/rally-the-troops.svg',
    'Contrapunt': 'icons/000000/transparent/1x1/lorc/shield-echoes.svg',
    'Melodia encisadora': 'icons/000000/transparent/1x1/lorc/charm.svg',
    'Himne de batalla': 'icons/000000/transparent/1x1/lorc/music-spell.svg',
    'Rèquiem': 'icons/000000/transparent/1x1/lorc/death-note.svg',
  },
  createCards: () => [
    new Card('Acord dissonant', CardType.MagicAttack)
      .withMagicAttack(new DiceRoll(1, 8))
      .withSpeedMod(1)
      .withEffect({ type: 'Dissonance' })
      .withDescription("Si impacta, tots els enemics reben {F}-1, {M}-1, {D}-1 i {V}-1 el següent torn."),
    new Card('Veu del valor', CardType.Focus)
      .withSpeedMod(-2)
      .withEffect({ type: 'VoiceOfValor' })
      .withDescription("Tria un aliat ferit. Recupera 1 vida i guanya {F}+2 i {M}+2 per la resta del combat."),
    new Card('Contrapunt', CardType.Defense)
      .withDefense(new DiceRoll(1, 8))
      .withSpeedMod(3)
      .withEffect({ type: 'MagicDeflection', counterAttackDice: new DiceRoll(1, 6) })
      .withDescription("Si l'atacant falla, contraataca amb {M}+1d6."),
    new Card('Melodia encisadora', CardType.Focus)
      .withSpeedMod(-5)
      .withEffect({ type: 'Charm' })
      .withDescription("Tria un enemic. El seu torn és cancel·lat i, confós, fereix un aliat aleatori del seu equip."),
    new Card('Himne de batalla', CardType.MagicAttack)
      .withMagicAttack(new DiceRoll(1, 6))
      .withSpeedMod(0)
      .withEffect({ type: 'Crossfire', maxBonus: 4 })
      .withDescription("Guanyes +1 a l'atac per cada aliat que també ataqui (màx +4)."),
    new Card('Rèquiem', CardType.Focus)
      .withSpeedMod(-4)
      .withEffect({ type: 'Requiem' })
      .withDescription("Tots els enemics que hagin perdut vides reben 1 ferida."),
  ],
};
