/**
 * THE NUMBER TUNER — searches card NUMBERS for a kit inside the livable zone
 * (the user, 2026-11-03: the kit gate plus a tuner; balance by numbers before
 * mechanics). A knob is one card's dice, one rung up or down, or one integer
 * parameter of its effects, by one. It PROPOSES: the best patch it found and
 * the gate cells before and after. It never writes a card.
 *
 * Each candidate is measured in its own process (`isolated`), which applies the
 * patch to the set's card definitions before anything is fingerprinted, so the
 * cache keys follow the patched content and a revisited patch is free.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ActionType, DiceRoll, type ActionDefinition } from '@pimpampum/engine';
import { isolated, lanesNow, theSet } from '@pimpampum/bench';
import { measureGate, type GateContext, type GateReport } from './gate.js';
import { installSet } from './prepare.js';
import { KIT_BAND, MAX_MEDIAN_ROUNDS, MAX_P90_ROUNDS, MAX_STALL_RATE } from './rules.js';

/** A card's numbers as changed: its dice, and integer effect params keyed
 *  `<effect index>.<param>`. */
export interface CardPatch { dice?: string; params?: Record<string, number> }
export type NumbersPatch = Record<string, CardPatch>;

function cardById(id: string): ActionDefinition | undefined {
  for (const kit of theSet().calibration.mainKits) {
    const a = theSet().kit(kit)?.actions.find(x => x.id === id);
    if (a) return a;
  }
  return undefined;
}

/** Write a patch into the installed set's card definitions, in this process.
 *  Before anything is measured: the fingerprints are memoised. */
export function applyPatch(patch: NumbersPatch): void {
  for (const [id, p] of Object.entries(patch)) {
    const a = cardById(id) as { dice?: DiceRoll; effects: { params?: Record<string, unknown> }[] } | undefined;
    if (!a) throw new Error(`applyPatch: no main-kit card '${id}'`);
    if (p.dice) a.dice = DiceRoll.parse(p.dice);
    for (const [k, v] of Object.entries(p.params ?? {})) {
      const [i, name] = k.split('.');
      const e = a.effects[Number(i)];
      if (!e) throw new Error(`applyPatch: ${id} has no effect ${i}`);
      e.params = { ...e.params, [name]: v };
    }
  }
}

/**
 * The rungs dice move along, by mean: the ladder's own shapes and their
 * neighbours. A card's dice off this list are placed among them by mean.
 */
const RUNGS = ['1d4', '1d6', '2d4', '2d4+1', '2d6', '3d4', '3d4+1', '2d8', '3d4+2', '4d4', '3d6', '2d8+2', '3d6+1', '5d4',
  '4d6', '4d6+1', '5d6', '6d6'].map(n => DiceRoll.parse(n));

export function diceStep(d: DiceRoll, dir: 1 | -1): DiceRoll | null {
  const mean = d.average();
  const others = RUNGS.filter(r => Math.abs(r.average() - mean) > 1e-9);
  const pick = dir > 0
    ? others.filter(r => r.average() > mean).sort((a, b) => a.average() - b.average())[0]
    : others.filter(r => r.average() < mean).sort((a, b) => b.average() - a.average())[0];
  return pick ?? null;
}

/** One single-number move. */
export interface Knob { card: string; label: string; patch: CardPatch }

/** Every move on a kit's cards: each card's dice a rung either way, each
 *  integer param by one either way (never below 0). */
export function knobsFor(kit: string, base: NumbersPatch = {}, only?: readonly string[]): Knob[] {
  const out: Knob[] = [];
  for (const a of theSet().kit(kit)?.actions ?? []) {
    if (a.skillId !== kit || (only && !only.includes(a.id))) continue;
    const cur = base[a.id] ?? {};
    const dice = cur.dice ? DiceRoll.parse(cur.dice) : a.dice;
    if (dice) for (const dir of [1, -1] as const) {
      const next = diceStep(dice, dir);
      if (next) out.push({ card: a.id, label: `${a.name}: ${dice} → ${next}`, patch: { ...cur, dice: next.toString() } });
    }
    a.effects.forEach((e, i) => {
      for (const [name, v] of Object.entries(e.params ?? {})) {
        if (typeof v !== 'number' || !Number.isInteger(v)) continue;
        const now = cur.params?.[`${i}.${name}`] ?? v;
        for (const dir of [1, -1]) {
          if (now + dir < 0) continue;
          out.push({ card: a.id, label: `${a.name}: ${e.type}.${name} ${now} → ${now + dir}`,
            patch: { ...cur, params: { ...cur.params, [`${i}.${name}`]: now + dir } } });
        }
      }
    });
  }
  return out;
}

/** How far a kit sits outside the zone: 0 inside it. */
export interface KitScore {
  total: number;
  duration: number; cards: number;
  /** Until creatures are on the ladder (GOALS.md B20), the band is guarded on the
   *  kit's score in mirrors, so a fix to its length cannot make it a bully. */
  strength: number;
}

export function kitScore(r: GateReport, kit: string): KitScore {
  let duration = 0, strength = 0;
  for (const c of r.kits.filter(x => x.kit === kit)) {
    duration += Math.max(0, c.p90Rounds - MAX_P90_ROUNDS) + Math.max(0, c.medianRounds - MAX_MEDIAN_ROUNDS)
      + 100 * Math.max(0, c.stallRate - MAX_STALL_RATE);
    strength += 20 * Math.max(0, Math.abs(c.winrate - 0.5) - KIT_BAND);
  }
  const cards = 3 * r.cards.filter(c => c.kit === kit && (c.neverRight || c.blind)).length;
  return { total: duration + cards + strength, duration, cards, strength };
}

/** What a candidate's measurement hands back. */
export interface Evaluated { patch: NumbersPatch; score: KitScore; report: GateReport }

/** The child half: install, patch, measure the kit's own cells. */
export async function evaluatePatch(ctx: GateContext, patch: NumbersPatch, kit: string): Promise<Evaluated> {
  await installSet(ctx.set);
  applyPatch(patch);
  const report = measureGate({ kits: [kit] }, ctx.budget);
  return { patch, score: kitScore(report, kit), report };
}

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SELF = path.join(HERE, path.basename(HERE) === 'dist' ? '.' : '../dist', 'tune.js');

async function pool<T, R>(items: T[], run: (t: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.max(1, Math.min(lanesNow(), items.length)) }, async () => {
    for (let i = next++; i < items.length; i = next++) out[i] = await run(items[i]);
  }));
  return out;
}

export interface TuneStep { knob: string; score: KitScore }
export interface TuneResult { kit: string; start: Evaluated; best: Evaluated; steps: TuneStep[] }

/**
 * Best-improvement hill climbing on one kit: measure every single move from
 * the current patch, take the one that lowers the score most, repeat until no
 * move helps or `maxSteps` moves are taken. `only` limits the cards it touches.
 */
export async function tuneKit(
  ctx: GateContext, kit: string,
  opts: { maxSteps?: number; only?: readonly string[]; start?: NumbersPatch; onStep?: (s: TuneStep, tried: number) => void } = {},
): Promise<TuneResult> {
  const evaluate = (patch: NumbersPatch) => isolated<Evaluated>(SELF, 'evaluatePatch', [ctx, patch, kit]);
  const start = await evaluate(opts.start ?? {});
  let best = start;
  const steps: TuneStep[] = [];
  for (let s = 0; s < (opts.maxSteps ?? 6) && best.score.total > 0; s++) {
    const knobs = knobsFor(kit, best.patch, opts.only);
    const tried = await pool(knobs, k => evaluate({ ...best.patch, [k.card]: k.patch }).then(e => ({ k, e })));
    const winner = tried.reduce((a, b) => (b.e.score.total < a.e.score.total ? b : a), tried[0]);
    if (!winner || winner.e.score.total >= best.score.total) break;
    best = winner.e;
    const step = { knob: winner.k.label, score: best.score };
    steps.push(step);
    opts.onStep?.(step, tried.length);
  }
  return { kit, start, best, steps };
}

/** A main kit's attack, defense or Focus, for printing a patch. */
export function describePatch(patch: NumbersPatch): string[] {
  return Object.entries(patch).map(([id, p]) => {
    const a = cardById(id);
    const type = a?.actionType === ActionType.Atac ? 'Atac' : a?.actionType === ActionType.Defensa ? 'Defensa' : 'Focus';
    const parts = [
      ...(p.dice ? [`${a?.dice} → ${p.dice}`] : []),
      ...Object.entries(p.params ?? {}).map(([k, v]) => {
        const [i, name] = k.split('.');
        return `${a?.effects[Number(i)]?.type}.${name} ${a?.effects[Number(i)]?.params?.[name]} → ${v}`;
      }),
    ];
    return `${a?.name ?? id} (${type}): ${parts.join(', ')}`;
  });
}
