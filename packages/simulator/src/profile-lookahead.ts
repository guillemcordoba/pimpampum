/** Where does a depth-1 decision actually spend its time? clone / resolve /
 *  score, measured on the reference fight. Determines whether the lookahead's
 *  cost is a constant factor worth optimising or an inherent one. */
import {
  CombatEngine, setAIControlled,
} from '@pimpampum/engine';
import {
  positionScore, bestResponse, aiPolicy, selectAction,
} from '@pimpampum/ai';
import { buildReferenceParty, type PartySpec } from '@pimpampum/skills';
import { buildComposition } from '@pimpampum/enemies';
import { games, theRegistry, useSet } from '@pimpampum/bench';
import { referenceParty, FANTASY } from '@pimpampum/set-fantasy';

// THE SET THIS HARNESS MEASURES. `@pimpampum/bench` takes its content as a
// parameter and throws rather than guess, so every entry point says so once.
useSet(FANTASY);

/** The reference table (bench/reference.ts) — named kits, asserted Σ, one
 *  definition for the whole package. It used to be re-derived here as
 *  `MAINS.slice(0, 4)`, which silently re-based this harness whenever a kit
 *  was added to or reordered in the catalogue. */
const party: PartySpec = referenceParty();

function fresh(): CombatEngine {
  const players = buildReferenceParty(party);
  setAIControlled(players);
  const enemies = buildComposition([{ enemyId: 'goblin', count: 4, level: 3, pv: 20 }]);
  // Depth 0 by design: this script drives `bestResponse` by hand to time it,
  // so the engine must NOT be running a lookahead of its own.
  return new CombatEngine(players, enemies, { registry: theRegistry(), maxRounds: 40, ...aiPolicy({ depth: 0 }) });
}

/** Scales every timing loop, so the smoke run can do two reps of each. */
const SCALE = games(200) / 200;
const time = (label: string, n: number, fn: () => void) => {
  const t0 = performance.now();
  for (let i = 0; i < n; i++) fn();
  const per = (performance.now() - t0) / n;
  console.log(`  ${label.padEnd(28)} ${per.toFixed(4)} ms`);
};

const e = fresh();
console.log('\nPer-operation cost (4 heroes vs 4 goblins):');
time('engine.clone()', Math.max(1, Math.round(2000 * SCALE)), () => { e.clone(); });
time('positionScore()', Math.max(1, Math.round(20000 * SCALE)), () => { positionScore(e, 0); });
time('clone + resolve one round', Math.max(1, Math.round(500 * SCALE)), () => {
  const sim = e.clone();
  sim.actionChooser = (e, a) => selectAction(e, a).actionIdx;
  sim.prepareRound();
  sim.planActions([]);
  let s = sim.resolveNextAction();
  let g = 0;
  while (s.kind !== 'done' && g++ < 400) { if (s.kind === 'target') sim.setResolveTarget([]); s = sim.resolveNextAction(); }
  sim.finishRound();
});
time('bestResponse d1 s2 p1 k3', Math.max(1, Math.round(100 * SCALE)), () => { bestResponse(e, 0, { depth: 1, samples: 2, passes: 1, topK: 3 }); });
console.log('');
