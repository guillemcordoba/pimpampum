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
  skillLevelBonus, random, availableActionIndices, getActionTargetCount,
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
 * actually throws (`ai/test/model.test.ts`). It is a PREDICTION, the engine is
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
  const weapon = actor.getWeaponAttackBonus() ?? 0;
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
export function estimateExpectedDamage(
  actor: Character, def: ActionDefinition, enemies: Character[],
  guardsOf: (e: Character) => ReturnType<typeof bestDefenseParts> = bestDefenseParts,
): number {
  if (enemies.length === 0) return 0;
  const P_DEFEND = 0.3; // how often a capable enemy actually picks a defense
  const atk = attackParts(actor, def);
  let acc = 0;
  for (const e of enemies) {
    const armor = e.getPassiveArmor();
    const undefended = expectedExcess(atk.dice, atk.flat, undefined, 0, armor);
    const guard = guardsOf(e);
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
/**
 * What every card of one decision reads about the table. Computed once per
 * decision rather than once per card: these were most of the opponent model's
 * time, and it runs inside every rollout.
 */
interface DecisionFacts {
  woundedAllies: number;
  woundedEnemies: number;
  selfHurt: boolean;
  /** Per enemy, the speed of its slowest interruptible focus (Infinity: none). */
  enemyFocusSpeeds: number[];
  guardsOf: (e: Character) => ReturnType<typeof bestDefenseParts>;
}

function decisionFacts(actor: Character, allies: Character[], enemies: Character[]): DecisionFacts {
  const guards = new Map<Character, ReturnType<typeof bestDefenseParts>>();
  return {
    woundedAllies: allies.filter(a => pvFraction(a) < 0.5).length,
    woundedEnemies: enemies.filter(e => pvFraction(e) < 0.4).length,
    selfHurt: pvFraction(actor) < 0.5,
    enemyFocusSpeeds: enemies.map(e => {
      let lowest = Infinity;
      for (const a of e.actions) {
        if (a.def.actionType === ActionType.Focus && a.isAvailable()
          && (e.skills.get(a.def.skillId) ?? 0) >= a.def.unlockLevel) lowest = Math.min(lowest, a.def.speed);
      }
      return lowest;
    }),
    guardsOf: e => {
      if (!guards.has(e)) guards.set(e, bestDefenseParts(e));
      return guards.get(e)!;
    },
  };
}

function actionWeight(
  view: AIView, actor: Character, action: ActionInstance,
  allies: Character[], enemies: Character[], facts: DecisionFacts,
): number {
  const def = action.def;
  const { woundedAllies, woundedEnemies, selfHurt } = facts;

  let w = 1;
  switch (def.actionType) {
    case ActionType.Atac: {
      // An attack is worth the PV it expects to remove: the margin damage it
      // projects, blended over defended/undefended outcomes and armour.
      // TODO(balance): constants recalibrated for the dice era — attacks must
      // stay the default plan or fights stall into draws.
      w = 1 + 1.5 * estimateExpectedDamage(actor, def, enemies, facts.guardsOf);
      w += woundedEnemies * 1.5; // finish wounded foes
      // Interrupt value: an undefended hit cancels a slower pending Focus,
      // so an attack that outspeeds enemies' focus cards is worth playing
      // even when its dice are tiny (disruptor jabs). Strong enough to make
      // the fast knife a real choice next to bigger dice.
      const disruptable = facts.enemyFocusSpeeds.filter(speed => speed < def.speed).length;
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
  if (actor.holdsStatusWith('adjustActionWeight')) {
    for (const ref of actor.statusRefs()) {
      const adjust = ref.entry.behavior?.adjustActionWeight;
      if (adjust) w = adjust(view, ref, def, w);
    }
  }

  // Content-registered hints per effect.
  const hinting = view.registry.effectsWith(def.effects, 'aiWeight');
  if (hinting.length) {
    const base: Omit<AIContext, 'params'> = {
      registry: view.registry, round: view.round, actor, allies, enemies, action: def, plan: view.pendingSummary(),
    };
    for (const { eff, handler } of hinting) {
      const fn = handler.aiWeight!;
      w += fn({ ...base, params: eff.params ?? {} });
    }
  }

  return Math.max(0.05, w);
}

/** The card's own `aiTargetPriority` hints, summed over its effects; null
 *  when no effect gives one. */
function cardTargetPriority(
  view: AIView, actor: Character, def: ActionDefinition, pool: Character[],
): ((c: Character) => number) | null {
  const hinting = view.registry.effectsWith(def.effects, 'aiTargetPriority');
  if (!hinting.length) return null;
  const hints = hinting.map(({ eff, handler }) => ({ fn: handler.aiTargetPriority, params: eff.params ?? {} }));
  const base: Omit<AIContext, 'params'> = {
    registry: view.registry, round: view.round, actor,
    allies: view.alliesOf(actor, false), enemies: view.enemiesOf(actor), action: def, plan: view.pendingSummary(),
  };
  const scores = new Map(pool.map(c => [c, hints.reduce((s, h) => s + h.fn!({ ...base, params: h.params }, c), 0)]));
  return c => scores.get(c) ?? 0;
}

/**
 * WHERE THE BLOWS STILL TO COME WILL LAND, by ally: each foe attack still
 * pending is aimed as that foe would aim it (this same function, on the foe's
 * side), and its expected total is counted on whoever it picks — on all of
 * them for a blow that hits every enemy. A guard covers someone; this is who
 * needs covering. (Guards used to go to the most wounded ally, wherever the
 * blows were headed: inside the search's rollouts that made a guard look
 * useless beside a strike, and the AI under-defended — NEXT-STEPS §54.2.)
 */
function incomingByAlly(view: AIView, actor: Character, allies: Character[], aim: AttackAim): Map<Character, number> {
  const out = new Map<Character, number>(allies.map(a => [a, 0]));
  const team = view.alliesOf(actor, true).filter(c => c.isAlive());
  for (const p of view.pendingSummary()) {
    if (p.resolved || p.cancelled || p.actor.team === actor.team || p.actionType !== ActionType.Atac || !p.actor.isAlive()) continue;
    const count = getActionTargetCount(p.action);
    const hit = count >= team.length ? team : pickResolveTargets(view, p.actor, p.action, 'enemy', count, team, p.speed, aim);
    const dmg = expectedAttackTotal(p.actor, p.action);
    for (const c of hit) if (out.has(c)) out.set(c, out.get(c)! + dmg);
  }
  return out;
}

/**
 * The foes worth BLOCKING, scariest first: those whose attack is still to come
 * and picks its target — a blow that hits every enemy is not redirected by a
 * block (rules.md), so blocking its thrower stops nothing. Scored by that
 * pending blow, not by the thrower's best card. Empty when none qualifies.
 */
function blockable(view: AIView, actor: Character, foes: Character[]): Character[] {
  const team = view.alliesOf(actor, true).filter(c => c.isAlive()).length;
  const threat = new Map<Character, number>();
  for (const p of view.pendingSummary()) {
    if (p.resolved || p.cancelled || p.actionType !== ActionType.Atac || !foes.includes(p.actor)) continue;
    if (getActionTargetCount(p.action) >= team) continue;
    threat.set(p.actor, Math.max(threat.get(p.actor) ?? 0, expectedAttackTotal(p.actor, p.action)));
  }
  return [...threat.keys()].sort((a, b) => threat.get(b)! - threat.get(a)!);
}

/**
 * GUARD OR BLOCK, by the share of health each saves (`share` aim). A guard on
 * an ally meets every blow headed their way: the sum of those blows over the
 * ally's full health. A block pulls ONE pending blow off whoever it was headed
 * for and onto the blocker: that blow over its target's full health — nothing,
 * when it was headed for the blocker anyway (they defend themselves). The rule
 * it replaces guarded only an ally under half health and otherwise blocked the
 * scariest attacker, where the target search guarded (NEXT-STEPS §54.3).
 */
function guardOrBlock(
  view: AIView, actor: Character, allies: Character[], enemies: Character[], count: number, pool: Character[],
): Character[] {
  const team = view.alliesOf(actor, true).filter(c => c.isAlive());
  const guardValue = new Map<Character, number>(allies.map(a => [a, 0]));
  const blockValue = new Map<Character, number>();
  for (const p of view.pendingSummary()) {
    if (p.resolved || p.cancelled || p.actor.team === actor.team || p.actionType !== ActionType.Atac || !p.actor.isAlive()) continue;
    const n = getActionTargetCount(p.action);
    const hit = n >= team.length ? team : pickResolveTargets(view, p.actor, p.action, 'enemy', n, team, p.speed, 'share');
    const dmg = expectedAttackTotal(p.actor, p.action);
    for (const c of hit) if (guardValue.has(c)) guardValue.set(c, guardValue.get(c)! + dmg / Math.max(1, c.maxPV));
    if (n < team.length && enemies.includes(p.actor)) {
      const saved = hit.filter(c => c !== actor).reduce((s, c) => s + dmg / Math.max(1, c.maxPV), 0);
      blockValue.set(p.actor, Math.max(blockValue.get(p.actor) ?? 0, saved));
    }
  }
  const options = [...[...guardValue].filter(([c]) => c !== actor), ...blockValue]
    .filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]);
  if (options.length) return options.slice(0, count).map(([c]) => c);
  return pool.includes(actor) ? [actor] : [];
}

/** Allies by who needs a guard: most blows headed their way, then most wounded. */
function byNeed(view: AIView, actor: Character, allies: Character[], aim: AttackAim): Character[] {
  const incoming = incomingByAlly(view, actor, allies, aim);
  return [...allies].sort((a, b) => incoming.get(b)! - incoming.get(a)! || pvFraction(a) - pvFraction(b));
}

/**
 * How the heuristic aims an attack — here, and in every rollout of the
 * search, so it is the search's model of where blows land. `share` (the
 * default): at the biggest share of its full health the blow removes through
 * the target's standing wall, which is what the leaf evaluator scores and so
 * what the target SEARCH reaches for. `wounded` (the old rule): at the lowest
 * health fraction — rollouts aimed so imagined blows landing where the real AI
 * does not put them (NEXT-STEPS §54.3).
 */
export type AttackAim = 'wounded' | 'share';

/** `pickResolveTargets` with an aim fixed, as a `targetChooser`. */
export function aimedTargets(aim: AttackAim = 'share') {
  return (view: AIView, actor: Character, def: ActionDefinition, req: TargetRequirement, count: number, pool: Character[], speed: number): Character[] =>
    pickResolveTargets(view, actor, def, req, count, pool, speed, aim);
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
  aim: AttackAim = 'share',
): Character[] {
  if (req === 'none') return [];

  // Defense dual choice: guard a wounded ally, or block the scariest enemy
  // whose attack is still pending; self-guard when neither applies.
  if (req === 'defense') {
    const allies = pool.filter(t => t.team === actor.team);
    const enemies = pool.filter(t => t.team !== actor.team);
    if (aim === 'share') return guardOrBlock(view, actor, allies, enemies, count, pool);
    const wounded = allies.filter(a => a !== actor && pvFraction(a) < 0.5);
    const preferGuard = wounded.length > 0;
    if ((preferGuard || enemies.length === 0) && allies.length > 0) {
      return byNeed(view, actor, allies, aim).slice(0, count);
    }
    const attackers = blockable(view, actor, enemies);
    if (attackers.length > 0) return attackers.slice(0, count);
    // Nothing worth blocking: guard whoever the blows are headed for — or,
    // with nobody threatened, yourself if you are still a legal target. An
    // actor felled earlier in their own speed tier still resolves (ties are
    // simultaneous) but is no longer in the pool; the engine's self-guard
    // covers them either way, so choosing nobody is the honest answer.
    if (allies.length > 0) {
      const need = byNeed(view, actor, allies, aim);
      if (incomingByAlly(view, actor, allies, aim).get(need[0])! > 0) return need.slice(0, count);
    }
    return pool.includes(actor) ? [actor] : [];
  }

  if (req !== 'enemy') {
    const priority = cardTargetPriority(view, actor, def, pool);
    if (priority) {
      return [...pool].sort((a, b) => priority(b) - priority(a) || pvFraction(a) - pvFraction(b)).slice(0, count);
    }
    if (def.actionType === ActionType.Defensa) return byNeed(view, actor, pool, aim).slice(0, count);
    return [...pool].sort((a, b) => pvFraction(a) - pvFraction(b)).slice(0, count);
  }

  // A block-only defense (narrowed to 'enemy'): block the scariest enemy
  // whose attack is still pending, else the scariest one there is. Aimed like
  // a curse, it went to the healthiest enemy and almost never met a blow.
  if (def.actionType === ActionType.Defensa) {
    const attackers = blockable(view, actor, pool);
    if (attackers.length) return attackers.slice(0, count);
    return [...pool].sort((a, b) => bestAttackAverage(b) - bestAttackAverage(a)).slice(0, count);
  }

  const pending = view.pendingSummary();
  const expectedDamage = def.actionType === ActionType.Atac ? expectedAttackTotal(actor, def) : 0;
  // FOCUS FIRE. The kill bonus below used to need THIS blow to fell the target
  // alone, so two blows that together fell a dangerous body were each aimed by
  // wounded fraction instead — often at a big half-dead body neither could
  // finish — and every rollout of the search aimed that way too: a strike
  // whose worth was a joint kill read as a scratch on the boss (NEXT-STEPS §52).
  // The teammates' attacks still to resolve this round count toward it.
  let teamFollowUp = 0;
  if (def.actionType === ActionType.Atac) {
    for (const p of pending) {
      if (p.resolved || p.cancelled || p.actor === actor || p.actor.team !== actor.team
        || p.actionType !== ActionType.Atac || p.actor.playedActionIdx === null || !p.actor.isAlive()) continue;
      const ally = p.actor.actions[p.actor.playedActionIdx]?.def;
      if (ally && (ally.targetCount ?? 1) === 1) teamFollowUp += expectedAttackTotal(p.actor, ally);
    }
  }
  // What THIS blow is expected to take off `e`: through the wall already
  // standing in front of it (its own and its allies' resolved guards, summed —
  // defensa conjunta), less armour. `share` aim only.
  const atk = attackParts(actor, def);
  const throughWall = (e: Character): number => {
    const wall = e.guards.filter(g => g.defender.isAlive());
    const armour = e.getPassiveArmor();
    if (!wall.length) return expectedExcess(atk.dice, atk.flat, undefined, 0, armour);
    const flatOf = (g: typeof wall[number]): number => (g.action.rollBonus ?? 0)
      + g.defender.getRollBonus(g.action.skillId, 'defense') + skillLevelBonus(g.defender, g.action);
    const [first, ...rest] = wall;
    const others = rest.reduce((s, g) => s + (g.fixedTotal ?? (g.action.dice?.average() ?? 0) + flatOf(g)), 0);
    return first.fixedTotal !== undefined
      ? expectedExcess(atk.dice, atk.flat, undefined, first.fixedTotal + others, armour)
      : expectedExcess(atk.dice, atk.flat, first.action.dice, flatOf(first) + others, armour);
  };
  const score = (e: Character): number => {
    if (aim === 'share' && def.actionType === ActionType.Atac) {
      const dmg = throughWall(e);
      let s = 4 * Math.min(dmg, e.currentPV) / Math.max(1, e.maxPV);
      s += Math.min(2, bestAttackAverage(e) / 6);
      if (dmg >= e.currentPV) s += 4;
      else if (teamFollowUp > 0 && dmg + Math.max(0, teamFollowUp - e.getPassiveArmor()) >= e.currentPV) s += 3;
      const focusing = pending.some(p =>
        p.actor === e && !p.resolved && !p.cancelled
        && p.actionType === ActionType.Focus && p.speed < speed);
      if (focusing && !e.hitThisTurn) s += 3;
      return s;
    }
    // An ATTACK focuses fire on the wounded; anything else aimed at an enemy —
    // a swallow, a curse, a plague — is wasted on one about to die, so it goes
    // to the healthy.
    let s = def.actionType === ActionType.Atac ? 2 * (1 - pvFraction(e)) : 2 * pvFraction(e);
    s += Math.min(2, bestAttackAverage(e) / 6); // dangerous targets (heavy hitters) first
    if (def.actionType === ActionType.Atac) {
      const armour = e.getPassiveArmor();
      if (Math.max(0, expectedDamage - armour) >= e.currentPV) {
        s += 4; // take the kill
      } else if (teamFollowUp > 0 && Math.max(0, expectedDamage - armour) + Math.max(0, teamFollowUp - armour) >= e.currentPV) {
        s += 3; // a kill the team's blows still to come can finish
      }
      const focusing = pending.some(p =>
        p.actor === e && !p.resolved && !p.cancelled
        && p.actionType === ActionType.Focus && p.speed < speed);
      if (focusing && !e.hitThisTurn) s += 3; // a hit now cancels their focus
    }
    if (e.guards.some(g => g.defender.isAlive())) s -= 2; // don't feed active guards
    return s;
  };
  const scores = new Map(pool.map(e => [e, score(e)]));
  return [...pool]
    .sort((a, b) => scores.get(b)! - scores.get(a)! || a.currentPV - b.currentPV)
    .slice(0, count);
}

/** Weighted-random action selection for one character. Targets are chosen
 *  later, at resolution time (pickResolveTargets), with reveal-level info.
 *  Returns actionIdx -1 (an explicit pass) when nothing is playable. */
export function selectAction(view: AIView, actor: Character): PlannedAction {
  return drawAction(actionOdds(view, actor));
}

/** The depth-0 policy's odds for one decision, before its single draw. */
export interface ActionOdds {
  indices: number[];
  weights: number[];
  total: number;
}

/** What `selectAction` weighs, without drawing. Reads the board and consumes
 *  no randomness, so the same board gives the same odds. */
export function actionOdds(view: AIView, actor: Character): ActionOdds {
  const indices = availableActionIndices(actor, view.registry);
  if (indices.length === 0) return { indices, weights: [], total: 0 };

  const allies = view.alliesOf(actor, false);
  const enemies = view.enemiesOf(actor);
  const facts = decisionFacts(actor, allies, enemies);
  const weights = indices.map(i =>
    Math.pow(actionWeight(view, actor, actor.actions[i], allies, enemies, facts), view.aiSharpness));
  const total = weights.reduce((s, w) => s + w, 0);
  return { indices, weights, total };
}

/** `selectAction`'s one draw from its odds. */
export function drawAction({ indices, weights, total }: ActionOdds): PlannedAction {
  if (indices.length === 0) return { actionIdx: -1 };
  let roll = random() * total;
  let chosen = indices[0];
  for (let k = 0; k < indices.length; k++) {
    roll -= weights[k];
    if (roll <= 0) { chosen = indices[k]; break; }
  }

  return { actionIdx: chosen };
}

