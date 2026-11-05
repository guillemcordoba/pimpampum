/**
 * THE GAME DYNAMICS REPORT (the user, 2026-11-04: the machinery runs the tests
 * the question needs, explains how the game actually plays, and recommends the
 * fixes that meet every constraint; brief, organised around the requirements,
 * and about the set alone: the machinery's own checks stay in their tests).
 * One command, one page:
 *  1. every requirement a set is held to (playtest `REQUIREMENTS`): how well
 *     it holds today (at each checkpoint, or once for the whole set) and under
 *     the recommended fix;
 *  2. the recommendation, and what no candidate fixes;
 *  3. folded: how fights play, the arithmetic, every candidate fix, why
 *     today's failing checks fail.
 *
 *   pnpm --filter @pimpampum/tools exec tsx src/dynamics-report.ts --set elements --out report.html
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { flag, games, isolated, kitsDynamics, lanesNow, useSet } from '@pimpampum/bench';
import {
  analyze, autopsyLines, burstHolds, CANDIDATE_FIXES, KIT_BAND, census, checksMet, explain, feasibility, FIX_BUDGET, GATE_BUDGET,
  MAX_BEST_BLOW_KOS, MAX_MEDIAN_ROUNDS, MAX_P90_ROUNDS, MAX_ROUND_ONE_KOS, measureGate, prepare, prepareGate, rankFixes, REQUIREMENTS,
  summarise, type DynamicsSummary, type FixLevel, type FixResult,
  type GateBudget, type KitReport, type LadderRung, type Requirement,
} from '@pimpampum/playtest';
import { chosenSet } from './sets.js';

const SET = await chosenSet();
useSet(SET.gameSet);
const { ATTACK_LADDER, DEFENSE_LADDER, BODY_PV } = SET.root;
const LEVELS = (flag('--levels') ?? '3,6,10').split(',').map(Number);
const OUT = flag('--out') ?? path.join(os.tmpdir(), 'game-dynamics.html');
const fights = games(120);
const budget = { vanillaFights: games(FIX_BUDGET.vanillaFights), realFights: games(FIX_BUDGET.realFights), duelGames: games(FIX_BUDGET.duelGames) };
const gateBudget: GateBudget = { kitFights: games(GATE_BUDGET.kitFights), duelGames: games(GATE_BUDGET.duelGames), cardFights: games(GATE_BUDGET.cardFights), modelFights: games(GATE_BUDGET.modelFights!) };
const rung = (l: number): LadderRung => ({ attack: ATTACK_LADDER[l], defense: DEFENSE_LADDER[l] });
const log = (s: string) => process.stderr.write(`${s}\n`);

// --- 1. today ------------------------------------------------------------------
log('measuring today\'s fights…');
const realRuns = LEVELS.map(level => ({ level, d: kitsDynamics(level, fights) }));
// What each card did in those fights: the fixes build the vanilla twins from it.
const cards = census(realRuns.map(r => r.d.cards));
const today = realRuns.map(({ level, d }) => ({ level, real: summarise(d) }));

// Today's triangle, dumb play, every kit's fight length and field score, every
// card's use and what choosing is worth: the kit gate's own cells at the
// checkpoints (heroes against heroes, cards priced in the same fights).
log('today\'s gate cells…');
const gateScope = { levels: LEVELS };
await prepareGate({ set: SET.ref, budget: gateBudget }, gateScope);
const gate = measureGate(gateScope, gateBudget);

// The band: every main kit against creatures, the kit analyzer's full-kit run
// (its card values are left out: against creatures' PV a decision's rollouts
// take hours; the gate prices the cards in hero fights).
log('the kit analyzer…');
const ANALYZER_GAMES = games(800);
const BAND_ONLY = { skip: ['cardValue' as const] };
const kitReports: KitReport[] = [];
// Why the band could not be measured at all (no usable calibration cell): the
// row then reads inconclusive instead of the page failing.
let bandUnmeasurable: string | null = null;
for (const id of SET.gameSet.calibration.mainKits) {
  const subject = { mode: 'player' as const, id };
  try {
    await prepare({ set: SET.ref, subject, budget: BAND_ONLY }, subject, ANALYZER_GAMES);
    kitReports.push(analyze(subject, ANALYZER_GAMES, BAND_ONLY));
  } catch (err) {
    bandUnmeasurable = (err as Error).message.split('\n')[0];
    break;
  }
}

// --- 2. the arithmetic --------------------------------------------------------------
const arithmetic = feasibility({ ladder: Object.fromEntries(LEVELS.map(l => [l, rung(l)])), pv: BODY_PV, armour: 1, teamSize: 2, mix: { attack: 0.4, defense: 0.3 } }, LEVELS, MAX_P90_ROUNDS);

// --- 3. the fixes, each in its own process --------------------------------------
const ladder = Object.fromEntries(Object.keys(ATTACK_LADDER).map(Number).map(l => [l, { attack: ATTACK_LADDER[l].toString(), defense: DEFENSE_LADDER[l].toString() }]));
const PLAYTEST = fileURLToPath(import.meta.resolve('@pimpampum/playtest'));
const results: FixResult[] = [];
let next = 0;
await Promise.all(Array.from({ length: Math.max(1, Math.min(lanesNow(), CANDIDATE_FIXES.length)) }, async () => {
  for (let i = next++; i < CANDIDATE_FIXES.length; i = next++) {
    results.push(await isolated<FixResult>(PLAYTEST, 'evaluateFix', [SET.ref, CANDIDATE_FIXES[i], ladder, LEVELS, budget, cards]));
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
const lengthNote = (s: DynamicsSummary) => `${s.median}·${s.p90}${s.stallRate ? ` · ${pc(s.stallRate)} stall` : ''}`;

// --- the requirements, checked ---
// Every requirement has a check today (the real kits at today's PV, the gate's
// cells, the kit analyzer, the cards themselves) and, where the fix evaluation
// measures it, one under a fix. A requirement without one is a bug, not a
// blank row.
/** `ok` null: measured but inconclusive. */
type Check = { ok: boolean | null; note: string };
type Today = (typeof today)[number];
const styleAt = (level: number) => gate.styles.find(c => c.level === level)!;
const kitsAt = (level: number) => gate.kits.filter(c => c.level === level);
const kitId = (r: KitReport) => r.subject.id;
const signed = (x: number) => `${x >= 0 ? '+' : ''}${Math.round(100 * x)}`;
/** One verdict over every main kit: failing kits named, inconclusive ones counted. */
function overKits(fails: (r: KitReport) => boolean | null, show: (r: KitReport) => string, allClear: string): Check {
  const bad = kitReports.filter(r => fails(r) === true), unknown = kitReports.filter(r => fails(r) === null);
  const note = [
    ...(bad.length ? [`${bad.length} of ${kitReports.length} fail: ${bad.map(r => `${kitId(r)} ${show(r)}`).join(', ')}`] : []),
    ...(unknown.length ? [`${unknown.length} inconclusive: ${unknown.map(kitId).join(', ')}`] : []),
  ].join(' · ') || allClear;
  return { ok: bad.length ? false : unknown.length ? null : true, note };
}
/** Today, at each checkpoint (`today`) or once (`once`); under a fix where the fix evaluation measures it. */
const CHECKS: Record<string, { today?: (t: Today) => Check; once?: () => Check; fix?: (l: FixLevel) => Check }> = {
  'fights-end': {
    today: t => {
      const over = kitsAt(t.level).filter(k => !k.ok);
      return { ok: t.real.ends && !over.length, note: `${lengthNote(t.real)}${over.length ? ` · ${over.length} of ${kitsAt(t.level).length} kits over` : ''}` };
    },
    fix: l => ({ ok: l.real.ends, note: lengthNote(l.real) }),
  },
  'round-one': {
    today: t => ({ ok: t.real.roundOneKOs <= MAX_ROUND_ONE_KOS, note: pc(t.real.roundOneKOs) }),
    fix: l => ({ ok: l.real.roundOneKOs <= MAX_ROUND_ONE_KOS, note: pc(l.real.roundOneKOs) }),
  },
  'best-blow': {
    today: t => ({ ok: t.real.oneShots <= MAX_BEST_BLOW_KOS, note: pc(t.real.oneShots) }),
    fix: l => ({ ok: l.real.oneShots <= MAX_BEST_BLOW_KOS, note: pc(l.real.oneShots) }),
  },
  triangle: {
    today: t => {
      const g = styleAt(t.level);
      const bad = g.edges.filter(e => g.broken.includes(`${e.winner} > ${e.loser}`));
      return { ok: !bad.length, note: bad.length ? bad.map(e => `${e.winner}>${e.loser} ${pc(e.winrate)}`).join(', ') : 'all three edges' };
    },
    fix: l => {
      const bad = l.triangle.filter(e => !e.holds);
      return { ok: !bad.length, note: bad.length ? bad.map(e => `${e.edge.replace(/ /g, '')} ${pc(e.winrate)}`).join(', ') : 'all three edges' };
    },
  },
  'dumb-play': {
    today: t => {
      const d = styleAt(t.level).dumb, bad = d.filter(x => !x.ok);
      return { ok: !bad.length, note: bad.length ? bad.map(x => `${x.style} ${pc(x.score)}`).join(', ') : `best ${pc(Math.max(...d.map(x => x.score)))}` };
    },
    fix: l => {
      const bad = l.dumb.filter(x => !x.loses);
      return { ok: !bad.length, note: bad.length ? bad.map(x => `${x.style} ${pc(x.score)}`).join(', ') : `best ${pc(Math.max(...l.dumb.map(x => x.score)))}` };
    },
  },
  field: {
    today: t => {
      const ks = kitsAt(t.level), bad = ks.filter(k => k.dominates), top = [...ks].sort((a, b) => b.winrate - a.winrate)[0];
      return { ok: !bad.length, note: bad.length ? bad.map(k => `${k.kit} ${pc(k.winrate)}`).join(', ') : `top ${top.kit} ${pc(top.winrate)}` };
    },
  },
  band: {
    once: () => bandUnmeasurable ? { ok: null, note: `not measurable: ${bandUnmeasurable}` } : overKits(r => r.strength.inconclusive ? null : !r.strength.ok, r => `${signed(r.strength.band?.delta ?? 0)} pts`, `all within ±${Math.round(100 * KIT_BAND)} pts`),
  },
  choice: {
    today: t => {
      const at = gate.choices.filter(c => c.level === t.level), bad = at.filter(c => !c.ok);
      const low = [...at].sort((a, b) => a.mean - b.mean)[0];
      return { ok: !bad.length, note: bad.length ? bad.map(c => `${c.kit} ${c.mean.toFixed(1)} PV`).join(', ') : `lowest ${low.kit} ${low.mean.toFixed(1)} PV` };
    },
  },
  ladder: {
    once: () => {
      const { over, excused } = SET.root.offTheLadder(SET.root.ALL_SKILLS, SET.root.LADDER_RULES);
      return { ok: !over.length, note: over.length ? `${over.length} over: ${over.join(', ')}` : `every card; ${excused.length} above with a reason` };
    },
  },
  'card-use': {
    once: () => {
      const dead = gate.cards.filter(c => c.neverRight);
      return { ok: !dead.length, note: dead.length ? `never right: ${dead.map(c => `${c.name} (${c.kit})`).join(', ')}` : `all ${gate.cards.length} cards` };
    },
  },
};
for (const r of REQUIREMENTS) if (!CHECKS[r.id]) throw new Error(`requirement ${r.id}: the report has no check for it`);
const onceOf = (r: Requirement): Check | null => CHECKS[r.id].once?.() ?? null;
for (const id of Object.keys(CHECKS)) if (!REQUIREMENTS.some(r => r.id === id)) throw new Error(`the report checks ${id}, which is not in REQUIREMENTS`);

const best = ranked[0];
const fixAt = (level: number) => best.result.levels.find(l => l.level === level)!;
const fixOf = (r: Requirement) => CHECKS[r.id]?.fix;
const todayOf = (r: Requirement): Check[] => { const once = onceOf(r); return once ? [once] : today.map(t => CHECKS[r.id].today!(t)); };
const todayChecks = REQUIREMENTS.flatMap(todayOf);
const fixChecks = REQUIREMENTS.flatMap(r => { const f = fixOf(r); return f ? LEVELS.map(l => f(fixAt(l))) : []; });
const held = (cs: Check[]) => cs.filter(c => c.ok === true).length;
const unsure = (cs: Check[]) => cs.filter(c => c.ok === null).length;

const STATE = { true: ['ok', '✓', 'holds'], false: ['bad', '✗', 'fails'], null: ['unk', '?', 'inconclusive'] } as const;
const statusCell = (c: Check, span = 1) => {
  const [cls, mark, label] = STATE[String(c.ok) as keyof typeof STATE];
  return `<td class="st ${cls}"${span > 1 ? ` colspan="${span}"` : ''}><span class="mark" aria-label="${label}">${mark}</span> <span class="note-s">${esc(c.note)}</span></td>`;
};
const alsoCheckedBy = (r: Requirement) => `<ul class="where">${r.alsoCheckedBy.map(t => `<li>${esc(t)}</li>`).join('')}</ul>`;
const GROUPS = [...new Set(REQUIREMENTS.map(r => r.group))];
const reqRows = GROUPS.map(g => `<tr class="group"><th colspan="${2 + 2 * LEVELS.length}" scope="colgroup">${esc(g)}</th></tr>${
  REQUIREMENTS.filter(r => r.group === g).map(r => {
    const once = onceOf(r), fix = fixOf(r);
    const cells = (once ? statusCell(once, LEVELS.length) : today.map(t => statusCell(CHECKS[r.id].today!(t))).join(''))
      + (fix ? LEVELS.map(l => statusCell(fix(fixAt(l)))).join('') : `<td colspan="${LEVELS.length}" class="elsewhere">not re-measured under fixes</td>`);
    return `<tr><th scope="row"><b>${esc(r.name)}</b><small>${esc(r.rule)}</small></th>${cells}<td>${alsoCheckedBy(r)}</td></tr>`;
  }).join('')}`).join('');

const reqTable = `<div class="scroll"><table class="req">
  <thead>
    <tr><th rowspan="2" scope="col">requirement</th><th colspan="${LEVELS.length}" scope="colgroup" class="side-h">today · PV ${BODY_PV}</th><th colspan="${LEVELS.length}" scope="colgroup" class="side-h">under fix 1 · PV ${LEVELS.map(l => fixAt(l).vanilla.pv ?? fixAt(l).pv).join(' / ')}</th><th rowspan="2" scope="col">also checked by</th></tr>
    <tr>${[...LEVELS, ...LEVELS].map(l => `<th scope="col" class="lv">L${l}</th>`).join('')}</tr>
  </thead>
  <tbody>${reqRows}</tbody>
</table></div>`;

// --- the recommendation ---
const stillFailing = LEVELS.flatMap(level => [
  ...(fixAt(level).vanilla.pv === null ? [`L${level}: no PV meets every floor (${fixAt(level).vanilla.collides.join('; ')})`] : []),
  ...REQUIREMENTS.filter(r => fixOf(r)).map(r => ({ r, c: fixOf(r)!(fixAt(level)) })).filter(x => x.c.ok === false).map(x => `L${level}: ${x.r.name.toLowerCase()} (${x.c.note})`),
]);
const nobody: string[] = [];
for (const level of LEVELS) {
  const at = (r: FixResult) => r.levels.find(l => l.level === level)!;
  for (const edge of ['Power > Protect', 'Protect > Aggro', 'Aggro > Power']) {
    if (results.every(r => !at(r).triangle.find(e => e.edge === edge)!.holds)) nobody.push(`L${level}: ${edge}`);
  }
  if (results.every(r => at(r).vanilla.pv === null)) nobody.push(`L${level}: no PV meets every floor`);
  if (results.every(r => !burstHolds(at(r).real))) nobody.push(`L${level}: burst out of bounds`);
}
const recommendation = `
  <p class="lede"><b>Fix 1: ${esc(best.result.fix.label)}.</b> Derived hero PV ${LEVELS.map(l => `L${l} <b class="num">${fixAt(l).vanilla.pv ?? '—'}</b>`).join(', ')}.</p>
  <p>Costs: ${best.score.costs.length ? best.score.costs.map(esc).join('; ') : 'none beyond today\'s rules'}.</p>
  ${best.score.conflicts.length ? `<p class="note">It goes against "without focus or buffs, defenses should on average completely block an attack" (2026-11-02): ${best.score.conflicts.map(esc).join('; ')}.</p>` : ''}
  ${best.result.focusOnRealKits ? '' : `<p class="note">Its Focus part is measured on the vanilla twins only (a real Focus card's power is in its effects, which can't be scaled mechanically); the real-kit columns show the rest of the fix.</p>`}
  <p>Still failing under it: ${stillFailing.length ? stillFailing.map(esc).join('; ') : 'nothing'}.</p>
  ${nobody.length ? `<p><b>No candidate fixes:</b> ${nobody.map(esc).join('; ')}: they need a lever no candidate tries — cards, or rules the candidates leave alone (Envoltat, a defense covering one body).</p>` : ''}
  ${ranked[1] ? `<p class="muted">Runner-up: ${esc(ranked[1].result.fix.label)} (${checksMet(ranked[1].score)} of ${LEVELS.length * 5} fix checks against ${checksMet(best.score)}).</p>` : ''}`;

const facts = [
  `Guards erase blows: only ${today.map(t => pc(t.real.sources.guarded)).join(' / ')} of the damage goes through a guard; the rest is bodies caught open (${today.map(t => pc(t.real.sources.open)).join(' / ')}), area (${today.map(t => pc(t.real.sources.area)).join(' / ')}), Focus (${today.map(t => pc(t.real.sources.focus)).join(' / ')}) and statuses (${today.map(t => pc(t.real.sources.roundEnd)).join(' / ')}).`,
  `So the game moves ${today.map(t => t.real.pvPerRound.toFixed(1)).join(' / ')} PV a round, and fights last ${today.map(t => lengthNote(t.real)).join(' / ')} rounds (median·9 in 10) against ${MAX_MEDIAN_ROUNDS}·${MAX_P90_ROUNDS}.`,
  `At L${today[today.length - 1].level} it turns on burst: ${pc(today[today.length - 1].real.sources.area)} of the damage is area and ${pc(today[today.length - 1].real.roundOneKOs)} of the heroes fall in round 1.`,
];

// --- folded detail ---
const culprits = gate.styles.flatMap(s => s.culprits.map(c => `L${s.level} ${c.edge}: ${c.cards.length ? c.cards.map(k => `${k.name} (${k.shift >= 0 ? '+' : ''}${k.shift.toFixed(0)} pts without it)`).join(', ') : 'no single card'}`));
const analyzerLines = kitReports.map(r => `${kitId(r)}: ${r.strength.inconclusive ? 'band inconclusive' : `${signed(r.strength.band?.delta ?? 0)}±${Math.round(100 * (r.strength.band?.stderr ?? 0))} pts against the neutral kit`}`);
// The gate's own checks of the machinery (the AI's model, its blind spots) are not the set's.
const setFailures = gate.failures.filter(f => !/ model$| blind$/.test(f.key));
const edgeAutopsies = gate.styles.flatMap(s => s.autopsies.map(a => `<p class="muted">Why ${esc(a.x)} &gt; ${esc(a.y)} fails at L${s.level}:</p><ul class="facts">${autopsyLines(a).map(l => `<li>${esc(l)}</li>`).join('')}</ul>`)).join('');
const autopsy = `<ul class="facts">${setFailures.map(f => `<li>${esc(f.text)}</li>`).join('')}</ul>${edgeAutopsies}<p class="muted">The kit analyzer, every main kit against creatures:</p><ul class="facts">${analyzerLines.map(l => `<li>${esc(l)}</li>`).join('')}</ul>${
  culprits.length ? `<p class="muted">What holds each broken edge up, the loser's cards whose removal lifts the winner most:</p><ul class="facts">${culprits.map(c => `<li>${esc(c)}</li>`).join('')}</ul>` : ''}`;

const todaySection = `<div class="pair">${today.map(({ level, real }) => `
  <div class="side"><h4>Level ${level} ${verdict(real.ends)}</h4><p class="pace">rounds: median · 9 in 10 — ${pace(real)}</p>${bar(real)}
    <ul>${explain(real).map(t => `<li>${esc(t)}</li>`).join('')}</ul></div>`).join('')}</div>`;

const arithmeticRows = arithmetic.map(r => `<tr><td>L${r.level}</td><td class="num">${ATTACK_LADDER[r.level]}</td><td class="num">${r.landsBare.toFixed(1)}</td><td class="num">${r.landsOnGuard.toFixed(1)}</td><td class="num">${r.pureRounds.toFixed(1)}</td><td class="num">${r.pvPure.toFixed(0)}</td></tr>`).join('');

const cell = (r: FixResult, level: number) => {
  const l = r.levels.find(x => x.level === level)!;
  const floor = Math.max(l.vanilla.roundOnePV, r.fix.burst === 'plain' ? l.vanilla.plainBlowPV : l.vanilla.bestBlowPV);
  const win = l.vanilla.lengthPV === null ? 'none' : `${floor}–${l.vanilla.lengthPV}`;
  const triangle = l.triangle.every(e => e.holds);
  return `<td><div class="cellgrid">
    <span>PV <b class="num">${l.vanilla.pv ?? '—'}</b> <small>(window ${win}; real kits at ${l.pv})</small></span>
    <span>${verdict(l.real.ends)} length <small class="num">${lengthNote(l.real)}</small></span>
    <span>${verdict(triangle)} triangle${triangle ? '' : ` <small>${l.triangle.filter(e => !e.holds).map(e => `${e.edge} ${pc(e.winrate)}`).join(', ')}</small>`}</span>
    <span>${verdict(l.dumb.every(d => d.loses))} dumb play <small class="num">${l.dumb.map(d => `${d.style} ${pc(d.score)}`).join(' · ')}</small></span>
    <span>${verdict(burstHolds(l.real))} burst <small>one-shots ${pc(l.real.oneShots)} · round-1 KOs ${pc(l.real.roundOneKOs)}</small></span>
  </div></td>`;
};
const fixRows = ranked.map(({ result: r, score: s }, i) => `<tr class="${i === 0 ? 'top' : ''}">
  <th scope="row"><span class="rank">${i + 1}</span> ${esc(r.fix.label)} <small class="num">${checksMet(s)}/${LEVELS.length * 5}</small></th>
  ${LEVELS.map(l => cell(r, l)).join('')}
  <td><ul class="costs">${s.conflicts.map(c => `<li class="against">${esc(c)}</li>`).join('')}${s.costs.map(c => `<li>${esc(c)}</li>`).join('')}${s.conflicts.length + s.costs.length ? '' : '<li>none</li>'}</ul></td></tr>`).join('');

const html = `<title>Pim Pam Pum Dynamics</title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;600&family=IBM+Plex+Sans+Condensed:wght@500;700&family=IBM+Plex+Sans:wght@400;600&display=swap">
<style>
/* A lab report: the requirements table is the page; everything else is folded. */
:root {
  --bg: #f5f7f5; --surface: #ffffff; --fg: #1c2420; --muted: #5d6b64; --line: #d7ddd9;
  --accent: #2f6b4f; --ok: #2f7d4f; --bad: #b4413c; --warn: #a86b12; --ok-bg: #e6f2ea; --bad-bg: #f8e7e5; --unk-bg: #f6eedc;
  --s-open: #2f6b4f; --s-guarded: #8fb3a0; --s-area: #4f7fa8; --s-focus: #a86b12; --s-counter: #b4413c; --s-defense: #7a5ea8; --s-roundEnd: #8a8f8c;
  --display: "IBM Plex Sans Condensed", "Arial Narrow", system-ui, sans-serif;
  --body: "IBM Plex Sans", system-ui, -apple-system, "Segoe UI", sans-serif;
  --mono: "IBM Plex Mono", ui-monospace, "SFMono-Regular", Menlo, monospace;
}
@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) {
  --bg: #121614; --surface: #1a201d; --fg: #e3e9e5; --muted: #9aa8a0; --line: #2c3530;
  --accent: #6fbf94; --ok: #6fbf94; --bad: #e07a73; --warn: #d9a44a; --ok-bg: #1b2d23; --bad-bg: #352120; --unk-bg: #33291a;
  --s-open: #6fbf94; --s-guarded: #3f6b55; --s-area: #7fa9d1; --s-focus: #d9a44a; --s-counter: #e07a73; --s-defense: #a98ad6; --s-roundEnd: #6c726e; color-scheme: dark } }
:root[data-theme="dark"] {
  --bg: #121614; --surface: #1a201d; --fg: #e3e9e5; --muted: #9aa8a0; --line: #2c3530;
  --accent: #6fbf94; --ok: #6fbf94; --bad: #e07a73; --warn: #d9a44a; --ok-bg: #1b2d23; --bad-bg: #352120; --unk-bg: #33291a;
  --s-open: #6fbf94; --s-guarded: #3f6b55; --s-area: #7fa9d1; --s-focus: #d9a44a; --s-counter: #e07a73; --s-defense: #a98ad6; --s-roundEnd: #6c726e; color-scheme: dark }
body { background: var(--bg); color: var(--fg); font: 15px/1.55 var(--body); }
.wrap { max-width: 1200px; margin: 0 auto; padding-inline: 16px; padding-block: 32px 64px; display: grid; gap: 32px; }
.prose { max-width: 70ch; }
h1, h2, h3, h4 { font-family: var(--display); line-height: 1.15; text-wrap: balance; margin: 0; }
h1 { font-size: 2rem; font-weight: 700; }
h2 { font-size: 1.35rem; font-weight: 700; }
h3 { font-size: 1.1rem; font-weight: 700; color: var(--accent); }
h4 { font-size: 1rem; font-weight: 500; display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
section { display: grid; gap: 14px; }
p { margin: 0; }
.lede { font-size: 1.08rem; }
.muted, small { color: var(--muted); }
.eyebrow { font: 600 0.75rem/1 var(--mono); letter-spacing: 0.08em; text-transform: uppercase; color: var(--muted); }
.num { font-family: var(--mono); font-variant-numeric: tabular-nums; }
.tally { display: flex; flex-wrap: wrap; gap: 8px 28px; }
.tally div { display: grid; gap: 2px; }
.tally b { font: 600 1.5rem/1 var(--mono); font-variant-numeric: tabular-nums; }
.scroll { overflow-x: auto; border: 1px solid var(--line); border-radius: 6px; background: var(--surface); }
table { border-collapse: collapse; width: 100%; font-size: 0.86rem; }
th, td { text-align: left; vertical-align: top; padding: 8px 10px; border-bottom: 1px solid var(--line); }
thead th { font: 600 0.72rem/1.2 var(--mono); letter-spacing: 0.06em; text-transform: uppercase; color: var(--muted); vertical-align: bottom; }
thead th.side-h { text-align: center; border-bottom: 2px solid var(--line); }
thead th.lv { text-align: center; }
.req tbody th { min-width: 210px; max-width: 280px; font-weight: 400; }
.req tbody th b { display: block; font-weight: 600; }
.req tbody th small { display: block; font-size: 0.8rem; line-height: 1.35; }
.req tr.group th { font: 600 0.72rem/1 var(--mono); letter-spacing: 0.08em; text-transform: uppercase; color: var(--accent); padding-top: 16px; background: var(--bg); }
.st { min-width: 92px; font-size: 0.8rem; line-height: 1.3; }
.st.ok { background: var(--ok-bg); } .st.bad { background: var(--bad-bg); } .st.unk { background: var(--unk-bg); }
.st .mark { font-weight: 700; }
.st.ok .mark { color: var(--ok); } .st.bad .mark { color: var(--bad); } .st.unk .mark { color: var(--warn); }
.note-s { font-family: var(--mono); font-variant-numeric: tabular-nums; }
td.elsewhere { color: var(--muted); font-style: italic; text-align: center; vertical-align: middle; }
.where { margin: 0; padding-left: 14px; display: grid; gap: 2px; min-width: 200px; font-size: 0.8rem; color: var(--muted); }
.where .here { color: var(--fg); }
.recommend { background: var(--surface); border: 1px solid var(--accent); border-radius: 6px; padding: 16px 18px; display: grid; gap: 8px; max-width: 90ch; }
.note { color: var(--warn); }
.facts { margin: 0; padding-left: 20px; display: grid; gap: 6px; max-width: 90ch; }
details { border-top: 1px solid var(--line); padding-top: 12px; }
details > summary { cursor: pointer; font: 700 1.1rem/1.2 var(--display); }
details[open] > summary { margin-bottom: 14px; }
details > div { display: grid; gap: 14px; }
.level { display: grid; gap: 10px; }
.pair { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 14px; }
.side { min-width: 0; background: var(--surface); border: 1px solid var(--line); border-radius: 6px; padding: 12px 14px; display: grid; gap: 8px; align-content: start; }
.side ul { margin: 0; padding-left: 18px; display: grid; gap: 4px; }
.pace { font-size: 0.88rem; color: var(--muted); }
.bar { display: flex; height: 12px; border-radius: 3px; overflow: hidden; background: var(--line); }
.seg { height: 100%; }
.legend { display: flex; flex-wrap: wrap; gap: 6px 16px; font-size: 0.82rem; color: var(--muted); }
.legend span { display: inline-flex; align-items: center; gap: 6px; }
.sw { width: 12px; height: 12px; border-radius: 2px; display: inline-block; }
${SOURCES.map(([k]) => `.seg-${k} { background: var(--s-${k}); }`).join('\n')}
.chip { font: 600 0.68rem/1 var(--mono); letter-spacing: 0.04em; text-transform: uppercase; padding: 3px 6px; border-radius: 3px; border: 1px solid currentColor; }
.chip.ok { color: var(--ok); } .chip.bad { color: var(--bad); }
tr.top { background: color-mix(in srgb, var(--accent) 8%, transparent); }
.rank { font-family: var(--mono); color: var(--accent); }
.cellgrid { display: grid; gap: 4px; min-width: 190px; }
.costs { margin: 0; padding-left: 16px; display: grid; gap: 4px; min-width: 200px; }
.costs .against { color: var(--bad); }
</style>
<div class="wrap">
  <header class="prose" style="display:grid;gap:10px">
    <span class="eyebrow">${esc(SET.gameSet.id)} · checkpoints L${LEVELS.join(' / L')} · ${fights} fights a cell</span>
    <h1>The requirements, and where the set stands</h1>
    <p>The ${REQUIREMENTS.length} requirements a set is held to, measured on today's game (at each checkpoint, or once for the whole set) and, where the structure can change them, under the best candidate fix.</p>
    <div class="tally">
      <div><b>${held(todayChecks)}/${todayChecks.length}</b><small>checks hold today${unsure(todayChecks) ? ` (${unsure(todayChecks)} inconclusive)` : ''}</small></div>
      <div><b>${held(fixChecks)}/${fixChecks.length}</b><small>under fix 1 (the ${REQUIREMENTS.filter(r => !fixOf(r)).length} the structure leaves alone aren't re-measured there)</small></div>
    </div>
  </header>

  <section>
    ${reqTable}
    <p class="muted" style="font-size:0.82rem">Rounds read median·9 in 10. Today: random 2v2 of the main kits, the production AI, ${BODY_PV} PV; the triangle, dumb play, per-kit length and field score are the kit gate's own cells, and so are choosing and card use, the cards priced in the same hero fights; the band is the kit analyzer's, every main kit against creatures, one verdict for the set; the ladder reads the cards. Under the fix: hero PV derived on the vanilla twins, then the real kits played at it.</p>
  </section>

  <section class="recommend">
    <span class="eyebrow">Recommendation</span>
    ${recommendation}
  </section>

  <section>
    <h2>Why it plays this way</h2>
    <ul class="facts">${facts.map(f => `<li>${esc(f)}</li>`).join('')}</ul>
  </section>

  <details>
    <summary>Why today's checks fail</summary>
    <div>${autopsy}</div>
  </details>

  <details>
    <summary>How fights play, per level</summary>
    <div>
      <p class="prose muted">Random 2v2 of the main kits at today's PV. The bar splits the PV lost by where it came from.</p>
      ${legend}
      ${todaySection}
    </div>
  </details>

  <details>
    <summary>The arithmetic</summary>
    <div>
      <p class="prose">A ladder blow into its own level's defense takes almost nothing; the damage comes from bodies caught without a guard. Even if nobody ever defended, a side of two ${BODY_PV}-PV heroes falls in the rounds below: the floor no card tuning can beat.</p>
      <div class="scroll"><table>
        <thead><tr><th>level</th><th>ladder blow</th><th>lands on an open body</th><th>through its level's guard</th><th>rounds if nobody defends</th><th>PV for ${MAX_P90_ROUNDS} rounds then</th></tr></thead>
        <tbody>${arithmeticRows}</tbody>
      </table></div>
    </div>
  </details>

  <details>
    <summary>Every candidate fix, measured</summary>
    <div>
      <p class="prose muted">Each fix: hero PV derived on the vanilla twins at every checkpoint, then the real kits played under it (chip damage and shifted defenses applied in the measurement only; no card was changed). Ranked by checks met (a PV window, fights ending, burst, the triangle, dumb play; five a checkpoint), then fewest costs, then the widest PV windows. Red costs go against "without focus or buffs, defenses should on average completely block an attack" (2026-11-02).</p>
      <div class="scroll"><table>
        <thead><tr><th>fix</th>${LEVELS.map(l => `<th>level ${l}</th>`).join('')}<th>what it costs</th></tr></thead>
        <tbody>${fixRows}</tbody>
      </table></div>
    </div>
  </details>
</div>`;

fs.writeFileSync(OUT, html);
log(`wrote ${OUT}`);
