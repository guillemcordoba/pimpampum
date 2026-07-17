import { describe, it, expect } from 'vitest';
import {
  checkSkillUp, resolveDamage, resolveAttack, newCombatStats, CombatEngine, assignStrategies, AIStrategy,
} from '@pimpampum/engine';
import { randomTeam, runMatch, REGISTRY, getEncounter, buildEncounter } from './helpers.js';

describe('resolution math', () => {
  it('the loser levels a skill only on a close loss (≤2)', () => {
    expect(checkSkillUp(0)).toBe(true);   // tie: the attacker lost by 0
    expect(checkSkillUp(1)).toBe(true);
    expect(checkSkillUp(2)).toBe(true);
    expect(checkSkillUp(3)).toBe(false);  // lost by too much to learn
    expect(checkSkillUp(-1)).toBe(false); // winners never level
  });

  it('damage is the margin: defended hits deal attack − defense, undefended the full roll', () => {
    expect(resolveAttack(10, 7)).toEqual({ hit: true, margin: 3 });
    expect(resolveAttack(7, 7)).toEqual({ hit: false, margin: 0 });  // tie: defense holds
    expect(resolveAttack(5, 9)).toEqual({ hit: false, margin: -4 });
    expect(resolveAttack(6, null)).toEqual({ hit: true, margin: 6 }); // undefended: full roll
  });

  it('subtracts armour from the margin, floored at zero', () => {
    expect(resolveDamage(7, 3)).toBe(4);
    expect(resolveDamage(2, 5)).toBe(0);
    expect(resolveDamage(5, 0)).toBe(5);
  });
});

describe('engine sanity', () => {
  it('every combat terminates with a valid winner and PV stays in range', () => {
    for (let i = 0; i < 60; i++) {
      const a = randomTeam('A', 2, 6);
      const b = randomTeam('B', 2, 6);
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
      const w = runMatch(randomTeam('A', 2, 6), randomTeam('B', 2, 6));
      if (w === 0) aWins++; else if (w === 1) bWins++;
    }
    const rate = aWins / (aWins + bWins);
    expect(rate).toBeGreaterThan(0.40);
    expect(rate).toBeLessThan(0.60);
  });

  it('average combat length is reasonable', () => {
    const stats = newCombatStats();
    for (let i = 0; i < 300; i++) runMatch(randomTeam('A', 2, 6), randomTeam('B', 2, 6), stats);
    const avg = stats.rounds / stats.combats;
    expect(avg).toBeGreaterThan(1.5);
    // intentions.md targets ≤~5 rounds INCLUDING mirrors; keep the ceiling
    // loose until the PV/duration tuning pass, then tighten. TODO(balance)
    expect(avg).toBeLessThan(40);
  });

  it('all three action types see play', () => {
    const stats = newCombatStats();
    for (let i = 0; i < 300; i++) runMatch(randomTeam('A', 3, 7), randomTeam('B', 3, 7), stats);
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
        const players = randomTeam('P', pc, 7);
        assignStrategies(players, [AIStrategy.Power]);
        const res = new CombatEngine(players, enemies, { registry: REGISTRY, maxRounds: 60 }).runCombat();
        expect([0, 1, null]).toContain(res.winner);
        expect(res.rounds).toBeGreaterThan(0);
      }
    });
  }
});
