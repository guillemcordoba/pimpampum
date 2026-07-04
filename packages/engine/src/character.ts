import { CombatModifier } from './modifier.js';
import { AIStrategy } from './strategy.js';
import { ActionInstance } from './action.js';
import { ActionDefinition, EquipmentDefinition, SkillInstance } from './types.js';
import { fatiguePenalty, fatigueStateName, shortRestFatigue, longRestFatigue } from './fatigue.js';
import { CharacterSize, DEFAULT_SIZE, sizePvModifier, sizeSpeedModifier } from './size.js';
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

/** A guard linking a defender to the ally (or self) they are protecting this round. */
export interface Guard {
  defender: Character;
  /** The defense action providing the guard (for skill/rollBonus/effects). */
  action: ActionDefinition;
}

/**
 * Sum of modifiers whose `stat` is in `kinds`. Pending modifiers (those that only
 * take effect next turn) are skipped.
 */
function sumModifiers(mods: CombatModifier[], kinds: Set<string>): number {
  let total = 0;
  for (const m of mods) {
    if (typeof m.duration === 'object' && m.duration.pending) continue;
    if (kinds.has(m.stat)) total += m.getValue();
  }
  return total;
}

export class Character {
  team = 0;
  aiStrategy: AIStrategy | null = null;

  // Base definition
  maxPV: number;
  currentPV: number;
  /** skillId -> base level (1-100). */
  skills: Map<string, number>;
  equipment: EquipmentDefinition[] = [];
  /** Active hand. */
  actions: ActionInstance[];

  // Combat state
  modifiers: CombatModifier[] = [];
  statuses = new Map<string, StatusEntry>();
  /** Defenders protecting this character this round (incl. self-guard). */
  guards: Guard[] = [];
  skipTurns = 0;
  /** Took an undefended hit this round (interrupts a not-yet-resolved focus). */
  hitThisTurn = false;
  hitThisCombat = false;
  playedActionIdx: number | null = null;
  /** actionIdx -> turns set aside (-1 = permanent). */
  setAsideActions = new Map<number, number>();
  /** Persistent fatigue counter — drives the all-skill-roll penalty. Carries
   *  between combats; cleared only by rest helpers. */
  fatigue = 0;
  /** Permanent size chosen at creation. PV modifier is baked into maxPV;
   *  the speed modifier is applied in getEffectiveSpeed. */
  size: CharacterSize = DEFAULT_SIZE;

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

  // --- Skills ---------------------------------------------------------------

  /** Base skill level plus permanent equipment bonuses (no temporary modifiers). */
  getSkillLevel(skillId: string): number {
    let level = this.skills.get(skillId) ?? 0;
    for (const eq of this.equipment) {
      for (const b of eq.skillBonuses) {
        if (b.skillId === skillId || b.skillId === '*') level += b.bonus;
      }
    }
    return level;
  }

  /** Effective skill for a roll of the given kind, including temporary modifiers
   *  and the current fatigue penalty. */
  getRollSkill(skillId: string, kind: 'attack' | 'defense'): number {
    const kinds = new Set<string>(['skill', kind, skillId]);
    return this.getSkillLevel(skillId) + sumModifiers(this.modifiers, kinds) - this.getFatiguePenalty();
  }

  /** Effective skill for a non-combat roll (e.g. healing): general skill mods
   *  + the per-skill bonus, minus fatigue. Skips attack/defense-specific mods. */
  getHealRollSkill(skillId: string): number {
    const kinds = new Set<string>(['skill', skillId]);
    return this.getSkillLevel(skillId) + sumModifiers(this.modifiers, kinds) - this.getFatiguePenalty();
  }

  /** Current penalty subtracted from every d20+skill roll (≥0). */
  getFatiguePenalty(): number {
    return fatiguePenalty(this.fatigue);
  }

  /** Catalan label for the current fatigue tier. */
  getFatigueStateName(): string {
    return fatigueStateName(this.fatigue);
  }

  /** Short rest: clamps fatigue back to the Fresc cap. Doesn't restore PV. */
  shortRest(): void {
    this.fatigue = shortRestFatigue(this.fatigue);
  }

  /** Long rest: full reset of fatigue. Also restores PV to max. */
  longRest(): void {
    this.fatigue = longRestFatigue();
    this.currentPV = this.maxPV;
  }

  raiseSkill(skillId: string, by = 1): void {
    const cur = this.skills.get(skillId);
    if (cur === undefined) return;
    this.skills.set(skillId, Math.min(100, cur + by));
  }

  // --- Equipment / derived stats -------------------------------------------

  getPassiveArmor(): number {
    let armor = this.equipment.reduce((s, e) => s + e.passiveArmor, 0);
    armor += sumModifiers(this.modifiers, new Set(['armor']));
    return Math.max(0, armor);
  }

  getEquipmentSpeedPenalty(): number {
    return this.equipment.reduce((s, e) => s + e.speedPenalty, 0);
  }

  /** Resolved speed of an action: base - armour penalty + size modifier
   *  + speed modifiers + status speed contributions (StatusBehavior.modifySpeed). */
  getEffectiveSpeed(action?: ActionInstance | ActionDefinition): number {
    const base = action ? ('def' in action ? action.def.speed : action.speed) : 0;
    let statusSpeed = 0;
    for (const ref of this.statusRefs()) {
      if (ref.entry.behavior?.modifySpeed) statusSpeed += ref.entry.behavior.modifySpeed(ref);
    }
    return base - this.getEquipmentSpeedPenalty() + sizeSpeedModifier(this.size)
      + sumModifiers(this.modifiers, new Set(['speed'])) + statusSpeed;
  }

  equip(item: EquipmentDefinition): void {
    this.equipment = this.equipment.filter(e => e.slot !== item.slot);
    this.equipment.push(item);
  }

  // --- Statuses -------------------------------------------------------------

  setStatus(key: string, value = 1, remaining = 1, data?: Record<string, unknown>, behavior?: StatusBehavior): void {
    this.statuses.set(key, { value, remaining, data, behavior });
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

  /** Returns true if the character died from this loss. */
  loseLife(amount = 1): boolean {
    this.currentPV = Math.max(0, this.currentPV - amount);
    this.hitThisCombat = true;
    this.hitThisTurn = true;
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
    this.skipTurns = 0;
    this.hitThisTurn = false;
    this.hitThisCombat = false;
    this.playedActionIdx = null;
    this.setAsideActions.clear();
    for (const a of this.actions) a.consumed = false;
  }

  /** Returns true if the character is skipping this turn (stun/skip). */
  resetForNewRound(): boolean {
    this.guards = [];
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
  /** Defaults to Mitjà. The size PV modifier is applied on top of `pv`. */
  size?: CharacterSize;
}

export function createCharacter(opts: CreateCharacterOptions): Character {
  const skills = new Map<string, number>();
  if (Array.isArray(opts.skills)) {
    for (const s of opts.skills) skills.set(s.skillId, s.level);
  } else {
    for (const [id, lvl] of Object.entries(opts.skills)) skills.set(id, lvl);
  }
  const actions = opts.actions.map(def => new ActionInstance(def));
  const size = opts.size ?? DEFAULT_SIZE;
  const pv = Math.max(1, opts.pv + sizePvModifier(size));
  const c = new Character(opts.name, pv, skills, actions, opts.classCss, opts.category ?? 'player', opts.iconPath ?? '');
  c.size = size;
  if (opts.equipment) for (const e of opts.equipment) c.equip(e);
  return c;
}

/** Total skill levels across a character — used for skill-sum balancing. */
export function characterSkillSum(c: Character): number {
  let total = 0;
  for (const level of c.skills.values()) total += level;
  return total;
}
