import { Card, CardType } from '../card.js';
import { DiceRoll } from '../dice.js';
import { ModifierDuration } from '../modifier.js';
import type { CharacterTemplate } from '../character.js';

export const DRUID_TEMPLATE: CharacterTemplate = {
  id: 'druid',
  displayName: 'Druida',
  classCss: 'druida',
  iconPath: 'icons/000000/transparent/1x1/lorc/oak.svg',
  category: 'player',
  baseStrength: 2,
  baseMagic: 3,
  baseDefense: 2,
  baseSpeed: 3,
  baseLives: 3,
  cardIcons: {
    'Fuet d\'espines': 'icons/000000/transparent/1x1/lorc/vine-whip.svg',
    'Raig de lluna': 'icons/000000/transparent/1x1/lorc/moon.svg',
    'Urpada salvatge': 'icons/000000/transparent/1x1/lorc/grasping-claws.svg',
    'Pell d\'escorça': 'icons/000000/transparent/1x1/lorc/tree-branch.svg',
    'Forma salvatge': 'icons/000000/transparent/1x1/lorc/werewolf.svg',
    'Lligams de natura': 'icons/000000/transparent/1x1/delapouite/plant-roots.svg',
  },
  createCards: () => [
    new Card('Fuet d\'espines', CardType.MagicAttack)
      .withMagicAttack(new DiceRoll(1, 6))
      .withSpeedMod(1)
      .withDescription('Atac màgic ràpid amb espines de natura.'),
    new Card('Raig de lluna', CardType.MagicAttack)
      .withMagicAttack(new DiceRoll(1, 10))
      .withSpeedMod(-2)
      .withDescription('Raig de llum lunar lent però potent.'),
    new Card('Urpada salvatge', CardType.PhysicalAttack)
      .withPhysicalAttack(new DiceRoll(1, 4))
      .withSpeedMod(2)
      .withDescription('Cop ràpid amb instint animal. Devastador després de Forma salvatge.'),
    new Card('Pell d\'escorça', CardType.Defense)
      .withDefense(new DiceRoll(1, 6))
      .withSpeedMod(1)
      .withDescription('La pell s\'endureix com l\'escorça d\'un arbre. Defensa un aliat.'),
    new Card('Forma salvatge', CardType.Focus)
      .withSpeedMod(-4)
      .withEffect({ type: 'WildShape', strengthBoost: 4, defenseBoost: 1, temporaryLives: 1 })
      .withDescription('Transformació en bèstia: {F}+4, {D}+1 i +1 PV per la resta del combat. Un sol ús.'),
    new Card('Lligams de natura', CardType.Focus)
      .withSpeedMod(-2)
      .withEffect({ type: 'CharacteristicModifier', modifiers: [{ characteristic: 'speed', amount: -3 }, { characteristic: 'defense', amount: -2 }], target: 'enemy', duration: ModifierDuration.NextTwoTurns })
      .withDescription('Tria un enemic. {V}-3 i {D}-2 durant els pròxims 2 torns.'),
  ],
};
