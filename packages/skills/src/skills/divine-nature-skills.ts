import { ActionType } from '@pimpampum/engine';
import { SkillDefinition, action, d } from './skill-types.js';

export const FE_DIVINA: SkillDefinition = {
  id: 'fe-divina', displayName: 'Fe Divina', classCss: 'paladi', category: 'player',
  description: 'Protecció divina i curació per als aliats.',
  iconPath: 'icons/000000/transparent/1x1/lorc/prayer.svg',
  actions: [
    action({ id: 'aura-protectora', name: 'Aura protectora', skillId: 'fe-divina', unlock: 1, type: ActionType.Defensa, speed: 1, rollBonus: 3, targetCount: 10, desc: 'Defensa tots els aliats a la vegada.', icon: 'lorc/beams-aura.svg' }),
    action({ id: 'escut-de-fe', name: 'Escut de fe', skillId: 'fe-divina', unlock: 15, type: ActionType.Defensa, speed: 1, rollBonus: 3, effects: [{ type: 'buff_on_block', params: { kind: 'defense', amount: 1, duration: 'restOfCombat', target: 'ally' } }], desc: "Si un atac falla, l'aliat defensat guanya {D}+1 per la resta del combat.", icon: 'lorc/bolt-shield.svg' }),
    action({ id: 'imposicio-de-mans', name: 'Imposició de mans', skillId: 'fe-divina', unlock: 25, type: ActionType.Focus, speed: -2, effects: [
      { type: 'heal', params: { amount: 1, target: 'ally' } },
      { type: 'cleanse', params: { target: 'ally' } },
    ], desc: 'Cura 1 vida a un aliat (o a tu mateix) i elimina efectes negatius.', icon: 'lorc/glowing-hands.svg' }),
    action({ id: 'jurament-sagrat', name: 'Jurament sagrat', skillId: 'fe-divina', unlock: 40, type: ActionType.Focus, speed: -4, effects: [{ type: 'skill_mod', params: { kind: 'attack', amount: 2, target: 'self', duration: 'restOfCombat' } }], desc: 'Guanyes {A}+2 i {A}+2 per la resta del combat.', icon: 'lorc/aura.svg' }),
  ],
};

export const ESGRIMA_SAGRADA: SkillDefinition = {
  id: 'esgrima-sagrada', displayName: 'Esgrima Sagrada', classCss: 'paladi', category: 'player',
  description: 'Atacs sagrats que castiguen els enemics.',
  iconPath: 'icons/000000/transparent/1x1/lorc/winged-sword.svg',
  actions: [
    action({ id: 'escomesa-sagrada', name: 'Escomesa sagrada', skillId: 'esgrima-sagrada', unlock: 1, type: ActionType.Atac, speed: 0, damage: d(1, 6), effects: [{ type: 'buff_on_hit', params: { kind: 'defense', amount: 1, duration: 'nextTurn' } }], desc: 'Guanyes {D}+1 el pròxim torn.', icon: 'lorc/sword-clash.svg' }),
    action({ id: 'castig-divi', name: 'Càstig diví', skillId: 'esgrima-sagrada', unlock: 25, type: ActionType.Atac, speed: -1, damage: d(1, 4), effects: [{ type: 'skill_bonus_from', params: { skillId: 'fe-divina' } }], desc: "Suma la teva {A} a la tirada d'atac.", icon: 'lorc/shining-sword.svg' }),
  ],
};

export const MAGIA_NATURA: SkillDefinition = {
  id: 'magia-natura', displayName: 'Màgia de la Natura', classCss: 'druida', category: 'player',
  description: 'El poder de la natura: espines, llum lunar i escorça.',
  iconPath: 'icons/000000/transparent/1x1/lorc/oak.svg',
  actions: [
    action({ id: 'fuet-espines', name: "Fuet d'espines", skillId: 'magia-natura', unlock: 1, type: ActionType.Atac, speed: 1, damage: d(1, 6), desc: 'Atac màgic ràpid amb espines de natura.', icon: 'lorc/vine-whip.svg' }),
    action({ id: 'pell-escorca', name: "Pell d'escorça", skillId: 'magia-natura', unlock: 10, type: ActionType.Defensa, speed: 1, rollBonus: 3, desc: '', icon: 'lorc/tree-branch.svg' }),
    action({ id: 'raig-de-lluna', name: 'Raig de lluna', skillId: 'magia-natura', unlock: 25, type: ActionType.Atac, speed: -2, damage: d(1, 10), desc: 'Raig de llum lunar lent però potent.', icon: 'lorc/moon.svg' }),
    action({ id: 'lligams-natura', name: 'Lligams de natura', skillId: 'magia-natura', unlock: 35, type: ActionType.Focus, speed: -2, effects: [
      { type: 'skill_mod', params: { kind: 'speed', amount: -3, target: 'enemy', duration: 2 } },
      { type: 'skill_mod', params: { kind: 'defense', amount: -2, target: 'enemy', duration: 2 } },
    ], desc: 'Tria un enemic. {V}-3 i {D}-2 durant els pròxims 2 torns.', icon: 'delapouite/plant-roots.svg' }),
  ],
};

export const FORMA_SALVATGE: SkillDefinition = {
  id: 'forma-salvatge', displayName: 'Forma Salvatge', classCss: 'druida', category: 'player',
  description: 'Transformació en bèstia per al combat cos a cos.',
  iconPath: 'icons/000000/transparent/1x1/lorc/werewolf.svg',
  actions: [
    action({ id: 'urpada-salvatge', name: 'Urpada salvatge', skillId: 'forma-salvatge', unlock: 1, type: ActionType.Atac, speed: 2, damage: d(1, 4), desc: 'Cop ràpid amb instint animal. Devastador després de Forma salvatge.', icon: 'lorc/grasping-claws.svg' }),
    action({ id: 'forma-salvatge-canvi', name: 'Forma salvatge', skillId: 'forma-salvatge', unlock: 15, type: ActionType.Focus, speed: -4, effects: [{ type: 'wild_shape', params: { pv: 1, attack: 4, defense: 1 } }], desc: 'Transformació en bèstia: {A}+4, {D}+1 i +1 PV per la resta del combat. Un sol ús.', icon: 'lorc/werewolf.svg' }),
  ],
};

export const DIVINE_NATURE_SKILLS: SkillDefinition[] = [
  FE_DIVINA, ESGRIMA_SAGRADA, MAGIA_NATURA, FORMA_SALVATGE,
];
