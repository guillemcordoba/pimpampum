import { DiceRoll } from './dice.js';

export type ModifierDuration =
  | 'ThisTurn'
  | 'RestOfCombat'
  | { remaining: number; pending: boolean };

export const ModifierDuration = {
  ThisTurn: 'ThisTurn' as const,
  RestOfCombat: 'RestOfCombat' as const,
  NextNTurns(n: number): ModifierDuration { return { remaining: n, pending: true }; },
};

export class CombatModifier {
  public dice: DiceRoll | null = null;
  public source = '';
  public condition: string | null = null;

  constructor(
    public stat: string,
    public value: number,
    public duration: ModifierDuration,
  ) {}

  withDice(dice: DiceRoll): this {
    this.dice = dice;
    return this;
  }

  withSource(source: string): this {
    this.source = source;
    return this;
  }

  withCondition(condition: string): this {
    this.condition = condition;
    return this;
  }

  getValue(): number {
    if (this.dice) return this.dice.roll();
    return this.value;
  }
}
