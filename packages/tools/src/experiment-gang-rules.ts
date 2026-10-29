/**
 * EXPERIMENT (2026-10-28, one-off — delete once its conclusion is in
 * NEXT-STEPS.md): what should happen when several attacks meet one defended
 * body? Five rules (`CombatEngineOptions.gangRule`), compared by the EXACT
 * referee — best play under each rule, with no AI's opinion in it — on the
 * same positions, where one side has two bodies and the other one.
 *
 * Per rule, at the round's equilibrium:
 *  - DEFENSE: how much of each side's play is defense;
 *  - READS: what mixing is worth over the safest pure play (the value minus
 *    the best guaranteed by one fixed joint) — near 0, a routine is as good
 *    as reading;
 *  - FOCUS FIRE: when the two-body side throws two attacks, how often they
 *    aim at the same body (on the referee's own in-round decisions).
 *
 * TYPE VALUES (`--type-values`): each side's share of Attack, Defense and
 * Focus at the equilibrium, and what each type is WORTH to it — the value it
 * loses when that type's cards are taken from its hands (the position solved
 * again, exactly). How strong a rule makes each kind of card.
 *
 * One JSON line per position (`--per-position`), so the rules can be
 * compared on the positions every one of them solved: a budget skips
 * different positions under different rules.
 *
 * Run: pnpm --filter @pimpampum/tools exec tsx src/experiment-gang-rules.ts
 *      … --rule sum --slice 2x1-c3-r3 --catalogue composed --games 12
 */
import { ActionType, type CombatEngine, type GangRule } from '@pimpampum/engine';
import {
  ARCHETYPES, BudgetExceeded, buildEngine, generatePosition, Referee, Unsupported, type GeneratorConfig, type Position,
} from '@pimpampum/ai/audit';
import { flag, games, SMOKE } from '@pimpampum/bench';

const SLICES: Record<string, GeneratorConfig> = {
  // Two bodies a side: the only shape where "same target" is a choice.
  '2x2-c2-r2': { shape: '2x2', cards: 2, roundsLeft: 2 },
  '2x2-c3-r1': { shape: '2x2', cards: 3, roundsLeft: 1 },
  '2x1-c3-r2': { shape: '2x1', cards: 3, roundsLeft: 2 },
  '1x2-c3-r2': { shape: '1x2', cards: 3, roundsLeft: 2 },
  '2x1-c3-r3': { shape: '2x1', cards: 3, roundsLeft: 3, multiShare: 0.8 },
  '1x2-c3-r3': { shape: '1x2', cards: 3, roundsLeft: 3, multiShare: 0.8 },
};
const RULES: GangRule[] = ['separate', 'sum', 'wear', 'flank', 'single', 'swarm', 'swarmAll', 'divided', 'unguarded'];
const TYPES = [ActionType.Atac, ActionType.Defensa, ActionType.Focus];
const TYPE_VALUES = process.argv.includes('--type-values');

/** `pos` with side `team`'s cards of `type` taken away (each hand keeps
 *  its fallback, as every built hand does). */
function without(pos: Position, team: number, type: ActionType): Position {
  const teams = pos.teams.map((t, ti) => ti !== team ? t : t.map(f => ({
    ...f, cards: f.cards.filter(c => ARCHETYPES[c.arch].build(c.p, 'probe').actionType !== type),
  }))) as Position['teams'];
  return { ...pos, teams };
}

const rules = flag('--rule') ? [flag('--rule') as GangRule] : RULES;
const slices = flag('--slice') ? [flag('--slice')!] : Object.keys(SLICES);
const CATALOGUE = (flag('--catalogue') ?? 'composed') as GeneratorConfig['catalogue'];
const POSITIONS = games(12);
/** First seed, so a slice can be extended without re-solving what is done. */
const FROM = Number(flag('--from') ?? 1);
/** `flank`'s bonus per other attack on the same target. */
const FLANK = Number(flag('--flank') ?? 2);
const BUDGET = Number(flag('--budget') ?? (SMOKE ? 200_000 : 3_000_000));
/** Paths walked per likely cell, for where the attacks aimed. */
const PATHS = 2;
const PER_POSITION = process.argv.includes('--per-position');

interface Tally {
  solved: number; skipped: number;
  value: number; readsA: number; readsB: number;
  defenseOne: number; defenseTwo: number;
  twoAttacks: number; focus: number; weight: number;
}

const mean = (x: number, n: number) => (n ? x / n : NaN);

/** One position's contribution: the tally now minus the tally before it. */
function snapshot(t: Tally, b: Tally) {
  const d = (k: keyof Tally) => t[k] - b[k];
  return {
    value: d('value'), readsA: d('readsA'), readsB: d('readsB'), defenseOne: d('defenseOne'), defenseTwo: d('defenseTwo'),
    weight: d('weight'), twoAttacks: d('twoAttacks'), focus: d('focus'),
  };
}

for (const rule of rules) {
  for (const slice of slices) {
    const t: Tally = { solved: 0, skipped: 0, value: 0, readsA: 0, readsB: 0, defenseOne: 0, defenseTwo: 0, twoAttacks: 0, focus: 0, weight: 0 };
    for (let seed = FROM; seed < FROM + POSITIONS; seed++) {
      const pos = generatePosition(seed, { ...SLICES[slice], catalogue: CATALOGUE });
      const fresh = (): CombatEngine => buildEngine(pos, { actionChooser: () => null }, { rules: { gangRule: rule, flankBonus: FLANK } });
      const referee = new Referee({ budget: BUDGET });
      let root;
      try { root = referee.solve(fresh(), 0); } catch (e) {
        if (e instanceof BudgetExceeded || e instanceof Unsupported) { t.skipped++; continue; }
        throw e;
      }
      const before = { ...t };
      t.solved++;
      t.value += root.value;
      // The safest pure joint each side has, against the other's best reply.
      t.readsA += root.value - Math.max(...root.payoff.map(r => Math.min(...r)));
      t.readsB += Math.min(...root.payoff[0].map((_, j) => Math.max(...root.payoff.map(r => r[j])))) - root.value;

      const engine = fresh();
      // The side with two bodies (side A when both have two).
      const twoSide = engine.teams[0].filter(c => c.isAlive()).length >= 2 ? 0 : 1;
      const defenseShare = (joints: typeof root.rows, mix: number[], team: number) => joints.reduce((s, j, i) =>
        s + mix[i] * j.filter(o => o.actionIdx >= 0 && engine.teams[team][o.idx].actions[o.actionIdx].def.actionType === ActionType.Defensa).length / Math.max(1, j.length), 0);
      t.defenseTwo += defenseShare(twoSide === 0 ? root.rows : root.cols, twoSide === 0 ? root.sol.row : root.sol.col, twoSide);
      t.defenseOne += defenseShare(twoSide === 0 ? root.cols : root.rows, twoSide === 0 ? root.sol.col : root.sol.row, 1 - twoSide);

      if (TYPE_VALUES) {
        // Shares at the equilibrium, and the worth of each type to each side.
        const share = (joints: typeof root.rows, mix: number[], team: number, type: ActionType) => joints.reduce((acc, j, i) =>
          acc + mix[i] * j.filter(o => o.actionIdx >= 0 && engine.teams[team][o.idx].actions[o.actionIdx].def.actionType === type).length / Math.max(1, j.length), 0);
        const out: Record<string, number> = {};
        try {
          for (const [team, joints, mix] of [[0, root.rows, root.sol.row], [1, root.cols, root.sol.col]] as const) {
            for (const type of TYPES) {
              out[`share${team}${type}`] = share(joints, mix, team, type);
              const v = new Referee({ budget: BUDGET }).solve(buildEngine(without(pos, team, type), { actionChooser: () => null }, { rules: { gangRule: rule, flankBonus: FLANK } }), 0).value;
              out[`worth${team}${type}`] = team === 0 ? root.value - v : v - root.value;
            }
          }
        } catch (e) {
          if (!(e instanceof BudgetExceeded || e instanceof Unsupported)) throw e;
          Object.assign(t, before);
          t.skipped++;
          continue;
        }
        if (PER_POSITION) console.log(JSON.stringify({ rule, slice, catalogue: CATALOGUE, seed, typeValues: true, ...out }));
        continue;
      }
      // Where the two-body side's attacks aimed, on the likely cells. Walking
      // the paths costs rounds too: a position whose walk runs out of budget
      // is skipped whole, its solve undone from the tally.
      try {
      root.rows.forEach((row, i) => root.cols.forEach((col, j) => {
        const p = root.sol.row[i] * root.sol.col[j];
        if (p < 0.01) return;
        for (let path = 0; path < PATHS; path++) {
          const end = referee.bestPath(fresh(), row, col, path);
          // Every side with two bodies counts (both, in a 2v2).
          for (const team of [0, 1].filter(tm => tm === twoSide || engine.teams[tm].filter(c => c.isAlive()).length >= 2)) {
            const attacks = end.history.filter(ev => ev.round === end.round && ev.actor.team === team && ev.action.actionType === ActionType.Atac);
            t.weight += p / PATHS;
            if (attacks.length < 2) continue;
            t.twoAttacks += p / PATHS;
            const aims = attacks.flatMap(ev => ev.targets);
            if (aims.some((c, k) => aims.indexOf(c) !== k)) t.focus += p / PATHS;
          }
        }
      }));
      } catch (e) {
        if (!(e instanceof BudgetExceeded)) throw e;
        Object.assign(t, before);
        t.skipped++;
        continue;
      }
      if (PER_POSITION) console.log(JSON.stringify({ rule: rule === 'flank' && FLANK !== 2 ? `flank${FLANK}` : rule, slice, catalogue: CATALOGUE, seed, ...snapshot(t, before) }));
    }
    const n = t.solved;
    console.log(JSON.stringify({
      rule, slice, catalogue: CATALOGUE, solved: n, skipped: t.skipped,
      value: +mean(t.value, n).toFixed(2),
      readsA: +mean(t.readsA, n).toFixed(2), readsB: +mean(t.readsB, n).toFixed(2),
      defenseOfTheOne: +mean(t.defenseOne, n).toFixed(3), defenseOfTheTwo: +mean(t.defenseTwo, n).toFixed(3),
      twoAttacks: +(t.twoAttacks / Math.max(1e-9, t.weight)).toFixed(3),
      focusGivenTwo: +(t.focus / Math.max(1e-9, t.twoAttacks)).toFixed(3),
    }));
  }
}
