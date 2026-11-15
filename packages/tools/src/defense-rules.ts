/**
 * WHICH RULE FOR HOW DEFENSES MEET ATTACKS? (GOALS.md, night goal 1; the user,
 * 2026-11-14.) Every candidate (playtest `DEFENSE_RULES`: engine options, off
 * by the rules, and the defenses' rung) on the real kits and on their vanilla
 * twins, per level, at the PV where the median fight ends within 5 rounds:
 * each style's score against the full AI (spam, attacks alone, attacks and
 * Focus, attacks and defenses). A level passes when that PV has no knockout
 * without an answer and the full AI is clearly ahead of spam and of attacks
 * alone.
 *
 * Three readings:
 *  - the SCREEN (the default, minutes): the aim alone, walked to from today's,
 *    the four duels and the turtle;
 *  - `--full` (hours): the whole PV window (floor, aim, ceiling), then the
 *    duels, random cards and the triangle;
 *  - `--payoffs` (a screen, on the twins): what a block must pay. The twins'
 *    payoff defenses riposte when they hold; here they pay nothing, then a
 *    riposte rolled lower and lower down the ladder.
 *
 *   pnpm --filter @pimpampum/tools exec tsx src/defense-rules.ts --set elements
 *   … --levels 3,6,10 --rules today,envoltat+both --content kits --games 200 (a window point; duels are three times that)
 *   … --start 12,15,40   where the screen's walk to the aim starts, a PV for each level asked
 */
import { fileURLToPath } from 'node:url';
import { flag, games, inLanes, isolated, kitsDynamics, pct, SMOKE, useSet } from '@pimpampum/bench';
import {
  census, DEFENSE_RULES, dumbLoses, edgeHolds, HAND_WORTH_STYLES, handBeatsAttacking, PV_LEVELS, screenPasses, STYLE_LEVELS, windowOpen,
  type RuleCell, type ScreenCell, type TwinParams, type TwinRecipe,
} from '@pimpampum/playtest';
import { chosenSet } from './sets.js';

const SET = await chosenSet();
useSet(SET.gameSet);
const { ATTACK_LADDER, DEFENSE_LADDER, heroPV } = SET.root;
const list = (f: string) => flag(f)?.split(',');
const full = process.argv.includes('--full');
const payoffs = process.argv.includes('--payoffs');
const levels = list('--levels')?.map(Number) ?? (SMOKE ? STYLE_LEVELS.slice(0, 1) : full ? STYLE_LEVELS : PV_LEVELS);
const ruleIds = list('--rules') ?? (SMOKE || payoffs ? ['today'] : DEFENSE_RULES.map(r => r.id));
const contents = (payoffs ? ['twins'] : list('--content') ?? (full ? ['kits', 'twins'] : ['kits'])) as RuleCell['content'][];
const fights = games(200);
const duels = 3 * fights;
const log = (s: string) => process.stderr.write(`${s}\n`);
const PLAYTEST = fileURLToPath(import.meta.resolve('@pimpampum/playtest'));
const rules = ruleIds.map(id => {
  const rule = DEFENSE_RULES.find(r => r.id === id);
  if (!rule) throw new Error(`--rules ${id}: unknown (${DEFENSE_RULES.map(r => r.id).join(', ')})`);
  return rule;
});

// The twins copy what each card did in today's fights, at every level a hero plays.
let twins: TwinRecipe | undefined;
if (contents.includes('twins')) {
  log('today\'s fights, for the twins\' census…');
  twins = {
    cards: census(PV_LEVELS.map(level => kitsDynamics(level, games(120)).cards)),
    ladder: Object.fromEntries(Object.keys(ATTACK_LADDER).map(Number).map(l => [l, { attack: ATTACK_LADDER[l].toString(), defense: DEFENSE_LADDER[l].toString() }])),
  };
}

const mark = (ok: boolean) => (ok ? 'yes' : 'NO');
const title = (content: string) => (content === 'kits' ? 'THE REAL KITS' : 'THE VANILLA TWINS');
const ruleLines = () => { for (const rule of rules) console.log(`  ${rule.id.padEnd(15)} ${rule.says}`); };

if (full) {
  const jobs = contents.flatMap(content => rules.flatMap(rule => levels.map(level => ({ content, rule, level }))));
  let done = 0;
  const cells = await inLanes(jobs.map(({ content, rule, level }) => async () => {
    const cell = await isolated<RuleCell>(PLAYTEST, 'defenseRuleCell', [SET.ref, rule.id, level, fights, duels, ...(content === 'twins' ? [twins] : [])]);
    log(`${++done}/${jobs.length}: ${content} ${rule.id} L${level}`);
    return cell;
  }));
  const cellOf = (content: string, rule: string, level: number) => cells.find(x => x.content === content && x.rule === rule && x.level === level)!;
  const names = new Map(SET.gameSet.calibration.mainKits.flatMap(k => (SET.gameSet.kit(k)?.actions ?? []).map(a => [a.id, a.name] as const)));
  console.log(`${SET.id}: ${fights} fights a window point (four times that near a bar), ${duels} a duel; every hero on one PV`);
  ruleLines();
  for (const content of contents) {
    console.log(`\n${title(content)}`);
    console.log(`${'rule'.padEnd(15)} level  floor  aim  ceiling  window  rounds at the aim${HAND_WORTH_STYLES.map(s => s.padStart(17)).join('')}  hand > attacking`);
    for (const rule of rules) for (const level of levels) {
      const c = cellOf(content, rule.id, level);
      const w = c.window;
      const rounds = `${c.median}·${c.p90}${c.stalls ? `, ${Math.round(100 * c.stalls)}% stall` : ''} at ${c.pv} PV`;
      console.log(`${rule.id.padEnd(15)} L${String(level).padEnd(4)} ${String(w.floor).padStart(5)} ${String(w.aim ?? '—').padStart(4)} ${String(w.ceiling ?? '—').padStart(8)}  ${mark(windowOpen(c)).padEnd(6)}  ${rounds.padEnd(17)}${c.hand.map(h => pct(h.score, h.games).padStart(17)).join('')}  ${mark(handBeatsAttacking(c))}`);
      if (!windowOpen(c) && w.floorCards.length) console.log(`${''.padEnd(22)}floor set by: ${w.floorCards.slice(0, 3).map(k => `${names.get(k.card) ?? k.card} ${Math.round(100 * k.rate)}% ±${Math.round(100 * k.se)}`).join(', ')}`);
    }
  }
  for (const content of contents) {
    console.log(`\n${title(content)}: the other dumb strategies against the AI (✗: not clearly losing), and the triangle (the claimed winner's score; ✗: not clearly ahead), at the aim's PV`);
    console.log(`${'rule'.padEnd(15)} level  ${'turtle'.padStart(28)}${'random'.padStart(14)}   ${cells[0].triangle.map(e => e.edge.padStart(18)).join('')}`);
    for (const rule of rules) for (const level of levels) {
      const c = cellOf(content, rule.id, level);
      const dumb = c.dumb.map(d => `${pct(d.score, d.games)}${d.stalls >= 0.005 ? ` (${Math.round(100 * d.stalls)}% stall)` : ''}${edgeHolds(1 - d.score, d.games) ? '' : ' ✗'}`);
      console.log(`${rule.id.padEnd(15)} L${String(level).padEnd(4)} ${dumb[0].padStart(28)}${dumb[1].padStart(14)}   ${c.triangle.map(e => `${pct(e.score, e.games)}${edgeHolds(e.score, e.games) ? '' : ' ✗'}`.padStart(18)).join('')}`);
    }
  }
  console.log('\nRULES THAT PASS EVERY LEVEL (the window open, the full AI clearly ahead of spam and of attacks alone):');
  for (const content of contents) {
    const every = (ok: (c: RuleCell) => boolean) => rules.filter(rule => levels.every(level => ok(cellOf(content, rule.id, level))));
    const passing = every(c => windowOpen(c) && handBeatsAttacking(c));
    const safe = passing.filter(rule => levels.every(level => dumbLoses(cellOf(content, rule.id, level))));
    console.log(`  ${content}: ${passing.map(r => r.id).join(', ') || 'none'}   (a window at every level: ${every(windowOpen).map(r => r.id).join(', ') || 'none'}; of the passing, the turtle and random cards clearly lose too: ${safe.map(r => r.id).join(', ') || 'none'})`);
  }
} else {
  /** What the twins' payoff defenses pay, weakest first: nothing, then a riposte rolled this many levels down the attack ladder. */
  const PAYOFFS: { id: string; params: Partial<TwinParams> }[] = payoffs ? [
    { id: 'no payoff', params: { riposte: 0 } },
    { id: 'riposte −6', params: { riposteDrop: 6 } },
    { id: 'riposte −4', params: { riposteDrop: 4 } },
    { id: 'riposte −2', params: {} },
    { id: 'riposte −0', params: { riposteDrop: 0 } },
  ] : [{ id: '', params: {} }];
  // The walk to the aim starts from the PV a middle-tier hero holds today.
  const middle = SET.gameSet.calibration.mainKits[Math.floor(SET.gameSet.calibration.mainKits.length / 2)];
  const starts = list('--start')?.map(Number);
  const startPV = (level: number) => starts?.[levels.indexOf(level)] ?? heroPV({ [middle]: level });
  const jobs = contents.flatMap(content => rules.flatMap(rule => PAYOFFS.flatMap(payoff => levels.map(level => ({ content, rule, payoff, level })))));
  let done = 0;
  const cells = await inLanes(jobs.map(({ content, rule, payoff, level }) => async () => {
    const recipe = content === 'twins' ? [{ ...twins!, params: payoff.params }] : [];
    const cell = await isolated<ScreenCell>(PLAYTEST, 'defenseRuleScreen', [SET.ref, rule.id, level, fights, duels, startPV(level), ...recipe]);
    log(`${++done}/${jobs.length}: ${content} ${rule.id} ${payoff.id} L${level}`);
    return { ...cell, payoff: payoff.id };
  }));
  const cellOf = (content: string, rule: string, payoff: string, level: number) => cells.find(x => x.content === content && x.rule === rule && x.payoff === payoff && x.level === level)!;
  console.log(`${SET.id}: screened. The aim is walked to from today's PV on ${fights} fights a point; ${duels} fights a duel; every hero on one PV`);
  ruleLines();
  for (const content of contents) {
    console.log(`\n${title(content)}`);
    console.log(`${'rule'.padEnd(15)} ${payoffs ? 'payoff'.padEnd(12) : ''}level  aim  rounds          unanswered${HAND_WORTH_STYLES.map(s => s.padStart(17)).join('')}${'turtle'.padStart(24)}  passes`);
    for (const rule of rules) for (const payoff of PAYOFFS) for (const level of levels) {
      const c = cellOf(content, rule.id, payoff.id, level);
      const rounds = `${c.median}·${c.p90}${c.stalls ? `, ${Math.round(100 * c.stalls)}% stall` : ''}`;
      const turtle = `${pct(c.turtle.score, c.turtle.games)}${c.turtle.stalls >= 0.005 ? ` (${Math.round(100 * c.turtle.stalls)}% stall)` : ''}${edgeHolds(1 - c.turtle.score, c.turtle.games) ? '' : ' ✗'}`;
      console.log(`${rule.id.padEnd(15)} ${payoffs ? payoff.id.padEnd(12) : ''}L${String(level).padEnd(4)} ${String(c.aim ?? '—').padStart(4)}  ${rounds.padEnd(15)} ${`${Math.round(100 * c.unanswerable)}%${c.answered ? '' : ' ✗'}`.padStart(10)}${c.hand.map(h => pct(h.score, h.games).padStart(17)).join('')}${turtle.padStart(24)}  ${mark(screenPasses(c))}`);
    }
  }
  console.log('\nPASSES, level by level (quick fights with no knockout without an answer, the full AI clearly ahead of spam and of attacks alone):');
  for (const content of contents) for (const rule of rules) for (const payoff of PAYOFFS) {
    const row = levels.map(level => (screenPasses(cellOf(content, rule.id, payoff.id, level)) ? `L${level}` : `·`));
    const failed = levels.filter(level => !screenPasses(cellOf(content, rule.id, payoff.id, level)));
    console.log(`  ${content} ${rule.id.padEnd(15)} ${payoff.id.padEnd(payoffs ? 12 : 0)} ${row.join(' ')}   ${failed.length ? `fails ${failed.length} of ${levels.length}` : 'EVERY LEVEL'}`);
  }
}
