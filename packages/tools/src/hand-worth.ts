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
 *   pnpm --filter @pimpampum/tools exec tsx src/hand-worth.ts --set elements
 *   … --levels 4,5,6   --pv 15 (every hero on one PV)
 *   … --chip 0.5 | --guard-covers-defender   a candidate rule (bench `Variant`)
 */
import { flag, games, HAND_STYLES, pct, styleDuel, useSet, type DuelStyle, type Variant } from '@pimpampum/bench';
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
