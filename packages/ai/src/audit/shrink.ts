/**
 * THE SHRINKER — a failing position cut down to the smallest one that still
 * fails, so a discovery becomes a test a person can read.
 *
 * Greedy, like a property-based tester's shrinking: try every simplification
 * in turn — drop a body, drop a card, clear a status, take away fatigue,
 * armour or a level, halve PV, halve a card's dice — keep the first one after
 * which `fails` still holds, and start again from the smaller position; stop
 * when none does (or the budget of tries runs out). Each kept step is named,
 * so the test says what was removed on the way.
 *
 * `fails` is whatever judge found the defect (the playout judge, or the
 * referee once the position is small enough): the shrinker knows nothing
 * about AIs.
 */
import type { FighterSpec, Position } from './position.js';

export interface ShrinkResult {
  position: Position;
  /** What each kept simplification was, in order. */
  steps: string[];
  /** How many candidate positions `fails` was asked about. */
  tried: number;
}

const copy = (p: Position): Position => JSON.parse(JSON.stringify(p)) as Position;

/** Every one-step simplification of `p`, biggest first. */
function* simplifications(p: Position): Generator<[string, Position]> {
  const each = function* (edit: (q: Position, ti: number, fi: number) => string | null): Generator<[string, Position]> {
    for (let ti = 1; ti >= 0; ti--) {
      for (let fi = 0; fi < p.teams[ti].length; fi++) {
        const q = copy(p);
        const label = edit(q, ti, fi);
        if (label) yield [label, q];
      }
    }
  };
  // Bodies: each side keeps at least one standing.
  yield* each((q, ti, fi) => {
    const team = q.teams[ti];
    const standing = team.filter((f, k) => k !== fi && f.pv > 0).length;
    if (standing < 1) return null;
    const [gone] = team.splice(fi, 1);
    q.tags = { ...q.tags, shape: `${q.teams[0].length}x${q.teams[1].length}` };
    return `drop ${gone.name}`;
  });
  // Cards: every hand keeps one.
  for (let ti = 1; ti >= 0; ti--) {
    for (let fi = 0; fi < p.teams[ti].length; fi++) {
      for (let ci = 0; ci < p.teams[ti][fi].cards.length; ci++) {
        if (p.teams[ti][fi].cards.length <= 1) continue;
        const q = copy(p);
        const [gone] = q.teams[ti][fi].cards.splice(ci, 1);
        yield [`drop ${p.teams[ti][fi].name}'s ${gone.arch}`, q];
      }
    }
  }
  const field = (name: keyof FighterSpec, zero: number) => each((q, ti, fi) => {
    const f = q.teams[ti][fi];
    if ((f[name] as number) === zero) return null;
    (f as unknown as Record<string, number>)[name] = zero;
    return `${f.name}: ${String(name)} → ${zero}`;
  });
  yield* each((q, ti, fi) => {
    const f = q.teams[ti][fi];
    if (!f.statuses?.length) return null;
    delete f.statuses;
    return `${f.name}: no statuses`;
  });
  yield* field('fatigue', 0);
  yield* field('armour', 0);
  yield* field('level', 0);
  yield* each((q, ti, fi) => {
    const f = q.teams[ti][fi];
    if (f.pv <= 1) return null;
    f.pv = Math.ceil(f.pv / 2);
    f.maxPv = Math.max(f.pv, Math.ceil(f.maxPv / 2));
    return `${f.name}: PV halved to ${f.pv}`;
  });
  for (let ti = 1; ti >= 0; ti--) {
    for (let fi = 0; fi < p.teams[ti].length; fi++) {
      for (let ci = 0; ci < p.teams[ti][fi].cards.length; ci++) {
        const n = p.teams[ti][fi].cards[ci].p.n;
        if (typeof n !== 'number' || n <= 1) continue;
        const q = copy(p);
        q.teams[ti][fi].cards[ci].p = { ...q.teams[ti][fi].cards[ci].p, n: Math.ceil(n / 2) };
        yield [`${p.teams[ti][fi].name}'s ${p.teams[ti][fi].cards[ci].arch}: dice ${n} → ${Math.ceil(n / 2)}`, q];
      }
    }
  }
}

/** Shrink `pos` while `fails` holds. */
export function shrink(pos: Position, fails: (p: Position) => boolean, budget = 300): ShrinkResult {
  let current = copy(pos);
  const steps: string[] = [];
  let tried = 0;
  for (;;) {
    let moved = false;
    for (const [label, candidate] of simplifications(current)) {
      if (tried >= budget) return { position: current, steps, tried };
      tried++;
      if (fails(candidate)) { current = candidate; steps.push(label); moved = true; break; }
    }
    if (!moved) return { position: current, steps, tried };
  }
}
