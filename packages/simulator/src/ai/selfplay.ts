/**
 * Self-play: generate labelled positions, fit the value model, repeat.
 *
 * Each iteration plays games with the CURRENT model driving the search,
 * records the position at the start of every round for both sides, and labels
 * every one of them with that game's eventual result. Refitting on that data
 * gives a model that understands the positions strong play actually reaches —
 * which is the whole point, since a model trained on random play would tell us
 * what matters in games nobody would play.
 */
import {
  AIStrategy, CombatEngine, EffectRegistry, assignStrategies, Character,
} from '@pimpampum/engine';
import { positionFeatures } from './features.js';
import { TrainingSample, ValueModel } from './value.js';
import { bestResponse, legalActions } from './search.js';

export interface SelfPlayOptions {
  registry: EffectRegistry;
  model: ValueModel;
  /** Games per iteration. */
  games: number;
  /** Search settings used while generating data (cheaper than the final AI). */
  samples?: number;
  passes?: number;
  maxRounds?: number;
  /** Build one matchup: fresh characters each game. */
  matchup: () => { players: Character[]; enemies: Character[] };
  /** Exploration: play a random legal card this often, so the data covers
   *  positions the greedy policy would never visit. */
  epsilon?: number;
}

export interface SelfPlayResult {
  samples: TrainingSample[];
  winrate: number;
  avgRounds: number;
}

/** Play `games` self-play combats and collect labelled positions. */
export function generateSelfPlay(opts: SelfPlayOptions): SelfPlayResult {
  const samples: TrainingSample[] = [];
  const epsilon = opts.epsilon ?? 0.15;
  let wins = 0, rounds = 0;

  for (let g = 0; g < opts.games; g++) {
    const { players, enemies } = opts.matchup();
    assignStrategies(players, [AIStrategy.Power, AIStrategy.Aggro, AIStrategy.Protect]);
    const engine = new CombatEngine(players, enemies, {
      registry: opts.registry,
      maxRounds: opts.maxRounds ?? 40,
    });

    // Both sides search; positions are recorded for both perspectives.
    const perGame: { features: number[]; team: number; round: number }[] = [];
    let guard = 0;
    while (!engine.isOver() && engine.round < engine.maxRounds && guard++ < 60) {
      for (const team of [0, 1]) perGame.push({
        features: positionFeatures(engine, team), team, round: engine.round,
      });

      engine.prepareRound();
      const selections: { team: number; idx: number; actionIdx: number }[] = [];
      for (const team of [0, 1]) {
        const searched = bestResponse(engine, team, {
          registry: opts.registry,
          model: opts.model,
          samples: opts.samples ?? 4,
          passes: opts.passes ?? 1,
          depth: 1,
        }).choices;
        for (const [actor, actionIdx] of searched) {
          const idx = engine.teams[team].indexOf(actor);
          if (idx < 0) continue;
          // ε-greedy exploration widens the state distribution we train on.
          let chosen = actionIdx;
          if (Math.random() < epsilon) {
            const legal = legalActions(engine, actor);
            if (legal.length > 0) chosen = legal[Math.floor(Math.random() * legal.length)];
          }
          selections.push({ team, idx, actionIdx: chosen });
        }
      }
      engine.planActions(selections);
      let step = engine.resolveNextAction();
      let inner = 0;
      while (step.kind !== 'done' && inner++ < 400) {
        if (step.kind === 'target') engine.setResolveTarget([]);
        step = engine.resolveNextAction();
      }
      engine.finishRound();
    }

    const winner = engine.winner();
    if (winner === 0) wins++; else if (winner === null) wins += 0.5;
    rounds += engine.round;

    const lastRound = Math.max(1, engine.round);
    for (const p of perGame) {
      const label = winner === null ? 0.5 : winner === p.team ? 1 : 0;
      // Late positions predict the result far better than the opening does;
      // weighting by how far in they are keeps early noise from dominating.
      samples.push({ features: p.features, label, weight: 0.4 + 0.6 * (p.round / lastRound) });
    }
  }

  return { samples, winrate: wins / opts.games, avgRounds: rounds / opts.games };
}

/** One full iteration: generate data with the current model, then refit it. */
export function trainIteration(opts: SelfPlayOptions & { epochs?: number }): {
  loss: number; winrate: number; avgRounds: number; samples: number;
} {
  const gen = generateSelfPlay(opts);
  const loss = opts.model.fit(gen.samples, { epochs: opts.epochs ?? 25 });
  return { loss, winrate: gen.winrate, avgRounds: gen.avgRounds, samples: gen.samples.length };
}
