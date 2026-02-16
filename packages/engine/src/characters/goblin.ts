import { Card, CardType } from '../card.js';
import { DiceRoll } from '../dice.js';
import type { CharacterTemplate } from '../character.js';

export const GOBLIN_TEMPLATE: CharacterTemplate = {
  id: 'goblin',
  displayName: 'Goblin',
  classCss: 'goblin',
  iconPath: 'icons/000000/transparent/1x1/delapouite/goblin-head.svg',
  category: 'enemy',
  baseStrength: 1,
  baseMagic: 0,
  baseDefense: 1,
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
      .withPhysicalAttack(new DiceRoll(1, 4))
      .withSpeedMod(1)
      .withEffect({ type: 'PackTactics', alliesPerBonus: 3 })
      .withDescription("Guanyes +1 a l'atac per cada 3 aliats vius."),
    new Card('Punyalada ràpida', CardType.PhysicalAttack)
      .withPhysicalAttack(new DiceRoll(1, 4, -1))
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
