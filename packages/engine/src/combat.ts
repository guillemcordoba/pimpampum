import { DiceRoll } from './dice.js';
import { Character, StatusEntry } from './character.js';
import { ActionInstance, getActionTargetRequirement, getActionTargetCount } from './action.js';
import { ActionDefinition, ActionType, TargetRequirement } from './types.js';
import {
  EffectRegistry, EngineApi, EffectContext, AttackModifiers, newAttackModifiers,
} from './effects.js';
import { StatusBehavior, StatusHookContext, AttackStatusMods, ContestKind } from './status.js';
import { rollD20, resolveAttack, checkSkillUp } from './resolution.js';
import { selectAction, pickResolveTargets, AIView, PendingSummary } from './ai.js';
import { DEFAULT_FATIGUE_COST } from './fatigue.js';

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

/** Result of resolving one step of a round. */
export type StepResult =
  | { kind: 'target'; prompt: TargetPrompt }
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
}

export interface CombatEngineOptions {
  registry: EffectRegistry;
  maxRounds?: number;
  /** AI decisiveness: exponent on action weights (1 = soft sampling, higher =
   *  greedier, human-like play). Default 2. */
  aiSharpness?: number;
}

const HOOKS = ['onResolve', 'onAttackHit', 'onAttackMiss', 'onDefend', 'onBlockFail', 'modifyAttack', 'postRound'] as const;
type HookName = typeof HOOKS[number];

export class CombatEngine implements EngineApi, AIView {
  readonly registry: EffectRegistry;
  readonly teams: [Character[], Character[]];
  readonly maxRounds: number;
  readonly aiSharpness: number;
  round = 0;
  logEntries: LogEntry[] = [];

  private plays: { team: number; actionId: string; actionType: ActionType }[] = [];

  // Step-by-step round state.
  private pending: PendingAction[] = [];
  private pendingIndex = 0;
  private tierSpeed: number | null = null;
  private tierAlive: Set<Character> = new Set();
  private tierInterrupted: Set<Character> = new Set();
  private skippingThisRound: Set<Character> = new Set();

  constructor(teamA: Character[], teamB: Character[], opts: CombatEngineOptions) {
    this.registry = opts.registry;
    this.maxRounds = opts.maxRounds ?? 50;
    this.aiSharpness = opts.aiSharpness ?? 2;
    this.teams = [teamA, teamB];
    teamA.forEach(c => { c.team = 0; });
    teamB.forEach(c => { c.team = 1; });
    for (const c of [...teamA, ...teamB]) c.resetForNewCombat();
    this.dispatchCombatStart();
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
    return c.statusRefs().some(ref => ref.entry.behavior?.untargetable?.(ref));
  }

  /** Whether `c` perceives concealed/untargetable enemies (seismic senses…). */
  private sensesConcealed(c: Character): boolean {
    return c.statusRefs().some(ref => ref.entry.behavior?.ignoresConcealment?.(ref));
  }
  rollD20(): number { return rollD20(); }

  /** Roll a d20 for `c`, honouring any status-imposed roll mode
   *  (`data.rollMode`): disadvantage keeps the lower of two rolls, advantage
   *  the higher. Disadvantage wins if both are present. `kind` gives stances
   *  contest context (advantage only on defense, say). */
  rollD20For(c: Character, kind?: ContestKind): number {
    const r1 = rollD20();
    let mode: 'advantage' | 'disadvantage' | null = null;
    for (const ref of c.statusRefs()) {
      const m = ref.entry.behavior?.rollMode?.(ref, kind);
      if (m === 'disadvantage') { mode = m; break; }
      if (m === 'advantage') mode = m;
    }
    if (mode === null) return r1;
    const r2 = rollD20();
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
    this.logEntries.push({ kind, message, team, round: this.round });
  }

  applyPvLoss(target: Character, amount: number, _source?: Character): boolean {
    if (amount <= 0) return !target.isAlive();
    // Statuses may clamp the loss (last stands, wards).
    for (const ref of target.statusRefs()) {
      const f = ref.entry.behavior?.clampPvLoss;
      if (f) amount = f(ref, amount);
    }
    const died = target.loseLife(amount);
    if (died) this.log('death', `${target.name} cau derrotat!`, target.team);
    return died;
  }

  heal(target: Character, amount: number): void {
    if (amount <= 0) return;
    const before = target.currentPV;
    target.heal(amount);
    const gained = target.currentPV - before;
    if (gained > 0) this.log('heal', `${target.name} recupera ${gained} PV.`, target.team);
  }

  performExtraAttack(source: Character, target: Character, damageDice: DiceRoll, opts: { skillId?: string; rollBonus?: number; ignoreArmor?: boolean; label?: string } = {}): void {
    if (!target.isAlive() || (target.team !== source.team && this.isUntargetable(target) && !this.sensesConcealed(source))) return;
    const label = opts.label ?? source.name;
    const skillId = opts.skillId ?? '';
    const skill = skillId ? source.getRollSkill(skillId, 'attack') : 0;
    const guard = this.activeGuard(target);
    let recipient = target;
    let hit = true;
    if (guard) {
      const atkRoll = this.rollD20For(source, 'attack');
      const atkBonus = skill + (opts.rollBonus ?? 0);
      const attackerTotal = atkRoll + atkBonus;
      const defRoll = this.rollD20For(guard.defender, 'defense');
      const defBonus = guard.defender.getRollSkill(guard.action.skillId, 'defense') + (guard.action.rollBonus ?? 0);
      let defenderTotal = defRoll + defBonus;
      this.log('roll', `🎲 ${label}: atac ${atkRoll}+${atkBonus}=${attackerTotal} vs ${guard.defender.name} «${guard.action.name}»: defensa ${defRoll}+${defBonus}=${defenderTotal}`, source.team);
      const adjustedAttacker = this.adjustContestTotal(source, attackerTotal, defenderTotal, 'attack');
      defenderTotal = this.adjustContestTotal(guard.defender, defenderTotal, adjustedAttacker, 'defense');
      hit = resolveAttack(adjustedAttacker, defenderTotal).hit;
      recipient = guard.defender;
    }
    if (!hit) { this.log('defense', `${recipient.name} bloqueja ${label}.`, recipient.team); return; }
    const dmgRoll = this.applyOutgoingDamage(source, damageDice.roll());
    const armor = opts.ignoreArmor ? 0 : recipient.getPassiveArmor();
    const dmg = Math.max(0, this.applyIncomingDamage(recipient, dmgRoll - armor));
    const dmgDetail = armor > 0 ? ` (dau ${dmgRoll} − ${armor} armadura)` : ` (dau ${dmgRoll})`;
    this.log('attack', `${label} colpeja ${recipient.name} (${dmg} dany)${dmgDetail}.`, source.team);
    // An impact interrupts a pending focus even at 0 damage (see resolveAttackOnTarget).
    recipient.hitThisTurn = true;
    this.applyPvLoss(recipient, dmg, source);
  }

  addCombatant(team: number, c: Character): void {
    c.team = team;
    c.resetForNewCombat();
    this.teams[team].push(c);
    this.log('summon', `${c.name} entra al combat.`, team);
  }

  // --- Helpers --------------------------------------------------------------

  private activeGuard(target: Character): Character['guards'][number] | null {
    for (const ref of target.statusRefs()) {
      if (ref.entry.behavior?.preventsGuard?.(ref)) return null;
    }
    for (let i = target.guards.length - 1; i >= 0; i--) {
      const g = target.guards[i];
      if (g.defender.isAlive()) return g;
    }
    return null;
  }

  private ctx(source: Character, action: ActionDefinition, params: Record<string, unknown>, extra: Partial<EffectContext> = {}): EffectContext {
    return { engine: this, source, action, params, targets: extra.targets ?? [], ...extra };
  }

  private dispatch(hook: HookName, source: Character, action: ActionDefinition, base: Partial<EffectContext>): void {
    for (const eff of action.effects) {
      const handler = this.registry.getHandler(eff.type);
      const fn = handler?.[hook] as ((ctx: EffectContext) => void) | undefined;
      if (fn) fn(this.ctx(source, action, eff.params ?? {}, base));
    }
  }

  /** Spend-on-play hook: run when an action actually goes off (resource costs). */
  private dispatchPlay(source: Character, action: ActionDefinition): void {
    for (const eff of action.effects) {
      this.registry.getHandler(eff.type)?.onPlay?.(this.ctx(source, action, eff.params ?? {}));
    }
  }

  /** Whether a character may play the action at `actionIdx` now (resource gates).
   *  Used by the web UI to disable unaffordable cards. */
  canPlayActionIdx(c: Character, actionIdx: number): boolean {
    const action = c.actions[actionIdx];
    if (!action) return false;
    for (const ref of c.statusRefs()) {
      if (ref.entry.behavior?.blocksActionType?.(ref, action.def.actionType)) return false;
    }
    for (const eff of action.def.effects) {
      const fn = this.registry.getHandler(eff.type)?.canPlay;
      if (fn && !fn(c, eff.params ?? {})) return false;
    }
    return true;
  }

  allCombatants(): Character[] { return [...this.teams[0], ...this.teams[1]]; }
  allLiving(): Character[] { return this.allCombatants().filter(c => c.isAlive()); }

  private resolveRef(ref: TargetRef): Character { return this.teams[ref.team][ref.idx]; }
  private refOf(c: Character): TargetRef { return { team: c.team, idx: this.teams[c.team].indexOf(c) }; }

  /** Eligible targets for an action's requirement (healing includes downed allies). */
  private eligibleTargets(actor: Character, def: ActionDefinition, req: TargetRequirement): Character[] {
    if (req === 'enemy') return this.enemiesOf(actor);
    if (req === 'self') return [actor];
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
    const skipping: TargetRef[] = [];
    this.skippingThisRound = new Set();
    for (const c of this.allLiving()) {
      if (c.resetForNewRound()) {
        this.skippingThisRound.add(c);
        skipping.push(this.refOf(c));
        this.log('info', `${c.name} perd el torn.`, c.team);
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
    for (const c of this.allLiving()) {
      if (this.skippingThisRound.has(c)) continue;
      const sel = selByChar.get(c);
      let action: ActionInstance | undefined;
      let targets: Character[] | null;
      if (sel) {
        action = c.actions[sel.actionIdx];
        targets = sel.targets ? sel.targets.map(t => this.resolveRef(t)) : null;
      } else {
        const planned = selectAction(this, c);
        action = c.actions[planned.actionIdx];
        targets = null; // AI targets at resolution time, with reveal-level info
      }
      if (!action) continue;
      c.playedActionIdx = c.actions.indexOf(action);
      this.plays.push({ team: c.team, actionId: action.def.id, actionType: action.def.actionType });
      built.push({ actor: c, action, speed: c.getEffectiveSpeed(action), targets });
    }

    built.sort((a, b) => b.speed - a.speed);
    this.pending = built;
    this.pendingIndex = 0;
    this.tierSpeed = null;

    return built.map(p => this.reveal(p));
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
    };
  }

  get pendingCount(): number { return this.pending.length; }
  get currentPendingIndex(): number { return this.pendingIndex; }

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

    p.action = newAction;
    p.speed = actor.getEffectiveSpeed(newAction);
    p.targets = null;
    actor.playedActionIdx = newActionIdx;
    this.plays.push({ team: actor.team, actionId: newAction.def.id, actionType: newAction.def.actionType });

    this.pending.sort((a, b) => b.speed - a.speed);
    this.pendingIndex = 0;
    this.tierSpeed = null;
    return reveal();
  }

  /** Set targets for the action currently awaiting resolution (after a 'target' prompt). */
  setResolveTarget(targets: TargetRef[]): void {
    const cur = this.pending[this.pendingIndex];
    if (cur) cur.targets = targets.map(t => this.resolveRef(t));
  }

  /**
   * Resolve the next action. Returns a 'target' prompt when a human-controlled actor
   * still needs to choose targets, a 'resolved' result with the new log lines, or 'done'.
   */
  resolveNextAction(): StepResult {
    if (this.pendingIndex >= this.pending.length) return { kind: 'done' };
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
      const req = getActionTargetRequirement(cur.action.def, this.registry);
      if (req === 'none') {
        cur.targets = [];
      } else {
        const pool = this.eligibleTargets(cur.actor, cur.action.def, req);
        const count = getActionTargetCount(cur.action.def);
        if (count >= pool.length) {
          cur.targets = pool;
        } else if (cur.actor.aiStrategy !== null) {
          cur.targets = this.autoTargets(cur.actor, cur.action.def, req, count, cur.speed);
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
    this.resolveOne(cur);
    this.pendingIndex++;
    return {
      kind: 'resolved',
      logs: this.logEntries.slice(before),
      action: this.reveal(cur),
      done: this.pendingIndex >= this.pending.length,
    };
  }

  private autoTargets(actor: Character, def: ActionDefinition, req: TargetRequirement, count: number, speed: number): Character[] {
    const pool = this.eligibleTargets(actor, def, req);
    return pickResolveTargets(this, actor, def, req, count, pool, speed);
  }

  private resolveOne(cur: PendingAction): void {
    const { actor, action } = cur;
    const targets = cur.targets ?? [];
    switch (action.def.actionType) {
      case ActionType.Defensa: {
        this.dispatchPlay(actor, action.def);
        const guarded = targets.length ? targets : [actor];
        for (const ally of guarded) ally.guards.push({ defender: actor, action: action.def });
        if (!guarded.includes(actor)) actor.guards.push({ defender: actor, action: action.def });
        this.log('defense', `${actor.name} «${action.def.name}» protegeix ${guarded.map(a => a.name).join(', ')}.`, actor.team);
        this.dispatch('onResolve', actor, action.def, { targets: guarded });
        break;
      }
      case ActionType.Atac: {
        // Stepping forward to attack may trip enemy hazards — possibly fatally.
        this.triggerHazards(actor);
        if (!actor.isAlive()) break;
        this.dispatchPlay(actor, action.def);
        // Generic attack-action status hooks (ladders, multipliers).
        const mods = this.collectAttackStatusMods(actor);
        const valid = targets.filter(t => this.tierAlive.has(t) && !(t.team !== actor.team && this.isUntargetable(t) && !this.sensesConcealed(actor)));
        let list = valid.length ? valid : this.enemiesOf(actor).slice(0, 1);
        list = this.applyTargetRedirects(actor, list);
        for (const t of list) this.resolveAttackOnTarget(actor, action, t, mods);
        // Generic repeat seam: statuses may grant extra full passes over the
        // still-living targets (stimulants, flurries).
        const repeats = this.collectAttackRepeats(actor);
        for (let r = 0; r < repeats; r++) {
          if (!actor.isAlive()) break;
          const alive = list.filter(t => t.isAlive());
          if (alive.length === 0) break;
          for (const t of alive) this.resolveAttackOnTarget(actor, action, t, mods);
        }
        if (action.def.isConsumable) action.consumed = true;
        break;
      }
      case ActionType.Focus: {
        if (this.tierInterrupted.has(actor)) {
          this.log('interrupt', `El focus «${action.def.name}» de ${actor.name} s'interromp!`, actor.team);
        } else {
          this.dispatchPlay(actor, action.def);
          this.log('focus', `${actor.name} usa «${action.def.name}».`, actor.team);
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
  private applyIncomingDamage(recipient: Character, dmg: number): number {
    for (const { key, entry, behavior } of this.behaviorStatuses(recipient)) {
      const f = behavior.modifyIncomingDamage;
      if (f) dmg = f(this.statusCtx(recipient, key, entry), dmg);
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

  /** onAttackAction over the attacker's statuses; multipliers combine. */
  private collectAttackStatusMods(actor: Character): AttackStatusMods {
    const mods: AttackStatusMods = {};
    for (const { key, entry, behavior } of this.behaviorStatuses(actor)) {
      const m = behavior.onAttackAction?.(this.statusCtx(actor, key, entry));
      if (!m) continue;
      if (m.attackTotalMult !== undefined) mods.attackTotalMult = (mods.attackTotalMult ?? 1) * m.attackTotalMult;
      if (m.damageMult !== undefined) mods.damageMult = (mods.damageMult ?? 1) * m.damageMult;
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

  private resolveAttackOnTarget(source: Character, action: ActionInstance, target: Character, statusMods: AttackStatusMods = {}): void {
    const def = action.def;
    const mods: AttackModifiers = newAttackModifiers();
    this.dispatch('modifyAttack', source, def, { targets: [target], target, attackMods: mods });

    // An effect may pass over this target entirely — no roll, no damage.
    if (mods.skip) return;

    // Feints bypass the guard entirely (treated as undefended) — unless a
    // status on the target vetoes the bypass (seismic awareness & co.).
    const feintBlocked = mods.ignoreDefense
      && target.statusRefs().some(ref => ref.entry.behavior?.preventsGuardBypass?.(ref));
    const bypass = mods.ignoreDefense && !feintBlocked;
    const guard = bypass ? null : this.activeGuard(target);
    let recipient = target;
    let hit: boolean;
    let margin: number;

    const guardAbsorbs = guard
      ? guard.defender.statusRefs().some(ref => ref.entry.behavior?.absorbsGuard?.(ref))
      : false;

    if (guard && guardAbsorbs) {
      // Absorbing guard: zero defence — the blow always lands in full on the guard.
      hit = true; margin = Infinity; recipient = guard.defender;
      this.log('defense', `${guard.defender.name} «${guard.action.name}» aguanta el cop sencer.`, guard.defender.team);
    } else if (guard) {
      const atkRoll = this.rollD20For(source, 'attack');
      const atkBonus = source.getRollSkill(def.skillId, 'attack') + (def.rollBonus ?? 0) + mods.rollBonus + this.attackRollBonusAgainst(target);
      // Status multipliers (attack chains) scale the whole attack total.
      const attackerTotal = (atkRoll + atkBonus) * (statusMods.attackTotalMult ?? 1);
      const defender = guard.defender;
      const defRoll = this.rollD20For(defender, 'defense');
      const defBonus = defender.getRollSkill(guard.action.skillId, 'defense') + (guard.action.rollBonus ?? 0);
      let defenderTotal = defRoll + defBonus;
      this.log('roll', `🎲 ${source.name} «${def.name}»: atac ${atkRoll}+${atkBonus}=${attackerTotal} vs ${defender.name} «${guard.action.name}»: defensa ${defRoll}+${defBonus}=${defenderTotal}`, source.team);
      // Clutch status adjustments, seeing both totals (rune flares & co.).
      const adjustedAttacker = this.adjustContestTotal(source, attackerTotal, defenderTotal, 'attack');
      defenderTotal = this.adjustContestTotal(defender, defenderTotal, adjustedAttacker, 'defense');
      const res = resolveAttack(adjustedAttacker, defenderTotal);
      hit = res.hit; margin = res.margin;
      if (checkSkillUp(hit, margin)) source.raiseSkill(def.skillId);
      if (checkSkillUp(!hit, margin)) defender.raiseSkill(guard.action.skillId);
      recipient = defender;
    } else {
      // Standing defenses (walls, wards) contest attacks on the unguarded —
      // bypassed by the same legitimate feints that bypass live guards.
      const standing = bypass ? null : this.bestStandingGuard(target);
      if (standing) {
        const atkRoll = this.rollD20For(source, 'attack');
        const atkBonus = source.getRollSkill(def.skillId, 'attack') + (def.rollBonus ?? 0) + mods.rollBonus + this.attackRollBonusAgainst(target);
        const attackerRaw = (atkRoll + atkBonus) * (statusMods.attackTotalMult ?? 1);
        this.log('roll', `🎲 ${source.name} «${def.name}»: atac ${atkRoll}+${atkBonus}=${attackerRaw} vs «${standing.key}» de ${target.name}: defensa ${standing.total}`, source.team);
        const attackerTotal = this.adjustContestTotal(source, attackerRaw, standing.total, 'attack');
        const res = resolveAttack(attackerTotal, standing.total);
        if (checkSkillUp(res.hit, res.margin)) source.raiseSkill(def.skillId);
        if (!res.hit) {
          this.log('defense', `«${standing.key}» atura l'atac de ${source.name} «${def.name}».`, target.team);
          this.dispatch('onAttackMiss', source, def, { targets: [target], target, hit: false, margin: res.margin });
          return;
        }
        standing.behavior.onStandingGuardBroken?.(this.statusCtx(target, standing.key, standing.entry));
        hit = true; margin = res.margin;
      } else {
        hit = true; margin = Infinity;
      }
    }

    if (!hit && guard) {
      this.log('defense', `${guard.defender.name} «${guard.action.name}» bloqueja l'atac de ${source.name} «${def.name}».`, guard.defender.team);
      this.dispatch('onAttackMiss', source, def, { targets: [target], target: recipient, hit: false, margin });
      this.dispatch('onDefend', guard.defender, guard.action, { targets: [target], target: source });
      return;
    }

    let dmgRoll = def.damageDice ? def.damageDice.roll() : 0;
    for (const d of mods.extraDamageDice) dmgRoll += d.roll();
    dmgRoll += mods.bonusDamage;
    // Attacker statuses transform the outgoing damage.
    dmgRoll = this.applyOutgoingDamage(source, dmgRoll);
    // Status multipliers (attack chains) scale the damage too.
    dmgRoll *= statusMods.damageMult ?? 1;
    const armor = mods.ignoreArmor ? 0 : recipient.getPassiveArmor();
    // Recipient statuses transform the incoming damage (marks, rages…).
    const dmg = Math.max(0, this.applyIncomingDamage(recipient, Math.max(0, dmgRoll - armor)));
    const note = guard ? ` (penetra la defensa de ${guard.defender.name})` : '';
    const dmgDetail = armor > 0 ? ` (dau ${dmgRoll} − ${armor} armadura)` : ` (dau ${dmgRoll})`;
    this.log('attack', `${source.name} «${def.name}» colpeja ${recipient.name}${note}: ${dmg} dany${dmgDetail}.`, source.team);
    // An impact interrupts a pending focus even when armour absorbs all the
    // damage (rules.md: "es cancel·len si el jugador rep un impacte").
    recipient.hitThisTurn = true;
    this.applyPvLoss(recipient, dmg, source);
    this.dispatch('onAttackHit', source, def, { targets: [target], target: recipient, hit: true, damageDealt: dmg, margin });
    if (guard && recipient === guard.defender && dmg > 0) {
      this.dispatch('onBlockFail', guard.defender, guard.action, { targets: [target], target: source, damageDealt: dmg });
    }
  }

  /** End-of-round: coordinated hooks, damage-over-time / regen, and turn advance. */
  finishRound(): void {
    for (const p of this.pending) this.dispatch('postRound', p.actor, p.action.def, { targets: p.targets ?? [] });
    this.dispatchStatusRoundEnd();
    this.accumulateFatigue();
    for (const c of this.allCombatants()) c.advanceTurn();
    this.pending = [];
    this.pendingIndex = 0;
    this.tierSpeed = null;
  }

  /** Each actor who took an action this round gains its fatigue cost. Skipping
   *  / stunned characters did not act, so they don't tire. Dead actors are
   *  past caring. Interrupted focus actions still tire — you exerted the will
   *  to start them. */
  private accumulateFatigue(): void {
    for (const p of this.pending) {
      if (!p.actor.isAlive()) continue;
      p.actor.fatigue += p.action.def.fatigueCost ?? DEFAULT_FATIGUE_COST;
    }
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
    const req = getActionTargetRequirement(cur.action.def, this.registry);
    cur.targets = this.autoTargets(cur.actor, cur.action.def, req, getActionTargetCount(cur.action.def), cur.speed);
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
