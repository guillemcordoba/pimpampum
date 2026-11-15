/**
 * WHAT THE HAND IS WORTH — does playing the whole hand beat attacking every
 * round? (The user, 2026-11-14: the question is whether the cards let a dumb
 * strategy play as well as a smart one; the AI is never tuned to answer it.)
 *
 * Per level, 2v2 mirror fights of drawn kit pairs (bench `styleDuel`), each
 * style against the production AI: `spam` (always the biggest attack), and the
 * AI itself holding only part of its hand (`HAND_STYLES`): attacks alone,
 * attacks and Focus (what its defenses win it), attacks and defenses (what
 * its Focus wins it). A score near 50% says the missing cards win nothing.
 *
 * `--why`: where the AI's Defense cards go in those same fights (bench
 * `GuardLedger`), a Defense card played: what it stopped against the blow its
 * player did not throw, and how the PV its side still lost got past it.
 *
 *   pnpm --filter @pimpampum/tools exec tsx src/hand-worth.ts --set elements
 *   … --levels 4,5,6   --pv 15 (every hero on one PV)   --why
 *   … --chip 0.5 | --guard-covers-defender | --spend 0.5 | --returns 1   a candidate rule (bench `Variant`)
 */
import { duelAutopsy, flag, games, HAND_STYLES, pct, styleDuel, useSet, type DuelStyle, type GuardLedger, type Variant } from '@pimpampum/bench';
import { STYLE_LEVELS } from '@pimpampum/playtest';
import { chosenSet } from './sets.js';

const SET = await chosenSet();
useSet(SET.gameSet);
const levels = flag('--levels')?.split(',').map(Number) ?? STYLE_LEVELS;
const fights = games(400);
const variant: Variant = {
  ...(flag('--pv') ? { pv: Number(flag('--pv')) } : {}),
  ...(flag('--chip') ? { chipDamage: Number(flag('--chip')) } : {}),
  ...(process.argv.includes('--guard-covers-defender') ? { guardCoversDefender: true } : {}),
  ...(flag('--spend') ? { guardSpend: Number(flag('--spend')) } : {}),
  ...(flag('--returns') ? { holdReturns: Number(flag('--returns')) } : {}),
};
const styles: readonly DuelStyle[] = ['spam', ...HAND_STYLES];

console.log(`each style's score against the AI, ${fights} fights a cell${Object.keys(variant).length ? `, ${JSON.stringify(variant)}` : ''}:`);
console.log(`level  ${styles.map(s => s.padStart(18)).join('')}`);
for (const level of levels) {
  const row = styles.map(style => {
    const d = styleDuel(style, 'ai', level, fights, undefined, variant);
    return pct(d.score, d.games).padStart(18);
  });
  console.log(`L${String(level).padEnd(5)}${row.join('')}`);
}

if (process.argv.includes('--why')) {
  const opponents: readonly DuelStyle[] = ['spam', 'attacks', 'ai'];
  const per = (n: number, of: number) => (of ? (n / of).toFixed(1) : '—').padStart(5);
  const share = (n: number, of: number) => (of ? `${Math.round(100 * n / of)}%` : '—').padStart(5);
  const COLUMNS: [string, (l: GuardLedger) => string][] = [
    ['cards', l => String(l.cards).padStart(5)],
    ['idle', l => share(l.idle, l.cards)],
    ['stopped', l => per(l.stopped, l.cards)],
    ['back', l => per(l.dealtBack, l.cards)],
    ['forgone', l => per(l.forgone, l.cards)],
    ['around', l => per(l.lostAround, l.cards)],
    ['early', l => per(l.lostBefore, l.cards)],
    ['fresh', l => per(l.lostThroughFresh, l.cards)],
    ['used', l => per(l.lostThroughUsed, l.cards)],
    ['no roll', l => per(l.lostUncontested, l.cards)],
    ['other', l => per(l.lostOther, l.cards)],
  ];
  console.log(`\nthe AI's Defense cards against each style, a card played (PV unless a share):`);
  console.log('  idle: no enemy attack aimed at its side · stopped: PV its guards held · back: PV the attackers lost in their own steps · forgone: its player\'s biggest attack, on average');
  console.log('  PV its side still lost to attack cards: around (a body no guard covered) · early (before the guard was up) · fresh (through a guard no blow had met) · used (through one a blow had used) · no roll; other: Focus cards, the round\'s end');
  console.log(`level  against        ${COLUMNS.map(([name]) => name.padStart(8)).join('')}`);
  for (const level of levels) for (const style of opponents) {
    const ledger = duelAutopsy(style, 'ai', level, fights, variant).sides.y.ledger;
    console.log(`L${String(level).padEnd(5)} ${style.padEnd(14)} ${COLUMNS.map(([, cell]) => cell(ledger).padStart(8)).join('')}`);
  }
}
