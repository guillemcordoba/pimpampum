/** How much does pricing at depth 1 actually cost, and how far does it move
 *  the answer? Same request, same seed, only the AI's thinking depth changing. */
import { aiPolicy } from '@pimpampum/ai';
import { solveEncounter } from '@pimpampum/enemies';
import type { PartySpec } from '@pimpampum/skills';
import { referenceParty, FANTASY } from '@pimpampum/set-fantasy';
import { games, useSet } from '@pimpampum/bench';

// THE SET THIS HARNESS MEASURES. `@pimpampum/bench` takes its content as a
// parameter and throws rather than guess, so every entry point says so once.
useSet(FANTASY);

/** The reference table (bench/reference.ts) — named kits, asserted Σ, one
 *  definition for the whole package. It used to be re-derived here as
 *  `MAINS.slice(0, 4)`, which silently re-based this harness whenever a kit
 *  was added to or reordered in the catalogue. */
const party: PartySpec = referenceParty();
const pool = [{ enemyId: 'goblin', count: 4 }];

const CASES = [
  { label: 'depth 0            ', ...aiPolicy({ depth: 0 }) },
  { label: 'depth 1 s2 p1 k3   ', ...aiPolicy({ depth: 1 }) },
  { label: 'depth 1 s1 p1 k2   ', ...aiPolicy({ depth: 1, ...{ samples: 1, passes: 1, topK: 2 } }) },
];
for (const c of CASES) {
  const t0 = performance.now();
  const solved = solveEncounter(pool, party, 0.65, { games: games(120), ...c } as never)!;
  const ms = performance.now() - t0;
  const pv = solved.groups.map(g => `${g.count}x pv${g.pv}`).join(' + ');
  console.log(`${c.label}: ${(ms / 1000).toFixed(1)}s  →  ${pv}  (${solved.avgRounds?.toFixed(1) ?? '?'} rondes)`);
}
