import { describe, it, expect } from 'vitest';
import { CombatEngine, assignStrategies, AIStrategy } from '@pimpampum/engine';
import { ENEMY_TEMPLATES, generateEncounter, createEnemyFromTemplate, getEnemyTemplate } from '@pimpampum/enemies';
import { REGISTRY, randomTeam } from './helpers.js';

/**
 * Balancer v2 calibration guard: an encounter the solver prices for a target
 * winrate must land near its prediction in simulation. Tolerance covers
 * sampling noise (~±8pp at 160 games, 95% CI) plus known model error — the
 * worst case is per-kit count-exponent variance on drift-path configs (weak
 * elits fielded above their probe count, e.g. spined-devil ×4). Overall
 * calibration quality is guarded more tightly by model-accuracy.test.ts.
 */
const GAMES = 160;
const TOLERANCE = 0.20;

function simulate(templateId: string, count: number, level: number, pv: number, players: number): number {
  const template = getEnemyTemplate(templateId)!;
  let wins = 0;
  for (let i = 0; i < GAMES; i++) {
    const party = randomTeam('P', players, 7);
    const enemies = Array.from({ length: count }, (_, k) =>
      createEnemyFromTemplate(template, Object.fromEntries(template.skills.map(s => [s, level])), `${template.displayName} ${k + 1}`, [], pv));
    assignStrategies(party, [AIStrategy.Power, AIStrategy.Aggro, AIStrategy.Protect]);
    const w = new CombatEngine(party, enemies, { registry: REGISTRY, maxRounds: 40 }).runCombat().winner;
    if (w === 0) wins++;
    else if (w === null) wins += 0.5;
  }
  return wins / GAMES;
}

describe('balancer v2 calibration', () => {
  for (const t of ENEMY_TEMPLATES) {
    it(`${t.id}: solved encounters land near their promised winrate`, () => {
      for (const target of [0.5, 0.75]) {
        const gen = generateEncounter(t, 4, target);
        expect(gen).toBeTruthy();
        const g = gen!.groups[0];
        const real = simulate(g.templateId, g.count, g.level, g.pv, 4);
        expect(
          Math.abs(real - gen!.predictedWinrate),
          `${t.id} target ${target}: promised ${(100 * gen!.predictedWinrate).toFixed(0)}%, real ${(100 * real).toFixed(0)}% (${g.count}× pv${g.pv})`,
        ).toBeLessThan(TOLERANCE);
      }
    });
  }
});
