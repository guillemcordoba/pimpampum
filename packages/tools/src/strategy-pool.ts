/**
 * THE STRATEGY POOL (the user, 2026-11-15): is the best strategy a dumb one?
 * Per level, a pool of strategies (bench `pool.ts`: tables of answers, fixed
 * odds, state players, scripts) grown by the double oracle (playtest
 * `growPool`): from always-attack, always-defend and always-Focus, the
 * strategy that best beats the pool's equilibrium mix is searched for,
 * confirmed on fights the search never saw, and added, until nothing new
 * beats it. Printed: each strategy as it is added, the score table, the final
 * mix and what it follows, each of the three dumbest against that mix, the
 * requirement (playtest `poolVerdict`), and the production AI against the mix.
 *
 *   pnpm --filter @pimpampum/tools exec tsx src/strategy-pool.ts --set elements
 *   … --levels 6 --games 200 (fights a duel) --members 12 --families table,state
 *   … --rule envoltat+both (a candidate rule, playtest `DEFENSE_RULES`)   --pv 15
 */
import { flag, games, pct, SMOKE, useSet, type Strategy, type Variant } from '@pimpampum/bench';
import { awarenessOf, DEFENSE_RULES, describeStrategy, FAMILIES, measurePool, POOL_AWARE_SHARE, POOL_DEFAULTS, STYLE_LEVELS } from '@pimpampum/playtest';
import { chosenSet } from './sets.js';

const SET = await chosenSet();
useSet(SET.gameSet);
const levels = flag('--levels')?.split(',').map(Number) ?? (SMOKE ? STYLE_LEVELS.slice(0, 1) : STYLE_LEVELS);
const fights = games(200);
const maxMembers = Number(flag('--members')) || (SMOKE ? 4 : POOL_DEFAULTS.maxMembers);
const families = (flag('--families')?.split(',') ?? (SMOKE ? ['table'] : FAMILIES)) as Strategy['kind'][];
const rule = DEFENSE_RULES.find(r => r.id === (flag('--rule') ?? 'today'));
if (!rule) throw new Error(`--rule ${flag('--rule')}: unknown (${DEFENSE_RULES.map(r => r.id).join(', ')})`);
const variant: Variant = { ...rule.rules, ...(flag('--pv') ? { pv: Number(flag('--pv')) } : {}) };
const log = (s: string) => process.stderr.write(`${s}\n`);

const results = await Promise.all(levels.map(level => measurePool({
  set: SET.ref, level, games: fights, variant, defenseShift: rule.defenseShift ?? 0, maxMembers, families,
  onStep: (step, members) => log(`L${level}: member ${members.length}, +${(100 * step.gain).toFixed(1)} on the mix (+${(100 * step.confirmed).toFixed(1)} confirmed): ${describeStrategy(step.added)}`),
})));

const share = (x: number) => `${Math.round(100 * x)}%`;
console.log(`${SET.id}: the strategy pool under "${rule.id}", ${fights} fights a duel (±${(100 * Math.sqrt(0.25 / fights)).toFixed(1)})${flag('--pv') ? `, every hero on ${flag('--pv')} PV` : ''}; ${results.reduce((t, r) => t + r.duels, 0)} duels played`);
console.log('A attack · D defense · F Focus; a plan is a side\'s two cards. dumb: plays the same whatever happens; state: follows the fight; reads: follows what the other side showed.');
for (const { level, result: r, verdict, aiScore } of results) {
  console.log(`\nL${level}: ${r.members.length} members, ${r.converged ? 'nothing new beats the mix' : `stopped at ${maxMembers} members, still growing`}`);
  r.members.forEach((m, i) => {
    const step = r.steps[i - (r.members.length - r.steps.length)];
    console.log(`  ${String(i + 1).padStart(2)}. ${share(r.mix[i]).padStart(4)} of the mix  ${awarenessOf(m).padEnd(5)}  ${describeStrategy(m)}${step ? `   [+${(100 * step.confirmed).toFixed(1)} on the mix before it]` : ''}`);
  });
  console.log(`  score, row against column:\n${r.score.map((row, i) => `  ${String(i + 1).padStart(4)} ${row.map(s => `${Math.round(100 * s)}`.padStart(4)).join('')}`).join('\n')}`);
  console.log(`  the mix: ${share(verdict.shares.dumb)} dumb, ${share(verdict.shares.state)} state, ${share(verdict.shares.reads)} reads (the bar: ${share(POOL_AWARE_SHARE)} not dumb); the best member still gains ${(100 * r.exploit).toFixed(1)} on it`);
  for (const f of verdict.dumbest) console.log(`  ${describeStrategy(f.table)}: ${(100 * f.againstMix).toFixed(1)} ±${(100 * f.se).toFixed(1)} against the mix (${f.loses ? 'loses' : 'DOES NOT CLEARLY LOSE'}); beaten most by ${f.beatenBy ? `${describeStrategy(f.beatenBy)}, ${pct(f.score, fights)}` : 'nothing'}`);
  console.log(`  THE BEST STRATEGY IS NOT A DUMB ONE: ${verdict.ok ? 'holds' : `DOES NOT HOLD: ${verdict.why.join('; ')}`}`);
  console.log(`  the production AI against the mix: ${pct(aiScore, fights)}`);
}
