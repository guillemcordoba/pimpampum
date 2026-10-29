/**
 * THE EQUILIBRIUM PLAYER IN REAL FIGHTS — against today's AI, on a set's own
 * kits (AI-EQUILIBRIUM-PLAN.md, L2).
 *
 * Mirrored calibration parties (the same table on both sides), each fight
 * played twice on the same seed with the two AIs swapped between the sides,
 * so the dice and the seat cancel. Scored by winrate (draws ½) and by the
 * PV margin the equilibrium side ends with; its seconds per round are the
 * cost. A standing question while the player replaces today's AI.
 *
 * Run: pnpm --filter @pimpampum/tools exec tsx src/ai-equilibrium-real.ts
 *      … --set elements --games 20 --company 1
 */
import { CombatEngine, setAIControlled, withSeed, type Character } from '@pimpampum/engine';
import { aiPolicy, equilibriumPolicy, FAST_EQUILIBRIUM, type Policy } from '@pimpampum/ai';
import { calibrationParty, flag, games, theRegistry, theSet, useSet } from '@pimpampum/bench';
import { chosenSet } from './sets.js';

const chosen = await chosenSet();
useSet(chosen.gameSet);
const FIGHTS = games(10);
const COMPANY = Number(flag('--company') ?? 0);
/** Richer than the fast settings, to see whether more search changes the verdict. */
const SETTINGS = {
  ...FAST_EQUILIBRIUM,
  ...(flag('--playouts') ? { playouts: Number(flag('--playouts')) } : {}),
  ...(flag('--samples') ? { samples: [Number(flag('--samples'))] } : {}),
  ...(flag('--pool') ? { pool: Number(flag('--pool')) } : {}),
};

function margin(e: CombatEngine, team: number): number {
  const pv = (t: number) => e.teams[t].reduce((s, c) => s + Math.max(0, c.currentPV), 0);
  return pv(team) - pv(1 - team);
}

/** One fight, the equilibrium player on `eqTeam`; its margin, result and cost. */
function fight(seed: number, eqTeam: number): { margin: number; result: number; seconds: number; rounds: number; fallback: number } {
  return withSeed(seed, () => {
    const eq = equilibriumPolicy(SETTINGS);
    const today: Policy = aiPolicy({ depth: 1 });
    const of = (c: Character): Policy => (c.team === eqTeam ? eq : today);
    const a = theSet().buildParty(calibrationParty(COMPANY));
    const b = theSet().buildParty(calibrationParty(COMPANY));
    setAIControlled(a);
    setAIControlled(b);
    let seconds = 0;
    const e = new CombatEngine(a, b, {
      registry: theRegistry(), maxRounds: 40,
      actionChooser: (en, c) => {
        if (c.team !== eqTeam) return today.actionChooser(en, c);
        const t = performance.now();
        const pick = eq.actionChooser(en, c);
        seconds += (performance.now() - t) / 1000;
        return pick;
      },
      targetChooser: (en, c, ...rest) => of(c).targetChooser(en, c, ...rest),
      optionChooser: (en, c, ...rest) => of(c).optionChooser?.(en, c, ...rest) ?? null,
    });
    const res = e.runCombat();
    const result = res.winner === eqTeam ? 1 : res.winner === null ? 0.5 : 0;
    return { margin: margin(e, eqTeam), result, seconds, rounds: res.rounds, fallback: eq.stats.fallback };
  });
}

console.log(`EQUILIBRI ${JSON.stringify({ playouts: SETTINGS.playouts, samples: SETTINGS.samples, pool: SETTINGS.pool })} contra l'AI d'avui · joc ${chosen.id} · colla de calibratge ${COMPANY} · ${FIGHTS} parelles duplicades`);
const margins: number[] = [];
let wins = 0, seconds = 0, rounds = 0, fallback = 0;
for (let i = 0; i < FIGHTS; i++) {
  for (const eqTeam of [0, 1]) {
    const r = fight(77_000 + i, eqTeam);
    margins.push(r.margin);
    wins += r.result;
    seconds += r.seconds;
    rounds += r.rounds;
    fallback += r.fallback;
  }
  const n = margins.length;
  const mean = margins.reduce((x, y) => x + y, 0) / n;
  const se = Math.sqrt(margins.reduce((x, y) => x + (y - mean) ** 2, 0) / Math.max(1, n - 1) / n);
  console.log(`   ${n} combats: guanya ${(100 * wins / n).toFixed(0)}% · marge ${mean.toFixed(2)} ±${se.toFixed(2)} PV · ${(seconds / Math.max(1, rounds)).toFixed(1)} s per ronda · ${(rounds / n).toFixed(1)} rondes · rondes a l'AI d'avui ${fallback}`);
}
