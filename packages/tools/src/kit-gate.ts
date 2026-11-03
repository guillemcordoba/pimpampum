/**
 * THE KIT GATE, printed: every requirement of the livable zone for every main
 * kit at every level (playtest `gate.ts`), as a grid of ✓ and ❌.
 *
 *   pnpm --filter @pimpampum/tools exec tsx src/kit-gate.ts --set elements
 *   … --kits waterbender,earthbender --levels 4,6
 *
 * The measuring is warmed across bench's lanes first, then read serially from
 * the cache: a second run on unchanged content is instant.
 */
import { flag, games, useSet } from '@pimpampum/bench';
import { GATE_BUDGET, GATE_LEVELS, measureGate, prepareGate, type GateBudget, type GateScope } from '@pimpampum/playtest';
import { chosenSet } from './sets.js';

const SET = await chosenSet();
useSet(SET.gameSet);

const scope: GateScope = {
  kits: flag('--kits')?.split(','),
  levels: flag('--levels')?.split(',').map(Number),
};
const budget: GateBudget = {
  kitFights: games(GATE_BUDGET.kitFights), duelGames: games(GATE_BUDGET.duelGames), cardFights: games(GATE_BUDGET.cardFights),
};

await prepareGate({ set: SET.ref, budget }, scope, (done, total) => process.stderr.write(`\rmeasuring ${done}/${total}   `));
process.stderr.write('\n');
const r = measureGate(scope, budget);

const levels = GATE_LEVELS.filter(l => !scope.levels || scope.levels.includes(l));
const kits = [...new Set(r.kits.map(c => c.kit))];
const pad = (s: string, n: number) => s.padEnd(n);
const w = Math.max(...kits.map(k => k.length)) + 2;

console.log(`\nFIGHTS END — 90% of fights within 6 rounds, stalls under 2% (2v2 against random kits; p90 · stalls)`);
console.log(pad('', w) + levels.map(l => pad(`L${l}`, 12)).join(''));
for (const kit of kits) {
  console.log(pad(kit, w) + levels.map(l => {
    const c = r.kits.find(x => x.kit === kit && x.level === l);
    return pad(c ? `${c.ok ? '✓' : '❌'} ${c.p90Rounds}·${Math.round(100 * c.stallRate)}%` : '', 12);
  }).join(''));
}

if (r.styles.length) {
  console.log(`\nTHE TRIANGLE AND THE TURTLE (each claimed winner's score; the turtle's against the AI)`);
  for (const s of r.styles) {
    const edges = s.edges.map(e => `${s.broken.includes(`${e.winner} > ${e.loser}`) ? '❌' : '✓'} ${e.winner}>${e.loser} ${Math.round(100 * e.winrate)}%`).join('  ');
    console.log(`L${s.level}  ${edges}  ${s.turtle.ok ? '✓' : '❌'} turtle ${Math.round(100 * s.turtle.score)}%`);
  }
}

console.log(`\nEVERY CARD HAS A USE (the right play somewhere; the AI plays it when it is)`);
for (const kit of kits) {
  const bad = r.cards.filter(c => c.kit === kit && (c.neverRight || c.blind));
  const unjudged = r.cards.filter(c => c.kit === kit && !c.levels.length).map(c => c.name);
  console.log(`${pad(kit, w)}${bad.length ? bad.map(c => `❌ ${c.name}${c.neverRight ? ' (never right)' : ''}${c.blind ? ' (AI blind)' : ''}`).join(' · ') : '✓'}`
    + (unjudged.length ? `  — not judged: ${unjudged.join(', ')}` : ''));
}

console.log(`\nSTRENGTH BAND — waits for the creatures on the ladder (OPEN.md B20)`);
console.log(`\n${r.failures.length} failing cells${r.failures.length ? ':' : '.'}`);
for (const f of r.failures) console.log(`  ${f}`);
