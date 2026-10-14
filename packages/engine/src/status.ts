import type { Character, Guard, StatusEntry } from './character.js';
import type { ActionDefinition, ActionType } from './types.js';
import type { EngineApi } from './effects.js';
import type { AIView } from './policy.js';

/**
 * Status behaviours: the second half of the content system. Where an
 * EffectHandler runs when its OWN action resolves, a StatusBehavior runs while
 * a status sits ON a character, intercepting rolls, damage, guards, targeting
 * and round flow at fixed generic seams. The behaviour is attached to the
 * status INSTANCE by whoever sets it — `setStatus(key, value, turns, data,
 * behavior)` — so the engine never knows a status by name and no registration
 * is needed. A status with no behaviour is inert bookkeeping.
 */

/** A status on its holder — the argument to every query hook. */
export interface StatusRef {
  holder: Character;
  key: string;
  entry: StatusEntry;
}

/** Query hooks get a StatusRef; engine-level hooks get this richer context. */
export interface StatusHookContext extends StatusRef {
  engine: EngineApi;
  /** onRoundEnd only: the action the holder had queued this round (even if it
   *  was cancelled mid-round), or null if they skipped / played nothing. */
  playedAction?: ActionDefinition | null;
}

/** Multipliers a status applies to the holder's attack action. */
export interface AttackStatusMods {
  /** Flat bonus added to the attacker's dice total BEFORE any multiplier —
   *  the "charged strike" shape: prepare a turn, hit far harder. */
  attackRollBonus?: number;
  /** Multiplies the attacker's dice total — which is also the damage basis
   *  (pre-armour), since damage is the margin. */
  attackTotalMult?: number;
  /** Multiplies the margin damage before armour. */
  damageMult?: number;
  /** The holder's attack cannot be defended (feint immunity still vetoes it). */
  ignoreDefense?: boolean;
}

/** One blow on its way: `id` is shared by every target of one pass of an
 *  area attack — they all defend against the same roll — and is new for every
 *  other blow (each pass, each extra attack); `targets` is that pass's whole
 *  target list (an extra attack's: just its own targets). */
export interface BlowInfo {
  id: number;
  attacker: Character;
  targets: readonly Character[];
}

/** Which contested dice total is being adjusted (see modifyContestTotal). */
export type ContestKind = 'attack' | 'defense' | 'save';

export interface StatusBehavior {
  // --- Query hooks: pure reads of the combat pipeline (they may still mutate
  // --- the holder, e.g. a one-shot bonus consuming itself). ------------------

  /** Added to the holder's effective action speed. */
  modifySpeed?(ref: StatusRef): number;
  /** Roll mode for the holder's contest dice: roll the whole pool twice, keep
   *  worst / best. Disadvantage wins if several statuses disagree. `kind` is
   *  provided at contest sites ('attack'/'defense'/'save') so a stance can
   *  sharpen only one side of the holder's game; undefined for uncontexted
   *  rolls. */
  rollMode?(ref: StatusRef, kind?: ContestKind): 'advantage' | 'disadvantage' | void;
  /** Transform the holder's margin damage on every attack (before armour).
   *  Receives the full hook context (engine available for flare logs). */
  modifyOutgoingDamage?(ctx: StatusHookContext, damage: number): number;
  /** Transform damage the holder is about to receive (after armour; the
   *  engine floors the final result at 0). May consume the status. */
  modifyIncomingDamage?(ctx: StatusHookContext, damage: number, attacker?: Character, attackTotal?: number): number;
  /** Adjust a contested dice total the holder just rolled, SEEING both final
   *  totals (clutch curses/blessings that fire only when they flip an
   *  outcome). Runs after the raw totals are logged; may consume the status.
   *  `kind`: whether the holder's total is an attack, a defense or a save. */
  modifyContestTotal?(ctx: StatusHookContext, own: number, opposing: number, kind: ContestKind): number;
  /** Clamp a PV loss the holder is about to suffer (last stands, wards). */
  clampPvLoss?(ref: StatusRef, amount: number): number;
  /** Added to attack dice totals AGAINST the holder (marks, exposures). */
  attackRollAgainstHolder?(ref: StatusRef): number;
  /** Added to every attack total the HOLDER rolls: each pass of its card,
   *  defended or not, and every extra blow (numbs, curses of weakness). */
  attackRollOfHolder?(ref: StatusRef): number;
  /** Defenses contesting `attacker`'s blows on the holder count this much less
   *  (a weak spot the attacker's side has found). Added to the attack's
   *  `defensePenalty`, so it does nothing to an undefended holder. */
  defensePenaltyAgainst?(ref: StatusRef, attacker: Character): number;
  /** The holder cannot benefit from any guard. */
  preventsGuard?(ref: StatusRef): boolean;
  /** Against `attacker`, the holder's ALLIES cannot guard it — only its own
   *  defense counts (a hunter that tracks one prey through any escort). */
  excludesAllyGuards?(ref: StatusRef, attacker: Character): boolean;
  /** The holder chooses its card AFTER the opposing side has committed theirs,
   *  and may read them (`CombatEngine.revealedPlanFor`). */
  choosesAfterReveal?(ref: StatusRef): boolean;
  /** The holder cannot play actions of this type right now (burials,
   *  silences…). Checked at every action-availability gate (AI and UI). */
  blocksActionType?(ref: StatusRef, type: ActionType): boolean;
  /** The holder is unreachable by their ENEMIES: excluded from enemy target
   *  pools, area sweeps and extra attacks (allies still reach them). */
  untargetable?(ref: StatusRef): boolean;
  /** The holder perceives the imperceptible: enemy `untargetable` statuses
   *  don't hide from them, and concealment-scatter behaviours should check
   *  this capability (via statusRefs) before redirecting their aim. */
  ignoresConcealment?(ref: StatusRef): boolean;
  /** Attacks against the holder cannot bypass their guard (feint immunity):
   *  vetoes an attacker's ignore-defense modifier. */
  preventsGuardBypass?(ref: StatusRef): boolean;
  /** Guarding with this status takes the full blow — no contest is rolled. */
  absorbsGuard?(ref: StatusRef): boolean;
  /** Post-reveal card-swap charges this status grants the holder. */
  cardSwapCharges?(ref: StatusRef): number;
  /**
   * What holding this status is WORTH to the holder, for the lookahead's leaf
   * evaluator (`positionScore`). Positive is good for the holder; negative is
   * a burden they are carrying.
   *
   * WHY THIS SEAM EXISTS. `positionScore` could only see PV, bodies and
   * fatigue, so anything that does not immediately move one of those scored
   * ZERO — and the AI therefore never chose it. Measured 2026-09-20: eleven
   * cards across six kits sat under 3% of the turns they were legal, and they
   * were almost all walls, buries, marks and set-ups. The cards were fine; the
   * evaluator was blind to them.
   *
   * The UNIT is the same as `positionScore`'s PV term: 1.0 is worth about one
   * combatant's full health. A standing wall with 7 life left on a 12 PV party
   * is worth roughly 7/12 of a body's health, so ~0.6. Keep estimates
   * CONSERVATIVE — this feeds a search, and a status that over-values itself
   * will be played to the exclusion of everything else, which is the same
   * failure in the other direction.
   *
   * The engine never interprets `data`; a behaviour reads its own payload and
   * returns a number.
   */
  positionValue?(ref: StatusRef): number;
  /** Spend one card-swap charge (clear the status when exhausted). */
  spendCardSwapCharge?(ref: StatusRef): void;
  /** AI: transform the base weight of a candidate action while the holder has
   *  this status (runs before per-effect aiWeight hints are added). */
  adjustActionWeight?(view: AIView, ref: StatusRef, action: ActionDefinition, weight: number): number;

  // --- Engine hooks: logic with RNG, logging and multi-character reach. ------

  /** The holder is executing an attack action (once per action, before the
   *  target loop). May mutate the entry (ladders). Multipliers from several
   *  statuses combine multiplicatively. */
  onAttackAction?(ctx: StatusHookContext): AttackStatusMods | void;
  /** Redirect one intended target of the holder's attack (scatter effects). */
  redirectAttackTarget?(ctx: StatusHookContext, intended: Character): Character;
  /** The holder's attack cards may only aim at these characters (a taunt).
   *  Narrows the pool an attack picks its targets from — area attacks
   *  included, so they land once, on them — whenever at least one of them is
   *  a legal target; otherwise the holder aims freely. A block still forces
   *  the attack onto the blocker first. */
  attackTargetsOnly?(ctx: StatusHookContext): Character[] | void;
  /** The holder's attacks cannot reach these characters (one who leapt on
   *  its back): they leave every pool the holder's attacks aim from — area
   *  attacks included — its extra attacks miss them, and a block by one of
   *  them no longer forces the holder's blows. Applied before
   *  `attackTargetsOnly`. If nobody is left, the attack lands on nobody. */
  attackTargetsExcluded?(ctx: StatusHookContext): Character[] | void;
  /** An enemy attack is about to be resolved against `target`, one of the
   *  holder's living allies (never the holder) — before its defenses are
   *  gathered, so a guard pushed onto `target.guards` here covers this very
   *  blow (a defender that dives to whoever is attacked first). Called per
   *  target, in the attack's target order, for normal and extra attacks.
   *  Return true and the blow passes over `target` entirely — no roll, no
   *  damage, as if it had never been aimed there (an ally yanked out of the
   *  way); no other status hears of it, and `afterBlow` still runs. */
  onAllyTargeted?(ctx: StatusHookContext, target: Character, attacker: Character, blow: BlowInfo): boolean | void;
  /** `onAllyTargeted` for the HOLDER itself: an enemy blow is about to
   *  resolve against it, before its defenses are gathered (a trap at its
   *  feet). Asked before its allies are; true makes the blow pass over it. */
  onTargeted?(ctx: StatusHookContext, attacker: Character, blow: BlowInfo): boolean | void;
  /** Take over the defense of an enemy blow on `target`, a living member of
   *  the holder's side (the holder included): return the guards that contest
   *  it INSTEAD of every guard, wall and block on `target` (a construct that
   *  stands in front of the whole group). The first status that answers wins;
   *  nothing (or an empty list) leaves the defense as it was. Not asked for an
   *  undefendable blow, nor for a target that cannot be guarded. */
  guardsBlow?(ctx: StatusHookContext, target: Character, attacker: Character, blow: BlowInfo): Guard[] | void;
  /** An enemy blow on `target`, a living member of the holder's side (the
   *  holder included), has resolved — whatever it did, passed over included —
   *  for every blow `onTargeted`/`onAllyTargeted` were asked about (the moment
   *  to take back a guard raised for that one blow). */
  afterBlow?(ctx: StatusHookContext, target: Character, attacker: Character, blow: BlowInfo): void;
  /** One of the holder's attacks (`action`, extra attacks included) has hit
   *  `target` for `damage` after armour — 0 when the armour took it all. Runs
   *  after the card's own `onAttackHit` riders. */
  onHolderAttackHit?(ctx: StatusHookContext, target: Character, damage: number, action: ActionDefinition): void;
  /** The holder's revealed card is about to resolve: it is alive, the card
   *  was not cancelled and is not an interrupted Focus (a crossbow that shoots
   *  whoever it aims at just before each of their cards). Damage dealt here
   *  interrupts a Focus like any other; a holder felled here does not act. */
  beforeHolderAction?(ctx: StatusHookContext, action: ActionDefinition): void;
  /** The holder plays no card this round — not even Cop desesperat (asleep,
   *  locked in a hold). Asked once per round for each living holder as the
   *  round begins, after the `onRoundStart` hooks, so a status that ends
   *  there (a sleeper who wakes) lets its holder play. */
  skipsRound?(ctx: StatusHookContext): boolean;
  /** The holder's cards resolve PLAIN while this holds: none of their effects
   *  run (no rider, no cost, no focus body) and they aim at one target — only
   *  the card's type, speed and dice count. Asked whenever an effect would
   *  dispatch or a target is chosen. */
  plainCards?(ctx: StatusHookContext): boolean;
  /** The holder has just lost `amount` PV (> 0, after armour and clamps),
   *  from any cause — a blow, a burn, a price. Runs for the statuses of the
   *  one who lost them (a sleeper wakes; a curse counts the wounds). */
  onPvLost?(ctx: StatusHookContext, amount: number, source?: Character): void;
  /** An attack by `attacker` on the holder cannot be defended — an opening
   *  that attacker made. Asked once per blow that could otherwise be defended,
   *  so a one-shot opening may consume itself here. Vetoed, like every
   *  undefendable blow, by `preventsGuardBypass`. */
  opensGuardTo?(ctx: StatusHookContext, attacker: Character): boolean;
  /** An enemy of the holder is executing an attack action (hazards, traps).
   *  Return true when this hazard consumed the attack's hazard check — the
   *  engine stops checking further hazards for this attack. */
  onEnemyAttackAction?(ctx: StatusHookContext, attacker: Character): boolean;
  /** Extra full passes over the holder's (still-living) attack targets after
   *  the action resolves. May consume the status. */
  attackRepeats?(ctx: StatusHookContext): number;
  /** Round-start hook, run for every LIVING holder once the new round begins,
   *  before anyone chooses a card (a burn that bites as the round opens, and
   *  so interrupts a Focus played in it). */
  onRoundStart?(ctx: StatusHookContext): void;
  /** Round-end hook, run for EVERY combatant carrying the status — unlike an
   *  EffectHandler's postRound, which only runs for actions played this round.
   *  Runs before modifiers/statuses advance. Damage-over-time ticks live here. */
  onRoundEnd?(ctx: StatusHookContext): void;
  /** A standing defense (wall, ward…) that contests attacks on the holder
   *  when nobody is actively guarding them: return the defense TOTAL to beat
   *  (roll it inside, with the engine on ctx). The best total among such
   *  statuses is used. Bypassed by ignore-defense attacks (unless vetoed). */
  standingGuard?(ctx: StatusHookContext): number | void;
  /** An attack penetrated this status's standing guard — typically clear the
   *  status (the wall shatters). Called before the damage lands. */
  onStandingGuardBroken?(ctx: StatusHookContext): void;
}
