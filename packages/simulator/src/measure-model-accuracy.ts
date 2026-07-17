/**
 * Model-accuracy sweep: generate many random battle setups (mixed species,
 * varied counts/levels/PV/party sizes), simulate each repeatedly, and score
 * candidate threat models against the real winrates.
 *
 * Candidates: the per-group aggregation (old) and the shared-economy β-norm
 * (current) at β ∈ {2.0, 2.2, 2.5}. All agree exactly on the single-species
 * probe measurements; they differ on mixed comps and off-probe counts.
 *
 * Run: pnpm --filter @pimpampum/simulator exec tsx src/measure-model-accuracy.ts
 */
import { CombatEngine, assignStrategies, AIStrategy } from '@pimpampum/engine';
import {
  ENEMY_TEMPLATES, createEnemyFromTemplate, getEnemyTemplate,
  levelFactor, partyStrength, WINRATE_K, ROLE_COUNT,
} from '@pimpampum/enemies';
import { REGISTRY, randomTeam, randInt, shuffle } from './tests/helpers.js';

const SETUPS = 60;
const GAMES = 150;
const PROBE: Record<string, number> = { horda: 6, elit: 3, solitari: 1 };

interface Group { templateId: string; count: number; level: number; pv: number }
interface Setup { players: number; groups: Group[] }

function randomSetup(): Setup {
  const players = randInt(3, 6);
  const nSpecies = randInt(1, 3);
  const species = shuffle([...ENEMY_TEMPLATES]).slice(0, nSpecies);
  const groups: Group[] = species.map(t => {
    const [lo, hi] = ROLE_COUNT[t.role];
    // Bias counts low so mixed totals stay sane; lone stragglers included.
    const count = Math.max(1, Math.min(hi, randInt(1, Math.min(hi, lo + 2))));
    const level = Math.random() < 0.5 ? t.suggestedLevel : randInt(1, t.suggestedLevel);
    const pvMult = 0.6 + Math.random() * 1.6;
    return { templateId: t.id, count, level, pv: Math.max(2, Math.round(t.basePV * pvMult)) };
  });
  return { players, groups };
}

function realWinrate(s: Setup): number {
  let wins = 0;
  for (let i = 0; i < GAMES; i++) {
    const party = randomTeam('P', s.players, 7);
    const enemies = s.groups.flatMap(g => {
      const t = getEnemyTemplate(g.templateId)!;
      return Array.from({ length: g.count }, (_, k) =>
        createEnemyFromTemplate(t, Object.fromEntries(t.skills.map(sk => [sk, g.level])), `${t.displayName} ${k}`, [], g.pv));
    });
    assignStrategies(party, [AIStrategy.Power, AIStrategy.Aggro, AIStrategy.Protect]);
    const w = new CombatEngine(party, enemies, { registry: REGISTRY, maxRounds: 40 }).runCombat().winner;
    if (w === 0) wins++; else if (w === null) wins += 0.5;
  }
  return wins / GAMES;
}

function predict(s: Setup, beta: number, shared: boolean): number {
  let total = 0, eff = 0;
  for (const g of s.groups) {
    const t = getEnemyTemplate(g.templateId)!;
    const probe = PROBE[t.role];
    const lambda = g.pv / t.basePV;
    const u = t.threat * levelFactor(g.level, t.suggestedLevel) * Math.pow(probe, 1 - beta);
    if (shared) eff += g.count * Math.pow(u * lambda, 1 / beta);
    else total += u * lambda * Math.pow(g.count, beta);
  }
  const threat = shared ? Math.pow(eff, beta) : total;
  return 1 / (1 + Math.exp(WINRATE_K * (threat / partyStrength(s.players) - 1)));
}

const MODELS: { name: string; beta: number; shared: boolean }[] = [
  { name: 'per-group β2.5', beta: 2.5, shared: false },
  { name: 'shared β2.0 ', beta: 2.0, shared: true },
  { name: 'shared β2.2 ', beta: 2.2, shared: true },
  { name: 'shared β2.5 ', beta: 2.5, shared: true },
];

const rows: { s: Setup; real: number; preds: number[] }[] = [];
for (let i = 0; i < SETUPS; i++) {
  const s = randomSetup();
  const real = realWinrate(s);
  const preds = MODELS.map(m => predict(s, m.beta, m.shared));
  rows.push({ s, real, preds });
  const desc = s.groups.map(g => `${g.count}×${g.templateId.slice(0, 8)}(L${g.level},pv${g.pv})`).join('+');
  console.log(`${String(i + 1).padStart(2)}. ${s.players}p vs ${desc.padEnd(58)} real ${(100 * real).toFixed(0).padStart(3)}%  ${MODELS.map((m, j) => `${m.name.trim().slice(0, 12)} ${(100 * rows[i].preds[j]).toFixed(0).padStart(3)}%`).join('  ')}`);
}

console.log('\n=== SCORES (winrate error, percentage points) ===');
MODELS.forEach((m, j) => {
  const errs = rows.map(r => Math.abs(r.preds[j] - r.real));
  const bias = rows.reduce((s, r) => s + (r.preds[j] - r.real), 0) / rows.length;
  const mae = errs.reduce((s, e) => s + e, 0) / errs.length;
  const max = Math.max(...errs);
  const mixed = rows.filter(r => r.s.groups.length > 1);
  const maeMixed = mixed.reduce((s, r) => s + Math.abs(r.preds[j] - r.real), 0) / mixed.length;
  const single = rows.filter(r => r.s.groups.length === 1);
  const maeSingle = single.reduce((s, r) => s + Math.abs(r.preds[j] - r.real), 0) / single.length;
  console.log(`${m.name}  MAE ${(100 * mae).toFixed(1)}pp (single ${(100 * maeSingle).toFixed(1)}, mixed ${(100 * maeMixed).toFixed(1)})  bias ${(100 * bias).toFixed(1)}pp  max ${(100 * max).toFixed(1)}pp`);
});
