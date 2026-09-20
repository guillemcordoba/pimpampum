import { ActionType, EffectHandler, createCharacter, Character } from '@pimpampum/engine';
import { SkillDefinition, action, d, COP_DESESPERAT } from '@pimpampum/skills';
import { EnemyDefinition, ICON } from '../types.js';

/**
 * A lone wolf is nothing; a pack brings down an elk.
 *
 * The Llop could not reach an even fight at ANY body count or level — the only
 * creature in the game that never could (measured repeatedly, most recently
 * 2026-09-20). The reason was arithmetic: its whole kit was a 1d2 claw, and
 * flat armour subtracts the same number from every blow, so a jab that averages
 * 1.5 is deleted outright by leather. More wolves did not help, because more
 * nothings are still nothing.
 *
 * So the pack has to be worth something MECHANICALLY, not just numerically.
 * These two effects are the hunt: wolves do not bite harder together, they bite
 * from every side at once, and prey cannot parry six directions.
 */
const WOLF_EFFECTS: Record<string, EffectHandler> = {
  /**
   * Every other living packmate lowers the prey's defense.
   *
   * `defensePenalty` rather than a roll bonus, deliberately: surrounding
   * someone does nothing if they are not defending, which is exactly right —
   * the pack's advantage is that the prey has too many directions to cover, not
   * that each bite lands harder.
   */
  pack_hunt: {
    modifyAttack(ctx) {
      if (!ctx.attackMods) return;
      const pack = ctx.engine.livingTeam(ctx.source.team).filter(c => c !== ctx.source).length;
      ctx.attackMods.defensePenalty += pack * (ctx.params?.per as number ?? 1);
    },
    aiWeight(ctx) { return ctx.allies.length >= 2 ? 1.5 : 0.7; },
  },
};

const WOLF_SKILL: SkillDefinition = {
  id: 'wolf', displayName: 'Llop', classCss: 'llop', category: 'enemy',
  description: 'Caça coordinada en manada.',
  iconPath: ICON + 'lorc/wolf-head.svg',
  actions: [
    // 1d2 was below the floor flat armour sets: leather alone deleted it.
    action({ id: 'urpa-rapida', name: 'Urpa ràpida', skillId: 'wolf', unlock: 1, type: ActionType.Atac, speed: 3, dice: d(1, 4), desc: '', icon: 'delapouite/claws.svg' }),
    action({ id: 'udol', name: 'Udol', skillId: 'wolf', unlock: 2, type: ActionType.Focus, speed: -2, effects: [{ type: 'summon', params: { factory: makeWolf, maxTeam: 6 } }], desc: 'Crida un llop nou al combat, fins a un màxim de 6 llops que hagin participat en la batalla.', icon: 'lorc/wolf-howl.svg' }),
    action({
      id: 'caca-en-manada', name: 'Caça en manada', skillId: 'wolf',
      unlock: 3, type: ActionType.Atac, speed: 1, dice: d(1, 6),
      effects: [{ type: 'pack_hunt', params: { per: 1 } }],
      desc: 'La defensa de l\'objectiu baixa 1 per cada altre llop viu.',
      icon: 'lorc/wolf-howl.svg',
    }),
  ],
  effects: WOLF_EFFECTS,
};

/** Build a summoned wolf (used by the Udol action). Summoned wolves answer the
 *  howl — they don't get to lead one themselves, which bounds the pack (no
 *  summon-stall chains). */
function makeWolf(): Character {
  return createCharacter({
    name: 'Llop', classCss: 'llop', category: 'enemy', pv: 5,
    skills: { 'wolf': 1 }, // knows urpa; no udol (excluded below anyway)
    actions: [...WOLF_SKILL.actions.filter(a => a.id !== 'udol'), COP_DESESPERAT],
    iconPath: ICON + 'lorc/wolf-head.svg',
  });
}

export const WOLF: EnemyDefinition = {
  id: 'wolf', displayName: 'Llop', classCss: 'llop', iconPath: ICON + 'lorc/wolf-head.svg',
  /** ~45 kg — a grey wolf (32-65 kg male, 27-45 female). */
  bulk: 0.86,
  skills: [WOLF_SKILL],
};
