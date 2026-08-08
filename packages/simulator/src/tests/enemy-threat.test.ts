import { describe, it, expect } from 'vitest';
import { CombatEngine, setAIControlled, withSeed } from '@pimpampum/engine';
import { buildReferenceParty, PartySpec } from '@pimpampum/skills';
import {
  ENEMY_DEFINITIONS, generateEncounter, solveEncounter, buildSolvedEncounter,
} from '@pimpampum/enemies';
import { REGISTRY } from './helpers.js';

/**
 * Balancer v3 guard. The solver no longer predicts a winrate from fitted
 * scalars — it MEASURES one by playing the encounter. So this guard doesn't
 * check a model against reality; it checks that the solver actually converges:
 * re-play each solved encounter with an INDEPENDENT seed and a freshly drawn
 * party, and the winrate must land near the one it reported.
 *
 * That catches the failures the simulated balancer can still have — a search
 * that stops in the wrong place, a clamp reported as a hit, a solve that
 * overfits its own sample — without any per-template constant to maintain.
 */
const GAMES = 200;
/**
 * This compares two NOISY estimates, so the tolerance is set by sampling, not
 * by solver quality. Measured spread of a 200-game estimate is ~4.4pp (1σ) —
 * wider than the binomial 3.5pp because the party is redrawn per game — so the
 * difference of two estimates has σ ≈ 6.2pp. 18pp is ~3σ: tight enough to
 * catch a solver that lands in the wrong place, loose enough not to flake.
 */
const TOLERANCE = 0.18;
/** Solves run at a modest sample so the suite stays quick. */
const SOLVE_OPTS = { games: 160, searchGames: 100 } as const;

/** The balancer prices at aiDepth 1, so the replay must think just as hard —
 *  grading a solve made under strong play with a weaker AI measures the gap
 *  between the two settings, not the solver. */
const REPLAY_DEPTH = 1;

/** Independent re-measurement of a solved encounter. */
function verify(solvedGroups: () => ReturnType<typeof buildSolvedEncounter>, party: PartySpec, seed: number): number {
  return withSeed(seed, () => {
    let wins = 0;
    for (let i = 0; i < GAMES; i++) {
      const players = buildReferenceParty(party);
      setAIControlled(players);
      const enemies = solvedGroups();
      const w = new CombatEngine(players, enemies, {
        registry: REGISTRY, maxRounds: 40, aiDepth: REPLAY_DEPTH,
      }).runCombat().winner;
      if (w === 0) wins++;
      else if (w === null) wins += 0.5;
    }
    return wins / GAMES;
  });
}

/** Bodies to field per template in these guards. The balancer prices any
 *  count, so this is the TEST's choice of a natural-looking fight, not data
 *  the content carries. */
const FIELDED: Record<string, number> = {
  goblin: 6, 'spined-devil': 6, wolf: 6,
  'goblin-shaman': 3, 'bone-devil': 3, 'stone-golem': 3,
  basilisk: 1, 'horned-devil': 1,
};

describe('balancer v3: solved encounters hold up on an independent replay', () => {
  for (const t of ENEMY_DEFINITIONS) {
    it(`${t.id}: solved encounters land near their measured winrate`, () => {
      const party: PartySpec = { count: 4, levels: 6, armor: 1 };
      for (const target of [0.5, 0.75]) {
        const solved = generateEncounter(t, FIELDED[t.id] ?? 3, party, target, SOLVE_OPTS);
        expect(solved).toBeTruthy();
        const real = verify(() => buildSolvedEncounter(solved!), party, 4242);
        const label = solved!.groups.map(g => `${g.count}× pv${g.pv}`).join(', ');
        expect(
          Math.abs(real - solved!.predictedWinrate),
          `${t.id} target ${target}: reported ${(100 * solved!.predictedWinrate).toFixed(0)}%, replay ${(100 * real).toFixed(0)}% (${label})`,
        ).toBeLessThan(TOLERANCE);
      }
    });
  }
});

describe('balancer v3: the solver hits the requested difficulty', () => {
  /** How far the ACHIEVED winrate may sit from the REQUESTED one. Wider than
   *  the replay tolerance because two things stack: PV is an INTEGER lever, so
   *  at small bodies a single point is worth several winrate points and some
   *  targets are genuinely unreachable; and the search runs on a cheap sample.
   *  The solver always reports what it actually achieved, so a miss is visible
   *  to the caller rather than hidden. */
  const TARGET_TOLERANCE = 0.18;

  for (const [label, party, enemyId, count] of [
    ['4 players, cuir', { count: 4, levels: 6, armor: 1 }, 'goblin', 6],
    ['4 players, no armour', { count: 4, levels: 6, armor: 0 }, 'goblin', 6],
    ['4 players, ferro', { count: 4, levels: 6, armor: 2 }, 'goblin', 6],
    ['3 players', { count: 3, levels: 6, armor: 1 }, 'goblin', 5],
    ['6 players', { count: 6, levels: 6, armor: 1 }, 'goblin', 8],
    ['5 players, 5 levels', { count: 5, levels: 5, armor: 1 }, 'goblin', 7],
    ['elit squad', { count: 4, levels: 6, armor: 1 }, 'stone-golem', 3],
    ['solitari boss', { count: 4, levels: 6, armor: 1 }, 'horned-devil', 1],
  ] as const) {
    it(`${label}: reaches its target or reports the miss`, () => {
      const target = 0.65;
      const solved = solveEncounter([{ enemyId, count }], party as PartySpec, target, SOLVE_OPTS);
      expect(solved).toBeTruthy();
      // A clamped solve is an HONEST miss (the target is unreachable with this
      // composition), so it only has to say so — not to hit the number. Same
      // for a duration-capped one: the difficulty was reachable only by
      // dragging the fight out, which the solver refuses to do.
      if (solved!.clamped || solved!.durationCapped) return;
      expect(
        Math.abs(solved!.predictedWinrate - target),
        `${label}: asked ${(100 * target).toFixed(0)}%, achieved ${(100 * solved!.predictedWinrate).toFixed(0)}%`,
      ).toBeLessThan(TARGET_TOLERANCE);
    });
  }

  it('is deterministic: the same request solves to the same encounter', () => {
    const party: PartySpec = { count: 4, levels: 6, armor: 1 };
    const a = solveEncounter([{ enemyId: 'goblin', count: 6 }], party, 0.65, SOLVE_OPTS)!;
    const b = solveEncounter([{ enemyId: 'goblin', count: 6 }], party, 0.65, SOLVE_OPTS)!;
    expect(a.groups.map(g => g.pv)).toEqual(b.groups.map(g => g.pv));
    expect(a.predictedWinrate).toBe(b.predictedWinrate);
  });

  it('prices arbitrary body counts — no probe-count anchoring', () => {
    const party: PartySpec = { count: 4, levels: 6, armor: 1 };
    const solves = [4, 6, 9].map(count =>
      solveEncounter([{ enemyId: 'goblin', count }], party, 0.65, SOLVE_OPTS)!);
    // More bodies at the same difficulty must mean flimsier bodies.
    expect(solves[0].groups[0].pv).toBeGreaterThan(solves[1].groups[0].pv);
    expect(solves[1].groups[0].pv).toBeGreaterThan(solves[2].groups[0].pv);
  });

  it('holds the duration budget, and says so when that cost it the target', () => {
    const party: PartySpec = { count: 4, levels: 6, armor: 1 };
    // One wolf cannot threaten four heroes; unconstrained the solver bought
    // 50% with ~400 PV and a 29-round slog. The budget must refuse that.
    const solved = solveEncounter([{ enemyId: 'wolf', count: 1 }], party, 0.5, SOLVE_OPTS)!;
    expect(solved.avgRounds).toBeLessThanOrEqual(solved.maxAvgRounds + 2);
    // Refusing costs the target, and that must be reported rather than hidden:
    // the fight is EASIER than asked, not secretly longer.
    expect(solved.durationCapped).toBe(true);
    expect(solved.predictedWinrate).toBeGreaterThan(0.5);
  });

  it('leaves short fights alone — the budget only binds when it has to', () => {
    const party: PartySpec = { count: 4, levels: 6, armor: 1 };
    const solved = solveEncounter([{ enemyId: 'basilisk', count: 3 }], party, 0.5, SOLVE_OPTS)!;
    expect(solved.durationCapped).toBe(false);
    expect(Math.abs(solved.predictedWinrate - 0.5)).toBeLessThan(TARGET_TOLERANCE);
  });

  it('prices mixed compositions', () => {
    const party: PartySpec = { count: 4, levels: 6, armor: 1 };
    const solved = solveEncounter(
      [{ enemyId: 'goblin', count: 4 }, { enemyId: 'goblin-shaman', count: 2 }],
      party, 0.65, SOLVE_OPTS,
    );
    expect(solved).toBeTruthy();
    expect(solved!.groups).toHaveLength(2);
    expect(solved!.groups.every(g => g.pv >= 2)).toBe(true);
  });
});
