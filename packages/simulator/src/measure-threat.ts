/**
 * Threat measurement for the encounter-balancer rebuild (2026-07).
 *
 * Per template: field a fixed role-sized pack against a standard party and
 * sweep a PV multiplier λ on an ADAPTIVE geometric ladder until the 50%
 * winrate point is bracketed; logit-fit winrate vs ln λ on the bracketed
 * points to find λ50. Threat per body at printed basePV: T = 1/(count·λ50)
 * with the 4-player party strength S4 ≡ 1. Goblin probes against 3/5/6
 * players measure party strength per player count.
 *
 * Run: pnpm --filter @pimpampum/simulator exec tsx src/measure-threat.ts
 */
import { CombatEngine, assignStrategies, AIStrategy } from '@pimpampum/engine';
import { ENEMY_TEMPLATES, createEnemyFromTemplate, EnemyTemplate } from '@pimpampum/enemies';
import { REGISTRY, randomTeam } from './tests/helpers.js';

const GAMES = 120;
const LADDER = [0.5, 1, 2, 4, 8, 16, 32];
const PROBE_COUNT: Record<string, number> = { horda: 6, elit: 3, solitari: 1 };
const PLAYER_BUDGET = 7;

function winrate(template: EnemyTemplate, count: number, lambda: number, players: number, level?: number): number {
  let wins = 0;
  for (let i = 0; i < GAMES; i++) {
    const party = randomTeam('P', players, PLAYER_BUDGET);
    const pv = Math.max(2, Math.round(template.basePV * lambda));
    const levels = level !== undefined
      ? Object.fromEntries(template.skills.map(s => [s, level]))
      : {};
    const enemies = Array.from({ length: count }, (_, k) =>
      createEnemyFromTemplate(template, levels, `${template.displayName} ${k + 1}`, [], pv));
    assignStrategies(party, [AIStrategy.Power, AIStrategy.Aggro, AIStrategy.Protect]);
    const engine = new CombatEngine(party, enemies, { registry: REGISTRY, maxRounds: 40 });
    const w = engine.runCombat().winner;
    if (w === 0) wins++;
    else if (w === null) wins += 0.5;
  }
  return wins / GAMES;
}

/** Adaptive sweep + logit fit. Returns λ50 and slope k, or null if unbracketable. */
function fit(template: EnemyTemplate, count: number, players: number, level?: number): { l50: number; k: number } | null {
  const pts: { x: number; w: number }[] = [];
  const cells: string[] = [];
  let sawHigh = false, sawLow = false;
  for (const l of LADDER) {
    const w = winrate(template, count, l, players, level);
    cells.push(`λ${l}:${(100 * w).toFixed(0)}%`);
    pts.push({ x: Math.log(l), w });
    if (w >= 0.6) sawHigh = true;
    if (w <= 0.4) sawLow = true;
    if (sawHigh && w <= 0.25) break; // bracketed with margin — stop early
  }
  const lvl = level !== undefined ? ` L${level}` : '';
  const label = `   ${template.id.padEnd(14)} ×${count}${lvl} vs ${players}p  ${cells.join(' ')}`;
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
  console.log(`${label}  → λ50 ${l50.toFixed(2)}  k ${(-b).toFixed(2)}`);
  return { l50, k: -b };
}

console.log('Per-template threat (4 players):');
const results: Record<string, { count: number; l50: number; k: number }> = {};
for (const t of ENEMY_TEMPLATES) {
  const count = PROBE_COUNT[t.role];
  const r = fit(t, count, 4);
  if (r) results[t.id] = { count, ...r };
}

// Party strength via FIXED-count probes: always the goblin probe count (6),
// only the PV ladder moves — S(n) = λ50(n)/λ50(4) is PV-linear and free of
// β count-scaling contamination (the old drifted-count probes were not).
console.log('\nParty strength (fixed 6-goblin probes):');
const goblin = ENEMY_TEMPLATES.find(t => t.id === 'goblin')!;
const partyProbe: Record<number, { l50: number }> = {};
for (const n of [3, 5, 6]) {
  const r = fit(goblin, PROBE_COUNT[goblin.role], n);
  if (r) partyProbe[n] = { l50: r.l50 };
}

console.log('\nLevel discount (reduced kits, threat multiplier vs full):');
const levelProbes: { id: string; level: number; kit: number }[] = [
  { id: 'goblin', level: 3, kit: 4 },
  { id: 'goblin', level: 2, kit: 4 },
  { id: 'stone-golem', level: 3, kit: 4 },
  { id: 'basilisk', level: 3, kit: 5 },
];
const discounts: { frac: number; f: number }[] = [];
for (const p of levelProbes) {
  const t = ENEMY_TEMPLATES.find(x => x.id === p.id)!;
  const r = fit(t, PROBE_COUNT[t.role], 4, p.level);
  if (r && results[p.id]) {
    const f = results[p.id].l50 / r.l50; // threat multiplier of the reduced kit
    discounts.push({ frac: p.level / p.kit, f });
    console.log(`   ${p.id} L${p.level}/${p.kit}: threat ×${f.toFixed(2)}`);
  }
}

console.log('\n=== MEASURED CONSTANTS ===');
console.log('threat per body at basePV (S4 ≡ 1, T = 1/(count·λ50)):');
for (const [id, r] of Object.entries(results)) {
  console.log(`  ${id.padEnd(14)} T = ${(1 / (r.count * r.l50)).toFixed(3)}  (probe ×${r.count}, λ50 ${r.l50.toFixed(2)})`);
}
console.log('party strength S(n) = λ50(n)/λ50(4) (fixed-count probes):');
for (const [n, p] of Object.entries(partyProbe)) {
  console.log(`  S(${n}) = ${(p.l50 / results['goblin'].l50).toFixed(2)}`);
}
const ks = Object.values(results).map(r => r.k).sort((a, b) => a - b);
console.log(`k (winrate steepness): [${ks.map(k => k.toFixed(1)).join(', ')}], median ${ks[Math.floor(ks.length / 2)].toFixed(2)}`);
