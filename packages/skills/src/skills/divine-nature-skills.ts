import { ActionType } from '@pimpampum/engine';
import { SkillDefinition, action, d } from './skill-types.js';

export const FE_DIVINA: SkillDefinition = {
  id: 'fe-divina', displayName: 'Fe Divina', classCss: 'paladi', category: 'player',
  description: 'Protecció divina i curació per als aliats.',
  iconPath: 'icons/000000/transparent/1x1/lorc/prayer.svg',
  actions: [
    action({ id: 'escut-de-fe', name: 'Escut de fe', skillId: 'fe-divina', unlock: 1, type: ActionType.Defensa, speed: 10, rollBonus: 3, desc: 'Un escut de llum que protegeix un aliat.', icon: 'lorc/bolt-shield.svg' }),
    action({ id: 'imposicio-de-mans', name: 'Imposició de mans', skillId: 'fe-divina', unlock: 15, type: ActionType.Focus, speed: 8, effects: [{ type: 'heal', params: { amount: 2, target: 'ally' } }, { type: 'cleanse', params: { target: 'ally' } }], desc: 'Cures un aliat i elimines els seus efectes negatius.', icon: 'lorc/glowing-hands.svg' }),
    action({ id: 'aura-protectora', name: 'Aura protectora', skillId: 'fe-divina', unlock: 25, type: ActionType.Defensa, speed: 9, rollBonus: 1, targetCount: 10, desc: 'Una aura que protegeix tot l\'equip alhora.', icon: 'lorc/beams-aura.svg' }),
    action({ id: 'jurament-sagrat', name: 'Jurament sagrat', skillId: 'fe-divina', unlock: 40, type: ActionType.Focus, speed: 3, effects: [{ type: 'skill_mod', params: { amount: 8, target: 'self', duration: 'restOfCombat' } }], desc: 'Un jurament que et fa més poderós la resta del combat.', icon: 'lorc/aura.svg' }),
  ],
};

export const ESGRIMA_SAGRADA: SkillDefinition = {
  id: 'esgrima-sagrada', displayName: 'Esgrima Sagrada', classCss: 'paladi', category: 'player',
  description: 'Atacs sagrats que castiguen els enemics.',
  iconPath: 'icons/000000/transparent/1x1/lorc/winged-sword.svg',
  actions: [
    action({ id: 'escomesa-sagrada', name: 'Escomesa sagrada', skillId: 'esgrima-sagrada', unlock: 1, type: ActionType.Atac, speed: 7, damage: d(1, 6), effects: [{ type: 'skill_mod', params: { kind: 'defense', amount: 4, target: 'self', duration: 'nextTurn' } }], desc: 'Un cop sagrat que també et protegeix el torn següent.', icon: 'lorc/sword-clash.svg' }),
    action({ id: 'castig-divi', name: 'Càstig diví', skillId: 'esgrima-sagrada', unlock: 25, type: ActionType.Atac, speed: 5, damage: d(1, 6), effects: [{ type: 'bonus_damage', params: { amount: 4 } }], desc: 'Canalitzes energia divina en un cop demolidor.', icon: 'lorc/shining-sword.svg' }),
  ],
};

export const MAGIA_NATURA: SkillDefinition = {
  id: 'magia-natura', displayName: 'Màgia de la Natura', classCss: 'druida', category: 'player',
  description: 'El poder de la natura: espines, llum lunar i escorça.',
  iconPath: 'icons/000000/transparent/1x1/lorc/oak.svg',
  actions: [
    action({ id: 'fuet-espines', name: "Fuet d'espines", skillId: 'magia-natura', unlock: 1, type: ActionType.Atac, speed: 8, damage: d(1, 6), desc: 'Un fuet d\'espines ràpid.', icon: 'lorc/vine-whip.svg' }),
    action({ id: 'pell-escorca', name: "Pell d'escorça", skillId: 'magia-natura', unlock: 10, type: ActionType.Defensa, speed: 9, rollBonus: 1, effects: [{ type: 'self_armor', params: { amount: 2 } }], desc: 'La pell s\'endureix com l\'escorça.', icon: 'lorc/tree-branch.svg' }),
    action({ id: 'raig-de-lluna', name: 'Raig de lluna', skillId: 'magia-natura', unlock: 25, type: ActionType.Atac, speed: 4, damage: d(1, 10), desc: 'Un raig de llum lunar lent però potent.', icon: 'lorc/moon.svg' }),
    action({ id: 'lligams-natura', name: 'Lligams de natura', skillId: 'magia-natura', unlock: 35, type: ActionType.Focus, speed: 5, effects: [{ type: 'skill_mod', params: { kind: 'speed', amount: -4, target: 'enemy', duration: 2 } }, { type: 'skill_mod', params: { kind: 'defense', amount: -4, target: 'enemy', duration: 2 } }], desc: 'Arrels lliguen un enemic: alentit i exposat 2 torns.', icon: 'delapouite/plant-roots.svg' }),
  ],
};

export const FORMA_SALVATGE: SkillDefinition = {
  id: 'forma-salvatge', displayName: 'Forma Salvatge', classCss: 'druida', category: 'player',
  description: 'Transformació en bèstia per al combat cos a cos.',
  iconPath: 'icons/000000/transparent/1x1/lorc/werewolf.svg',
  actions: [
    action({ id: 'urpada-salvatge', name: 'Urpada salvatge', skillId: 'forma-salvatge', unlock: 1, type: ActionType.Atac, speed: 9, damage: d(1, 4), desc: 'Un cop ràpid amb urpes; devastador en forma salvatge.', icon: 'lorc/grasping-claws.svg' }),
    action({ id: 'forma-salvatge', name: 'Forma salvatge', skillId: 'forma-salvatge', unlock: 15, type: ActionType.Focus, speed: 3, effects: [{ type: 'wild_shape', params: { pv: 4, skill: 8 } }], desc: 'Et transformes en bèstia: més PV i més poder de combat.', icon: 'lorc/werewolf.svg' }),
  ],
};

export const DIVINE_NATURE_SKILLS: SkillDefinition[] = [
  FE_DIVINA, ESGRIMA_SAGRADA, MAGIA_NATURA, FORMA_SALVATGE,
];
