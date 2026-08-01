/**
 * The decisive attack-spam test.
 *
 * An earlier run compared a crude "always swing the biggest dice" bot against
 * the search AI and concluded attack-spam was bad. That comparison was unfair
 * twice over: the attack bot was a weak POLICY (not the attack STRATEGY played
 * well), and the opponent was the built-in heuristic, against which defending
 * naturally looks better than it should.
 *
 * This asks the question properly. Both sides run the SAME search AI at the
 * same strength; the only difference is that one of them may only pick attack
 * cards. If the restricted player does as well as, or better than, the
 * unrestricted one, then attack-spam really is (at least) optimal and the
 * strategy triangle is broken. If it does clearly worse, defense and focus are
 * earning their place in strong play.
 *
 * Run: pnpm --filter @pimpampum/simulator exec tsx src/measure-verdict.ts
 */
import {
  ActionType, AIStrategy, Character, CombatEngine, assignStrategies, withSeed,
} from '@pimpampum/engine';
import { buildReferenceParty } from '@pimpampum/skills';
import { createEnemy } from '@pimpampum/enemies';
import { REGISTRY } from './tests/helpers.js';
import { ValueModel } from './ai/value.js';
import { searchChooser, bestResponse } from './ai/search.js';

declare const process: { env: Record<string, string | undefined> };
const { readFileSync, existsSync } = await import('node:fs') as {
  readFileSync(p: string, e: string): string; existsSync(p: string): boolean;
};

const GAMES = Number(process.env.GAMES ?? 40);
const WEIGHTS = 'src/ai/weights.json';
const model = existsSync(WEIGHTS)
  ? ValueModel.fromJSON(JSON.parse(readFileSync(WEIGHTS, 'utf8')))
  : (() => { throw new Error('No trained weights — run train-ai.ts first.'); })();

const MATCHUPS = [
  { label: 'goblin swarm', enemy: 'goblin', count: 6, pv: 17 },
  { label: 'golem squad', enemy: 'stone-golem', count: 3, pv: 18 },
  { label: 'devil boss', enemy: 'horned-devil', count: 1, pv: 118 },
];

function build(m: (typeof MATCHUPS)[number]): { players: Character[]; enemies: Character[] } {
  return {
    players: buildReferenceParty({ count: 4, levels: 6, armor: 1 }),
    enemies: Array.from({ length: m.count }, (_, k) =>
      createEnemy(m.enemy, { name: `${m.enemy} ${k + 1}`, pv: m.pv })!),
  };
}

const SEARCH = { registry: REGISTRY, model, samples: 5, passes: 2, depth: 1 } as const;

/** Both teams run the search; team 0 may be restricted to a card-type subset. */
function duel(restrictPlayers: ActionType[] | undefined, m: (typeof MATCHUPS)[number], games: number, seed: number) {
  const byType: Record<string, number> = { Atac: 0, Defensa: 0, Focus: 0 };
  const TYPE: Record<string, string> = {
    [String(ActionType.Atac)]: 'Atac',
    [String(ActionType.Defensa)]: 'Defensa',
    [String(ActionType.Focus)]: 'Focus',
  };
  const enemySearch = searchChooser({ ...SEARCH }, [1]);
  const chooser = (engine: CombatEngine, actor: Character): number | null => {
    if (actor.team === 1) return enemySearch(engine, actor);
    return bestResponse(engine, 0, { ...SEARCH, restrictTo: restrictPlayers }).choices.get(actor) ?? null;
  };

  const wins = withSeed(seed, () => {
    let w = 0;
    for (let g = 0; g < games; g++) {
      const { players, enemies } = build(m);
      assignStrategies(players, [AIStrategy.Power, AIStrategy.Aggro, AIStrategy.Protect]);
      const engine = new CombatEngine(players, enemies, {
        registry: REGISTRY, maxRounds: 40, actionChooser: chooser,
      });
      let guard = 0;
      while (!engine.isOver() && engine.round < engine.maxRounds && guard++ < 60) {
        engine.prepareRound();
        engine.planActions([]);
        for (const c of engine.teams[0]) {
          if (!c.isAlive() || c.playedActionIdx === null) continue;
          const def = c.actions[c.playedActionIdx]?.def;
          if (!def || def.lastResort) continue;
          byType[TYPE[String(def.actionType)] ?? '?']++;
        }
        let step = engine.resolveNextAction();
        let inner = 0;
        while (step.kind !== 'done' && inner++ < 400) {
          if (step.kind === 'target') engine.setResolveTarget([]);
          step = engine.resolveNextAction();
        }
        engine.finishRound();
      }
      const r = engine.winner();
      if (r === 0) w++; else if (r === null) w += 0.5;
    }
    return w;
  });
  const total = Math.max(1, byType.Atac + byType.Defensa + byType.Focus);
  return {
    winrate: wins / games,
    mix: {
      atac: byType.Atac / total, defensa: byType.Defensa / total, focus: byType.Focus / total,
    },
  };
}

console.log(`Attack-spam verdict — BOTH sides play the search AI, ${GAMES} games per cell.`);
console.log('Team 0 is either unrestricted or may only play Atac cards.\n');
console.log('matchup           full-search   attack-only   delta   full mix (A/D/F)');

let anyAttackWins = false;
for (const m of MATCHUPS) {
  const full = duel(undefined, m, GAMES, 2024);
  const atk = duel([ActionType.Atac], m, GAMES, 2024);
  const delta = atk.winrate - full.winrate;
  if (delta >= -0.03) anyAttackWins = true;
  console.log(
    `${m.label.padEnd(16)} ${(full.winrate * 100).toFixed(0).padStart(9)}%  ${(atk.winrate * 100).toFixed(0).padStart(11)}%  `
    + `${(delta * 100 >= 0 ? '+' : '')}${(delta * 100).toFixed(0).padStart(4)}pp   `
    + `${(full.mix.atac * 100).toFixed(0)}/${(full.mix.defensa * 100).toFixed(0)}/${(full.mix.focus * 100).toFixed(0)}`,
  );
}

console.log(`
VERDICT`);
if (anyAttackWins) {
  console.log('  Restricting a STRONG player to attacks costs it little or nothing.');
  console.log('  → ATTACK-SPAM IS (at least) OPTIMAL. The triangle needs fixing.');
} else {
  console.log('  A strong player restricted to attacks loses substantial winrate in every');
  console.log('  matchup, against an equally strong opponent.');
  console.log('  → attack-spam is NOT optimal; defense and focus earn their place.');
}
