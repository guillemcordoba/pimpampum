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
import { ActionType, CombatEngine, ROUND_CAP, random, setAIControlled, withSeed, type ActionDefinition, type Character, type CombatModifier, type PvLoss, type PvLossVia, type StatusEntry } from '@pimpampum/engine';
import { aiPolicy } from '@pimpampum/ai';
import { theRegistry } from './arena.js';
import { countedCached, key, skillPrint } from './cache.js';
import { CELL_AI } from './cells.js';
import { heroPVPrint, theSet } from './gameset.js';

/** A candidate structure, as the engine and the heroes take it. */
export interface Variant {
  /** `CombatEngineOptions.chipDamage`. */
  chipDamage?: number;
  /** `CombatEngineOptions.guardCoversDefender`. */
  guardCoversDefender?: boolean;
  /** Heroes a side; omit for two. */
  teamSize?: number;
  /** Every hero's PV at this level; omit for the set's own. */
  pv?: number;
  /** A candidate PV model: a hero's PV is `base` + its class's `perLevel` × its level. */
  pvModel?: PVModel;
  /** A card taken out of every hand: what that one card does to the fights. */
  without?: string;
}

export interface PVModel { base: number; perLevel: Readonly<Record<string, number>> }

/** The PV a variant gives a hero of `kit` at `level`; undefined: the set's own. */
export function variantPV(v: Variant, kit: string, level: number): number | undefined {
  if (v.pv) return v.pv;
  if (v.pvModel) return Math.max(1, Math.round(v.pvModel.base + (v.pvModel.perLevel[kit] ?? 0) * level));
  return undefined;
}

/** The engine's options a variant sets; nothing when it leaves the rules as they are. */
export function variantRules(v: Variant): { chipDamage?: number; guardCoversDefender?: boolean } {
  return {
    ...(v.chipDamage ? { chipDamage: v.chipDamage } : {}),
    ...(v.guardCoversDefender ? { guardCoversDefender: true } : {}),
  };
}

export type DamageSource = 'open' | 'guarded' | 'area' | 'counter' | 'focus' | 'defense' | 'roundEnd';

/**
 * A fresh hero felled in one play WITHOUT AN ANSWER (intentions.md,
 * interactivity): by a fast card (it resolves before every normal defense and
 * attack), through its own guard (it read the attack right), or by damage with
 * no roll against a guard from a slow attack (guarding does not stop it, and an
 * attack cannot be interrupted). A slow attack on an open body, a slow Focus
 * (hitting its caster first interrupts it) and a counter all had an answer, and
 * so had a blow a slow Focus set up: without its buff the hero stands.
 */
export type Unanswerable = 'fast' | 'guard' | 'uncontested';

/** How a fresh hero felled by `def` could not have answered it, from how its
 *  PV went (`PvLossVia`); null: it had an answer. */
function unanswerable(def: ActionDefinition, vias: readonly PvLossVia[]): Unanswerable | null {
  if (def.fast) return 'fast';
  // A slow Focus is interrupted by hitting its caster first; a counter by not attacking into it.
  if (def.actionType !== ActionType.Atac) return null;
  // Struck on an open body: guarding was the answer.
  if (vias.includes('open')) return null;
  if (vias.includes('guarded')) return 'guard';
  return vias.length ? 'uncontested' : null;
}

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
  fielded: number; oneShots: number;
  /** Heroes that began a round at full PV and ended it at 0, whatever the
   *  number of cards it took; of those, the ones a defense was covering. */
  felledInARound: number; felledInARoundGuarded: number;
  /** What each card did when it resolved, by card id: the behavioural census
   *  (playtest `census.ts`) reads a card's role from it. */
  cards: Record<string, CardTally>;
  /** Each kit's own play, by kit id (a twin's `twin-` prefix dropped): the
   *  per-kit diagnosis sets a twin against its real kit. */
  kits: Record<string, KitTally>;
}

/** One kit's heroes over the fights: seats filled, rounds they were in, the
 *  cards they played by type, the PV they took off the enemies by source (in
 *  their own steps; round-end statuses can't be traced to who set them), and
 *  the PV they lost. */
export interface KitTally {
  seats: number; rounds: number;
  plays: { attack: number; defense: number; focus: number };
  dealt: Record<DamageSource, number>; lost: number;
}

/** A hero's kit: its highest skill (a twin's `twin-` prefix dropped). */
const kitOf = (c: Character): string => ([...c.skills].sort((a, b) => b[1] - a[1])[0]?.[0] ?? '?').replace(/^twin-/, '');
const kitTally = (into: Dynamics, kit: string): KitTally => (into.kits[kit] ??= {
  seats: 0, rounds: 0, plays: { attack: 0, defense: 0, focus: 0 },
  dealt: { open: 0, guarded: 0, area: 0, counter: 0, focus: 0, defense: 0, roundEnd: 0 }, lost: 0,
});

/** One card's plays, summed: resolved plays; PV the enemies lost in its step,
 *  and the part of it on enemies that played a Defense that round; PV the
 *  allies gained; effects it left on enemies and on allies (status counts);
 *  and PV the enemies lost later, at round ends, to the statuses it set. */
export interface CardTally {
  plays: number; foeLoss: number; onDefenders: number; allyGain: number; foeEffects: number; allyEffects: number; lingering: number;
  /** Enemies it took from full PV to 0 in one play; of those, the ones no read
   *  could have saved (`UNANSWERABLE`), by how. */
  felledFromFull: number; unanswerable: number; unanswerableHow: Record<Unanswerable, number>;
  /** Knockouts a slow Focus of the killer's side set up, by that Focus: the
   *  hero would have stood without its buff, so the read that cancels the
   *  Focus was the answer (the user, 2026-11-06) and they are not unanswerable. */
  focusSetUps: Record<string, number>;
  /** Unanswerable knockouts that needed another card's buff, by that card: the combo to look at. */
  unansweredRode: Record<string, number>;
  /** What it left on the allies, read from the engine's generic hooks: effects
   *  that strengthen their attacks, effects that protect them; and the attack
   *  and defense bonuses of the modifiers it gave them (summed). */
  offense: number; protection: number; attackBonus: number; defenseBonus: number;
}

/** An effect's hooks that make its holder hit harder, and that shield it. */
const OFFENSIVE = ['attackRollOfHolder', 'modifyOutgoingDamage', 'onAttackAction', 'attackRepeats', 'rollMode'] as const;
const PROTECTIVE = ['modifyIncomingDamage', 'untargetable', 'onTargeted', 'onAllyTargeted', 'guardsBlow', 'standingGuard', 'clampPvLoss'] as const;

const emptyDynamics = (): Dynamics => ({
  fights: 0, rounds: [], stalls: 0,
  lost: { open: 0, guarded: 0, area: 0, counter: 0, focus: 0, defense: 0, roundEnd: 0 },
  plays: { attack: 0, defense: 0, focus: 0 }, emptyAttacks: 0, lostFocus: 0,
  blowShares: Array(10).fill(0), fielded: 0, oneShots: 0, felledInARound: 0, felledInARoundGuarded: 0, cards: {}, kits: {},
});

/** The card (and its side) that set a modifier or a status, where a step of the fight set it. */
type SetterOf = WeakMap<object, { def: ActionDefinition; team: number }>;
/** A bonus a blow rode: who set it, and its size on the blow (Infinity: an
 *  effect that gives no size to read, counted as needed). */
interface Buff { by?: { def: ActionDefinition; team: number }; size: number }

/** What strengthened `def`'s blow on `victim`, as things stood before it
 *  resolved: the attacker's roll modifiers and offensive statuses, and the
 *  victim's statuses that open it to attacks. */
function buffsRidden(
  attacker: Character, victim: Character, def: ActionDefinition, mods: ReadonlySet<CombatModifier>,
  attackerEntries: ReadonlyMap<string, StatusEntry>, victimEntries: ReadonlyMap<string, StatusEntry>, setterOf: SetterOf,
): Buff[] {
  const out: Buff[] = [];
  for (const m of mods) {
    if (typeof m.duration === 'object' && m.duration.pending) continue;
    if (m.stat !== 'skill' && m.stat !== 'attack' && m.stat !== def.skillId) continue;
    const size = m.dice ? m.dice.average() : m.value;
    if (size > 0) out.push({ by: setterOf.get(m), size });
  }
  for (const [key, entry] of attackerEntries) {
    const b = entry.behavior as Record<string, unknown> | undefined;
    if (!b) continue;
    const size = entry.behavior?.attackRollOfHolder?.({ holder: attacker, key, entry });
    if (size !== undefined) { if (size > 0) out.push({ by: setterOf.get(entry), size }); }
    else if (OFFENSIVE.some(h => b[h] !== undefined)) out.push({ by: setterOf.get(entry), size: Infinity });
  }
  for (const [key, entry] of victimEntries) {
    const b = entry.behavior;
    if (!b) continue;
    const ref = { holder: victim, key, entry };
    const size = (b.attackRollAgainstHolder?.(ref) ?? 0) + (b.defensePenaltyAgainst?.(ref, attacker) ?? 0);
    if (size > 0) out.push({ by: setterOf.get(entry), size });
    else if (b.preventsGuard?.(ref) || b.excludesAllyGuards?.(ref, attacker)) out.push({ by: setterOf.get(entry), size: Infinity });
  }
  return out;
}

/** Would a body felled from full (`maxPV`) by `losses` have stood without
 *  `buffs`? Each contested blow carried them; what came with no roll did not. */
function stoodWithout(buffs: readonly Buff[], losses: readonly PvLoss[], maxPV: number): boolean {
  const bonus = buffs.reduce((t, b) => t + b.size, 0);
  if (!Number.isFinite(bonus)) return true;
  return losses.reduce((t, l) => t + (l.via === 'uncontested' ? l.dealt : Math.max(0, l.dealt - bonus)), 0) < maxPV;
}

function playOne(teams: [Character[], Character[]], variant: Variant, into: Dynamics): void {
  const e = new CombatEngine(teams[0], teams[1], {
    registry: theRegistry(), maxRounds: ROUND_CAP, ...variantRules(variant), ...aiPolicy(CELL_AI),
  });
  // The bodies fielded at the start: one summoned later (a golem) is not tracked.
  const everyone = e.teams.flat();
  /** Which card set each status a body holds (by body, then status key): its
   *  round-end damage is credited to that card. */
  const setBy = new Map<Character, Map<string, string>>(everyone.map(c => [c, new Map()]));
  const setterOf: SetterOf = new WeakMap();
  while (!e.isOver() && e.round < e.maxRounds) {
    e.prepareRound();
    e.planActions([]);
    const fresh = everyone.filter(c => c.currentPV >= c.maxPV);
    const coveredThisRound = new Set<Character>();
    for (;;) {
      const before = new Map(everyone.map(c => [c, c.currentPV]));
      const effects = new Map(everyone.map(c => [c, c.statuses.size]));
      const entriesBefore = new Map(everyone.map(c => [c, new Map(c.statuses)]));
      const modsBefore = new Map(everyone.map(c => [c, new Set(c.modifiers)]));
      const defended = new Set(e.plannedThisRound().filter(p => !p.cancelled && p.action.actionType === ActionType.Defensa).map(p => p.actor));
      const guarded = new Set(everyone.filter(c => c.guards.length > 0));
      for (const c of guarded) coveredThisRound.add(c);
      const lossesBefore = e.pvLosses.length;
      const step = e.resolveNextAction();
      if (step.kind === 'done') {
        for (const c of fresh) if (c.currentPV <= 0) { into.felledInARound++; if (coveredThisRound.has(c)) into.felledInARoundGuarded++; }
        break;
      }
      if (step.kind === 'target') { e.setResolveTarget([]); continue; }
      if (step.kind === 'choice') { e.setResolveChoice(); continue; }
      const actor = e.teams[step.action.actorTeam]?.[step.action.actorIdx];
      const def = actor?.actions.find(x => x.def.id === step.action.actionId)?.def;
      if (!actor || !def) continue;
      const type = def.actionType;
      const kind = type === ActionType.Atac ? 'attack' : type === ActionType.Defensa ? 'defense' : 'focus';
      into.plays[kind]++;
      const mine = kitTally(into, kitOf(actor));
      mine.plays[kind]++;
      if (step.action.cancelled) { if (type === ActionType.Focus) into.lostFocus++; continue; }
      let foesLost = 0, biggest = 0, fromFull = 0;
      const unanswered: Unanswerable[] = [];
      const setUps = new Map<string, number>(), rodeOn = new Map<string, number>();
      const losses = e.pvLosses.slice(lossesBefore);
      for (const c of everyone) {
        const loss = Math.max(0, (before.get(c) ?? 0) - Math.max(0, c.currentPV));
        if (!loss) continue;
        const foe = c.team !== actor.team;
        if (foe) {
          foesLost += loss;
          biggest = Math.max(biggest, loss / Math.max(1, c.maxPV));
          if ((before.get(c) ?? 0) >= c.maxPV && c.currentPV <= 0) {
            into.oneShots++; fromFull++;
            const onIt = losses.filter(l => l.target === c);
            const rode = buffsRidden(actor, c, def, modsBefore.get(actor) ?? new Set(), entriesBefore.get(actor) ?? new Map(), entriesBefore.get(c) ?? new Map(), setterOf);
            const setUp = rode.filter(b => b.by?.team === actor.team && b.by.def.actionType === ActionType.Focus && !b.by.def.fast);
            if (setUp.length && stoodWithout(setUp, onIt, c.maxPV)) {
              for (const id of new Set(setUp.map(b => b.by!.def.id))) setUps.set(id, (setUps.get(id) ?? 0) + 1);
            } else {
              const how = unanswerable(def, onIt.map(l => l.via));
              if (how) {
                unanswered.push(how);
                const ownBuffs = rode.filter(b => b.by?.team === actor.team && b.by.def.id !== def.id);
                for (const id of new Set(ownBuffs.map(b => b.by!.def.id))) if (stoodWithout(ownBuffs.filter(b => b.by!.def.id === id), onIt, c.maxPV)) rodeOn.set(id, (rodeOn.get(id) ?? 0) + 1);
              }
            }
          }
        }
        const source: DamageSource = !foe ? 'counter'
          : type === ActionType.Atac ? ((def.targetCount ?? 1) > 1 ? 'area' : guarded.has(c) ? 'guarded' : 'open')
            : type === ActionType.Focus ? 'focus' : 'defense';
        into.lost[source] += loss;
        if (foe) mine.dealt[source] += loss;
      }
      if (type === ActionType.Atac && foesLost === 0) into.emptyAttacks++;
      if (foesLost > 0) into.blowShares[Math.min(9, Math.floor(biggest * 10))]++;
      const t = (into.cards[def.id] ??= {
        plays: 0, foeLoss: 0, onDefenders: 0, allyGain: 0, foeEffects: 0, allyEffects: 0, lingering: 0,
        felledFromFull: 0, unanswerable: 0, unanswerableHow: { fast: 0, guard: 0, uncontested: 0 }, focusSetUps: {}, unansweredRode: {},
        offense: 0, protection: 0, attackBonus: 0, defenseBonus: 0,
      });
      t.plays++;
      t.felledFromFull += fromFull;
      for (const how of unanswered) { t.unanswerable++; t.unanswerableHow[how]++; }
      for (const [id, n] of setUps) t.focusSetUps[id] = (t.focusSetUps[id] ?? 0) + n;
      for (const [id, n] of rodeOn) t.unansweredRode[id] = (t.unansweredRode[id] ?? 0) + n;
      t.foeLoss += foesLost;
      for (const c of everyone) {
        const gained = Math.max(0, c.currentPV - (before.get(c) ?? 0));
        const added = Math.max(0, c.statuses.size - (effects.get(c) ?? 0));
        if (c.team === actor.team) {
          t.allyGain += gained; t.allyEffects += added;
          for (const [k, entry] of c.statuses) {
            if (entriesBefore.get(c)!.has(k)) continue;
            const b = entry.behavior as Record<string, unknown> | undefined;
            if (b && OFFENSIVE.some(h => b[h] !== undefined)) t.offense++;
            // The size of an attack-roll bonus, asked of the effect itself.
            const roll = entry.behavior?.attackRollOfHolder;
            if (roll) t.attackBonus += Math.max(0, Number(roll({ holder: c, key: k, entry }) ?? 0));
            if (b && PROTECTIVE.some(h => b[h] !== undefined)) t.protection++;
          }
          for (const m of c.modifiers) {
            if (modsBefore.get(c)!.has(m)) continue;
            if (m.stat === 'attack' && m.value > 0) { t.attackBonus += m.value; t.offense++; }
            if (m.stat === 'defense' && m.value > 0) { t.defenseBonus += m.value; t.protection++; }
          }
        } else {
          t.foeEffects += added;
          if (defended.has(c)) t.onDefenders += Math.max(0, (before.get(c) ?? 0) - Math.max(0, c.currentPV));
          for (const k of c.statuses.keys()) if (!entriesBefore.get(c)!.has(k)) setBy.get(c)!.set(k, def.id);
        }
        for (const m of c.modifiers) if (!modsBefore.get(c)!.has(m)) setterOf.set(m, { def, team: actor.team });
        for (const [k, entry] of c.statuses) if (entriesBefore.get(c)!.get(k) !== entry) setterOf.set(entry, { def, team: actor.team });
      }
    }
    const beforeEnd = new Map(everyone.map(c => [c, c.currentPV]));
    const heldAtEnd = new Map(everyone.map(c => [c, [...c.statuses.keys()].map(k => setBy.get(c)!.get(k)).filter((x): x is string => !!x)]));
    e.finishRound();
    for (const c of everyone) {
      const loss = Math.max(0, (beforeEnd.get(c) ?? 0) - Math.max(0, c.currentPV));
      into.lost.roundEnd += loss;
      // Split among the cards whose statuses the body held.
      const by = heldAtEnd.get(c)!;
      for (const id of by) if (into.cards[id]) into.cards[id].lingering += loss / by.length;
    }
  }
  into.fights++;
  into.fielded += everyone.length;
  for (const c of everyone) {
    const t = kitTally(into, kitOf(c));
    t.seats++;
    t.rounds += e.round;
    t.lost += Math.max(0, c.maxPV - Math.max(0, c.currentPV));
  }
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
  const team = set.buildParty({ characters: kits.map((k, i) => { const pv = variantPV(variant, k, level); return { ...set.hero(`${side}${i + 1}`, k, level), ...(pv ? { pv } : {}) }; }) });
  if (variant.without) for (const c of team) c.actions = c.actions.filter(a => a.def.id !== variant.without);
  setAIControlled(team);
  return team;
};

/** 2v2 of `kits` drawn at random at `level` — the set's main kits (the real
 *  game) unless given (installed by the caller, e.g. vanilla twins; `print`
 *  is then their content, for the cache). */
export function kitsDynamics(level: number, fights: number, variant: Variant = {}, given?: { kits: readonly string[]; print: string }): Dynamics {
  const kits = given?.kits ?? theSet().calibration.mainKits;
  const print = `${given?.print ?? kits.map(skillPrint).join('|')}#pv:${heroPVPrint()}`;
  return countedCached('dynamics', key('dynamics-v8', print, 'kits', String(level), String(fights), JSON.stringify(variant)), () => {
    const out = emptyDynamics();
    const draw = () => kits[Math.floor(random() * kits.length)];
    const size = variant.teamSize ?? 2;
    withSeed(seedOf('kits', level), () => {
      for (let f = 0; f < fights; f++) playOne([heroTeam(Array.from({ length: size }, draw), level, 'A', variant), heroTeam(Array.from({ length: size }, draw), level, 'B', variant)], variant, out);
    });
    return out;
  });
}

/** One kit on every hero (installed by the caller — a vanilla kit), at `level`.
 *  `print` is the kit's content, for the cache. */
export function kitOnlyDynamics(kit: string, print: string, level: number, fights: number, variant: Variant = {}): Dynamics {
  return countedCached('dynamics', key('dynamics-v8', `${print}#pv:${heroPVPrint()}`, 'kit-only', String(level), String(fights), JSON.stringify(variant)), () => {
    const out = emptyDynamics();
    const side = Array.from({ length: variant.teamSize ?? 2 }, () => kit);
    withSeed(seedOf(kit, level), () => {
      for (let f = 0; f < fights; f++) playOne([heroTeam(side, level, 'A', variant), heroTeam(side, level, 'B', variant)], variant, out);
    });
    return out;
  });
}
