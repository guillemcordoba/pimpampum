/**
 * THE STRATEGY POOL (the user, 2026-11-15): does the game end on players who
 * read the opponent? Per level, a pool of response tables (bench `pool.ts`:
 * what a side plays after each plan the other side showed) grown by the
 * double oracle (playtest `growPool`): from always-attack, the table that
 * best beats the pool's equilibrium mix is searched for and added, until
 * nothing new beats it. Printed: each table as it is added and what it beat,
 * the score table, the final mix, the share of it that reads, the member that
 * beats each fixed strategy, the requirement (the best strategy is not a dumb
 * one: playtest `poolVerdict`), and the production AI against the mix.
 *
 *   pnpm --filter @pimpampum/tools exec tsx src/strategy-pool.ts --set elements
 *   … --levels 6 --games 200 (fights a duel) --members 12   --pv 15 | --spend 0 | --envoltat | --guard-covers-defender
 */
import { fileURLToPath } from 'node:url';
import { flag, games, inLanes, isolated, memberKey, pct, SMOKE, useSet, type PoolDuel, type PoolMember, type Variant } from '@pimpampum/bench';
import { countersPlayed, describeTable, growPool, isFixed, POOL_DEFAULTS, POOL_READER_SHARE, poolVerdict, STYLE_LEVELS } from '@pimpampum/playtest';
import { chosenSet } from './sets.js';

const SET = await chosenSet();
useSet(SET.gameSet);
const levels = flag('--levels')?.split(',').map(Number) ?? (SMOKE ? STYLE_LEVELS.slice(0, 1) : STYLE_LEVELS);
const fights = games(200);
const maxMembers = Number(flag('--members')) || (SMOKE ? 3 : POOL_DEFAULTS.maxMembers);
const variant: Variant = {
  ...(flag('--pv') ? { pv: Number(flag('--pv')) } : {}),
  ...(flag('--spend') ? { guardSpend: Number(flag('--spend')) } : {}),
  ...(process.argv.includes('--envoltat') ? { envoltat: true } : {}),
  ...(process.argv.includes('--guard-covers-defender') ? { guardCoversDefender: true } : {}),
};
const PLAYTEST = fileURLToPath(import.meta.resolve('@pimpampum/playtest'));
const log = (s: string) => process.stderr.write(`${s}\n`);

/** Every duel asked for, once: a pair is one job whichever way round it is asked. */
const played = new Map<string, Promise<PoolDuel>>();
function duel(level: number, x: PoolMember, y: PoolMember): Promise<PoolDuel> {
  const [a, b] = memberKey(x) <= memberKey(y) ? [x, y] : [y, x];
  const k = `${level}:${memberKey(a)}:${memberKey(b)}`;
  let job = played.get(k);
  if (!job) played.set(k, job = inLanes([() => isolated<PoolDuel>(PLAYTEST, 'poolDuelJob', [SET.ref, a, b, level, fights, variant])]).then(r => r[0]));
  return job.then(d => (a === x ? d : { ...d, score: 1 - d.score }));
}

const results = await Promise.all(levels.map(async level => {
  const result = await growPool(async pairs => (await Promise.all(pairs.map(([x, y]) => duel(level, x, y)))).map(d => d.score), {
    maxMembers,
    onStep: (step, members) => log(`L${level}: member ${members.length}, +${(100 * step.gain).toFixed(1)} on the mix: ${describeTable(step.added)}`),
  });
  const support = result.members.map((m, i) => ({ m, p: result.mix[i] })).filter(s => s.p >= 0.01);
  const ai = await Promise.all(support.map(s => duel(level, 'ai', s.m)));
  return { level, result, aiScore: support.reduce((t, s, i) => t + s.p * ai[i].score, 0) / support.reduce((t, s) => t + s.p, 0) };
}));

console.log(`${SET.id}: the strategy pool, ${fights} fights a duel (±${(100 * Math.sqrt(0.25 / fights)).toFixed(1)})${Object.keys(variant).length ? `, ${JSON.stringify(variant)}` : ''}`);
console.log('A attack · D defense · F Focus; a plan is a side\'s two cards; a table is what a side plays after each plan the other side showed last round.');
for (const { level, result: r, aiScore } of results) {
  const verdict = poolVerdict(r, fights);
  console.log(`\nL${level}: ${r.members.length} members, ${r.converged ? 'nothing new beats the mix' : `stopped at ${maxMembers} members, still growing`}`);
  r.members.forEach((m, i) => {
    const step = r.steps[i - 1];
    console.log(`  ${String(i + 1).padStart(2)}. ${String(Math.round(100 * r.mix[i])).padStart(3)}% of the mix  ${isFixed(m) ? 'fixed ' : `reads (${countersPlayed(m)}/6 counters)`}  ${describeTable(m)}${step ? `   [added +${(100 * step.gain).toFixed(1)} on the mix before it]` : ''}`);
  });
  console.log(`  score, row against column:\n${r.score.map((row, i) => `  ${String(i + 1).padStart(4)} ${row.map(s => `${Math.round(100 * s)}`.padStart(4)).join('')}`).join('\n')}`);
  console.log(`  the mix: ${Math.round(100 * verdict.readers)}% on members that read (${verdict.endsOnReaders ? 'ends on readers' : `NOT mostly readers, the bar is ${100 * POOL_READER_SHARE}%`}); the best member still gains ${(100 * r.exploit).toFixed(1)} on it`);
  for (const f of verdict.fixed) console.log(`  ${describeTable(f.table)} is beaten most by: ${f.beatenBy ? `${describeTable(f.beatenBy)}, ${pct(f.score, fights)}${f.clearly ? '' : ' (not clearly)'}` : 'nothing'}`);
  console.log(`  THE BEST STRATEGY IS NOT A DUMB ONE: ${verdict.ok ? 'holds' : `DOES NOT HOLD: ${verdict.why.join('; ')}`}`);
  console.log(`  the production AI against the mix: ${pct(aiScore, fights)}`);
}
