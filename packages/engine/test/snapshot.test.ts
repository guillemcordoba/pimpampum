/**
 * A STATE AS DATA AND BACK — `CombatEngine.snapshot` / `CombatEngine.restore`,
 * what carries a solve's root state to another thread. A restored state must be
 * the same game: the same snapshot again, and the same fight from there on the
 * same dice. Behaviours travel as names the content gives them.
 */
import { describe, it, expect } from 'vitest';
import {
  CombatEngine, DiceRoll, EffectRegistry, withSeed, type StatusBehavior,
} from '../src/index.js';
import { attackCard, defenseCard, fighter, focusCard, randomLegalChooser } from '../src/testing.js';

// A status that bleeds its holder at each round's end, and remembers who set it.
const BLEED: StatusBehavior = {
  onRoundEnd(ctx) { if (ctx.holder.isAlive()) ctx.engine.applyPvLoss(ctx.holder, 1, undefined); },
};
const NAMES = new Map<object, string>([[BLEED, 'bleed']]);
const refOf = (o: object) => NAMES.get(o);
const deref = (name: string) => [...NAMES].find(([, n]) => n === name)![0];

function registry(): EffectRegistry {
  const r = new EffectRegistry();
  r.register('cut', {
    onResolve(ctx) {
      for (const t of ctx.targets) t.setStatus('bleed', 1, 3, { by: ctx.source, round: ctx.engine.round }, BLEED);
    },
  });
  return r;
}

function fight(seed: number): CombatEngine {
  const hand = () => [
    attackCard('hit', { dice: new DiceRoll(2, 6) }),
    attackCard('cut', { dice: new DiceRoll(1, 6), effects: [{ type: 'cut' }] }),
    defenseCard('block', { dice: new DiceRoll(2, 6) }),
    focusCard('wait'),
  ];
  return withSeed(seed, () => new CombatEngine(
    [fighter('A', hand(), { pv: 30, ai: true }), fighter('B', hand(), { pv: 30, ai: true })],
    [fighter('C', hand(), { pv: 30, ai: true }), fighter('D', hand(), { pv: 30, ai: true })],
    { registry: registry(), actionChooser: randomLegalChooser },
  ));
}

const pvs = (e: CombatEngine) => e.teams.map(t => t.map(c => c.currentPV));
/** The rest of a round `prepareRound` has opened, every seat choosing for itself. */
function playPrepared(e: CombatEngine): void {
  e.planActions([]);
  for (let step = e.resolveNextAction(); step.kind !== 'done'; step = e.resolveNextAction()) { /* AI seats aim themselves */ }
  e.finishRound();
}

describe('engine snapshot', () => {
  it('a restored state snapshots the same, and plays on the same', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const e = fight(seed);
      withSeed(seed, () => { for (let r = 0; r < 2 && !e.isOver(); r++) e.runRound(); });
      e.teams[1][0].setStatus('bleed', 1, 3, { by: e.teams[0][1] }, BLEED);
      e.prepareRound();
      const snap = e.snapshot(refOf);
      const back = CombatEngine.restore(structuredClone(snap), e.registry, deref);
      expect(back.snapshot(refOf), `seed ${seed}`).toEqual(snap);
      back.actionChooser = randomLegalChooser;
      const original = e.clone();
      withSeed(seed * 7, () => { playPrepared(original); for (let r = 0; r < 3 && !original.isOver(); r++) original.runRound(); });
      withSeed(seed * 7, () => { playPrepared(back); for (let r = 0; r < 3 && !back.isOver(); r++) back.runRound(); });
      expect(pvs(back), `seed ${seed}`).toEqual(pvs(original));
    }
  });

  it('a state caught mid-round finishes the round the same', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const e = fight(seed);
      e.teams[0][0].setStatus('bleed', 1, 3, { by: e.teams[1][1] }, BLEED);
      const back = withSeed(seed, () => {
        e.prepareRound();
        e.planActions([]);
        // Into the round: the queue, guards and the step's bookkeeping are live.
        for (let i = 0; i < 2; i++) e.resolveNextAction();
        return CombatEngine.restore(structuredClone(e.snapshot(refOf)), e.registry, deref);
      });
      expect(back.snapshot(refOf), `seed ${seed}`).toEqual(e.snapshot(refOf));
      back.actionChooser = randomLegalChooser;
      const finish = (x: CombatEngine) => withSeed(seed * 11, () => {
        for (let step = x.resolveNextAction(); step.kind !== 'done'; step = x.resolveNextAction()) { /* AI seats aim themselves */ }
        x.finishRound();
        return pvs(x);
      });
      expect(finish(back), `seed ${seed}`).toEqual(finish(e));
    }
  });

  it('keeps behaviours by name and payload characters by seat', () => {
    const e = fight(3);
    e.teams[1][0].setStatus('bleed', 1, 3, { by: e.teams[0][1] }, BLEED);
    const back = CombatEngine.restore(structuredClone(e.snapshot(refOf)), e.registry, deref);
    const entry = back.teams[1][0].statuses.get('bleed')!;
    expect(entry.behavior).toBe(BLEED);
    expect(entry.data!.by).toBe(back.teams[0][1]);
  });

  it('refuses a behaviour the content gives no name', () => {
    const e = fight(4);
    e.teams[0][0].setStatus('nameless', 1, 2, undefined, { onRoundEnd() {} });
    expect(() => e.snapshot(refOf)).toThrow(/no name/);
  });
});
