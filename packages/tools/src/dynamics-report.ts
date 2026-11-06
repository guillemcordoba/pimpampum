/**
 * THE SET'S HEALTH, ON ONE PAGE (the user, 2026-11-04 to 06: brief, organised
 * around the requirements, about the set alone, the one tool to iterate a kit
 * with, and readable at a glance). One command:
 *  1. how many of the requirements hold (playtest `REQUIREMENTS`), at levels
 *     3, 6 and 10 or once for the set;
 *  2. the cards that block them: each failing kit cell re-played without each
 *     of the kit's cards (the gate's blame), the cards that fell fresh heroes,
 *     the cards never right — loudest when one card alone flips a requirement;
 *  3. the table; folded: why the set plays as it does, the gate's failing
 *     cells, the arithmetic, and (`--fixes`) the candidate structures.
 *
 *   pnpm --filter @pimpampum/tools exec tsx src/dynamics-report.ts --set elements --out report.html
 *   … --kit earthbender     one kit's health (the set-level rows stay)
 *   … --fixes               also measure the candidate structures (slow)
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { flag, games, isolated, kitsDynamics, lanesNow, useSet, type CardTally } from '@pimpampum/bench';
import {
  burstHolds, CANDIDATE_FIXES, census, checksMet, explain, feasibility, FIX_BUDGET, GATE_BUDGET,
  MAX_BEST_BLOW_KOS, MAX_MEDIAN_ROUNDS, MAX_P90_ROUNDS, MAX_ROUND_ONE_KOS, measureGate, prepareGate, rankFixes, REQUIREMENTS,
  summarise, type DynamicsSummary, type FixLevel, type FixResult, type GateBudget, type GateScope, type LadderRung, type Requirement,
} from '@pimpampum/playtest';
import type { ActionDefinition } from '@pimpampum/engine';
import { chosenSet } from './sets.js';

const SET = await chosenSet();
useSet(SET.gameSet);
const { ATTACK_LADDER, DEFENSE_LADDER, BODY_PV } = SET.root;
const LEVELS = (flag('--levels') ?? '3,6,10').split(',').map(Number);
const KIT = flag('--kit');
const FIXES = process.argv.includes('--fixes');
const OUT = flag('--out') ?? path.join(os.tmpdir(), 'game-dynamics.html');
const MAIN_KITS = SET.gameSet.calibration.mainKits;
if (KIT && !MAIN_KITS.includes(KIT)) throw new Error(`--kit ${KIT}: not a main kit (${MAIN_KITS.join(', ')})`);
const KITS = KIT ? [KIT] : MAIN_KITS;
const fights = games(120);
const budget = { vanillaFights: games(FIX_BUDGET.vanillaFights), realFights: games(FIX_BUDGET.realFights), duelGames: games(FIX_BUDGET.duelGames) };
const gateBudget: GateBudget = { kitFights: games(GATE_BUDGET.kitFights), duelGames: games(GATE_BUDGET.duelGames), cardFights: games(GATE_BUDGET.cardFights), modelFights: games(GATE_BUDGET.modelFights!) };
const rung = (l: number): LadderRung => ({ attack: ATTACK_LADDER[l], defense: DEFENSE_LADDER[l] });
const log = (s: string) => process.stderr.write(`${s}\n`);

// Every card of the main kits by id, with the kit that holds it.
const CARDS = new Map<string, { def: ActionDefinition; kit: string }>();
for (const kit of MAIN_KITS) for (const def of SET.gameSet.kit(kit)?.actions ?? []) if (def.skillId === kit) CARDS.set(def.id, { def, kit });

// --- 1. today ------------------------------------------------------------------
log('today\'s fights…');
const realRuns = LEVELS.map(level => ({ level, d: kitsDynamics(level, fights) }));
const today = realRuns.map(({ level, d }) => ({ level, real: summarise(d), cards: d.cards }));

// Every kit's fight length and field score, re-played without each card where a
// cell fails; every card's use; what choosing is worth; dumb play (set-level).
log('the gate\'s cells…');
const gateScope: GateScope = { levels: LEVELS, triangle: false, blame: true, ...(KIT ? { kits: [KIT], styles: true } : {}) };
await prepareGate({ set: SET.ref, budget: gateBudget }, gateScope);
const gate = measureGate(gateScope, gateBudget);

const arithmetic = feasibility({ ladder: Object.fromEntries(LEVELS.map(l => [l, rung(l)])), pv: BODY_PV, armour: 1, teamSize: 2, mix: { attack: 0.4, defense: 0.3 } }, LEVELS, MAX_P90_ROUNDS);

// --- 2. the candidate structures, only when asked --------------------------------
const results: FixResult[] = [];
if (FIXES) {
  const cards = census(realRuns.map(r => r.d.cards));
  const ladder = Object.fromEntries(Object.keys(ATTACK_LADDER).map(Number).map(l => [l, { attack: ATTACK_LADDER[l].toString(), defense: DEFENSE_LADDER[l].toString() }]));
  const PLAYTEST = fileURLToPath(import.meta.resolve('@pimpampum/playtest'));
  let next = 0;
  await Promise.all(Array.from({ length: Math.max(1, Math.min(lanesNow(), CANDIDATE_FIXES.length)) }, async () => {
    for (let i = next++; i < CANDIDATE_FIXES.length; i = next++) {
      results.push(await isolated<FixResult>(PLAYTEST, 'evaluateFix', [SET.ref, CANDIDATE_FIXES[i], ladder, LEVELS, budget, cards]));
      log(`fix ${results.length}/${CANDIDATE_FIXES.length}: ${CANDIDATE_FIXES[i].id}`);
    }
  }));
}
const ranked = rankFixes(results);

// --- 3. the requirements, checked -----------------------------------------------
const pc = (x: number) => `${Math.round(100 * x)}%`;
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const lengthNote = (s: DynamicsSummary) => `${s.median}·${s.p90}${s.stallRate ? ` · ${pc(s.stallRate)} stall` : ''}`;
/** `ok` null: measured but inconclusive. */
type Check = { ok: boolean | null; note: string };
type Today = (typeof today)[number];
const styleAt = (level: number) => gate.styles.find(c => c.level === level)!;
const kitsAt = (level: number) => gate.kits.filter(c => c.level === level && KITS.includes(c.kit));
const inScope = (id: string) => !KIT || CARDS.get(id)?.kit === KIT;
/** Today, at each checkpoint (`today`) or once (`once`); under a fix where the fix evaluation measures it. */
const CHECKS: Record<string, { today?: (t: Today) => Check; once?: () => Check; fix?: (l: FixLevel) => Check }> = {
  'fights-end': {
    today: t => {
      const cells = kitsAt(t.level), over = cells.filter(k => !k.ok);
      if (KIT) return { ok: !over.length, note: cells.map(k => `${k.medianRounds}·${k.p90Rounds}${k.stallRate ? ` · ${pc(k.stallRate)} stall` : ''}`).join('') };
      return { ok: t.real.ends && !over.length, note: `${lengthNote(t.real)}${over.length ? ` · ${over.length} of ${cells.length} kits over` : ''}` };
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
      return { ok: !bad.length, note: bad.length ? bad.map(k => `${k.kit} ${pc(k.winrate)}`).join(', ') : `${KIT ? '' : `top ${top.kit} `}${pc(top.winrate)}` };
    },
  },
  'card-use': {
    once: () => {
      const mine = gate.cards.filter(c => KITS.includes(c.kit)), dead = mine.filter(c => c.neverRight);
      return { ok: !dead.length, note: dead.length ? `never right: ${dead.map(c => c.name).join(', ')}` : `all ${mine.length} cards` };
    },
  },
  choice: {
    today: t => {
      const at = gate.choices.filter(c => c.level === t.level && KITS.includes(c.kit)), bad = at.filter(c => !c.ok);
      const low = [...at].sort((a, b) => a.mean - b.mean)[0];
      return { ok: !bad.length, note: bad.length ? bad.map(c => `${KIT ? '' : `${c.kit} `}${c.mean.toFixed(1)} PV`).join(', ') : `${KIT ? '' : `lowest ${low.kit} `}${low.mean.toFixed(1)} PV` };
    },
  },
  ladder: {
    once: () => {
      const skills = SET.root.ALL_SKILLS.filter(sk => !KIT || sk.id === KIT);
      const { over, excused } = SET.root.offTheLadder(skills, SET.root.LADDER_RULES);
      return { ok: !over.length, note: over.length ? `${over.length} over: ${over.join(', ')}` : `every card; ${excused.length} above with a reason` };
    },
  },
};
for (const r of REQUIREMENTS) if (!CHECKS[r.id]) throw new Error(`requirement ${r.id}: the report has no check for it`);
for (const id of Object.keys(CHECKS)) if (!REQUIREMENTS.some(r => r.id === id)) throw new Error(`the report checks ${id}, which is not in REQUIREMENTS`);
const onceOf = (r: Requirement): Check | null => CHECKS[r.id].once?.() ?? null;
const todayOf = (r: Requirement): Check[] => { const once = onceOf(r); return once ? [once] : today.map(t => CHECKS[r.id].today!(t)); };
const holding = REQUIREMENTS.filter(r => todayOf(r).every(c => c.ok === true));

// --- 4. what blocks them: the cards --------------------------------------------
/** A card and every requirement it blocks; `alone`: taking it out (or fixing
 *  it) makes a requirement pass by itself. */
interface Blocker { id: string; reasons: string[]; alone: boolean }
const blockers = new Map<string, Blocker>();
const blame = (id: string, reason: string, alone = false) => {
  if (!inScope(id) || !CARDS.has(id)) return;
  const b = blockers.get(id) ?? { id, reasons: [], alone: false };
  b.reasons.push(reason);
  b.alone ||= alone;
  blockers.set(id, b);
};
const roundsOf = (c: { medianRounds: number; p90Rounds: number; stallRate: number }) => `${c.medianRounds}·${c.p90Rounds}${c.stallRate ? `, ${pc(c.stallRate)} stalls` : ''}`;
/** How far a card's absence must move a cell before it counts: fights two
 *  rounds shorter for 9 in 10, or 2 points fewer stalls; 5 points off the
 *  kit's field score. Below that, a flip is the cell's own noise at its bar. */
const ROUNDS_MOVED = 2, STALLS_MOVED = 0.02, FIELD_MOVED = 0.05;
for (const cell of gate.kits.filter(c => KITS.includes(c.kit) && LEVELS.includes(c.level))) {
  for (const b of cell.blame) {
    const shorter = cell.p90Rounds - b.p90Rounds >= ROUNDS_MOVED || cell.stallRate - b.stallRate >= STALLS_MOVED;
    const weaker = cell.winrate - b.winrate >= FIELD_MOVED;
    if (!cell.ok && b.lengthOk && shorter) blame(b.card, `fights end in time at L${cell.level} without it (rounds ${roundsOf(b)}; with it ${roundsOf(cell)})`, true);
    else if (!cell.ok && shorter) blame(b.card, `fights shorten without it at L${cell.level}: rounds ${roundsOf(b)}, with it ${roundsOf(cell)}`);
    if (cell.dominates && !b.dominates && weaker) blame(b.card, `${cell.kit} stops dominating at L${cell.level} without it (${pc(b.winrate)} against the field; with it ${pc(cell.winrate)})`, true);
    else if (cell.dominates && weaker) blame(b.card, `carries ${cell.kit}'s lead at L${cell.level}: ${pc(b.winrate)} against the field without it, ${pc(cell.winrate)} with it`);
  }
}
/** Plays below which a card's KO rate is not judged. */
const MIN_PLAYS = 30;
for (const t of today) {
  const tallies = Object.entries(t.cards) as [string, CardTally][];
  for (const [id, c] of tallies) {
    if (c.plays >= MIN_PLAYS && c.felledFromFull / c.plays > MAX_BEST_BLOW_KOS) blame(id, `fells a fresh hero in one play on ${pc(c.felledFromFull / c.plays)} of its plays at L${t.level}`);
  }
  if (t.real.roundOneKOs > MAX_ROUND_ONE_KOS) {
    const falls = tallies.reduce((n, [, c]) => n + c.fellInRoundOne, 0);
    for (const [id, c] of tallies) if (falls && c.fellInRoundOne / falls >= 0.2) blame(id, `${pc(c.fellInRoundOne / falls)} of the heroes who fall in round 1 at L${t.level}`);
  }
}
for (const c of gate.cards.filter(x => x.neverRight)) blame(c.card, `never the right play (L${c.levels.map(l => l.level).join(', L')})`, true);
for (const line of SET.root.offTheLadder(SET.root.ALL_SKILLS, SET.root.LADDER_RULES).over) blame(line.split(' ')[0], `above its rung on the dice ladder: ${line.slice(line.indexOf('(') + 1, -1)}`, true);
const ranking = [...blockers.values()].sort((a, b) => Number(b.alone) - Number(a.alone) || b.reasons.length - a.reasons.length);
// What no single card answers: kit- and set-level misses.
const unexplained: string[] = [
  ...gate.choices.filter(c => KITS.includes(c.kit) && !c.ok).map(c => `${c.kit} L${c.level}: choosing barely matters — a random card costs ${c.mean.toFixed(1)} PV a decision against the best (needs 1); its hand plays alike`),
  ...gate.kits.filter(c => KITS.includes(c.kit) && LEVELS.includes(c.level) && (!c.ok || c.dominates) && !c.blame.some(b => c.p90Rounds - b.p90Rounds >= ROUNDS_MOVED || c.stallRate - b.stallRate >= STALLS_MOVED || c.winrate - b.winrate >= FIELD_MOVED))
    .map(c => `${c.kit} L${c.level}: ${!c.ok ? `fights run ${roundsOf(c)}` : `dominates at ${pc(c.winrate)}`}, and no single card changes it much`),
  ...gate.styles.flatMap(s => s.dumb.filter(d => !d.ok).map(d => `L${s.level}: ${d.style} scores ${pc(d.score)} against the AI`)),
];
const cardLine = (b: Blocker) => {
  const { def, kit } = CARDS.get(b.id)!;
  const kind = def.actionType === 'Atac' ? 'attack' : def.actionType === 'Defensa' ? 'defense' : 'Focus';
  const dice = def.dice ? `${def.dice}${def.rollBonus ? `+${def.rollBonus}` : ''}` : 'no dice';
  return `<li class="${b.alone ? 'alone' : ''}"><div class="card-h">${b.alone ? '<span class="flag">blocks alone</span>' : ''}<b>${esc(def.name)}</b> <small>${esc(kit)} · level ${def.unlockLevel} · ${kind}${def.fast ? ' · fast' : ''} · ${esc(dice)}</small></div>
    <div class="card-t">${esc(def.description)}</div><ul>${b.reasons.map(r => `<li>${esc(r)}</li>`).join('')}</ul></li>`;
};

// --- 5. the candidate structures (only with --fixes) ----------------------------
const best = ranked[0];
const fixAt = (level: number) => best!.result.levels.find(l => l.level === level)!;
const fixOf = (r: Requirement) => (FIXES ? CHECKS[r.id]?.fix : undefined);
const STATE = { true: ['ok', '✓', 'holds'], false: ['bad', '✗', 'fails'], null: ['unk', '?', 'inconclusive'] } as const;
const statusCell = (c: Check, span = 1) => {
  const [cls, mark, label] = STATE[String(c.ok) as keyof typeof STATE];
  return `<td class="st ${cls}"${span > 1 ? ` colspan="${span}"` : ''}><span class="mark" aria-label="${label}">${mark}</span> <span class="note-s">${esc(c.note)}</span></td>`;
};
const COLS = LEVELS.length * (FIXES ? 2 : 1);
const GROUPS = [...new Set(REQUIREMENTS.map(r => r.group))];
const reqRows = GROUPS.map(g => `<tr class="group"><th colspan="${1 + COLS}" scope="colgroup">${esc(g)}</th></tr>${
  REQUIREMENTS.filter(r => r.group === g).map(r => {
    const once = onceOf(r), fix = fixOf(r);
    const cells = (once ? statusCell(once, LEVELS.length) : today.map(t => statusCell(CHECKS[r.id].today!(t))).join(''))
      + (!FIXES ? '' : fix ? LEVELS.map(l => statusCell(fix(fixAt(l)))).join('') : `<td colspan="${LEVELS.length}" class="elsewhere">not re-measured under fixes</td>`);
    return `<tr><th scope="row"><b>${esc(r.name)}</b><small>${esc(r.rule)}</small></th>${cells}</tr>`;
  }).join('')}`).join('');
const reqTable = `<div class="scroll"><table class="req">
  <thead>
    <tr><th rowspan="2" scope="col">requirement</th><th colspan="${LEVELS.length}" scope="colgroup" class="side-h">today · PV ${BODY_PV}</th>${FIXES ? `<th colspan="${LEVELS.length}" scope="colgroup" class="side-h">under fix 1 · PV ${LEVELS.map(l => fixAt(l).vanilla.pv ?? fixAt(l).pv).join(' / ')}</th>` : ''}</tr>
    <tr>${(FIXES ? [...LEVELS, ...LEVELS] : LEVELS).map(l => `<th scope="col" class="lv">L${l}</th>`).join('')}</tr>
  </thead>
  <tbody>${reqRows}</tbody>
</table></div>`;

const recommendation = !FIXES ? '' : `
  <section class="recommend">
    <span class="eyebrow">Best candidate structure</span>
    <p class="lede"><b>${esc(best.result.fix.label)}.</b> Derived hero PV ${LEVELS.map(l => `L${l} <b class="num">${fixAt(l).vanilla.pv ?? '—'}</b>`).join(', ')}.</p>
    <p>Costs: ${[...best.score.conflicts, ...best.score.costs].map(esc).join('; ') || 'none beyond today\'s rules'}.</p>
  </section>`;

const facts = KIT ? [] : [
  `Guards erase blows: only ${today.map(t => pc(t.real.sources.guarded)).join(' / ')} of the damage goes through a guard; the rest is bodies caught open (${today.map(t => pc(t.real.sources.open)).join(' / ')}), area (${today.map(t => pc(t.real.sources.area)).join(' / ')}), Focus (${today.map(t => pc(t.real.sources.focus)).join(' / ')}) and statuses (${today.map(t => pc(t.real.sources.roundEnd)).join(' / ')}).`,
  `So the game moves ${today.map(t => t.real.pvPerRound.toFixed(1)).join(' / ')} PV a round, and fights last ${today.map(t => lengthNote(t.real)).join(' / ')} rounds (median·9 in 10) against ${MAX_MEDIAN_ROUNDS}·${MAX_P90_ROUNDS}.`,
];

// The gate's own checks of the machinery (the AI's model, its blind spots) are not the set's.
const setFailures = gate.failures.filter(f => !/ model$| blind$/.test(f.key) && (!KIT || f.key.startsWith(`${KIT} `) || / dumb /.test(f.key)));
const SOURCES: [keyof DynamicsSummary['sources'], string][] = [
  ['open', 'open bodies'], ['guarded', 'through guards'], ['area', 'area'], ['focus', 'Focus'], ['counter', 'counters'], ['defense', 'defense payoffs'], ['roundEnd', 'statuses'],
];
const bar = (s: DynamicsSummary) => `<div class="bar" role="img" aria-label="${SOURCES.map(([k, n]) => `${n} ${pc(s.sources[k])}`).join(', ')}">${
  SOURCES.filter(([k]) => s.sources[k] > 0.005).map(([k, n]) => `<span class="seg seg-${k}" style="width:${Math.round(1000 * s.sources[k]) / 10}%" title="${n}: ${pc(s.sources[k])}"></span>`).join('')}</div>`;
const legend = `<div class="legend">${SOURCES.map(([k, n]) => `<span><i class="sw seg-${k}"></i>${n}</span>`).join('')}</div>`;
const verdict = (ok: boolean) => `<span class="chip ${ok ? 'ok' : 'bad'}">${ok ? 'holds' : 'fails'}</span>`;
const todaySection = `<div class="pair">${today.map(({ level, real }) => `
  <div class="side"><h4>Level ${level} ${verdict(real.ends)}</h4><p class="pace">rounds: median · 9 in 10 — ${lengthNote(real)}</p>${bar(real)}
    <ul>${explain(real).map(t => `<li>${esc(t)}</li>`).join('')}</ul></div>`).join('')}</div>`;
const arithmeticRows = arithmetic.map(r => `<tr><td>L${r.level}</td><td class="num">${ATTACK_LADDER[r.level]}</td><td class="num">${r.landsBare.toFixed(1)}</td><td class="num">${r.landsOnGuard.toFixed(1)}</td><td class="num">${r.pureRounds.toFixed(1)}</td><td class="num">${r.pvPure.toFixed(0)}</td></tr>`).join('');
const fixCell = (r: FixResult, level: number) => {
  const l = r.levels.find(x => x.level === level)!;
  return `<td><div class="cellgrid"><span>PV <b class="num">${l.vanilla.pv ?? '—'}</b></span>
    <span>${verdict(l.real.ends)} length <small class="num">${lengthNote(l.real)}</small></span>
    <span>${verdict(l.dumb.every(d => d.loses))} dumb play</span>
    <span>${verdict(burstHolds(l.real))} burst <small>one card ${pc(l.real.oneShots)} · round 1 ${pc(l.real.roundOneKOs)}</small></span></div></td>`;
};
const fixRows = ranked.map(({ result: r, score: s }, i) => `<tr class="${i === 0 ? 'top' : ''}"><th scope="row"><span class="rank">${i + 1}</span> ${esc(r.fix.label)} <small class="num">${checksMet(s)}/${LEVELS.length * 5}</small></th>
  ${LEVELS.map(l => fixCell(r, l)).join('')}<td><ul class="costs">${s.conflicts.map(c => `<li class="against">${esc(c)}</li>`).join('')}${s.costs.map(c => `<li>${esc(c)}</li>`).join('')}</ul></td></tr>`).join('');

const failingNames = REQUIREMENTS.filter(r => !holding.includes(r)).map(r => r.name.toLowerCase());
const alone = ranking.filter(b => b.alone);
const headline = holding.length === REQUIREMENTS.length ? 'Every requirement holds.'
  : `Failing: ${failingNames.join(', ')}. ${alone.length
    ? `${alone.length === 1 ? 'One card blocks a requirement' : `${alone.length} cards each block a requirement`} on ${alone.length === 1 ? 'its' : 'their'} own: ${alone.map(b => CARDS.get(b.id)!.def.name).join(', ')}.`
    : ranking.length ? `No single card flips a requirement; ${ranking.length} cards weigh on them (below).` : 'No card explains the misses: they are structural.'}`;

const html = `<title>Pim Pam Pum Dynamics</title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;600&family=IBM+Plex+Sans+Condensed:wght@500;700&family=IBM+Plex+Sans:wght@400;600&display=swap">
<style>
/* A lab report: the quick read first, the cards that block, then the table; everything else is folded. */
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
.quick { display: grid; gap: 10px; }
.score { font: 700 2.6rem/1 var(--mono); font-variant-numeric: tabular-nums; }
.score small { font: 500 1rem/1 var(--body); color: var(--muted); margin-left: 8px; }
.headline { font-size: 1.1rem; max-width: 80ch; }
.blockers { margin: 0; padding: 0; list-style: none; display: grid; gap: 10px; max-width: 95ch; }
.blockers > li { background: var(--surface); border: 1px solid var(--line); border-radius: 6px; padding: 10px 14px; display: grid; gap: 4px; }
.blockers > li.alone { border: 2px solid var(--bad); }
.blockers ul { margin: 0; padding-left: 18px; display: grid; gap: 2px; font-size: 0.9rem; }
.card-h { display: flex; gap: 8px; align-items: baseline; flex-wrap: wrap; }
.card-t { font-size: 0.88rem; color: var(--muted); font-style: italic; }
.flag { font: 700 0.68rem/1 var(--mono); letter-spacing: 0.06em; text-transform: uppercase; color: var(--surface); background: var(--bad); padding: 3px 6px; border-radius: 3px; }
</style>
<div class="wrap">
  <header class="quick">
    <span class="eyebrow">${esc(SET.gameSet.id)}${KIT ? ` · ${esc(KIT)}` : ''} · levels ${LEVELS.join(' / ')} · ${fights} fights a cell</span>
    <div class="score">${holding.length}/${REQUIREMENTS.length}<small>requirements hold</small></div>
    <p class="headline">${esc(headline)}</p>
  </header>

  ${ranking.length || unexplained.length ? `<section>
    <h2>What blocks them</h2>
    ${ranking.length ? `<ul class="blockers">${ranking.map(cardLine).join('')}</ul>` : ''}
    ${unexplained.length ? `<p class="muted">No single card:</p><ul class="facts">${unexplained.map(u => `<li>${esc(u)}</li>`).join('')}</ul>` : ''}
  </section>` : ''}

  <section>
    ${reqTable}
    <p class="muted" style="font-size:0.82rem">Rounds read median·9 in 10. ${KIT ? `${esc(KIT)}'s fights: it and a random partner against two random kits` : 'Random 2v2 of the main kits'}, the production AI, ${BODY_PV} PV. A blocking card is found by playing the same fights without it; a card that fells fresh heroes or is never the right play blocks by itself.</p>
  </section>
  ${recommendation}

  ${facts.length ? `<section><h2>Why it plays this way</h2><ul class="facts">${facts.map(f => `<li>${esc(f)}</li>`).join('')}</ul></section>` : ''}

  <details>
    <summary>The gate's failing cells</summary>
    <div><ul class="facts">${setFailures.map(f => `<li>${esc(f.text)}</li>`).join('') || '<li>none</li>'}</ul></div>
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
      <p class="prose">A ladder blow into its own level's defense takes almost nothing; the damage comes from bodies caught without a guard. Even if nobody ever defended, a side of two ${BODY_PV}-PV heroes falls in the rounds below.</p>
      <div class="scroll"><table>
        <thead><tr><th>level</th><th>ladder blow</th><th>lands on an open body</th><th>through its level's guard</th><th>rounds if nobody defends</th><th>PV for ${MAX_P90_ROUNDS} rounds then</th></tr></thead>
        <tbody>${arithmeticRows}</tbody>
      </table></div>
    </div>
  </details>
  ${FIXES ? `<details>
    <summary>Every candidate structure, measured</summary>
    <div><div class="scroll"><table>
      <thead><tr><th>structure</th>${LEVELS.map(l => `<th>level ${l}</th>`).join('')}<th>what it costs</th></tr></thead>
      <tbody>${fixRows}</tbody>
    </table></div></div>
  </details>` : ''}
</div>`;

fs.writeFileSync(OUT, html);
log(`wrote ${OUT}`);
log(`${holding.length}/${REQUIREMENTS.length} requirements hold. ${headline}`);
