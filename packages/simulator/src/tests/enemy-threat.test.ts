import { describe, it, expect } from 'vitest';
import { CombatEngine, assignStrategies, AIStrategy } from '@pimpampum/engine';
import { ENEMY_TEMPLATES, generateEncounter, solveEncounter, buildSolvedEncounter, createEnemyFromTemplate, getEnemyTemplate } from '@pimpampum/enemies';
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

/** The browser paths the 4-player guard never touches: other party sizes
 *  (PARTY_ALPHA) and the per-player levels input (playerLevelFactor).
 *  Slightly wider tolerance than the 4-player cells: off-reference party
 *  sizes stack S(n) measurement noise (S(3) measured 0.57-0.64 across runs)
 *  on the count-vs-party-size interaction the β model doesn't capture. */
const PARTY_TOLERANCE = 0.25;
describe('balancer v2 calibration — party sizes and levels', () => {
  function simulateSolved(templateId: string, players: number, target: number, budget: number, levels?: number[]): void {
    const solved = solveEncounter([{ templateId }], players, target, levels);
    expect(solved).toBeTruthy();
    let wins = 0;
    for (let i = 0; i < GAMES; i++) {
      const party = randomTeam('P', players, budget);
      const enemies = buildSolvedEncounter(solved!);
      assignStrategies(party, [AIStrategy.Power, AIStrategy.Aggro, AIStrategy.Protect]);
      const w = new CombatEngine(party, enemies, { registry: REGISTRY, maxRounds: 40 }).runCombat().winner;
      if (w === 0) wins++;
      else if (w === null) wins += 0.5;
    }
    const real = wins / GAMES;
    const label = solved!.groups.map(g => `${g.count}× pv${g.pv}`).join(', ');
    expect(
      Math.abs(real - solved!.predictedWinrate),
      `${templateId} ${players}p budget ${budget}${levels ? ` levels ${levels[0]}` : ''} target ${target}: promised ${(100 * solved!.predictedWinrate).toFixed(0)}%, real ${(100 * real).toFixed(0)}% (${label})`,
    ).toBeLessThan(PARTY_TOLERANCE);
  }

  for (const players of [3, 5, 6]) {
    it(`${players}-player parties: solved goblin encounters land near their promise`, () => {
      simulateSolved('goblin', players, 0.5, 7);
    });
  }
  it('5-player party at 5 levels each (the browser default) lands near its promise', () => {
    simulateSolved('goblin', 5, 0.65, 5, [5, 5, 5, 5, 5]);
  });
  it('elit kit at a 6-player party lands near its promise', () => {
    simulateSolved('stone-golem', 6, 0.5, 7);
  });
});
