/**
 * Policy distillation: teach the cheap linear policy to imitate the expensive
 * search AI.
 *
 * The search AI is far too slow for the balancer (it clones and replays whole
 * rounds per candidate card). So we let it play, record every decision as
 * "these were the legal cards, THIS is the one strong play picked", and fit a
 * softmax classifier over generic action features to reproduce those picks.
 *
 * The output is a weight vector pasted into engine `policy.ts`, after which
 * the balancer gets most of the strong AI's judgement for the price of one dot
 * product per card.
 *
 * Run: pnpm --filter @pimpampum/simulator exec tsx src/distil-ai.ts
 */
import {
  AIStrategy, Character, CombatEngine, LearnedPolicy, assignStrategies,
  policyContext, policyFeatures, POLICY_FEATURE_COUNT, POLICY_FEATURE_NAMES, withSeed,
} from '@pimpampum/engine';
import { buildReferenceParty } from '@pimpampum/skills';
import { createEnemy } from '@pimpampum/enemies';
import { REGISTRY } from './tests/helpers.js';
import { ValueModel } from './ai/value.js';
import { bestResponse, legalActions, attackOnlyChooser } from './ai/search.js';

declare const process: { env: Record<string, string | undefined> };
const { readFileSync, writeFileSync, existsSync } = await import('node:fs') as {
  readFileSync(p: string, e: string): string;
  writeFileSync(p: string, d: string): void;
  existsSync(p: string): boolean;
};

const GAMES = Number(process.env.GAMES ?? 60);
const VALUE_WEIGHTS = 'src/ai/weights.json';
const OUT = 'src/ai/policy-weights.json';

const value = existsSync(VALUE_WEIGHTS)
  ? ValueModel.fromJSON(JSON.parse(readFileSync(VALUE_WEIGHTS, 'utf8')))
  : (() => { throw new Error('No value weights — run train-ai.ts first.'); })();

/** A range of matchups so the policy generalises past one fight shape. */
const MATCHUPS: { label: string; enemy: string; count: number; pv: number }[] = [
  { label: 'goblin swarm', enemy: 'goblin', count: 6, pv: 17 },
  { label: 'wolf pack', enemy: 'wolf', count: 6, pv: 45 },
  { label: 'golem squad', enemy: 'stone-golem', count: 3, pv: 18 },
  { label: 'devil boss', enemy: 'horned-devil', count: 1, pv: 118 },
  { label: 'shaman squad', enemy: 'goblin-shaman', count: 3, pv: 25 },
];

function build(m: (typeof MATCHUPS)[number]): { players: Character[]; enemies: Character[] } {
  return {
    players: buildReferenceParty({ count: 4, levels: 6, armor: 1 }),
    enemies: Array.from({ length: m.count }, (_, k) =>
      createEnemy(m.enemy, { name: `${m.enemy} ${k + 1}`, pv: m.pv })!),
  };
}

/** One decision: the features of every legal card, and which one was chosen. */
interface Demo { candidates: number[][]; ids: string[]; chosen: number }

// ---------------------------------------------------------------- collection
const demos: Demo[] = [];
console.log(`Collecting demonstrations from the search AI (${GAMES} games × ${MATCHUPS.length} matchups)\n`);

for (const m of MATCHUPS) {
  const t0 = Date.now();
  let collected = 0;
  withSeed(4242, () => {
    for (let g = 0; g < GAMES; g++) {
      const { players, enemies } = build(m);
      assignStrategies(players, [AIStrategy.Power, AIStrategy.Aggro, AIStrategy.Protect]);
      const engine = new CombatEngine(players, enemies, { registry: REGISTRY, maxRounds: 40 });
      let guard = 0;
      while (!engine.isOver() && engine.round < engine.maxRounds && guard++ < 40) {
        const choices = bestResponse(engine, 0, {
          registry: REGISTRY, model: value, samples: 5, passes: 2, depth: 1,
        }).choices;

        // Record the decision BEFORE the round mutates the position.
        for (const [actor, chosenIdx] of choices) {
          const legal = legalActions(engine, actor).filter(i => !actor.actions[i].def.lastResort);
          if (legal.length < 2 || !legal.includes(chosenIdx)) continue;
          const ctx = policyContext(actor, engine.teams[0], engine.teams[1], { round: engine.round, maxRounds: engine.maxRounds });
          demos.push({
            candidates: legal.map(i =>
              policyFeatures(actor.actions[i].def, actor.getEffectiveSpeed(actor.actions[i]), ctx)),
            ids: legal.map(i => actor.actions[i].def.id),
            chosen: legal.indexOf(chosenIdx),
          });
          collected++;
        }

        engine.prepareRound();
        engine.planActions([...choices.entries()].map(([actor, actionIdx]) => ({
          team: 0, idx: engine.teams[0].indexOf(actor), actionIdx,
        })).filter(s => s.idx >= 0));
        let step = engine.resolveNextAction();
        let inner = 0;
        while (step.kind !== 'done' && inner++ < 400) {
          if (step.kind === 'target') engine.setResolveTarget([]);
          step = engine.resolveNextAction();
        }
        engine.finishRound();
      }
    }
  });
  console.log(`  ${m.label.padEnd(14)} ${String(collected).padStart(5)} decisions  (${((Date.now() - t0) / 1000).toFixed(1)}s)`);
}
console.log(`\n${demos.length} demonstrations collected.`);

// ------------------------------------------------------------------ training
/**
 * Softmax regression: maximise the probability the policy assigns to the card
 * the search AI actually chose, among that decision's legal alternatives.
 */
function fit(samples: Demo[], epochs = 60, lr0 = 0.3, l2 = 1e-4): { weights: number[]; bias: Record<string, number>; loss: number; top1: number } {
  const w = new Array(POLICY_FEATURE_COUNT).fill(0);
  // Generic features cannot express "this particular card is strong", which is
  // a lot of what the search AI knows. A learned per-card bias carries that,
  // and stays content DATA rather than engine logic.
  const bias: Record<string, number> = {};
  const order = samples.map((_, i) => i);
  let loss = NaN, top1 = 0;

  for (let epoch = 0; epoch < epochs; epoch++) {
    for (let i = order.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [order[i], order[j]] = [order[j], order[i]];
    }
    const lr = lr0 / (1 + epoch * 0.08);
    let total = 0, correct = 0;
    for (const idx of order) {
      const s = samples[idx];
      const scores = s.candidates.map((f, c) => {
        let z = bias[s.ids[c]] ?? 0;
        for (let i = 0; i < w.length; i++) z += w[i] * f[i];
        return z;
      });
      const probs = LearnedPolicy.softmax(scores);
      // ∂loss/∂w = Σ_c (p_c − 1{c = chosen}) · f_c
      for (let c = 0; c < s.candidates.length; c++) {
        const g = probs[c] - (c === s.chosen ? 1 : 0);
        const f = s.candidates[c];
        for (let i = 0; i < w.length; i++) w[i] -= lr * (g * f[i] + l2 * w[i] / samples.length);
        const id = s.ids[c];
        bias[id] = (bias[id] ?? 0) - lr * (g + l2 * (bias[id] ?? 0));
      }
      total += -Math.log(Math.max(1e-9, probs[s.chosen]));
      let best = 0;
      for (let c = 1; c < scores.length; c++) if (scores[c] > scores[best]) best = c;
      if (best === s.chosen) correct++;
    }
    loss = total / samples.length;
    top1 = correct / samples.length;
  }
  return { weights: w, bias, loss, top1 };
}

const split = Math.floor(demos.length * 0.85);
const train = demos.slice(0, split);
const test = demos.slice(split);
const { weights, bias, loss, top1 } = withSeed(7, () => fit(train));

// Held-out agreement: how often the lean policy picks the search AI's card.
const policy = new LearnedPolicy(weights);
let heldCorrect = 0;
for (const s of test) {
  const scores = s.candidates.map((f, c) => policy.score(f) + (bias[s.ids[c]] ?? 0));
  let best = 0;
  for (let c = 1; c < scores.length; c++) if (scores[c] > scores[best]) best = c;
  if (best === s.chosen) heldCorrect++;
}
// Chance baseline: picking uniformly among the legal cards.
const chance = test.reduce((a, s) => a + 1 / s.candidates.length, 0) / Math.max(1, test.length);

console.log(`\ntrain loss ${loss.toFixed(4)}   train top-1 ${(top1 * 100).toFixed(1)}%`);
console.log(`held-out agreement ${((heldCorrect / Math.max(1, test.length)) * 100).toFixed(1)}%  (chance ${(chance * 100).toFixed(1)}%)`);
console.log('\nDistilled policy weights:');
weights
  .map((w, i) => ({ name: POLICY_FEATURE_NAMES[i], w }))
  .sort((a, b) => Math.abs(b.w) - Math.abs(a.w))
  .forEach(({ name, w }) => console.log(`  ${name.padEnd(24)} ${w >= 0 ? '+' : ''}${w.toFixed(3)}`));

writeFileSync(OUT, JSON.stringify({ weights, bias }));
console.log(`\nweights → ${OUT}`);

// Emit the runtime artifact the balancer imports. It lives in the CONTENT
// package, not the engine: the per-card bias is keyed by card id, and the
// engine is never allowed to know a card by name.
const artifact = `/**
 * Learned lean AI policy — GENERATED by simulator/src/distil-ai.ts.
 *
 * Distilled from the heavy lookahead AI (see that script). \`WEIGHTS\` scores the
 * generic action features the engine exposes; \`CARD_BIAS\` carries the
 * card-specific judgement generic features cannot express. Regenerate after
 * any card change — a stale bias is worse than none.
 */
export const POLICY_WEIGHTS: number[] = ${JSON.stringify(weights.map(x => Number(x.toFixed(4))))};

export const CARD_BIAS: Record<string, number> = ${JSON.stringify(
  Object.fromEntries(Object.entries(bias).map(([k, v]) => [k, Number((v as number).toFixed(4))])), null, 2)};
`;
writeFileSync('../enemies/src/ai-policy-data.ts', artifact);
console.log('artifact → packages/enemies/src/ai-policy-data.ts');

// ---------------------------------------------------------------- evaluation
function leanChooser(p: LearnedPolicy, teams: number[] = [0]) {
  return (engine: CombatEngine, actor: Character): number | null => {
    if (!teams.includes(actor.team)) return null;
    const legal: number[] = [];
    for (let i = 0; i < actor.actions.length; i++) {
      if (engine.canPlayActionIdx(actor, i) && !actor.actions[i].def.lastResort) legal.push(i);
    }
    if (legal.length === 0) return null;
    const ctx = policyContext(actor, engine.teams[actor.team], engine.teams[1 - actor.team], { round: engine.round, maxRounds: engine.maxRounds });
    let best = legal[0], bestScore = -Infinity;
    for (const i of legal) {
      const s = p.score(policyFeatures(actor.actions[i].def, actor.getEffectiveSpeed(actor.actions[i]), ctx))
        + (bias[actor.actions[i].def.id] ?? 0);
      if (s > bestScore) { bestScore = s; best = i; }
    }
    return best;
  };
}

function play(chooser: ((e: CombatEngine, a: Character) => number | null) | null, m: (typeof MATCHUPS)[number], games: number): number {
  return withSeed(31337, () => {
    let wins = 0;
    for (let i = 0; i < games; i++) {
      const { players, enemies } = build(m);
      assignStrategies(players, [AIStrategy.Power, AIStrategy.Aggro, AIStrategy.Protect]);
      const engine = new CombatEngine(players, enemies, {
        registry: REGISTRY, maxRounds: 40, actionChooser: chooser ?? undefined,
      });
      const w = engine.runCombat().winner;
      if (w === 0) wins++; else if (w === null) wins += 0.5;
    }
    return wins / games;
  });
}

const lean = leanChooser(policy);
const searchSlow = (engine: CombatEngine, actor: Character): number | null => {
  if (actor.team !== 0) return null;
  return bestResponse(engine, 0, { registry: REGISTRY, model: value, samples: 5, passes: 2, depth: 1 })
    .choices.get(actor) ?? null;
};

console.log('\nHow much of the search AI survived distillation (players only):\n');
console.log('matchup          built-in   attack-only   LEAN      search');
for (const m of MATCHUPS) {
  const g = 40;
  const b = play(null, m, g), a = play(attackOnlyChooser([0]), m, g);
  const l = play(lean, m, g), s = play(searchSlow, m, g);
  console.log(
    `${m.label.padEnd(15)} ${(b * 100).toFixed(0).padStart(6)}%  ${(a * 100).toFixed(0).padStart(10)}%`
    + `  ${(l * 100).toFixed(0).padStart(6)}%  ${(s * 100).toFixed(0).padStart(7)}%`,
  );
}
