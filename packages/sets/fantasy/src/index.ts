/**
 * THE FANTASY SET — the game this project has actually been designing.
 *
 * Everything here is an adapter. `@pimpampum/skills` and `@pimpampum/enemies`
 * own the content; `@pimpampum/bench` owns the instrument; this file is the
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
  actionPrint, type Cell, type GameSet, type PartySpec, type Shape, type SubjectKit,
} from '@pimpampum/bench';
import {
  ALL_SKILLS, buildCharacter, buildReferenceParty, createRegistry, getSkill, PLAYER_PV,
  registerSkill, type SkillDefinition, unlockedActions, unregisterSkill,
} from '@pimpampum/skills';
import { buildComposition, getEnemy, registerEnemySkills } from '@pimpampum/enemies';
import { calibrationParty, COMPANY, SHAPES, saturatedCells, usableCells } from './shapes.js';
import { referenceParty } from './reference.js';

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

export const FANTASY: GameSet = {
  id: 'fantasy',

  registry() {
    // `registerEnemySkills` is not optional: without it the enemy handlers are
    // missing and enemy cards silently resolve to nothing, which prices every
    // fight as trivial with no error anywhere.
    const r = createRegistry();
    registerEnemySkills(r);
    return r;
  },

  buildParty(spec: PartySpec): Character[] {
    return buildReferenceParty(spec as Parameters<typeof buildReferenceParty>[0]);
  },

  buildEncounter(groups) {
    return buildComposition(groups);
  },

  /**
   * A drawn party at a per-player skill budget.
   *
   * One draw, shared with the balancer — `buildReferenceParty`'s DRAWN flavour.
   * The bench used to carry a second generator with its own equipment
   * distribution, which meant "a typical party" had two different answers
   * depending on which harness asked.
   *
   * `equip: false` is expressed as armour 0, the closest the one draw offers:
   * it still hands out the kit-mandated weapon, because a weapon kit without a
   * weapon rolls flat zero and measures as broken rather than as unequipped.
   */
  randomParty(prefix, size, budget, equip = true, pv = PLAYER_PV) {
    return buildReferenceParty({
      count: size, levels: budget, armor: equip ? [0, 1, 2] : 0, pv, prefix,
    });
  },

  playerPV: PLAYER_PV,

  referenceParty(): PartySpec {
    return referenceParty() as PartySpec;
  },

  calibrationParty(companyIdx: number): PartySpec {
    return calibrationParty(companyIdx) as PartySpec;
  },

  companyCount: COMPANY.length,

  shapes(): Shape[] {
    return SHAPES as Shape[];
  },

  cells(): Cell[] {
    return usableCells();
  },

  saturatedCells(): Cell[] {
    return saturatedCells();
  },

  installKit(kit: SubjectKit): () => void {
    const def = asSkill(kit);
    registerSkill(def);
    return () => unregisterSkill(def);
  },

  unlockedActions(kitId: string, level: number): ActionDefinition[] {
    return unlockedActions(kitId, level);
  },

  skillPrint(id: string): string {
    const s = getSkill(id) ?? ALL_SKILLS.find(x => x.id === id);
    return s ? `${s.id}:${s.actions.map(actionPrint).join('|')}` : `${id}:?`;
  },

  enemyPrint(id: string): string {
    const e = getEnemy(id);
    return e
      ? `${e.id}:${e.bulk ?? 1}:${e.skills.flatMap(s => s.actions).map(actionPrint).join('|')}`
      : `${id}:?`;
  },

  /**
   * Everything that changes a fight, in one string.
   *
   * Every player kit and every enemy, not a hand-listed subset: a fingerprint
   * that missed one would serve cached numbers for content as it used to be,
   * which is the worst failure the cache could have. It is cheap — the
   * per-kit prints are memoised by bench, and `print()` is asked for once.
   */
  print(): string {
    return [
      'fantasy',
      ...ALL_SKILLS.map(s => this.skillPrint(s.id)),
      ...SHAPES.flatMap(s => s.pool.map(p => this.enemyPrint(p.enemyId))),
    ].join('\n');
  },
};

export { referenceParty, calibrationParty, SHAPES, COMPANY };
export * from './reference.js';
export * from './shapes.js';
