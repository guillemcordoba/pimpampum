/**
 * THE ENCOUNTER CREATOR MUST ANSWER IN UNDER THREE SECONDS.
 *
 * A DM tunes an encounter by trying three or four compositions in a row, so
 * one solve has to come back in about three seconds or the creator is not
 * usable at the table. These are the requests the web app sends
 * (`EncounterCreatorView` → `solveEncounterAsync` over a pool of workers,
 * default options), for a realistic equipped party, timed on the same
 * parallel path — with the pool capped at a laptop's eight workers.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { solveEncounter, solveEncounterAsync, type PoolSpec } from '../src/index.js';
import { SMOKE } from '@pimpampum/bench';
import { ChunkPool } from './chunk-pool.js';

const BUDGET_MS = 3000;

const hero = (name: string, skills: Record<string, number>, equipment: string[]) =>
  ({ name, classCss: 'x', pv: 12, skills, equipment, potions: [], fatigue: 0, category: 'player' as const });

/** A table of four, levels 3–4, the gear the creator's party builder offers. */
const PARTY = { characters: [
  hero('Berserker', { berserk: 3 }, ['armadura-de-cuir', 'destral', 'escut']),
  hero('Mag', { volcanic: 3, metge: 1 }, ['escut']),
  hero('Mestre', { 'mestre-armes': 3 }, ['armadura-de-cuir', 'destral', 'escut']),
  hero('Terra', { earthbender: 3 }, ['armadura-de-ferro', 'escut']),
] };

const REQUESTS: [string, PoolSpec[]][] = [
  ['a goblin horde', [{ enemyId: 'goblin', count: 5 }]],
  ['a squad of bone devils', [{ enemyId: 'bone-devil', count: 3 }]],
  ['a boss', [{ enemyId: 'basilisk', count: 1 }]],
  ['a mixed band', [{ enemyId: 'goblin', count: 3 }, { enemyId: 'horned-devil', count: 1 }]],
];

describe.sequential('the encounter creator answers in time', () => {
  // Created once, as the creator page creates its pool once, and warmed so the
  // timings measure solving rather than workers loading the set.
  let workers: ChunkPool;
  const run = (jobs: Parameters<ChunkPool['run']>[1]) => workers.run(PARTY as never, jobs);
  beforeAll(async () => {
    workers = new ChunkPool();
    await run(Array.from({ length: workers.size }, (_, i) => ({ groups: [{ enemyId: 'goblin', count: 1, pv: 1 }], games: 1, seed: i })));
  });
  afterAll(() => workers.close());

  it('gives the same answer in parallel as on one thread', async () => {
    const pool: PoolSpec[] = [{ enemyId: 'basilisk', count: 1 }];
    expect(await solveEncounterAsync(pool, PARTY as never, 0.65, run)).toEqual(solveEncounter(pool, PARTY as never, 0.65));
  }, 120_000);

  for (const [label, pool] of REQUESTS) {
    it(`solves ${label} in under ${BUDGET_MS / 1000} s`, async () => {
      const t = performance.now();
      const solved = await solveEncounterAsync(pool, PARTY as never, 0.65, run);
      const ms = performance.now() - t;
      expect(solved, 'the creator needs an answer').not.toBeNull();
      // The smoke tier plays every slow file at once on every core, so a wall
      // clock there measures the neighbours; it only checks the solve still runs.
      if (!SMOKE) expect(ms, `${label} took ${(ms / 1000).toFixed(1)} s`).toBeLessThan(BUDGET_MS);
    }, 60_000);
  }
});
