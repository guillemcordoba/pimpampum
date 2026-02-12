/** Represents a dice roll like 1d6, 2d4, or 1d4-1 */
export class DiceRoll {
  constructor(
    public readonly numDice: number,
    public readonly sides: number,
    public readonly modifier: number = 0,
  ) {}

  /** Roll the dice and return the result (minimum 0) */
  roll(): number {
    let total = 0;
    for (let i = 0; i < this.numDice; i++) {
      total += Math.floor(Math.random() * this.sides) + 1;
    }
    return Math.max(0, total + this.modifier);
  }

  /** Return expected average roll */
  average(): number {
    if (this.numDice === 0) return this.modifier;
    const avgPerDie = (1 + this.sides) / 2;
    return this.numDice * avgPerDie + this.modifier;
  }

  toString(): string {
    if (this.numDice === 0) return String(this.modifier);
    const base = `${this.numDice}d${this.sides}`;
    if (this.modifier > 0) return `${base}+${this.modifier}`;
    if (this.modifier < 0) return `${base}${this.modifier}`;
    return base;
  }

  /** Parse dice notation string like "1d6", "2d4-1", "1d6+2" */
  static parse(notation: string): DiceRoll {
    const match = notation.trim().match(/^(\d+)d(\d+)([+-]\d+)?$/);
    if (!match) throw new Error(`Invalid dice notation: ${notation}`);
    return new DiceRoll(
      parseInt(match[1]),
      parseInt(match[2]),
      match[3] ? parseInt(match[3]) : 0,
    );
  }
}
