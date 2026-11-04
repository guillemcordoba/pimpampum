/**
 * THE GAME DYNAMICS REPORT (the user, 2026-11-04: the machinery runs the tests
 * the question needs, explains how the game actually plays, and recommends the
 * fixes that meet every constraint). One command, one page:
 *  1. how fights play today — the real kits and the vanilla structure, at the
 *     checkpoints: pace, where the damage comes from, what is played, burst;
 *  2. why — the arithmetic of the constraints, and where they collide;
 *  3. candidate fixes, each measured on vanilla (PV derived) and on the real
 *     kits (applied mechanically, in the measurement only), against every
 *     constraint, with their costs;
 *  4. the recommendation.
 *
 *   pnpm --filter @pimpampum/tools exec tsx src/dynamics-report.ts --set elements --out report.html
 */
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { flag, games, isolated, kitOnlyDynamics, kitsDynamics, lanesNow, useSet } from '@pimpampum/bench';
import {
  burstHolds, CANDIDATE_FIXES, checksMet, explain, feasibility, FIX_BUDGET, MAX_MEDIAN_ROUNDS, MAX_P90_ROUNDS, rankFixes, summarise,
  vanillaKit, vanillaPrint, withControlKit, type DynamicsSummary, type FixResult, type LadderRung,
} from '@pimpampum/playtest';
import { chosenSet } from './sets.js';

const SET = await chosenSet();
useSet(SET.gameSet);
const { ATTACK_LADDER, DEFENSE_LADDER, BODY_PV } = SET.root;
const LEVELS = (flag('--levels') ?? '3,6,10').split(',').map(Number);
const OUT = flag('--out') ?? 'game-dynamics.html';
const fights = games(120);
const budget = { vanillaFights: games(FIX_BUDGET.vanillaFights), realFights: games(FIX_BUDGET.realFights), duelGames: games(FIX_BUDGET.duelGames) };
const rung = (l: number): LadderRung => ({ attack: ATTACK_LADDER[l], defense: DEFENSE_LADDER[l] });
const log = (s: string) => process.stderr.write(`${s}\n`);

// --- 1. today ------------------------------------------------------------------
log('measuring today\'s fights…');
const today = LEVELS.map(level => ({
  level,
  real: summarise(kitsDynamics(level, fights)),
  vanilla: withControlKit(vanillaKit(level, rung(level), 1), def => summarise(kitOnlyDynamics(def.id, vanillaPrint(def), level, fights))),
}));

// --- 2. the arithmetic --------------------------------------------------------------
const arithmetic = feasibility({ ladder: Object.fromEntries(LEVELS.map(l => [l, rung(l)])), pv: BODY_PV, armour: 1, teamSize: 2, mix: { attack: 0.4, defense: 0.3 } }, LEVELS, MAX_P90_ROUNDS);

// --- 3. the fixes, each in its own process --------------------------------------
const ladder = Object.fromEntries(Object.keys(ATTACK_LADDER).map(Number).map(l => [l, { attack: ATTACK_LADDER[l].toString(), defense: DEFENSE_LADDER[l].toString() }]));
const PLAYTEST = fileURLToPath(import.meta.resolve('@pimpampum/playtest'));
const results: FixResult[] = [];
let next = 0;
await Promise.all(Array.from({ length: Math.max(1, Math.min(lanesNow(), CANDIDATE_FIXES.length)) }, async () => {
  for (let i = next++; i < CANDIDATE_FIXES.length; i = next++) {
    results.push(await isolated<FixResult>(PLAYTEST, 'evaluateFix', [SET.ref, CANDIDATE_FIXES[i], ladder, LEVELS, budget]));
    log(`fix ${results.length}/${CANDIDATE_FIXES.length}: ${CANDIDATE_FIXES[i].id}`);
  }
}));
const ranked = rankFixes(results);

// --- 4. the page --------------------------------------------------------------------
const pc = (x: number) => `${Math.round(100 * x)}%`;
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const SOURCES: [keyof DynamicsSummary['sources'], string][] = [
  ['open', 'open bodies'], ['guarded', 'through guards'], ['area', 'area'], ['focus', 'Focus'],
  ['counter', 'counters'], ['defense', 'defense payoffs'], ['roundEnd', 'statuses'],
];
const bar = (s: DynamicsSummary) => `<div class="bar" role="img" aria-label="${SOURCES.map(([k, n]) => `${n} ${pc(s.sources[k])}`).join(', ')}">${
  SOURCES.filter(([k]) => s.sources[k] > 0.005).map(([k, n]) => `<span class="seg seg-${k}" style="width:${Math.round(1000 * s.sources[k]) / 10}%" title="${n}: ${pc(s.sources[k])}"></span>`).join('')}</div>`;
const legend = `<div class="legend">${SOURCES.map(([k, n]) => `<span><i class="sw seg-${k}"></i>${n}</span>`).join('')}</div>`;
const verdict = (ok: boolean) => `<span class="chip ${ok ? 'ok' : 'bad'}">${ok ? 'holds' : 'fails'}</span>`;
const pace = (s: DynamicsSummary) => `<span class="num">${s.median}</span> · <span class="num">${s.p90}</span>${s.stallRate ? ` · <span class="num">${pc(s.stallRate)}</span> stall` : ''}`;

const todaySection = today.map(({ level, real, vanilla }) => `
  <article class="level">
    <h3>Level ${level}</h3>
    <div class="pair">
      <div class="side"><h4>The real kits ${verdict(real.ends)}</h4><p class="pace">rounds: median · 9 in 10 — ${pace(real)}</p>${bar(real)}
        <ul>${explain(real).map(t => `<li>${esc(t)}</li>`).join('')}</ul></div>
      <div class="side"><h4>Vanilla (ladder cards only) ${verdict(vanilla.ends)}</h4><p class="pace">rounds: median · 9 in 10 — ${pace(vanilla)}</p>${bar(vanilla)}
        <ul>${explain(vanilla).map(t => `<li>${esc(t)}</li>`).join('')}</ul></div>
    </div>
  </article>`).join('');

const arithmeticRows = arithmetic.map(r => `<tr><td>L${r.level}</td><td class="num">${ATTACK_LADDER[r.level]}</td><td class="num">${r.landsBare.toFixed(1)}</td><td class="num">${r.landsOnGuard.toFixed(1)}</td><td class="num">${r.pureRounds.toFixed(1)}</td><td class="num">${r.pvPure.toFixed(0)}</td></tr>`).join('');

const cell = (r: FixResult, level: number) => {
  const l = r.levels.find(x => x.level === level)!;
  const floor = Math.max(l.vanilla.roundOnePV, r.fix.burst === 'plain' ? l.vanilla.plainBlowPV : l.vanilla.bestBlowPV);
  const win = l.vanilla.lengthPV === null ? 'none' : `${floor}–${l.vanilla.lengthPV}`;
  const triangle = l.triangle.every(e => e.holds);
  return `<td><div class="cellgrid">
    <span>PV <b class="num">${l.vanilla.pv ?? '—'}</b> <small>(window ${win}; real kits at ${l.pv})</small></span>
    <span>${verdict(l.real.ends)} length <small class="num">${l.real.median}·${l.real.p90}${l.real.stallRate ? `·${pc(l.real.stallRate)}` : ''}</small></span>
    <span>${verdict(triangle)} triangle${triangle ? '' : ` <small>${l.triangle.filter(e => !e.holds).map(e => `${e.edge} ${pc(e.winrate)}`).join(', ')}</small>`}</span>
    <span>${verdict(l.turtle.loses)} turtle <small class="num">${pc(l.turtle.score)}</small></span>
    <span>${verdict(burstHolds(l.real))} burst <small>one-shots ${pc(l.real.oneShots)} · round-1 KOs ${pc(l.real.roundOneKOs)}</small></span>
  </div></td>`;
};
const fixRows = ranked.map(({ result: r, score: s }, i) => `<tr class="${i === 0 ? 'top' : ''}">
  <th scope="row"><span class="rank">${i + 1}</span> ${esc(r.fix.label)}${r.focusOnRealKits ? '' : '<br><small class="note">Focus change measured on vanilla only (real Focus cards need rebuilding)</small>'}</th>
  ${LEVELS.map(l => cell(r, l)).join('')}
  <td><ul class="costs">${s.costs.length ? s.costs.map(c => `<li>${esc(c)}</li>`).join('') : '<li>none</li>'}</ul></td></tr>`).join('');

const best = ranked[0];
const total = checksMet;
const checks = LEVELS.length * 5;
const recommendation = `
  <p class="lede"><b>${esc(best.result.fix.label)}</b> meets <b>${total(best.score)} of ${checks}</b> constraint checks at the checkpoints (a PV window on vanilla; on the real kits: fights ending, burst in bounds, the triangle, the turtle losing), the most of any candidate${best.score.robustness ? `, with PV windows at least ${best.score.robustness} wide` : ''}.</p>
  <p>Derived hero PV: ${best.result.levels.map(l => `level ${l.level} <b class="num">${l.vanilla.pv ?? '—'}</b>`).join(', ')}.</p>
  ${best.result.focusOnRealKits ? '' : `<p class="note">Its Focus part was measured on vanilla only: real Focus cards can't be scaled mechanically (their power is in their effects), so the real-kit columns show the rest of the fix without it. Rebuilding the Focus cards to about a ${best.result.fix.aim + 1}× blow comes first, then the real game is re-measured.</p>`}
  <p>What it costs: ${best.score.costs.length ? best.score.costs.map(esc).join('; ') : 'nothing beyond today\'s rules'}.</p>
  ${ranked[1] ? `<p>Runner-up: <b>${esc(ranked[1].result.fix.label)}</b> (${total(ranked[1].score)} of ${checks}; costs: ${ranked[1].score.costs.map(esc).join('; ') || 'none'}).</p>` : ''}
  <p class="muted">Still failing under the recommendation: ${best.result.levels.flatMap(l => [
    ...(l.vanilla.pv === null ? [`level ${l.level}: no PV window (${l.vanilla.collides.join('; ')})`] : []),
    ...(!l.real.ends ? [`level ${l.level}: real fights run ${l.real.median}·${l.real.p90}`] : []),
    ...l.triangle.filter(e => !e.holds).map(e => `level ${l.level}: ${e.edge} at ${pc(e.winrate)}`),
    ...(!l.turtle.loses ? [`level ${l.level}: the turtle scores ${pc(l.turtle.score)}`] : []),
    ...(!burstHolds(l.real) ? [`level ${l.level}: real burst — ${pc(l.real.roundOneKOs)} fall in round 1, ${pc(l.real.oneShots)} felled from full by one card`] : []),
  ]).map(esc).join('; ') || 'nothing'}.</p>`;

const nobody: string[] = [];
for (const level of LEVELS) {
  const at = (r: FixResult) => r.levels.find(l => l.level === level)!;
  for (const edge of ['Power > Protect', 'Protect > Aggro', 'Aggro > Power']) {
    if (results.every(r => !at(r).triangle.find(e => e.edge === edge)!.holds)) nobody.push(`level ${level}: ${edge} fails under every candidate`);
  }
  if (results.every(r => at(r).vanilla.pv === null)) nobody.push(`level ${level}: no candidate gives vanilla a PV window`);
  if (results.every(r => !burstHolds(at(r).real))) nobody.push(`level ${level}: real burst is out of bounds under every candidate`);
}

// The structural facts, computed.
const facts: string[] = [];
const vDef = today.map(t => pc(t.vanilla.mix.defense)).join(' / '), vStall = today.map(t => pc(t.vanilla.stallRate)).join(' / ');
facts.push(`Plain ladder cards make a turtle game: in vanilla, defenses are ${vDef} of the plays at levels ${LEVELS.join(' / ')}, and ${vStall} of the fights never end.`);
facts.push(`Guards erase blows: in the real game only ${today.map(t => pc(t.real.sources.guarded)).join(' / ')} of the damage goes through a guard; it comes from bodies caught open (${today.map(t => pc(t.real.sources.open)).join(' / ')}), area attacks (${today.map(t => pc(t.real.sources.area)).join(' / ')}), Focus (${today.map(t => pc(t.real.sources.focus)).join(' / ')}) and statuses (${today.map(t => pc(t.real.sources.roundEnd)).join(' / ')}).`);
facts.push(`The real game moves ${today.map(t => t.real.pvPerRound.toFixed(1)).join(' / ')} PV a round: fights last ${today.map(t => `${t.real.median}·${t.real.p90}`).join(' / ')} rounds (median·9 in 10) against bars of ${MAX_MEDIAN_ROUNDS}·${MAX_P90_ROUNDS}.`);
const top = today[today.length - 1];
facts.push(`At level ${top.level} the game turns on burst: ${pc(top.real.sources.area)} of the damage is area attacks, ${pc(top.real.roundOneKOs)} of the heroes fall in round 1 and ${pc(top.real.bigBlows)} of the hurting cards take half a body at once.`);

const html = `<title>Pim Pam Pum Dynamics</title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;600&family=IBM+Plex+Sans+Condensed:wght@500;700&family=IBM+Plex+Sans:wght@400;600&display=swap">
<style>
/* A lab report: one reading column, wide tables in their own scrollers; the damage bars are the one visual device. */
:root {
  --bg: #f5f7f5; --surface: #ffffff; --fg: #1c2420; --muted: #5d6b64; --line: #d7ddd9;
  --accent: #2f6b4f; --ok: #2f7d4f; --bad: #b4413c; --warn: #a86b12;
  --s-open: #2f6b4f; --s-guarded: #8fb3a0; --s-area: #4f7fa8; --s-focus: #a86b12; --s-counter: #b4413c; --s-defense: #7a5ea8; --s-roundEnd: #8a8f8c;
  --display: "IBM Plex Sans Condensed", "Arial Narrow", system-ui, sans-serif;
  --body: "IBM Plex Sans", system-ui, -apple-system, "Segoe UI", sans-serif;
  --mono: "IBM Plex Mono", ui-monospace, "SFMono-Regular", Menlo, monospace;
}
@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) {
  --bg: #121614; --surface: #1a201d; --fg: #e3e9e5; --muted: #9aa8a0; --line: #2c3530;
  --accent: #6fbf94; --ok: #6fbf94; --bad: #e07a73; --warn: #d9a44a;
  --s-open: #6fbf94; --s-guarded: #3f6b55; --s-area: #7fa9d1; --s-focus: #d9a44a; --s-counter: #e07a73; --s-defense: #a98ad6; --s-roundEnd: #6c726e; color-scheme: dark } }
:root[data-theme="dark"] {
  --bg: #121614; --surface: #1a201d; --fg: #e3e9e5; --muted: #9aa8a0; --line: #2c3530;
  --accent: #6fbf94; --ok: #6fbf94; --bad: #e07a73; --warn: #d9a44a;
  --s-open: #6fbf94; --s-guarded: #3f6b55; --s-area: #7fa9d1; --s-focus: #d9a44a; --s-counter: #e07a73; --s-defense: #a98ad6; --s-roundEnd: #6c726e; color-scheme: dark }
body { background: var(--bg); color: var(--fg); font: 15px/1.6 var(--body); }
.wrap { max-width: 1100px; margin: 0 auto; padding-inline: 16px; padding-block: 32px 64px; display: grid; gap: 40px; }
.prose { max-width: 68ch; }
h1, h2, h3, h4 { font-family: var(--display); line-height: 1.15; text-wrap: balance; margin: 0; }
h1 { font-size: 2.1rem; font-weight: 700; }
h2 { font-size: 1.45rem; font-weight: 700; border-bottom: 1px solid var(--line); padding-bottom: 6px; }
h3 { font-size: 1.15rem; font-weight: 700; color: var(--accent); }
h4 { font-size: 1rem; font-weight: 500; display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
section { display: grid; gap: 16px; }
p { margin: 0; }
.lede { font-size: 1.1rem; }
.muted, small { color: var(--muted); }
.eyebrow { font: 600 0.75rem/1 var(--mono); letter-spacing: 0.08em; text-transform: uppercase; color: var(--muted); }
.num { font-family: var(--mono); font-variant-numeric: tabular-nums; }
.level { display: grid; gap: 12px; }
.pair { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 16px; }
.side { min-width: 0; background: var(--surface); border: 1px solid var(--line); border-radius: 6px; padding: 14px 16px; display: grid; gap: 10px; align-content: start; }
.side ul { margin: 0; padding-left: 18px; display: grid; gap: 6px; }
.pace { font-size: 0.9rem; color: var(--muted); }
.bar { display: flex; height: 14px; border-radius: 3px; overflow: hidden; background: var(--line); }
.seg { height: 100%; }
.legend { display: flex; flex-wrap: wrap; gap: 6px 16px; font-size: 0.82rem; color: var(--muted); }
.legend span { display: inline-flex; align-items: center; gap: 6px; }
.sw { width: 12px; height: 12px; border-radius: 2px; display: inline-block; }
${SOURCES.map(([k]) => `.seg-${k} { background: var(--s-${k}); }`).join('\n')}
.chip { font: 600 0.7rem/1 var(--mono); letter-spacing: 0.04em; text-transform: uppercase; padding: 3px 6px; border-radius: 3px; border: 1px solid currentColor; }
.chip.ok { color: var(--ok); } .chip.bad { color: var(--bad); }
.scroll { overflow-x: auto; border: 1px solid var(--line); border-radius: 6px; background: var(--surface); }
table { border-collapse: collapse; width: 100%; font-size: 0.88rem; }
th, td { text-align: left; vertical-align: top; padding: 10px 12px; border-bottom: 1px solid var(--line); }
thead th { font: 600 0.75rem/1.2 var(--mono); letter-spacing: 0.06em; text-transform: uppercase; color: var(--muted); }
tbody th { font-weight: 600; min-width: 220px; }
tr.top { background: color-mix(in srgb, var(--accent) 8%, transparent); }
.rank { font-family: var(--mono); color: var(--accent); }
.cellgrid { display: grid; gap: 4px; min-width: 190px; }
.costs { margin: 0; padding-left: 16px; display: grid; gap: 4px; min-width: 200px; }
.note { color: var(--warn); }
.facts { margin: 0; padding-left: 20px; display: grid; gap: 8px; max-width: 80ch; }
.recommend { background: var(--surface); border: 1px solid var(--accent); border-radius: 6px; padding: 18px 20px; display: grid; gap: 10px; }
</style>
<div class="wrap">
  <header class="prose" style="display:grid;gap:10px">
    <span class="eyebrow">Els Quatre Elements · checkpoints L${LEVELS.join(' / L')} · ${fights} fights a cell</span>
    <h1>How the game plays, and what would fix it</h1>
    <p class="lede">The constraints: fights end (median ≤ ${MAX_MEDIAN_ROUNDS} rounds, 9 in 10 within ${MAX_P90_ROUNDS}, almost no stalls), a fresh hero survives round 1 and its level's best blow, Power &gt; Protect &gt; Aggro &gt; Power, and a pure turtle loses. Hero PV is derived from them, never chosen.</p>
  </header>

  <section>
    <h2>The dynamics in four lines</h2>
    <ul class="facts">${facts.map(f => `<li>${esc(f)}</li>`).join('')}</ul>
  </section>

  <section class="recommend">
    <span class="eyebrow">Recommendation</span>
    ${recommendation}
    ${nobody.length ? `<p><b>What no candidate fixes:</b> ${nobody.map(esc).join('; ')} — these need a lever outside the candidates (cards, not structure).</p>` : ''}
  </section>

  <section>
    <h2>How fights play today</h2>
    <p class="prose muted">The real kits (2v2, drawn at random, the production AI, today's ${BODY_PV} PV) beside vanilla kits (only the ladder's attack, defense and an Aim). The bar splits the PV lost by where it came from.</p>
    ${legend}
    ${todaySection}
  </section>

  <section>
    <h2>Why: the arithmetic</h2>
    <p class="prose">A ladder blow into its own level's defense takes almost nothing; the damage comes from bodies caught without a guard. Even if nobody ever defended, a side of two ${BODY_PV}-PV heroes falls in the rounds below — the floor no card tuning can beat.</p>
    <div class="scroll"><table>
      <thead><tr><th>level</th><th>ladder blow</th><th>lands on an open body</th><th>through its level's guard</th><th>rounds if nobody defends</th><th>PV for ${MAX_P90_ROUNDS} rounds then</th></tr></thead>
      <tbody>${arithmeticRows}</tbody>
    </table></div>
  </section>

  <section>
    <h2>Candidate fixes, measured</h2>
    <p class="prose muted">Each fix: hero PV derived on vanilla kits at every checkpoint, then the real kits played under it (chip damage and shifted defenses applied mechanically, in the measurement only — no card was changed). Ranked by constraints met, then fewest costs, then the widest PV windows.</p>
    <div class="scroll"><table>
      <thead><tr><th>fix</th>${LEVELS.map(l => `<th>level ${l}</th>`).join('')}<th>what it costs</th></tr></thead>
      <tbody>${fixRows}</tbody>
    </table></div>
  </section>
</div>`;

fs.writeFileSync(OUT, html);
log(`wrote ${OUT}`);
