import { Card, CardType } from '../card.js';
import { DiceRoll } from '../dice.js';
import type { CharacterTemplate } from '../character.js';

export const GOBLIN_TEMPLATE: CharacterTemplate = {
  id: 'goblin',
  displayName: 'Goblin',
  classCss: 'goblin',
  iconPath: 'icons/000000/transparent/1x1/delapouite/goblin-head.svg',
  category: 'enemy',
  baseStrength: 2,
  baseMagic: 0,
  baseDefense: 2,
  baseSpeed: 4,
  baseLives: 1,
  cardIcons: {
    'Atac de la horda': 'icons/000000/transparent/1x1/delapouite/goblin-head.svg',
    'Punyalada ràpida': 'icons/000000/transparent/1x1/lorc/plain-dagger.svg',
    'Protegir el clan': 'icons/000000/transparent/1x1/willdabeast/round-shield.svg',
    'Amagar-se': 'icons/000000/transparent/1x1/lorc/hidden.svg',
  },
  createCards: () => [
    new Card('Atac de la horda', CardType.PhysicalAttack)
      .withPhysicalAttack(new DiceRoll(0, 0))
      .withSpeedMod(0)
      .withEffect({ type: 'Crossfire', maxBonus: 10 })
      .withDescription("{F}+1 per cada altre aliat que també ataca aquest torn."),
    new Card('Punyalada ràpida', CardType.PhysicalAttack)
      .withPhysicalAttack(new DiceRoll(1, 4, -2))
      .withSpeedMod(3),
    new Card('Protegir el clan', CardType.Defense)
      .withDefense(new DiceRoll(1, 6))
      .withSpeedMod(2),
    new Card('Amagar-se', CardType.Focus)
      .withSpeedMod(2)
      .withEffect({ type: 'NimbleEscape' })
      .withDescription("Esquives tots els atacs aquest torn. El següent torn, F+1 per cada goblin que s'hagi amagat."),
  ],
};
