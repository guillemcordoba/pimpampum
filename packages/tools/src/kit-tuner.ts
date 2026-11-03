/**
 * THE NUMBER TUNER, run on one kit (playtest `tune.ts`): it searches the kit's
 * card numbers for the patch that clears the most of its gate cells, then
 * re-measures that patch at the gate's full budget. A PROPOSAL — it never
 * writes a card; the user picks what lands.
 *
 *   pnpm --filter @pimpampum/tools exec tsx src/kit-tuner.ts --set elements --kit waterbender
 *   … --cards font-curativa,boira-espessa --steps 4
 */
import { flag, games, useSet } from '@pimpampum/bench';
import { describePatch, evaluatePatch, GATE_BUDGET, tuneKit, type GateBudget, type GateReport } from '@pimpampum/playtest';
import { chosenSet } from './sets.js';

const SET = await chosenSet();
useSet(SET.gameSet);
const kit = flag('--kit') ?? SET.gameSet.calibration.mainKits[0];
const only = flag('--cards')?.split(',');
/** Cheaper than the gate's: a search measures dozens of candidates. */
const search: GateBudget = {
  kitFights: games(Math.round(GATE_BUDGET.kitFights / 2)), duelGames: games(GATE_BUDGET.duelGames),
  cardFights: games(Math.round(GATE_BUDGET.cardFights / 2)),
};
const full: GateBudget = { kitFights: games(GATE_BUDGET.kitFights), duelGames: games(GATE_BUDGET.duelGames), cardFights: games(GATE_BUDGET.cardFights) };

const fmt = (s: { total: number; duration: number; cards: number; strength: number }) =>
  `${s.total.toFixed(1)} (length ${s.duration.toFixed(1)} · cards ${s.cards} · strength ${s.strength.toFixed(1)})`;

console.log(`Tuning ${kit}${only ? ` (only ${only.join(', ')})` : ''}…`);
const r = await tuneKit({ set: SET.ref, budget: search }, kit, {
  maxSteps: Number(flag('--steps') ?? 6), only,
  onStep: (s, tried) => console.log(`  ${s.knob}  → ${fmt(s.score)}  (${tried} moves measured)`),
});
console.log(`start ${fmt(r.start.score)} · best ${fmt(r.best.score)}`);

const failing = (rep: GateReport) => rep.failures.length ? rep.failures.map(f => `    ${f.text}`).join('\n') : '    none';
const before = await evaluatePatch({ set: SET.ref, budget: full }, {}, kit);
const after = await evaluatePatch({ set: SET.ref, budget: full }, r.best.patch, kit);
console.log(`\nPROPOSAL for ${kit}, re-measured at the gate's budget: ${fmt(before.score)} → ${fmt(after.score)}`);
for (const line of describePatch(r.best.patch)) console.log(`  ${line}`);
console.log(`  failing before:\n${failing(before.report)}\n  failing after:\n${failing(after.report)}`);
console.log(`\n${JSON.stringify(r.best.patch)}`);
