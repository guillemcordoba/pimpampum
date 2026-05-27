import { describe, it, expect } from 'vitest';
import {
  checkSkillUp, resolveDamage, newCombatStats, CombatEngine, assignStrategies, AIStrategy,
} from '@pimpampum/engine';
import { randomTeam, runMatch, REGISTRY, getEncounter, buildEncounter } from './helpers.js';

describe('resolution math', () => {
  it('levels a skill only in the learning zone', () => {
    expect(checkSkillUp(true, 3)).toBe(true);    // success by < 5
    expect(checkSkillUp(true, 7)).toBe(false);   // success by >= 5 (too easy)
    expect(checkSkillUp(false, 6)).toBe(true);   // failure by < 10
    expect(checkSkillUp(false, 12)).toBe(false); // failure by >= 10 (too hard)
    expect(checkSkillUp(true, Infinity)).toBe(false); // undefended auto-hit
  });

  it('subtracts armour from damage, floored at zero', () => {
    expect(resolveDamage(7, 3)).toBe(4);
    expect(resolveDamage(2, 5)).toBe(0);
    expect(resolveDamage(5, 0)).toBe(5);
  });
});

describe('engine sanity', () => {
  it('every combat terminates with a valid winner and PV stays in range', () => {
    for (let i = 0; i < 60; i++) {
      const a = randomTeam('A', 2, 40);
      const b = randomTeam('B', 2, 40);
      assignStrategies(a, [AIStrategy.Power]);
      assignStrategies(b, [AIStrategy.Aggro]);
      const res = new CombatEngine(a, b, { registry: REGISTRY, maxRounds: 50 }).runCombat();
      expect(res.rounds).toBeGreaterThan(0);
      expect([0, 1, null]).toContain(res.winner);
      for (const c of [...a, ...b]) {
        expect(c.currentPV).toBeGreaterThanOrEqual(0);
        expect(c.currentPV).toBeLessThanOrEqual(c.maxPV);
      }
    }
  });
});

describe('mirror balance (equal skill budgets)', () => {
  it('2v2 equal-budget teams win close to 50/50', () => {
    let aWins = 0, bWins = 0;
    const N = 600;
    for (let i = 0; i < N; i++) {
      const w = runMatch(randomTeam('A', 2, 40), randomTeam('B', 2, 40));
      if (w === 0) aWins++; else if (w === 1) bWins++;
    }
    const rate = aWins / (aWins + bWins);
    expect(rate).toBeGreaterThan(0.40);
    expect(rate).toBeLessThan(0.60);
  });

  it('average combat length is reasonable', () => {
    const stats = newCombatStats();
    for (let i = 0; i < 300; i++) runMatch(randomTeam('A', 2, 40), randomTeam('B', 2, 40), stats);
    const avg = stats.rounds / stats.combats;
    expect(avg).toBeGreaterThan(1.5);
    expect(avg).toBeLessThan(25);
  });

  it('all three action types see play', () => {
    const stats = newCombatStats();
    for (let i = 0; i < 300; i++) runMatch(randomTeam('A', 3, 45), randomTeam('B', 3, 45), stats);
    expect(stats.actionTypePlays['Atac'] ?? 0).toBeGreaterThan(0);
    expect(stats.actionTypePlays['Defensa'] ?? 0).toBeGreaterThan(0);
    expect(stats.actionTypePlays['Focus'] ?? 0).toBeGreaterThan(0);
  });
});

describe('encounters', () => {
  const ids = ['horda-de-goblins', 'patrulla-goblin', 'manada-de-llops', 'incursio-diabolica', 'el-basilisc'];
  for (const id of ids) {
    it(`${id} resolves for every player count`, () => {
      const enc = getEncounter(id);
      expect(enc).toBeTruthy();
      for (const pc of [3, 4, 5, 6]) {
        const enemies = buildEncounter(enc!, pc);
        expect(enemies.length).toBeGreaterThan(0);
        const players = randomTeam('P', pc, 45);
        assignStrategies(players, [AIStrategy.Power]);
        assignStrategies(enemies, [AIStrategy.Aggro]);
        const res = new CombatEngine(players, enemies, { registry: REGISTRY, maxRounds: 60 }).runCombat();
        expect([0, 1, null]).toContain(res.winner);
        expect(res.rounds).toBeGreaterThan(0);
      }
    });
  }
});
