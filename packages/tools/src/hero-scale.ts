/**
 * HERO SCALE — heroes against heroes at the set's own PV, the production AI on
 * both sides (`heroScaleRun`, `fastAttackVerdict`): how long fights last, how
 * many heroes fall before playing a card, which cards take a full-health hero
 * to 0 in one play, and whether any fast attack does so with nothing to answer
 * it. What the kit analyzer cannot see, since its creatures carry 30-120 PV.
 *
 * Run: pnpm --filter @pimpampum/tools exec tsx src/hero-scale.ts [--set elements] [--level 10]
 */
import { chosenSet } from './sets.js';
import { ROUND_CAP } from '@pimpampum/engine';
import { flag, pct, roundPercentiles, useSet } from '@pimpampum/bench';
import { FAST_ONE_SHOT_MAX, measureHeroScale } from '@pimpampum/playtest';

const SET = await chosenSet();
useSet(SET.gameSet);

const levels = flag('--level') ? [Number(flag('--level'))] : [6, 10];
for (const level of levels) {
  const r = measureHeroScale(level);
  const { median, p90 } = roundPercentiles(r.rounds);
  const round1 = r.rounds.filter(n => n <= 1).length / r.fights;
  console.log(`\nA ESCALA D'HEROI · ${r.teamSize} contra ${r.teamSize}, equips a l'atzar dels kits principals · nivell ${level} · ${r.fights} combats · la IA de producció als dos bàndols`);
  const stalled = r.rounds.filter(n => n >= ROUND_CAP).length / r.fights;
  console.log(`  rondes: mediana ${median} · p90 ${p90} · acaben a la primera ronda ${pct(round1, r.fights)} · encallats fins al límit ${pct(stalled, r.fights)}`);
  console.log(`  herois que cauen abans de jugar cap carta: ${pct(r.diedBeforeActing / r.heroes, r.heroes)}`);
  console.log('  kits (winrate del seu equip):');
  for (const k of [...r.kits].sort((a, b) => b.winrate - a.winrate)) console.log(`    ${k.id.padEnd(16)} ${pct(k.winrate, k.seats)} (${k.seats} seients)`);
  const killers = r.cards.filter(c => c.oneShots > 0).sort((a, b) => b.oneShots / b.plays - a.oneShots / a.plays);
  console.log('  cartes que deixen herois de PV plens a 0 en una sola jugada (herois per jugada):');
  for (const c of killers.slice(0, 12)) {
    console.log(`    ${c.name.padEnd(24)} ${c.fast ? 'ràpida' : '      '} ${(c.oneShots / c.plays).toFixed(2)} (${c.oneShots} en ${c.plays} jugades)`);
  }
  const v = r.fastAttacks;
  const verdict = r.fastDefense ? 'hi ha una defensa ràpida al joc: no es jutja'
    : v.ok ? `cap no supera el ${FAST_ONE_SHOT_MAX * 100}%` : `les supera: ${v.broken.join(', ')}`;
  console.log(`  ${v.ok ? '✅' : '❌'} un atac ràpid no mata d'un cop (màx. ${FAST_ONE_SHOT_MAX * 100}% de jugades, sense defensa ràpida): ${verdict}`
    + (v.unjudged.length ? ` · poc jugades per jutjar: ${v.unjudged.join(', ')}` : ''));
}
