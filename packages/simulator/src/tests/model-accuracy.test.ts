import { describe, it, expect } from 'vitest';
import { CombatEngine, assignStrategies, AIStrategy } from '@pimpampum/engine';
import { predictEncounter, createEnemyFromTemplate, getEnemyTemplate, FieldedGroup } from '@pimpampum/enemies';
import { REGISTRY, randomTeam } from './helpers.js';

/**
 * Model-accuracy guard: the balancer's winrate prediction must stay calibrated
 * against reality across a FIXED, diverse set of battle setups (single-species
 * anchors, mixed compositions, reduced levels, off-baseline PV, all party
 * sizes). Bounds cover sampling noise (~±9pp at 120 games) plus the model's
 * measured error (2026-07-18 re-measure after the kit re-ordering pass:
 * shared-economy β2.0 MAE 11.5pp — still the best candidate — but with a
 * known ~−8pp bias on MIXED comps, i.e. it overprices cross-species threat).
 * Full sweep: measure-model-accuracy.ts.
 */
const GAMES = 120;
const MAX_SETUP_ERROR = 0.35;
const MAX_MEAN_ERROR = 0.15;

/** `budget` = per-player skill-level budget (default: the calibration
 *  reference 7). Off-reference budgets exercise playerLevelFactor. */
interface Setup { name: string; players: number; groups: FieldedGroup[]; budget?: number }

const SETUPS: Setup[] = [
  { name: 'goblin probe anchor', players: 4, groups: [{ templateId: 'goblin', count: 6, pv: 8 }] },
  { name: 'basilisc alone', players: 4, groups: [{ templateId: 'basilisk', count: 1, pv: 63 }] },
  { name: 'basilisc + 1 goblin', players: 4, groups: [{ templateId: 'basilisk', count: 1, pv: 62 }, { templateId: 'goblin', count: 1, pv: 9 }] },
  { name: 'basilisc + 3 goblins', players: 4, groups: [{ templateId: 'basilisk', count: 1, pv: 43 }, { templateId: 'goblin', count: 3, pv: 6 }] },
  { name: 'wolf pack vs 3p', players: 3, groups: [{ templateId: 'wolf', count: 5, pv: 5 }] },
  { name: 'golems vs 5p', players: 5, groups: [{ templateId: 'stone-golem', count: 3, pv: 17 }] },
  { name: 'spined + goblins', players: 4, groups: [{ templateId: 'spined-devil', count: 3, pv: 21 }, { templateId: 'goblin', count: 3, pv: 6 }] },
  { name: 'big horde vs 6p', players: 6, groups: [{ templateId: 'goblin', count: 8, pv: 7 }] },
  { name: 'twin horned devils', players: 4, groups: [{ templateId: 'horned-devil', count: 2, pv: 20 }] },
  { name: 'bone devils at level 2', players: 4, groups: [{ templateId: 'bone-devil', count: 4, level: 2, pv: 20 }] },
  { name: 'horned + wolf escort', players: 5, groups: [{ templateId: 'horned-devil', count: 1, pv: 60 }, { templateId: 'wolf', count: 6, pv: 4 }] },
  { name: 'shaman trio vs 3p', players: 3, groups: [{ templateId: 'goblin-shaman', count: 3, pv: 18 }] },
  { name: 'young goblins (level 2)', players: 4, groups: [{ templateId: 'goblin', count: 6, level: 2, pv: 8 }] },
  { name: 'golems + goblins vs 6p', players: 6, groups: [{ templateId: 'stone-golem', count: 2, pv: 25 }, { templateId: 'goblin', count: 4, pv: 8 }] },
  { name: 'goblins vs young party (3 lvls/p)', players: 4, budget: 3, groups: [{ templateId: 'goblin', count: 6, pv: 8 }] },
  { name: 'spined devils vs apprentices (5 lvls/p)', players: 4, budget: 5, groups: [{ templateId: 'spined-devil', count: 3, pv: 24 }] },
];

function realWinrate(s: Setup): number {
  let wins = 0;
  for (let i = 0; i < GAMES; i++) {
    const party = randomTeam('P', s.players, s.budget ?? 7);
    const enemies = s.groups.flatMap(g => {
      const t = getEnemyTemplate(g.templateId)!;
      const levels = Object.fromEntries(t.skills.map(sk => [sk, g.level ?? t.suggestedLevel]));
      return Array.from({ length: g.count }, (_, k) =>
        createEnemyFromTemplate(t, levels, `${t.displayName} ${k}`, [], g.pv));
    });
    assignStrategies(party, [AIStrategy.Power, AIStrategy.Aggro, AIStrategy.Protect]);
    const w = new CombatEngine(party, enemies, { registry: REGISTRY, maxRounds: 40 }).runCombat().winner;
    if (w === 0) wins++;
    else if (w === null) wins += 0.5;
  }
  return wins / GAMES;
}

describe('balancer model accuracy', () => {
  it('predictions stay calibrated across diverse fixed setups', () => {
    const errors: string[] = [];
    let totalErr = 0;
    for (const s of SETUPS) {
      const predicted = predictEncounter(
        s.groups, s.players,
        s.budget !== undefined ? Array(s.players).fill(s.budget) : undefined);
      const real = realWinrate(s);
      const err = Math.abs(predicted - real);
      totalErr += err;
      errors.push(`${s.name}: predicted ${(100 * predicted).toFixed(0)}%, real ${(100 * real).toFixed(0)}% (err ${(100 * err).toFixed(0)}pp)`);
      expect(err, errors[errors.length - 1]).toBeLessThan(MAX_SETUP_ERROR);
    }
    const mae = totalErr / SETUPS.length;
    expect(mae, `MAE ${(100 * mae).toFixed(1)}pp\n${errors.join('\n')}`).toBeLessThan(MAX_MEAN_ERROR);
  });
});
