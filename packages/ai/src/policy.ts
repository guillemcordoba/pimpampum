/**
 * THE POLICY — how a character decides what to play.
 *
 * Moved out of `@pimpampum/engine` on 2026-09-22. The engine is the GAME; this
 * is an INSTRUMENT used to measure it, and the two are verified in completely
 * different ways: a fault in `resolution.ts` is a broken game, a fault here is
 * a broken measurement. While the AI lived inside the engine that distinction
 * could not even be stated, and the engine could not be tested without one.
 *
 * Depth 0 is this file: score each card where it stands and sample. Depth >= 1
 * is `lookahead.ts`, which plays the round out. Both are handed to an engine
 * through `CombatEngineOptions.actionChooser`; the engine itself contains no
 * policy at all.
 */
import {
  Character, ActionInstance, ActionDefinition, ActionType, TargetRequirement,
  EffectRegistry, AIContext, AIView, PlannedAction, DiceRoll, expectedExcess,
  skillLevelBonus, random, availableActionIndices,
} from '@pimpampum/engine';

/** Fraction of a character's PV remaining (0..1). */
function pvFraction(c: Character): number {
  return c.maxPV > 0 ? c.currentPV / c.maxPV : 0;
}


/**
 * Expected attack total for an action: dice average (a modest default when
 * diceless) + the action's roll bonus + the actor's roll bonuses + the best
 * equipped weapon modifier (an estimate — content effects decide whether the
 * weapon actually applies). The attack total IS the damage basis.
 *
 * EXPORTED so it can be differentially tested against the blow the engine
 * actually throws (`tests/ai-rules.test.ts`). It is a PREDICTION, the engine is
 * ground truth for it, and two of the three AI bugs this project has ever found
 * lived right here — the missing `skillLevelBonus` below, and the AoE scaling
 * in `estimateExpectedDamage`. Neither is findable from a winrate.
 */
export function expectedAttackTotal(actor: Character, def: ActionDefinition): number {
  const { dice, flat } = attackParts(actor, def);
  return Math.max(0, (dice?.average() ?? 3) + flat);
}

/**
 * The attack total split into its RANDOM and FIXED halves, because the exact
 * damage expectation needs the distribution and not just its mean.
 *
 * `flat` is everything the engine adds around the dice at the contest site:
 * the action's roll bonus, the actor's equipment roll bonuses, the best weapon
 * modifier (an estimate — content effects decide whether the weapon actually
 * applies), and `skillLevelBonus`, which is part of every roll the engine makes
 * and whose absence here once had the AI pricing a level-5 2d6 attack at ~7
 * when the engine threw ~12.
 */
function attackParts(actor: Character, def: ActionDefinition): { dice: DiceRoll | undefined; flat: number } {
  let weapon = 0;
  for (const e of actor.equipment) {
    if (e.attackBonus !== undefined) weapon = Math.max(weapon, e.attackBonus);
  }
  return {
    dice: def.dice,
    flat: (def.rollBonus ?? 0) + weapon
      + actor.getRollBonus(def.skillId, 'attack') + skillLevelBonus(actor, def),
  };
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

/** The best defense a character could throw, split like `attackParts`, or null
 *  if they hold no defense action at all. Ranked by mean, contested exactly. */
function bestDefenseParts(e: Character): { dice: DiceRoll | undefined; flat: number } | null {
  let best: { dice: DiceRoll | undefined; flat: number } | null = null;
  let bestAvg = -1;
  for (const a of e.actions) {
    if (a.def.actionType !== ActionType.Defensa) continue;
    const flat = (a.def.rollBonus ?? 0)
      + e.getRollBonus(a.def.skillId, 'defense') + skillLevelBonus(e, a.def);
    const avg = (a.def.dice?.average() ?? 0) + flat;
    if (avg > bestAvg) { bestAvg = avg; best = { dice: a.def.dice, flat }; }
  }
  return best;
}

/**
 * Expected PV an attack removes, averaged over the living enemies.
 *
 * DAMAGE IS THE MARGIN, so this is `E[max(0, attack − defense − armour)]` and
 * it is computed over the two totals' REAL DISTRIBUTIONS (`expectedExcess`),
 * not at their means. It used to blend `pWin × (meanA − meanD − armour)` with
 * `pWin = 0.5 + 0.08 × gap`, a linear stand-in whose own comment admitted the
 * slope was uncalibrated — and evaluating at the means is wrong in the
 * direction that matters: 2d6 against 1d12 and 2d6 against a flat 6.5 have the
 * same average gap and very different odds of getting through. The dice were
 * always right there.
 */
export function estimateExpectedDamage(actor: Character, def: ActionDefinition, enemies: Character[]): number {
  if (enemies.length === 0) return 0;
  const P_DEFEND = 0.3; // how often a capable enemy actually picks a defense
  const atk = attackParts(actor, def);
  let acc = 0;
  for (const e of enemies) {
    const armor = e.getPassiveArmor();
    const undefended = expectedExcess(atk.dice, atk.flat, undefined, 0, armor);
    const guard = bestDefenseParts(e);
    if (!guard) { acc += undefended; continue; } // no defense action ever
    const defended = expectedExcess(atk.dice, atk.flat, guard.dice, guard.flat, armor);
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

/**
 * `allies` and `enemies` are passed IN, not re-derived. `alliesOf` and
 * `enemiesOf` each filter a team array, and this runs once per card in the
 * hand, per actor, per rollout — so a six-card hand was building twelve
 * throwaway arrays to weigh one decision. The lists cannot change between the
 * cards of a single choice.
 */
function actionWeight(
  view: AIView, actor: Character, action: ActionInstance,
  allies: Character[], enemies: Character[],
): number {
  const def = action.def;
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
      // A FLAT constant beside an attack weight that scales with damage. Still
      // knowably odd — three action types in three currencies cannot all be
      // right — and still here, now for a MEASURED reason rather than a
      // cautious one.
      //
      // §17 left it alone because the obvious fix had no ground truth to judge
      // it by. It does now — the AI's strength against fixed baselines it
      // cannot influence — so the fix was tried properly on 2026-09-22:
      // `w = 1 + 1.5 × estimatePreventedDamage(...)`, expected PV saved, the
      // exact mirror of what an attack is worth.
      //
      //   depth-0 heuristic vs firstLegal   47.7% → 72.8%   (much better alone)
      //   depth-1 PRODUCTION vs spam        93.3% → 78.0%   (15pp WORSE)
      //
      // The heuristic played visibly better and the search that consumes it got
      // visibly worse, which is the whole lesson: with `topK` gone this
      // function is no longer choosing production's cards. Its remaining job is
      // to be the OPPONENT MODEL inside every rollout, and a model that defends
      // like a good player is a worse predictor of the field than one that
      // mostly swings. Accuracy of the model, not quality of the play.
      //
      // So: do not "fix" this weight without measuring the SEARCH. See
      // NEXT-STEPS §20.8.
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

  const allies = view.alliesOf(actor, false);
  const enemies = view.enemiesOf(actor);
  const weights = indices.map(i =>
    Math.pow(actionWeight(view, actor, actor.actions[i], allies, enemies), view.aiSharpness));
  const total = weights.reduce((s, w) => s + w, 0);
  let roll = random() * total;
  let chosen = indices[0];
  for (let k = 0; k < indices.length; k++) {
    roll -= weights[k];
    if (roll <= 0) { chosen = indices[k]; break; }
  }

  return { actionIdx: chosen };
}

