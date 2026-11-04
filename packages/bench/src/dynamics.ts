/**
 * DYNAMICS — how a fight actually plays, for the dynamics report (playtest
 * `dynamics.ts`): where each round's damage comes from, what the sides play,
 * how big a single blow is against a body, how fights end. Played step by step
 * under a VARIANT — the engine's structural options and a hero PV — so a
 * candidate fix reads exactly like today's game.
 *
 * Where a lost PV comes from, by the card that was resolving when it went:
 *  - an Atac on a body with no guard up (OPEN), on a guarded one (GUARDED), or
 *    an area Atac (AREA); the attacker's own side losing PV in its step is a
 *    COUNTER (a riposte, a backfire);
 *  - a Focus (FOCUS), a Defense (its payoff: DEFENSE);
 *  - anything at the round's end (statuses, burns, bleeding: ROUND END).
 */
import { ActionType, CombatEngine, ROUND_CAP, random, setAIControlled, withSeed, type Character } from '@pimpampum/engine';
import { aiPolicy } from '@pimpampum/ai';
import { theRegistry } from './arena.js';
import { countedCached, key, skillPrint } from './cache.js';
import { CELL_AI } from './cells.js';
import { theSet } from './gameset.js';

/** A candidate structure, as the engine and the heroes take it. */
export interface Variant {
  /** `CombatEngineOptions.chipDamage`. */
  chipDamage?: number;
  /** Every hero's PV at this level; omit for the set's own. */
  pv?: number;
}

export type DamageSource = 'open' | 'guarded' | 'area' | 'counter' | 'focus' | 'defense' | 'roundEnd';

export interface Dynamics {
  fights: number;
  /** Rounds each fight lasted, and whether it never ended. */
  rounds: number[]; stalls: number;
  /** PV lost, by where it came from (sums over every fight). */
  lost: Record<DamageSource, number>;
  /** Cards played, by type (cancelled ones included), and of them: attacks
   *  that took nothing, Focus that never resolved. */
  plays: { attack: number; defense: number; focus: number };
  emptyAttacks: number; lostFocus: number;
  /** The biggest share of a body's PV one card took in one go, per card that
   *  hurt anyone: a histogram in tenths (0-10%, …, 90%+). */
  blowShares: number[];
  /** Heroes fielded, those that fell in round 1, and those felled from full
   *  PV by a single card. */
  fielded: number; roundOneKOs: number; oneShots: number;
  /** What each card did when it resolved, by card id: the behavioural census
   *  (playtest `census.ts`) reads a card's role from it. */
  cards: Record<string, CardTally>;
}

/** One card's plays: resolved, and per play — PV the enemies lost, PV the allies
 *  gained, effects it left on enemies and on allies (status counts). */
export interface CardTally { plays: number; foeLoss: number; allyGain: number; foeEffects: number; allyEffects: number }

const emptyDynamics = (): Dynamics => ({
  fights: 0, rounds: [], stalls: 0,
  lost: { open: 0, guarded: 0, area: 0, counter: 0, focus: 0, defense: 0, roundEnd: 0 },
  plays: { attack: 0, defense: 0, focus: 0 }, emptyAttacks: 0, lostFocus: 0,
  blowShares: Array(10).fill(0), fielded: 0, roundOneKOs: 0, oneShots: 0, cards: {},
});

function playOne(teams: [Character[], Character[]], variant: Variant, into: Dynamics): void {
  const e = new CombatEngine(teams[0], teams[1], {
    registry: theRegistry(), maxRounds: ROUND_CAP, ...(variant.chipDamage ? { chipDamage: variant.chipDamage } : {}), ...aiPolicy(CELL_AI),
  });
  const everyone = e.teams.flat();
  let roundsDone = 0;
  while (!e.isOver() && e.round < e.maxRounds) {
    e.prepareRound();
    e.planActions([]);
    for (;;) {
      const before = new Map(everyone.map(c => [c, c.currentPV]));
      const effects = new Map(everyone.map(c => [c, c.statuses.size]));
      const guarded = new Set(everyone.filter(c => c.guards.length > 0));
      const step = e.resolveNextAction();
      if (step.kind === 'done') break;
      if (step.kind === 'target') { e.setResolveTarget([]); continue; }
      if (step.kind === 'choice') { e.setResolveChoice(); continue; }
      const actor = e.teams[step.action.actorTeam]?.[step.action.actorIdx];
      const def = actor?.actions.find(x => x.def.id === step.action.actionId)?.def;
      if (!actor || !def) continue;
      const type = def.actionType;
      into.plays[type === ActionType.Atac ? 'attack' : type === ActionType.Defensa ? 'defense' : 'focus']++;
      if (step.action.cancelled) { if (type === ActionType.Focus) into.lostFocus++; continue; }
      let foesLost = 0, biggest = 0;
      for (const c of everyone) {
        const loss = Math.max(0, (before.get(c) ?? 0) - Math.max(0, c.currentPV));
        if (!loss) continue;
        const foe = c.team !== actor.team;
        if (foe) {
          foesLost += loss;
          biggest = Math.max(biggest, loss / Math.max(1, c.maxPV));
          if ((before.get(c) ?? 0) >= c.maxPV && c.currentPV <= 0) into.oneShots++;
        }
        const source: DamageSource = !foe ? 'counter'
          : type === ActionType.Atac ? ((def.targetCount ?? 1) > 1 ? 'area' : guarded.has(c) ? 'guarded' : 'open')
            : type === ActionType.Focus ? 'focus' : 'defense';
        into.lost[source] += loss;
      }
      if (type === ActionType.Atac && foesLost === 0) into.emptyAttacks++;
      if (foesLost > 0) into.blowShares[Math.min(9, Math.floor(biggest * 10))]++;
      const t = (into.cards[def.id] ??= { plays: 0, foeLoss: 0, allyGain: 0, foeEffects: 0, allyEffects: 0 });
      t.plays++;
      t.foeLoss += foesLost;
      for (const c of everyone) {
        const gained = Math.max(0, c.currentPV - (before.get(c) ?? 0));
        const added = Math.max(0, c.statuses.size - (effects.get(c) ?? 0));
        if (c.team === actor.team) { t.allyGain += gained; t.allyEffects += added; } else t.foeEffects += added;
      }
    }
    const beforeEnd = new Map(everyone.map(c => [c, c.currentPV]));
    e.finishRound();
    for (const c of everyone) into.lost.roundEnd += Math.max(0, (beforeEnd.get(c) ?? 0) - Math.max(0, c.currentPV));
    if (++roundsDone === 1) into.roundOneKOs += everyone.filter(c => c.currentPV <= 0).length;
  }
  into.fights++;
  into.fielded += everyone.length;
  into.rounds.push(e.round);
  if (!e.isOver()) into.stalls++;
}

function seedOf(tag: string, level: number): number {
  let h = 0;
  for (const ch of tag) h = (h * 31 + ch.charCodeAt(0)) % 100_003;
  return 717_000 + level * 7_919 + h;
}

const heroTeam = (kits: readonly string[], level: number, side: string, variant: Variant): Character[] => {
  const set = theSet();
  const team = set.buildParty({ characters: kits.map((k, i) => ({ ...set.hero(`${side}${i + 1}`, k, level), ...(variant.pv ? { pv: variant.pv } : {}) })) });
  setAIControlled(team);
  return team;
};

/** 2v2 of `kits` drawn at random at `level` — the set's main kits (the real
 *  game) unless given (installed by the caller, e.g. vanilla twins; `print`
 *  is then their content, for the cache). */
export function kitsDynamics(level: number, fights: number, variant: Variant = {}, given?: { kits: readonly string[]; print: string }): Dynamics {
  const kits = given?.kits ?? theSet().calibration.mainKits;
  const print = given?.print ?? kits.map(skillPrint).join('|');
  return countedCached('dynamics', key('dynamics-v2', print, 'kits', String(level), String(fights), JSON.stringify(variant)), () => {
    const out = emptyDynamics();
    const draw = () => kits[Math.floor(random() * kits.length)];
    withSeed(seedOf('kits', level), () => {
      for (let f = 0; f < fights; f++) playOne([heroTeam([draw(), draw()], level, 'A', variant), heroTeam([draw(), draw()], level, 'B', variant)], variant, out);
    });
    return out;
  });
}

/** One kit on every hero (installed by the caller — a vanilla kit), at `level`.
 *  `print` is the kit's content, for the cache. */
export function kitOnlyDynamics(kit: string, print: string, level: number, fights: number, variant: Variant = {}): Dynamics {
  return countedCached('dynamics', key('dynamics-v2', print, 'kit-only', String(level), String(fights), JSON.stringify(variant)), () => {
    const out = emptyDynamics();
    withSeed(seedOf(kit, level), () => {
      for (let f = 0; f < fights; f++) playOne([heroTeam([kit, kit], level, 'A', variant), heroTeam([kit, kit], level, 'B', variant)], variant, out);
    });
    return out;
  });
}
