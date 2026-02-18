import { Card, CardType } from '../card.js';
import { DiceRoll } from '../dice.js';
import { ModifierDuration } from '../modifier.js';
import type { CharacterTemplate } from '../character.js';

export const FIGHTER_TEMPLATE: CharacterTemplate = {
  id: 'fighter',
  displayName: 'Guerrer',
  classCss: 'guerrer',
  iconPath: 'icons/000000/transparent/1x1/delapouite/black-knight-helm.svg',
  category: 'player',
  baseStrength: 3,
  baseMagic: 0,
  baseDefense: 2,
  baseSpeed: 3,
  baseLives: 3,
  cardIcons: {
    "Tall d'espasa": 'icons/000000/transparent/1x1/lorc/broadsword.svg',
    'Escomesa furiosa': 'icons/000000/transparent/1x1/lorc/spinning-sword.svg',
    'Atac ampli': 'icons/000000/transparent/1x1/lorc/sword-spin.svg',
    'Posició defensiva': 'icons/000000/transparent/1x1/lorc/bordered-shield.svg',
    'Segon alè': 'icons/000000/transparent/1x1/lorc/energy-breath.svg',
    'Crit de guerra': 'icons/000000/transparent/1x1/lorc/shouting.svg',
  },
  createCards: () => [
    new Card("Tall d'espasa", CardType.PhysicalAttack)
      .withPhysicalAttack(new DiceRoll(1, 6))
      .withDescription('Un cop precís i potent amb l\'espasa.'),
    new Card('Escomesa furiosa', CardType.PhysicalAttack)
      .withPhysicalAttack(new DiceRoll(1, 4))
      .withSpeedMod(2)
      .withEffect({ type: 'ActionSurge', secondAttackDice: new DiceRoll(1, 4) })
      .withDescription('Ataca i realitza immediatament un segon atac contra un enemic aleatori.'),
    new Card('Atac ampli', CardType.PhysicalAttack)
      .withPhysicalAttack(new DiceRoll(1, 4))
      .withSpeedMod(-1)
      .withEffect({ type: 'MultiTarget', count: 2 })
      .withDescription('Ataca fins a 2 enemics amb un gran arc d\'espasa.'),
    new Card('Posició defensiva', CardType.Defense)
      .withDefense(new DiceRoll(1, 6))
      .withSpeedMod(2)
      .withDescription('Defensa un aliat.'),
    new Card('Segon alè', CardType.Focus)
      .withSpeedMod(3)
      .withEffect({ type: 'SecondWind', healAmount: 1, defenseBoost: 2 })
      .withDescription('Recupera 1 vida i guanya {D}+2 aquest torn.'),
    new Card('Crit de guerra', CardType.Focus)
      .withSpeedMod(-4)
      .withEffect({ type: 'CharacteristicModifier', modifiers: [{ characteristic: 'strength', amount: 0, dice: new DiceRoll(1, 4) }], target: 'team', duration: ModifierDuration.RestOfCombat })
      .withDescription('Tu i tots els aliats guanyeu {F}+1d4 per la resta del combat.'),
  ],
};
