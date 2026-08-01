/**
 * The verdict run: what does STRONG play actually choose?
 *
 * Plays the same matchup with several policies and records, for the player
 * side only, how often each action TYPE and each card is picked. If the
 * search AI — which is far stronger than the alternatives — spends its turns
 * attacking, then attack-spam is near-optimal and the strategy triangle is
 * broken by design, not by a weak opponent model.
 *
 * Run: pnpm --filter @pimpampum/simulator exec tsx src/measure-mix.ts
 */
import {
  ActionType, AIStrategy, Character, CombatEngine, assignStrategies, withSeed,
} from '@pimpampum/engine';
import { buildReferenceParty } from '@pimpampum/skills';
import { createEnemy } from '@pimpampum/enemies';
import { REGISTRY } from './tests/helpers.js';
import { ValueModel } from './ai/value.js';
import { searchChooser, attackOnlyChooser, randomChooser } from './ai/search.js';

declare const process: { env: Record<string, string | undefined> };
const { readFileSync, existsSync } = await import('node:fs') as {
  readFileSync(p: string, e: string): string; existsSync(p: string): boolean;
};

const GAMES = Number(process.env.GAMES ?? 80);
const WEIGHTS = 'src/ai/weights.json';

const model = existsSync(WEIGHTS)
  ? ValueModel.fromJSON(JSON.parse(readFileSync(WEIGHTS, 'utf8')))
  : (() => { throw new Error('No trained weights — run train-ai.ts first.'); })();

/** ENEMY / COUNT / EPV pick the matchup so the verdict can be checked on more
 *  than one shape of fight (a swarm, an elite squad, a lone boss). */
const ENEMY = process.env.ENEMY ?? 'goblin';
const COUNT = Number(process.env.COUNT ?? 6);
const EPV = Number(process.env.EPV ?? 17);
const ELEVEL = process.env.ELEVEL ? Number(process.env.ELEVEL) : undefined;

function matchup(): { players: Character[]; enemies: Character[] } {
  return {
    players: buildReferenceParty({ count: 4, levels: 6, armor: 1 }),
    enemies: Array.from({ length: COUNT }, (_, k) =>
      createEnemy(ENEMY, { level: ELEVEL, name: `${ENEMY} ${k + 1}`, pv: EPV })!),
  };
}

interface Mix {
  label: string;
  winrate: number;
  byType: Record<string, number>;
  byCard: Map<string, { plays: number; wins: number; name: string; type: string }>;
  rounds: number;
}

const TYPE_LABEL: Record<string, string> = {
  [String(ActionType.Atac)]: 'Atac',
  [String(ActionType.Defensa)]: 'Defensa',
  [String(ActionType.Focus)]: 'Focus',
};
const typeName = (t: ActionType): string => TYPE_LABEL[String(t)] ?? '?';

/**
 * Drive the combat round by round so we can see exactly what the PLAYER side
 * committed to each round — engine stats lump both teams together.
 */
function measure(label: string, chooser: ((e: CombatEngine, a: Character) => number | null) | null, seed: number): Mix {
  const byType: Record<string, number> = { Atac: 0, Defensa: 0, Focus: 0 };
  const byCard = new Map<string, { plays: number; wins: number; name: string; type: string }>();
  let wins = 0, rounds = 0;

  withSeed(seed, () => {
    for (let g = 0; g < GAMES; g++) {
      const { players, enemies } = matchup();
      assignStrategies(players, [AIStrategy.Power, AIStrategy.Aggro, AIStrategy.Protect]);
      const engine = new CombatEngine(players, enemies, {
        registry: REGISTRY, maxRounds: 40, actionChooser: chooser ?? undefined,
      });
      const played: string[] = [];
      let guard = 0;
      while (!engine.isOver() && engine.round < engine.maxRounds && guard++ < 60) {
        engine.prepareRound();
        engine.planActions([]);   // every actor uses its policy
        for (const c of engine.teams[0]) {
          if (!c.isAlive() || c.playedActionIdx === null) continue;
          const def = c.actions[c.playedActionIdx]?.def;
          if (!def || def.lastResort) continue;
          byType[typeName(def.actionType)]++;
          played.push(def.id);
          if (!byCard.has(def.id)) {
            byCard.set(def.id, { plays: 0, wins: 0, name: def.name, type: typeName(def.actionType) });
          }
        }
        let step = engine.resolveNextAction();
        let inner = 0;
        while (step.kind !== 'done' && inner++ < 400) {
          if (step.kind === 'target') engine.setResolveTarget([]);
          step = engine.resolveNextAction();
        }
        engine.finishRound();
      }
      const w = engine.winner();
      const won = w === 0 ? 1 : w === null ? 0.5 : 0;
      wins += won;
      rounds += engine.round;
      for (const id of played) {
        const e = byCard.get(id)!;
        e.plays++; e.wins += won;
      }
    }
  });

  return { label, winrate: wins / GAMES, byType, byCard, rounds: rounds / GAMES };
}

const search = searchChooser({ registry: REGISTRY, model, samples: 6, passes: 2, depth: 1 }, [0]);

const results = [
  measure('random legal', randomChooser([0]), 909),
  measure('attack-only', attackOnlyChooser([0]), 909),
  measure('built-in heuristic', null, 909),
  measure('SEARCH (strong)', search, 909),
];

console.log(`Player-side action mix, ${GAMES} games each (4 players vs ${COUNT}× ${ENEMY} @ pv${EPV})\n`);
console.log('policy                winrate  rounds │  Atac   Defensa   Focus');
for (const r of results) {
  const total = Math.max(1, r.byType.Atac + r.byType.Defensa + r.byType.Focus);
  const pct = (n: number) => `${((100 * n) / total).toFixed(0)}%`.padStart(6);
  console.log(
    `${r.label.padEnd(20)} ${(r.winrate * 100).toFixed(0).padStart(5)}%  ${r.rounds.toFixed(1).padStart(5)}  │`
    + `${pct(r.byType.Atac)}  ${pct(r.byType.Defensa)}  ${pct(r.byType.Focus)}`,
  );
}

const strong = results[results.length - 1];
console.log(`\nWhat the strong AI actually plays (top cards, ${GAMES} games):\n`);
console.log('  card                       plays   win%   type');
[...strong.byCard.entries()]
  .sort((a, b) => b[1].plays - a[1].plays)
  .slice(0, 18)
  .forEach(([, e]) => {
    console.log(
      `  ${e.name.padEnd(26)} ${String(e.plays).padStart(5)}  ${((100 * e.wins) / e.plays).toFixed(0).padStart(4)}%   ${e.type}`,
    );
  });

console.log('\nVERDICT');
const atacPct = (100 * strong.byType.Atac)
  / Math.max(1, strong.byType.Atac + strong.byType.Defensa + strong.byType.Focus);
if (atacPct > 85) {
  console.log(`  Strong play is ${atacPct.toFixed(0)}% attacks → ATTACK-SPAM IS NEAR-OPTIMAL.`);
  console.log('  The strategy triangle is broken: defense and focus are not competitive.');
} else {
  console.log(`  Strong play is ${atacPct.toFixed(0)}% attacks, ${(100 - atacPct).toFixed(0)}% defense+focus`);
  console.log('  → the triangle holds; the old heuristic AI simply undervalued them.');
}
