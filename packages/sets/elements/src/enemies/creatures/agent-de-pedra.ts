import { ActionType, EffectHandler } from '@pimpampum/engine';
import { SkillDefinition, action, d } from '../../players/types.js';
import { EnemyDefinition, ICON } from '../types.js';

/**
 * The stone city's secret police (the Dai Li): stone gloves fired on chains,
 * that grab a hero and drag them away from anyone who could protect them —
 * then the rest close in. They walk on walls, and they are not there when you
 * look.
 */
const AGENT_EFFECTS: Record<string, EffectHandler> = {
  // Captura: an isolated hero is a captured one.
  capture: {
    modifyAttack(ctx) {
      if (ctx.attackMods && ctx.target?.hasStatus('aillat')) ctx.attackMods.rollBonus += 4;
    },
    aiWeight(ctx) { return ctx.enemies.some(e => e.hasStatus('aillat')) ? 1.5 : 0.5; },
  },
};

const AGENT_SKILL: SkillDefinition = {
  id: 'agent-de-pedra', displayName: 'Agent de pedra', classCss: 'agent-pedra', category: 'enemy',
  description: "Guants de pedra amb cadenes: t'arrosseguen lluny de qui et podria protegir. Caminen per les parets.",
  iconPath: ICON + 'lorc/hood.svg',
  actions: [
    action({
      id: 'guant-de-pedra', name: 'Guant de pedra', skillId: 'agent-de-pedra',
      unlock: 1, type: ActionType.Atac, speed: 2, dice: d(1, 6),
      effects: [{ type: 'isolate_on_hit' }],
      desc: "Si encerta, ningú no pot protegir l'objectiu el torn següent.",
      icon: 'lorc/fist.svg',
    }),
    action({
      id: 'fondre-s-a-la-paret', name: "Fondre's a la paret", skillId: 'agent-de-pedra',
      unlock: 2, type: ActionType.Focus, speed: 4,
      effects: [{ type: 'vanish', params: { attack: 3 } }],
      desc: "Aquest torn ningú no t'ataca. El torn següent, {A}+3.",
      icon: 'lorc/stone-wall.svg',
    }),
    action({
      id: 'captura', name: 'Captura', skillId: 'agent-de-pedra',
      unlock: 3, type: ActionType.Atac, speed: 0, dice: d(2, 6),
      effects: [{ type: 'capture' }],
      desc: "+4 si ningú no pot protegir l'objectiu.",
      icon: 'lorc/manacles.svg',
    }),
  ],
  effects: AGENT_EFFECTS,
};

export const AGENT_DE_PEDRA: EnemyDefinition = {
  id: 'agent-de-pedra', displayName: 'Agent de pedra', classCss: 'agent-pedra', iconPath: ICON + 'lorc/hood.svg',
  /** ~70 kg — a man in a robe. */
  bulk: 1.0,
  skills: [AGENT_SKILL],
};
