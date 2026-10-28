/**
 * A POSITION — a small fight, frozen mid-way, as plain JSON.
 *
 * Serialisable on purpose: a mismatch the audit finds is saved as one of these
 * and replayed by the fast test tier, so it must rebuild bit-for-bit from data
 * alone (archetype ids and params, never card objects).
 *
 * The generator deals positions from the real-kit profile (`profile.ts`),
 * seeded, so a position is also reproducible from its seed and config.
 */
import {
  ActionType, CombatEngine, createCharacter, EquipmentSlot, seededRng, type ActionChooser, type Character,
  type CombatEngineOptions, type EquipmentDefinition, type TargetChooser,
} from '@pimpampum/engine';
import { ARCHETYPES, AUDIT_SKILL, DEALT, STATUS_BEHAVIORS, auditRegistry, int, pick, weighted, type Draw, type Params } from './catalogue.js';
import { PROFILE } from './profile.js';

export interface CardSpec { arch: string; p: Params }
export interface StatusSpec { key: string; value: number; data?: Record<string, number>; priced: number }
export interface FighterSpec {
  name: string;
  maxPv: number;
  /** PV now; 0 is a fallen body (a revive's target). */
  pv: number;
  armour: number;
  level: number;
  fatigue: number;
  cards: CardSpec[];
  statuses?: StatusSpec[];
}

export interface Position {
  id: string;
  /** Rounds left before the fight is cut and scored. */
  roundsLeft: number;
  /** Team 0 is the side under test. */
  teams: [FighterSpec[], FighterSpec[]];
  tags: {
    shape: string;
    /** Rounds until the slowest effect in the tested side's hand has landed. */
    horizon: number;
    /** Which profile the tested side was drawn from. */
    side: 'hero' | 'enemy';
    /** Played to its real end, no cut (`GeneratorConfig.toTheEnd`). */
    toTheEnd?: boolean;
    /** Every die rolls its average (`GeneratorConfig.fixedDice`). */
    fixedDice?: boolean;
    /** The archetype the position was dealt around, if any. */
    featured?: string;
    /** A hand-made control (see `controls.ts`). */
    control?: string;
  };
}

const REGISTRY = auditRegistry();
export const auditRegistryShared = (): typeof REGISTRY => REGISTRY;

const armourItems = new Map<number, EquipmentDefinition>();
function armourItem(value: number): EquipmentDefinition {
  let it = armourItems.get(value);
  if (!it) {
    it = { id: `audit-armour-${value}`, name: `armour ${value}`, slot: EquipmentSlot.Armor, passiveArmor: value, rollBonuses: [], iconPath: '', description: '' };
    armourItems.set(value, it);
  }
  return it;
}

function buildFighter(f: FighterSpec, team: number, idx: number): Character {
  const actions = [...f.cards, { arch: 'desperate', p: {} }].map((c, k) => {
    const a = ARCHETYPES[c.arch];
    if (!a) throw new Error(`audit: unknown archetype ${c.arch}`);
    return a.build(c.p, `${c.arch}.${team}${idx}${k}`);
  });
  return createCharacter({
    name: f.name, classCss: 'audit', pv: f.maxPv, skills: { [AUDIT_SKILL]: f.level }, actions,
    equipment: f.armour ? [armourItem(f.armour)] : [],
  });
}

/**
 * The position as a live engine at the start of its next round. `maxRounds` is
 * `roundsLeft` unless `extraRounds` says otherwise (the AI under test is shown
 * one more round than the referee scores; see `check.ts`).
 */
export function buildEngine(
  pos: Position,
  policy: { actionChooser: ActionChooser; targetChooser?: TargetChooser },
  opts: { extraRounds?: number; ai?: boolean; rules?: Pick<CombatEngineOptions, 'gangRule' | 'flankBonus'> } = {},
): CombatEngine {
  const teams = pos.teams.map((t, ti) => t.map((f, i) => buildFighter(f, ti, i)));
  const engine = new CombatEngine(teams[0], teams[1], {
    registry: REGISTRY, maxRounds: pos.roundsLeft + (opts.extraRounds ?? 0), ...opts.rules,
    actionChooser: policy.actionChooser, targetChooser: policy.targetChooser,
  });
  // After the engine: its constructor restores full health and clears statuses.
  pos.teams.forEach((t, ti) => t.forEach((f, i) => {
    const c = engine.teams[ti][i];
    c.currentPV = f.pv;
    c.aiControlled = !!opts.ai;
    if (f.fatigue) c.setFatigue(f.fatigue);
    for (const s of f.statuses ?? []) {
      const behavior = STATUS_BEHAVIORS[s.key]?.[s.priced];
      if (!behavior) throw new Error(`audit: unknown status ${s.key}`);
      c.setStatus(s.key, s.value, -1, s.data ? { ...s.data } : undefined, behavior);
    }
  }));
  return engine;
}

// --- the generator ---------------------------------------------------------

export interface GeneratorConfig {
  /** `heroes x enemies` on the tested side and the other, e.g. '2x2'; omit for the real mix. */
  shape?: string;
  /** Cards per fighter (fallback excluded); omit for the real hand sizes. */
  cards?: number;
  /** Cap on the real hand sizes (a real hero holds 6-10 cards; the referee
   *  cannot solve that many at depth). */
  maxCards?: number;
  /** Rounds left; omit to size it from the hand (payoff + 1, within `maxRounds`). */
  roundsLeft?: number;
  /** Upper bound on rounds left when sized from the hand. */
  maxRounds?: number;
  /** Share of positions dealt around a multi-round card. */
  multiShare?: number;
  /** Of those, the share dealt a card that pays in 3+ rounds, when there is room. */
  longShare?: number;
  /** Rescale PV so the fight lasts about `roundsLeft` (default on; see `pace`). */
  pace?: boolean;
  /** Deal one card of this archetype to the OTHER side — to measure how the
   *  AI plays against a card, not with it (the search's opponent model). */
  foeCard?: string;
  /** Every card's dice become their average, rolled as that many d1: nothing
   *  is left to chance but the order of speed ties, so a referee that
   *  ENUMERATES chance solves the fight exactly — affordable at full size
   *  (4 a side) where real dice are not. Same expected damage, no variance. */
  fixedDice?: boolean;
  /** No cut: the fight runs to its real end (a side down, or the engine's own
   *  50-round stall rule). `roundsLeft` then only sets how long PV is paced
   *  for and which payoffs are dealt; score it with `payoff: 'outcome'`. */
  toTheEnd?: boolean;
  /**
   * Which imaginary cards are dealt. `archetypes` (default): the hand-written
   * list (`catalogue.ts`). `composed`: cards drawn part by part — type,
   * trigger, effect, subject (`compose.ts`) — so a verdict is not about one
   * list of effects. `mixed`: either, evenly.
   */
  catalogue?: 'archetypes' | 'composed' | 'mixed';
}

const BY_TYPE = {
  attack: [['strike', 5], ['jab', 1], ['sweep', 1], ['pierce', 1], ['stun', 1], ['lock', 1], ['weaken', 1]],
  defense: [['guard', 1], ['block', 1]],
  focus: [['heal', 1], ['revive', 1], ['cleanse', 1], ['setup', 1], ['bomb', 1], ['doom', 1], ['device', 1], ['advance', 1], ['taunt', 1], ['hide', 1]],
} as const;

/** Archetypes whose payoff takes more than the round they are played in. */
export const MULTI_ROUND = ['revive', 'cleanse', 'setup', 'bomb', 'doom', 'device', 'stun', 'lock', 'weaken', 'taunt'];

const horizonOf = (c: CardSpec): number => ARCHETYPES[c.arch].horizon(c.p);

/** Can this archetype do anything for a side of `n` bodies? */
function fits(arch: string, sideSize: number): boolean {
  if (arch === 'advance' || arch === 'revive') return sideSize >= 2;
  return DEALT.includes(arch);
}

function drawCard(r: Draw, sideSize: number, maxHorizon: number, catalogue: GeneratorConfig['catalogue'] = 'archetypes'): CardSpec {
  if (catalogue === 'composed' || (catalogue === 'mixed' && r() < 0.5)) {
    for (let tries = 0; tries < 50; tries++) {
      const c = { arch: 'composed', p: ARCHETYPES.composed.draw(r) };
      if (horizonOf(c) <= maxHorizon) return c;
    }
  }
  for (let tries = 0; tries < 50; tries++) {
    const type = weighted(r, [['attack', PROFILE.typeMix.attack], ['defense', PROFILE.typeMix.defense], ['focus', PROFILE.typeMix.focus]] as const);
    const arch = weighted(r, BY_TYPE[type] as unknown as [string, number][]);
    if (!fits(arch, sideSize)) continue;
    const c = { arch, p: ARCHETYPES[arch].draw(r) };
    if (horizonOf(c) <= maxHorizon) return c;
  }
  return { arch: 'strike', p: ARCHETYPES.strike.draw(r) };
}

/** Expected PV a side's blows remove in a round: each living fighter's best
 *  attack, dice mean plus level, an area attack counted once per foe. */
function outputPerRound(side: FighterSpec[], foes: number): number {
  let total = 0;
  for (const f of side) {
    if (f.pv <= 0) continue;
    let best = 0;
    for (const c of f.cards) {
      if (!c.p.n) continue;
      const def = ARCHETYPES[c.arch].build(c.p, 'probe');
      if (def.actionType !== ActionType.Atac) continue;
      const mean = c.p.n * (c.p.s + 1) / 2 + f.level;
      best = Math.max(best, c.arch === 'sweep' ? mean * foes : mean);
    }
    total += best;
  }
  return total;
}

/**
 * PACE THE FIGHT TO ITS HORIZON. Real fights last 2-5 rounds (the profile's
 * `rounds`), but drawn bodies in a small shape do not: a lone 12-PV hero
 * against a level-10 3d6 blow is over in one round, and a position whose
 * fight ends at once cannot test a card that pays in three. So each side's
 * living PV is rescaled to what the other side's blows would take about
 * `roundsLeft` (×0.6–1.5) rounds to remove — sometimes it ends early, as real
 * fights do, mostly it lasts. The PV table still sets the ratios between bodies.
 */
function pace(r: Draw, teams: [FighterSpec[], FighterSpec[]], roundsLeft: number): void {
  for (const side of [0, 1] as const) {
    const living = teams[side].filter(f => f.pv > 0);
    const out = outputPerRound(teams[1 - side], living.length);
    const target = Math.max(living.length, out * roundsLeft * (0.6 + 0.9 * r()));
    const now = living.reduce((s, f) => s + f.pv, 0);
    for (const f of living) {
      f.pv = Math.max(1, Math.round(f.pv * target / now));
      f.maxPv = Math.max(f.pv, Math.round(f.pv * (1 + 0.6 * r())));
    }
  }
}

/** The engine's own stall rule: a fight still going after this many rounds is a draw. */
const STALL_ROUNDS = 50;

/** One position, from a seed. Same seed and config, same position. */
export function generatePosition(seed: number, cfg: GeneratorConfig = {}): Position {
  const r = seededRng(seed >>> 0) as Draw;
  const side: 'hero' | 'enemy' = r() < 0.5 ? 'hero' : 'enemy';
  const other = side === 'hero' ? 'enemy' : 'hero';
  let shape = cfg.shape ?? weighted(r, PROFILE.shapes);
  // The profile's shapes are `heroes x enemies`; the tested side comes first.
  if (!cfg.shape && side === 'enemy') shape = shape.split('x').reverse().join('x');
  const [nA, nB] = shape.split('x').map(Number);
  const maxRounds = cfg.maxRounds ?? 5;
  // Cards with a payoff later than the fight can see are dealt only to the
  // twin controls, never here: a position must leave room for every payoff.
  const maxHorizon = Math.max(1, (cfg.roundsLeft ?? maxRounds) - 1);

  const fighter = (who: 'hero' | 'enemy', i: number, sideSize: number): FighterSpec => {
    const n = cfg.cards ?? Math.min(cfg.maxCards ?? Infinity, weighted(r, PROFILE.handSize[who]));
    const maxPv = weighted(r, PROFILE.pv[who]);
    // Mid-fight: anywhere from a scratch to nearly down.
    const pv = Math.max(1, Math.round(maxPv * (0.25 + 0.75 * r())));
    return {
      name: `${who === 'hero' ? 'H' : 'E'}${i}`, maxPv, pv,
      armour: weighted(r, PROFILE.armour[who]),
      level: weighted(r, PROFILE.level[who]),
      fatigue: who === 'hero' && r() < 0.2 ? int(r, 1, 2) : 0,
      cards: Array.from({ length: n }, () => drawCard(r, sideSize, maxHorizon, cfg.catalogue)),
    };
  };
  const teams: [FighterSpec[], FighterSpec[]] = [
    Array.from({ length: nA }, (_, i) => fighter(side, i, nA)),
    Array.from({ length: nB }, (_, i) => fighter(other, i, nB)),
  ];

  // Weighted toward the multi-round cases: give the tested side one, if the
  // fight is long enough for any.
  let featured: string | undefined;
  const room = cfg.catalogue === 'composed' ? ['composed'] : MULTI_ROUND.filter(a => fits(a, nA));
  if (maxHorizon >= 2 && r() < (cfg.multiShare ?? 0.7) && room.length) {
    // Most multi-round cards pay next round; reach for the long ones (a
    // three-round device, a late mark) half the time the fight has room.
    const long = maxHorizon >= 3 && r() < (cfg.longShare ?? 0.5);
    for (let tries = 0; tries < 60; tries++) {
      const arch = pick(r, room);
      const c = { arch, p: ARCHETYPES[arch].draw(r) };
      if (horizonOf(c) > maxHorizon) continue;
      // A composed card is featured only when it pays after this round.
      if (arch === 'composed' && horizonOf(c) < 2) continue;
      if (long && horizonOf(c) < 3 && tries < 50) continue;
      const f = teams[0][int(r, 0, nA - 1)];
      f.cards[int(r, 0, f.cards.length - 1)] = c;
      featured = arch;
      break;
    }
  }

  if (cfg.foeCard) {
    const f = teams[1][int(r, 0, nB - 1)];
    f.cards[int(r, 0, f.cards.length - 1)] = { arch: cfg.foeCard, p: ARCHETYPES[cfg.foeCard].draw(r) };
  }

  // A revive needs a fallen ally; a cleanse something to strip.
  teams.forEach(t => {
    if (t.length >= 2 && t.some(f => f.cards.some(c => c.arch === 'revive'))) {
      const holder = t.findIndex(f => f.cards.some(c => c.arch === 'revive'));
      t[(holder + 1) % t.length].pv = 0;
    }
    for (const f of t) {
      if (!f.cards.some(c => c.arch === 'cleanse')) continue;
      const victim = pick(r, t.filter(x => x.pv > 0));
      const bane = pick(r, ['audit.bomb', 'audit.doom', 'audit.weak']);
      const data: Record<string, number> = bane === 'audit.bomb' ? { bane: 1 } : { bane: 1, left: 2 };
      victim.statuses = [...(victim.statuses ?? []), { key: bane, value: bane === 'audit.weak' ? 3 : int(r, 4, 8), data, priced: 1 }];
    }
  });

  if (cfg.fixedDice) {
    for (const c of teams.flat().flatMap(f => f.cards)) {
      if (typeof c.p.n === 'number' && typeof c.p.s === 'number' && c.p.s > 1) c.p = { ...c.p, n: Math.round(c.p.n * (c.p.s + 1) / 2), s: 1 };
    }
  }

  const handHorizon = Math.max(1, ...teams[0].flatMap(f => f.cards.map(horizonOf)));
  // Room for every card on the table, the opponent's included.
  const tableHorizon = Math.max(1, ...teams.flat().flatMap(f => f.cards.map(horizonOf)));
  const roundsLeft = cfg.roundsLeft ?? Math.min(maxRounds, Math.max(2, tableHorizon + 1));
  if (cfg.pace !== false) pace(r, teams, roundsLeft);
  return {
    id: `g${seed}`,
    roundsLeft: cfg.toTheEnd ? STALL_ROUNDS : roundsLeft,
    teams,
    tags: { shape: `${nA}x${nB}`, horizon: Math.min(handHorizon, roundsLeft), side, featured, ...(cfg.fixedDice ? { fixedDice: true } : {}), ...(cfg.toTheEnd ? { toTheEnd: true } : {}) },
  };
}
