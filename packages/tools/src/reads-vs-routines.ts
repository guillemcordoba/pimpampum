/**
 * READS AGAINST ROUTINES — the user's standing test: a dumb strategy must
 * never do as well as reading the opponent (memory `reads-beat-dumb-strategies`).
 *
 * On positions the exact referee solves, at the round's equilibrium:
 *  - ROUTINE LOSS: the best this round can do if every seat plays one type
 *    (a seat without one plays anything), against the other side's best
 *    reply — later rounds still solved exactly — minus the equilibrium value.
 *    Near 0: "always attack" (or defend, or focus) is as good as reading;
 *  - SHARE of each type in the equilibrium mix;
 *  - WORTH of each type: the value a side loses when that type's cards are
 *    taken from its hands (the position solved again).
 *
 * Averaged over both sides. Re-ask after any rule or content change.
 *
 * Run: pnpm --filter @pimpampum/tools exec tsx src/reads-vs-routines.ts
 *      … --slice 2x1-c3-r3 --catalogue composed --games 40 --per-position
 */
import { ActionType, type CombatEngine } from '@pimpampum/engine';
import {
  ARCHETYPES, BudgetExceeded, buildEngine, generatePosition, Referee, Unsupported, type GeneratorConfig, type Position,
} from '@pimpampum/ai/audit';
import { flag, games, SMOKE } from '@pimpampum/bench';

const SLICES: Record<string, GeneratorConfig> = {
  '2x2-c3-r1': { shape: '2x2', cards: 3, roundsLeft: 1 },
  '2x1-c3-r2': { shape: '2x1', cards: 3, roundsLeft: 2 },
  '1x2-c3-r2': { shape: '1x2', cards: 3, roundsLeft: 2 },
  '2x1-c3-r3': { shape: '2x1', cards: 3, roundsLeft: 3, multiShare: 0.8 },
  '1x2-c3-r3': { shape: '1x2', cards: 3, roundsLeft: 3, multiShare: 0.8 },
  '1x1-c4-r4': { shape: '1x1', cards: 4, roundsLeft: 4, multiShare: 0.8 },
  '1x1-c3-r5': { shape: '1x1', cards: 3, roundsLeft: 5, multiShare: 0.8 },
};
const TYPES = [ActionType.Atac, ActionType.Defensa, ActionType.Focus];
const slices = flag('--slice') ? [flag('--slice')!] : ['2x1-c3-r2', '1x2-c3-r2', '1x1-c4-r4'];
const CATALOGUE = (flag('--catalogue') ?? 'composed') as GeneratorConfig['catalogue'];
const POSITIONS = games(16);
const FROM = Number(flag('--from') ?? 1);
const BUDGET = Number(flag('--budget') ?? (SMOKE ? 200_000 : 3_000_000));
const PER_POSITION = process.argv.includes('--per-position');

/** `pos` with side `team`'s cards of `type` taken away (each hand keeps its fallback). */
function without(pos: Position, team: number, type: ActionType): Position {
  const teams = pos.teams.map((t, ti) => ti !== team ? t : t.map(f => ({
    ...f, cards: f.cards.filter(c => ARCHETYPES[c.arch].build(c.p, 'probe').actionType !== type),
  }))) as Position['teams'];
  return { ...pos, teams };
}

const fresh = (pos: Position): CombatEngine => buildEngine(pos, { actionChooser: () => null });

/** One position's numbers, or null when the referee cannot afford them. */
function measure(pos: Position): Record<string, number> | null {
  try {
    const root = new Referee({ budget: BUDGET }).solve(fresh(pos), 0);
    const engine = fresh(pos);
    const typeOf = (team: number, o: { idx: number; actionIdx: number }) =>
      o.actionIdx < 0 ? null : engine.teams[team][o.idx].actions[o.actionIdx].def.actionType;
    const out: Record<string, number> = {};
    for (const [team, joints, mix] of [[0, root.rows, root.sol.row], [1, root.cols, root.sol.col]] as const) {
      for (const type of TYPES) {
        out[`share${team}${type}`] = joints.reduce((acc, j, i) =>
          acc + mix[i] * j.filter(o => typeOf(team, o) === type).length / Math.max(1, j.length), 0);
        const v = new Referee({ budget: BUDGET }).solve(fresh(without(pos, team, type)), 0).value;
        out[`worth${team}${type}`] = team === 0 ? root.value - v : v - root.value;
        // The routine: rows (columns) where every seat holding the type plays it.
        const holds = new Set(joints.flatMap(j => j.filter(o => typeOf(team, o) === type).map(o => o.idx)));
        const idx = joints.map((j, i) => ({ j, i }))
          .filter(({ j }) => holds.size > 0 && j.every(o => !holds.has(o.idx) || typeOf(team, o) === type)).map(({ i }) => i);
        if (!idx.length) continue;
        const best = team === 0
          ? Math.max(...idx.map(i => Math.min(...root.payoff[i])))
          : Math.min(...idx.map(j => Math.max(...root.payoff.map(r => r[j]))));
        out[`routine${team}${type}`] = team === 0 ? root.value - best : best - root.value;
      }
    }
    return out;
  } catch (e) {
    if (e instanceof BudgetExceeded || e instanceof Unsupported) return null;
    throw e;
  }
}

const meanSe = (xs: number[]) => {
  const n = xs.length, m = xs.reduce((a, b) => a + b, 0) / Math.max(1, n);
  const se = n > 1 ? Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / (n - 1) / n) : NaN;
  return `${m.toFixed(2)} ±${se.toFixed(2)}`;
};

console.log(`LECTURES CONTRA RUTINES · cartes ${CATALOGUE} · ${POSITIONS} posicions per tall (des de ${FROM})`);
for (const slice of slices) {
  const rows: Record<string, number>[] = [];
  let skipped = 0;
  for (let seed = FROM; seed < FROM + POSITIONS; seed++) {
    const m = measure(generatePosition(seed, { ...SLICES[slice], catalogue: CATALOGUE }));
    if (!m) { skipped++; continue; }
    rows.push(m);
    if (PER_POSITION) console.log(JSON.stringify({ slice, catalogue: CATALOGUE, seed, ...m }));
  }
  const both = (key: string) => rows.flatMap(r => [r[key.replace('#', '0')], r[key.replace('#', '1')]]).filter(x => typeof x === 'number');
  console.log(`\n  ${slice}: ${rows.length} posicions (${skipped} fora de pressupost)`);
  console.log('    tipus      pèrdua de la rutina      quota       valor (PV)');
  for (const type of TYPES) {
    console.log(`    ${type.padEnd(9)} ${meanSe(both(`routine#${type}`)).padStart(16)}   ${meanSe(both(`share#${type}`)).padStart(12)}   ${meanSe(both(`worth#${type}`)).padStart(12)}`);
  }
}
