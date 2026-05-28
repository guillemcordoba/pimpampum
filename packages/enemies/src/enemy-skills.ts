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
    action({ id: 'atac-horda', name: 'Atac de la horda', skillId: 'tactiques-goblin', unlock: 1, type: ActionType.Atac, speed: 0, damage: d(0, 0), effects: [{ type: 'crossfire', params: { kind: 'damage', max: 10 } }], desc: '{DAMAGE}+1 per cada aliat que també ataqui aquest torn.', icon: 'delapouite/goblin-head.svg' }),
    action({ id: 'punyalada-rapida', name: 'Punyalada ràpida', skillId: 'tactiques-goblin', unlock: 1, type: ActionType.Atac, speed: 3, damage: d(1, 4, -2), desc: 'Una ganivetada ràpida.', icon: 'lorc/plain-dagger.svg' }),
    action({ id: 'protegir-clan', name: 'Protegir el clan', skillId: 'tactiques-goblin', unlock: 1, type: ActionType.Defensa, speed: 2, rollBonus: 3, desc: '', icon: 'willdabeast/round-shield.svg' }),
    action({ id: 'amagar-se', name: 'Amagar-se', skillId: 'tactiques-goblin', unlock: 1, type: ActionType.Focus, speed: 2, effects: [{ type: 'nimble_escape', params: { amount: 1 } }], desc: "Esquives tots els atacs aquest torn. El següent torn, {A}+1 per cada goblin que s'hagi amagat.", icon: 'lorc/hidden.svg' }),
  ],
};

export const XAMANISME_GOBLIN: SkillDefinition = {
  id: 'xamanisme-goblin', displayName: 'Xamanisme Goblin', classCss: 'goblin-shaman', category: 'enemy',
  description: 'Màgia bruta de llamps i sang.',
  iconPath: 'icons/000000/transparent/1x1/delapouite/skull-staff.svg',
  actions: [
    action({ id: 'llamp', name: 'Llamp', skillId: 'xamanisme-goblin', unlock: 1, type: ActionType.Atac, speed: 0, damage: d(2, 4, -2), desc: 'Un llamp cru.', icon: 'lorc/lightning-arc.svg' }),
    action({ id: 'possessio-demoniaca', name: 'Possessió demoníaca', skillId: 'xamanisme-goblin', unlock: 1, type: ActionType.Focus, speed: -3, effects: [{ type: 'skill_mod', params: { kind: 'attack', amount: 3, dice: d(1, 6), target: 'self', duration: 'restOfCombat' } }], desc: '{A}+1d6+3 per la resta del combat.', icon: 'lorc/daemon-skull.svg' }),
    action({ id: 'set-de-sang', name: 'Set de sang', skillId: 'xamanisme-goblin', unlock: 1, type: ActionType.Focus, speed: -4, effects: [{ type: 'wound_wounded', params: { damage: 1 } }], desc: 'Cada enemic que hagi perdut una vida durant aquest combat perd una altra vida.', icon: 'skoll/blood.svg' }),
    action({ id: 'pluja-de-flames', name: 'Pluja de flames', skillId: 'xamanisme-goblin', unlock: 1, type: ActionType.Atac, speed: -4, damage: d(1, 4, -2), targetCount: 3, desc: 'Afecta a 3 enemics que triïs.', icon: 'lorc/flame-spin.svg' }),
    action({ id: 'absorvir-dolor', name: 'Absorvir dolor', skillId: 'xamanisme-goblin', unlock: 1, type: ActionType.Defensa, speed: 3, rollBonus: 4, effects: [{ type: 'buff_on_block', params: { kind: 'defense', amount: 1, duration: 'restOfCombat', target: 'self' } }], desc: 'Si absorveix un atac, {D}+1 per la resta del combat.', icon: 'lorc/back-pain.svg' }),
  ],
};

export const PETRIFICACIO: SkillDefinition = {
  id: 'petrificacio', displayName: 'Petrificació', classCss: 'basilisc', category: 'enemy',
  description: 'La mirada que converteix en pedra.',
  iconPath: 'icons/000000/transparent/1x1/lorc/gaze.svg',
  actions: [
    action({ id: 'esclafament', name: 'Esclafament', skillId: 'petrificacio', unlock: 1, type: ActionType.Atac, speed: -3, damage: d(2, 6), effects: [{ type: 'self_stun', params: { turns: 1 } }], desc: "L'atac més brutal. Saltes el proper torn.", icon: 'lorc/stoned-skull.svg' }),
    action({ id: 'mirada-petrificant', name: 'Mirada petrificant', skillId: 'petrificacio', unlock: 1, type: ActionType.Focus, speed: -2, effects: [{ type: 'contested_stun', params: { turns: 3, target: 'enemies' } }], desc: 'Per cada enemic: **d20+{A} teva > d20+habilitat enemiga**: queda petrificat (salta els 3 propers torns).', icon: 'lorc/gaze.svg' }),
  ],
};

export const VERI: SkillDefinition = {
  id: 'veri', displayName: 'Verí', classCss: 'basilisc', category: 'enemy',
  description: 'Atacs verinosos i regeneració reptiliana.',
  iconPath: 'icons/000000/transparent/1x1/lorc/snake-bite.svg',
  actions: [
    action({ id: 'mossegada-verinosa', name: 'Mossegada verinosa', skillId: 'veri', unlock: 1, type: ActionType.Atac, speed: 0, damage: d(1, 8), effects: [{ type: 'poison_on_hit', params: { damage: 1, turns: 1, name: 'verí' } }], desc: "Si fa ferida, l'enemic perd una vida addicional al final del següent torn.", icon: 'lorc/snake-bite.svg' }),
    action({ id: 'cop-de-cua', name: 'Cop de cua', skillId: 'veri', unlock: 1, type: ActionType.Atac, speed: 2, damage: d(1, 8), targetCount: 3, desc: 'Colpeja fins a 3 enemics amb la cua.', icon: 'lorc/spiked-tail.svg' }),
    action({ id: 'escames-impenetrables', name: 'Escames impenetrables', skillId: 'veri', unlock: 1, type: ActionType.Defensa, speed: 4, rollBonus: 4, desc: '', icon: 'lorc/lizardman.svg' }),
    action({ id: 'regeneracio', name: 'Regeneració', skillId: 'veri', unlock: 1, type: ActionType.Focus, speed: -4, effects: [{ type: 'heal', params: { amount: 2, target: 'self' } }], desc: 'Cura 2 vides.', icon: 'lorc/snake.svg' }),
  ],
};

export const FOC_INFERNAL: SkillDefinition = {
  id: 'foc-infernal', displayName: 'Foc Infernal', classCss: 'diable-espinos', category: 'enemy',
  description: 'Foc demoníac que crema i persisteix.',
  iconPath: 'icons/000000/transparent/1x1/lorc/fire-ray.svg',
  actions: [
    action({ id: 'espina-de-foc', name: 'Espina de foc', skillId: 'foc-infernal', unlock: 1, type: ActionType.Atac, speed: 1, damage: d(1, 4), effects: [{ type: 'crossfire', params: { max: 3 } }], desc: "Guanyes +1 a l'atac per cada aliat que també ataqui (màx +3).", icon: 'lorc/fire-ray.svg' }),
    action({ id: 'mossegada-en-vol', name: 'Mossegada en vol', skillId: 'foc-infernal', unlock: 1, type: ActionType.Atac, speed: 4, damage: d(1, 4, -1), rollBonus: 4, effects: [{ type: 'evasion_after_attack', params: {} }], desc: "Després d'atacar, esquives tots els atacs aquest torn.", icon: 'lorc/bat-wing.svg' }),
    action({ id: 'cortina-de-foc', name: 'Cortina de foc', skillId: 'foc-infernal', unlock: 1, type: ActionType.Defensa, speed: 2, rollBonus: 3, desc: '', icon: 'lorc/fire-shield.svg' }),
    action({ id: 'foc-persistent', name: 'Foc persistent', skillId: 'foc-infernal', unlock: 1, type: ActionType.Focus, speed: 0, effects: [{ type: 'dot', params: { damage: 1, turns: 1, target: 'enemy', name: 'foc persistent' } }], desc: "L'enemic seleccionat perd una vida al començament del pròxim torn.", icon: 'lorc/flame-spin.svg' }),
  ],
};

export const MALDAT_OSSIA: SkillDefinition = {
  id: 'maldat-ossia', displayName: 'Maldat Òssia', classCss: 'diable-dos', category: 'enemy',
  description: 'Atacs òssis verinosos i defenses esquelètiques.',
  iconPath: 'icons/000000/transparent/1x1/lorc/ribcage.svg',
  actions: [
    action({ id: 'fiblo-verinos', name: 'Fibló verinós', skillId: 'maldat-ossia', unlock: 1, type: ActionType.Atac, speed: 0, damage: d(1, 6), effects: [{ type: 'debuff_on_hit', params: { kind: 'defense', amount: 2, duration: 'restOfCombat' } }], desc: "Si fa ferida, l'enemic perd {D}-2 permanentment.", icon: 'lorc/poison-gas.svg' }),
    action({ id: 'esgarrapada', name: 'Esgarrapada', skillId: 'maldat-ossia', unlock: 1, type: ActionType.Atac, speed: 3, damage: d(1, 4), desc: 'Una esgarrapada ràpida.', icon: 'lorc/claw-slashes.svg' }),
    action({ id: 'defensa-esqueletica', name: 'Defensa esquelètica', skillId: 'maldat-ossia', unlock: 1, type: ActionType.Defensa, speed: 3, rollBonus: 4, desc: '', icon: 'lorc/ribcage.svg' }),
  ],
};

export const TERROR: SkillDefinition = {
  id: 'terror', displayName: 'Terror', classCss: 'diable-dos', category: 'enemy',
  description: 'Por sobrenatural que debilita els enemics.',
  iconPath: 'icons/000000/transparent/1x1/lorc/screaming.svg',
  actions: [
    action({ id: 'udol-de-terror', name: 'Udol de terror', skillId: 'terror', unlock: 1, type: ActionType.Focus, speed: -2, effects: [
      { type: 'skill_mod', params: { kind: 'attack', amount: -2, target: 'enemies', duration: 2 } },
      { type: 'skill_mod', params: { kind: 'defense', amount: -2, target: 'enemies', duration: 2 } },
      { type: 'skill_mod', params: { kind: 'speed', amount: -2, target: 'enemies', duration: 2 } },
    ], desc: 'Tots els enemics reben {A}-2, {A}-2, {D}-2, {V}-2 durant 2 torns.', icon: 'lorc/screaming.svg' }),
    action({ id: 'marca-de-la-mort', name: 'Marca de la mort', skillId: 'terror', unlock: 1, type: ActionType.Focus, speed: -1, effects: [{ type: 'doom_mark', params: { amount: 1, turns: -1 } }], desc: 'Marca un enemic. La pròxima ferida que rebi li costa una vida addicional.', icon: 'lorc/death-zone.svg' }),
  ],
};

export const COMBAT_DIABOLIC: SkillDefinition = {
  id: 'combat-diabolic', displayName: 'Combat Diabòlic', classCss: 'diable-banyut', category: 'enemy',
  description: 'Atacs brutals amb forques i represàlies.',
  iconPath: 'icons/000000/transparent/1x1/lorc/trident.svg',
  actions: [
    action({ id: 'forquilla-del-diable', name: 'Forquilla del diable', skillId: 'combat-diabolic', unlock: 1, type: ActionType.Atac, speed: 0, damage: d(1, 8), effects: [{ type: 'undefendable_on_hit', params: { turns: 2 } }], desc: "Si fa ferida, l'enemic no pot ser defensat durant 2 torns.", icon: 'lorc/trident.svg' }),
    action({ id: 'sentencia-infernal', name: 'Sentència infernal', skillId: 'combat-diabolic', unlock: 1, type: ActionType.Atac, speed: -4, damage: d(2, 6), effects: [{ type: 'double_wound', params: { amount: 4 } }], desc: "Si fa ferida, l'enemic perd 2 vides en total.", icon: 'lorc/flaming-trident.svg' }),
    action({ id: 'defensa-diabolica', name: 'Defensa diabòlica', skillId: 'combat-diabolic', unlock: 1, type: ActionType.Defensa, speed: 1, rollBonus: 4, effects: [{ type: 'retaliate_wound', params: { amount: 1 } }], desc: "Si bloqueges un atac, l'atacant perd una vida.", icon: 'lorc/spiked-armor.svg' }),
  ],
};

export const FOC_AVERN: SkillDefinition = {
  id: 'foc-avern', displayName: "Foc de l'Avern", classCss: 'diable-banyut', category: 'enemy',
  description: "Flames de l'avern que abasten i debiliten.",
  iconPath: 'icons/000000/transparent/1x1/lorc/fire-breath.svg',
  actions: [
    action({ id: 'ale-de-l-infern', name: "Alè de l'infern", skillId: 'foc-avern', unlock: 1, type: ActionType.Atac, speed: 0, damage: d(1, 4), targetCount: 3, desc: 'Crema tres enemics amb un alè de foc infernal.', icon: 'lorc/fire-breath.svg' }),
    action({ id: 'pilar-de-foc', name: 'Pilar de foc', skillId: 'foc-avern', unlock: 1, type: ActionType.Atac, speed: -2, damage: d(1, 6), effects: [{ type: 'debuff_on_hit', params: { kind: 'attack', amount: 3, duration: 2 } }], desc: "Si fa ferida, l'enemic perd {A}-3 durant 2 torns.", icon: 'lorc/fire-zone.svg' }),
    action({ id: 'flames-de-l-avern', name: "Flames de l'avern", skillId: 'foc-avern', unlock: 1, type: ActionType.Focus, speed: -3, effects: [{ type: 'skill_mod', params: { kind: 'defense', amount: -2, target: 'enemies', duration: 'restOfCombat' } }], desc: "Invoca les flames de l'avern. Tots els enemics perden {D}-2 permanentment.", icon: 'lorc/flame-tunnel.svg' }),
  ],
};

export const FORCA_PEDRA: SkillDefinition = {
  id: 'forca-pedra', displayName: 'Força de Pedra', classCss: 'golem-de-pedra', category: 'enemy',
  description: 'La força implacable de la pedra.',
  iconPath: 'icons/000000/transparent/1x1/lorc/fist.svg',
  actions: [
    action({ id: 'cop-de-pedra', name: 'Cop de pedra', skillId: 'forca-pedra', unlock: 1, type: ActionType.Atac, speed: -1, damage: d(1, 6), desc: 'Un cop contundent de pedra.', icon: 'lorc/fist.svg' }),
    action({ id: 'destrossa', name: 'Destrossa', skillId: 'forca-pedra', unlock: 1, type: ActionType.Atac, speed: -3, damage: d(1, 8), effects: [{ type: 'double_wound', params: { amount: 3 } }], desc: 'Cop devastador que causa 2 ferides si fa mal.', icon: 'lorc/thor-fist.svg' }),
    action({ id: 'terratremol', name: 'Terratrèmol', skillId: 'forca-pedra', unlock: 1, type: ActionType.Atac, speed: -2, damage: d(1, 4), targetCount: 3, desc: 'Colpeja el terra amb força, afectant fins a 3 enemics.', icon: 'lorc/quake-stomp.svg' }),
    action({ id: 'mur-de-pedra', name: 'Mur de pedra', skillId: 'forca-pedra', unlock: 1, type: ActionType.Defensa, speed: -1, rollBonus: 2, effects: [{ type: 'retaliate_wound', params: { amount: 1 } }], desc: 'El cos de pedra fa mal als atacants que colpegen el gòlem.', icon: 'delapouite/stone-wall.svg' }),
    action({ id: 'enduriment', name: 'Enduriment', skillId: 'forca-pedra', unlock: 1, type: ActionType.Focus, speed: -2, effects: [
      { type: 'skill_mod', params: { kind: 'defense', amount: 2, target: 'self', duration: 'restOfCombat' } },
      { type: 'skill_mod', params: { kind: 'attack', amount: 1, target: 'self', duration: 'restOfCombat' } },
    ], desc: 'Endureix el cos de pedra permanentment: {D}+2, {A}+1.', icon: 'lorc/stone-sphere.svg' }),
  ],
};

export const INSTINT_MANADA: SkillDefinition = {
  id: 'instint-manada', displayName: 'Instint de Manada', classCss: 'llop', category: 'enemy',
  description: 'Caça coordinada en manada.',
  iconPath: 'icons/000000/transparent/1x1/lorc/wolf-head.svg',
  actions: [
    action({ id: 'mossegada-manada', name: 'Mossegada de la manada', skillId: 'instint-manada', unlock: 1, type: ActionType.Atac, speed: 1, damage: d(1, 4), effects: [{ type: 'pack', params: { per: 4, max: 5 } }], desc: "Guanyes +1 a l'atac per cada 4 aliats vius.", icon: 'delapouite/neck-bite.svg' }),
    action({ id: 'urpa-rapida', name: 'Urpa ràpida', skillId: 'instint-manada', unlock: 1, type: ActionType.Atac, speed: 3, damage: d(1, 4, -1), desc: 'Un cop ràpid amb les urpes.', icon: 'delapouite/claws.svg' }),
    action({ id: 'protegir-manada', name: 'Protegir la manada', skillId: 'instint-manada', unlock: 1, type: ActionType.Defensa, speed: 1, rollBonus: 2, desc: '', icon: 'lorc/paw-front.svg' }),
    action({ id: 'udol', name: 'Udol', skillId: 'instint-manada', unlock: 1, type: ActionType.Focus, speed: -2, effects: [{ type: 'summon', params: { factory: makeWolf } }], desc: 'Crida un llop nou al combat. S\'interromp si rep un atac.', icon: 'lorc/wolf-howl.svg' }),
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
