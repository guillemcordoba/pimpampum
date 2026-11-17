/**
 * THE TRIANGLE, ROUND BY ROUND (the user, 2026-11-15): once the cards are
 * face up, which answer did you wish you had played? Per level, bench's round
 * table: round starts from ordinary fights, the next round replayed for every
 * pair of plans (a side's two card types: AA both attack, AD one attacks and
 * one defends, …), the fight then played out. A cell is our side's score for
 * having answered THAT plan with THIS one. The requirement (playtest
 * `roundTriangle`): into an attack a defense is clearly the answer, into a
 * defense a Focus, into a Focus an attack.
 *
 *   pnpm --filter @pimpampum/tools exec tsx src/round-table.ts --set elements
 *   … --levels 3,6,10 --games 240 (round starts a level)   --rule envoltat+both (a candidate rule, playtest `DEFENSE_RULES`)   --pv 15
 */
import { fileURLToPath } from 'node:url';
import { flag, games, inLanes, isolated, mergeRoundTable, pctCoarse, PLANS, roundTableChunks, SMOKE, useSet, type RoundTableChunk, type Variant } from '@pimpampum/bench';
import { DEFENSE_RULES, roundTriangle, roundTriangleVerdict, STYLE_LEVELS } from '@pimpampum/playtest';
import { chosenSet } from './sets.js';

const SET = await chosenSet();
useSet(SET.gameSet);
const levels = flag('--levels')?.split(',').map(Number) ?? (SMOKE ? STYLE_LEVELS.slice(0, 1) : STYLE_LEVELS);
const positions = games(240);
const rule = DEFENSE_RULES.find(r => r.id === (flag('--rule') ?? 'today'));
if (!rule) throw new Error(`--rule ${flag('--rule')}: unknown (${DEFENSE_RULES.map(r => r.id).join(', ')})`);
const variant: Variant = { ...rule.rules, ...(flag('--pv') ? { pv: Number(flag('--pv')) } : {}) };
const PLAYTEST = fileURLToPath(import.meta.resolve('@pimpampum/playtest'));
const log = (s: string) => process.stderr.write(`${s}\n`);

const jobs = levels.flatMap(level => Array.from({ length: roundTableChunks(positions) }, (_, chunk) => ({ level, chunk })));
let done = 0;
const chunks = await inLanes(jobs.map(({ level, chunk }) => async () => {
  const part = await isolated<RoundTableChunk>(PLAYTEST, 'roundTableJob', [SET.ref, level, positions, chunk, variant, rule!.defenseShift ?? 0]);
  log(`${++done}/${jobs.length}: L${level} chunk ${chunk}`);
  return { level, part };
}));

console.log(`${SET.id}: our side's score for answering their plan (columns) with ours (rows), the rest of the fight played out, under "${rule.id}"${flag('--pv') ? `, every hero on ${flag('--pv')} PV` : ''}`);
console.log('A attack · D defense · F Focus; a plan is a side\'s two cards. ★ the best answer in a column; the triangle claims a defense into AA, a Focus into DD, an attack into FF (a mixed answer holding it counts).');
for (const level of levels) {
  const table = mergeRoundTable(level, chunks.filter(c => c.level === level).map(c => c.part));
  const pc = (x: number) => pctCoarse(x, table.positions);
  console.log(`\nL${level}: ${table.positions} round starts`);
  console.log(`ours \\ theirs ${PLANS.map(p => p.padStart(9)).join('')}`);
  for (const ours of PLANS) {
    console.log(`${ours.padEnd(13)} ${PLANS.map(theirs => {
      const best = PLANS.every(other => table.cells[ours][theirs].score >= table.cells[other][theirs].score);
      return `${pc(table.cells[ours][theirs].score)}${best ? '★' : ' '}`.padStart(9);
    }).join('')}`);
  }
  const edges = roundTriangle(table);
  for (const e of edges) {
    console.log(`  into ${e.theirs}, the best holding ${e.counter}: ${e.claimed} scores ${pc(e.score)}, the best without: ${e.rival} ${pc(e.rivalScore)} (${e.lead >= 0 ? '+' : ''}${(100 * e.lead).toFixed(1)} ±${(100 * e.se).toFixed(1)}): ${e.holds ? 'holds' : 'DOES NOT HOLD'}`);
  }
  const verdict = roundTriangleVerdict(edges);
  console.log(`  the triangle ${verdict.ok ? 'holds' : `does not hold: ${verdict.broken.join('; ')}`}`);
}
