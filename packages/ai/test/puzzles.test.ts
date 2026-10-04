/**
 * THE PUZZLE BANK — positions built so ONE play is right, by the rules alone.
 *
 * Each puzzle names the mechanic it exercises, so a failure says which part
 * of the AI's picture of the game went wrong: interrupting a focus, guarding,
 * area damage, healing, aiming. Synthetic fighters and inline effects only;
 * the right answer is a consequence of the rules, never of a balance opinion.
 */
import { describe, it, expect } from 'vitest';
import {
  ActionType, type ActionDefinition, type Character, CombatEngine, DiceRoll, EffectRegistry, withSeed,
} from '@pimpampum/engine';
import { attackCard, defenseCard, fighter, focusCard, playRound } from '@pimpampum/engine/testing';
import { aiPolicy, bestResponse, DEFAULT_LOOKAHEAD } from '../src/index.js';

/** Inline effects whose consequences are total, so the right play is unambiguous. */
function registry(): EffectRegistry {
  const r = new EffectRegistry();
  // A focus that, if it resolves, fells everyone on the other side.
  r.register('doom', {
    getTargetRequirement: () => 'none',
    onResolve(ctx) { for (const e of ctx.engine.enemiesOf(ctx.source)) ctx.engine.applyPvLoss(e, 1000, ctx.source); },
  });
  r.register('mend', {
    getTargetRequirement: () => 'ally',
    onResolve(ctx) { for (const t of ctx.targets) ctx.engine.heal(t, 10); },
  });
  return r;
}

const doom = (speed: number): ActionDefinition => focusCard('doom', { speed, effects: [{ type: 'doom' }] });
const mend = (speed: number): ActionDefinition => ({
  id: 'mend', name: 'mend', skillId: 'test', unlockLevel: 0, actionType: ActionType.Focus, speed,
  effects: [{ type: 'mend' }], description: '', iconPath: '',
});

/** The card the hero plays at production settings, over many seeds. */
function picks(build: () => { engine: CombatEngine; hero: Character }, seeds = 20): string[] {
  const out: string[] = [];
  for (let s = 0; s < seeds; s++) {
    withSeed(s, () => {
      const { engine, hero } = build();
      engine.prepareRound();
      out.push(hero.actions[bestResponse(engine, 0, DEFAULT_LOOKAHEAD).choices.get(hero)!].def.id);
    });
  }
  return out;
}
const engineOf = (a: Character[], b: Character[]) =>
  new CombatEngine(a, b, { registry: registry(), maxRounds: 12, ...aiPolicy({ depth: 0 }) });

describe('puzzles with one right play', () => {
  it('interrupt: a fast jab breaks a deadly focus that a slow slam would arrive too late for', () => {
    const chosen = picks(() => {
      const hero = fighter('Hero', [
        attackCard('jab', { speed: 5, rollBonus: 1 }),
        attackCard('slam', { speed: 0, dice: new DiceRoll(3, 6) }),
      ], { pv: 10, ai: true });
      const foe = fighter('Foe', [doom(2)], { pv: 50, ai: true });
      return { engine: engineOf([hero], [foe]), hero };
    });
    expect(chosen.every(c => c === 'jab'), `picked ${chosen}`).toBe(true);
  });

  it('guard: shield the ally a certain blow would kill, rather than add a little damage', () => {
    const chosen = picks(() => {
      const hero = fighter('Hero', [attackCard('hit', { dice: new DiceRoll(1, 6) }), defenseCard('guard')], { pv: 20, ai: true });
      const ally = fighter('Ally', [attackCard('poke')], { pv: 20, ai: true });
      const foe = fighter('Foe', [attackCard('execute', { speed: 3, rollBonus: 5 })], { pv: 100, ai: true });
      const engine = engineOf([hero, ally], [foe]);
      ally.currentPV = 1;   // after the engine: its constructor restores full health
      return { engine, hero };
    });
    expect(chosen.every(c => c === 'guard'), `picked ${chosen}`).toBe(true);
  });

  it('area: against a pack, the sweep beats the same blow on one body', () => {
    const chosen = picks(() => {
      const hero = fighter('Hero', [
        attackCard('single', { dice: new DiceRoll(2, 6) }),
        attackCard('sweep', { dice: new DiceRoll(2, 6), targetCount: 99 }),
      ], { pv: 20, ai: true });
      const pack = [0, 1, 2, 3].map(i => fighter(`Pup${i}`, [attackCard('nip')], { pv: 30, ai: true }));
      return { engine: engineOf([hero], pack), hero };
    });
    expect(chosen.every(c => c === 'sweep'), `picked ${chosen}`).toBe(true);
  });

  it('heal: mend the ally a blow would otherwise kill', () => {
    const chosen = picks(() => {
      const hero = fighter('Hero', [mend(5), attackCard('hit', { dice: new DiceRoll(1, 6), speed: 0 })], { pv: 20, ai: true });
      const ally = fighter('Ally', [focusCard('wait')], { pv: 20, ai: true });
      const foe = fighter('Foe', [attackCard('club', { speed: 3, rollBonus: 3 })], { pv: 100, ai: true });
      const engine = engineOf([hero, ally], [foe]);
      ally.currentPV = 1;   // after the engine: its constructor restores full health
      return { engine, hero };
    });
    expect(chosen.every(c => c === 'mend'), `picked ${chosen}`).toBe(true);
  });

  it('no waste: a heal is not spent on a party at full health', () => {
    const chosen = picks(() => {
      const hero = fighter('Hero', [mend(5), attackCard('hit', { dice: new DiceRoll(2, 6) })], { pv: 20, ai: true });
      const ally = fighter('Ally', [attackCard('poke')], { pv: 20, ai: true });
      const foe = fighter('Foe', [attackCard('poke')], { pv: 40, ai: true });
      return { engine: engineOf([hero, ally], [foe]), hero };
    });
    expect(chosen.every(c => c === 'hit'), `picked ${chosen}`).toBe(true);
  });

  // KNOWN TO FAIL (2026-10-04, NEXT-STEPS §30). Targets are not searched: they
  // come from `pickResolveTargets`, which gives "interrupt a pending focus" the
  // same bonus whatever the focus does, so beside a harmless focus it may hit
  // the wrong one. `it.fails` turns red the day this is fixed.
  it.fails('aim: the one hit you have goes to the foe whose focus would end the fight', () => {
    let survived = 0;
    for (let s = 0; s < 20; s++) {
      withSeed(s, () => {
        const hero = fighter('Hero', [attackCard('stab', { speed: 5, rollBonus: 5 })], { pv: 10, ai: true });
        const doomsayer = fighter('Doomsayer', [doom(2)], { pv: 3, ai: true });
        const bystander = fighter('Bystander', [focusCard('wait')], { pv: 3, ai: true });
        const engine = engineOf([hero], [bystander, doomsayer]);
        playRound(engine, []);
        if (hero.isAlive()) survived++;
      });
    }
    expect(survived, `${survived}/20 rounds survived`).toBe(20);
  });
});
