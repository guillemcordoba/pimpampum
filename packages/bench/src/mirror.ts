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
import { aiPolicy, DEFAULT_LOOKAHEAD, lookaheadChooser, opponentModel } from '@pimpampum/ai';
import { theRegistry } from './arena.js';
import { countedCached, key, skillPrint } from './cache.js';
import { CELL_AI } from './cells.js';
import { heroPVPrint, theSet } from './gameset.js';
import { variantPV, variantRules, type DamageSource, type Variant } from './dynamics.js';
import { leaning, spam, STYLE_SHARE, uniform, type Chooser } from './policies.js';
import { DEFAULT_REGRET, REGRET_CHUNK, valuePosition, type CardObs, type KitValues, type RegretOptions } from './regret.js';

const TARGETS = aiPolicy(CELL_AI).targetChooser;
export const MIRROR_SEED_BASE = 616_000;

/** The set's benchmark heroes (`GameSet.hero`): EQUIPPED, so a weapon kit holds its weapon. */
function heroes(kits: readonly string[], level: number, side: string, variant: Variant = {}): Character[] {
  const set = theSet();
  const team = set.buildParty({ characters: kits.map((k, i) => { const pv = variantPV(variant, k, level); return { ...set.hero(`${side}${i + 1}`, k, level), ...(pv ? { pv } : {}) }; }) });
  setAIControlled(team);
  return team;
}

const drawKit = (kits: readonly string[]): string => kits[Math.floor(random() * kits.length)];

/** Every main kit's content, so a mirror's cache entry follows any kit it may meet. */
function mainKitsPrint(): string {
  return `${theSet().calibration.mainKits.map(skillPrint).join('|')}#pv:${heroPVPrint()}`;
}

function kitSeed(kit: string, level: number, salt: number): number {
  let h = 0;
  for (const ch of kit) h = (h * 31 + ch.charCodeAt(0)) % 100_003;
  return MIRROR_SEED_BASE + salt * 1_000_003 + level * 7_919 + h;
}

/** One fight as the gate reads it, from the kit's side. */
export interface KitFight { rounds: number; capped: boolean; won: number; partner: string; foes: string[] }

/** What happened in a set of fights, for telling WHY they ran long. */
export interface MirrorAutopsy {
  fights: number;
  /** Rounds played and PV lost by everyone over them. */
  rounds: number; pvLost: number;
  /** Cards resolved, by type; attacks that took no PV from anyone (held,
   *  absorbed, or aimed at nothing); Focus cards that never resolved
   *  (interrupted or cancelled). */
  attacks: number; emptyAttacks: number; defenses: number; focus: number; focusLost: number;
  /** Cards resolved after round `lateRound`, by id: what a long fight is made of. */
  late: Record<string, number>;
}

export interface KitMirrorRun {
  fights: KitFight[];
  /** The fights past `lateRound` (stalls included), and the rest. */
  long: MirrorAutopsy; short: MirrorAutopsy;
}

const emptyAutopsy = (): MirrorAutopsy => ({ fights: 0, rounds: 0, pvLost: 0, attacks: 0, emptyAttacks: 0, defenses: 0, focus: 0, focusLost: 0, late: {} });

/**
 * `fights` fights at `level`: the kit and a random partner against two random
 * kits, the kit's side alternating seats. `won` is 1, ½ for a mutual wipe or a
 * stall, 0. Played step by step so each card's outcome can be read; the same
 * rounds `runRound` plays.
 */
/** `withoutCard`: taken out of the kit's hero's hand — what that one card does
 *  to the kit's fights (a failing requirement's blame, playtest `gate.ts`). */
export function kitMirrors(kit: string, level: number, fights: number, lateRound: number, withoutCard?: string, variant: Variant = {}): KitMirrorRun {
  const v = Object.keys(variant).length ? JSON.stringify(variant) : '';
  return countedCached('mirror-fights', key('mirror-fights-v2', mainKitsPrint(), kit, String(level), String(fights), String(lateRound), withoutCard ?? '', v), () => {
    const kits = theSet().calibration.mainKits;
    const out: KitFight[] = [];
    const long = emptyAutopsy(), short = emptyAutopsy();
    withSeed(kitSeed(kit, level, 1), () => {
      for (let f = 0; f < fights; f++) {
        const partner = drawKit(kits);
        const foes = [drawKit(kits), drawKit(kits)];
        const mine = heroes([kit, partner], level, 'K', variant);
        const theirs = heroes(foes, level, 'F', variant);
        if (withoutCard) mine[0].actions = mine[0].actions.filter(x => x.def.id !== withoutCard);
        const side = f % 2;
        const e = new CombatEngine(side === 0 ? mine : theirs, side === 0 ? theirs : mine, {
          registry: theRegistry(), maxRounds: ROUND_CAP, ...variantRules(variant), ...aiPolicy(CELL_AI),
        });
        const a = emptyAutopsy();
        const total = () => e.teams.flat().reduce((t, c) => t + Math.max(0, c.currentPV), 0);
        while (!e.isOver() && e.round < e.maxRounds) {
          const startPV = total();
          e.prepareRound();
          e.planActions([]);
          for (;;) {
            const before = new Map(e.teams.flat().map(c => [c, c.currentPV]));
            const step = e.resolveNextAction();
            if (step.kind === 'done') break;
            if (step.kind === 'target') { e.setResolveTarget([]); continue; }
            if (step.kind === 'choice') { e.setResolveChoice(); continue; }
            const actor = e.teams[step.action.actorTeam]?.[step.action.actorIdx];
            const def = actor?.actions.find(x => x.def.id === step.action.actionId)?.def;
            if (!actor || !def) continue;
            if (def.actionType === ActionType.Focus) { a.focus++; if (step.action.cancelled) a.focusLost++; }
            if (step.action.cancelled) continue;
            if (def.actionType === ActionType.Defensa) a.defenses++;
            if (def.actionType === ActionType.Atac) {
              a.attacks++;
              const took = e.teams[1 - actor.team].some(c => (before.get(c) ?? 0) > c.currentPV);
              if (!took) a.emptyAttacks++;
            }
            if (e.round > lateRound) a.late[def.id] = (a.late[def.id] ?? 0) + 1;
          }
          e.finishRound();
          a.rounds++;
          a.pvLost += startPV - total();
        }
        const capped = !e.isOver();
        const winner = e.winner();
        out.push({ rounds: e.round, capped, won: capped || winner === null ? 0.5 : winner === side ? 1 : 0, partner, foes });
        const into = capped || e.round > lateRound ? long : short;
        into.fights++;
        for (const k of ['rounds', 'pvLost', 'attacks', 'emptyAttacks', 'defenses', 'focus', 'focusLost'] as const) into[k] += a[k];
        for (const [id, n] of Object.entries(a.late)) into.late[id] = (into.late[id] ?? 0) + n;
      }
    });
    return { fights: out, long, short };
  });
}

/** A style the gate pits against another: the production AI, a lean
 *  (`leaning`), or a dumb strategy (`DUMB_STYLES`). */
export type DuelStyle = 'ai' | 'Power' | 'Protect' | 'Aggro' | DumbStyle;
export type DumbStyle = 'turtle' | 'spam' | 'random';
/** What reading the opponents must beat (the user, 2026-11-04, restoring the
 *  old "thinking beats not thinking"): only defending, well chosen; always the
 *  biggest attack; any legal card. */
export const DUMB_STYLES: readonly DumbStyle[] = ['turtle', 'spam', 'random'];

function chooserFor(style: DuelStyle): Chooser {
  switch (style) {
    case 'ai': return lookaheadChooser(DEFAULT_LOOKAHEAD);
    case 'Power': return leaning(ActionType.Focus, STYLE_SHARE);
    case 'Protect': return leaning(ActionType.Defensa, STYLE_SHARE);
    case 'Aggro': return leaning(ActionType.Atac, STYLE_SHARE);
    case 'turtle': return lookaheadChooser({ ...DEFAULT_LOOKAHEAD, restrictTo: [ActionType.Defensa] });
    case 'spam': return spam;
    case 'random': return uniform;
  }
}

/** X's score against Y (draws and stalls ½) over `games` mirror fights, and
 *  the cards Y resolved, by id. */
export interface StyleDuel { x: DuelStyle; y: DuelStyle; level: number; score: number; stalls: number; games: number; yPlays: Record<string, number> }

/**
 * `games` fights at `level` between two sides fielding the SAME random pair of
 * kits, one played as `x` and the other as `y`, seats alternating.
 */
/**
 * `withoutCard`: taken out of the Y side's hands — how much of Y's showing
 * that card carries (a triangle edge's culprits, playtest `gate.ts`).
 */
export function styleDuel(
  x: DuelStyle, y: DuelStyle, level: number, games: number, withoutCard?: string,
  /** A candidate structure (bench `dynamics.ts`): the engine's options and a hero PV. */
  variant: Variant = {},
): StyleDuel {
  const v = Object.keys(variant).length ? JSON.stringify(variant) : '';
  return countedCached('mirror-duel', key('mirror-duel-v2', mainKitsPrint(), x, y, String(level), String(games), withoutCard ?? '', v), () => {
    const kits = theSet().calibration.mainKits;
    let score = 0, stalls = 0;
    const yPlays: Record<string, number> = {};
    withSeed(kitSeed(`${x}>${y}`, level, 2), () => {
      for (let f = 0; f < games; f++) {
        const pair = [drawKit(kits), drawKit(kits)];
        const xSide = f % 2;
        const X = chooserFor(x), Y = chooserFor(y);
        const teams = [heroes(pair, level, 'A', variant), heroes(pair, level, 'B', variant)];
        if (withoutCard) for (const c of teams[1 - xSide]) c.actions = c.actions.filter(a => a.def.id !== withoutCard);
        const e = new CombatEngine(teams[0], teams[1], {
          registry: theRegistry(), maxRounds: ROUND_CAP, targetChooser: TARGETS, ...variantRules(variant),
          actionChooser: (en, c) => {
            if (c.team === xSide) return X(en, c);
            const i = Y(en, c);
            const id = i === null || i === undefined ? undefined : c.actions[i]?.def.id;
            if (id) yPlays[id] = (yPlays[id] ?? 0) + 1;
            return i;
          },
        });
        const res = e.runCombat();
        if (res.capped) stalls++;
        score += res.capped || res.winner === null ? 0.5 : res.winner === xSide ? 1 : 0;
      }
    });
    return { x, y, level, score: score / games, stalls: stalls / games, games, yPlays };
  });
}

/** One side's play in a duel: what its guards met, where its blows landed,
 *  what came of its Focus cards, and where its damage came from. */
export interface DuelSide {
  plays: { attack: number; defense: number; focus: number };
  /** Focus cards that never resolved: their player was hurt first. */
  focusLost: number;
  /** Guards it put up; those an enemy attack was aimed at; of those, the ones
   *  whose body came through that round's enemy attacks unhurt. */
  guards: number; guardsFaced: number; guardsHeld: number;
  /** Its attacks' enemy targets: unguarded; guarded and unhurt; guarded and hurt. */
  blowsOpen: number; blowsHeld: number; blowsThrough: number;
  /** PV it took off the other side, by source. */
  dealt: Record<DamageSource, number>;
}

export interface DuelAutopsy { x: DuelStyle; y: DuelStyle; level: number; games: number; score: number; meanRounds: number; sides: { x: DuelSide; y: DuelSide } }

const emptySide = (): DuelSide => ({
  plays: { attack: 0, defense: 0, focus: 0 }, focusLost: 0, guards: 0, guardsFaced: 0, guardsHeld: 0, blowsOpen: 0, blowsHeld: 0, blowsThrough: 0,
  dealt: { open: 0, guarded: 0, area: 0, counter: 0, focus: 0, defense: 0, roundEnd: 0 },
});

/**
 * WHY ONE STYLE BEATS ANOTHER: `styleDuel`'s fights (the same draws, seats
 * alternating), stepped one card at a time and read per side — a broken
 * triangle edge's autopsy (playtest `gate.ts`).
 */
export function duelAutopsy(x: DuelStyle, y: DuelStyle, level: number, games: number): DuelAutopsy {
  return countedCached('mirror-autopsy', key('mirror-autopsy-v1', mainKitsPrint(), x, y, String(level), String(games)), () => {
    const kits = theSet().calibration.mainKits;
    const sides = { x: emptySide(), y: emptySide() };
    let score = 0, rounds = 0;
    withSeed(kitSeed(`${x}>${y}`, level, 2), () => {
      for (let f = 0; f < games; f++) {
        const pair = [drawKit(kits), drawKit(kits)];
        const xSide = f % 2;
        const X = chooserFor(x), Y = chooserFor(y);
        const e = new CombatEngine(heroes(pair, level, 'A'), heroes(pair, level, 'B'), {
          registry: theRegistry(), maxRounds: ROUND_CAP, targetChooser: TARGETS,
          actionChooser: (en, c) => (c.team === xSide ? X : Y)(en, c),
        });
        const everyone = e.teams.flat();
        const sideOf = (team: number) => (team === xSide ? sides.x : sides.y);
        while (!e.isOver() && e.round < e.maxRounds) {
          e.prepareRound();
          e.planActions([]);
          const guardsUp: { side: DuelSide; body: Character }[] = [];
          const hurtByAttacks = new Map<Character, number>();
          for (;;) {
            const before = new Map(everyone.map(c => [c, c.currentPV]));
            const guardCount = new Map(everyone.map(c => [c, c.guards.length]));
            const guarded = new Set(everyone.filter(c => c.guards.length > 0));
            const step = e.resolveNextAction();
            if (step.kind === 'done') break;
            if (step.kind === 'target') { e.setResolveTarget([]); continue; }
            if (step.kind === 'choice') { e.setResolveChoice(); continue; }
            const actor = e.teams[step.action.actorTeam]?.[step.action.actorIdx];
            const def = actor?.actions.find(a => a.def.id === step.action.actionId)?.def;
            if (!actor || !def) continue;
            const side = sideOf(actor.team), other = sideOf(1 - actor.team);
            const type = def.actionType;
            side.plays[type === ActionType.Atac ? 'attack' : type === ActionType.Defensa ? 'defense' : 'focus']++;
            if (step.action.cancelled) { if (type === ActionType.Focus) side.focusLost++; continue; }
            if (type === ActionType.Defensa) {
              for (const c of e.teams[actor.team]) {
                for (let i = guardCount.get(c) ?? 0; i < c.guards.length; i++) if (c.guards[i].defender === actor) { side.guards++; guardsUp.push({ side, body: c }); }
              }
            }
            for (const c of everyone) {
              const loss = Math.max(0, (before.get(c) ?? 0) - Math.max(0, c.currentPV));
              if (!loss) continue;
              if (c.team === actor.team) { other.dealt.counter += loss; continue; }
              const source: DamageSource = type === ActionType.Atac ? ((def.targetCount ?? 1) > 1 ? 'area' : guarded.has(c) ? 'guarded' : 'open')
                : type === ActionType.Focus ? 'focus' : 'defense';
              side.dealt[source] += loss;
              if (type === ActionType.Atac) hurtByAttacks.set(c, (hurtByAttacks.get(c) ?? 0) + loss);
            }
            if (type === ActionType.Atac) {
              const mine = e.plannedThisRound().find(p => p.actor === actor && p.action.id === def.id);
              for (const t of mine?.targets ?? []) {
                if (t.team === actor.team) continue;
                const lost = (before.get(t) ?? 0) - t.currentPV;
                if (!guarded.has(t)) side.blowsOpen++;
                else if (lost > 0) side.blowsThrough++;
                else side.blowsHeld++;
              }
            }
          }
          const plan = e.plannedThisRound();
          for (const { side, body } of guardsUp) {
            const faced = plan.some(p => !p.cancelled && p.actor.team !== body.team && p.action.actionType === ActionType.Atac && !!p.targets?.includes(body));
            if (!faced) continue;
            side.guardsFaced++;
            if (!hurtByAttacks.get(body)) side.guardsHeld++;
          }
          const beforeEnd = new Map(everyone.map(c => [c, c.currentPV]));
          e.finishRound();
          for (const c of everyone) sideOf(1 - c.team).dealt.roundEnd += Math.max(0, (beforeEnd.get(c) ?? 0) - Math.max(0, c.currentPV));
        }
        const w = e.winner();
        score += !e.isOver() || w === null ? 0.5 : w === xSide ? 1 : 0;
        rounds += e.round;
      }
    });
    return { x, y, level, games, score: score / games, meanRounds: rounds / games, sides };
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
export interface StoredCardValues { obs: [string, CardObs[]][]; costs: KitValues['costs']; positions: number; fights: number; legal: Record<string, number>; played: Record<string, number> }

/**
 * Every decision of the kit's hero in `fights` mirror fights at `level`
 * (the kit and a random partner against two random kits), priced by
 * `valuePosition` — the same counterfactual rollouts as a kit cell's card
 * values, against heroes instead of creatures. Measured in chunks of
 * `REGRET_CHUNK` fights, each its own job (`mirrorCardChunks`).
 */
export function kitMirrorCardValues(kit: string, level: number, fights: number, opts: Omit<RegretOptions, 'team'> = DEFAULT_REGRET): MirrorCardValues {
  const values: KitValues = { byCard: new Map(), costs: [], positions: 0, fights: 0 };
  const legal: Record<string, number> = {};
  const played: Record<string, number> = {};
  for (let chunk = 0; chunk < mirrorCardChunks(fights); chunk++) {
    const s = mirrorCardChunk(kit, level, fights, chunk, opts);
    for (const [id, list] of s.obs) values.byCard.set(id, [...(values.byCard.get(id) ?? []), ...list]);
    values.costs.push(...s.costs);
    values.positions += s.positions;
    values.fights += s.fights;
    for (const [id, n] of Object.entries(s.legal)) legal[id] = (legal[id] ?? 0) + n;
    for (const [id, n] of Object.entries(s.played)) played[id] = (played[id] ?? 0) + n;
  }
  return { values, legal, played };
}

/** How many jobs `kitMirrorCardValues` is split into. */
export function mirrorCardChunks(fights: number): number {
  return Math.ceil(fights / REGRET_CHUNK);
}

/** One chunk of `kitMirrorCardValues`, cached: what a warm job computes. Its
 *  fights keep their index in the whole sample (the cluster id). */
export function mirrorCardChunk(kit: string, level: number, total: number, chunk: number, opts: Omit<RegretOptions, 'team'> = DEFAULT_REGRET): StoredCardValues {
  const first = chunk * REGRET_CHUNK;
  const fights = Math.max(0, Math.min(REGRET_CHUNK, total - first));
  return countedCached<StoredCardValues>('mirror-cards',
    key('mirror-cards-v2', mainKitsPrint(), kit, String(level), String(total), String(chunk), JSON.stringify(opts)), () => {
      const kits = theSet().calibration.mainKits;
      const byCard = new Map<string, CardObs[]>();
      const costs: KitValues['costs'] = [];
      const legal: Record<string, number> = {};
      const played: Record<string, number> = {};
      let positions = 0;
      withSeed(kitSeed(kit, level, 3) + chunk * 100_003, () => {
        for (let f = first; f < first + fights; f++) {
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
}

/** What the AI believed its opponents would play, against what they played. */
export interface ModelCheck {
  level: number; predictions: number;
  /** Shares by card type, of the decisions with a choice. */
  predicted: Record<string, number>; actual: Record<string, number>;
  /** Mean log-probability the model gave the card actually played. */
  logLik: number;
}

/**
 * THE AI PREDICTS ITSELF: in \`fights\` mirror fights at \`level\` (random 2v2,
 * the production AI on both sides), each round team 0's model of its
 * opponents (\`opponentModel\`) is set against the cards team 1 then plays.
 * A model that drifts from the real AI plans against an enemy that does not
 * exist (2026-11-03: it attacked 80% where the real AI defended half the time).
 */
export function modelCheck(level: number, fights: number): ModelCheck {
  return countedCached('mirror-model', key('mirror-model-v1', mainKitsPrint(), String(level), String(fights)), () => {
    const kits = theSet().calibration.mainKits;
    const predicted: Record<string, number> = { [ActionType.Atac]: 0, [ActionType.Defensa]: 0, [ActionType.Focus]: 0 };
    const actual = { ...predicted };
    let predictions = 0, logLik = 0;
    withSeed(kitSeed('model', level, 4), () => {
      for (let f = 0; f < fights; f++) {
        const policy = aiPolicy(CELL_AI);
        let model: Map<number, { indices: number[]; weights: number[]; total: number }> | null = null;
        let modelRound = -1;
        const e = new CombatEngine(heroes([drawKit(kits), drawKit(kits)], level, 'A'), heroes([drawKit(kits), drawKit(kits)], level, 'B'), {
          registry: theRegistry(), maxRounds: ROUND_CAP, targetChooser: policy.targetChooser,
          actionChooser: (en, c) => {
            if (c.team === 1 && modelRound !== en.round) { model = opponentModel(en as CombatEngine, 0, CELL_AI); modelRound = en.round; }
            const i = policy.actionChooser(en, c);
            const m = c.team === 1 ? model?.get(1000 + en.teams[1].indexOf(c)) : undefined;
            if (m && m.indices.length > 1 && i !== null && i !== undefined) {
              predictions++;
              actual[c.actions[i].def.actionType]++;
              m.indices.forEach((ix, k) => { predicted[c.actions[ix].def.actionType] += m.weights[k] / m.total; });
              const k = m.indices.indexOf(i);
              logLik += Math.log(Math.max(1e-3, k >= 0 ? m.weights[k] / m.total : 0));
            }
            return i;
          },
        });
        e.runCombat();
      }
    });
    const share = (r: Record<string, number>) => Object.fromEntries(Object.entries(r).map(([t, v]) => [t, v / Math.max(1, predictions)]));
    return { level, predictions, predicted: share(predicted), actual: share(actual), logLik: logLik / Math.max(1, predictions) };
  });
}

/** What a set of fights looked like, in the numbers the structure is judged on. */
export interface FightSummary {
  fights: number; median: number; p90: number; stalls: number;
  /** PV lost by everyone a round; attacks that took nothing; the AI's play mix. */
  pvPerRound: number; emptyAttacks: number;
  mix: { attack: number; defense: number; focus: number };
  /** Share of the heroes fielded that fell in the first round. */
  firstRoundKOs: number;
}

/**
 * `fights` 2v2 fights at `level` where every hero holds `kit` (installed by the
 * caller, e.g. playtest's vanilla kits) and has `pv`: the structure of the
 * game — the ladder, PV, the defense premium — measured with no real card in
 * the way. `print` is the kit's content, for the cache; `rules`, the engine's
 * structural knobs (`CombatEngineOptions.chipDamage`).
 */
export function kitOnlyMirrors(kit: string, print: string, level: number, pv: number, fights: number, rules: { chipDamage?: number } = {}): FightSummary {
  return countedCached('mirror-kit-only', key('mirror-kit-only-v3', print, String(level), String(pv), String(fights), JSON.stringify(rules)), () => {
    const set = theSet();
    const rounds: number[] = [];
    let stalls = 0, pvLost = 0, played = 0, attacks = 0, empty = 0, fielded = 0, firstRoundKOs = 0;
    const mix = { attack: 0, defense: 0, focus: 0 };
    // The same dice at every PV: a search over PV compares like with like.
    withSeed(kitSeed(kit, level, 5), () => {
      for (let f = 0; f < fights; f++) {
        const side = (s: string) => {
          const t = set.buildParty({ characters: [1, 2].map(i => ({ ...set.hero(`${s}${i}`, kit, level), pv })) });
          setAIControlled(t);
          return t;
        };
        const e = new CombatEngine(side('A'), side('B'), { registry: theRegistry(), maxRounds: ROUND_CAP, ...rules, ...aiPolicy(CELL_AI) });
        const total = () => e.teams.flat().reduce((t, c) => t + Math.max(0, c.currentPV), 0);
        let roundsDone = 0;
        while (!e.isOver() && e.round < e.maxRounds) {
          const start = total();
          e.prepareRound();
          e.planActions([]);
          for (;;) {
            const before = new Map(e.teams.flat().map(c => [c, c.currentPV]));
            const step = e.resolveNextAction();
            if (step.kind === 'done') break;
            if (step.kind === 'target') { e.setResolveTarget([]); continue; }
            if (step.kind === 'choice') { e.setResolveChoice(); continue; }
            const actor = e.teams[step.action.actorTeam]?.[step.action.actorIdx];
            const def = actor?.actions.find(x => x.def.id === step.action.actionId)?.def;
            if (!actor || !def) continue;
            played++;
            if (def.actionType === ActionType.Atac) mix.attack++;
            else if (def.actionType === ActionType.Defensa) mix.defense++;
            else mix.focus++;
            if (step.action.cancelled || def.actionType !== ActionType.Atac) continue;
            attacks++;
            if (!e.teams[1 - actor.team].some(c => (before.get(c) ?? 0) > c.currentPV)) empty++;
          }
          e.finishRound();
          pvLost += start - total();
          if (++roundsDone === 1) firstRoundKOs += e.teams.flat().filter(c => c.currentPV <= 0).length;
        }
        fielded += e.teams.flat().length;
        rounds.push(e.round);
        if (!e.isOver()) stalls++;
      }
    });
    rounds.sort((a, b) => a - b);
    const q = (p: number) => rounds[Math.min(rounds.length - 1, Math.ceil(p * rounds.length) - 1)];
    const n = Math.max(1, played);
    return {
      fights, median: q(0.5), p90: q(0.9), stalls: stalls / fights,
      pvPerRound: pvLost / Math.max(1, rounds.reduce((t, r) => t + r, 0)), emptyAttacks: empty / Math.max(1, attacks),
      mix: { attack: mix.attack / n, defense: mix.defense / n, focus: mix.focus / n },
      firstRoundKOs: firstRoundKOs / Math.max(1, fielded),
    };
  });
}
