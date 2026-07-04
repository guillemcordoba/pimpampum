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
  /** Decisiveness exponent applied to action weights (1 = old soft sampling,
   *  higher = greedier, human-like play). */
  readonly aiSharpness: number;
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

/** Whether every effect on an action permits playing it now (resource gates),
 *  and no status on the actor blocks the action's type. */
export function canPlayAction(action: ActionInstance, actor: Character, registry: EffectRegistry): boolean {
  for (const ref of actor.statusRefs()) {
    if (ref.entry.behavior?.blocksActionType?.(ref, action.def.actionType)) return false;
  }
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

/** Highest skill level a character holds (threat / build-strength proxy). */
function topSkill(c: Character): number {
  let best = 0;
  for (const lvl of c.skills.values()) best = Math.max(best, lvl);
  return best;
}

/** Average damage an attack is likely to roll: its own dice, else the best
 *  equipped weapon dice (weapon-carried actions), else a modest default. */
function expectedAttackDice(actor: Character, def: ActionDefinition): number {
  if (def.damageDice) return def.damageDice.average();
  let best = 0;
  for (const e of actor.equipment) {
    if (e.damageDice) best = Math.max(best, e.damageDice.average());
  }
  return best > 0 ? best : 3;
}

/** Rough chance the attack connects, averaged over the living enemies: hits
 *  are automatic unless the target plays a defense, in which case the
 *  contested d20 shifts ≈5pp per point of skill gap. */
function estimateHitChance(actor: Character, def: ActionDefinition, enemies: Character[]): number {
  if (enemies.length === 0) return 1;
  const P_DEFEND = 0.3; // how often a capable enemy actually picks a defense
  const atk = actor.getRollSkill(def.skillId, 'attack') + (def.rollBonus ?? 0);
  let acc = 0;
  for (const e of enemies) {
    let best = -1;
    for (const a of e.actions) {
      if (a.def.actionType !== ActionType.Defensa) continue;
      best = Math.max(best, e.getRollSkill(a.def.skillId, 'defense') + (a.def.rollBonus ?? 0));
    }
    if (best < 0) { acc += 1; continue; } // no defense action: always auto-hit
    const pWin = Math.min(0.95, Math.max(0.05, 0.5 + 0.05 * (atk - best)));
    acc += (1 - P_DEFEND) + P_DEFEND * pWin;
  }
  return acc / enemies.length;
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
      // An attack is worth the PV it expects to remove: dice minus their
      // armour, discounted by the odds of connecting.
      const armor = enemies.length
        ? enemies.reduce((s, e) => s + e.getPassiveArmor(), 0) / enemies.length
        : 0;
      const expected = Math.max(0, expectedAttackDice(actor, def) - armor);
      w = 0.5 + estimateHitChance(actor, def, enemies) * expected;
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
  actor: Character,
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
  const expectedDamage = def.actionType === ActionType.Atac ? expectedAttackDice(actor, def) : 0;
  const score = (e: Character): number => {
    let s = 2 * (1 - pvFraction(e)); // focus fire the wounded
    s += Math.min(2, topSkill(e) / 40); // dangerous targets (casters, elites) first
    if (def.actionType === ActionType.Atac) {
      if (Math.max(0, expectedDamage - e.getPassiveArmor()) >= e.currentPV) {
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
 *  later, at resolution time (pickResolveTargets), with reveal-level info.
 *  Returns actionIdx -1 (an explicit pass) when nothing is playable. */
export function selectAction(view: AIView, actor: Character): PlannedAction {
  const strategy = actor.aiStrategy ?? AIStrategy.Power;
  const indices = availableActionIndices(actor, view.registry);
  if (indices.length === 0) return { actionIdx: -1 };

  const weights = indices.map(i =>
    Math.pow(actionWeight(view, actor, actor.actions[i], strategy), view.aiSharpness));
  const total = weights.reduce((s, w) => s + w, 0);
  let roll = Math.random() * total;
  let chosen = indices[0];
  for (let k = 0; k < indices.length; k++) {
    roll -= weights[k];
    if (roll <= 0) { chosen = indices[k]; break; }
  }

  return { actionIdx: chosen };
}

/** Assign rotating strategies across a simulated player team. A strategy the
 *  character cannot cash in (Protect without a defense, Power without a
 *  focus) falls back to Aggro instead of landing on nothing. */
export function assignStrategies(team: Character[], strategies: AIStrategy[]): void {
  team.forEach((c, i) => {
    let s = strategies[i % strategies.length];
    const has = (t: ActionType) => c.actions.some(a => a.def.actionType === t);
    if (s === AIStrategy.Protect && !has(ActionType.Defensa)) s = AIStrategy.Aggro;
    if (s === AIStrategy.Power && !has(ActionType.Focus)) s = AIStrategy.Aggro;
    c.aiStrategy = s;
  });
}
