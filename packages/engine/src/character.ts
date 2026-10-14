import { CombatModifier, ModifierDuration } from './modifier.js';
import { ActionInstance } from './action.js';
import { ActionDefinition, EquipmentDefinition, EquipmentSlot, SkillInstance } from './types.js';
import { clampFatigue, fatigueRollPenalty, fatigueStateName } from './fatigue.js';
import type { StatusBehavior, StatusRef } from './status.js';

/**
 * A temporary status flag/stack on a character. Mechanics come exclusively
 * from the attached `behavior` (see StatusBehavior): the engine invokes its
 * hooks at fixed pipeline seams and never interprets `data` or knows a status
 * by name. A status without a behaviour is inert bookkeeping (resource pools,
 * markers read back by effect handlers).
 */
export interface StatusEntry {
  /** Magnitude or stack count; 1 for plain flags. */
  value: number;
  /** Turns remaining; -1 means rest of combat. Decremented each turn. */
  remaining: number;
  /** Effect-private payload (never interpreted by the engine). */
  data?: Record<string, unknown>;
  /** The code that animates this status, attached by whoever set it. */
  behavior?: StatusBehavior;
}

/** The status hooks the engine asks for at every blow, roll, targeting query
 *  or decision — where almost no character holds a status that has one. */
const GATED_HOOKS = [
  'modifySpeed', 'rollMode', 'modifyOutgoingDamage', 'modifyIncomingDamage', 'modifyContestTotal',
  'clampPvLoss', 'attackRollAgainstHolder', 'defensePenaltyAgainst', 'preventsGuard', 'excludesAllyGuards',
  'untargetable', 'ignoresConcealment', 'preventsGuardBypass', 'onAttackAction', 'redirectAttackTarget',
  'attackTargetsOnly', 'attackTargetsExcluded', 'onAllyTargeted', 'onTargeted', 'guardsBlow', 'afterBlow',
  'beforeHolderAction', 'skipsRound', 'plainCards', 'onPvLost', 'opensGuardTo', 'onEnemyAttackAction',
  'attackRepeats', 'standingGuard', 'blocksActionType', 'adjustActionWeight', 'onRoundStart',
  // The second word of the mask.
  'onRoundEnd', 'choosesAfterReveal', 'cardSwapCharges', 'absorbsGuard', 'positionValue',
] as const satisfies readonly (keyof StatusBehavior)[];
export type GatedHook = typeof GATED_HOOKS[number];

/** A hook's bit: bits 0-31 are the low word of the mask, 32 on the high. */
const HOOK_INDEX = Object.fromEntries(GATED_HOOKS.map((h, i) => [h, i])) as Record<GatedHook, number>;
const behaviorMasks = new WeakMap<StatusBehavior, [number, number]>();

function hookMaskOf(behavior: StatusBehavior): [number, number] {
  let mask = behaviorMasks.get(behavior);
  if (mask === undefined) {
    mask = [0, 0];
    for (const h of GATED_HOOKS) {
      const i = HOOK_INDEX[h];
      if (behavior[h]) mask[i >> 5] |= 1 << (i & 31);
    }
    behaviorMasks.set(behavior, mask);
  }
  return mask;
}

/** A character's statuses, which also know which gated hooks any of them
 *  carries — so the engine skips the walk when none does. The answer is
 *  recomputed after any set, delete or clear. */
export class StatusMap extends Map<string, StatusEntry> {
  private low = 0;
  private high = 0;
  private stale = true;

  override set(key: string, entry: StatusEntry): this {
    this.stale = true;
    return super.set(key, entry);
  }

  override delete(key: string): boolean {
    this.stale = true;
    return super.delete(key);
  }

  override clear(): void {
    this.stale = true;
    super.clear();
  }

  holds(hook: GatedHook): boolean {
    if (this.size === 0) return false;
    if (this.stale) {
      let low = 0, high = 0;
      for (const entry of this.values()) {
        if (!entry.behavior) continue;
        const [l, h] = hookMaskOf(entry.behavior);
        low |= l;
        high |= h;
      }
      this.low = low;
      this.high = high;
      this.stale = false;
    }
    const i = HOOK_INDEX[hook];
    return ((i < 32 ? this.low : this.high) & (1 << (i & 31))) !== 0;
  }
}

/** A guard linking a defender to the ally (or self) they are protecting this round. */
export interface Guard {
  defender: Character;
  /** The defense action providing the guard (for skill/rollBonus/effects). */
  action: ActionDefinition;
  /** A defense already rolled: this total contests every attack the guard
   *  covers, instead of a fresh roll of the action's dice per attack (a blow
   *  whose one roll is both its attack and its parry). */
  fixedTotal?: number;
  /** The guard covers only attacks by this character — raised against one
   *  opponent's blows, not against everyone's. */
  onlyAgainst?: Character;
}

/** Copy a modifier duration (the object form carries mutable countdown state). */
function cloneDuration(d: ModifierDuration): ModifierDuration {
  return typeof d === 'object' ? { ...d } : d;
}

/**
 * Sum of modifiers whose `stat` is in `kinds`. Pending modifiers (those that only
 * take effect next turn) are skipped.
 */
/** The active modifiers on one stat. */
function sumModifiers(mods: CombatModifier[], stat: string): number {
  let total = 0;
  for (const m of mods) {
    if (typeof m.duration === 'object' && m.duration.pending) continue;
    if (m.stat === stat) total += m.getValue();
  }
  return total;
}

/** `sumModifiers` for a roll's three stats without building a Set: this sits
 *  under every contest the lookahead simulates, and the allocation alone was
 *  ~17% of a depth-1 solve's CPU. */
function sumRollModifiers(mods: CombatModifier[], skillId: string, kind?: string): number {
  let total = 0;
  for (const m of mods) {
    if (typeof m.duration === 'object' && m.duration.pending) continue;
    const s = m.stat;
    if (s === 'skill' || s === skillId || (kind !== undefined && s === kind)) total += m.getValue();
  }
  return total;
}

export class Character {
  team = 0;
  /** Whether the engine decides this character's cards and targets. Humans
   *  (the web app's players) are false and get prompted instead. */
  aiControlled = false;

  // Base definition
  maxPV: number;
  currentPV: number;
  /** skillId -> level (= number of actions of the skill the character knows). */
  skills: Map<string, number>;
  equipment: EquipmentDefinition[] = [];
  /** Active hand. */
  actions: ActionInstance[];

  // Combat state
  modifiers: CombatModifier[] = [];
  /** A `StatusMap`; a plain Map assigned here works too, only without the
   *  shortcut `holdsStatusWith` takes. (Typed as the Map, so a reactive copy
   *  of a Character still passes for one.) */
  statuses: Map<string, StatusEntry> = new StatusMap();
  /** Defenders protecting this character this round (incl. self-guard). */
  guards: Guard[] = [];
  skipTurns = 0;
  /** Took an undefended hit this round (interrupts a not-yet-resolved focus). */
  hitThisTurn = false;
  hitThisCombat = false;
  /** The PV lost the last time any were lost this combat (0 before the
   *  first) — what a cure that undoes the last wound gives back. */
  lastWound = 0;
  playedActionIdx: number | null = null;
  /** actionIdx -> turns set aside (-1 = permanent). */
  setAsideActions = new Map<number, number>();
  /** Fatigue LEVEL, 0 (Fresc) to FATIGUE_MAX_LEVEL (Esgotat). Set by the DM
   *  from the fiction, never by the engine; each level is −1 on every roll
   *  (see getRollBonus). Persists across combats; rest() clears it. */
  fatigue = 0;
  /** Enemy defenders currently blocking this character: force every attack
   *  target this character would choose onto the wall. Blocks stack — two or
   *  more blockers contest jointly with the SUM of their defense rolls
   *  (bloqueig conjunt). Round-scoped, cleared like guards. */
  blockers: Guard[] = [];

  constructor(
    public name: string,
    pv: number,
    skills: Map<string, number>,
    actions: ActionInstance[],
    public characterClass: string,
    public category: 'player' | 'enemy' = 'player',
    public iconPath = '',
  ) {
    this.maxPV = pv;
    this.currentPV = pv;
    this.skills = skills;
    this.actions = actions;
  }

  isAlive(): boolean {
    return this.currentPV > 0;
  }

  /**
   * Deep-copy the MUTABLE combat state, sharing every immutable definition
   * (ActionDefinition, EquipmentDefinition, StatusBehavior). Used by lookahead
   * search, which must play a round forward and then throw the result away.
   *
   * Cross-character references (guards, blockers, and any Character a status
   * parked in its `data` payload) are NOT resolved here — they point at
   * originals until `remapRefs` runs with the full original→copy map, because
   * the whole roster has to exist before they can be rewired.
   */
  cloneState(): Character {
    const copy = new Character(
      this.name,
      this.maxPV,
      new Map(this.skills),
      this.actions.map(a => {
        const inst = new ActionInstance(a.def);
        inst.consumed = a.consumed;
        return inst;
      }),
      this.characterClass,
      this.category,
      this.iconPath,
    );
    copy.team = this.team;
    copy.aiControlled = this.aiControlled;
    copy.currentPV = this.currentPV;
    copy.equipment = [...this.equipment];
    copy.modifiers = this.modifiers.map(m => {
      const c = new CombatModifier(m.stat, m.value, cloneDuration(m.duration));
      c.dice = m.dice;
      c.source = m.source;
      c.condition = m.condition;
      return c;
    });
    for (const [k, e] of this.statuses) {
      copy.statuses.set(k, {
        value: e.value,
        remaining: e.remaining,
        data: e.data ? { ...e.data } : undefined,
        behavior: e.behavior,
      });
    }
    copy.skipTurns = this.skipTurns;
    copy.hitThisTurn = this.hitThisTurn;
    copy.hitThisCombat = this.hitThisCombat;
    copy.lastWound = this.lastWound;
    copy.playedActionIdx = this.playedActionIdx;
    copy.setAsideActions = new Map(this.setAsideActions);
    copy.fatigue = this.fatigue;
    // guards/blockers are wired up by remapRefs.
    return copy;
  }

  /**
   * Second clone pass: rewire every reference that points at another
   * character. Status `data` is an inert payload the engine never interprets,
   * but content does park Character references in it (a binder, a summoner),
   * so identities are remapped generically wherever they appear.
   */
  remapRefs(source: Character, map: Map<Character, Character>): void {
    const remapGuards = (guards: Guard[]): Guard[] =>
      guards.map(g => ({
        ...g,
        defender: map.get(g.defender) ?? g.defender,
        onlyAgainst: g.onlyAgainst ? map.get(g.onlyAgainst) ?? g.onlyAgainst : undefined,
      }));
    this.guards = remapGuards(source.guards);
    this.blockers = remapGuards(source.blockers);
    for (const [key, entry] of this.statuses) {
      const original = source.statuses.get(key);
      if (!original?.data || !entry.data) continue;
      for (const [k, v] of Object.entries(original.data)) {
        if (v instanceof Character) {
          entry.data[k] = map.get(v) ?? v;
        } else if (Array.isArray(v) && v.some(x => x instanceof Character)) {
          entry.data[k] = v.map(x => (x instanceof Character ? map.get(x) ?? x : x));
        }
      }
    }
  }

  // --- Skills ---------------------------------------------------------------

  /** Skill level: the number of actions of the skill the character knows.
   *  It enters a roll in exactly one place — `skillLevelBonus` adds it to every
   *  roll of a card of that skill; the rest of a roll is the card's dice plus
   *  bonuses. */
  getSkillLevel(skillId: string): number {
    return this.skills.get(skillId) ?? 0;
  }

  /**
   * Flat bonus added to a dice roll for an action of `skillId`: equipment
   * rollBonuses (skillId match or '*', kind match or unscoped) + combat
   * modifiers (stat ∈ {'skill', skillId, kind}), minus the fatigue level.
   * `kind` omitted for non-contest rolls (heals). May be negative.
   */
  getRollBonus(skillId: string, kind?: 'attack' | 'defense'): number {
    let bonus = 0;
    for (const eq of this.equipment) {
      if (!this.bonusesActive(eq)) continue;
      for (const b of eq.rollBonuses) {
        if (b.skillId !== skillId && b.skillId !== '*') continue;
        if (b.kind !== undefined && b.kind !== kind) continue;
        bonus += b.value;
      }
    }
    return bonus + sumRollModifiers(this.modifiers, skillId, kind) + fatigueRollPenalty(this.fatigue);
  }

  /** Catalan label for the current fatigue level. */
  getFatigueStateName(): string {
    return fatigueStateName(this.fatigue);
  }

  /** Set the fatigue level, clamped to 0..FATIGUE_MAX_LEVEL. */
  setFatigue(level: number): void {
    this.fatigue = clampFatigue(level);
  }

  /** A long rest (four hours or more): clears every level of fatigue. */
  rest(): void {
    this.fatigue = 0;
  }

  /** Level up: the character learns the next action of the skill (the action
   *  availability filter unlocks it automatically). No cap — overleveling past
   *  the skill's last action is harmless. */
  raiseSkill(skillId: string, by = 1): void {
    const cur = this.skills.get(skillId);
    if (cur === undefined) return;
    this.skills.set(skillId, cur + by);
  }

  // --- Equipment / derived stats -------------------------------------------

  /** Whether an item's bonuses count for this wearer (`bonusRequires`). */
  bonusesActive(eq: EquipmentDefinition): boolean {
    const req = eq.bonusRequires;
    return !req || this.getSkillLevel(req.skillId) >= req.level;
  }

  /** The wielded weapon's attack modifier — 0 while its `bonusRequires` is
   *  unmet — or undefined when unarmed (a +0 weapon still counts as armed). */
  getWeaponAttackBonus(): number | undefined {
    for (const e of this.equipment) {
      if (e.slot === EquipmentSlot.Weapon && e.attackBonus !== undefined) return this.bonusesActive(e) ? e.attackBonus : 0;
    }
    return undefined;
  }

  getPassiveArmor(): number {
    let armor = this.equipment.reduce((s, e) => s + e.passiveArmor, 0);
    armor += sumModifiers(this.modifiers, 'armor');
    return Math.max(0, armor);
  }

  getEquipmentSpeedPenalty(): number {
    return this.equipment.reduce((s, e) => s + e.speedPenalty, 0);
  }

  /** Resolved speed of an action: base - armour penalty + speed modifiers
   *  + status speed contributions (StatusBehavior.modifySpeed). */
  getEffectiveSpeed(action?: ActionInstance | ActionDefinition): number {
    const base = action ? ('def' in action ? action.def.speed : action.speed) : 0;
    let statusSpeed = 0;
    if (this.holdsStatusWith('modifySpeed')) {
      for (const [key, entry] of this.statuses) {
        if (entry.behavior?.modifySpeed) statusSpeed += entry.behavior.modifySpeed({ holder: this, key, entry });
      }
    }
    return base - this.getEquipmentSpeedPenalty()
      + sumModifiers(this.modifiers, 'speed') + statusSpeed;
  }

  equip(item: EquipmentDefinition): void {
    const replaced = this.equipment.filter(e => e.slot === item.slot);
    this.equipment = this.equipment.filter(e => e.slot !== item.slot);
    for (const old of replaced) {
      if (old.grantsActions?.length) {
        const dropped = new Set(old.grantsActions);
        this.actions = this.actions.filter(a => !dropped.has(a.def));
      }
    }
    this.equipment.push(item);
    for (const def of item.grantsActions ?? []) this.actions.push(new ActionInstance(def));
  }

  // --- Statuses -------------------------------------------------------------

  setStatus(key: string, value = 1, remaining = 1, data?: Record<string, unknown>, behavior?: StatusBehavior): void {
    this.statuses.set(key, { value, remaining, data, behavior });
  }

  /** False only when no status here carries `hook`: the engine's licence to
   *  skip asking. */
  holdsStatusWith(hook: GatedHook): boolean {
    const s = this.statuses;
    return s instanceof StatusMap ? s.holds(hook) : s.size > 0;
  }

  hasStatus(key: string): boolean {
    return this.statuses.has(key);
  }

  getStatus(key: string): StatusEntry | undefined {
    return this.statuses.get(key);
  }

  getStatusValue(key: string, fallback = 0): number {
    return this.statuses.get(key)?.value ?? fallback;
  }

  clearStatus(key: string): void {
    this.statuses.delete(key);
  }

  /** Snapshot of this character's statuses as behaviour refs (safe to mutate
   *  or clear statuses while iterating the result). */
  statusRefs(): StatusRef[] {
    const out: StatusRef[] = [];
    for (const [key, entry] of this.statuses) out.push({ holder: this, key, entry });
    return out;
  }

  // --- Modifiers ------------------------------------------------------------

  addModifier(mod: CombatModifier): void {
    this.modifiers.push(mod);
  }

  // --- Damage / healing -----------------------------------------------------

  /** Returns true if the character died from this loss. Only actual damage
   *  (amount > 0) marks the character as hit — a 0-damage impact does not
   *  interrupt a pending focus (rules.md). */
  loseLife(amount = 1): boolean {
    this.currentPV = Math.max(0, this.currentPV - amount);
    if (amount > 0) {
      this.hitThisCombat = true;
      this.hitThisTurn = true;
    }
    return !this.isAlive();
  }

  heal(amount: number): void {
    this.currentPV = Math.min(this.maxPV, this.currentPV + amount);
  }

  // --- Action availability --------------------------------------------------

  isActionSetAside(idx: number): boolean {
    return this.setAsideActions.has(idx);
  }

  // --- Lifecycle ------------------------------------------------------------

  resetForNewCombat(): void {
    this.currentPV = this.maxPV;
    this.modifiers = [];
    this.statuses.clear();
    this.guards = [];
    this.blockers = [];
    this.skipTurns = 0;
    this.hitThisTurn = false;
    this.hitThisCombat = false;
    this.lastWound = 0;
    this.playedActionIdx = null;
    this.setAsideActions.clear();
    for (const a of this.actions) a.consumed = false;
  }

  /** Returns true if the character is skipping this turn (stun/skip). */
  resetForNewRound(): boolean {
    this.guards = [];
    this.blockers = [];
    this.hitThisTurn = false;
    this.playedActionIdx = null;
    if (this.skipTurns > 0) {
      this.skipTurns--;
      return true;
    }
    return false;
  }

  /** Advance turn-scoped modifiers, statuses and set-aside counters. */
  advanceTurn(): void {
    this.modifiers = this.modifiers.filter(m => {
      if (m.duration === 'ThisTurn') return false;
      if (m.duration === 'RestOfCombat') return true;
      const d = m.duration;
      if (d.pending) { d.pending = false; return true; }
      d.remaining--;
      return d.remaining > 0;
    });

    for (const [key, entry] of this.statuses) {
      if (entry.remaining === -1) continue;
      entry.remaining--;
      if (entry.remaining <= 0) this.statuses.delete(key);
    }

    for (const [idx, remaining] of this.setAsideActions) {
      if (remaining === -1) continue;
      const next = remaining - 1;
      if (next <= 0) this.setAsideActions.delete(idx);
      else this.setAsideActions.set(idx, next);
    }
  }
}

/** Options for building a character from resolved definitions. */
export interface CreateCharacterOptions {
  name: string;
  classCss: string;
  pv: number;
  skills: Record<string, number> | SkillInstance[];
  /** Resolved action definitions forming the hand. */
  actions: ActionDefinition[];
  equipment?: EquipmentDefinition[];
  category?: 'player' | 'enemy';
  iconPath?: string;
}

export function createCharacter(opts: CreateCharacterOptions): Character {
  const skills = new Map<string, number>();
  if (Array.isArray(opts.skills)) {
    for (const s of opts.skills) skills.set(s.skillId, s.level);
  } else {
    for (const [id, lvl] of Object.entries(opts.skills)) skills.set(id, lvl);
  }
  const actions = opts.actions.map(def => new ActionInstance(def));
  const pv = Math.max(1, opts.pv);
  const c = new Character(opts.name, pv, skills, actions, opts.classCss, opts.category ?? 'player', opts.iconPath ?? '');
  if (opts.equipment) for (const e of opts.equipment) c.equip(e);
  return c;
}

