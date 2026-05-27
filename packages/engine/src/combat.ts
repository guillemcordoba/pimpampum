import { DiceRoll } from './dice.js';
import { Character } from './character.js';
import { ActionInstance, getActionTargetRequirement, getActionTargetCount } from './action.js';
import { ActionDefinition, ActionType, TargetRequirement } from './types.js';
import {
  EffectRegistry, EngineApi, EffectContext, AttackModifiers, newAttackModifiers,
} from './effects.js';
import { rollD20, resolveAttack, checkSkillUp } from './resolution.js';
import { selectAction, AIView } from './ai.js';

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
}

export interface CombatEngineOptions {
  registry: EffectRegistry;
  maxRounds?: number;
}

const HOOKS = ['onResolve', 'onAttackHit', 'onAttackMiss', 'onDefend', 'modifyAttack', 'postRound'] as const;
type HookName = typeof HOOKS[number];

export class CombatEngine implements EngineApi, AIView {
  readonly registry: EffectRegistry;
  readonly teams: [Character[], Character[]];
  readonly maxRounds: number;
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
    this.teams = [teamA, teamB];
    teamA.forEach(c => { c.team = 0; });
    teamB.forEach(c => { c.team = 1; });
    for (const c of [...teamA, ...teamB]) c.resetForNewCombat();
  }

  // --- EngineApi / AIView ---------------------------------------------------

  teamOf(c: Character): number { return c.team; }
  livingTeam(team: number): Character[] { return this.teams[team].filter(c => c.isAlive()); }
  alliesOf(c: Character, includeSelf = false): Character[] {
    return this.teams[c.team].filter(a => a.isAlive() && (includeSelf || a !== c));
  }
  enemiesOf(c: Character): Character[] { return this.teams[1 - c.team].filter(e => e.isAlive()); }
  rollD20(): number { return rollD20(); }

  log(kind: string, message: string, team?: number): void {
    this.logEntries.push({ kind, message, team, round: this.round });
  }

  applyPvLoss(target: Character, amount: number, _source?: Character): boolean {
    if (amount <= 0) return !target.isAlive();
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
    if (!target.isAlive()) return;
    const label = opts.label ?? source.name;
    const skillId = opts.skillId ?? '';
    const skill = skillId ? source.getRollSkill(skillId, 'attack') : 0;
    const guard = this.activeGuard(target);
    let recipient = target;
    let hit = true;
    if (guard) {
      const atkRoll = rollD20();
      const atkBonus = skill + (opts.rollBonus ?? 0);
      const attackerTotal = atkRoll + atkBonus;
      const defRoll = rollD20();
      const defBonus = guard.defender.getRollSkill(guard.action.skillId, 'defense') + (guard.action.rollBonus ?? 0);
      const defenderTotal = defRoll + defBonus;
      this.log('roll', `🎲 ${label}: atac ${atkRoll}+${atkBonus}=${attackerTotal} vs ${guard.defender.name} «${guard.action.name}»: defensa ${defRoll}+${defBonus}=${defenderTotal}`, source.team);
      hit = resolveAttack(attackerTotal, defenderTotal).hit;
      recipient = guard.defender;
    }
    if (!hit) { this.log('defense', `${recipient.name} bloqueja ${label}.`, recipient.team); return; }
    const dmgRoll = damageDice.roll();
    const armor = opts.ignoreArmor ? 0 : recipient.getPassiveArmor();
    const dmg = Math.max(0, dmgRoll - armor);
    const dmgDetail = armor > 0 ? ` (dau ${dmgRoll} − ${armor} armadura)` : ` (dau ${dmgRoll})`;
    this.log('attack', `${label} colpeja ${recipient.name} (${dmg} dany)${dmgDetail}.`, source.team);
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
        targets = planned.targets;
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
          cur.targets = this.autoTargets(cur.actor, cur.action.def, req, count);
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

  private autoTargets(actor: Character, def: ActionDefinition, req: TargetRequirement, count: number): Character[] {
    const pool = this.eligibleTargets(actor, def, req);
    if (req === 'enemy') return [...pool].sort((a, b) => a.currentPV - b.currentPV).slice(0, count);
    return [...pool].sort((a, b) => (a.currentPV / a.maxPV) - (b.currentPV / b.maxPV)).slice(0, count);
  }

  private resolveOne(cur: PendingAction): void {
    const { actor, action } = cur;
    const targets = cur.targets ?? [];
    switch (action.def.actionType) {
      case ActionType.Defensa: {
        const guarded = targets.length ? targets : [actor];
        for (const ally of guarded) ally.guards.push({ defender: actor, action: action.def });
        if (!guarded.includes(actor)) actor.guards.push({ defender: actor, action: action.def });
        this.log('defense', `${actor.name} «${action.def.name}» protegeix ${guarded.map(a => a.name).join(', ')}.`, actor.team);
        this.dispatch('onResolve', actor, action.def, { targets: guarded });
        break;
      }
      case ActionType.Atac: {
        const valid = targets.filter(t => this.tierAlive.has(t));
        const list = valid.length ? valid : this.enemiesOf(actor).slice(0, 1);
        for (const t of list) this.resolveAttackOnTarget(actor, action, t);
        if (action.def.isConsumable) action.consumed = true;
        break;
      }
      case ActionType.Focus: {
        if (this.tierInterrupted.has(actor)) {
          this.log('interrupt', `El focus «${action.def.name}» de ${actor.name} s'interromp!`, actor.team);
        } else {
          this.log('focus', `${actor.name} usa «${action.def.name}».`, actor.team);
          this.dispatch('onResolve', actor, action.def, { targets });
          if (action.def.isConsumable) action.consumed = true;
        }
        break;
      }
    }
  }

  private resolveAttackOnTarget(source: Character, action: ActionInstance, target: Character): void {
    const def = action.def;
    const mods: AttackModifiers = newAttackModifiers();
    this.dispatch('modifyAttack', source, def, { targets: [target], target, attackMods: mods });

    const guard = this.activeGuard(target);
    let recipient = target;
    let hit: boolean;
    let margin: number;

    if (guard) {
      const atkRoll = rollD20();
      const atkBonus = source.getRollSkill(def.skillId, 'attack') + (def.rollBonus ?? 0) + mods.rollBonus;
      const attackerTotal = atkRoll + atkBonus;
      const defender = guard.defender;
      const defRoll = rollD20();
      const defBonus = defender.getRollSkill(guard.action.skillId, 'defense') + (guard.action.rollBonus ?? 0);
      const defenderTotal = defRoll + defBonus;
      this.log('roll', `🎲 ${source.name} «${def.name}»: atac ${atkRoll}+${atkBonus}=${attackerTotal} vs ${defender.name} «${guard.action.name}»: defensa ${defRoll}+${defBonus}=${defenderTotal}`, source.team);
      const res = resolveAttack(attackerTotal, defenderTotal);
      hit = res.hit; margin = res.margin;
      if (checkSkillUp(hit, margin)) source.raiseSkill(def.skillId);
      if (checkSkillUp(!hit, margin)) defender.raiseSkill(guard.action.skillId);
      recipient = defender;
    } else {
      hit = true; margin = Infinity;
    }

    if (!hit && guard) {
      this.log('defense', `${guard.defender.name} «${guard.action.name}» bloqueja l'atac de ${source.name} «${def.name}».`, guard.defender.team);
      this.dispatch('onAttackMiss', source, def, { targets: [target], target: recipient, hit: false, margin });
      this.dispatch('onDefend', guard.defender, guard.action, { targets: [source], target: source });
      return;
    }

    let dmgRoll = def.damageDice ? def.damageDice.roll() : 0;
    for (const d of mods.extraDamageDice) dmgRoll += d.roll();
    dmgRoll += mods.bonusDamage;
    const armor = mods.ignoreArmor ? 0 : recipient.getPassiveArmor();
    const dmg = Math.max(0, dmgRoll - armor);
    const note = guard ? ` (penetra la defensa de ${guard.defender.name})` : '';
    const dmgDetail = armor > 0 ? ` (dau ${dmgRoll} − ${armor} armadura)` : ` (dau ${dmgRoll})`;
    this.log('attack', `${source.name} «${def.name}» colpeja ${recipient.name}${note}: ${dmg} dany${dmgDetail}.`, source.team);
    this.applyPvLoss(recipient, dmg, source);
    this.dispatch('onAttackHit', source, def, { targets: [target], target: recipient, hit: true, damageDealt: dmg, margin });
  }

  /** End-of-round: coordinated hooks, damage-over-time / regen, and turn advance. */
  finishRound(): void {
    for (const p of this.pending) this.dispatch('postRound', p.actor, p.action.def, { targets: p.targets ?? [] });
    this.applyStatusTicks();
    for (const c of this.allCombatants()) c.advanceTurn();
    this.pending = [];
    this.pendingIndex = 0;
    this.tierSpeed = null;
  }

  private applyStatusTicks(): void {
    for (const c of this.allLiving()) {
      for (const [key, entry] of c.statuses) {
        const dot = entry.data?.dot;
        if (typeof dot === 'number' && dot > 0) {
          this.log('poison', `${c.name} pateix ${dot} de dany (${key}).`, c.team);
          this.applyPvLoss(c, dot, undefined);
        }
        const regen = entry.data?.regen;
        if (typeof regen === 'number' && regen > 0 && c.isAlive()) this.heal(c, regen);
      }
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
    cur.targets = this.autoTargets(cur.actor, cur.action.def, req, getActionTargetCount(cur.action.def));
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
