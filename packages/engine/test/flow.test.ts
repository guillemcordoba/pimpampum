/**
 * HOW A ROUND FLOWS — the priority order, simultaneity, interruption, learning, the
 * end of a fight — on hand-built positions with exact dice.
 */
import { describe, it, expect } from 'vitest';
import { CombatEngine, DiceRoll, EffectRegistry, firstLegalChooser, withSeed } from '../src/index.js';
import { armour, attackCard, defenseCard, fighter, focusCard, playRound, punchingBag } from '../src/testing.js';

const registry = () => new EffectRegistry();
const at = (team: number, idx: number) => ({ team, idx });

describe('priority: the order a round resolves in (rules.md)', () => {
  it('a fast card resolves before every normal one — a kill before the normal blow lands', () => {
    const quick = fighter('Quick', [attackCard('stab', { fast: true, rollBonus: 9 })], { pv: 10 });
    const plain = fighter('Plain', [attackCard('club', { rollBonus: 9 })], { pv: 10 });
    const engine = new CombatEngine([quick], [plain], { registry: registry(), actionChooser: firstLegalChooser });
    playRound(engine, [
      { team: 0, idx: 0, actionIdx: 0, targets: [at(1, 0)] },
      { team: 1, idx: 0, actionIdx: 0, targets: [at(0, 0)] },
    ]);
    expect(plain.isAlive()).toBe(false);
    expect(quick.currentPV).toBe(10);
    expect(engine.winner()).toBe(0);
  });

  it('cards of one step are simultaneous: both blows land, and a double kill is a draw', () => {
    const a = fighter('A', [attackCard('x', { rollBonus: 9 })], { pv: 10 });
    const b = fighter('B', [attackCard('y', { rollBonus: 9 })], { pv: 10 });
    const engine = new CombatEngine([a], [b], { registry: registry(), actionChooser: firstLegalChooser });
    playRound(engine, [
      { team: 0, idx: 0, actionIdx: 0, targets: [at(1, 0)] },
      { team: 1, idx: 0, actionIdx: 0, targets: [at(0, 0)] },
    ]);
    expect(a.isAlive()).toBe(false);
    expect(b.isAlive()).toBe(false);
    expect(engine.winner()).toBeNull();
    expect(engine.isOver()).toBe(true);
  });

  it('the queue is: fast Defense, fast Attack, fast Focus, then Defense, Attack, Focus', () => {
    const cards = [
      focusCard('f'), attackCard('a', { rollBonus: -100 }), defenseCard('d'),
      focusCard('ff', { fast: true }), attackCard('fa', { fast: true, rollBonus: -100 }), defenseCard('fd', { fast: true }),
    ];
    const team = cards.map((c, i) => fighter(`P${i}`, [c], { pv: 50 }));
    const engine = new CombatEngine(team, [fighter('Foe', [focusCard('z')], { pv: 50 })], { registry: registry(), actionChooser: firstLegalChooser });
    engine.prepareRound();
    const revealed = engine.planActions([
      ...team.map((_, i) => ({ team: 0, idx: i, actionIdx: 0, targets: cards[i].actionType === 'Atac' ? [at(1, 0)] : undefined })),
      { team: 1, idx: 0, actionIdx: 0 },
    ]);
    expect(revealed.filter(r => r.actorTeam === 0).map(r => r.actionId)).toEqual(['fd', 'fa', 'ff', 'd', 'a', 'f']);
  });

  it('a normal Defense is up before a normal Attack, and stops it', () => {
    const guard = fighter('G', [defenseCard('wall')], { pv: 10 });
    const striker = fighter('S', [attackCard('hit', { rollBonus: 5 })], { pv: 10 });
    const engine = new CombatEngine([guard], [striker], { registry: registry(), actionChooser: firstLegalChooser });
    playRound(engine, [
      { team: 0, idx: 0, actionIdx: 0, targets: [at(0, 0)] },
      { team: 1, idx: 0, actionIdx: 0, targets: [at(0, 0)] },
    ]);
    expect(guard.currentPV).toBe(10);
  });

  it('a fast Attack lands before a normal Defense goes up: the target is undefended', () => {
    const guard = fighter('G', [defenseCard('wall')], { pv: 10 });
    const striker = fighter('S', [attackCard('hit', { fast: true, rollBonus: 5 })], { pv: 10 });
    const engine = new CombatEngine([guard], [striker], { registry: registry(), actionChooser: firstLegalChooser });
    playRound(engine, [
      { team: 0, idx: 0, actionIdx: 0, targets: [at(0, 0)] },
      { team: 1, idx: 0, actionIdx: 0, targets: [at(0, 0)] },
    ]);
    expect(guard.currentPV).toBe(4);   // 1d1+5, the full roll
  });

  it('a fast Defense is up before a fast Attack', () => {
    const guard = fighter('G', [defenseCard('wall', { fast: true })], { pv: 10 });
    const striker = fighter('S', [attackCard('hit', { fast: true, rollBonus: 5 })], { pv: 10 });
    const engine = new CombatEngine([guard], [striker], { registry: registry(), actionChooser: firstLegalChooser });
    playRound(engine, [
      { team: 0, idx: 0, actionIdx: 0, targets: [at(0, 0)] },
      { team: 1, idx: 0, actionIdx: 0, targets: [at(0, 0)] },
    ]);
    expect(guard.currentPV).toBe(10);
  });

  it('every attack aims at the reveal; a defense chooses whom to guard only when it resolves, seeing the aims', () => {
    const guard = fighter('G', [defenseCard('wall')], { pv: 10, ai: true });
    const ally = fighter('Ally', [focusCard('wait')], { pv: 10, ai: true });
    const striker = fighter('S', [attackCard('hit', { rollBonus: 5 })], { pv: 10, ai: true });
    let aimsSeenByDefense: (readonly unknown[] | null)[] = [];
    const engine = new CombatEngine([guard, ally], [striker], {
      registry: registry(), actionChooser: firstLegalChooser,
      // Attacks go for the ally; a defense guards whoever an attack aimed at.
      targetChooser: (e, actor, def, req, count, pool) => {
        if (req === 'enemy') return pool.filter(c => c.name === 'Ally').slice(0, count);
        aimsSeenByDefense = e.pendingSummary().filter(p => p.actionType === 'Atac').map(p => p.targets);
        const aimed = e.pendingSummary().flatMap(p => p.actionType === 'Atac' ? p.targets ?? [] : []);
        return pool.filter(c => aimed.includes(c)).slice(0, count);
      },
    });
    engine.prepareRound();
    engine.planActions([]);
    const atReveal = engine.pendingSummary();
    expect(atReveal.find(p => p.actor === striker)!.targets).toEqual([ally]);   // aimed already
    expect(atReveal.find(p => p.actor === guard)!.targets).toBeNull();          // not yet
    let r = engine.resolveNextAction();
    while (r.kind !== 'done') r = engine.resolveNextAction();
    engine.finishRound();
    expect(aimsSeenByDefense).toEqual([[ally]]);
    expect(ally.currentPV).toBe(10);   // guarded
  });

  it('a defense guards an ally or itself — never an enemy, whatever a seat names', () => {
    const guard = fighter('G', [defenseCard('wall')], { pv: 10 });
    const foe = fighter('F', [focusCard('wait')], { pv: 10 });
    const engine = new CombatEngine([guard], [foe], { registry: registry(), actionChooser: firstLegalChooser });
    engine.prepareRound();
    engine.planActions([{ team: 0, idx: 0, actionIdx: 0, targets: [at(1, 0)] }, { team: 1, idx: 0, actionIdx: 0 }]);
    // The illegal enemy is dropped; the only legal target (itself) is kept.
    expect(engine.plannedThisRound().find(p => p.actor === guard)!.targets).toEqual([guard]);
  });

  it('inside a step, whoever committed first resolves first', () => {
    for (const first of [0, 1]) {
      const a = fighter('A', [attackCard('x', { rollBonus: -100 })], { pv: 10 });
      const b = fighter('B', [attackCard('y', { rollBonus: -100 })], { pv: 10 });
      const engine = new CombatEngine([a], [b], { registry: registry(), actionChooser: firstLegalChooser });
      const sel = [{ team: 0, idx: 0, actionIdx: 0, targets: [at(1, 0)] }, { team: 1, idx: 0, actionIdx: 0, targets: [at(0, 0)] }];
      playRound(engine, first === 0 ? sel : [sel[1], sel[0]]);
      expect(engine.history.map(h => h.actor.name)).toEqual(first === 0 ? ['A', 'B'] : ['B', 'A']);
    }
  });

  it('seats with no commit moment (AI) land at random inside their step', () => {
    const orders = new Set<string>();
    for (let seed = 0; seed < 30; seed++) {
      withSeed(seed, () => {
        const a = fighter('A', [attackCard('x', { rollBonus: -100 })], { pv: 10, ai: true });
        const b = fighter('B', [attackCard('y', { rollBonus: -100 })], { pv: 10, ai: true });
        const engine = new CombatEngine([a], [b], { registry: registry(), actionChooser: firstLegalChooser });
        engine.runRound();
        orders.add(engine.history.map(h => h.actor.name).join(''));
      });
    }
    expect(orders).toEqual(new Set(['AB', 'BA']));
  });

  it('a status can grant the fast step, and a strip beats a grant', () => {
    const c = fighter('C', [attackCard('x')], { pv: 10 });
    expect(c.isFast(c.actions[0])).toBe(false);
    c.setStatus('wind', 1, 2, undefined, { fast: () => true });
    expect(c.isFast(c.actions[0])).toBe(true);
    c.setStatus('doom', 1, 2, undefined, { fast: () => false });
    expect(c.isFast(c.actions[0])).toBe(false);
  });
});

describe('focus', () => {
  it('is cancelled when its holder takes damage first', () => {
    const caster = fighter('C', [focusCard('charge', { effects: [{ type: 'mark' }] })], { pv: 20 });
    const striker = fighter('S', [attackCard('jab', {})], { pv: 20 });
    const r = registry();
    let resolved = 0;
    r.register('mark', { onResolve: () => { resolved++; } });
    const engine = new CombatEngine([caster], [striker], { registry: r, actionChooser: firstLegalChooser });
    playRound(engine, [
      { team: 0, idx: 0, actionIdx: 0 },
      { team: 1, idx: 0, actionIdx: 0, targets: [at(0, 0)] },
    ]);
    expect(caster.currentPV).toBe(19);
    expect(resolved).toBe(0);
  });

  it('survives a blow that armour absorbs completely', () => {
    const caster = fighter('C', [focusCard('charge', { effects: [{ type: 'mark' }] })], { pv: 20, equipment: [armour(3)] });
    const striker = fighter('S', [attackCard('jab', {})], { pv: 20 });
    const r = registry();
    let resolved = 0;
    r.register('mark', { onResolve: () => { resolved++; } });
    const engine = new CombatEngine([caster], [striker], { registry: r, actionChooser: firstLegalChooser });
    playRound(engine, [
      { team: 0, idx: 0, actionIdx: 0 },
      { team: 1, idx: 0, actionIdx: 0, targets: [at(0, 0)] },
    ]);
    expect(caster.currentPV).toBe(20);
    expect(resolved).toBe(1);
  });
});

describe('learning in a real contest', () => {
  it('a defender who loses by ≤2 learns; a winner never does; an undefended hit teaches no one', () => {
    // Attack 1d1+3 = 4 vs defense 1d1+1 = 2: the defender loses by 2 → learns.
    const d = fighter('D', [defenseCard('guard', { dice: new DiceRoll(1, 1), rollBonus: 1 })], { pv: 20 });
    const a = fighter('A', [attackCard('hit', { rollBonus: 3 })], { pv: 20 });
    const engine = new CombatEngine([d], [a], { registry: registry(), actionChooser: firstLegalChooser });
    playRound(engine, [
      { team: 0, idx: 0, actionIdx: 0, targets: [at(0, 0)] },
      { team: 1, idx: 0, actionIdx: 0, targets: [at(0, 0)] },
    ]);
    expect(d.currentPV).toBe(18);
    expect(d.getSkillLevel('test')).toBe(1);
    expect(a.getSkillLevel('test')).toBe(0);

    // Undefended: no contest, no learning for anyone.
    const bag = fighter('Bag', [focusCard()], { pv: 20 });
    const b = fighter('B', [attackCard('hit', { rollBonus: 3 })], { pv: 20 });
    const e2 = new CombatEngine([bag], [b], { registry: registry(), actionChooser: firstLegalChooser });
    playRound(e2, [{ team: 0, idx: 0, actionIdx: 0 }, { team: 1, idx: 0, actionIdx: 0, targets: [at(0, 0)] }]);
    expect(bag.getSkillLevel('test')).toBe(0);
    expect(b.getSkillLevel('test')).toBe(0);
  });

  it('a tie holds for the defense, and the attacker — who lost by 0 — learns', () => {
    const d = fighter('D', [defenseCard('guard', { dice: new DiceRoll(1, 1), rollBonus: 3 })], { pv: 20 });
    const a = fighter('A', [attackCard('hit', { rollBonus: 3 })], { pv: 20 });
    const engine = new CombatEngine([d], [a], { registry: registry(), actionChooser: firstLegalChooser });
    playRound(engine, [
      { team: 0, idx: 0, actionIdx: 0, targets: [at(0, 0)] },
      { team: 1, idx: 0, actionIdx: 0, targets: [at(0, 0)] },
    ]);
    expect(d.currentPV).toBe(20);
    expect(a.getSkillLevel('test')).toBe(1);
    expect(d.getSkillLevel('test')).toBe(0);
  });
});

describe('area attacks', () => {
  it('ONE roll per pass: every target is struck by the same total', () => {
    // 3d6 at three undefended bags. Whatever the dice say, they say it once.
    for (let seed = 0; seed < 50; seed++) {
      const bags = [punchingBag(100), punchingBag(100), punchingBag(100)];
      const a = fighter('AoE', [attackCard('sweep', { dice: new DiceRoll(3, 6), targetCount: 3 })], { pv: 10 });
      const engine = new CombatEngine([a], bags, { registry: registry(), actionChooser: firstLegalChooser });
      playRound(engine, [{ team: 0, idx: 0, actionIdx: 0 }]);
      const lost = bags.map(b => 100 - b.currentPV);
      expect(new Set(lost).size).toBe(1);
      expect(lost[0]).toBeGreaterThanOrEqual(3);
    }
  });

  it('rollPerTarget rolls fresh dice for each target instead', () => {
    let differed = false;
    for (let seed = 0; seed < 50 && !differed; seed++) {
      const bags = [punchingBag(100), punchingBag(100), punchingBag(100)];
      const a = fighter('Frag', [attackCard('frag', { dice: new DiceRoll(3, 6), targetCount: 3, rollPerTarget: true })]);
      const engine = new CombatEngine([a], bags, { registry: registry(), actionChooser: firstLegalChooser });
      playRound(engine, [{ team: 0, idx: 0, actionIdx: 0 }]);
      differed = new Set(bags.map(b => b.currentPV)).size > 1;
    }
    expect(differed).toBe(true);
  });
});

describe('the end of a fight', () => {
  it('a fight nobody can win ends as a draw at the round cap', () => {
    const a = fighter('A', [focusCard()], { pv: 10, ai: true });
    const b = fighter('B', [focusCard()], { pv: 10, ai: true });
    const engine = new CombatEngine([a], [b], { registry: registry(), actionChooser: firstLegalChooser, maxRounds: 7 });
    expect(engine.runCombat()).toEqual({ winner: null, rounds: 7 });
  });

  it('the side left standing wins', () => {
    const a = fighter('A', [attackCard('k', { rollBonus: 20 })], { pv: 10, ai: true });
    const b = fighter('B', [focusCard()], { pv: 10, ai: true });
    const engine = new CombatEngine([a], [b], { registry: registry(), actionChooser: firstLegalChooser });
    expect(engine.runCombat()).toEqual({ winner: 0, rounds: 1 });
  });

  it('a stunned character loses exactly the turns they were told to', () => {
    const a = fighter('A', [attackCard('k')], { pv: 10, ai: true });
    const bag = punchingBag(100);
    const engine = new CombatEngine([a], [bag], { registry: registry(), actionChooser: firstLegalChooser });
    a.skipTurns = 2;
    playRound(engine, []);
    playRound(engine, []);
    expect(bag.currentPV).toBe(100);
    playRound(engine, []);
    expect(bag.currentPV).toBe(99);
  });
});

describe('gang rules (experimental): two attacks, 5 and 4, on one defense of 6', () => {
  const play = (gangRule: 'separate' | 'sum' | 'wear' | 'flank' | 'single') => {
    const a1 = fighter('A1', [attackCard('five', { dice: new DiceRoll(5, 1) })], { pv: 10 });
    const a2 = fighter('A2', [attackCard('four', { dice: new DiceRoll(4, 1) })], { pv: 10 });
    const d = fighter('D', [defenseCard('six', { rollBonus: 0, dice: new DiceRoll(6, 1) })], { pv: 20 });
    const engine = new CombatEngine([a1, a2], [d], { registry: registry(), actionChooser: firstLegalChooser, gangRule });
    playRound(engine, [
      { team: 0, idx: 0, actionIdx: 0, targets: [at(1, 0)] },
      { team: 0, idx: 1, actionIdx: 0, targets: [at(1, 0)] },
      { team: 1, idx: 0, actionIdx: 0, targets: [at(1, 0)] },
    ]);
    return d.currentPV;
  };
  it('separate: each faces a fresh 6 and is held', () => expect(play('separate')).toBe(20));
  it('sum: one blow of 9 against 6 — 3 through', () => expect(play('sum')).toBe(17));
  it('wear: the 5 is held and spends 5 of the 6; the 4 meets 1 — 3 through', () => expect(play('wear')).toBe(17));
  it('flank: 7 against 6 — 1 through; 6 against 6 is held', () => expect(play('flank')).toBe(19));
  it('single: the defense stops one blow (the first, with no chooser); the 4 lands in full', () => expect(play('single')).toBe(16));
});

describe('gang rules (experimental), the second batch', () => {
  it('divided: the defense rolls once and its halves go where the defender sends them (no chooser: all to the first) — the 4 meets nothing', () => {
    const a1 = fighter('A1', [attackCard('five', { dice: new DiceRoll(5, 1) })], { pv: 10 });
    const a2 = fighter('A2', [attackCard('four', { dice: new DiceRoll(4, 1) })], { pv: 10 });
    const d = fighter('D', [defenseCard('six', { rollBonus: 0, dice: new DiceRoll(6, 1) })], { pv: 20 });
    const engine = new CombatEngine([a1, a2], [d], { registry: registry(), actionChooser: firstLegalChooser, gangRule: 'divided' });
    playRound(engine, [
      { team: 0, idx: 0, actionIdx: 0, targets: [at(1, 0)] },
      { team: 0, idx: 1, actionIdx: 0, targets: [at(1, 0)] },
      { team: 1, idx: 0, actionIdx: 0, targets: [at(1, 0)] },
    ]);
    expect(d.currentPV).toBe(16);
  });

  it('unguarded: a body two attacks aim at loses its ally\'s guard — both blows land in full', () => {
    const play = (gangRule: 'separate' | 'unguarded') => {
      const a1 = fighter('A1', [attackCard('five', { dice: new DiceRoll(5, 1) })], { pv: 10 });
      const a2 = fighter('A2', [attackCard('four', { dice: new DiceRoll(4, 1) })], { pv: 10 });
      const x = fighter('X', [focusCard()], { pv: 20 });
      const y = fighter('Y', [defenseCard('ten', { rollBonus: 0, dice: new DiceRoll(10, 1) })], { pv: 20 });
      const engine = new CombatEngine([a1, a2], [x, y], { registry: registry(), actionChooser: firstLegalChooser, gangRule });
      playRound(engine, [
        { team: 0, idx: 0, actionIdx: 0, targets: [at(1, 0)] },
        { team: 0, idx: 1, actionIdx: 0, targets: [at(1, 0)] },
        { team: 1, idx: 0, actionIdx: 0 },
        { team: 1, idx: 1, actionIdx: 0, targets: [at(1, 0)] },
      ]);
      return x.currentPV;
    };
    expect(play('separate')).toBe(20);
    expect(play('unguarded')).toBe(11);
  });

  it('swarm: the second blow meets a defense rolled twice, the worse kept — clearly more gets through', () => {
    // Two 3s against a d6: E[max(0, 3 − d6)] = 0.5 per blow; with the worse
    // of two d6, 31/36 for the second — +0.36. Less than that here: a
    // defender who loses by ≤ 2 learns a level, and defends the second blow
    // with it either way.
    const mean = (gangRule: 'separate' | 'swarm') => withSeed(7, () => {
      let lost = 0;
      for (let i = 0; i < 3000; i++) {
        const a1 = fighter('A1', [attackCard('three', { dice: new DiceRoll(3, 1) })], { pv: 10 });
        const a2 = fighter('A2', [attackCard('three', { dice: new DiceRoll(3, 1) })], { pv: 10 });
        const d = fighter('D', [defenseCard('d6', { rollBonus: 0, dice: new DiceRoll(1, 6) })], { pv: 20 });
        const engine = new CombatEngine([a1, a2], [d], { registry: registry(), actionChooser: firstLegalChooser, gangRule });
        playRound(engine, [
          { team: 0, idx: 0, actionIdx: 0, targets: [at(1, 0)] },
          { team: 0, idx: 1, actionIdx: 0, targets: [at(1, 0)] },
          { team: 1, idx: 0, actionIdx: 0, targets: [at(1, 0)] },
        ]);
        lost += 20 - d.currentPV;
      }
      return lost / 3000;
    });
    expect(mean('swarm') - mean('separate')).toBeGreaterThan(0.2);
  });
});
