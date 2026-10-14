import { DiceRoll, rollDie } from './dice.js';
import { random, seededRng, withRng } from './rng.js';
import { Character, Guard, StatusEntry } from './character.js';
import { ActionInstance, getActionTargetRequirement, getActionTargetCount } from './action.js';
import { ActionDefinition, ActionEffect, ActionType, TargetRequirement } from './types.js';
import {
  EffectRegistry, EngineApi, EffectContext, AttackModifiers, newAttackModifiers, ActionEvent, ExtraAttackOptions, ExtraAttackResult,
} from './effects.js';
import { StatusBehavior, StatusHookContext, AttackStatusMods, ContestKind, BlowInfo } from './status.js';
import { resolveAttack, checkSkillUp, skillLevelBonus } from './resolution.js';
import { AIView, PendingSummary, availableActionIndices, typeBlocked } from './policy.js';

export interface LogEntry {
  kind: string;
  message: string;
  team?: number;
  round: number;
}

/** Reference to a combatant by team + index. */
export interface TargetRef { team: number; idx: number; }

/** A player/AI selection for one actor in a round. Targets optional (prompted later). */
export interface ActionSelection {
  team: number;
  idx: number;
  actionIdx: number;
  targets?: TargetRef[];
}

/** Display info for a planned action (used by the reveal/resolution UI). */
export interface RevealedAction {
  actorTeam: number;
  actorIdx: number;
  actorName: string;
  actionId: string;
  actionName: string;
  actionType: ActionType;
  speed: number;
  classCss: string;
  iconPath: string;
  /** The action never happened: cancelled while pending, its focus was
   *  interrupted by damage, or the actor died first (UI: darken the card). */
  cancelled?: boolean;
}

/** A request for the player to pick target(s) for the current action. */
export interface TargetPrompt {
  actorTeam: number;
  actorIdx: number;
  actorName: string;
  actionName: string;
  requirement: TargetRequirement;
  count: number;
  canReviveTarget: boolean;
}

/** A request for the player to pick one of a card's reveal options (a height,
 *  a stance) — answered with `setResolveChoice(index)`. */
export interface ChoicePrompt {
  actorTeam: number;
  actorIdx: number;
  actorName: string;
  actionName: string;
  options: readonly string[];
}

/** Result of resolving one step of a round. */
export type StepResult =
  | { kind: 'target'; prompt: TargetPrompt }
  | { kind: 'choice'; prompt: ChoicePrompt }
  | { kind: 'resolved'; logs: LogEntry[]; action: RevealedAction; done: boolean }
  | { kind: 'done' };

export interface RoundPrep { skipping: TargetRef[]; }

export interface CombatResult {
  winner: number | null; // 0 or 1, null = draw / timeout
  rounds: number;
}

export interface CombatStats {
  combats: number;
  rounds: number;
  actionPlays: Record<string, number>;
  actionWinPlays: Record<string, number>;
  actionTypePlays: Record<string, number>;
}

export function newCombatStats(): CombatStats {
  return { combats: 0, rounds: 0, actionPlays: {}, actionWinPlays: {}, actionTypePlays: {} };
}

function addTo(rec: Record<string, number>, key: string, n = 1): void {
  rec[key] = (rec[key] ?? 0) + n;
}

export function mergeCombatStats(into: CombatStats, from: CombatStats): void {
  into.combats += from.combats;
  into.rounds += from.rounds;
  for (const [k, v] of Object.entries(from.actionPlays)) addTo(into.actionPlays, k, v);
  for (const [k, v] of Object.entries(from.actionWinPlays)) addTo(into.actionWinPlays, k, v);
  for (const [k, v] of Object.entries(from.actionTypePlays)) addTo(into.actionTypePlays, k, v);
}

interface PendingAction {
  actor: Character;
  action: ActionInstance;
  speed: number;
  /** null until targeted (human prompt) or auto-filled (AI / trivial). */
  targets: Character[] | null;
  /** Set by cancelPendingAction: a cancelled action that never resolves. */
  cancelled?: boolean;
  /** The reveal option picked for a card that offers some (`revealOptions`);
   *  undefined until picked. */
  option?: number;
}

/**
 * Picks the action index for an AI-driven actor. Return null to fall back to
 * the built-in weighted heuristic. This is the seam a search- or
 * policy-driven AI plugs into; it stays content-agnostic (the engine hands
 * over itself and the actor, and gets back an index into the actor's hand).
 */
export type ActionChooser = (engine: CombatEngine, actor: Character) => number | null;

/** Resolution-time target choice. Also a policy, also injected. */
export type TargetChooser = (
  engine: CombatEngine, actor: Character, def: ActionDefinition,
  req: TargetRequirement, count: number, pool: Character[], speed: number,
) => Character[];

export interface CombatEngineOptions {
  registry: EffectRegistry;
  maxRounds?: number;
  /** AI decisiveness: exponent on action weights (1 = soft sampling, higher =
   *  greedier, human-like play). Default 2. */
  aiSharpness?: number;
  /**
   * WHO DECIDES. The engine has no policy of its own — `@pimpampum/ai`'s
   * `aiPolicy()` returns both of these, and a caller wires them in.
   *
   * An AI-controlled character with no `actionChooser` is an error, not a
   * default: a silent fallback policy would quietly produce measurements about
   * a policy nobody chose, which is the failure this whole layer exists to
   * prevent.
   */
  actionChooser?: ActionChooser;
  /** How targets are picked at resolution time. Without one the engine takes
   *  the eligible targets in order — deterministic, and deliberately not a
   *  policy. */
  targetChooser?: TargetChooser;
}

const NO_STATUSES: { key: string; entry: StatusEntry; behavior: StatusBehavior }[] = [];

const HOOKS = ['onResolve', 'onAttackHit', 'onAttackMiss', 'onDefend', 'onBlockFail', 'modifyAttack', 'postRound', 'onReveal', 'onAimed', 'onAttackResolved'] as const;
type HookName = typeof HOOKS[number];

export class CombatEngine implements EngineApi, AIView {
  readonly registry: EffectRegistry;
  readonly teams: [Character[], Character[]];
  readonly maxRounds: number;
  /** Mutable because a lookahead rollout retunes its clone. See
   *  `LookaheadOptions.rolloutSharpness`. */
  aiSharpness: number;
  /** Optional policy override for AI action choice. */
  actionChooser?: ActionChooser;
  targetChooser?: TargetChooser;
  round = 0;
  logEntries: LogEntry[] = [];
  /**
   * A clone never has its log read — `clone()` deliberately starts it empty and
   * the comment there says so. Rollouts are almost all of the engine's work, so
   * building combat prose for them is pure waste: `log()` returns immediately
   * and the hot call sites skip the string interpolation entirely.
   */
  silent = false;
  /**
   * Gives every seat its own random stream, seeded from this, instead of the
   * one stream the whole round shares. Unset in real play.
   *
   * WHY: the lookahead compares cards on PAIRED rollouts — the same seed for
   * every candidate, so they meet the same dice and differ only by the card.
   * On one shared stream that pairing breaks at the first card that draws a
   * different number of dice: every later roll in the round shifts, and the
   * candidates are compared on effectively independent dice. Per seat, a
   * different card only changes its own seat's draws (NEXT-STEPS §29).
   */
  seatStreamSeed?: number;
  private seatStreams?: Map<number, () => number>;

  private inSeatStream<T>(key: number, fn: () => T): T {
    if (this.seatStreamSeed === undefined) return fn();
    this.seatStreams ??= new Map();
    let gen = this.seatStreams.get(key);
    if (!gen) {
      gen = seededRng((Math.imul(this.seatStreamSeed ^ key, 2654435761) ^ key) >>> 0);
      this.seatStreams.set(key, gen);
    }
    return withRng(gen, fn);
  }

  private static readonly TIE_ORDER_STREAM = 0;
  private chooseStream(c: Character): number { return 1000 + c.team * 100 + this.teams[c.team].indexOf(c); }
  private actStream(c: Character): number { return 2000 + c.team * 100 + this.teams[c.team].indexOf(c); }
  /** Every action that actually resolved this combat, in order (EngineApi.history). */
  readonly history: ActionEvent[] = [];

  private plays: { team: number; actionId: string; actionType: ActionType }[] = [];
  /** Numbers every blow (BlowInfo.id). */
  private blowSeq = 0;

  // Step-by-step round state.
  private pending: PendingAction[] = [];
  private pendingIndex = 0;
  private tierSpeed: number | null = null;
  private tierAlive: Set<Character> = new Set();
  private tierInterrupted: Set<Character> = new Set();
  private skippingThisRound: Set<Character> = new Set();
  /** What the first choosers committed this round, by seat — read by those who
   *  choose after the reveal (revealedPlanFor). */
  private revealedPlan: { team: number; idx: number; actionIdx: number }[] = [];
  /** The queued card a target prompt is for when it aims at the reveal (null:
   *  any prompt is for the card resolving now). */
  private aimingIdx: number | null = null;
  /** The queued card a choice prompt is for (null: none pending). */
  private choosingIdx: number | null = null;
  /**
   * A round has BEGUN and not yet finished — `prepareRound` has run and the
   * engine is waiting for cards.
   *
   * Public because the LOOKAHEAD needs it, and the reason is a bug it had.
   * The search is invoked from inside `planActions`, which the engine only
   * reaches after its own `prepareRound()`; a rollout that opened with another
   * `prepareRound()` advanced the round counter a second time and rebuilt
   * `skippingThisRound` from an ALREADY-DECREMENTED `skipTurns`, so every
   * character skipping the real round acted in every rollout. The AI could not
   * see a turn it had just taken away. See `lookahead.playRound`.
   */
  roundPrepared = false;

  constructor(teamA: Character[], teamB: Character[], opts: CombatEngineOptions) {
    this.registry = opts.registry;
    this.maxRounds = opts.maxRounds ?? 50;
    this.aiSharpness = opts.aiSharpness ?? 2;
    this.actionChooser = opts.actionChooser;
    this.targetChooser = opts.targetChooser;
    this.teams = [teamA, teamB];
    teamA.forEach(c => { c.team = 0; });
    teamB.forEach(c => { c.team = 1; });
    for (const c of [...teamA, ...teamB]) c.resetForNewCombat();
    this.dispatchCombatStart();
  }

  /**
   * Deep-copy the whole combat so a caller can play it forward and throw the
   * result away — the primitive lookahead search is built on.
   *
   * Immutable definitions (actions, equipment, status behaviours, the effect
   * registry) are SHARED; everything mutable is copied and every
   * cross-character reference is rewired to the copies. The clone starts with
   * an empty log (nothing reads logs mid-search) but keeps the combat history,
   * which content does read — `flanking` asks whether an ally already struck
   * this target this round.
   */
  clone(): CombatEngine {
    const map = new Map<Character, Character>();
    const cloneTeam = (team: Character[]): Character[] => team.map(c => {
      const copy = c.cloneState();
      map.set(c, copy);
      return copy;
    });
    const teams: [Character[], Character[]] = [cloneTeam(this.teams[0]), cloneTeam(this.teams[1])];
    for (const [original, copy] of map) copy.remapRefs(original, map);
    const at = (c: Character): Character => map.get(c) ?? c;

    // Bypass the constructor: it would reset every combatant and re-fire the
    // onCombatStart hooks, wiping the state we are trying to preserve.
    const e = Object.create(CombatEngine.prototype) as CombatEngine;
    // The readonly fields can only be written during construction, and this
    // instance never ran one.
    const fixed = e as unknown as {
      registry: EffectRegistry; teams: [Character[], Character[]];
      maxRounds: number; aiSharpness: number; history: ActionEvent[];
    };
    fixed.registry = this.registry;
    fixed.teams = teams;
    fixed.maxRounds = this.maxRounds;
    fixed.aiSharpness = this.aiSharpness;
    e.actionChooser = this.actionChooser;
    e.targetChooser = this.targetChooser;
    fixed.history = this.history.map(ev => ({
      round: ev.round,
      actor: at(ev.actor),
      action: ev.action,
      targets: ev.targets.map(at),
    }));
    e.round = this.round;
    e.logEntries = [];
    // Nothing reads a clone's log (see the doc above): skip building the prose.
    e.silent = true;
    e.plays = this.plays.map(p => ({ ...p }));
    e.blowSeq = this.blowSeq;
    e.pending = this.pending.map(p => {
      const actor = at(p.actor);
      // ActionInstances are cloned alongside their owner, so find the copy by
      // position in the owner's hand rather than by identity.
      const idx = p.actor.actions.indexOf(p.action);
      return {
        actor,
        action: idx >= 0 ? actor.actions[idx] : p.action,
        speed: p.speed,
        targets: p.targets ? p.targets.map(at) : null,
        cancelled: p.cancelled,
        option: p.option,
      };
    });
    e.pendingIndex = this.pendingIndex;
    e.tierSpeed = this.tierSpeed;
    e.tierAlive = new Set([...this.tierAlive].map(at));
    e.tierInterrupted = new Set([...this.tierInterrupted].map(at));
    e.skippingThisRound = new Set([...this.skippingThisRound].map(at));
    e.revealedPlan = this.revealedPlan.map(s => ({ ...s }));
    e.aimingIdx = this.aimingIdx;
    e.choosingIdx = this.choosingIdx;
    // Carried, or the clone cannot tell an already-begun round from a fresh
    // one — which is the whole point of the flag for the lookahead.
    e.roundPrepared = this.roundPrepared;
    return e;
  }

  /** Run every effect's onCombatStart hook once per combatant (resource init). */
  private dispatchCombatStart(): void {
    for (const c of this.allCombatants()) {
      for (const action of c.actions) {
        for (const eff of action.def.effects) {
          this.registry.getHandler(eff.type)?.onCombatStart?.(this.ctx(c, action.def, eff.params ?? {}));
        }
      }
    }
  }

  // --- EngineApi / AIView ---------------------------------------------------

  teamOf(c: Character): number { return c.team; }
  livingTeam(team: number): Character[] { return this.teams[team].filter(c => c.isAlive()); }
  alliesOf(c: Character, includeSelf = false): Character[] {
    return this.teams[c.team].filter(a => a.isAlive() && (includeSelf || a !== c));
  }
  rosterOf(c: Character): Character[] {
    return [...this.teams[c.team]];
  }
  enemiesOf(c: Character): Character[] {
    // Untargetable characters (hidden in shadow etc.) don't exist for their
    // enemies — unless the perceiver's own statuses see through concealment.
    const senses = this.sensesConcealed(c);
    return this.teams[1 - c.team].filter(e => e.isAlive() && (senses || !this.isUntargetable(e)));
  }

  /** Whether any status on `c` makes it unreachable by its enemies. */
  private isUntargetable(c: Character): boolean {
    // Walks the statuses rather than `statusRefs()`: asked for every enemy on
    // every targeting query, and the snapshot array was measurable allocation.
    for (const [key, entry] of c.statuses) {
      if (entry.behavior?.untargetable?.({ holder: c, key, entry })) return true;
    }
    return false;
  }

  /** Whether `c` perceives concealed/untargetable enemies (seismic senses…). */
  private sensesConcealed(c: Character): boolean {
    for (const [key, entry] of c.statuses) {
      if (entry.behavior?.ignoresConcealment?.({ holder: c, key, entry })) return true;
    }
    return false;
  }
  rollDie(sides: number): number { return rollDie(sides); }

  /** Roll contest dice for `c`, honouring any status-imposed roll mode:
   *  disadvantage rolls the whole pool twice and keeps the lower total,
   *  advantage the higher. Disadvantage wins if both are present. `kind` gives
   *  stances contest context (advantage only on defense, say). */
  rollDiceFor(c: Character, dice: DiceRoll | undefined, kind?: ContestKind): number {
    if (!dice) return 0;
    const r1 = dice.roll();
    let mode: 'advantage' | 'disadvantage' | null = null;
    for (const ref of c.statusRefs()) {
      const m = ref.entry.behavior?.rollMode?.(ref, kind);
      if (m === 'disadvantage') { mode = m; break; }
      if (m === 'advantage') mode = m;
    }
    if (mode === null) return r1;
    const r2 = dice.roll();
    return mode === 'disadvantage' ? Math.min(r1, r2) : Math.max(r1, r2);
  }

  /** Cancel `target`'s still-pending action this round. An action that already
   *  resolved (a faster one) can't be cancelled — cancellation is speed-gated.
   *  Returns true if something was cancelled. */
  cancelPendingAction(target: Character): boolean {
    for (let i = this.pendingIndex + 1; i < this.pending.length; i++) {
      const p = this.pending[i];
      if (p.actor === target && !p.cancelled) { p.cancelled = true; return true; }
    }
    return false;
  }

  log(kind: string, message: string, team?: number): void {
    if (this.silent) return;
    this.logEntries.push({ kind, message, team, round: this.round });
  }

  /** One side of a contest for the log: `roll+bonus=total`, with `→total`
   *  when statuses transformed the total away from the plain sum (attack
   *  chains, clutch runes). Plain rolls collapse to just the number. */
  private fmtContestSide(roll: number, bonus: number, total: number): string {
    const base = bonus > 0 ? `${roll}+${bonus}` : bonus < 0 ? `${roll}−${Math.abs(bonus)}` : `${roll}`;
    if (total === Math.max(0, roll + bonus)) return bonus !== 0 ? `${base}=${total}` : base;
    return `${base}→${total}`;
  }

  /** The defense side of a contest line, with the defender's passive armour
   *  folded into the displayed total so that atac − defensa = dany reads
   *  directly off the line (armour is applied to the damage, not the contest). */
  private fmtDefenseSide(roll: number, bonus: number, total: number, armor: number): string {
    if (armor <= 0) return this.fmtContestSide(roll, bonus, total);
    const base = bonus > 0 ? `${roll}+${bonus}` : bonus < 0 ? `${roll}−${Math.abs(bonus)}` : `${roll}`;
    const adj = total !== Math.max(0, roll + bonus) ? `→${total}` : '';
    return `${base}${adj}+${armor} armadura=${total + armor}`;
  }

  /** Damage breakdown for the log: the contest margin (or the full attack
   *  total when undefended) minus armour, with `→dmg` when effects
   *  transformed the result away from the plain subtraction. */
  private fmtDamageDetail(base: number, armor: number, dmg: number, contested: boolean): string {
    let s = contested ? `marge ${base}` : `impacte ${base}`;
    if (armor > 0) s += `−${armor} armadura`;
    if (dmg !== Math.max(0, base - armor)) s += `→${dmg}`;
    return s;
  }

  applyPvLoss(target: Character, amount: number, source?: Character): boolean {
    if (amount <= 0) return !target.isAlive();
    // Statuses may clamp the loss (last stands, wards).
    for (const ref of target.statusRefs()) {
      const f = ref.entry.behavior?.clampPvLoss;
      if (f) amount = f(ref, amount);
    }
    const wasAlive = target.isAlive();
    const before = target.currentPV;
    const died = target.loseLife(amount);
    const lost = before - target.currentPV;
    if (died && wasAlive) this.log('death', `${target.name} cau derrotat!`, target.team);
    if (lost > 0) {
      target.lastWound = lost;
      for (const { key, entry, behavior } of this.behaviorStatuses(target)) {
        if (behavior.onPvLost && target.statuses.has(key)) behavior.onPvLost(this.statusCtx(target, key, entry), lost, source);
      }
    }
    return died;
  }

  heal(target: Character, amount: number): void {
    if (amount <= 0) return;
    const before = target.currentPV;
    target.heal(amount);
    const gained = target.currentPV - before;
    if (gained > 0) this.log('heal', `${target.name} recupera ${gained} PV.`, target.team);
  }

  performExtraAttack(source: Character, target: Character, dice: DiceRoll, opts: ExtraAttackOptions = {}): ExtraAttackResult {
    return this.extraBlow(source, target, dice, opts, undefined, { id: ++this.blowSeq, attacker: source, targets: [target] });
  }

  performAreaAttack(source: Character, targets: readonly Character[], dice: DiceRoll, opts: ExtraAttackOptions = {}): ExtraAttackResult[] {
    const roll = this.rollDiceFor(source, dice, 'attack');
    const blow: BlowInfo = { id: ++this.blowSeq, attacker: source, targets: [...targets] };
    return targets.map(t => this.extraBlow(source, t, dice, opts, roll, blow));
  }

  /** One extra blow; `roll` is the dice already rolled for an area blow
   *  (undefined: roll them now). */
  private extraBlow(source: Character, target: Character, dice: DiceRoll, opts: ExtraAttackOptions, roll: number | undefined, blow: BlowInfo): ExtraAttackResult {
    if (!target.isAlive() || (target.team !== source.team && this.isUntargetable(target) && !this.sensesConcealed(source))) return { hit: false, damage: 0 };
    if (!this.canReach(source, target)) return { hit: false, damage: 0 };
    const result = this.announceTarget(source, target, blow)
      ? { hit: false, damage: 0 }
      : this.contestExtraBlow(source, target, dice, opts, roll, blow);
    this.blowResolved(source, target, blow);
    return result;
  }

  private contestExtraBlow(source: Character, target: Character, dice: DiceRoll, opts: ExtraAttackOptions, roll: number | undefined, blow: BlowInfo): ExtraAttackResult {
    const missed: ExtraAttackResult = { hit: false, damage: 0 };
    const label = opts.label ?? source.name;
    const skillId = opts.skillId ?? '';
    const atkRoll = roll ?? this.rollDiceFor(source, dice, 'attack');
    const atkBonus = (opts.rollBonus ?? 0) + (skillId ? source.getRollBonus(skillId, 'attack') : 0)
      + this.attackRollBonusAgainst(target);
    const attackTotal = Math.max(0, atkRoll + atkBonus);
    const bypass = this.bypassesDefense(source, target, !!opts.ignoreDefense);
    const penalty = this.defensePenaltyOn(target, source);
    const guards = bypass ? [] : this.replacedGuards(target, source, blow) ?? this.activeGuards(target, source);
    const guard = guards.length === 1 ? guards[0] : null;
    let recipient = target;
    let hit = true;
    let margin = attackTotal;
    if (guards.length >= 2) {
      // Defensa conjunta: extra attacks contest the summed wall too.
      const { adjustedAttacker, sum, weak, detail } = this.rollWall(source, guards, attackTotal);
      if (!this.silent) this.log('roll', `🎲 ${label}: atac ${this.fmtContestSide(atkRoll, atkBonus, adjustedAttacker)} vs mur: ${detail}${penalty ? ` −${penalty}` : ''}`, source.team);
      ({ hit, margin } = resolveAttack(adjustedAttacker, Math.max(0, sum - penalty)));
      if (hit) { if (checkSkillUp(margin)) for (const g of guards) g.defender.raiseSkill(g.action.skillId); }
      else if (skillId && checkSkillUp(-margin)) source.raiseSkill(skillId);
      recipient = weak.g.defender;
      if (!hit) { this.log('defense', `🛡️ El mur atura ${label}.`, recipient.team); return missed; }
    } else if (guard) {
      const defender = guard.defender;
      const { roll: defRoll, bonus: defBonus } = this.rollGuard(guard);
      let defenderTotal = Math.max(0, defRoll + defBonus - penalty);
      const adjustedAttacker = this.adjustContestTotal(source, attackTotal, defenderTotal, 'attack');
      defenderTotal = this.adjustContestTotal(defender, defenderTotal, adjustedAttacker, 'defense');
      const defArmor = opts.ignoreArmor ? 0 : defender.getPassiveArmor();
      if (!this.silent) this.log('roll', `🎲 ${label}: atac ${this.fmtContestSide(atkRoll, atkBonus, adjustedAttacker)} vs ${defender.name} «${guard.action.name}»: defensa ${this.fmtDefenseSide(defRoll, defBonus, defenderTotal, defArmor)}`, source.team);
      ({ hit, margin } = resolveAttack(adjustedAttacker, defenderTotal));
      // Learning: the loser of the contest levels on a close loss.
      if (hit) { if (checkSkillUp(margin)) defender.raiseSkill(guard.action.skillId); }
      else if (skillId && checkSkillUp(-margin)) source.raiseSkill(skillId);
      recipient = defender;
      if (!hit) { this.log('defense', `🛡️ ${recipient.name} «${guard.action.name}» atura ${label}.`, recipient.team); return missed; }
    } else {
      const tgtArmor = opts.ignoreArmor ? 0 : target.getPassiveArmor();
      if (!this.silent) this.log('roll', `🎲 ${label}: atac ${this.fmtContestSide(atkRoll, atkBonus, attackTotal)} — ${target.name} no es defensa${tgtArmor > 0 ? ` (${tgtArmor} armadura)` : ''}`, source.team);
    }
    const dmgBase = this.applyOutgoingDamage(source, margin);
    const armor = opts.ignoreArmor ? 0 : recipient.getPassiveArmor();
    const dmg = Math.max(0, this.applyIncomingDamage(recipient, Math.max(0, dmgBase - armor), source, attackTotal));
    this.log('attack', `💥 ${label} colpeja ${recipient.name}: ${dmg} dany.`, source.team);
    // Only real damage interrupts a pending focus (applyPvLoss → loseLife
    // marks hitThisTurn when dmg > 0).
    this.applyPvLoss(recipient, dmg, source);
    return { hit: true, damage: dmg, recipient };
  }

  /** Everyone `actor`'s attacks cannot reach right now (attackTargetsExcluded),
   *  or null when nobody is excluded — the usual case, kept allocation-free. */
  private excludedTargets(actor: Character): Character[] | null {
    let out: Character[] | null = null;
    for (const [key, entry] of actor.statuses) {
      const f = entry.behavior?.attackTargetsExcluded;
      if (!f) continue;
      const named = f(this.statusCtx(actor, key, entry));
      if (named && named.length) (out ??= []).push(...named);
    }
    return out;
  }

  private canReach(actor: Character, target: Character): boolean {
    const excluded = this.excludedTargets(actor);
    return !excluded || !excluded.includes(target);
  }

  /** An enemy attack is about to be resolved against `target`: its own
   *  statuses (onTargeted), then its living allies' (onAllyTargeted), hear of
   *  it first, so a guard they raise covers this blow. True when one of them
   *  made the blow pass over `target`. */
  private announceTarget(attacker: Character, target: Character, blow: BlowInfo): boolean {
    if (attacker.team === target.team) return false;
    for (const { key, entry, behavior } of this.hookedStatuses(target, 'onTargeted')) {
      if (target.statuses.has(key) && behavior.onTargeted!(this.statusCtx(target, key, entry), attacker, blow)) return true;
    }
    for (const ally of this.teams[target.team]) {
      if (ally === target || !ally.isAlive()) continue;
      for (const { key, entry, behavior } of this.hookedStatuses(ally, 'onAllyTargeted')) {
        if (ally.statuses.has(key) && behavior.onAllyTargeted!(this.statusCtx(ally, key, entry), target, attacker, blow)) return true;
      }
    }
    return false;
  }

  /** An enemy blow announced on `target` has resolved: every living member
   *  of its side hears of it (afterBlow). */
  private blowResolved(attacker: Character, target: Character, blow: BlowInfo): void {
    if (attacker.team === target.team) return;
    for (const member of this.teams[target.team]) {
      if (!member.isAlive()) continue;
      for (const { key, entry, behavior } of this.hookedStatuses(member, 'afterBlow')) {
        if (member.statuses.has(key)) behavior.afterBlow!(this.statusCtx(member, key, entry), target, attacker, blow);
      }
    }
  }

  /** The guards a status on `target`'s side puts in front of this blow
   *  instead of `target`'s own (guardsBlow), or null when none does. */
  private replacedGuards(target: Character, attacker: Character, blow: BlowInfo): Guard[] | null {
    if (attacker.team === target.team) return null;
    for (const [key, entry] of target.statuses) {
      if (entry.behavior?.preventsGuard?.({ holder: target, key, entry })) return null;
    }
    for (const member of this.teams[target.team]) {
      if (!member.isAlive()) continue;
      for (const { key, entry, behavior } of this.hookedStatuses(member, 'guardsBlow')) {
        if (!member.statuses.has(key)) continue;
        const guards = behavior.guardsBlow!(this.statusCtx(member, key, entry), target, attacker, blow);
        if (guards && guards.length) return guards;
      }
    }
    return null;
  }

  /** `c`'s statuses carrying `hook` (a snapshot: hooks may clear statuses),
   *  or nothing — the usual case, kept allocation-free. */
  private hookedStatuses(c: Character, hook: keyof StatusBehavior): { key: string; entry: StatusEntry; behavior: StatusBehavior }[] {
    let hooked: { key: string; entry: StatusEntry; behavior: StatusBehavior }[] | null = null;
    for (const [key, entry] of c.statuses) {
      if (entry.behavior?.[hook]) (hooked ??= []).push({ key, entry, behavior: entry.behavior });
    }
    return hooked ?? NO_STATUSES;
  }

  /** Whether an attack by `source` on `target` passes over every defense:
   *  undefendable by its own nature (`ignoreDefense`) or because a status on
   *  the target opened its guard to this attacker (`opensGuardTo`, asked only
   *  when the blow could otherwise be defended, so a one-shot opening is not
   *  spent on a blow that needed none) — and not vetoed (`preventsGuardBypass`). */
  private bypassesDefense(source: Character, target: Character, ignoreDefense: boolean): boolean {
    // Walks the statuses directly, like isUntargetable: asked for every blow,
    // and almost always of a target holding no such status.
    let bypass = ignoreDefense;
    if (!bypass) {
      for (const [key, entry] of target.statuses) {   // deleting while iterating a Map is safe
        if (entry.behavior?.opensGuardTo?.(this.statusCtx(target, key, entry), source)) { bypass = true; break; }
      }
    }
    if (!bypass) return false;
    for (const [key, entry] of target.statuses) {
      if (entry.behavior?.preventsGuardBypass?.({ holder: target, key, entry })) return false;
    }
    return true;
  }

  /** Sum of `defensePenaltyAgainst` over the target's statuses, for `attacker`. */
  private defensePenaltyOn(target: Character, attacker: Character): number {
    let penalty = 0;
    for (const [key, entry] of target.statuses) {
      const f = entry.behavior?.defensePenaltyAgainst;
      if (f) penalty += f({ holder: target, key, entry }, attacker);
    }
    return penalty;
  }

  /** One guard's defense roll: a fresh roll of its action's dice plus its
   *  bonuses — or, for a guard already rolled (`fixedTotal`), that total. */
  private rollGuard(g: Guard): { roll: number; bonus: number } {
    if (g.fixedTotal !== undefined) return { roll: g.fixedTotal, bonus: 0 };
    const roll = this.rollDiceFor(g.defender, g.action.dice, 'defense');
    const bonus = (g.action.rollBonus ?? 0) + g.defender.getRollBonus(g.action.skillId, 'defense') + skillLevelBonus(g.defender, g.action);
    return { roll, bonus };
  }

  addCombatant(team: number, c: Character): void {
    c.team = team;
    c.resetForNewCombat();
    this.teams[team].push(c);
    this.log('summon', `${c.name} entra al combat.`, team);
  }

  // --- Helpers --------------------------------------------------------------

  /** Every living guard covering `target` (self-guard included), in resolution
   *  order. Two or more form a defensa conjunta wall that contests with the
   *  sum of their rolls. Empty when a status prevents being guarded. Only the
   *  target's OWN defense when `ownOnly` (an attack that comes over the line)
   *  or when one of its statuses keeps its allies out against `attacker`. */
  private activeGuards(target: Character, attacker?: Character, ownOnly = false): Guard[] {
    let keepOwn = ownOnly;
    for (const ref of target.statusRefs()) {
      if (ref.entry.behavior?.preventsGuard?.(ref)) return [];
      if (attacker && ref.entry.behavior?.excludesAllyGuards?.(ref, attacker)) keepOwn = true;
    }
    const living = target.guards.filter(g => g.defender.isAlive() && (!g.onlyAgainst || g.onlyAgainst === attacker));
    return keepOwn ? living.filter(g => g.defender === target) : living;
  }

  /** Living blockers standing between `actor` and their targets — save those
   *  the actor's attacks cannot reach, who force nothing. */
  private livingBlockers(actor: Character): Guard[] {
    const excluded = actor.blockers.length ? this.excludedTargets(actor) : null;
    return actor.blockers.filter(g => g.defender.isAlive() && !(excluded && excluded.includes(g.defender)));
  }

  /** The target every chosen attack slot is forced onto when `actor` is
   *  blocked. Null when unblocked, every blocker is dead, or the attack
   *  doesn't choose targets (its count covers every living enemy — AoE is
   *  unaffected). With several blockers the nominal target is the first; the
   *  joint wall contest decides who actually catches the blow. */
  private blockForcedTarget(actor: Character, count: number): Character | null {
    const wall = this.livingBlockers(actor);
    if (!wall.length) return null;
    if (count >= this.livingTeam(1 - actor.team).length) return null;
    return wall[0].defender;
  }

  private ctx(source: Character, action: ActionDefinition, params: Record<string, unknown>, extra: Partial<EffectContext> = {}): EffectContext {
    return { engine: this, source, action, params, targets: extra.targets ?? [], ...extra };
  }

  /** Whether a status makes `actor`'s cards resolve plain right now
   *  (`plainCards`): no effects, one target, only the dice. */
  private playsPlain(actor: Character): boolean {
    for (const [key, entry] of actor.statuses) {
      if (entry.behavior?.plainCards?.(this.statusCtx(actor, key, entry))) return true;
    }
    return false;
  }

  /** The effects of `def` that run when `actor` plays it — none while its
   *  cards are plain. Every effect dispatch reads its effects through here. */
  private effectsOf(actor: Character, def: ActionDefinition): ActionEffect[] {
    return this.playsPlain(actor) ? [] : def.effects;
  }

  /** What `actor` aims `def` at: its effects' requirement, or, for a plain
   *  card, its type's own (an enemy, the defense's dual choice, nobody). */
  private requirementOf(actor: Character, def: ActionDefinition): TargetRequirement {
    if (!this.playsPlain(actor)) return getActionTargetRequirement(def, this.registry);
    return def.actionType === ActionType.Atac ? 'enemy' : def.actionType === ActionType.Defensa ? 'defense' : 'none';
  }

  /** How many targets `actor` aims `def` at — one, for a plain card. */
  private targetCountOf(actor: Character, def: ActionDefinition): number {
    return this.playsPlain(actor) ? 1 : getActionTargetCount(def);
  }

  private dispatch(hook: HookName, source: Character, action: ActionDefinition, base: Partial<EffectContext>): void {
    for (const eff of this.effectsOf(source, action)) {
      const handler = this.registry.getHandler(eff.type);
      const fn = handler?.[hook] as ((ctx: EffectContext) => void) | undefined;
      if (fn) fn(this.ctx(source, action, eff.params ?? {}, base));
    }
  }

  /** Spend-on-play hook: run when an action actually goes off (resource costs). */
  private dispatchPlay(source: Character, action: ActionDefinition): void {
    for (const eff of this.effectsOf(source, action)) {
      this.registry.getHandler(eff.type)?.onPlay?.(this.ctx(source, action, eff.params ?? {}));
    }
  }

  /** Per-action playability (resource gates), ignoring last-resort exclusivity. */
  private actionPlayable(c: Character, actionIdx: number): boolean {
    const action = c.actions[actionIdx];
    if (!action) return false;
    if (!action.isAvailable() || c.isActionSetAside(actionIdx)) return false;
    if ((c.skills.get(action.def.skillId) ?? 0) < action.def.unlockLevel) return false;
    if (typeBlocked(action.def, c)) return false;
    for (const eff of action.def.effects) {
      const fn = this.registry.getHandler(eff.type)?.canPlay;
      if (fn && !fn(c, eff.params ?? {})) return false;
    }
    return true;
  }

  /** Whether a character may play the action at `actionIdx` now (resource gates).
   *  Used by the web UI to disable unaffordable cards. Last-resort actions
   *  (desperation fallbacks) are only playable when nothing else is. */
  /** The lowest-index legal action. Used only when a chooser returns an
   *  illegal index — a floor so the round still resolves, never a policy. */
  private firstLegalActionIdx(c: Character): number {
    const legal = availableActionIndices(c, this.registry);
    return legal.length ? legal[0] : 0;
  }

  canPlayActionIdx(c: Character, actionIdx: number): boolean {
    if (!this.actionPlayable(c, actionIdx)) return false;
    const action = c.actions[actionIdx];
    if (action.def.lastResort) {
      return !c.actions.some((a, i) => i !== actionIdx && !a.def.lastResort && this.actionPlayable(c, i));
    }
    return true;
  }

  allCombatants(): Character[] { return [...this.teams[0], ...this.teams[1]]; }
  allLiving(): Character[] { return this.allCombatants().filter(c => c.isAlive()); }

  private resolveRef(ref: TargetRef): Character { return this.teams[ref.team][ref.idx]; }
  private refOf(c: Character): TargetRef { return { team: c.team, idx: this.teams[c.team].indexOf(c) }; }

  /**
   * An explicit selection's targets, held to the card's requirement — the AI's
   * targets already come from `eligibleTargets`, and a seat that names its own
   * must obey the same rule. Illegal ones are dropped; if none are left and the
   * rule allows exactly one target (a defense narrowed to 'self'), that one;
   * otherwise none, and the seat is asked at resolution.
   */
  private legalTargets(actor: Character, action: ActionInstance, named: Character[]): Character[] | null {
    const eligible = this.eligibleTargets(actor, action.def, this.requirementOf(actor, action.def));
    const kept = named.filter(t => eligible.includes(t));
    if (kept.length) return kept;
    return eligible.length === 1 ? eligible : null;
  }

  /** An attack's target pool as the actor's statuses allow it: without the
   *  characters it cannot reach (`attackTargetsExcluded`), then only the
   *  characters every `attackTargetsOnly` status names (a taunt), when any of
   *  them is left; the whole remaining pool otherwise. */
  private narrowAttackPool(actor: Character, pool: Character[]): Character[] {
    const excluded = this.excludedTargets(actor);
    if (excluded) pool = pool.filter(c => !excluded.includes(c));
    let only: Character[] | null = null;
    for (const [key, entry] of actor.statuses) {
      const named = entry.behavior?.attackTargetsOnly?.(this.statusCtx(actor, key, entry));
      if (named && named.length) only = only ? only.filter(c => named.includes(c)) : [...named];
    }
    if (!only) return pool;
    const kept = pool.filter(c => only!.includes(c));
    return kept.length ? kept : pool;
  }

  /** Eligible targets for an action's requirement (healing includes downed allies). */
  private eligibleTargets(actor: Character, def: ActionDefinition, req: TargetRequirement): Character[] {
    if (req === 'enemy') {
      const pool = this.enemiesOf(actor);
      return def.actionType === ActionType.Atac ? this.narrowAttackPool(actor, pool) : pool;
    }
    if (req === 'self') return [actor];
    if (req === 'fallen_ally') return this.teams[actor.team].filter(c => !c.isAlive());
    // Defense dual choice: an ally to guard (self included) or an enemy to block.
    if (req === 'defense') return [...this.alliesOf(actor, true), ...this.enemiesOf(actor)];
    const team = this.teams[actor.team];
    return team.filter(c => {
      if (req === 'ally_other' && c === actor) return false;
      return c.isAlive() || !!def.canReviveTarget;
    });
  }

  // --- Round lifecycle ------------------------------------------------------

  /** Begin a round: advance round counter, apply stun/skip. */
  prepareRound(): RoundPrep {
    this.round++;
    this.roundPrepared = true;
    this.log('round', `⚔️ Ronda ${this.round}`);
    const skipping: TargetRef[] = [];
    this.skippingThisRound = new Set();
    for (const c of this.allLiving()) {
      if (c.resetForNewRound()) {
        this.skippingThisRound.add(c);
        skipping.push(this.refOf(c));
        this.log('info', `${c.name} perd el torn.`, c.team);
      }
    }
    // Round-start status hooks (after the reset, so a hit here counts this round).
    for (const c of this.allLiving()) {
      for (const { key, entry, behavior } of this.behaviorStatuses(c)) {
        if (c.statuses.has(key)) behavior.onRoundStart?.(this.statusCtx(c, key, entry));
      }
    }
    // Statuses that take the whole round away (skipsRound) — asked after the
    // round-start hooks, which may have ended them.
    for (const c of this.allLiving()) {
      if (this.skippingThisRound.has(c)) continue;
      for (const [key, entry] of c.statuses) {
        if (!entry.behavior?.skipsRound?.(this.statusCtx(c, key, entry))) continue;
        this.skippingThisRound.add(c);
        skipping.push(this.refOf(c));
        this.log('info', `${c.name} perd el torn.`, c.team);
        break;
      }
    }
    this.pending = [];
    this.pendingIndex = 0;
    this.tierSpeed = null;
    return { skipping };
  }

  /** Build the speed-ordered pending queue. Human selections carry actionIdx (targets
   *  optional); every other living actor is filled by the AI. Returns reveal info. */
  planActions(humanSelections: ActionSelection[] = []): RevealedAction[] {
    const selByChar = new Map<Character, ActionSelection>();
    for (const sel of humanSelections) selByChar.set(this.resolveRef(sel), sel);

    const built: PendingAction[] = [];
    // Whoever chooses after the reveal (choosesAfterReveal) chooses LAST, and
    // may read everything the others committed (revealedPlanFor).
    const choosers = this.allLiving().filter(c => !this.skippingThisRound.has(c));
    const later = (c: Character) => c.statusRefs().some(ref => ref.entry.behavior?.choosesAfterReveal?.(ref));
    const ordered = [...choosers.filter(c => !later(c)), ...choosers.filter(later)];
    this.revealedPlan = [];
    for (const c of ordered) {
      if (later(c) && !this.revealedPlan.length) {
        this.revealedPlan = built.map(p => ({ team: p.actor.team, idx: this.teams[p.actor.team].indexOf(p.actor), actionIdx: p.actor.actions.indexOf(p.action) }));
      }
      const sel = selByChar.get(c);
      let action: ActionInstance | undefined;
      let targets: Character[] | null;
      if (sel) {
        action = c.actions[sel.actionIdx];
        targets = sel.targets && action ? this.legalTargets(c, action, sel.targets.map(t => this.resolveRef(t))) : null;
      } else {
        // NO SILENT FALLBACK. An AI seat with no chooser is a caller bug, and
        // a default policy here would quietly produce measurements about a
        // policy nobody chose — the failure this layer exists to prevent.
        if (!this.actionChooser) {
          throw new Error(
            `CombatEngine: ${c.name} is AI-controlled but no actionChooser was supplied. `
            + `Pass one from @pimpampum/ai (aiPolicy()), or drive the seat with an explicit selection.`,
          );
        }
        const chooser = this.actionChooser;
        const chosen = this.inSeatStream(this.chooseStream(c), () => chooser(this, c));
        const idx = chosen !== null && this.canPlayActionIdx(c, chosen)
          ? chosen
          : this.firstLegalActionIdx(c);
        action = c.actions[idx];
        targets = null; // AI targets at resolution time, with reveal-level info
      }
      if (!action) continue;
      c.playedActionIdx = c.actions.indexOf(action);
      this.plays.push({ team: c.team, actionId: action.def.id, actionType: action.def.actionType });
      built.push({ actor: c, action, speed: c.getEffectiveSpeed(action), targets });
    }

    // Speed ties are simultaneous at the table — nobody holds priority. The
    // queue is built team A first, so a stable sort alone would hand team A
    // every tie (defenses up before same-speed enemy attacks, etc. — a
    // measured ~52/48 seat bias). Shuffle before sorting so tie order is fair.
    this.inSeatStream(CombatEngine.TIE_ORDER_STREAM, () => {
      for (let i = built.length - 1; i > 0; i--) {
        const j = Math.floor(random() * (i + 1));
        [built[i], built[j]] = [built[j], built[i]];
      }
    });
    built.sort((a, b) => b.speed - a.speed);
    this.pending = built;
    this.pendingIndex = 0;
    this.tierSpeed = null;
    this.aimingIdx = null;
    this.choosingIdx = null;
    // Cards that aim at the reveal: a seat that already named its targets has
    // aimed; an AI seat aims now. A human seat that did not is prompted before
    // anything resolves (`aimAtReveal` in resolveNextAction).
    built.forEach((p, i) => {
      if (!this.aimsAtReveal(p.actor, p.action.def)) return;
      if (p.targets === null && p.actor.aiControlled) this.aimNow(i);
      else if (p.targets !== null) this.dispatchAimed(p);
    });
    // The cards are face up: effects that act at the reveal act now.
    for (const p of built) this.dispatch('onReveal', p.actor, p.action.def, { targets: p.targets ?? [] });

    return built.map(p => this.reveal(p));
  }

  /**
   * What `c` saw before choosing, if it chose after the reveal: the cards its
   * OPPOSING side committed this round, by seat. Empty for everyone else. Read
   * by the AI so a side that waits for the reveal plays against the real cards.
   */
  revealedPlanFor(c: Character): ReadonlyArray<{ team: number; idx: number; actionIdx: number }> {
    if (!c.statusRefs().some(ref => ref.entry.behavior?.choosesAfterReveal?.(ref))) return [];
    return this.revealedPlan.filter(s => s.team !== c.team);
  }

  delayPendingAction(target: Character): boolean {
    const i = this.pending.findIndex((p, j) => j > this.pendingIndex && p.actor === target && !p.cancelled);
    if (i < 0) return false;
    const [p] = this.pending.splice(i, 1);
    p.speed = Math.min(p.speed, ...this.pending.map(q => q.speed)) - 1;
    this.pending.push(p);
    return true;
  }

  plannedThisRound(): ReadonlyArray<{ actor: Character; action: ActionDefinition; resolved: boolean; cancelled: boolean }> {
    return this.pending.map((p, i) => ({ actor: p.actor, action: p.action.def, resolved: i < this.pendingIndex, cancelled: !!p.cancelled }));
  }

  private reveal(p: PendingAction): RevealedAction {
    return {
      actorTeam: p.actor.team,
      actorIdx: this.teams[p.actor.team].indexOf(p.actor),
      actorName: p.actor.name,
      actionId: p.action.def.id,
      actionName: p.action.def.name,
      actionType: p.action.def.actionType,
      speed: p.speed,
      classCss: p.actor.characterClass,
      iconPath: p.action.def.iconPath,
      cancelled: !!p.cancelled,
    };
  }

  get pendingCount(): number { return this.pending.length; }
  get currentPendingIndex(): number { return this.pendingIndex; }

  /** Which queue items are already known to never happen — cancelled while
   *  pending, a dead actor outside their simultaneous tier, or a focus whose
   *  holder has been damaged (doomed the moment the hit lands, unless its own
   *  tier's snapshot already exempted it). UI: darken those cards NOW, not
   *  when their turn comes. */
  pendingCancelled(): boolean[] {
    return this.pending.map((p, i) => {
      if (p.cancelled) return true;
      if (i < this.pendingIndex) return false; // resolved, uncancelled
      const sameTier = p.speed === this.tierSpeed;
      if (!p.actor.isAlive() && !(sameTier && this.tierAlive.has(p.actor))) return true;
      if (p.action.def.actionType === ActionType.Focus && p.actor.hitThisTurn) {
        return sameTier ? this.tierInterrupted.has(p.actor) : true;
      }
      return false;
    });
  }

  /** Reveal-level view of this round's queue (AIView) — what everyone at the
   *  table knows once cards are flipped. */
  pendingSummary(): readonly PendingSummary[] {
    return this.pending.map((p, i) => ({
      actor: p.actor,
      actionType: p.action.def.actionType,
      speed: p.speed,
      resolved: i < this.pendingIndex,
      cancelled: !!p.cancelled,
    }));
  }

  // --- Post-reveal card swap -------------------------------------------------

  /** Charges left on the holder's card-swap statuses (StatusBehavior.cardSwapCharges). */
  cardSwapCharges(c: Character): number {
    let charges = 0;
    for (const ref of c.statusRefs()) {
      const f = ref.entry.behavior?.cardSwapCharges;
      if (f) charges += f(ref);
    }
    return charges;
  }

  /** Spend one card-swap charge from the first status offering one. */
  private spendCardSwapCharge(c: Character): void {
    for (const ref of c.statusRefs()) {
      const b = ref.entry.behavior;
      if (b?.cardSwapCharges && b.spendCardSwapCharge && b.cardSwapCharges(ref) > 0) {
        b.spendCardSwapCharge(ref);
        return;
      }
    }
  }

  /** Refs of queued actors who still hold a card-swap charge and may swap
   *  their revealed card before resolution begins. */
  flowSwapRefs(): TargetRef[] {
    return this.pending
      .filter(p => p.actor.isAlive() && this.cardSwapCharges(p.actor) > 0)
      .map(p => this.refOf(p.actor));
  }

  /**
   * Replace a queued actor's chosen action with another from their hand (Estat de
   * flux). Spends one flow charge, re-targets, re-sorts the queue by speed, and
   * returns the updated reveal list. No-op (no charge spent) if the swap is
   * illegal or the same action. Must be called after planActions, before resolving.
   */
  flowSwap(ref: TargetRef, newActionIdx: number): RevealedAction[] {
    const reveal = () => this.pending.map(p => this.reveal(p));
    const actor = this.resolveRef(ref);
    const p = this.pending.find(pp => pp.actor === actor);
    if (!p || this.cardSwapCharges(actor) <= 0) return reveal();
    const newAction = actor.actions[newActionIdx];
    if (!newAction || newAction === p.action) return reveal();
    if (!newAction.isAvailable() || actor.isActionSetAside(newActionIdx)) return reveal();
    if ((actor.skills.get(newAction.def.skillId) ?? 0) < newAction.def.unlockLevel) return reveal();
    if (!this.canPlayActionIdx(actor, newActionIdx)) return reveal();

    this.spendCardSwapCharge(actor);

    // A card swapped away takes back any guard it raised at the reveal.
    const old = p.action.def;
    for (const c of this.allCombatants()) c.guards = c.guards.filter(g => !(g.defender === actor && g.action === old));

    p.action = newAction;
    p.speed = actor.getEffectiveSpeed(newAction);
    p.targets = null;
    p.option = undefined;
    actor.playedActionIdx = newActionIdx;
    this.plays.push({ team: actor.team, actionId: newAction.def.id, actionType: newAction.def.actionType });

    this.pending.sort((a, b) => b.speed - a.speed);
    this.pendingIndex = 0;
    this.tierSpeed = null;
    return reveal();
  }

  /** Set targets for the action currently awaiting resolution (after a 'target' prompt). */
  setResolveTarget(targets: TargetRef[]): void {
    if (this.aimingIdx !== null) {
      // The prompt was for a card that aims at the reveal.
      const p = this.pending[this.aimingIdx];
      this.aimingIdx = null;
      if (!p) return;
      p.targets = targets.map(t => this.resolveRef(t));
      this.dispatchAimed(p);
      return;
    }
    const cur = this.pending[this.pendingIndex];
    if (cur) cur.targets = targets.map(t => this.resolveRef(t));
  }

  /** Whether any of the card's effects aims it at the reveal. */
  private aimsAtReveal(actor: Character, def: ActionDefinition): boolean {
    return this.effectsOf(actor, def).some(e => this.registry.getHandler(e.type)?.aimsAtReveal?.(e.params ?? {}) ?? false);
  }

  /** Aim the queued card at `i` without asking anyone (an AI seat, or a pool
   *  with no choice in it), then let its effects see where it aims. */
  private aimNow(i: number): void {
    const p = this.pending[i];
    const def = p.action.def;
    const req = this.requirementOf(p.actor, def);
    const count = this.targetCountOf(p.actor, def);
    if (req === 'none') {
      p.targets = [];
    } else {
      const pool = this.eligibleTargets(p.actor, def, req);
      p.targets = count >= pool.length
        ? pool
        : this.inSeatStream(this.actStream(p.actor), () => this.autoTargets(p.actor, def, req, count, p.speed));
    }
    this.dispatchAimed(p);
  }

  /** onAimed for a card that has just aimed — in its actor's own stream, as
   *  its resolution will be (whatever it rolls now is that card's roll). */
  private dispatchAimed(p: PendingAction): void {
    this.inSeatStream(this.actStream(p.actor), () => this.dispatch('onAimed', p.actor, p.action.def, { targets: p.targets ?? [] }));
  }

  /** Before anything resolves, every card that aims at the reveal must have
   *  its targets: aim the ones that need no human, prompt for the first that
   *  does. Null once all have aimed. */
  private aimAtReveal(): StepResult | null {
    if (this.pendingIndex !== 0 || this.tierSpeed !== null) return null;
    for (let i = 0; i < this.pending.length; i++) {
      const p = this.pending[i];
      if (p.targets !== null || p.cancelled || !p.actor.isAlive() || !this.aimsAtReveal(p.actor, p.action.def)) continue;
      const req = this.requirementOf(p.actor, p.action.def);
      const count = this.targetCountOf(p.actor, p.action.def);
      if (req === 'none' || p.actor.aiControlled || count >= this.eligibleTargets(p.actor, p.action.def, req).length) {
        this.aimNow(i);
        continue;
      }
      this.aimingIdx = i;
      return {
        kind: 'target',
        prompt: {
          actorTeam: p.actor.team,
          actorIdx: this.teams[p.actor.team].indexOf(p.actor),
          actorName: p.actor.name,
          actionName: p.action.def.name,
          requirement: req,
          count,
          canReviveTarget: !!p.action.def.canReviveTarget,
        },
      };
    }
    return null;
  }

  /** The reveal options a card offers (the first effect that offers any). */
  private revealOptionsOf(actor: Character, def: ActionDefinition): readonly string[] | null {
    for (const eff of this.effectsOf(actor, def)) {
      const opts = this.registry.getHandler(eff.type)?.revealOptions?.(eff.params ?? {});
      if (opts && opts.length) return opts;
    }
    return null;
  }

  /** Before anything resolves, every revealed card that offers options must
   *  have one picked: an AI seat's is picked now (the card's own hint), a human
   *  seat is prompted, one card at a time. Null once all are picked. */
  private chooseAtReveal(): StepResult | null {
    if (this.pendingIndex !== 0 || this.tierSpeed !== null) return null;
    for (let i = 0; i < this.pending.length; i++) {
      const p = this.pending[i];
      if (p.option !== undefined || p.cancelled || !p.actor.isAlive()) continue;
      const options = this.revealOptionsOf(p.actor, p.action.def);
      if (!options) continue;
      if (p.actor.aiControlled) {
        this.pickOption(i, undefined);
        continue;
      }
      this.choosingIdx = i;
      return {
        kind: 'choice',
        prompt: {
          actorTeam: p.actor.team,
          actorIdx: this.teams[p.actor.team].indexOf(p.actor),
          actorName: p.actor.name,
          actionName: p.action.def.name,
          options,
        },
      };
    }
    return null;
  }

  /** Answer a 'choice' prompt with an index into its options. Nothing (or an
   *  index out of range) takes the pick nobody was asked for — the card's own
   *  hint — which is how a search that cannot ask anyone answers. */
  setResolveChoice(option?: number): void {
    const i = this.choosingIdx;
    this.choosingIdx = null;
    if (i === null || !this.pending[i]) return;
    this.pickOption(i, option);
  }

  private pickOption(i: number, option: number | undefined): void {
    const p = this.pending[i];
    const def = p.action.def;
    const options = this.revealOptionsOf(p.actor, def) ?? [];
    const effects = this.effectsOf(p.actor, def);
    this.inSeatStream(this.actStream(p.actor), () => {
      let pick = option;
      if (pick === undefined || !(pick >= 0 && pick < options.length)) {
        pick = 0;
        for (const eff of effects) {
          const fn = this.registry.getHandler(eff.type)?.aiRevealOption;
          if (!fn) continue;
          const hint = fn(this.ctx(p.actor, def, eff.params ?? {}, { targets: p.targets ?? [] }), options);
          if (hint >= 0 && hint < options.length) pick = hint;
          break;
        }
      }
      p.option = pick;
      for (const eff of effects) {
        this.registry.getHandler(eff.type)?.onRevealOption?.(this.ctx(p.actor, def, eff.params ?? {}, { targets: p.targets ?? [] }), pick);
      }
    });
  }

  /** The roll an attack's effects already made for it (`presetAttackRoll`), if any. */
  private presetAttackRoll(actor: Character, def: ActionDefinition, targets: Character[]): number | undefined {
    for (const eff of this.effectsOf(actor, def)) {
      const fn = this.registry.getHandler(eff.type)?.presetAttackRoll;
      const roll = fn?.(this.ctx(actor, def, eff.params ?? {}, { targets }));
      if (typeof roll === 'number') return roll;
    }
    return undefined;
  }

  /**
   * Resolve the next action. Returns a 'target' prompt when a human-controlled actor
   * still needs to choose targets, a 'resolved' result with the new log lines, or 'done'.
   */
  resolveNextAction(): StepResult {
    if (this.pendingIndex >= this.pending.length) return { kind: 'done' };
    const aiming = this.aimAtReveal();
    if (aiming) return aiming;
    const choosing = this.chooseAtReveal();
    if (choosing) return choosing;
    const cur = this.pending[this.pendingIndex];

    // Entering a new speed tier: snapshot living set + focus interruption state.
    if (this.tierSpeed !== cur.speed) {
      this.tierSpeed = cur.speed;
      this.tierAlive = new Set(this.allLiving());
      this.tierInterrupted = new Set(
        this.pending.filter(p => p.speed === cur.speed && p.action.def.actionType === ActionType.Focus && p.actor.hitThisTurn).map(p => p.actor),
      );
    }

    // Actor died before this tier — skip silently.
    if (!this.tierAlive.has(cur.actor)) {
      cur.cancelled = true;
      this.pendingIndex++;
      return { kind: 'resolved', logs: [], action: this.reveal(cur), done: this.pendingIndex >= this.pending.length };
    }

    // Cancelled while still pending — the action never happens.
    if (cur.cancelled) {
      const before = this.logEntries.length;
      this.log('interrupt', `L'acció «${cur.action.def.name}» de ${cur.actor.name} es cancel·la.`, cur.actor.team);
      this.pendingIndex++;
      return { kind: 'resolved', logs: this.logEntries.slice(before), action: this.reveal(cur), done: this.pendingIndex >= this.pending.length };
    }

    // Targeting.
    if (cur.targets === null) {
      const req = this.requirementOf(cur.actor, cur.action.def);
      const count = this.targetCountOf(cur.actor, cur.action.def);
      // Only an attack is forced onto its blocker: a block-only defense
      // (requirement 'enemy') still picks whom it blocks.
      const forced = req === 'enemy' && cur.action.def.actionType === ActionType.Atac
        ? this.blockForcedTarget(cur.actor, count)
        : null;
      if (req === 'none') {
        cur.targets = [];
      } else if (forced) {
        // Blocked: no choice to make — every slot goes to the blocker.
        cur.targets = Array(count).fill(forced);
      } else {
        const pool = this.eligibleTargets(cur.actor, cur.action.def, req);
        if (count >= pool.length) {
          cur.targets = pool;
        } else if (cur.actor.aiControlled) {
          // In the actor's own stream, like the action: a searched target draws
          // its rollouts' seed, and on the shared stream that draw would shift
          // every later target search in a paired branch.
          cur.targets = this.inSeatStream(this.actStream(cur.actor), () => this.autoTargets(cur.actor, cur.action.def, req, count, cur.speed));
        } else {
          return {
            kind: 'target',
            prompt: {
              actorTeam: cur.actor.team,
              actorIdx: this.teams[cur.actor.team].indexOf(cur.actor),
              actorName: cur.actor.name,
              actionName: cur.action.def.name,
              requirement: req,
              count,
              canReviveTarget: !!cur.action.def.canReviveTarget,
            },
          };
        }
      }
    }

    const before = this.logEntries.length;
    this.inSeatStream(this.actStream(cur.actor), () => {
      if (this.beforeHolderAction(cur)) this.resolveOne(cur);
    });
    this.pendingIndex++;
    return {
      kind: 'resolved',
      logs: this.logEntries.slice(before),
      action: this.reveal(cur),
      done: this.pendingIndex >= this.pending.length,
    };
  }

  /** The actor's statuses hear that its card is about to resolve
   *  (beforeHolderAction). False when that felled it: the card never happens.
   *  Damage taken here interrupts a Focus, as damage taken earlier would. */
  private beforeHolderAction(cur: PendingAction): boolean {
    const { actor } = cur;
    const def = cur.action.def;
    if (def.actionType === ActionType.Focus && this.tierInterrupted.has(actor)) return true;
    const hooked = this.hookedStatuses(actor, 'beforeHolderAction');
    if (!hooked.length) return true;
    // Whether THESE hooks hurt it: an earlier hit in its own speed tier is
    // simultaneous and must not interrupt it now.
    // (Likewise one already felled in its tier still acts: only a fall here
    // stops it.)
    const hitBefore = actor.hitThisTurn;
    const aliveBefore = actor.isAlive();
    actor.hitThisTurn = false;
    for (const { key, entry, behavior } of hooked) {
      if (actor.statuses.has(key)) behavior.beforeHolderAction!(this.statusCtx(actor, key, entry), def);
    }
    const hitHere = actor.hitThisTurn;
    actor.hitThisTurn = hitBefore || hitHere;
    if (aliveBefore && !actor.isAlive()) {
      cur.cancelled = true;
      this.log('interrupt', `${actor.name} cau abans de jugar «${def.name}».`, actor.team);
      return false;
    }
    if (def.actionType === ActionType.Focus && hitHere) this.tierInterrupted.add(actor);
    return true;
  }

  private autoTargets(actor: Character, def: ActionDefinition, req: TargetRequirement, count: number, speed: number): Character[] {
    const pool = this.eligibleTargets(actor, def, req);
    return this.targetChooser
      ? this.targetChooser(this, actor, def, req, count, pool, speed)
      : pool.slice(0, count);   // deterministic, and deliberately not a policy
  }

  chooseTargets(actor: Character, def: ActionDefinition, pool: Character[], count: number): Character[] {
    if (count >= pool.length) return [...pool];
    // The choice is where a blow lands, whatever card carries the effect (a
    // defense that throws back what it stopped), so the seat aims it as an
    // attack.
    const aimed = def.actionType === ActionType.Atac ? def : { ...def, actionType: ActionType.Atac };
    return this.targetChooser
      ? this.targetChooser(this, actor, aimed, 'enemy', count, pool, actor.getEffectiveSpeed(def))
      : pool.slice(0, count);
  }

  /** The type an action resolves as: its printed one, unless an effect's
   *  `resolveAs` decides otherwise at this moment. */
  private resolvedType(cur: PendingAction): ActionType {
    for (const eff of this.effectsOf(cur.actor, cur.action.def)) {
      const fn = this.registry.getHandler(eff.type)?.resolveAs;
      const t = fn?.(this.ctx(cur.actor, cur.action.def, eff.params ?? {}, { targets: cur.targets ?? [] }));
      if (t) return t;
    }
    return cur.action.def.actionType;
  }

  private resolveOne(cur: PendingAction): void {
    const { actor, action } = cur;
    const targets = cur.targets ?? [];
    switch (this.resolvedType(cur)) {
      case ActionType.Defensa: {
        this.dispatchPlay(actor, action.def);
        const allies = targets.filter(t => t.team === actor.team && t.isAlive());
        const blocked = targets.filter(t => t.team !== actor.team && t.isAlive());
        // A defense always covers its own player against every incoming attack.
        actor.guards.push({ defender: actor, action: action.def });
        for (const ally of allies) {
          if (ally !== actor) ally.guards.push({ defender: actor, action: action.def });
        }
        // Block: the enemy loses target choice — every attack roll they make
        // from now on is made against the blockers. Blocks stack: two or more
        // blockers form a wall that contests with the SUM of their defenses.
        for (const e of blocked) e.blockers.push({ defender: actor, action: action.def });
        const guardedOthers = allies.filter(a => a !== actor);
        if (blocked.length) {
          this.log('defense', `${actor.name} «${action.def.name}» bloqueja ${blocked.map(e => e.name).join(', ')}.`, actor.team);
        }
        if (guardedOthers.length) {
          this.log('defense', `${actor.name} «${action.def.name}» protegeix ${guardedOthers.map(a => a.name).join(', ')}.`, actor.team);
        } else if (!blocked.length) {
          this.log('defense', `${actor.name} «${action.def.name}» es posa en guàrdia.`, actor.team);
        }
        this.history.push({ round: this.round, actor, action: action.def, targets: targets.length ? [...targets] : [actor] });
        this.dispatch('onResolve', actor, action.def, { targets: targets.length ? targets : [actor] });
        break;
      }
      case ActionType.Atac: {
        // Stepping forward to attack may trip enemy hazards — possibly fatally,
        // and a hazard that kills stops the blow. Only THAT death does: an
        // attacker already felled by someone of the SAME speed still strikes,
        // because a speed tie is simultaneous and both blows land (rules.md).
        // Checking plain `isAlive()` here silently turned every same-speed
        // trade into a first-come-first-served one.
        const aliveBeforeHazards = actor.isAlive();
        this.triggerHazards(actor);
        if (aliveBeforeHazards && !actor.isAlive()) break;
        this.dispatchPlay(actor, action.def);
        // Generic attack-action status hooks (ladders, multipliers).
        const mods = this.collectAttackStatusMods(actor);
        const forced = this.blockForcedTarget(actor, this.targetCountOf(actor, action.def));
        let list: Character[];
        if (forced) {
          // Blocked: every chosen slot is forced onto the blocker (the block
          // steps in front of untargetability filters).
          list = (targets.length ? targets : [forced]).map(() => forced);
        } else {
          const valid = targets.filter(t => this.tierAlive.has(t) && this.canReach(actor, t)
            && !(t.team !== actor.team && this.isUntargetable(t) && !this.sensesConcealed(actor)));
          list = valid.length ? valid : this.narrowAttackPool(actor, this.enemiesOf(actor)).slice(0, 1);
        }
        list = this.applyTargetRedirects(actor, list);
        this.history.push({ round: this.round, actor, action: action.def, targets: [...list] });
        // ONE attack roll per pass: every target defends against the same
        // roll — unless the action declares rollPerTarget (fragmentation:
        // fresh attack dice against each target).
        const perTarget = !!action.def.rollPerTarget;
        let baseRoll = perTarget ? 0 : (this.presetAttackRoll(actor, action.def, list) ?? this.rollDiceFor(actor, action.def.dice, 'attack'));
        let blow: BlowInfo = { id: ++this.blowSeq, attacker: actor, targets: [...list] };
        for (const t of list) {
          if (perTarget) baseRoll = this.rollDiceFor(actor, action.def.dice, 'attack');
          this.resolveAttackOnTarget(actor, action, t, mods, baseRoll, !!forced, blow);
        }
        // Generic repeat seam: statuses may grant extra full passes over the
        // still-living targets (stimulants, flurries). Each pass re-rolls.
        const repeats = this.collectAttackRepeats(actor);
        for (let r = 0; r < repeats; r++) {
          if (!actor.isAlive()) break;
          const alive = list.filter(t => t.isAlive());
          if (alive.length === 0) break;
          baseRoll = perTarget ? 0 : this.rollDiceFor(actor, action.def.dice, 'attack');
          blow = { id: ++this.blowSeq, attacker: actor, targets: alive };
          for (const t of alive) {
            if (perTarget) baseRoll = this.rollDiceFor(actor, action.def.dice, 'attack');
            this.resolveAttackOnTarget(actor, action, t, mods, baseRoll, !!forced, blow);
          }
        }
        this.dispatch('onAttackResolved', actor, action.def, { targets: [...list] });
        if (action.def.isConsumable) action.consumed = true;
        break;
      }
      case ActionType.Focus: {
        if (this.tierInterrupted.has(actor)) {
          cur.cancelled = true;
          this.log('interrupt', `El focus «${action.def.name}» de ${actor.name} s'interromp!`, actor.team);
        } else {
          this.dispatchPlay(actor, action.def);
          this.log('focus', `${actor.name} usa «${action.def.name}».`, actor.team);
          this.history.push({ round: this.round, actor, action: action.def, targets: [...targets] });
          this.dispatch('onResolve', actor, action.def, { targets });
          if (action.def.isConsumable) action.consumed = true;
        }
        break;
      }
    }
  }

  // --- Status behaviour dispatch ---------------------------------------------

  private statusCtx(holder: Character, key: string, entry: StatusEntry, extra: Partial<StatusHookContext> = {}): StatusHookContext {
    return { engine: this, holder, key, entry, ...extra };
  }

  /** Snapshot of a character's statuses that carry a behaviour (safe to
   *  mutate/clear statuses while iterating). */
  private behaviorStatuses(c: Character): { key: string; entry: StatusEntry; behavior: StatusBehavior }[] {
    const out: { key: string; entry: StatusEntry; behavior: StatusBehavior }[] = [];
    for (const [key, entry] of c.statuses) {
      if (entry.behavior) out.push({ key, entry, behavior: entry.behavior });
    }
    return out;
  }

  /** Chain modifyOutgoingDamage across the attacker's statuses. */
  private applyOutgoingDamage(source: Character, dmg: number): number {
    for (const { key, entry, behavior } of this.behaviorStatuses(source)) {
      const f = behavior.modifyOutgoingDamage;
      if (f) dmg = f(this.statusCtx(source, key, entry), dmg);
    }
    return dmg;
  }

  /** Chain modifyIncomingDamage across the recipient's statuses. */
  private applyIncomingDamage(recipient: Character, dmg: number, attacker?: Character, attackTotal?: number): number {
    for (const { key, entry, behavior } of this.behaviorStatuses(recipient)) {
      const f = behavior.modifyIncomingDamage;
      if (f) dmg = f(this.statusCtx(recipient, key, entry), dmg, attacker, attackTotal);
    }
    return dmg;
  }

  /** Chain modifyContestTotal across the holder's statuses: a contested d20
   *  total, adjusted while seeing the opposing total (clutch modifiers).
   *  Exposed on EngineApi so content-side save contests can route through it. */
  adjustContestTotal(holder: Character, own: number, opposing: number, kind: ContestKind): number {
    for (const { key, entry, behavior } of this.behaviorStatuses(holder)) {
      const f = behavior.modifyContestTotal;
      if (f) own = f(this.statusCtx(holder, key, entry), own, opposing, kind);
    }
    return own;
  }

  /** Sum of attackRollAgainstHolder across the target's statuses. */
  private attackRollBonusAgainst(target: Character): number {
    let bonus = 0;
    for (const ref of target.statusRefs()) {
      const f = ref.entry.behavior?.attackRollAgainstHolder;
      if (f) bonus += f(ref);
    }
    return bonus;
  }

  /** onAttackAction over the attacker's statuses; multipliers combine, flat bonuses add. */
  private collectAttackStatusMods(actor: Character): AttackStatusMods {
    const mods: AttackStatusMods = {};
    for (const { key, entry, behavior } of this.behaviorStatuses(actor)) {
      const m = behavior.onAttackAction?.(this.statusCtx(actor, key, entry));
      if (!m) continue;
      if (m.attackTotalMult !== undefined) mods.attackTotalMult = (mods.attackTotalMult ?? 1) * m.attackTotalMult;
      if (m.attackRollBonus !== undefined) mods.attackRollBonus = (mods.attackRollBonus ?? 0) + m.attackRollBonus;
      if (m.damageMult !== undefined) mods.damageMult = (mods.damageMult ?? 1) * m.damageMult;
      if (m.ignoreDefense) mods.ignoreDefense = true;
    }
    return mods;
  }

  /** redirectAttackTarget over the attacker's statuses, applied per target. */
  private applyTargetRedirects(actor: Character, list: Character[]): Character[] {
    let out = list;
    for (const { key, entry, behavior } of this.behaviorStatuses(actor)) {
      if (!behavior.redirectAttackTarget) continue;
      out = out.map(t => behavior.redirectAttackTarget!(this.statusCtx(actor, key, entry), t));
    }
    return out;
  }

  /** onEnemyAttackAction over the opposing team's statuses (dead holders
   *  included — hazards outlive their layer). Stops at the first handled. */
  private triggerHazards(attacker: Character): void {
    for (const holder of this.teams[1 - attacker.team]) {
      for (const { key, entry, behavior } of this.behaviorStatuses(holder)) {
        if (!behavior.onEnemyAttackAction) continue;
        if (behavior.onEnemyAttackAction(this.statusCtx(holder, key, entry), attacker)) return;
      }
    }
  }

  /** Best standing-guard defense (walls, wards) among the target's statuses:
   *  each behavior rolls/returns its defense total; the highest one contests. */
  private bestStandingGuard(target: Character): { key: string; entry: StatusEntry; behavior: StatusBehavior; total: number } | null {
    let best: { key: string; entry: StatusEntry; behavior: StatusBehavior; total: number } | null = null;
    for (const { key, entry, behavior } of this.behaviorStatuses(target)) {
      const total = behavior.standingGuard?.(this.statusCtx(target, key, entry));
      if (typeof total === 'number' && (best === null || total > best.total)) {
        best = { key, entry, behavior, total };
      }
    }
    return best;
  }

  /** attackRepeats summed over the attacker's statuses. */
  private collectAttackRepeats(actor: Character): number {
    let repeats = 0;
    for (const { key, entry, behavior } of this.behaviorStatuses(actor)) {
      repeats += behavior.attackRepeats?.(this.statusCtx(actor, key, entry)) ?? 0;
    }
    return repeats;
  }

  /** onRoundEnd for every combatant's registered statuses (snapshot first —
   *  behaviours may set statuses on others without re-triggering this round). */
  private dispatchStatusRoundEnd(): void {
    const snapshot: { holder: Character; key: string; entry: StatusEntry; behavior: StatusBehavior }[] = [];
    for (const holder of this.allCombatants()) {
      for (const s of this.behaviorStatuses(holder)) snapshot.push({ holder, ...s });
    }
    for (const { holder, key, entry, behavior } of snapshot) {
      if (!holder.statuses.has(key)) continue; // cleared by an earlier hook
      const played = this.pending.find(p => p.actor === holder);
      behavior.onRoundEnd?.(this.statusCtx(holder, key, entry, { playedAction: played ? played.action.def : null }));
    }
  }

  private resolveAttackOnTarget(source: Character, action: ActionInstance, target: Character, statusMods: AttackStatusMods, baseRoll: number, forcedByBlock: boolean, blow: BlowInfo): void {
    const mods: AttackModifiers = newAttackModifiers();
    this.dispatch('modifyAttack', source, action.def, { targets: [target], target, attackMods: mods });

    // An effect may pass over this target entirely — no roll, no damage.
    if (mods.skip) return;
    // …and so may a status on its side, told first (onTargeted/onAllyTargeted).
    if (!this.announceTarget(source, target, blow)) {
      this.contestAttackOnTarget(source, action, target, mods, statusMods, baseRoll, forcedByBlock, blow);
    }
    this.blowResolved(source, target, blow);
  }

  private contestAttackOnTarget(source: Character, action: ActionInstance, target: Character, mods: AttackModifiers, statusMods: AttackStatusMods, baseRoll: number, forcedByBlock: boolean, blow: BlowInfo): void {
    const def = action.def;

    // Extra dice (per target) roll flat into the attack total: they raise both
    // the hit chance and the margin damage. The action's own dice were rolled
    // once for the whole pass (`baseRoll`) — every target defends against it.
    let extraDice = 0;
    for (const d of mods.extraDamageDice) extraDice += d.roll();
    const atkBonus = (def.rollBonus ?? 0) + mods.rollBonus
      + source.getRollBonus(def.skillId, 'attack') + skillLevelBonus(source, def)
      + this.attackRollBonusAgainst(target);
    // Status multipliers (attack chains) scale the whole attack total — which
    // is also the damage basis.
    const attackTotal = Math.max(0,
      (baseRoll + extraDice + atkBonus + (statusMods.attackRollBonus ?? 0))
      * (statusMods.attackTotalMult ?? 1));

    // Feints bypass the guard entirely (treated as undefended) — unless a
    // status on the target vetoes the bypass (seismic awareness & co.).
    // A status on the attacker can make the blow undefendable too (a beast that
    // surfaces where nobody saw it dive).
    // A status on the target may have opened its guard to this attacker, too.
    const bypass = this.bypassesDefense(source, target, mods.ignoreDefense || !!statusMods.ignoreDefense);
    // A weak spot the attacker's side found weakens whatever defends it.
    mods.defensePenalty += this.defensePenaltyOn(target, source);
    // Defensa conjunta: when several defenses cover the same attack — a wall
    // of blockers this attack was forced onto, or 2+ guards on the target
    // (the target's own self-guard included) — they contest jointly with the
    // SUM of their defense rolls. A single defense resolves through the
    // ordinary guard path below.
    // A status on the target's side may stand in front of the blow instead of
    // every guard there (guardsBlow).
    let guards: Guard[] = [];
    if (!bypass) {
      const blockWall = forcedByBlock ? this.livingBlockers(source) : [];
      guards = this.replacedGuards(target, source, blow)
        ?? (blockWall.length >= 2 && blockWall.some(g => g.defender === target)
          ? blockWall
          : this.activeGuards(target, source, mods.ignoreAllyGuards));
      if (guards.length >= 2) {
        this.resolveAttackOnWall(source, action, guards, mods, statusMods, attackTotal, baseRoll + extraDice, atkBonus);
        return;
      }
    }
    const guard = guards.length ? guards[guards.length - 1] : null;
    let recipient = target;
    let hit: boolean;
    let margin: number;
    // The attack total as it was finally contested (after clutch adjustments),
    // handed to the effects that see this attack land or fail.
    let contestAttack = attackTotal;

    const guardAbsorbs = guard
      ? guard.defender.statusRefs().some(ref => ref.entry.behavior?.absorbsGuard?.(ref))
      : false;

    if (guard && guardAbsorbs) {
      // Absorbing guard: no contest — the blow lands in full on the guard.
      hit = true; margin = attackTotal; recipient = guard.defender;
      const armor = mods.ignoreArmor ? 0 : recipient.getPassiveArmor();
      if (!this.silent) this.log('roll', `🎲 ${source.name} «${def.name}»: atac ${this.fmtContestSide(baseRoll + extraDice, atkBonus, attackTotal)}${armor > 0 ? ` (${armor} armadura)` : ''}`, source.team);
      this.log('defense', `🛡️ ${guard.defender.name} «${guard.action.name}» aguanta el cop sencer.`, guard.defender.team);
    } else if (guard) {
      const defender = guard.defender;
      const { roll: defRoll, bonus: defBonus } = this.rollGuard(guard);
      let defenderTotal = Math.max(0, defRoll + defBonus - mods.defensePenalty);
      // Clutch status adjustments, seeing both totals (rune flares & co.).
      const adjustedAttacker = this.adjustContestTotal(source, attackTotal, defenderTotal, 'attack');
      contestAttack = adjustedAttacker;
      defenderTotal = this.adjustContestTotal(defender, defenderTotal, adjustedAttacker, 'defense');
      const armor = mods.ignoreArmor ? 0 : defender.getPassiveArmor();
      if (!this.silent) this.log('roll', `🎲 ${source.name} «${def.name}»: atac ${this.fmtContestSide(baseRoll + extraDice, atkBonus, adjustedAttacker)} vs ${defender.name} «${guard.action.name}»: defensa ${this.fmtDefenseSide(defRoll, defBonus, defenderTotal, armor)}`, source.team);
      const res = resolveAttack(adjustedAttacker, defenderTotal);
      hit = res.hit; margin = res.margin;
      // Learning: the loser of the contest levels on a close loss (tie = the
      // attacker losing by 0).
      if (hit) { if (checkSkillUp(margin)) defender.raiseSkill(guard.action.skillId); }
      else if (checkSkillUp(-margin)) source.raiseSkill(def.skillId);
      recipient = defender;
    } else {
      // Standing defenses (walls, wards) contest attacks on the unguarded —
      // bypassed by the same legitimate feints that bypass live guards.
      const standing = bypass ? null : this.bestStandingGuard(target);
      if (standing) {
        const standingTotal = Math.max(0, standing.total - mods.defensePenalty);
        const adjustedAttacker = this.adjustContestTotal(source, attackTotal, standingTotal, 'attack');
        contestAttack = adjustedAttacker;
        const armor = mods.ignoreArmor ? 0 : target.getPassiveArmor();
        const defStr = armor > 0 ? `${standingTotal}+${armor} armadura=${standingTotal + armor}` : `${standingTotal}`;
        if (!this.silent) this.log('roll', `🎲 ${source.name} «${def.name}»: atac ${this.fmtContestSide(baseRoll + extraDice, atkBonus, adjustedAttacker)} vs «${standing.key}» de ${target.name}: defensa ${defStr}`, source.team);
        const res = resolveAttack(adjustedAttacker, standingTotal);
        if (!res.hit) {
          // Only the attacker can learn from a wall — it has no skill to raise.
          if (checkSkillUp(-res.margin)) source.raiseSkill(def.skillId);
          this.log('defense', `🛡️ «${standing.key}» atura l'atac de ${source.name} «${def.name}».`, target.team);
          this.dispatch('onAttackMiss', source, def, { targets: [target], target, hit: false, margin: res.margin, attackTotal: contestAttack });
          return;
        }
        standing.behavior.onStandingGuardBroken?.(this.statusCtx(target, standing.key, standing.entry));
        hit = true; margin = res.margin;
      } else {
        // Undefended: auto-hit, the damage is the full attack total. No
        // contest, no learning.
        hit = true; margin = attackTotal;
        const armor = mods.ignoreArmor ? 0 : target.getPassiveArmor();
        if (!this.silent) this.log('roll', `🎲 ${source.name} «${def.name}»: atac ${this.fmtContestSide(baseRoll + extraDice, atkBonus, attackTotal)} — ${target.name} no es defensa${armor > 0 ? ` (${armor} armadura)` : ''}`, source.team);
      }
    }

    if (!hit && guard) {
      this.log('defense', `🛡️ ${guard.defender.name} «${guard.action.name}» atura l'atac de ${source.name} «${def.name}».`, guard.defender.team);
      this.dispatch('onAttackMiss', source, def, { targets: [target], target: recipient, hit: false, margin, attackTotal: contestAttack });
      this.dispatch('onDefend', guard.defender, guard.action, { targets: [target], target: source, margin, attackTotal: contestAttack });
      return;
    }

    // Margin-damage pipeline: the contest margin IS the damage.
    let dmg = this.applyOutgoingDamage(source, margin);
    dmg *= (statusMods.damageMult ?? 1) * mods.damageMult;
    const armor = mods.ignoreArmor ? 0 : recipient.getPassiveArmor();
    dmg = Math.max(0, dmg - armor);
    // Flat bonus damage lands after armour (not part of the contest).
    dmg += mods.bonusDamage;
    // Recipient statuses transform the incoming damage (marks, rages…).
    dmg = Math.max(0, this.applyIncomingDamage(recipient, dmg, source, contestAttack));
    this.log('attack', `💥 ${source.name} «${def.name}» colpeja ${recipient.name}: ${dmg} dany.`, source.team);
    // Only real damage interrupts a pending focus (rules.md): a hit that the
    // armour fully absorbs leaves the focus standing (applyPvLoss → loseLife
    // marks hitThisTurn when dmg > 0).
    this.applyPvLoss(recipient, dmg, source);
    this.dispatch('onAttackHit', source, def, { targets: [target], target: recipient, hit: true, damageDealt: dmg, margin, attackTotal: contestAttack });
    if (guard && recipient === guard.defender && dmg > 0) {
      this.dispatch('onBlockFail', guard.defender, guard.action, { targets: [target], target: source, damageDealt: dmg });
    }
  }

  /** Defensa conjunta (guard walls and block walls alike): the attack
   *  contests the SUM of every wall member's defense roll. If the wall
   *  breaks, the member with the lowest individual total (the weak link)
   *  takes the penetrating damage; on a close breach (≤ SKILL_UP_MARGIN)
   *  every member learns — they failed together. */
  private resolveAttackOnWall(source: Character, action: ActionInstance, wall: Guard[], mods: AttackModifiers, statusMods: AttackStatusMods, attackTotal: number, atkRoll = attackTotal, atkBonus = 0): void {
    const def = action.def;
    const { adjustedAttacker, sum, weak, detail } = this.rollWall(source, wall, attackTotal);
    // A defense penalty bites the wall's joint total once, not once per member.
    const wallTotal = Math.max(0, sum - mods.defensePenalty);
    if (!this.silent) this.log('roll', `🎲 ${source.name} «${def.name}»: atac ${this.fmtContestSide(atkRoll, atkBonus, adjustedAttacker)} vs mur: ${detail}${mods.defensePenalty ? ` −${mods.defensePenalty}` : ''}`, source.team);
    const res = resolveAttack(adjustedAttacker, wallTotal);
    if (!res.hit) {
      if (checkSkillUp(-res.margin)) source.raiseSkill(def.skillId);
      this.log('defense', `🛡️ El mur atura l'atac de ${source.name} «${def.name}».`, wall[0].defender.team);
      this.dispatch('onAttackMiss', source, def, { targets: [wall[0].defender], target: wall[0].defender, hit: false, margin: res.margin, attackTotal: adjustedAttacker });
      for (const g of wall) this.dispatch('onDefend', g.defender, g.action, { targets: [source], target: source, margin: res.margin, attackTotal: adjustedAttacker });
      return;
    }
    // The wall breaks: everyone on it learns from a close breach.
    if (checkSkillUp(res.margin)) for (const g of wall) g.defender.raiseSkill(g.action.skillId);
    const recipient = weak.g.defender;
    let dmg = this.applyOutgoingDamage(source, res.margin);
    dmg *= (statusMods.damageMult ?? 1) * mods.damageMult;
    const armor = mods.ignoreArmor ? 0 : recipient.getPassiveArmor();
    dmg = Math.max(0, dmg - armor);
    dmg += mods.bonusDamage;
    dmg = Math.max(0, this.applyIncomingDamage(recipient, dmg, source, adjustedAttacker));
    this.log('attack', `💥 ${source.name} «${def.name}» trenca el mur i colpeja ${recipient.name}: ${dmg} dany.`, source.team);
    this.applyPvLoss(recipient, dmg, source);
    this.dispatch('onAttackHit', source, def, { targets: [recipient], target: recipient, hit: true, damageDealt: dmg, margin: res.margin, attackTotal: adjustedAttacker });
    if (dmg > 0) {
      this.dispatch('onBlockFail', recipient, weak.g.action, { targets: [source], target: source, damageDealt: dmg });
    }
  }

  /** Roll every wall member's defense for a joint contest: individual totals,
   *  the clutch-adjusted attacker total and defense sum (the attacker sees
   *  the whole wall; each member adjusts their own share), the weak link
   *  (lowest raw individual total, earliest on ties), and a log detail. */
  private rollWall(source: Character, wall: Guard[], attackTotal: number): { adjustedAttacker: number; sum: number; weak: { g: Guard; total: number }; detail: string } {
    // An ABSORBING member (absorbsGuard: takes the blow, rolls nothing) adds
    // nothing to the wall and is the one hit if it breaks. Rolled like any
    // other member, a no-roll defense used to lend the wall its skill level
    // and, behind a wall that held, never took the blow it exists to take.
    const absorbs = (g: Guard) => g.defender.statusRefs().some(ref => ref.entry.behavior?.absorbsGuard?.(ref));
    const rolls = wall.map(g => {
      if (absorbs(g)) return { g, total: 0, absorbing: true };
      const { roll, bonus } = this.rollGuard(g);
      return { g, total: Math.max(0, roll + bonus), absorbing: false };
    });
    const rawSum = rolls.reduce((s, r) => s + r.total, 0);
    const adjustedAttacker = this.adjustContestTotal(source, attackTotal, rawSum, 'attack');
    const sum = rolls.reduce((s, r) => s + (r.absorbing ? 0 : this.adjustContestTotal(r.g.defender, r.total, adjustedAttacker, 'defense')), 0);
    const weak = rolls.find(r => r.absorbing) ?? rolls.reduce((a, b) => (b.total < a.total ? b : a));
    const sumStr = sum === rawSum ? `${sum}` : `${rawSum}→${sum}`;
    const detail = `defensa ${rolls.map(r => `${r.g.defender.name} «${r.g.action.name}» ${r.absorbing ? 'aguanta' : r.total}`).join(' + ')} = ${sumStr}`;
    return { adjustedAttacker, sum, weak, detail };
  }

  /** End-of-round: coordinated hooks, damage-over-time / regen, and turn advance. */
  finishRound(): void {
    for (const p of this.pending) this.dispatch('postRound', p.actor, p.action.def, { targets: p.targets ?? [] });
    this.dispatchStatusRoundEnd();
    for (const c of this.allCombatants()) c.advanceTurn();
    this.pending = [];
    this.revealedPlan = [];
    this.pendingIndex = 0;
    this.tierSpeed = null;
    this.roundPrepared = false;
  }

  // --- Win conditions / driving ---------------------------------------------

  winner(): number | null {
    const aAlive = this.livingTeam(0).length > 0;
    const bAlive = this.livingTeam(1).length > 0;
    if (aAlive && !bAlive) return 0;
    if (bAlive && !aAlive) return 1;
    return null;
  }

  isOver(): boolean {
    return this.livingTeam(0).length === 0 || this.livingTeam(1).length === 0;
  }

  /** One fully-AI round (simulator). */
  runRound(): void {
    this.prepareRound();
    this.planActions([]);
    let r = this.resolveNextAction();
    while (r.kind !== 'done') {
      if (r.kind === 'target') { this.setResolveTargetAuto(); }
      r = this.resolveNextAction();
    }
    this.finishRound();
  }

  /** Safety: auto-fill targets for the current action (used if an AI somehow prompts). */
  private setResolveTargetAuto(): void {
    const cur = this.pending[this.pendingIndex];
    if (!cur) return;
    const req = this.requirementOf(cur.actor, cur.action.def);
    cur.targets = this.autoTargets(cur.actor, cur.action.def, req, this.targetCountOf(cur.actor, cur.action.def), cur.speed);
  }

  runCombat(stats?: CombatStats): CombatResult {
    while (!this.isOver() && this.round < this.maxRounds) this.runRound();
    const winner = this.winner();
    if (stats) this.recordStats(stats, winner);
    return { winner, rounds: this.round };
  }

  private recordStats(stats: CombatStats, winner: number | null): void {
    stats.combats++;
    stats.rounds += this.round;
    for (const p of this.plays) {
      addTo(stats.actionPlays, p.actionId);
      addTo(stats.actionTypePlays, p.actionType);
      if (winner !== null && p.team === winner) addTo(stats.actionWinPlays, p.actionId);
    }
  }
}
