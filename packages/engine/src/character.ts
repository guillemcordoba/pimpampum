import { DiceRoll } from './dice.js';
import { Equipment } from './equipment.js';
import { Card } from './card.js';
import { CombatModifier, ModifierDuration } from './modifier.js';
import { AIStrategy } from './strategy.js';

/** Defense bonus: [defenderTeam, defenderIdx, defenderName, flatDefense, dice] */
export type DefenseBonus = [number, number, string, number, DiceRoll];

export interface CharacterTemplate {
  id: string;
  displayName: string;
  classCss: string;
  iconPath: string;
  category: 'player' | 'enemy';
  baseStrength: number;
  baseMagic: number;
  baseDefense: number;
  baseSpeed: number;
  baseLives: number;
  cardIcons: Record<string, string>;
  createCards: () => Card[];
}

export class Character {
  public team = 0;
  public equipment: Equipment[] = [];
  public aiStrategy: AIStrategy | null = null;

  // Combat state
  public currentLives: number;
  public modifiers: CombatModifier[] = [];
  public defenseBonuses: DefenseBonus[] = [];
  public skipTurns = 0;
  public stunned = false;
  public dodging = false;
  public focusInterrupted = false;
  public playedCardIdx: number | null = null;
  public hitThisCombat = false;
  public hasAbsorbPain = false;
  public hasPoisonWeapon = false;
  public hasCounterThrow = false;
  public hasShroudDebuff = false;
  public hasDeathWard = false;
  public hasBerserkerEndurance = false;
  public berserkerStrengthDice: DiceRoll | null = null;
  public berserkerCounterDice: DiceRoll | null = null;
  public pendingVenomDamage = 0;
  public silencedTurns = 0;
  public hasDeflection = false;
  public deflectionCounterDice: DiceRoll | null = null;
  public hasMagicDeflection = false;
  public magicDeflectionCounterDice: DiceRoll | null = null;
  public pendingLingeringFireDamage = 0;
  public doomMarked = false;
  public impaledTurns = 0;
  public bloodContractTeam = 0;
  public bloodContractSource = '';
  public hasInfernalRetaliation = false;
  public hasSpellReflection = false;
  public hasDivineBulwark = false;
  public setAsideCards: Map<number, number> = new Map(); // cardIdx → remaining turns (-1 = permanent)

  constructor(
    public name: string,
    public maxLives: number,
    public strength: number,
    public magic: number,
    public defense: number,
    public speed: number,
    public cards: Card[],
    public characterClass: string,
  ) {
    this.currentLives = maxLives;
  }

  isAlive(): boolean {
    return this.currentLives > 0;
  }

  isCardSetAside(cardIdx: number): boolean {
    return this.setAsideCards.has(cardIdx);
  }

  /** Returns true if the character died */
  loseLife(): boolean {
    this.currentLives--;
    this.hitThisCombat = true;
    return !this.isAlive();
  }

  getStatModifier(stat: string, condition?: string): number {
    let total = 0;
    for (const m of this.modifiers) {
      // Skip pending modifiers — they become active after advanceTurnModifiers()
      if (m.duration === ModifierDuration.NextTurn || m.duration === ModifierDuration.NextTwoTurns) continue;
      if (m.stat === stat) {
        if (m.condition !== null) {
          if (condition !== undefined) {
            if (!m.condition.includes(condition)) continue;
          } else {
            continue;
          }
        }
        total += m.getValue();
      }
    }
    return total;
  }

  getEquipmentSpeed(): number {
    return this.equipment.reduce((sum, e) => sum + e.speedMod, 0);
  }

  getEquipmentDefense(): number {
    return this.equipment.reduce((sum, e) => sum + e.getDefense(), 0);
  }

  getEquipmentDefenseAvg(): number {
    return this.equipment.reduce((sum, e) => sum + e.getDefenseAvg(), 0);
  }

  getEffectiveSpeed(card?: Card): number {
    let base = this.speed + this.getStatModifier('speed');
    base += this.getEquipmentSpeed();
    if (card) base += card.speedMod;
    return base;
  }

  getEffectiveStrength(): number {
    return this.strength + this.getStatModifier('strength');
  }

  getEffectiveMagic(): number {
    return this.magic + this.getStatModifier('magic');
  }

  getEffectiveDefense(): number {
    const base = this.defense + this.getStatModifier('defense');
    return base + this.getEquipmentDefense();
  }

  hasDefenseBonus(): boolean {
    return this.defenseBonuses.length > 0;
  }

  /** Get active defense bonus and return [defenderTeam, defenderIdx, defenderName, totalDefense].
   *  Defense cards redirect ALL attacks to the defended player for the round.
   *  Bonuses from dead defenders are removed. */
  popDefenseBonus(getTeam?: (team: number) => Character[]): [number, number, string, number] | null {
    if (getTeam) {
      for (let i = this.defenseBonuses.length - 1; i >= 0; i--) {
        const [team, idx] = this.defenseBonuses[i];
        if (!getTeam(team)[idx].isAlive()) {
          this.defenseBonuses.splice(i, 1);
        }
      }
    }
    const bonus = this.defenseBonuses[this.defenseBonuses.length - 1];
    if (!bonus) return null;
    const [team, idx, name, flatDefense, dice] = bonus;
    const total = flatDefense + dice.roll();
    return [team, idx, name, total];
  }

  getAttackBonus(targetName: string): number {
    let bonus = 0;
    for (const m of this.modifiers) {
      if (m.stat === 'attack_bonus') {
        if (m.condition !== null) {
          if (m.condition.includes(targetName)) {
            bonus += m.getValue();
          }
        } else {
          bonus += m.getValue();
        }
      }
    }
    return bonus;
  }

  equip(item: Equipment): void {
    this.equipment = this.equipment.filter(e => e.slot !== item.slot);
    this.equipment.push(item);
  }

  resetForNewCombat(): void {
    this.currentLives = this.maxLives;
    this.modifiers = [];
    this.defenseBonuses = [];
    this.skipTurns = 0;
    this.stunned = false;
    this.dodging = false;
    this.focusInterrupted = false;
    this.playedCardIdx = null;
    this.hitThisCombat = false;
    this.hasAbsorbPain = false;
    this.hasPoisonWeapon = false;
    this.hasCounterThrow = false;
    this.hasShroudDebuff = false;
    this.hasDeathWard = false;
    this.hasBerserkerEndurance = false;
    this.berserkerStrengthDice = null;
    this.berserkerCounterDice = null;
    this.pendingVenomDamage = 0;
    this.silencedTurns = 0;
    this.hasDeflection = false;
    this.deflectionCounterDice = null;
    this.hasMagicDeflection = false;
    this.magicDeflectionCounterDice = null;
    this.pendingLingeringFireDamage = 0;
    this.doomMarked = false;
    this.impaledTurns = 0;
    this.bloodContractTeam = 0;
    this.bloodContractSource = '';
    this.hasInfernalRetaliation = false;
    this.hasSpellReflection = false;
    this.hasDivineBulwark = false;
    this.setAsideCards.clear();
  }

  /** Returns true if the character is skipping this turn */
  resetForNewRound(): boolean {
    this.dodging = false;
    this.focusInterrupted = false;
    this.playedCardIdx = null;
    this.defenseBonuses = [];
    this.hasDeflection = false;
    this.deflectionCounterDice = null;
    this.hasMagicDeflection = false;
    this.magicDeflectionCounterDice = null;
    this.hasInfernalRetaliation = false;
    this.hasSpellReflection = false;
    this.hasDivineBulwark = false;
    if (this.skipTurns > 0) {
      this.skipTurns--;
      return true;
    }
    return false;
  }

  advanceTurnModifiers(): void {
    this.modifiers = this.modifiers.filter(m => {
      switch (m.duration) {
        case ModifierDuration.ThisTurn:
          return false;
        case ModifierDuration.NextTurn:
          m.duration = ModifierDuration.ThisTurn;
          return true;
        case ModifierDuration.ThisAndNextTurn:
          m.duration = ModifierDuration.NextTurn;
          return true;
        case ModifierDuration.NextTwoTurns:
          m.duration = ModifierDuration.NextTurn;
          return true;
        case ModifierDuration.RestOfCombat:
          return true;
      }
    });

    // Decrement set-aside counters; remove expired ones (-1 = permanent, never expires)
    for (const [cardIdx, remaining] of this.setAsideCards) {
      if (remaining === -1) continue;
      const next = remaining - 1;
      if (next <= 0) {
        this.setAsideCards.delete(cardIdx);
      } else {
        this.setAsideCards.set(cardIdx, next);
      }
    }
  }
}

/** Create a Character from a CharacterTemplate */
export function createCharacter(template: CharacterTemplate, name: string): Character {
  return new Character(
    name,
    template.baseLives,
    template.baseStrength,
    template.baseMagic,
    template.baseDefense,
    template.baseSpeed,
    template.createCards(),
    template.id,
  );
}
