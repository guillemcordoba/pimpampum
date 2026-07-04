import { Character } from './character.js';
import { ActionInstance } from './action.js';
import { ActionDefinition, ActionType, TargetRequirement } from './types.js';
import { EffectRegistry, AIContext } from './effects.js';
import { AIStrategy } from './strategy.js';

/** Reveal-level summary of one queued action this round. */
export interface PendingSummary {
  actor: Character;
  actionType: ActionType;
  speed: number;
  resolved: boolean;
  cancelled: boolean;
}

/** Minimal engine view the AI needs. CombatEngine implements this. */
export interface AIView {
  readonly registry: EffectRegistry;
  readonly round: number;
  alliesOf(c: Character, includeSelf?: boolean): Character[];
  enemiesOf(c: Character): Character[];
  /** This round's queue as revealed to everyone (empty before planActions). */
  pendingSummary(): readonly PendingSummary[];
}

export interface PlannedAction {
  actionIdx: number;
}

/** Fraction of a character's PV remaining (0..1). */
function pvFraction(c: Character): number {
  return c.maxPV > 0 ? c.currentPV / c.maxPV : 0;
}

/** Whether every effect on an action permits playing it now (resource gates). */
export function canPlayAction(action: ActionInstance, actor: Character, registry: EffectRegistry): boolean {
  for (const eff of action.def.effects) {
    const fn = registry.getHandler(eff.type)?.canPlay;
    if (fn && !fn(actor, eff.params ?? {})) return false;
  }
  return true;
}

/** Indices of actions a character may legally play this round. Pass the registry
 *  to also enforce per-effect availability gates (e.g. resource costs). */
export function availableActionIndices(actor: Character, registry?: EffectRegistry): number[] {
  const out: number[] = [];
  actor.actions.forEach((a, i) => {
    if (!a.isAvailable()) return;
    if (actor.isActionSetAside(i)) return;
    if ((actor.skills.get(a.def.skillId) ?? 0) < a.def.unlockLevel) return;
    if (registry && !canPlayAction(a, actor, registry)) return;
    out.push(i);
  });
  return out;
}

/** Highest skill level among living enemies (rough difficulty proxy). */
function avgEnemySkill(enemies: Character[]): number {
  if (enemies.length === 0) return 0;
  let sum = 0;
  for (const e of enemies) {
    let best = 0;
    for (const lvl of e.skills.values()) best = Math.max(best, lvl);
    sum += best;
  }
  return sum / enemies.length;
}

function actionWeight(view: AIView, actor: Character, action: ActionInstance, strategy: AIStrategy): number {
  const def = action.def;
  const allies = view.alliesOf(actor, false);
  const enemies = view.enemiesOf(actor);
  const woundedAllies = allies.filter(a => pvFraction(a) < 0.5).length;
  const woundedEnemies = enemies.filter(e => pvFraction(e) < 0.4).length;
  const selfHurt = pvFraction(actor) < 0.5;

  let w = 1;
  switch (def.actionType) {
    case ActionType.Atac: {
      const skill = actor.getRollSkill(def.skillId, 'attack') + (def.rollBonus ?? 0);
      const gap = skill - avgEnemySkill(enemies);
      w = 3 + Math.max(-2, Math.min(3, gap / 10));
      w += woundedEnemies * 1.5; // finish wounded foes
      if (strategy === AIStrategy.Aggro) w += 2;
      break;
    }
    case ActionType.Defensa: {
      w = 1.5;
      if (woundedAllies > 0) w += 2 * woundedAllies;
      if (selfHurt) w += 1.5;
      if (strategy === AIStrategy.Protect) w += 2.5;
      if (enemies.length === 0) w = 0.1;
      break;
    }
    case ActionType.Focus: {
      w = 2;
      if (strategy === AIStrategy.Power) w += 2;
      if (selfHurt && def.speed < 5) w -= 1; // don't telegraph a slow focus while dying
      break;
    }
  }

  // Status behaviours may transform the base weight (e.g. an attack chain
  // that must not be broken).
  for (const ref of actor.statusRefs()) {
    const adjust = ref.entry.behavior?.adjustActionWeight;
    if (adjust) w = adjust(view, ref, def, w);
  }

  // Content-registered hints per effect.
  const base: Omit<AIContext, 'params'> = {
    registry: view.registry, round: view.round, actor, allies, enemies, action: def,
  };
  for (const eff of def.effects) {
    const fn = view.registry.getHandler(eff.type)?.aiWeight;
    if (fn) w += fn({ ...base, params: eff.params ?? {} });
  }

  return Math.max(0.05, w);
}

/**
 * Resolution-time target choice for an AI actor. Runs when the action actually
 * resolves, so it sees everything a human at the table sees at that moment:
 * who already died, which guards are up, and which slower focuses are still
 * pending (and can therefore be interrupted by landing a hit).
 */
export function pickResolveTargets(
  view: AIView,
  def: ActionDefinition,
  req: TargetRequirement,
  count: number,
  pool: Character[],
  speed: number,
): Character[] {
  if (req === 'none') return [];
  if (req !== 'enemy') {
    return [...pool].sort((a, b) => pvFraction(a) - pvFraction(b)).slice(0, count);
  }

  const pending = view.pendingSummary();
  const expectedDamage = def.damageDice?.average() ?? 0;
  const score = (e: Character): number => {
    let s = 2 * (1 - pvFraction(e)); // focus fire the wounded
    if (def.actionType === ActionType.Atac) {
      if (expectedDamage > 0 && Math.max(0, expectedDamage - e.getPassiveArmor()) >= e.currentPV) {
        s += 4; // take the kill
      }
      const focusing = pending.some(p =>
        p.actor === e && !p.resolved && !p.cancelled
        && p.actionType === ActionType.Focus && p.speed < speed);
      if (focusing && !e.hitThisTurn) s += 3; // a hit now cancels their focus
    }
    if (e.guards.some(g => g.defender.isAlive())) s -= 2; // don't feed active guards
    return s;
  };
  return [...pool]
    .sort((a, b) => score(b) - score(a) || a.currentPV - b.currentPV)
    .slice(0, count);
}

/** Weighted-random action selection for one character. Targets are chosen
 *  later, at resolution time (pickResolveTargets), with reveal-level info. */
export function selectAction(view: AIView, actor: Character): PlannedAction {
  const strategy = actor.aiStrategy ?? AIStrategy.Power;
  const indices = availableActionIndices(actor, view.registry);
  if (indices.length === 0) return { actionIdx: 0 };

  const weights = indices.map(i => actionWeight(view, actor, actor.actions[i], strategy));
  const total = weights.reduce((s, w) => s + w, 0);
  let roll = Math.random() * total;
  let chosen = indices[0];
  for (let k = 0; k < indices.length; k++) {
    roll -= weights[k];
    if (roll <= 0) { chosen = indices[k]; break; }
  }

  return { actionIdx: chosen };
}

/** Assign rotating strategies across a team (used by the simulator). */
export function assignStrategies(team: Character[], strategies: AIStrategy[]): void {
  team.forEach((c, i) => { c.aiStrategy = strategies[i % strategies.length]; });
}
