import { CombatModifier, ModifierDuration, DiceRoll, Character, EffectContext } from '@pimpampum/engine';

// --- Param readers ----------------------------------------------------------

export function num(p: Record<string, unknown>, k: string, d: number): number {
  const v = p[k];
  return typeof v === 'number' ? v : d;
}

export function str(p: Record<string, unknown>, k: string, d: string): string {
  const v = p[k];
  return typeof v === 'string' ? v : d;
}

export function diceParam(p: Record<string, unknown>, k: string): DiceRoll | undefined {
  const v = p[k];
  return v instanceof DiceRoll ? v : undefined;
}

// --- Durations --------------------------------------------------------------

/** 'thisTurn' | 'nextTurn' | 'restOfCombat' | <number of turns>. */
export type DurationSpec = 'thisTurn' | 'nextTurn' | 'restOfCombat' | number;

export function toDuration(d: DurationSpec): ModifierDuration {
  if (d === 'thisTurn') return ModifierDuration.ThisTurn;
  if (d === 'restOfCombat') return ModifierDuration.RestOfCombat;
  if (d === 'nextTurn') return ModifierDuration.NextNTurns(1);
  return ModifierDuration.NextNTurns(d);
}

export function durParam(p: Record<string, unknown>, k: string, d: DurationSpec): DurationSpec {
  const v = p[k];
  if (typeof v === 'number') return v;
  if (v === 'thisTurn' || v === 'nextTurn' || v === 'restOfCombat') return v;
  return d;
}

// --- Targeting --------------------------------------------------------------

export type TargetSpec = 'self' | 'ally' | 'allies' | 'team' | 'enemy' | 'enemies';

export function tspec(p: Record<string, unknown>, d: TargetSpec): TargetSpec {
  const v = p['target'];
  if (v === 'self' || v === 'ally' || v === 'allies' || v === 'team' || v === 'enemy' || v === 'enemies') return v;
  return d;
}

/** Resolve the set of characters an effect applies to. */
export function resolveTargets(ctx: EffectContext, spec: TargetSpec): Character[] {
  const { engine, source } = ctx;
  switch (spec) {
    case 'self': return [source];
    case 'ally':
    case 'allies': return ctx.targets.length ? ctx.targets : engine.alliesOf(source, false);
    case 'team': return engine.alliesOf(source, true);
    case 'enemy': return ctx.targets.length ? ctx.targets : engine.enemiesOf(source).slice(0, 1);
    case 'enemies': return engine.enemiesOf(source);
  }
}

/** Player-facing targeting requirement for a target spec. */
export function targetReq(spec: TargetSpec): 'none' | 'enemy' | 'ally' {
  if (spec === 'enemy') return 'enemy';
  if (spec === 'ally') return 'ally';
  return 'none';
}

// --- Modifiers --------------------------------------------------------------

export type ModKind = 'skill' | 'attack' | 'defense' | 'armor' | 'speed';

/** Apply a temporary modifier to a character. */
export function applyMod(c: Character, kind: ModKind, amount: number, d: DurationSpec, source: string, dice?: DiceRoll): void {
  const m = new CombatModifier(kind, amount, toDuration(d)).withSource(source);
  if (dice) m.withDice(dice);
  c.addModifier(m);
}

// --- Misc helpers -----------------------------------------------------------

/** Effective "save" bonus: the target's strongest skill, with kind=defense modifiers. */
export function bestSaveBonus(c: Character): number {
  let best = 0;
  for (const id of c.skills.keys()) {
    const v = c.getRollSkill(id, 'defense');
    if (v > best) best = v;
  }
  return best;
}
