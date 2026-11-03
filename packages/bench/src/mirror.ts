/**
 * MIRRORS — heroes against heroes at one level, the units the kit gate reads
 * (playtest `gate.ts`): one kit's fights, the styles' duels, and one kit's card
 * values, each cached on the content it plays.
 *
 * WHY HEROES: a kit cell fights creatures, and what keeps a kit out of the
 * livable zone mostly shows only when heroes meet heroes — two defense-heavy
 * sides stalling, a turtle that out-waits a reading AI, a card that is never
 * the right play against a side that can answer it.
 *
 * The table's shape: 2v2, every hero at the same level, the set's main kits
 * drawn at random (repeats allowed), equipped as the set's benchmark heroes.
 */
import {
  ActionType, availableActionIndices, CombatEngine, ROUND_CAP, random, setAIControlled, withSeed, type Character,
} from '@pimpampum/engine';
import { aiPolicy, DEFAULT_LOOKAHEAD, lookaheadChooser } from '@pimpampum/ai';
import { theRegistry } from './arena.js';
import { countedCached, key, skillPrint } from './cache.js';
import { CELL_AI } from './cells.js';
import { theSet } from './gameset.js';
import { leaning, STYLE_SHARE, type Chooser } from './policies.js';
import { DEFAULT_REGRET, valuePosition, type CardObs, type KitValues, type RegretOptions } from './regret.js';

const TARGETS = aiPolicy(CELL_AI).targetChooser;
export const MIRROR_SEED_BASE = 616_000;

/** The set's benchmark heroes (`GameSet.hero`): EQUIPPED, so a weapon kit holds its weapon. */
function heroes(kits: readonly string[], level: number, side: string): Character[] {
  const set = theSet();
  const team = set.buildParty({ characters: kits.map((k, i) => set.hero(`${side}${i + 1}`, k, level)) });
  setAIControlled(team);
  return team;
}

const drawKit = (kits: readonly string[]): string => kits[Math.floor(random() * kits.length)];

/** Every main kit's content, so a mirror's cache entry follows any kit it may meet. */
function mainKitsPrint(): string {
  return theSet().calibration.mainKits.map(skillPrint).join('|');
}

function kitSeed(kit: string, level: number, salt: number): number {
  let h = 0;
  for (const ch of kit) h = (h * 31 + ch.charCodeAt(0)) % 100_003;
  return MIRROR_SEED_BASE + salt * 1_000_003 + level * 7_919 + h;
}

/** One fight as the gate reads it, from the kit's side. */
export interface KitFight { rounds: number; capped: boolean; won: number }

/**
 * `fights` fights at `level`: the kit and a random partner against two random
 * kits, the kit's side alternating seats. `won` is 1, ½ for a mutual wipe or a
 * stall, 0.
 */
export function kitMirrors(kit: string, level: number, fights: number): KitFight[] {
  return countedCached('mirror-fights', key('mirror-fights-v1', mainKitsPrint(), kit, String(level), String(fights)), () => {
    const kits = theSet().calibration.mainKits;
    const out: KitFight[] = [];
    withSeed(kitSeed(kit, level, 1), () => {
      for (let f = 0; f < fights; f++) {
        const mine = heroes([kit, drawKit(kits)], level, 'K');
        const theirs = heroes([drawKit(kits), drawKit(kits)], level, 'F');
        const side = f % 2;
        const e = new CombatEngine(side === 0 ? mine : theirs, side === 0 ? theirs : mine, {
          registry: theRegistry(), maxRounds: ROUND_CAP, ...aiPolicy(CELL_AI),
        });
        const res = e.runCombat();
        out.push({ rounds: e.round, capped: !!res.capped, won: res.capped || res.winner === null ? 0.5 : res.winner === side ? 1 : 0 });
      }
    });
    return out;
  });
}

/** A style the gate pits against another: the production AI, a lean
 *  (`leaning`), or a hard restriction to one card type. */
export type DuelStyle = 'ai' | 'Power' | 'Protect' | 'Aggro' | 'turtle';

function chooserFor(style: DuelStyle): Chooser {
  switch (style) {
    case 'ai': return lookaheadChooser(DEFAULT_LOOKAHEAD);
    case 'Power': return leaning(ActionType.Focus, STYLE_SHARE);
    case 'Protect': return leaning(ActionType.Defensa, STYLE_SHARE);
    case 'Aggro': return leaning(ActionType.Atac, STYLE_SHARE);
    case 'turtle': return lookaheadChooser({ ...DEFAULT_LOOKAHEAD, restrictTo: [ActionType.Defensa] });
  }
}

/** X's score against Y (draws and stalls ½) over `games` mirror fights. */
export interface StyleDuel { x: DuelStyle; y: DuelStyle; level: number; score: number; stalls: number; games: number }

/**
 * `games` fights at `level` between two sides fielding the SAME random pair of
 * kits, one played as `x` and the other as `y`, seats alternating.
 */
export function styleDuel(x: DuelStyle, y: DuelStyle, level: number, games: number): StyleDuel {
  return countedCached('mirror-duel', key('mirror-duel-v1', mainKitsPrint(), x, y, String(level), String(games)), () => {
    const kits = theSet().calibration.mainKits;
    let score = 0, stalls = 0;
    withSeed(kitSeed(`${x}>${y}`, level, 2), () => {
      for (let f = 0; f < games; f++) {
        const pair = [drawKit(kits), drawKit(kits)];
        const xSide = f % 2;
        const X = chooserFor(x), Y = chooserFor(y);
        const e = new CombatEngine(heroes(pair, level, 'A'), heroes(pair, level, 'B'), {
          registry: theRegistry(), maxRounds: ROUND_CAP, targetChooser: TARGETS,
          actionChooser: (en, c) => (c.team === xSide ? X : Y)(en, c),
        });
        const res = e.runCombat();
        if (res.capped) stalls++;
        score += res.capped || res.winner === null ? 0.5 : res.winner === xSide ? 1 : 0;
      }
    });
    return { x, y, level, score: score / games, stalls: stalls / games, games };
  });
}

/** One kit's card values in mirrors, and how often the AI played each card
 *  where it was legal (`isBlindSpot` reads both). */
export interface MirrorCardValues {
  values: KitValues;
  legal: Record<string, number>;
  played: Record<string, number>;
}

/** JSON-shaped for the cache. */
interface StoredCardValues { obs: [string, CardObs[]][]; costs: KitValues['costs']; positions: number; fights: number; legal: Record<string, number>; played: Record<string, number> }

/**
 * Every decision of the kit's hero in `fights` mirror fights at `level`
 * (the kit and a random partner against two random kits), priced by
 * `valuePosition` — the same counterfactual rollouts as a kit cell's card
 * values, against heroes instead of creatures.
 */
export function kitMirrorCardValues(kit: string, level: number, fights: number, opts: Omit<RegretOptions, 'team'> = DEFAULT_REGRET): MirrorCardValues {
  const stored = countedCached<StoredCardValues>('mirror-cards',
    key('mirror-cards-v1', mainKitsPrint(), kit, String(level), String(fights), JSON.stringify(opts)), () => {
      const kits = theSet().calibration.mainKits;
      const byCard = new Map<string, CardObs[]>();
      const costs: KitValues['costs'] = [];
      const legal: Record<string, number> = {};
      const played: Record<string, number> = {};
      let positions = 0;
      withSeed(kitSeed(kit, level, 3), () => {
        for (let f = 0; f < fights; f++) {
          const mine = heroes([kit, drawKit(kits)], level, 'K');
          const theirs = heroes([drawKit(kits), drawKit(kits)], level, 'F');
          const side = f % 2;
          const subject = mine[0];
          const look = lookaheadChooser(CELL_AI);
          const e = new CombatEngine(side === 0 ? mine : theirs, side === 0 ? theirs : mine, {
            registry: theRegistry(), maxRounds: ROUND_CAP, targetChooser: TARGETS,
            actionChooser: (en, c) => {
              const i = look(en, c);
              // A decision is a round the hero had two cards or more to choose from.
              const options = c === subject ? availableActionIndices(c, en.registry) : [];
              if (options.length >= 2) {
                for (const o of options) {
                  const id = c.actions[o]?.def.id;
                  if (id) legal[id] = (legal[id] ?? 0) + 1;
                }
                const id = i === null || i === undefined ? undefined : c.actions[i]?.def.id;
                if (id) played[id] = (played[id] ?? 0) + 1;
              }
              return i;
            },
          });
          while (!e.isOver() && e.round < e.maxRounds) {
            if (subject.isAlive()) {
              const priced = valuePosition(e, subject, { ...opts, team: side });
              if (priced) costs.push({ cost: priced.choiceCost, fight: f });
              if (priced?.cards.length) {
                positions++;
                for (const c of priced.cards) {
                  const list = byCard.get(c.id) ?? [];
                  list.push({ value: c.value, winValue: c.winValue, wasBest: c.wasBest, gainsWhenBest: c.gainsWhenBest, fight: f });
                  byCard.set(c.id, list);
                }
              }
            }
            e.runRound();
          }
        }
      });
      return { obs: [...byCard], costs, positions, fights, legal, played };
    });
  return {
    values: { byCard: new Map(stored.obs), costs: stored.costs, positions: stored.positions, fights: stored.fights },
    legal: stored.legal, played: stored.played,
  };
}
