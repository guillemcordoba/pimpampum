import { DiceRoll } from './dice.js';

export enum ModifierDuration {
  ThisTurn = 'ThisTurn',
  NextTurn = 'NextTurn',
  ThisAndNextTurn = 'ThisAndNextTurn',
  RestOfCombat = 'RestOfCombat',
}

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
