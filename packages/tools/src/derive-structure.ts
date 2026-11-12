/**
 * WHICH STRUCTURE LETS THE SET'S REQUIREMENTS HOLD? (the user, 2026-11-04:
 * derive, don't choose — one level up from PV; then: make the structure
 * decision easy.) A grid of candidate structures (playtest `Fix`): how strong a
 * Focus is, how far below the ladder the defenses sit, how much of a held blow
 * still lands (the engine's chip damage), which blow a fresh hero must
 * survive, and two guard rules: Envoltat (a guard rolls once per blow on its
 * body, keeping the worst) and whether a defense guarding an ally still
 * covers its player. Each is measured by `evaluateFix` at every level asked: hero PV
 * derived on the vanilla twins, then the real kits played at it (fights end,
 * burst, the triangle, dumb play). One page: the candidates ranked, each
 * level's derived PV and checks, and what each costs.
 *
 *   pnpm --filter @pimpampum/tools exec tsx src/derive-structure.ts --set elements --out structure.html
 *   … --aims 1,2,3 --shifts 0,-1 --chips 0,0.25,0.5 --bursts fast --envoltat on,off --guard one,both --levels 3,4,5,6,7,8,9,10
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { flag, games, inLanes, isolated, kitsDynamics, useSet } from '@pimpampum/bench';
import { burstHolds, census, checksMet, FIX_BUDGET, rankFixes, type Fix, type FixLevel, type FixResult } from '@pimpampum/playtest';
import { chosenSet } from './sets.js';

const SET = await chosenSet();
useSet(SET.gameSet);
const { ATTACK_LADDER, DEFENSE_LADDER, heroPV } = SET.root;
const pvRange = (level: number) => { const pvs = SET.gameSet.calibration.mainKits.map(k => heroPV({ [k]: level })); const lo = Math.min(...pvs), hi = Math.max(...pvs); return lo === hi ? `${lo}` : `${lo}-${hi}`; };
const list = (f: string, d: string) => (flag(f) ?? d).split(',');
const aims = list('--aims', '1,2,3').map(Number);
const shifts = list('--shifts', '0,-1').map(Number);
const chips = list('--chips', '0,0.25,0.5').map(Number);
const bursts = list('--bursts', 'fast') as Fix['burst'][];
const envoltats = list('--envoltat', 'on').map(v => v !== 'off');
const guardsBoth = list('--guard', 'one').map(v => v === 'both');
const LEVELS = list('--levels', '3,4,5,6,7,8,9,10').map(Number);
const OUT = flag('--out') ?? path.join(os.tmpdir(), 'structure.html');
const budget = { vanillaFights: games(2 * FIX_BUDGET.vanillaFights), realFights: games(2 * FIX_BUDGET.realFights), duelGames: games(2 * FIX_BUDGET.duelGames) };
const log = (s: string) => process.stderr.write(`${s}\n`);
const PLAYTEST = fileURLToPath(import.meta.resolve('@pimpampum/playtest'));

const label = (aim: number, shift: number, chip: number, burst: Fix['burst'], envoltat: boolean, both: boolean) => [
  aim === 1 ? 'Focus as today' : `Focus ×${(aim + 1) / 2}`,
  ...(chip ? [`chip ${Math.round(100 * chip)}%`] : []),
  ...(shift ? [`defenses ${-shift} rung${shift === -1 ? '' : 's'} lower`] : []),
  ...(envoltat ? [] : ['Envoltat off']),
  ...(both ? ['a guard covers both bodies'] : []),
].join(' + ') + (burst === 'fast' ? '' : ` (floor: the twins' ${burst} blow)`);
const fixes: Fix[] = aims.flatMap(aim => shifts.flatMap(defenseShift => chips.flatMap(chip => bursts.flatMap(burst =>
  envoltats.flatMap(envoltat => guardsBoth.map(both => ({
    id: `a${aim}-s${defenseShift}-c${chip}-${burst}${envoltat ? '' : '-noenv'}${both ? '-both' : ''}`,
    label: label(aim, defenseShift, chip, burst, envoltat, both), aim, defenseShift, chip, burst,
    ...(envoltat ? {} : { envoltat: false }), ...(both ? { guardCoversDefender: true } : {}),
  })))))));

// What each card did in today's fights: the twins are built from it.
log(`today's fights at L${LEVELS.join(', L')}…`);
const cards = census(LEVELS.map(level => kitsDynamics(level, games(120)).cards));

const ladder = Object.fromEntries(Object.keys(ATTACK_LADDER).map(Number).map(l => [l, { attack: ATTACK_LADDER[l].toString(), defense: DEFENSE_LADDER[l].toString() }]));
const jobs = fixes.flatMap(fix => LEVELS.map(level => ({ fix, level })));
const byFix = new Map<string, FixLevel[]>();
let done = 0;
await inLanes(jobs.map(({ fix, level }) => async () => {
  const r = await isolated<FixResult>(PLAYTEST, 'evaluateFix', [SET.ref, fix, ladder, [level], budget, cards]);
  byFix.set(fix.id, [...(byFix.get(fix.id) ?? []), ...r.levels]);
  log(`${++done}/${jobs.length}: ${fix.id} L${level}`);
}));
const ranked = rankFixes(fixes.map(fix => ({ fix, levels: byFix.get(fix.id)!.sort((a, b) => a.level - b.level), focusOnRealKits: fix.aim === 1 })));

// --- the page ---
const pc = (x: number) => `${Math.round(100 * x)}%`;
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const CHECKS: [string, (l: FixLevel) => boolean, (l: FixLevel) => string][] = [
  ['PV', l => l.vanilla.pv !== null, l => l.vanilla.pv === null ? `no window (${l.vanilla.collides.join('; ')})` : `window to ${l.vanilla.lengthPV}`],
  ['ends', l => l.real.ends, l => `${l.real.median}·${l.real.p90}${l.real.stallRate ? ` · ${pc(l.real.stallRate)} stall` : ''}`],
  ['interactive', l => burstHolds(l.real), l => `worst card fells a fresh hero with no answer on ${pc(l.real.unanswerableKOs)} of its plays`],
  ['triangle', l => l.triangle.every(e => e.holds), l => l.triangle.map(e => `${e.edge.replace(/ /g, '')} ${pc(e.winrate)}`).join(' · ')],
  ['dumb', l => l.dumb.every(d => d.loses), l => l.dumb.map(d => `${d.style} ${pc(d.score)}`).join(' · ')],
];
const cell = (l: FixLevel) => `<td><div class="pv num">${l.vanilla.pv ?? '—'}</div><div class="marks">${CHECKS.map(([name, ok, why]) =>
  `<span class="m ${ok(l) ? 'ok' : 'bad'}" title="${esc(`${name}: ${why(l)}`)}">${name}</span>`).join('')}</div></td>`;
const rows = ranked.map(({ result: r, score: s }, i) => `<tr class="${i === 0 ? 'top' : ''}">
  <th scope="row"><span class="rank">${i + 1}</span> ${esc(r.fix.label)}<small class="num">${checksMet(s)} of ${LEVELS.length * CHECKS.length}${r.focusOnRealKits ? '' : ' · Focus measured on the twins only'}</small></th>
  ${r.levels.map(cell).join('')}
  <td><ul class="costs">${s.conflicts.map(c => `<li class="against">${esc(c)}</li>`).join('')}${s.costs.map(c => `<li>${esc(c)}</li>`).join('')}${s.conflicts.length + s.costs.length ? '' : '<li>none</li>'}</ul></td></tr>`).join('');
const best = ranked[0];
const failing = best.result.levels.flatMap(l => CHECKS.filter(([, ok]) => !ok(l)).map(([name, , why]) => `L${l.level} ${name}: ${why(l)}`));

const html = `<title>Elements Structure Search</title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;600&family=IBM+Plex+Sans+Condensed:wght@500;700&family=IBM+Plex+Sans:wght@400;600&display=swap">
<style>
:root {
  --bg: #f5f7f5; --surface: #ffffff; --fg: #1c2420; --muted: #5d6b64; --line: #d7ddd9; --accent: #2f6b4f;
  --ok: #2f7d4f; --bad: #b4413c; --ok-bg: #e6f2ea; --bad-bg: #f8e7e5;
  --display: "IBM Plex Sans Condensed", "Arial Narrow", system-ui, sans-serif;
  --body: "IBM Plex Sans", system-ui, -apple-system, "Segoe UI", sans-serif;
  --mono: "IBM Plex Mono", ui-monospace, "SFMono-Regular", Menlo, monospace;
}
@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) {
  --bg: #121614; --surface: #1a201d; --fg: #e3e9e5; --muted: #9aa8a0; --line: #2c3530; --accent: #6fbf94;
  --ok: #6fbf94; --bad: #e07a73; --ok-bg: #1b2d23; --bad-bg: #352120; color-scheme: dark } }
:root[data-theme="dark"] {
  --bg: #121614; --surface: #1a201d; --fg: #e3e9e5; --muted: #9aa8a0; --line: #2c3530; --accent: #6fbf94;
  --ok: #6fbf94; --bad: #e07a73; --ok-bg: #1b2d23; --bad-bg: #352120; color-scheme: dark }
body { background: var(--bg); color: var(--fg); font: 15px/1.55 var(--body); }
.wrap { max-width: 1400px; margin: 0 auto; padding-inline: 16px; padding-block: 32px 64px; display: grid; gap: 24px; }
.prose { max-width: 75ch; display: grid; gap: 10px; }
h1 { font: 700 2rem/1.15 var(--display); margin: 0; text-wrap: balance; }
p { margin: 0; }
small, .muted { color: var(--muted); }
.eyebrow { font: 600 0.75rem/1 var(--mono); letter-spacing: 0.08em; text-transform: uppercase; color: var(--muted); }
.num { font-family: var(--mono); font-variant-numeric: tabular-nums; }
.recommend { background: var(--surface); border: 1px solid var(--accent); border-radius: 6px; padding: 16px 18px; display: grid; gap: 8px; max-width: 90ch; }
.scroll { overflow-x: auto; border: 1px solid var(--line); border-radius: 6px; background: var(--surface); }
table { border-collapse: collapse; width: 100%; font-size: 0.85rem; }
th, td { text-align: left; vertical-align: top; padding: 8px 10px; border-bottom: 1px solid var(--line); }
thead th { font: 600 0.72rem/1.2 var(--mono); letter-spacing: 0.06em; text-transform: uppercase; color: var(--muted); }
tbody th { min-width: 230px; font-weight: 600; }
tbody th small { display: block; font-weight: 400; }
tr.top { background: color-mix(in srgb, var(--accent) 8%, transparent); }
.rank { font-family: var(--mono); color: var(--accent); }
.pv { font-size: 1.05rem; font-weight: 600; }
.marks { display: flex; flex-wrap: wrap; gap: 3px; margin-top: 4px; min-width: 120px; }
.m { font: 600 0.66rem/1 var(--mono); padding: 3px 4px; border-radius: 3px; cursor: help; }
.m.ok { background: var(--ok-bg); color: var(--ok); } .m.bad { background: var(--bad-bg); color: var(--bad); }
.costs { margin: 0; padding-left: 16px; display: grid; gap: 4px; min-width: 200px; }
.costs .against { color: var(--bad); }
</style>
<div class="wrap">
  <header class="prose">
    <span class="eyebrow">${esc(SET.gameSet.id)} · levels ${LEVELS.join(', ')} · ${budget.vanillaFights} vanilla / ${budget.realFights} real fights, ${budget.duelGames} duels a cell</span>
    <h1>Which structure lets the set's requirements hold</h1>
    <p>Each candidate changes the structure, not the cards: how strong a Focus is, where defenses sit on the ladder, how much of a held blow lands, which blow a fresh hero must survive. Hero PV is derived for it on the vanilla twins at every level, then the real kits play at that PV. A cell shows the derived PV and five checks (hover for the numbers): a PV that meets the floor, fights ending in time, interactivity (no knockout without an answer), the triangle, dumb play losing. Today's heroes carry ${LEVELS.map(l => `${pvRange(l)} PV at L${l}`).join(', ')}.</p>
  </header>
  <section class="recommend">
    <span class="eyebrow">Best candidate</span>
    <p><b>${esc(best.result.fix.label)}</b>: ${checksMet(best.score)} of ${LEVELS.length * CHECKS.length} checks. Derived PV ${best.result.levels.map(l => `L${l.level} <b class="num">${l.vanilla.pv ?? '—'}</b>`).join(', ')}.</p>
    <p>Costs: ${best.score.costs.length ? best.score.costs.map(esc).join('; ') : 'none'}${best.score.conflicts.length ? `; against "defenses completely block an unbuffed attack": ${best.score.conflicts.map(esc).join('; ')}` : ''}.</p>
    <p>Still failing: ${failing.length ? failing.map(esc).join('; ') : 'nothing'}.</p>
  </section>
  <div class="scroll"><table>
    <thead><tr><th>candidate</th>${LEVELS.map(l => `<th>L${l}</th>`).join('')}<th>costs</th></tr></thead>
    <tbody>${rows}</tbody>
  </table></div>
</div>`;
fs.writeFileSync(OUT, html);
log(`wrote ${OUT}`);
for (const { result: r, score: s } of ranked.slice(0, 5)) log(`${checksMet(s)}/${LEVELS.length * CHECKS.length}  ${r.fix.label}  PV ${r.levels.map(l => l.vanilla.pv ?? '—').join('/')}`);
