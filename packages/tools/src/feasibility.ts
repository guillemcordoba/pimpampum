/**
 * FEASIBILITY, printed (playtest `feasibility.ts`): per level, the shortest a
 * fight of ladder cards can be (pure aggression) and its length at the AI's
 * real mix of plays, and the hero PV a target length would need. A target no
 * faster than pure aggression is unreachable by tuning cards: settle it here,
 * before any card is touched.
 *
 *   pnpm --filter @pimpampum/tools exec tsx src/feasibility.ts --set elements
 *   … --rounds 6 --pv 26 --armour 1 --mix 0.40,0.30
 *   … --pv 3:10,6:14,10:30     a PV curve by level (straight lines between)
 */
import { flag } from '@pimpampum/bench';
import { feasibility, type LadderRung } from '@pimpampum/playtest';
import { chosenSet } from './sets.js';

const SET = await chosenSet();
const { ATTACK_LADDER, DEFENSE_LADDER, heroPV } = SET.root;
/** A hero's PV at a level, averaged over the main kits. */
const meanPV = (level: number) => Math.round(SET.gameSet.calibration.mainKits.reduce((t, k) => t + heroPV({ [k]: level }), 0) / SET.gameSet.calibration.mainKits.length);
const ladder: Record<number, LadderRung> = {};
for (const l of Object.keys(ATTACK_LADDER).map(Number)) ladder[l] = { attack: ATTACK_LADDER[l], defense: DEFENSE_LADDER[l] };

const rounds = Number(flag('--rounds') ?? 6);
const [attack, defense] = (flag('--mix') ?? '0.40,0.30').split(',').map(Number);
const pvFlag = flag('--pv');
const points = pvFlag?.includes(':') ? pvFlag.split(',').map(p => p.split(':').map(Number) as [number, number]).sort((a, b) => a[0] - b[0]) : null;
const pv = points
  ? (level: number) => {
    const hi = points.findIndex(p => p[0] >= level);
    if (hi <= 0) return points[hi < 0 ? points.length - 1 : 0][1];
    const [l0, p0] = points[hi - 1], [l1, p1] = points[hi];
    return Math.round(p0 + (p1 - p0) * (level - l0) / (l1 - l0));
  }
  : pvFlag ? Number(pvFlag) : meanPV;

const rows = feasibility({ ladder, pv, armour: Number(flag('--armour') ?? 1), teamSize: 2, mix: { attack, defense } }, Object.keys(ladder).map(Number), rounds);
const f = (x: number) => (Number.isFinite(x) ? x.toFixed(1) : '∞').padStart(6);
console.log(`Target: a side wiped within ${rounds} rounds · mix ${Math.round(100 * attack)}% attacks, ${Math.round(100 * defense)}% defenses · 2v2`);
console.log(`level    PV  blow  bare  guard   pure    mix   PV→pure PV→mix`);
for (const r of rows) {
  console.log(`L${String(r.level).padEnd(3)} ${String(r.pv).padStart(5)} ${f(r.blow)}${f(r.landsBare)}${f(r.landsOnGuard)} ${f(r.pureRounds)} ${f(r.mixRounds)} ${f(r.pvPure)} ${f(r.pvMix)}  ${r.pureRounds > rounds ? 'unreachable' : r.mixRounds > rounds ? 'only if they attack more' : 'reachable'}`);
}
console.log(`pure: nobody defends or focuses (the floor) · mix: the AI's shares, Focus dealing nothing (leans long) · PV→: the hero PV giving ${rounds} rounds`);
