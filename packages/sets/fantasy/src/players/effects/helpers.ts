import { CombatModifier, ModifierDuration, DiceRoll, Character, EffectContext, EquipmentSlot } from '@pimpampum/engine';

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

// --- Weapons ----------------------------------------------------------------

/** Attack modifier of the wielded main-hand weapon, or undefined if unarmed
 *  (a +0 weapon still counts as armed). Used by the generic weapon mechanic
 *  (any weapon-using skill: Weapon Master, Berserk…). */
export function wieldedWeaponBonus(c: Character): number | undefined {
  for (const e of c.equipment) {
    if (e.slot === EquipmentSlot.Weapon && e.attackBonus !== undefined) return e.attackBonus;
  }
  return undefined;
}

// NOTE: there is deliberately NO shared "save contest" helper here. Cards that
// pit a roll against a target (petrifying gazes, fear roars, burials, binds)
// implement their own contest as custom logic in their skill's file, with
// their own dice and their own rules — contests are card design, not engine
// machinery.
