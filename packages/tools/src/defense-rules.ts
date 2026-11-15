/**
 * WHICH RULE FOR HOW DEFENSES MEET ATTACKS? (GOALS.md, night goal 1; the user,
 * 2026-11-14.) Every candidate (playtest `DEFENSE_RULES`: engine options, off
 * by the rules) on the real kits and on their vanilla twins, per level: the PV
 * window (floor: no knockout without an answer; aim: the median fight within
 * 5 rounds; ceiling: fights end), and at the aim's PV each style's score
 * against the full AI (spam, attacks alone, attacks and Focus, attacks and
 * defenses). A level passes when the window is open and the full AI is
 * clearly ahead of spam and of attacks alone. Beside it, at the same PV, what
 * a rule that pays defending could break: only defending and any legal card
 * against the AI, and the triangle's three edges.
 *
 *   pnpm --filter @pimpampum/tools exec tsx src/defense-rules.ts --set elements
 *   … --levels 3,6,10 --rules today,whole+margin --content kits --games 200 (a window point; duels are three times that)
 */
import { fileURLToPath } from 'node:url';
import { flag, games, inLanes, isolated, kitsDynamics, pct, SMOKE, useSet } from '@pimpampum/bench';
import { census, DEFENSE_RULES, dumbLoses, edgeHolds, HAND_WORTH_STYLES, handBeatsAttacking, PV_LEVELS, STYLE_LEVELS, windowOpen, type RuleCell, type TwinRecipe } from '@pimpampum/playtest';
import { chosenSet } from './sets.js';

const SET = await chosenSet();
useSet(SET.gameSet);
const { ATTACK_LADDER, DEFENSE_LADDER } = SET.root;
const list = (f: string) => flag(f)?.split(',');
const levels = list('--levels')?.map(Number) ?? (SMOKE ? STYLE_LEVELS.slice(0, 1) : STYLE_LEVELS);
const ruleIds = list('--rules') ?? (SMOKE ? ['today'] : DEFENSE_RULES.map(r => r.id));
const contents = (list('--content') ?? ['kits', 'twins']) as RuleCell['content'][];
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

const jobs = contents.flatMap(content => rules.flatMap(rule => levels.map(level => ({ content, rule, level }))));
let done = 0;
const cells = await inLanes(jobs.map(({ content, rule, level }) => async () => {
  const cell = await isolated<RuleCell>(PLAYTEST, 'defenseRuleCell', [SET.ref, rule.id, level, fights, duels, ...(content === 'twins' ? [twins] : [])]);
  log(`${++done}/${jobs.length}: ${content} ${rule.id} L${level}`);
  return cell;
}));

const names = new Map(SET.gameSet.calibration.mainKits.flatMap(k => (SET.gameSet.kit(k)?.actions ?? []).map(a => [a.id, a.name] as const)));
const mark = (ok: boolean) => (ok ? 'yes' : 'NO');
console.log(`${SET.id}: ${fights} fights a window point (four times that near a bar), ${duels} a duel; every hero on one PV`);
for (const rule of rules) console.log(`  ${rule.id.padEnd(18)} ${rule.says}`);
for (const content of contents) {
  console.log(`\n${content === 'kits' ? 'THE REAL KITS' : 'THE VANILLA TWINS'}`);
  console.log(`${'rule'.padEnd(18)} level  floor  aim  ceiling  window  rounds at the aim${HAND_WORTH_STYLES.map(s => s.padStart(17)).join('')}  hand > attacking`);
  for (const rule of rules) for (const level of levels) {
    const c = cells.find(x => x.content === content && x.rule === rule.id && x.level === level)!;
    const w = c.window;
    const rounds = `${c.median}·${c.p90}${c.stalls ? `, ${Math.round(100 * c.stalls)}% stall` : ''} at ${c.pv} PV`;
    console.log(`${rule.id.padEnd(18)} L${String(level).padEnd(4)} ${String(w.floor).padStart(5)} ${String(w.aim ?? '—').padStart(4)} ${String(w.ceiling ?? '—').padStart(8)}  ${mark(windowOpen(c)).padEnd(6)}  ${rounds.padEnd(17)}${c.hand.map(h => pct(h.score, h.games).padStart(17)).join('')}  ${mark(handBeatsAttacking(c))}`);
    if (!windowOpen(c) && w.floorCards.length) console.log(`${''.padEnd(25)}floor set by: ${w.floorCards.slice(0, 3).map(k => `${names.get(k.card) ?? k.card} ${Math.round(100 * k.rate)}% ±${Math.round(100 * k.se)}`).join(', ')}`);
  }
}

for (const content of contents) {
  console.log(`\n${content === 'kits' ? 'THE REAL KITS' : 'THE VANILLA TWINS'}: the other dumb strategies against the AI (✗: not clearly losing), and the triangle (the claimed winner's score; ✗: not clearly ahead), at the aim's PV`);
  console.log(`${'rule'.padEnd(18)} level  ${'turtle'.padStart(28)}${'random'.padStart(14)}   ${cells[0].triangle.map(e => e.edge.padStart(18)).join('')}`);
  for (const rule of rules) for (const level of levels) {
    const c = cells.find(x => x.content === content && x.rule === rule.id && x.level === level)!;
    const dumb = c.dumb.map(d => `${pct(d.score, d.games)}${d.stalls >= 0.005 ? ` (${Math.round(100 * d.stalls)}% stall)` : ''}${edgeHolds(1 - d.score, d.games) ? '' : ' ✗'}`);
    console.log(`${rule.id.padEnd(18)} L${String(level).padEnd(4)} ${dumb[0].padStart(28)}${dumb[1].padStart(14)}   ${c.triangle.map(e => `${pct(e.score, e.games)}${edgeHolds(e.score, e.games) ? '' : ' ✗'}`.padStart(18)).join('')}`);
  }
}

console.log('\nRULES THAT PASS EVERY LEVEL (the window open, the full AI clearly ahead of spam and of attacks alone):');
for (const content of contents) {
  const passing = rules.filter(rule => levels.every(level => {
    const c = cells.find(x => x.content === content && x.rule === rule.id && x.level === level)!;
    return windowOpen(c) && handBeatsAttacking(c);
  }));
  const open = rules.filter(rule => levels.every(level => windowOpen(cells.find(x => x.content === content && x.rule === rule.id && x.level === level)!)));
  const safe = passing.filter(rule => levels.every(level => dumbLoses(cells.find(x => x.content === content && x.rule === rule.id && x.level === level)!)));
  console.log(`  ${content}: ${passing.map(r => r.id).join(', ') || 'none'}   (a window at every level: ${open.map(r => r.id).join(', ') || 'none'}; of the passing, the turtle and random cards clearly lose too: ${safe.map(r => r.id).join(', ') || 'none'})`);
}
