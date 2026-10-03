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
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { type ActionDefinition, type Character } from '@pimpampum/engine';
import {
  actionPrint, type GameSet, type KitInfo, type PartySpec, type SubjectKit,
} from '@pimpampum/bench';
import {
  ALL_SKILLS, buildComposition, buildReferenceParty, createRegistry, ENEMY_DEFINITIONS, fullKitLevel,
  getEnemy, getSkill, PLAYER_PV, registerSkill, solveEncounter,
  type SkillDefinition, unlockedActions, unregisterSkill,
} from '../index.js';
import { CALIBRATION_KITS, COMPANY, FAIR, MAX_AVG_ROUNDS, SATURATION, SHAPES } from './shapes.js';
import { hero, MAIN_KITS, REFERENCE_KITS } from './reference.js';
import { PIN, pin, PINNED } from './pinned.js';

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

/**
 * THE CODE A KIT RUNS, fingerprinted — not just its card data.
 *
 * A card's data says which handler it calls and with what params; it cannot
 * say what the handler DOES. Editing a handler used to leave every cached
 * number standing, measured with the old code. So a kit's print includes the
 * source of its own file (where its handlers and status behaviours live, by the
 * co-location rule) and of everything shared (generic effects, equipment, the
 * builders) — editing one kit's file still invalidates only that kit's rows,
 * and editing shared code invalidates everyone's, which is correct.
 *
 * Read from `src/`, beside the `dist/` this runs from. A missing tree prints
 * as such rather than as nothing, so it can never collide with a real print.
 */
const SRC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../src');
const OWN_FILES = ['players/skills', 'enemies/creatures'];
const sourceMemo = new Map<string, string>();

function hashFiles(files: string[]): string {
  const h = crypto.createHash('sha1');
  // RELATIVE paths: an absolute one made the same content fingerprint
  // differently in every clone and worktree, so a cache could never be shared.
  for (const f of files.sort()) { h.update(path.relative(SRC, f)); h.update(fs.readFileSync(f, 'utf8')); }
  return h.digest('hex').slice(0, 12);
}

function tsFiles(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(e => {
    const full = path.join(dir, e.name);
    return e.isDirectory() ? tsFiles(full) : e.name.endsWith('.ts') ? [full] : [];
  });
}

/** Every content file that is not one kit's own, and not calibration. */
function sharedPrint(): string {
  let p = sourceMemo.get('shared');
  if (p === undefined) {
    const own = OWN_FILES.map(d => path.join(SRC, d));
    const files = tsFiles(SRC).filter(f =>
      !f.startsWith(path.join(SRC, 'bench')) && !own.some(d => f.startsWith(d)));
    p = files.length ? hashFiles(files) : 'no-source';
    sourceMemo.set('shared', p);
  }
  return p;
}

/** The kit's own file (found by its id) plus the shared code. */
function sourcePrint(dir: string, id: string): string {
  const k = `${dir}:${id}`;
  let p = sourceMemo.get(k);
  if (p === undefined) {
    const mine = tsFiles(path.join(SRC, dir))
      .filter(f => fs.readFileSync(f, 'utf8').includes(`'${id}'`));
    p = `${mine.length ? hashFiles(mine) : 'no-file'}+${sharedPrint()}`;
    sourceMemo.set(k, p);
  }
  return p;
}

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

  playerPV: PLAYER_PV,

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
    fair: FAIR,
    maxAvgRounds: MAX_AVG_ROUNDS,
    saturation: SATURATION,
    mainKits: MAIN_KITS.map(s => s.id),
    aiBlindCards: {
      'estat-de-flux': 'grants post-reveal card swaps. The AI commits blind and never '
        + 'swaps, so the card is worth exactly nothing to it and everything to a player '
        + 'who can see the reveal. Its own handler already says so (aiWeight 0.2).',
    },
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
