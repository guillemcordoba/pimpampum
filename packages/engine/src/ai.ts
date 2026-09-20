import { Character } from './character.js';
import { skillLevelBonus } from './resolution.js';
import { random } from './rng.js';
import { ActionInstance } from './action.js';
import { ActionDefinition, ActionType, TargetRequirement } from './types.js';
import { EffectRegistry, AIContext } from './effects.js';

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

/** Whether every effect on an action permits playing it now (resource gates)
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
 *  to also enforce per-effect availability gates (e.g. resource costs).
 *  Last-resort actions (desperation fallbacks) only surface when nothing
 *  else is playable. */
export function availableActionIndices(actor: Character, registry?: EffectRegistry): number[] {
  const out: number[] = [];
  const lastResort: number[] = [];
  actor.actions.forEach((a, i) => {
    if (!a.isAvailable()) return;
    if (actor.isActionSetAside(i)) return;
    if ((actor.skills.get(a.def.skillId) ?? 0) < a.def.unlockLevel) return;
    if (registry && !canPlayAction(a, actor, registry)) return;
    (a.def.lastResort ? lastResort : out).push(i);
  });
  return out.length > 0 ? out : lastResort;
}

/** Expected attack total for an action: dice average (a modest default when
 *  diceless) + the action's roll bonus + the actor's roll bonuses + the best
 *  equipped weapon modifier (an estimate — content effects decide whether the
 *  weapon actually applies). The attack total IS the damage basis. */
function expectedAttackTotal(actor: Character, def: ActionDefinition): number {
  let weapon = 0;
  for (const e of actor.equipment) {
    if (e.attackBonus !== undefined) weapon = Math.max(weapon, e.attackBonus);
  }
  // `skillLevelBonus` is part of every roll the engine makes, so leaving it out
  // here made the AI's model of a blow disagree with the blow. At level 5 a 2d6
  // attack really totals ~12; this estimated ~7, and against 2 armour that is
  // 10 damage predicted as 5 — half. It cancelled for same-level contests and
  // did not for anything else, including every player-versus-enemy comparison.
  return Math.max(0, (def.dice?.average() ?? 3) + (def.rollBonus ?? 0)
    + weapon + actor.getRollBonus(def.skillId, 'attack') + skillLevelBonus(actor, def));
}

/** Best attack total a character can be expected to throw (threat proxy). */
function bestAttackAverage(c: Character): number {
  let best = 0;
  for (const a of c.actions) {
    if (a.def.actionType !== ActionType.Atac) continue;
    best = Math.max(best, expectedAttackTotal(c, a.def));
  }
  return best;
}

/** Best expected defense total among a character's defense actions, or -1 if
 *  they have none. */
function bestDefenseTotal(e: Character): number {
  let best = -1;
  for (const a of e.actions) {
    if (a.def.actionType !== ActionType.Defensa) continue;
    const d = (a.def.dice?.average() ?? 0) + (a.def.rollBonus ?? 0)
      + e.getRollBonus(a.def.skillId, 'defense') + skillLevelBonus(e, a.def);
    best = Math.max(best, d);
  }
  return best;
}

/**
 * Expected PV an attack removes, averaged over the living enemies. Undefended
 * the damage is the full attack total minus armour; defended it's the margin
 * (attack − defense) when the attack wins the contest. `pWin` is a linear
 * average-gap stand-in for P(attack > defense) — slope pending recalibration.
 */
function estimateExpectedDamage(actor: Character, def: ActionDefinition, enemies: Character[]): number {
  if (enemies.length === 0) return 0;
  const P_DEFEND = 0.3; // how often a capable enemy actually picks a defense
  const A = expectedAttackTotal(actor, def);
  let acc = 0;
  for (const e of enemies) {
    const armor = e.getPassiveArmor();
    const undefended = Math.max(0, A - armor);
    const bestDef = bestDefenseTotal(e);
    if (bestDef < 0) { acc += undefended; continue; } // no defense action ever
    const pWin = Math.min(0.95, Math.max(0.05, 0.5 + 0.08 * (A - bestDef)));
    const defended = pWin * Math.max(0, A - bestDef - armor);
    acc += (1 - P_DEFEND) * undefended + P_DEFEND * defended;
  }
  // SCALED BY HOW MANY IT HITS. `acc / enemies.length` is the damage a
  // single-target attack expects against one of them; an attack that sweeps
  // three, or all of them, removes that much PV several times over. Nothing
  // here read `targetCount` at all, so every area card in the game — eight of
  // them — was priced as if it struck one body, and was undervalued by up to
  // the size of the horde it was aimed at.
  const hits = Math.max(1, Math.min(def.targetCount ?? 1, enemies.length));
  return (acc / enemies.length) * hits;
}

function actionWeight(view: AIView, actor: Character, action: ActionInstance): number {
  const def = action.def;
  const allies = view.alliesOf(actor, false);
  const enemies = view.enemiesOf(actor);
  const woundedAllies = allies.filter(a => pvFraction(a) < 0.5).length;
  const woundedEnemies = enemies.filter(e => pvFraction(e) < 0.4).length;
  const selfHurt = pvFraction(actor) < 0.5;

  let w = 1;
  switch (def.actionType) {
    case ActionType.Atac: {
      // An attack is worth the PV it expects to remove: the margin damage it
      // projects, blended over defended/undefended outcomes and armour.
      // TODO(balance): constants recalibrated for the dice era — attacks must
      // stay the default plan or fights stall into draws.
      w = 1 + 1.5 * estimateExpectedDamage(actor, def, enemies);
      w += woundedEnemies * 1.5; // finish wounded foes
      // Interrupt value: an undefended hit cancels a slower pending Focus,
      // so an attack that outspeeds enemies' focus cards is worth playing
      // even when its dice are tiny (disruptor jabs). Strong enough to make
      // the fast knife a real choice next to bigger dice.
      const disruptable = enemies.filter(e => e.actions.some(a =>
        a.def.actionType === ActionType.Focus
        && a.isAvailable()
        && (e.skills.get(a.def.skillId) ?? 0) >= a.def.unlockLevel
        && a.def.speed < def.speed)).length;
      w += Math.min(3.6, 1.2 * disruptable);
      // First-strike prior: a fast attack lands before retaliation — and
      // before same-round deaths can void it.
      w += 0.2 * Math.min(4, Math.max(0, actor.getEffectiveSpeed(action)));
      break;
    }
    case ActionType.Defensa: {
      // A FLAT constant beside an attack weight that scales with damage. That
      // is knowably wrong — three action types priced in three currencies
      // cannot be right — and it is deliberately left alone: the fix has no
      // ground truth, and tuning it moved requirement 3 from 1/6 failing to
      // 6/6 and back again without the game changing at all. The AI may be
      // corrected where it DISAGREES WITH THE RULES; it may not be tuned until
      // the tests go green. See NEXT-STEPS §17.
      w = 1.5;
      if (woundedAllies > 0) w += 2 * woundedAllies;
      if (selfHurt) w += 1.5;
      if (enemies.length === 0) w = 0.1;
      break;
    }
    case ActionType.Focus: {
      w = 1.2;
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

  // Defense dual choice: guard a wounded ally, or block the scariest enemy
  // whose attack is still pending; self-guard when neither applies.
  if (req === 'defense') {
    const allies = pool.filter(t => t.team === actor.team);
    const enemies = pool.filter(t => t.team !== actor.team);
    const wounded = allies.filter(a => a !== actor && pvFraction(a) < 0.5);
    const preferGuard = wounded.length > 0;
    if ((preferGuard || enemies.length === 0) && allies.length > 0) {
      return [...allies].sort((a, b) => pvFraction(a) - pvFraction(b)).slice(0, count);
    }
    const pending = view.pendingSummary();
    const attackers = enemies.filter(e => pending.some(p =>
      p.actor === e && !p.resolved && !p.cancelled && p.actionType === ActionType.Atac));
    if (attackers.length > 0) {
      return [...attackers].sort((a, b) => bestAttackAverage(b) - bestAttackAverage(a)).slice(0, count);
    }
    return [actor]; // nothing to block, nobody hurt: guard yourself
  }

  if (req !== 'enemy') {
    return [...pool].sort((a, b) => pvFraction(a) - pvFraction(b)).slice(0, count);
  }

  const pending = view.pendingSummary();
  const expectedDamage = def.actionType === ActionType.Atac ? expectedAttackTotal(actor, def) : 0;
  const score = (e: Character): number => {
    let s = 2 * (1 - pvFraction(e)); // focus fire the wounded
    s += Math.min(2, bestAttackAverage(e) / 6); // dangerous targets (heavy hitters) first
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
  const indices = availableActionIndices(actor, view.registry);
  if (indices.length === 0) return { actionIdx: -1 };

  const weights = indices.map(i =>
    Math.pow(actionWeight(view, actor, actor.actions[i]), view.aiSharpness));
  const total = weights.reduce((s, w) => s + w, 0);
  let roll = random() * total;
  let chosen = indices[0];
  for (let k = 0; k < indices.length; k++) {
    roll -= weights[k];
    if (roll <= 0) { chosen = indices[k]; break; }
  }

  return { actionIdx: chosen };
}

/** Hand every character in `team` over to the AI (the engine picks their cards
 *  and targets). Human seats are left alone — they get prompted instead. */
export function setAIControlled(team: Character[], value = true): void {
  for (const c of team) c.aiControlled = value;
}
