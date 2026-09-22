/**
 * THE SEAM A POLICY PLUGS INTO, and the legality rules a policy must obey.
 *
 * The engine does not contain an AI — it exposes the view a decision-maker
 * needs and the rules about what is LEGAL, and takes the decision itself from
 * an injected chooser (`CombatEngineOptions.actionChooser`). `@pimpampum/ai`
 * supplies one.
 *
 * Splitting them is not tidiness. The rules are the GAME; a policy is an
 * INSTRUMENT used to measure it, and the two are verified completely
 * differently — a mutant in `resolution.ts` is a broken game, a mutant in the
 * AI is a broken measurement. Keeping a policy inside the engine made that
 * distinction impossible to state.
 *
 * Legality lives HERE and not with the policy: "which cards may I play" is a
 * rule of the game, and the engine enforces it for human seats too.
 */
import { Character } from './character.js';
import { ActionInstance } from './action.js';
import { ActionType } from './types.js';
import { EffectRegistry } from './effects.js';

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

/** Hand every character in `team` to the policy (the engine asks its
 *  `actionChooser` for their cards). Human seats are left alone — they get
 *  prompted instead. */
export function setAIControlled(team: Character[], value = true): void {
  for (const c of team) c.aiControlled = value;
}

/**
 * The lowest-index legal action, every time.
 *
 * NOT A POLICY — it makes no judgement, and it exists so that callers who need
 * a seat to simply ACT can say so explicitly. Mechanics tests want exactly
 * this: deterministic, reproducible, and uninterested in playing well. An AI
 * there would make an assertion about a status seam depend on how the AI
 * happened to feel about a card.
 *
 * The engine deliberately has no default chooser (see
 * `CombatEngineOptions.actionChooser`): a silent fallback would produce
 * measurements about a policy nobody picked. This is the cheap way to be
 * explicit instead.
 */
export function firstLegalChooser(engine: { registry: EffectRegistry }, actor: Character): number | null {
  const legal = availableActionIndices(actor, engine.registry);
  return legal.length ? legal[0] : null;
}
