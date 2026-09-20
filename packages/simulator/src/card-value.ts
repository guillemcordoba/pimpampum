/**
 * WHAT IS EACH CARD WORTH? — per-decision counterfactual value.
 *
 * The standing question this answers, after every content change: when this
 * card is on the table, is playing it better than playing something else?
 *
 * Requirement 4/5's ablation answers a related question in party winrate and
 * cannot resolve it (NEXT-STEPS §17.5): a whole kit in one seat is worth ~11pp
 * against a ~3pp noise floor, so the average card is under the floor by
 * construction. This asks at the DECISION instead of at the fight, which
 * removes all four of the reasons why — see `bench/regret.ts`.
 *
 *   value(C) = score(playing C) − score(playing the average alternative)
 *
 * scored in PV on my side minus PV on theirs, which the rules already make one
 * currency, and from a position both branches share exactly.
 *
 *   npx tsx src/card-value.ts                     # every main kit
 *   npx tsx src/card-value.ts --player berserk
 *   npx tsx src/card-value.ts --games 40          # cheap
 *   npx tsx src/card-value.ts --depth 1           # faithful (slow) rollouts
 */
import {
  ActionDefinition, CombatEngine, setAIControlled, lookaheadChooser, withSeed,
} from '@pimpampum/engine';
import { ALL_SKILLS, buildReferenceParty } from '@pimpampum/skills';
import { buildComposition } from '@pimpampum/enemies';
import { MAIN_KITS, hero } from './bench/reference.js';
import { SHAPES, calibrationParty, solveShape, usableCells } from './bench/shapes.js';
import { CELL_AI, type CellSetup } from './bench/cells.js';
import { REGISTRY } from './bench/arena.js';
import { exact, pp, share } from './bench/report.js';
import { games } from './bench/games.js';
import { DEFAULT_REGRET, valuePosition, type RegretOptions } from './bench/regret.js';

declare const process: { argv: string[]; env: Record<string, string | undefined> };

/**
 * Sized by the claim, per CLAUDE.md: resolve a card to ~1 PV at 2σ.
 *
 * At 24 fights the bars run ±3.5 to ±7.6 PV, so ~25× buys the order of
 * magnitude — and it is affordable only because this harness is cheap where
 * the ablation is not. A rollout is two or three rounds, fights are three
 * rounds at the median, and every decision yields an observation instead of
 * every fight: 24 fights at depth 1 cost about two seconds.
 */
const GAMES = games(600);
const flag = (name: string): string | undefined => {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
};
const OPTS: RegretOptions = {
  ...DEFAULT_REGRET,
  rolloutDepth: Number(flag('--depth') ?? DEFAULT_REGRET.rolloutDepth),
};
const SEED = 909_000;

/** Every observation of one card: its value at a position, and which fight the
 *  position came from — positions inside one fight are NOT independent. */
interface Obs { value: number; vsBest: number; win: number; best: number; fight: number }

function setupFor(skillId: string, cell: { shapeIdx: number; companyIdx: number }): CellSetup {
  const base = calibrationParty(cell.companyIdx).characters!;
  return {
    party: { characters: [hero('Subjecte', skillId), ...base.slice(1)] },
    enemies: solveShape(SHAPES[cell.shapeIdx]).groups,
    subjectTeam: 0,
  };
}

/**
 * Play fights, and at every decision the subject faces, price the whole hand.
 *
 * The REAL fight is played by the real policy, so the positions visited are the
 * ones the game actually reaches. Only the counterfactual branches are rolled
 * out cheaply.
 */
function measure(skillId: string): { obs: Map<string, Obs[]>; positions: number; fights: number } {
  const cells = usableCells();
  const obs = new Map<string, Obs[]>();
  const per = Math.max(1, Math.round(GAMES / cells.length));
  let positions = 0, fights = 0;

  for (const cell of cells) {
    const setup = setupFor(skillId, cell);
    withSeed(SEED + cell.shapeIdx * 101 + cell.companyIdx * 17, () => {
      for (let g = 0; g < per; g++) {
        const players = buildReferenceParty(setup.party);
        setAIControlled(players);
        const engine = new CombatEngine(players, buildComposition(setup.enemies), {
          registry: REGISTRY, maxRounds: 40, actionChooser: lookaheadChooser(CELL_AI),
        });
        const subject = engine.teams[0][0];
        const fight = fights++;
        let guard = 0;
        while (!engine.isOver() && engine.round < engine.maxRounds && guard++ < 40) {
          if (subject.isAlive()) {
            const priced = valuePosition(engine, subject, { ...OPTS, team: 0 });
            if (priced) {
              positions++;
              for (const c of priced.cards) {
                const list = obs.get(c.id) ?? [];
                list.push({ value: c.value, vsBest: c.valueVsBest, win: c.winValue, best: c.wasBest, fight });
                obs.set(c.id, list);
              }
            }
          }
          engine.runRound();
        }
      }
    });
  }
  return { obs, positions, fights };
}

/**
 * 1σ CLUSTERED BY FIGHT. Positions inside one combat share its dice, its
 * seating and its whole history, so treating them as independent would divide
 * the error by the square root of a number far larger than the real one. The
 * cluster is the fight; the observation is its mean.
 */
function clusteredStderr(obs: Obs[], pick: (o: Obs) => number = o => o.value): { mean: number; stderr: number; clusters: number } {
  const byFight = new Map<number, number[]>();
  for (const o of obs) byFight.set(o.fight, [...(byFight.get(o.fight) ?? []), pick(o)]);
  const means = [...byFight.values()].map(v => v.reduce((a, b) => a + b, 0) / v.length);
  const n = means.length;
  const mean = means.reduce((a, b) => a + b, 0) / Math.max(1, n);
  if (n < 2) return { mean, stderr: Infinity, clusters: n };
  const variance = means.reduce((s, m) => s + (m - mean) ** 2, 0) / (n - 1);
  return { mean, stderr: Math.sqrt(variance / n), clusters: n };
}

function report(skillId: string, cards: ActionDefinition[]): void {
  const { obs, positions, fights } = measure(skillId);
  console.log(`\n━━ ${skillId} · ${fights} combats · ${positions} decisions valorades ━━`);
  console.log('  carta                     valor (PV)   valor (victòria)   millor opció   cops legal');

  const rows = cards.map(c => {
    const list = obs.get(c.id) ?? [];
    const { mean, stderr: se, clusters } = clusteredStderr(list);
    const best = list.length
      ? list.reduce((a, o) => a + o.vsBest, 0) / list.length
      : 0;
    const w = clusteredStderr(list, o => o.win);
    const bestCount = list.reduce((a, o) => a + o.best, 0);
    return { c, mean, se, clusters, best, bestCount, n: list.length, win: w.mean, winSe: w.stderr };
  }).sort((a, b) => b.mean - a.mean);

  for (const r of rows) {
    if (!r.n) { console.log(`  ${r.c.name.padEnd(24)} mai legal`); continue; }
    const sig = r.mean - 2 * r.se > 0 ? ' ✅' : r.mean + 2 * r.se < 0 ? ' ❌' : '';
    console.log(
      `  ${r.c.name.padEnd(24)} ${r.mean.toFixed(2).padStart(6)}±${(r.se * 2).toFixed(2).padStart(5)}`
      + `   ${pp(r.win).padStart(8)}±${(r.winSe * 200).toFixed(1).padStart(4)}`
      + `   ${share(r.bestCount, r.n)}   ${String(r.n).padStart(6)}${sig}`,
    );
  }
  // THE SURROGATE CHECK. PV differential is used because a win/loss bit throws
  // away every magnitude, but it is only legitimate if it agrees with winning.
  // Spearman over the kit's cards, printed every run so it cannot quietly stop
  // being true as content changes.
  const rank = (xs: number[]): number[] => {
    const order = xs.map((x, i) => [x, i] as const).sort((a, b) => a[0] - b[0]);
    const r = new Array(xs.length).fill(0);
    order.forEach(([, i], k) => { r[i] = k; });
    return r;
  };
  const scored = rows.filter(r => r.n > 0);
  if (scored.length >= 3) {
    const a = rank(scored.map(r => r.mean)), b = rank(scored.map(r => r.win));
    const n = a.length;
    const d2 = a.reduce((s2, x, i) => s2 + (x - b[i]) ** 2, 0);
    const rho = 1 - (6 * d2) / (n * (n * n - 1));
    console.log(`  [PV vs victòria: Spearman ρ=${rho.toFixed(2)} sobre ${n} cartes — si baixa, el substitut ha deixat de valer]`);
  }
  // The null for "millor opció" is 1/k, not 0: with k noisy candidates a card
  // takes the top spot by luck about one time in k. A card clearly UNDER its
  // own null is one the game never wants played.
  const k = Math.max(2, Math.round(scored.reduce((a, r) => a + r.n, 0) / Math.max(1, positions)));
  console.log(`  [valor = PV meu − PV seu, contra l'alternativa MITJANA — RANKING dins la mà, suma ~0; no diu "dolenta"]`);
  console.log(`  ["millor opció" = cops que va ser la millor jugada. L'atzar sol en dóna ~${exact(1 / k)} (${k} cartes/posició); molt per sota = mai val la pena]`);
}

const only = flag('--player');
const kits = only ? ALL_SKILLS.filter(s => s.id === only) : MAIN_KITS;
if (!kits.length) { console.log(`cap kit '${only}'`); } else {
  console.log(`valor per decisió · ${GAMES} combats/kit · rollouts a profunditat ${OPTS.rolloutDepth}`);
  for (const k of kits) report(k.id, k.actions);
}
