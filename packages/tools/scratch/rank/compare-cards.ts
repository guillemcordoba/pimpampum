/**
 * SCRATCH: the four card methods side by side at one level, read back from
 * the experiments' printed results. Do the methods agree on which cards
 * carry a kit?
 *
 *   tsx scratch/rank/compare-cards.ts <dir with cards.txt, cards2-jumps.txt, cards2-vor.txt, cards2-shapley.txt> [level]
 *
 * bench-exempt(interval): nothing is sampled here; the error bars are the experiments' own.
 */
import fs from 'node:fs';
import path from 'node:path';

const dir = process.argv[2], level = Number(process.argv[3] ?? 6);
const read = (f: string) => (fs.existsSync(path.join(dir, f)) ? fs.readFileSync(path.join(dir, f), 'utf8').split('\n') : []);

type Table = Map<string, Map<string, number>>;   // kit -> card name -> value

/** The lines of one block (from the line matching `start` to the next line matching `end`), as kit -> card -> the number `value` picks. */
function parse(lines: string[], start: RegExp, end: RegExp, value: (line: string) => number | null): Table {
  const out: Table = new Map();
  let on = false, kit = '';
  for (const line of lines) {
    if (start.test(line)) { on = true; continue; }
    if (on && end.test(line)) break;
    if (!on) continue;
    const k = /^ {2}([a-z-]+)$/.exec(line);
    if (k) { kit = k[1]; out.set(kit, new Map()); continue; }
    const c = /^ {4}L(\d+)\s+(.+?) \(([ADF])\)/.exec(line);
    if (!c || !kit) continue;
    const v = value(line);
    if (v !== null) out.get(kit)!.set(`L${c[1]} ${c[2]} (${c[3]})`, v);
  }
  return out;
}

const firstNumber = (line: string): number | null => { const m = /\)\s+(-?\d+) ±/.exec(line); return m ? Number(m[1]) : null; };
const thinned = parse(read('cards.txt'), new RegExp(`^level ${level}:`), /^level \d+:|^every control/, firstNumber);
const jumps = parse(read('cards2-jumps.txt'), /THE ELEMENTS SET/, /^every control/, line => { const m = /the card\s+(-?\d+) ±/.exec(line); return m ? Number(m[1]) : null; });
const vor = parse(read('cards2-vor.txt'), new RegExp(`value over replacement at level ${level}`), /=== THE ELEMENTS SET|^every control/, firstNumber);
const shapley = parse(read('cards2-shapley.txt'), /THE ELEMENTS SET/, /^every control/, line => { const m = /Shapley\s+(-?\d+)/.exec(line); return m ? Number(m[1]) : null; });

const methods: [string, Table][] = [['in a thinned hand', thinned], ['newest card', jumps], ['over vanilla', vor], ['Shapley', shapley]];
const kits = [...thinned.keys()];
for (const kit of kits) {
  console.log(`\n${kit}`);
  console.log(`  ${''.padEnd(34)}${methods.map(([n]) => n.padStart(19)).join('')}`);
  for (const card of [...thinned.get(kit)!.keys()].sort((x, y) => Number(/^L(\d+)/.exec(x)![1]) - Number(/^L(\d+)/.exec(y)![1]))) {
    console.log(`  ${card.padEnd(34)}${methods.map(([, t]) => { const v = t.get(kit)?.get(card); return (v === undefined ? '' : String(v)).padStart(19); }).join('')}`);
  }
}

function correlation(a: Table, b: Table): { r: number; n: number } {
  const xs: number[] = [], ys: number[] = [];
  for (const [kit, cards] of a) for (const [card, v] of cards) { const w = b.get(kit)?.get(card); if (w !== undefined) { xs.push(v); ys.push(w); } }
  const mean = (v: number[]) => v.reduce((t, x) => t + x, 0) / Math.max(1, v.length);
  const mx = mean(xs), my = mean(ys);
  const cov = xs.reduce((t, x, i) => t + (x - mx) * (ys[i] - my), 0);
  return { r: cov / Math.sqrt(xs.reduce((t, x) => t + (x - mx) ** 2, 0) * ys.reduce((t, y) => t + (y - my) ** 2, 0)), n: xs.length };
}

console.log(`\nHow alike the methods rate the level-${level} cards (correlation over the cards both rate):`);
for (let i = 0; i < methods.length; i++) for (let j = i + 1; j < methods.length; j++) {
  const c = correlation(methods[i][1], methods[j][1]);
  if (c.n > 2) console.log(`  ${methods[i][0]} / ${methods[j][0]}: ${c.r.toFixed(2)} (${c.n} cards)`);
}
