/**
 * THE ARENA — the shared registry, seeded team generation, and match running.
 *
 * Moved here from `tests/helpers.ts`, where it had two problems. It was the
 * only party generator in the repo that drew from bare `Math.random()`, so
 * every mirror sweep in the package was irreproducible and, worse, shared NO
 * random numbers between the arms it was comparing — half a dozen harnesses
 * mutate a card, re-run, and read a 1-2pp difference off uncorrelated samples.
 * And it lived under `tests/` while nine non-test scripts imported it.
 *
 * Randomness now flows through the engine's `random()`, exactly as
 * `skills/src/party.ts` already documents for the balancer's own draw: "a
 * seeded caller gets a reproducible party". Wrap a sweep in `withSeed` (or use
 * `sweep()` below) and every arm meets the same teams and the same dice.
 */
import {
  Character, CombatEngine, CombatStats, EffectRegistry,
  mergeCombatStats, newCombatStats, random, setAIControlled, withSeed,
} from '@pimpampum/engine';
import {
  ALL_EQUIPMENT, ALL_POTIONS, COMPLEMENTARY_SKILLS, PLAYER_PV, PLAYER_SKILLS,
  buildCharacter, createRegistry,
} from '@pimpampum/skills';
import { registerEnemySkills } from '@pimpampum/enemies';

/** Shared registry for all simulations (player + enemy skill handlers).
 *  `registerEnemySkills` is not optional — without it enemy-specific handlers
 *  are missing and enemy cards silently do nothing. */
export const REGISTRY: EffectRegistry = createRegistry();
registerEnemySkills(REGISTRY);

export { PLAYER_PV };

export function shuffle<T>(arr: readonly T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function pick<T>(arr: readonly T[]): T {
  return arr[Math.floor(random() * arr.length)];
}

/** Randomly equip ~half the slots, one item each. */
function randomEquipment(): string[] {
  const bySlot = new Map<string, string[]>();
  for (const e of ALL_EQUIPMENT) {
    if (!bySlot.has(e.slot)) bySlot.set(e.slot, []);
    bySlot.get(e.slot)!.push(e.id);
  }
  const chosen: string[] = [];
  for (const ids of bySlot.values()) {
    if (random() < 0.5) chosen.push(pick(ids));
  }
  return chosen;
}

/**
 * A random player with total skill levels summing to ~budget over 1-2 skills.
 *
 * Models INTENDED play rather than uniform randomness, the same way the
 * balancer's own draw does: the first skill is always a MAIN kit, the
 * complementary kits only ever appear as a second skill, and a weapon kit is
 * guaranteed a weapon (its cards roll flat zero without one — defaulting to
 * the bastó would hand it the worst weapon half the time, a systematic
 * handicap rather than flavour).
 */
export function randomPlayer(name: string, budget: number, equip = true, pv = PLAYER_PV): Character {
  const mains = PLAYER_SKILLS.filter(s => !COMPLEMENTARY_SKILLS.has(s.id));
  const main = shuffle(mains)[0];
  const chosen = [main];
  if (random() < 0.5) chosen.push(shuffle(PLAYER_SKILLS.filter(s => s !== main))[0]);

  const skills: Record<string, number> = {};
  let remaining = budget;
  chosen.forEach((s, i) => {
    const last = i === chosen.length - 1;
    const want = last ? remaining : Math.round(remaining * (0.5 + random() * 0.3));
    skills[s.id] = Math.max(1, Math.min(s.actions.length, want));
    remaining -= skills[s.id];
  });

  const equipment = equip ? randomEquipment() : [];
  const usesWeapon = chosen.some(s => s.actions.some(a => a.effects.some(e => e.type === 'weapon_damage')));
  const hasWeapon = equipment.some(id => ['basto', 'destral', 'gran-destral'].includes(id));
  if (usesWeapon && !hasWeapon) equipment.push('destral');
  // Roughly a third of characters carry one random potion (loot economy).
  const potions = equip && random() < 0.35 ? [pick(ALL_POTIONS).id] : [];

  return buildCharacter({
    name, classCss: chosen[0].classCss, iconPath: chosen[0].iconPath,
    pv, skills, equipment, potions,
  });
}

/** A team of `size` random players, each with the given per-player budget. */
export function randomTeam(
  prefix: string, size: number, perPlayerBudget: number, equip = true, pv = PLAYER_PV,
): Character[] {
  return Array.from({ length: size }, (_, i) => randomPlayer(`${prefix}${i + 1}`, perPlayerBudget, equip, pv));
}

/**
 * How hard both sides think in a mirror match. Depth 1 is what the balancer
 * prices at, so a kit's mirror winrate and its encounter price mean the same
 * thing — at ~6× the compute. Tests that only check SYMMETRY (a mirror is
 * 50/50 at any depth) pass 0 to stay fast.
 */
export const MIRROR_DEPTH = 1;

/** Run one match; returns the winning team index (0/1) or null for a draw. */
export function runMatch(
  teamA: Character[], teamB: Character[], stats?: CombatStats,
  maxRounds = 40, aiDepth = MIRROR_DEPTH,
): number | null {
  setAIControlled(teamA);
  setAIControlled(teamB);
  return new CombatEngine(teamA, teamB, { registry: REGISTRY, maxRounds, aiDepth }).runCombat(stats).winner;
}

export interface MatchupResult {
  games: number;
  aWins: number;
  bWins: number;
  draws: number;
  totalRounds: number;
}

/** Repeatedly fight two freshly-built teams (factories) and tally results. */
export function runMatchup(
  makeA: () => Character[], makeB: () => Character[], games: number,
  stats?: CombatStats, aiDepth = MIRROR_DEPTH,
): MatchupResult {
  const res: MatchupResult = { games, aWins: 0, bWins: 0, draws: 0, totalRounds: 0 };
  for (let i = 0; i < games; i++) {
    // Always collect locally: `totalRounds` used to read 0 whenever the caller
    // passed no `stats`, because the counter it summed was never handed to the
    // engine. A silent zero in a rounds column is exactly the kind of number
    // this package exists to not print.
    const local = newCombatStats();
    const winner = runMatch(makeA(), makeB(), local, 40, aiDepth);
    if (stats) mergeCombatStats(stats, local);
    res.totalRounds += local.rounds;
    if (winner === 0) res.aWins++;
    else if (winner === 1) res.bWins++;
    else res.draws++;
  }
  return res;
}

/**
 * THE MIRROR SWEEP — several arms of a content experiment, compared honestly.
 *
 * Five harnesses had copy-pasted this loop (`experiment-berserk`, `-heal`,
 * `-objects`, `-tuning`, `-balance-pass`): mutate a card's params, run N mirror
 * matches, tally, restore. Three things it gets right that a hand-rolled copy
 * kept getting wrong:
 *
 *  - COMMON RANDOM NUMBERS. Every arm runs on the same seed, so each meets the
 *    same teams and the same dice and differs only by the mutation. Without it
 *    the arms are independent samples, and at a 1-in-7 chance the subject kit
 *    even appears, that is a couple of points of noise on a difference these
 *    harnesses routinely read at one point. (Partial, not perfect: the arms
 *    share a dice STREAM but desynchronise once a mutated card changes a
 *    decision. It tightens the comparison; it does not make it exact, which is
 *    why the error bars stay the conservative independent ones.)
 *  - RESTORE EVEN ON A THROW. The arms mutate shared content — `ALL_EQUIPMENT`,
 *    a card's `params` — in place. Every copy restored by hand at the end, so
 *    an exception mid-sweep left the game mutated for every later arm in the
 *    process, and the numbers after it were about content nobody chose.
 *  - The tally is the caller's, so this owns the loop and not the question.
 */
export interface SweepArm<T> {
  label: string;
  /** Mutate shared content for this arm. Undone automatically afterwards. */
  apply?: () => void;
  /** Called once per match with the two teams and the winner. */
  tally: (a: Character[], b: Character[], winner: number | null) => void;
  /** Read the arm's answer once its matches are done. */
  read: () => T;
}

export interface SweepOptions {
  games: number;
  seed: number;
  size?: number;
  budget?: number;
  /** PV per generated player — the PV/armour tuning sweep varies it per arm. */
  pv?: number;
  stats?: CombatStats;
  aiDepth?: number;
}

export function mirrorSweep<T>(arms: SweepArm<T>[], opts: SweepOptions): { label: string; result: T }[] {
  const { games, seed, size = 2, budget = 6, pv = PLAYER_PV, aiDepth = MIRROR_DEPTH } = opts;
  const out: { label: string; result: T }[] = [];
  for (const arm of arms) {
    // `finally`, not "at the end": a throw in one arm must not leave the
    // content mutated for the next one.
    try {
      arm.apply?.();
      withSeed(seed, () => {
        for (let i = 0; i < games; i++) {
          const a = randomTeam('A', size, budget, true, pv);
          const b = randomTeam('B', size, budget, true, pv);
          arm.tally(a, b, runMatch(a, b, opts.stats, 40, aiDepth));
        }
      });
      out.push({ label: arm.label, result: arm.read() });
    } finally {
      restoreAll();
    }
  }
  return out;
}

/**
 * Snapshot-and-restore for in-place content mutation.
 *
 * `mutate(obj, patch)` records the fields it overwrites the FIRST time an
 * object is touched, so `restoreAll()` puts everything back however many arms
 * scribbled on it.
 */
const snapshots = new Map<object, Record<string, unknown>>();

export function mutate<T extends object>(target: T, patch: Partial<T>): void {
  let snap = snapshots.get(target);
  if (!snap) { snap = {}; snapshots.set(target, snap); }
  for (const k of Object.keys(patch) as (keyof T & string)[]) {
    if (!(k in snap)) snap[k] = target[k];
    (target as Record<string, unknown>)[k] = patch[k] as unknown;
  }
}

/** Put every mutated object back. Called for you by `mirrorSweep`. */
export function restoreAll(): void {
  for (const [target, snap] of snapshots) {
    for (const [k, v] of Object.entries(snap)) (target as Record<string, unknown>)[k] = v;
  }
  snapshots.clear();
}
