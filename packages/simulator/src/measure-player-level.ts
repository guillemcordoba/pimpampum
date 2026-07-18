/**
 * Player-level factor measurement (balancer input: per-player skill levels).
 *
 * The balancer's party strength S(n) was calibrated against parties of
 * PLAYER_BUDGET = 7 ordinal levels each. This script sweeps that budget:
 * for each per-player budget b, fight calibrated probe packs on a PV
 * multiplier λ ladder, logit-fit λ50, and derive the party's implied
 * strength S(b) = λ50(b)/λ50(7). With a uniform 4-player party,
 * S = g(b)^PARTY_ALPHA, so the per-player factor is g(b) = S^(1/α).
 *
 * randomPlayer clamps budgets to kit sizes, so the fit x-axis uses the
 * MEAN ACTUAL levels of the built players, not the nominal budget.
 *
 * Run: cd packages/simulator && pnpm exec tsx src/measure-player-level.ts
 */
import { CombatEngine, assignStrategies, AIStrategy, Character } from '@pimpampum/engine';
import { ENEMY_TEMPLATES, createEnemyFromTemplate, EnemyTemplate, PARTY_ALPHA } from '@pimpampum/enemies';
import { REGISTRY, randomTeam } from './tests/helpers.js';

const GAMES = 120;
const LADDER = [0.25, 0.5, 1, 2, 4, 8, 16];
const BUDGETS = [2, 3, 5, 7, 9, 11, 13];
const REF_BUDGET = 7;
const PROBES: { id: string; count: number }[] = [
  { id: 'goblin', count: 6 },
  { id: 'bone-devil', count: 3 },
];

function actualLevels(party: Character[]): number {
  return party.reduce((s, c) => {
    let sum = 0;
    for (const [id, lvl] of c.skills) if (id !== 'desesperacio') sum += lvl;
    return s + sum;
  }, 0) / party.length;
}

function winrate(template: EnemyTemplate, count: number, lambda: number, budget: number, levelsAcc: number[]): number {
  let wins = 0;
  for (let i = 0; i < GAMES; i++) {
    const party = randomTeam('P', 4, budget);
    levelsAcc.push(actualLevels(party));
    const pv = Math.max(2, Math.round(template.basePV * lambda));
    const enemies = Array.from({ length: count }, (_, k) =>
      createEnemyFromTemplate(template, {}, `${template.displayName} ${k + 1}`, [], pv));
    assignStrategies(party, [AIStrategy.Power, AIStrategy.Aggro, AIStrategy.Protect]);
    const engine = new CombatEngine(party, enemies, { registry: REGISTRY, maxRounds: 40 });
    const w = engine.runCombat().winner;
    if (w === 0) wins++;
    else if (w === null) wins += 0.5;
  }
  return wins / GAMES;
}

/** Adaptive λ sweep + logit fit → λ50, or null when unbracketable. */
function fit(template: EnemyTemplate, count: number, budget: number, levelsAcc: number[]): number | null {
  const pts: { x: number; w: number }[] = [];
  const cells: string[] = [];
  let sawHigh = false, sawLow = false;
  for (const l of LADDER) {
    const w = winrate(template, count, l, budget, levelsAcc);
    cells.push(`λ${l}:${(100 * w).toFixed(0)}%`);
    pts.push({ x: Math.log(l), w });
    if (w >= 0.6) sawHigh = true;
    if (w <= 0.4) sawLow = true;
    if (sawHigh && w <= 0.25) break;
  }
  const label = `   b${String(budget).padEnd(2)} ${template.id.padEnd(11)} ×${count}  ${cells.join(' ')}`;
  if (!sawHigh || !sawLow) {
    console.log(`${label}  → UNBRACKETABLE`);
    return null;
  }
  const usable = pts.filter(p => p.w > 0.03 && p.w < 0.97)
    .map(p => ({ x: p.x, y: Math.log(p.w / (1 - p.w)) }));
  const n = usable.length;
  const mx = usable.reduce((s, p) => s + p.x, 0) / n;
  const my = usable.reduce((s, p) => s + p.y, 0) / n;
  const b = usable.reduce((s, p) => s + (p.x - mx) * (p.y - my), 0)
    / usable.reduce((s, p) => s + (p.x - mx) ** 2, 0);
  const c = my - b * mx;
  const l50 = Math.exp(-c / b);
  console.log(`${label}  → λ50 ${l50.toFixed(2)}`);
  return l50;
}

interface Row { budget: number; meanLevels: number; l50: Record<string, number> }
const rows: Row[] = [];
for (const budget of BUDGETS) {
  const levelsAcc: number[] = [];
  const l50: Record<string, number> = {};
  for (const p of PROBES) {
    const t = ENEMY_TEMPLATES.find(x => x.id === p.id)!;
    const r = fit(t, p.count, budget, levelsAcc);
    if (r) l50[p.id] = r;
  }
  const meanLevels = levelsAcc.reduce((a, b) => a + b, 0) / levelsAcc.length;
  rows.push({ budget, meanLevels, l50 });
}

const ref = rows.find(r => r.budget === REF_BUDGET)!;
console.log('\n=== IMPLIED PER-PLAYER FACTOR g (ref: budget 7 ≡ 1) ===');
console.log('budget  levels/player   S(goblin)  S(bone)   S(mean)   g = S^(1/α)');
const samples: { x: number; g: number }[] = [];
for (const r of rows) {
  const ss = PROBES.map(p => (r.l50[p.id] && ref.l50[p.id]) ? r.l50[p.id] / ref.l50[p.id] : null)
    .filter((s): s is number => s !== null);
  if (ss.length === 0) continue;
  const sMean = Math.exp(ss.reduce((a, s) => a + Math.log(s), 0) / ss.length);
  const g = Math.pow(sMean, 1 / PARTY_ALPHA);
  samples.push({ x: r.meanLevels, g });
  const cols = PROBES.map(p => {
    const s = (r.l50[p.id] && ref.l50[p.id]) ? (r.l50[p.id] / ref.l50[p.id]).toFixed(2) : '—';
    return s.padStart(8);
  }).join(' ');
  console.log(`  ${String(r.budget).padEnd(5)} ${r.meanLevels.toFixed(1).padStart(6)}       ${cols}  ${sMean.toFixed(2).padStart(7)}   ${g.toFixed(2).padStart(6)}`);
}

// Candidate fits for g(x), x = mean levels/player, anchored at g(ref)=1.
const refX = ref.meanLevels;
console.log(`\n(reference actual levels/player at budget 7: ${refX.toFixed(1)})`);
function rmse(pred: (x: number) => number): number {
  return Math.sqrt(samples.reduce((s, p) => s + (Math.log(pred(p.x)) - Math.log(p.g)) ** 2, 0) / samples.length);
}
let bestGamma = 1, bestErr = Infinity;
for (let gamma = 0.1; gamma <= 2.01; gamma += 0.05) {
  const err = rmse(x => Math.pow(x / refX, gamma));
  if (err < bestErr) { bestErr = err; bestGamma = gamma; }
}
console.log(`power fit   g = (levels/${refX.toFixed(1)})^γ:  γ = ${bestGamma.toFixed(2)}  (log-RMSE ${bestErr.toFixed(3)})`);
let bestA = 0, bestErrA = Infinity;
for (let a = 0; a <= 0.9; a += 0.05) {
  const err = rmse(x => Math.max(0.1, a + (1 - a) * (x / refX)));
  if (err < bestErrA) { bestErrA = err; bestA = a; }
}
console.log(`affine fit  g = ${bestA.toFixed(2)} + ${(1 - bestA).toFixed(2)}·(levels/${refX.toFixed(1)}):  (log-RMSE ${bestErrA.toFixed(3)})`);
