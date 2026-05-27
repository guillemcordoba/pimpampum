import { ActionType, ActionDefinition, createCharacter, Character } from '@pimpampum/engine';
import { SkillDefinition, action, d } from '@pimpampum/skills';

// Enemy skills live here (not in @pimpampum/skills) so they only surface in the
// enemy section of the app. They reuse the generic SkillDefinition/action helpers
// and the effect handlers registered by @pimpampum/skills.

export const TACTIQUES_GOBLIN: SkillDefinition = {
  id: 'tactiques-goblin', displayName: 'Tàctiques de Goblin', classCss: 'goblin', category: 'enemy',
  description: 'Lluita en horda: febles sols, perillosos en grup.',
  iconPath: 'icons/000000/transparent/1x1/delapouite/goblin-head.svg',
  actions: [
    action({ id: 'atac-horda', name: 'Atac de la horda', skillId: 'tactiques-goblin', unlock: 1, type: ActionType.Atac, speed: 7, damage: d(1, 4), effects: [{ type: 'crossfire', params: { max: 6 } }], desc: 'Més fort com més goblins ataquen alhora.', icon: 'delapouite/goblin-head.svg' }),
    action({ id: 'punyalada-rapida', name: 'Punyalada ràpida', skillId: 'tactiques-goblin', unlock: 1, type: ActionType.Atac, speed: 11, damage: d(1, 4, -1), desc: 'Una ganivetada ràpida.', icon: 'lorc/plain-dagger.svg' }),
    action({ id: 'protegir-clan', name: 'Protegir el clan', skillId: 'tactiques-goblin', unlock: 1, type: ActionType.Defensa, speed: 9, desc: 'Protegeix un altre goblin.', icon: 'willdabeast/round-shield.svg' }),
    action({ id: 'amagar-se', name: 'Amagar-se', skillId: 'tactiques-goblin', unlock: 1, type: ActionType.Focus, speed: 12, rollBonus: 7, effects: [{ type: 'evasion', params: {} }], desc: "S'amaga i esquiva els atacs aquest torn.", icon: 'lorc/hidden.svg' }),
  ],
};

export const XAMANISME_GOBLIN: SkillDefinition = {
  id: 'xamanisme-goblin', displayName: 'Xamanisme Goblin', classCss: 'goblin-shaman', category: 'enemy',
  description: 'Màgia bruta de llamps i sang.',
  iconPath: 'icons/000000/transparent/1x1/delapouite/skull-staff.svg',
  actions: [
    action({ id: 'llamp', name: 'Llamp', skillId: 'xamanisme-goblin', unlock: 1, type: ActionType.Atac, speed: 7, damage: d(1, 6), desc: 'Un llamp cru.', icon: 'lorc/lightning-arc.svg' }),
    action({ id: 'pluja-de-flames', name: 'Pluja de flames', skillId: 'xamanisme-goblin', unlock: 1, type: ActionType.Atac, speed: 4, damage: d(1, 4), targetCount: 3, desc: 'Flames sobre 3 enemics.', icon: 'lorc/flame-spin.svg' }),
    action({ id: 'absorvir-dolor', name: 'Absorvir dolor', skillId: 'xamanisme-goblin', unlock: 1, type: ActionType.Defensa, speed: 10, effects: [{ type: 'self_armor', params: { amount: 2 } }], desc: 'Absorbeix el dolor dels atacs.', icon: 'lorc/back-pain.svg' }),
    action({ id: 'possessio-demoniaca', name: 'Possessió demoníaca', skillId: 'xamanisme-goblin', unlock: 1, type: ActionType.Focus, speed: 3, effects: [{ type: 'skill_mod', params: { amount: 9, target: 'self', duration: 'restOfCombat' } }], desc: 'Un dimoni el posseeix i el fa molt més poderós.', icon: 'lorc/daemon-skull.svg' }),
  ],
};

export const PETRIFICACIO: SkillDefinition = {
  id: 'petrificacio', displayName: 'Petrificació', classCss: 'basilisc', category: 'enemy',
  description: 'La mirada que converteix en pedra.',
  iconPath: 'icons/000000/transparent/1x1/lorc/gaze.svg',
  actions: [
    action({ id: 'esclafament', name: 'Esclafament', skillId: 'petrificacio', unlock: 1, type: ActionType.Atac, speed: 3, damage: d(2, 6), desc: 'Un cop demolidor.', icon: 'lorc/stoned-skull.svg' }),
    action({ id: 'mirada-petrificant', name: 'Mirada petrificant', skillId: 'petrificacio', unlock: 1, type: ActionType.Focus, speed: 5, effects: [{ type: 'stun', params: { turns: 2, target: 'enemy' } }], desc: 'La mirada petrifica un enemic (salta 2 torns).', icon: 'lorc/gaze.svg' }),
  ],
};

export const VERI: SkillDefinition = {
  id: 'veri', displayName: 'Verí', classCss: 'basilisc', category: 'enemy',
  description: 'Atacs verinosos i regeneració reptiliana.',
  iconPath: 'icons/000000/transparent/1x1/lorc/snake-bite.svg',
  actions: [
    action({ id: 'mossegada-verinosa', name: 'Mossegada verinosa', skillId: 'veri', unlock: 1, type: ActionType.Atac, speed: 6, damage: d(1, 8), effects: [{ type: 'poison_on_hit', params: { damage: 3, turns: 3, name: 'verí' } }], desc: 'Una mossegada que injecta verí.', icon: 'lorc/snake-bite.svg' }),
    action({ id: 'cop-de-cua', name: 'Cop de cua', skillId: 'veri', unlock: 1, type: ActionType.Atac, speed: 8, damage: d(1, 8), targetCount: 3, desc: 'Un cop de cua que abasta 3 enemics.', icon: 'lorc/spiked-tail.svg' }),
    action({ id: 'escames-impenetrables', name: 'Escames impenetrables', skillId: 'veri', unlock: 1, type: ActionType.Defensa, speed: 12, rollBonus: 2, desc: 'Les escames desvien els atacs.', icon: 'lorc/lizardman.svg' }),
    action({ id: 'regeneracio', name: 'Regeneració', skillId: 'veri', unlock: 1, type: ActionType.Focus, speed: 3, effects: [{ type: 'regen', params: { amount: 1, turns: 4 } }], desc: 'Regenera ferides durant uns torns.', icon: 'lorc/snake.svg' }),
  ],
};

export const FOC_INFERNAL: SkillDefinition = {
  id: 'foc-infernal', displayName: 'Foc Infernal', classCss: 'diable-espinos', category: 'enemy',
  description: 'Foc demoníac que crema i persisteix.',
  iconPath: 'icons/000000/transparent/1x1/lorc/fire-ray.svg',
  actions: [
    action({ id: 'espina-de-foc', name: 'Espina de foc', skillId: 'foc-infernal', unlock: 1, type: ActionType.Atac, speed: 8, damage: d(1, 4), effects: [{ type: 'crossfire', params: { max: 3 } }], desc: 'Una espina ardent; més forta en grup.', icon: 'lorc/fire-ray.svg' }),
    action({ id: 'mossegada-en-vol', name: 'Mossegada en vol', skillId: 'foc-infernal', unlock: 1, type: ActionType.Atac, speed: 11, damage: d(1, 4), desc: "Ataca i s'allunya volant.", icon: 'lorc/bat-wing.svg' }),
    action({ id: 'cortina-de-foc', name: 'Cortina de foc', skillId: 'foc-infernal', unlock: 1, type: ActionType.Defensa, speed: 9, desc: 'Una cortina de flames protectora.', icon: 'lorc/fire-shield.svg' }),
    action({ id: 'foc-persistent', name: 'Foc persistent', skillId: 'foc-infernal', unlock: 1, type: ActionType.Focus, speed: 7, effects: [{ type: 'dot', params: { damage: 3, turns: 3, target: 'enemy', name: 'foc persistent' } }], desc: 'Un enemic crema durant uns torns.', icon: 'lorc/flame-spin.svg' }),
  ],
};

export const MALDAT_OSSIA: SkillDefinition = {
  id: 'maldat-ossia', displayName: 'Maldat Òssia', classCss: 'diable-dos', category: 'enemy',
  description: 'Atacs òssis verinosos i defenses esquelètiques.',
  iconPath: 'icons/000000/transparent/1x1/lorc/ribcage.svg',
  actions: [
    action({ id: 'fiblo-verinos', name: 'Fibló verinós', skillId: 'maldat-ossia', unlock: 1, type: ActionType.Atac, speed: 7, damage: d(1, 6), effects: [{ type: 'debuff_on_hit', params: { kind: 'defense', amount: 6, duration: 'restOfCombat' } }], desc: "Un fibló que debilita permanentment.", icon: 'lorc/poison-gas.svg' }),
    action({ id: 'esgarrapada', name: 'Esgarrapada', skillId: 'maldat-ossia', unlock: 1, type: ActionType.Atac, speed: 10, damage: d(1, 4), desc: 'Una esgarrapada ràpida.', icon: 'lorc/claw-slashes.svg' }),
    action({ id: 'defensa-esqueletica', name: 'Defensa esquelètica', skillId: 'maldat-ossia', unlock: 1, type: ActionType.Defensa, speed: 10, rollBonus: 1, desc: 'Els ossos desvien els atacs.', icon: 'lorc/ribcage.svg' }),
  ],
};

export const TERROR: SkillDefinition = {
  id: 'terror', displayName: 'Terror', classCss: 'diable-dos', category: 'enemy',
  description: 'Por sobrenatural que debilita els enemics.',
  iconPath: 'icons/000000/transparent/1x1/lorc/screaming.svg',
  actions: [
    action({ id: 'udol-de-terror', name: 'Udol de terror', skillId: 'terror', unlock: 1, type: ActionType.Focus, speed: 5, effects: [{ type: 'skill_mod', params: { amount: -6, target: 'enemies', duration: 2 } }], desc: 'Un udol que aterreix tots els enemics 2 torns.', icon: 'lorc/screaming.svg' }),
    action({ id: 'marca-de-la-mort', name: 'Marca de la mort', skillId: 'terror', unlock: 1, type: ActionType.Focus, speed: 6, effects: [{ type: 'skill_mod', params: { kind: 'defense', amount: -10, target: 'enemy', duration: 'restOfCombat' } }], desc: 'Marca un enemic: queda exposat la resta del combat.', icon: 'lorc/death-zone.svg' }),
  ],
};

export const COMBAT_DIABOLIC: SkillDefinition = {
  id: 'combat-diabolic', displayName: 'Combat Diabòlic', classCss: 'diable-banyut', category: 'enemy',
  description: 'Atacs brutals amb forques i represàlies.',
  iconPath: 'icons/000000/transparent/1x1/lorc/trident.svg',
  actions: [
    action({ id: 'forquilla-del-diable', name: 'Forquilla del diable', skillId: 'combat-diabolic', unlock: 1, type: ActionType.Atac, speed: 6, damage: d(1, 8), effects: [{ type: 'debuff_on_hit', params: { amount: 6, duration: 2 } }], desc: 'Una forca que empala i debilita.', icon: 'lorc/trident.svg' }),
    action({ id: 'sentencia-infernal', name: 'Sentència infernal', skillId: 'combat-diabolic', unlock: 1, type: ActionType.Atac, speed: 3, damage: d(2, 6), effects: [{ type: 'bonus_damage', params: { amount: 3 } }], desc: 'Un cop sentenciós i devastador.', icon: 'lorc/flaming-trident.svg' }),
    action({ id: 'defensa-diabolica', name: 'Defensa diabòlica', skillId: 'combat-diabolic', unlock: 1, type: ActionType.Defensa, speed: 9, effects: [{ type: 'retaliate_wound', params: { amount: 3 } }], desc: "Si bloqueges, l'atacant rep dany.", icon: 'lorc/spiked-armor.svg' }),
  ],
};

export const FOC_AVERN: SkillDefinition = {
  id: 'foc-avern', displayName: "Foc de l'Avern", classCss: 'diable-banyut', category: 'enemy',
  description: "Flames de l'avern que abasten i debiliten.",
  iconPath: 'icons/000000/transparent/1x1/lorc/fire-breath.svg',
  actions: [
    action({ id: 'ale-de-l-infern', name: "Alè de l'infern", skillId: 'foc-avern', unlock: 1, type: ActionType.Atac, speed: 6, damage: d(1, 4), targetCount: 3, desc: 'Un alè de foc sobre 3 enemics.', icon: 'lorc/fire-breath.svg' }),
    action({ id: 'pilar-de-foc', name: 'Pilar de foc', skillId: 'foc-avern', unlock: 1, type: ActionType.Atac, speed: 4, damage: d(1, 6), effects: [{ type: 'debuff_on_hit', params: { amount: 6, duration: 2 } }], desc: 'Un pilar de foc que crema i debilita.', icon: 'lorc/fire-zone.svg' }),
    action({ id: 'flames-de-l-avern', name: "Flames de l'avern", skillId: 'foc-avern', unlock: 1, type: ActionType.Focus, speed: 3, effects: [{ type: 'skill_mod', params: { kind: 'defense', amount: -6, target: 'enemies', duration: 'restOfCombat' } }], desc: "Les flames de l'avern exposen tots els enemics.", icon: 'lorc/flame-tunnel.svg' }),
  ],
};

export const FORCA_PEDRA: SkillDefinition = {
  id: 'forca-pedra', displayName: 'Força de Pedra', classCss: 'golem-de-pedra', category: 'enemy',
  description: 'La força implacable de la pedra.',
  iconPath: 'icons/000000/transparent/1x1/lorc/fist.svg',
  actions: [
    action({ id: 'cop-de-pedra', name: 'Cop de pedra', skillId: 'forca-pedra', unlock: 1, type: ActionType.Atac, speed: 5, damage: d(1, 6), desc: 'Un cop contundent de pedra.', icon: 'lorc/fist.svg' }),
    action({ id: 'destrossa', name: 'Destrossa', skillId: 'forca-pedra', unlock: 1, type: ActionType.Atac, speed: 3, damage: d(1, 8), effects: [{ type: 'bonus_damage', params: { amount: 3 } }], desc: 'Un cop devastador.', icon: 'lorc/thor-fist.svg' }),
    action({ id: 'terratremol', name: 'Terratrèmol', skillId: 'forca-pedra', unlock: 1, type: ActionType.Atac, speed: 4, damage: d(1, 4), targetCount: 3, desc: 'Sacseja el terra i abasta 3 enemics.', icon: 'lorc/quake-stomp.svg' }),
    action({ id: 'mur-de-pedra', name: 'Mur de pedra', skillId: 'forca-pedra', unlock: 1, type: ActionType.Defensa, speed: 7, effects: [{ type: 'retaliate_wound', params: { amount: 2 } }], desc: 'Un mur de pedra que fereix els atacants.', icon: 'delapouite/stone-wall.svg' }),
    action({ id: 'enduriment', name: 'Enduriment', skillId: 'forca-pedra', unlock: 1, type: ActionType.Focus, speed: 5, effects: [{ type: 'skill_mod', params: { kind: 'defense', amount: 6, target: 'self', duration: 'restOfCombat' } }], desc: 'Endureix el cos de pedra permanentment.', icon: 'lorc/stone-sphere.svg' }),
  ],
};

export const INSTINT_MANADA: SkillDefinition = {
  id: 'instint-manada', displayName: 'Instint de Manada', classCss: 'llop', category: 'enemy',
  description: 'Caça coordinada en manada.',
  iconPath: 'icons/000000/transparent/1x1/lorc/wolf-head.svg',
  actions: [
    action({ id: 'mossegada-manada', name: 'Mossegada de la manada', skillId: 'instint-manada', unlock: 1, type: ActionType.Atac, speed: 8, damage: d(1, 4), effects: [{ type: 'pack', params: { per: 2, max: 5 } }], desc: 'Més forta com més llops vius hi ha.', icon: 'delapouite/neck-bite.svg' }),
    action({ id: 'urpa-rapida', name: 'Urpa ràpida', skillId: 'instint-manada', unlock: 1, type: ActionType.Atac, speed: 11, damage: d(1, 4, -1), desc: 'Un cop ràpid amb les urpes.', icon: 'delapouite/claws.svg' }),
    action({ id: 'protegir-manada', name: 'Protegir la manada', skillId: 'instint-manada', unlock: 1, type: ActionType.Defensa, speed: 9, desc: 'Protegeix un altre llop.', icon: 'lorc/paw-front.svg' }),
    action({ id: 'udol', name: 'Udol', skillId: 'instint-manada', unlock: 1, type: ActionType.Focus, speed: 4, effects: [{ type: 'summon', params: { factory: makeWolf } }], desc: 'Crida un nou llop al combat.', icon: 'lorc/wolf-howl.svg' }),
  ],
};

/** Build a summoned wolf at a modest fixed level (used by the Udol action). */
function makeWolf(): Character {
  return createCharacter({
    name: 'Llop', classCss: 'llop', category: 'enemy', pv: 4,
    skills: { 'instint-manada': 20 },
    actions: INSTINT_MANADA.actions,
    iconPath: 'icons/000000/transparent/1x1/lorc/wolf-head.svg',
  });
}

export const ENEMY_SKILLS: SkillDefinition[] = [
  TACTIQUES_GOBLIN, XAMANISME_GOBLIN, PETRIFICACIO, VERI, FOC_INFERNAL,
  MALDAT_OSSIA, TERROR, COMBAT_DIABOLIC, FOC_AVERN, FORCA_PEDRA, INSTINT_MANADA,
];

const enemySkillIndex = new Map(ENEMY_SKILLS.map(s => [s.id, s]));
export function getEnemySkill(id: string): SkillDefinition | undefined {
  return enemySkillIndex.get(id);
}

const enemyActionIndex = new Map<string, ActionDefinition>();
for (const s of ENEMY_SKILLS) for (const a of s.actions) enemyActionIndex.set(a.id, a);

export const ENEMY_ACTIONS: ActionDefinition[] = [...enemyActionIndex.values()];
export function getEnemyAction(id: string): ActionDefinition | undefined {
  return enemyActionIndex.get(id);
}

/** Enemy actions a skill makes available at or below the given level. */
export function unlockedEnemyActions(skillId: string, level: number): ActionDefinition[] {
  const s = enemySkillIndex.get(skillId);
  return s ? s.actions.filter(a => a.unlockLevel <= level) : [];
}
