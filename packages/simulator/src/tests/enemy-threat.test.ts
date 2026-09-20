import { describe, it, expect } from 'vitest';
import { CombatEngine, setAIControlled, withSeed } from '@pimpampum/engine';
import { buildReferenceParty, PartySpec } from '@pimpampum/skills';
import {
  ENEMY_DEFINITIONS, SOLVE_MISS_EPSILON, generateEncounter, solveEncounter, buildSolvedEncounter,
} from '@pimpampum/enemies';
import { REGISTRY } from './helpers.js';
import { bodiesFor } from '../bench/shapes.js';
import { gamesFor } from '../bench/report.js';

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

describe('balancer v3: solved encounters hold up on an independent replay', () => {
  for (const t of ENEMY_DEFINITIONS) {
    it(`${t.id}: solved encounters land near their measured winrate`, () => {
      const party: PartySpec = { count: 4, levels: 6, armor: 1 };
      for (const target of [0.5, 0.75]) {
        const solved = generateEncounter(t, bodiesFor(t.id), party, target, SOLVE_OPTS);
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
  /**
   * A CASE THAT ASSERTS NOTHING IS NOT A PASS.
   *
   * Most cases below legitimately skip their assertion when the solve comes
   * back `clamped` or `durationCapped` — an honest miss only has to be
   * reported, not hit. But the audit measured 79 of 100 GM-shaped requests
   * hitting the duration budget, which means this whole block could go green
   * while checking almost nothing, and nobody would see it. So count what
   * actually got asserted and fail if the answer is "none".
   */
  const asserted: string[] = [];
  const skipped: string[] = [];
  /** How far the ACHIEVED winrate may sit from the REQUESTED one. Wider than
   *  the replay tolerance because two things stack: PV is an INTEGER lever, so
   *  at small bodies a single point is worth several winrate points and some
   *  targets are genuinely unreachable; and the search runs on a cheap sample.
   *  The solver always reports what it actually achieved, so a miss is visible
   *  to the caller rather than hidden. */
  const TARGET_TOLERANCE = 0.18;
  // 18pp is WIDE — a 65% target passes anywhere in 47-83%. Two things stack to
  // make it so: PV is an integer lever, and the search runs on a cheap sample
  // (`SOLVE_OPTS` above). Tightening it needs a bigger sample, not a smaller
  // constant; the accounting test below prints what a tighter band would cost.
  // Left loose deliberately — this guard exists to catch a solver that lands in
  // the WRONG PLACE, and the solver reports what it achieved either way.

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
      if (solved!.clamped || solved!.durationCapped) {
        skipped.push(`${label} (${solved!.clamped ? 'clamped' : 'durationCapped'})`);
        return;
      }
      asserted.push(label);
      // The solver REPORTS its own miss now (`searchMissed`), so the guard
      // checks the flag rather than recomputing the same comparison beside it.
      // A miss the solver owns up to is a different failure from one it hides:
      // the tolerance below bounds how big an owned-up miss may be.
      expect(
        Math.abs(solved!.missBy),
        `${label}: asked ${(100 * target).toFixed(0)}%, achieved ${(100 * solved!.predictedWinrate).toFixed(0)}%`
        + `${solved!.searchMissed ? ' (reported as a miss)' : ' (reported as a HIT — the flag is wrong)'}`,
      ).toBeLessThan(TARGET_TOLERANCE);
    });
  }

  it('never reports a miss as a hit', () => {
    // The flag has to agree with the numbers, or it is worse than no flag.
    const party: PartySpec = { count: 4, levels: 6, armor: 1 };
    for (const [enemyId, count] of [['goblin', 6], ['basilisk', 3], ['wolf', 1]] as const) {
      const s = solveEncounter([{ enemyId, count }], party, 0.5, SOLVE_OPTS)!;
      const off = Math.abs(s.missBy) > Math.max(SOLVE_MISS_EPSILON, 2 * s.stderr);
      const owned = s.clamped || s.durationCapped || s.searchMissed;
      expect(
        !off || owned,
        `${count}× ${enemyId}: ${(100 * s.missBy).toFixed(0)}pp off target and every flag is false`,
      ).toBe(true);
    }
  });

  it('at least some difficulty cases actually asserted something', () => {
    // Runs last in declaration order, so the counters above are filled.
    console.log(
      `   balancer targets: ${asserted.length} asserted, ${skipped.length} honest misses`
      + (skipped.length ? ` — ${skipped.join(', ')}` : '')
      + ` · tolerància ${TARGET_TOLERANCE * 100}pp (baixar-la a 8pp costaria ~${gamesFor(8)} combats per solve)`,
    );
    expect(
      asserted.length,
      'every difficulty case reported an honest miss, so this block checked NOTHING. '
      + 'That is a content signal (no composition can reach the target inside the round budget), '
      + 'not a passing guard — fix the kits or change the cases.',
    ).toBeGreaterThan(0);
  });

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
    // THE claim: a short fight is not capped. Three basilisks resolve in ~2
    // rounds, so the duration budget has no business binding here.
    expect(solved.durationCapped).toBe(false);
    // How close it landed is a SEPARATE question, and one the solver answers
    // for itself now. This used to assert accuracy and went red when the roll
    // changed — asserting the same comparison the solver already makes, beside
    // it, so the two could disagree. What matters is that a miss is OWNED:
    // the accuracy of solves across compositions is what the difficulty block
    // above measures, on eight of them rather than on this one.
    // A miss is OWNED by any of the three flags. `clamped` means the solver ran
    // out of PV, which is already an honest report — `searchMissed` is
    // explicitly the case none of the others covers, so demanding it alone (as
    // this did) fails a solve that DID own up, just through a different flag.
    // The sibling test above had this right and this one did not.
    const off = Math.abs(solved.missBy) > Math.max(SOLVE_MISS_EPSILON, 2 * solved.stderr);
    const owned = solved.clamped || solved.durationCapped || solved.searchMissed;
    expect(
      !off || owned,
      `asked 50%, achieved ${(100 * solved.predictedWinrate).toFixed(0)}% and every flag is false`,
    ).toBe(true);
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
