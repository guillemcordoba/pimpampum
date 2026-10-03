/**
 * The measuring half of `balancer.slow.test.ts`, in its own process: solve an
 * encounter against this set's real creatures and re-measure it on dice the
 * solver never saw.
 */
import { CombatEngine, setAIControlled, withSeed } from '@pimpampum/engine';
import { aiPolicy } from '@pimpampum/ai';
import { games, searchGames, theRegistry, useSet } from '@pimpampum/bench';
import {
  buildReferenceParty, buildSolvedEncounter, solveEncounter, type PartySpec, type PoolSpec, type SolvedEncounter,
} from '../src/index.js';
import { FANTASY } from '../src/bench/index.js';

export interface Checked { solved: SolvedEncounter | null; replay: number; replayGames: number }

/** Solve `pool` for `party` at `target`, then replay it on an independent seed. */
export function solveAndReplay(pool: PoolSpec[], party: PartySpec, target: number): Checked {
  useSet(FANTASY);
  const solved = solveEncounter(pool, party, target, { games: games(160), searchGames: searchGames(100) });
  const n = games(200);
  if (!solved) return { solved, replay: NaN, replayGames: 0 };
  // Replayed at the depth the balancer prices at, with a freshly drawn party
  // each game: grading a depth-1 solve with weaker play would measure the gap
  // between two AIs, not the solver.
  const replay = withSeed(4242, () => {
    let wins = 0;
    for (let i = 0; i < n; i++) {
      const players = buildReferenceParty(party);
      setAIControlled(players);
      const w = new CombatEngine(players, buildSolvedEncounter(solved), {
        registry: theRegistry(), maxRounds: 40, ...aiPolicy({ depth: 1 }),
      }).runCombat().winner;
      wins += w === 0 ? 1 : w === null ? 0.5 : 0;
    }
    return wins / n;
  });
  return { solved, replay, replayGames: n };
}
