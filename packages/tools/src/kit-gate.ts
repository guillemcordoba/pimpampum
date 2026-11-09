/**
 * THE KIT GATE, printed: every requirement of the livable zone for every main
 * kit at every level (playtest `gate.ts`), as a grid of ✓ and ❌.
 *
 *   pnpm --filter @pimpampum/tools exec tsx src/kit-gate.ts --set elements
 *   … --kits waterbender,earthbender --levels 4,6
 *   … --quick   the checkpoints only, a quarter of the fights, no card values: minutes, rough
 *
 * The measuring is warmed across bench's lanes first, then read serially from
 * the cache: a second run on unchanged content is instant.
 */
import { flag, games, useSet } from '@pimpampum/bench';
import { autopsyLines, FIELD_MAX, GATE_BUDGET, MIN_CHOICE_COST, GATE_LEVELS, GATE_QUICK, measureGate, prepareGate, STYLE_LEVELS, type FightShape, type GateBudget, type GateScope } from '@pimpampum/playtest';
import { chosenSet } from './sets.js';

const SET = await chosenSet();
useSet(SET.gameSet);

const quick = process.argv.includes('--quick');
const scope: GateScope = {
  kits: flag('--kits')?.split(','),
  levels: flag('--levels')?.split(',').map(Number) ?? (quick ? STYLE_LEVELS : undefined),
  cards: !quick,
};
const base = quick ? GATE_QUICK : GATE_BUDGET;
const budget: GateBudget = {
  kitFights: games(base.kitFights), duelGames: games(base.duelGames), cardFights: games(base.cardFights),
  modelFights: games(base.modelFights!),
};
const started = Date.now();

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

const p = (x: number) => `${Math.round(100 * x)}%`;
console.log(`\nNO KIT DOMINATES — each kit's side against the field, clearly above ${p(FIELD_MAX)} fails`);
console.log(pad('', w) + levels.map(l => pad(`L${l}`, 12)).join(''));
for (const kit of kits) {
  console.log(pad(kit, w) + levels.map(l => {
    const c = r.kits.find(x => x.kit === kit && x.level === l);
    return pad(c ? `${c.dominates ? '❌' : '✓'} ${p(c.winrate)}` : '', 12);
  }).join(''));
}

if (r.choices.length) {
  const cl = [...new Set(r.choices.map(c => c.level))];
  console.log(`\nCHOOSING MATTERS — a random card's cost against the best, PV a decision (2σ under ${MIN_CHOICE_COST} fails)`);
  console.log(pad('', w) + cl.map(l => pad(`L${l}`, 12)).join(''));
  for (const kit of kits) {
    console.log(pad(kit, w) + cl.map(l => {
      const c = r.choices.find(x => x.kit === kit && x.level === l);
      return pad(c ? `${c.ok ? '✓' : '❌'} ${c.mean.toFixed(1)}` : '', 12);
    }).join(''));
  }
}

const shape = (f: FightShape) => `${f.pvPerRound.toFixed(1)} PV/round · ${p(f.emptyAttacks)} of attacks take nothing · ${p(f.focusLost)} of Focus lost · defenses ${p(f.defenseShare)} of plays`;
console.log(`\nWHY THEY RUN LONG (failing cells at the checkpoints ${STYLE_LEVELS.join(', ')})`);
for (const kit of kits) {
  for (const c of r.kits.filter(x => x.kit === kit && !x.ok && STYLE_LEVELS.includes(x.level))) {
    const w = c.why;
    console.log(`${kit} L${c.level}: ${p(w.longShare)} of fights past round 6`);
    console.log(`    with: ${w.foes.map(f => `${f.kit} ${p(f.longShare)}`).join(', ')} (opponents) · ${w.partners.map(f => `${f.kit} ${p(f.longShare)}`).join(', ')} (partners)`);
    if (w.late.length) console.log(`    played late: ${w.late.map(l => `${l.name} ${p(l.share)}`).join(', ')}`);
    console.log(`    long fights (${w.long.fights}): ${shape(w.long)}`);
    console.log(`    short fights (${w.short.fights}): ${shape(w.short)}`);
  }
}

if (r.styles.length) {
  console.log(`\nTHE TRIANGLE AND DUMB PLAY (each claimed winner's score; each dumb strategy's against the AI)`);
  for (const s of r.styles) {
    const edges = s.edges.map(e => `${s.broken.includes(`${e.winner} > ${e.loser}`) ? '❌' : '✓'} ${e.winner}>${e.loser} ${Math.round(100 * e.winrate)}%`).join('  ');
    const dumb = s.dumb.map(d => `${d.ok ? '✓' : '❌'} ${d.style} ${Math.round(100 * d.score)}%`).join('  ');
    console.log(`L${s.level}  ${edges}  ${dumb}`);
    for (const a of s.autopsies) {
      console.log(`    why ${a.x} > ${a.y} fails:`);
      for (const line of autopsyLines(a)) console.log(`      ${line}`);
    }
    for (const c of s.culprits) {
      console.log(`    ${c.edge} is held up by: ${c.cards.map(x => `${x.name} (without it ${x.shift >= 0 ? '+' : ''}${x.shift.toFixed(0)})`).join(', ')}`);
    }
  }
}

if (r.styles.length) {
  console.log(`\nTHE AI PREDICTS ITSELF (its model of the opponents against what they played; attack / defense / Focus)`);
  for (const s of r.styles) {
    const m = s.model;
    const tri = (x: Record<string, number>) => ['Atac', 'Defensa', 'Focus'].map(t => Math.round(100 * (x[t] ?? 0))).join(' / ');
    console.log(`L${s.level}  ${m.ok ? '✓' : '❌'} predicted ${tri(m.predicted)} · played ${tri(m.actual)} · log-lik ${m.logLik.toFixed(2)} (${m.predictions} decisions)`);
  }
}

if (quick) console.log(`\nEVERY CARD HAS A USE — the full gate only`);
else console.log(`\nEVERY CARD HAS A USE (the right play somewhere; the AI plays it when it is)`);
if (!quick) console.log(`  per checkpoint: best = share of decisions it was the best play · AI = share it was played where legal · gain = its lead over the runner-up when best (PV)`);
for (const kit of quick ? [] : kits) {
  const bad = r.cards.filter(c => c.kit === kit && (c.neverRight || c.blind));
  const unjudged = r.cards.filter(c => c.kit === kit && !c.levels.length).map(c => c.name);
  console.log(`${pad(kit, w)}${bad.length ? '' : '✓'}${unjudged.length ? `  — not judged: ${unjudged.join(', ')}` : ''}`);
  for (const c of bad) {
    const why = c.neverRight ? 'never the right play' : 'the AI is blind to it';
    const at = c.levels.map(l => `L${l.level} best ${Math.round(100 * l.bestShare)}% · AI ${Math.round(100 * l.playRate)}%`
      + (l.gainWhenBest === null ? ' · never best' : ` · gain ${l.gainWhenBest.toFixed(1)}`) + ` (${l.decisions} decisions)`).join('; ');
    console.log(`    ❌ ${c.name} — ${why}: ${at}`);
  }
}

console.log(`\nSTRENGTH BAND — waits for the creatures on the ladder (GOALS.md B20)`);
console.log(`\n${r.failures.length} failing cells${r.failures.length ? ':' : '.'} (${quick ? 'quick gate' : 'full gate'}, ${Math.round((Date.now() - started) / 60_000)} min)`);
for (const f of r.failures) console.log(`  ${f.text}`);
