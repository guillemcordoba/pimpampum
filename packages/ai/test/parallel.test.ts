/**
 * A SOLVE'S CELLS ON WORKER THREADS — `Referee.solveAsync` with a cell pool
 * must give the solve on one thread, number for number: the root round
 * travels as a snapshot, every cell is a pure function of it and its seeds,
 * and the double oracle reads them in the same order.
 *
 * The workers run the BUILT package (`dist/parallel/worker.js`): run after
 * `pnpm build`, as `pnpm test` does.
 */
import { afterAll, describe, expect, it } from 'vitest';
import { CombatEngine, withSeed, withSeedAsync } from '@pimpampum/engine';
import { equilibriumPolicy, MEDIUM_EQUILIBRIUM, DEFAULT_EQUILIBRIUM, FAST_EQUILIBRIUM } from '../src/index.js';
import { AUDIT_CONTENT, buildEngine, generatePosition, pvDiff, Referee, type GeneratorConfig, type RefereeOptions } from '../src/audit/index.js';
import { identities, midRoundKey } from '../src/audit/referee.js';
import { createCellPool } from '../src/parallel/index.js';

const pool = createCellPool({ workers: 3, content: AUDIT_CONTENT, contentModule: { specifier: '@pimpampum/ai/audit', name: 'AUDIT_CONTENT' } });
afterAll(() => pool.close());

const SLICES: GeneratorConfig[] = [
  { shape: '2x1', cards: 3, roundsLeft: 3, multiShare: 0.8, catalogue: 'archetypes' },
  { shape: '2x2', cards: 3, roundsLeft: 2, multiShare: 0.8, catalogue: 'composed' },
  { shape: '2x2', cards: 4, roundsLeft: 6, multiShare: 0.8, toTheEnd: true, catalogue: 'archetypes' },
];
const idle = { actionChooser: () => null };

describe('engine snapshot on the audit\'s cards', () => {
  it('a restored state is the same state, statuses and all', () => {
    let withStatuses = 0;
    for (const cfg of SLICES) {
      for (let seed = 1; seed <= 8; seed++) {
        const e = buildEngine(generatePosition(seed, cfg), equilibriumPolicy(FAST_EQUILIBRIUM), { ai: true });
        withSeed(seed, () => { for (let r = 0; r < 2 && !e.isOver(); r++) e.runRound(); });
        if (e.isOver()) continue;
        e.prepareRound();
        if (e.teams.flat().some(c => c.statuses.size)) withStatuses++;
        const back = CombatEngine.restore(structuredClone(e.snapshot(AUDIT_CONTENT.refOf)), AUDIT_CONTENT.registry, AUDIT_CONTENT.deref);
        expect(midRoundKey(back, identities()), `${cfg.shape} ${cfg.catalogue} seed ${seed}`).toBe(midRoundKey(e.clone(), identities()));
      }
    }
    expect(withStatuses, 'the check should meet statuses').toBeGreaterThan(3);
  });
});

describe('solveAsync on a worker pool', () => {
  const settings: Record<string, Partial<RefereeOptions>> = {
    medium: { ...MEDIUM_EQUILIBRIUM, budget: Infinity },
    'joint best response': { ...DEFAULT_EQUILIBRIUM, samples: [2], decisionSamples: [2], playouts: 2, budget: Infinity },
  };
  for (const [name, opts] of Object.entries(settings)) {
    it(`gives the same solve as one thread (${name})`, async () => {
      for (const cfg of SLICES) {
        for (let seed = 1; seed <= 2; seed++) {
          const state = () => buildEngine(generatePosition(seed, cfg), idle);
          const one = new Referee({ ...opts, seed: 5 }).solve(state(), 0);
          const many = await new Referee({ ...opts, seed: 5 }).solveAsync(state(), pool);
          const at = `${cfg.shape} ${cfg.catalogue} seed ${seed}`;
          expect(many.value, at).toBe(one.value);
          expect(many.sol, at).toEqual(one.sol);
          expect(many.rows, at).toEqual(one.rows);
          expect(many.cols, at).toEqual(one.cols);
        }
      }
    }, 120_000);
  }
});

describe('the equilibrium policy planning on a pool', () => {
  it('plays the same fight as the policy solving on one thread', async () => {
    const cfg: GeneratorConfig = { shape: '2x2', cards: 3, roundsLeft: 4, multiShare: 0.8, catalogue: 'archetypes' };
    for (let seed = 1; seed <= 3; seed++) {
      const pos = generatePosition(seed, cfg);
      // One policy on both sides: its solve is the first draw of every round.
      const sync = withSeed(seed, () => {
        const e = buildEngine(pos, equilibriumPolicy(MEDIUM_EQUILIBRIUM), { ai: true });
        e.runCombat();
        return { margin: pvDiff(e), plays: e.history.map(h => h.action.id) };
      });
      const planned = await withSeedAsync(seed, async () => {
        const policy = equilibriumPolicy(MEDIUM_EQUILIBRIUM, 4, pool);
        const e = buildEngine(pos, policy, { ai: true });
        while (!e.isOver() && e.round < e.maxRounds) {
          e.prepareRound();
          await policy.plan(e);
          e.playPreparedRound();
        }
        return { margin: pvDiff(e), plays: e.history.map(h => h.action.id) };
      });
      expect(planned, `seed ${seed}`).toEqual(sync);
    }
  }, 120_000);
});
