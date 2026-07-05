/**
 * h-curve prototype (2026-07): measure how enemy LEVEL trades against PV.
 *
 * The encounter model prices threat as pv × difficulty, ignoring level; that
 * only works because level and PV are locked on pv = level²/42. A two-factor
 * model — score = pv × difficulty × h(Δ), Δ = enemy level − party avg top —
 * needs the h curve measured. Method, per species and per Δ: field the kit at
 * level avgTop+Δ but with PV DECOUPLED (overridden), sweep total enemy PV as a
 * multiplier m of the model's even-fight expectation (evenTarget/difficulty),
 * and find the m where players win 50% (m50, logit fit over the sweep).
 * Then h(Δ) ∝ 1/m50(Δ), normalized at Δ=0.
 *
 * Caveat: h(Δ) folds in BOTH contest accuracy and the kit's action unlocks at
 * that level — that's intended (it's the real threat-vs-level curve), but it
 * makes h species-shaped, not universal.
 *
 * Run: pnpm --filter @pimpampum/simulator exec tsx src/h-curve.ts [--games N]
 */
import { CombatEngine, assignStrategies, AIStrategy, Character } from '@pimpampum/engine';
import {
  EnemyTemplate, createEnemyFromTemplate, getEnemyTemplate, evenTarget, solveEncounter,
} from '@pimpampum/enemies';
import { REGISTRY, randomTeam, shuffle } from './tests/helpers.js';

const STRATS = [AIStrategy.Power, AIStrategy.Aggro, AIStrategy.Protect];

const PLAYER_COUNT = 4;
const PLAYER_BUDGET = 45; // benchmark party: top skill ≈ 40
const DELTAS = [-20, -15, -10, -5, 0, 5, 10, 15, 20];
const MULTS = [0.35, 0.5, 0.7, 1.0, 1.4, 2.0, 2.8];

/** Species to probe, with a fixed role-typical body count. */
const PROBES: { id: string; count: number }[] = [
  { id: 'goblin', count: 6 },
  { id: 'spined-devil', count: 3 },
];

const gamesArg = process.argv.indexOf('--games');
const GAMES = gamesArg >= 0 ? Number(process.argv[gamesArg + 1]) : 60;

const topLevel = (c: Character) => Math.max(...c.skills.values());
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const logit = (p: number) => Math.log(p / (1 - p));

interface SweepPoint { m: number; winrate: number; games: number; avgLevel: number; avgPerBodyPV: number }

/** One (species, Δ, m) cell: fresh random party per game, enemy level pegged
 *  to that party's avg top + Δ, total PV = m × evenTarget/difficulty. */
function sweepCell(template: EnemyTemplate, count: number, delta: number, m: number, games: number): SweepPoint {
  let wins = 0, lvlAcc = 0, pvAcc = 0;
  for (let i = 0; i < games; i++) {
    const players = randomTeam('P', PLAYER_COUNT, PLAYER_BUDGET);
    const tops = players.map(topLevel);
    const avgTop = tops.reduce((s, v) => s + v, 0) / tops.length;
    const level = clamp(Math.round(avgTop + delta), 5, 95);
    const totalPV = m * evenTarget(tops) / template.difficulty;
    const perBody = Math.max(2, Math.round(totalPV / count));
    const enemies = Array.from({ length: count }, (_, k) => {
      const e = createEnemyFromTemplate(template, Object.fromEntries(template.skills.map(s => [s, level])), `${template.displayName} ${k}`);
      e.maxPV = perBody;
      e.currentPV = perBody;
      return e;
    });
    assignStrategies(players, shuffle(STRATS));
    const w = new CombatEngine(players, enemies, { registry: REGISTRY, maxRounds: 40 }).runCombat().winner;
    wins += w === 0 ? 1 : w === null ? 0.5 : 0;
    lvlAcc += level;
    pvAcc += perBody;
  }
  return { m, winrate: wins / games, games, avgLevel: lvlAcc / games, avgPerBodyPV: pvAcc / games };
}

/** 50%-crossing of winrate vs m: least-squares logit(p) = a + b·ln(m), with a
 *  straddling-pair log-interpolation fallback when the fit is degenerate. */
function findM50(points: SweepPoint[]): { m50: number | null; note: string } {
  const usable = points
    .filter(pt => pt.winrate > 0.03 && pt.winrate < 0.97)
    .map(pt => ({ x: Math.log(pt.m), y: logit(clamp(pt.winrate, 0.02, 0.98)) }));
  if (usable.length >= 2) {
    const n = usable.length;
    const sx = usable.reduce((s, p) => s + p.x, 0), sy = usable.reduce((s, p) => s + p.y, 0);
    const sxx = usable.reduce((s, p) => s + p.x * p.x, 0), sxy = usable.reduce((s, p) => s + p.x * p.y, 0);
    const b = (n * sxy - sx * sy) / (n * sxx - sx * sx);
    const a = (sy - b * sx) / n;
    if (b < -0.1) return { m50: Math.exp(-a / b), note: 'fit' };
  }
  // Fallback: adjacent pair straddling 0.5.
  for (let i = 0; i + 1 < points.length; i++) {
    const lo = points[i], hi = points[i + 1];
    if (lo.winrate >= 0.5 && hi.winrate < 0.5) {
      const t = (logit(clamp(lo.winrate, 0.02, 0.98)) - 0) /
                (logit(clamp(lo.winrate, 0.02, 0.98)) - logit(clamp(hi.winrate, 0.02, 0.98)));
      return { m50: Math.exp(Math.log(lo.m) + t * (Math.log(hi.m) - Math.log(lo.m))), note: 'interp' };
    }
  }
  const avg = points.reduce((s, p) => s + p.winrate, 0) / points.length;
  return { m50: null, note: avg > 0.5 ? `>${MULTS[MULTS.length - 1]}` : `<${MULTS[0]}` };
}

function fmt(v: number | null, digits = 2): string {
  return v === null ? '  —  ' : v.toFixed(digits).padStart(5);
}

for (const probe of PROBES) {
  const template = getEnemyTemplate(probe.id)!;

  // Context: where does the CURRENT model operate for this composition?
  const refTops = Array.from({ length: PLAYER_COUNT }, () => 40);
  const current = solveEncounter([{ template, count: probe.count }], refTops, 0.5).groups[0];

  console.log(`\n=== ${template.displayName} ×${probe.count} (difficulty ${template.difficulty}, suggested level ${template.suggestedLevel}) ===`);
  console.log(`Party: ${PLAYER_COUNT} players, budget ${PLAYER_BUDGET} (top ≈ 40). ${GAMES} games/cell.`);
  console.log(`Current model would field: level ${current.level} (Δ ≈ ${current.level - 40}), ${current.pv} PV/body.\n`);

  const rows: { delta: number; m50: number | null; note: string; avgLevel: number; pv50: number | null }[] = [];
  for (const delta of DELTAS) {
    const points = MULTS.map(m => sweepCell(template, probe.count, delta, m, GAMES));
    const { m50, note } = findM50(points);
    const avgLevel = points.reduce((s, p) => s + p.avgLevel, 0) / points.length;
    // Per-body PV at the 50% crossing, for a top-40 party (target evenTarget(refTops)).
    const pv50 = m50 === null ? null : (m50 * evenTarget(refTops) / template.difficulty) / probe.count;
    rows.push({ delta, m50, note, avgLevel, pv50 });
    const sweep = points.map(p => `${p.m}:${(p.winrate * 100).toFixed(0)}%`).join(' ');
    console.error(`  Δ=${String(delta).padStart(3)} done  [${sweep}]`);
  }

  const base = rows.find(r => r.delta === 0)?.m50 ?? null;
  console.log('    Δ  ~level    m50   PV50/body   h(Δ)');
  for (const r of rows) {
    const h = base !== null && r.m50 !== null ? base / r.m50 : null;
    console.log(
      `  ${String(r.delta).padStart(3)}   ${r.avgLevel.toFixed(0).padStart(4)}  ${fmt(r.m50)}${r.m50 === null ? `(${r.note})` : '      '}` +
      ` ${fmt(r.pv50, 1)}      ${fmt(h)}`,
    );
  }
  console.log('  (h normalized at Δ=0; h(Δ) = m50(0)/m50(Δ) = threat per PV point vs Δ=0)');
}
