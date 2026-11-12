/**
 * THE FANTASY SET — the game this project has actually been designing.
 *
 * Everything here is an adapter. The set's root entry (`../index.ts`) owns the
 * content; `@pimpampum/bench` owns the instrument; this file is the
 * one place that knows both, and it exists so that neither has to know the
 * other. Delete it and the measurement layer still compiles, still runs its
 * own tests, and simply has no content installed — which is the property that
 * makes a second set (Star Wars, hard-SF) possible at all.
 *
 * The calibration — which kits make a fair benchmark party, which creatures
 * make a fair fight, where the neutral baseline sits — lives with the content,
 * in `reference.ts` and `shapes.ts` next door. That is deliberate and it is
 * the lesson of the refactor: those numbers were in bench, and having them
 * there is exactly why bench could only ever measure one game.
 */
import { type ActionDefinition, type Character } from '@pimpampum/engine';
import {
  actionPrint, type GameSet, type KitInfo, type PartySpec, type SubjectKit,
} from '@pimpampum/bench';
import { sourcePrinter } from '@pimpampum/set-common/bench';
import { COMMON_AI_BLIND_CARDS } from '@pimpampum/set-common';
import {
  ALL_SKILLS, buildComposition, buildReferenceParty, createRegistry, ENEMY_DEFINITIONS, fullKitLevel,
  getEnemy, getSkill, PLAYER_PV, registerSkill, solveEncounter,
  type SkillDefinition, unlockedActions, unregisterSkill,
} from '../index.js';
import { CALIBRATION_KITS, COMPANY, FAIR, HERO_LEVEL, MAX_AVG_ROUNDS, SATURATION, SHAPES } from './shapes.js';
import { hero, MAIN_KITS, REFERENCE_KITS } from './reference.js';
import { PIN, pin, PINNED, SRC } from './pinned.js';

/**
 * A synthetic control kit dressed as a real one.
 *
 * `SubjectKit` is deliberately thin — an id, some actions, some handlers —
 * because that is all a control NEEDS and all a second set could be asked to
 * support. The display fields a `SkillDefinition` also carries are pure
 * presentation, so filling them in with placeholders here costs nothing and
 * keeps the catalogue's type honest.
 */
function asSkill(kit: SubjectKit): SkillDefinition {
  return {
    id: kit.id, displayName: kit.id, classCss: 'objecte', category: 'player',
    description: 'control', iconPath: '', actions: kit.actions, effects: kit.effects ?? {},
  };
}

const sourcePrint = sourcePrinter(SRC);

function kit(id: string): KitInfo | undefined {
  const skill = getSkill(id);
  if (skill) return { id, side: 'player', actions: skill.actions, fullLevel: skill.actions.length };
  const creature = getEnemy(id);
  if (creature) {
    return {
      id, side: 'enemy', actions: creature.skills.flatMap(s => s.actions), fullLevel: fullKitLevel(creature),
    };
  }
  return undefined;
}

export const FANTASY: GameSet = {
  id: 'fantasy',

  registry: createRegistry,

  buildParty(spec: PartySpec): Character[] {
    return buildReferenceParty(spec);
  },

  buildEncounter(groups) {
    return buildComposition(groups);
  },

  /**
   * A drawn party at a per-player skill budget.
   *
   * One draw, shared with the balancer — `buildReferenceParty`'s DRAWN flavour.
   * `equip: false` is expressed as armour 0, the closest the one draw offers:
   * it still hands out the kit-mandated weapon, because a weapon kit without a
   * weapon rolls flat zero and measures as broken rather than as unequipped.
   */
  randomParty(prefix, size, budget, equip = true, pv = PLAYER_PV) {
    return buildReferenceParty({
      count: size, levels: budget, armor: equip ? [0, 1, 2] : 0, pv, prefix,
    });
  },


  kit,

  kitIds(side) {
    return side === 'player' ? ALL_SKILLS.map(s => s.id) : ENEMY_DEFINITIONS.map(e => e.id);
  },

  hero,

  solveEncounter(pool, party, target, opts) {
    return solveEncounter(pool, party as PartySpec, target, opts);
  },

  calibration: {
    // The calibration fields the PINNED kits (./pinned.ts): editing a live kit
    // re-measures that kit and leaves every baseline standing.
    referenceKits: REFERENCE_KITS.map(pin),
    shapes: SHAPES,
    company: COMPANY.map(row => row.map(pin)),
    standIns: CALIBRATION_KITS.map(pin),
    heroLevel: HERO_LEVEL,
    fair: FAIR,
    maxAvgRounds: MAX_AVG_ROUNDS,
    saturation: SATURATION,
    mainKits: MAIN_KITS.map(s => s.id),
    aiBlindCards: { ...COMMON_AI_BLIND_CARDS },
  },

  installKit(subject: SubjectKit): () => void {
    const def = asSkill(subject);
    registerSkill(def);
    return () => unregisterSkill(def);
  },

  unlockedActions(kitId: string, level: number): ActionDefinition[] {
    return unlockedActions(kitId, level);
  },

  skillPrint(id: string): string {
    const s = getSkill(id);
    return s
      ? `${s.id}:${s.actions.map(actionPrint).join('|')}:${sourcePrint(id.endsWith(PIN) ? 'bench/calibration-kits' : 'players/skills', id)}`
      : `${id}:?`;
  },

  enemyPrint(id: string): string {
    const e = getEnemy(id);
    return e
      ? `${e.id}:${e.bulk ?? 1}:${e.skills.flatMap(s => s.actions).map(actionPrint).join('|')}`
        + `:${sourcePrint('enemies/creatures', id)}`
      : `${id}:?`;
  },

  /**
   * Everything that changes a fight, in one string.
   *
   * Every player kit and every enemy, not a hand-listed subset: a fingerprint
   * that missed one would serve cached numbers for content as it used to be,
   * which is the worst failure the cache could have.
   */
  print(): string {
    return [
      'fantasy',
      ...ALL_SKILLS.map(s => this.skillPrint(s.id)),
      ...PINNED.map(s => this.skillPrint(s.id)),
      ...ENEMY_DEFINITIONS.map(e => this.enemyPrint(e.id)),
    ].join('\n');
  },
};

export * from './reference.js';
export * from './shapes.js';
export { calibrationDrift, pin, PIN, PINNED, REFRESHED } from './pinned.js';
