import { isAttack, isDefense, isFocus, isPhysical } from './card.js';
import { Character } from './character.js';
import { AIStrategy } from './strategy.js';
import { ModifierDuration } from './modifier.js';

/** Interface for the engine state the AI needs (avoids circular dependency issues) */
export interface AIEngineView {
  team1: Character[];
  team2: Character[];
  getLivingEnemies(team: number): number[];
  getLivingAllies(team: number, excludeIdx?: number): number[];
}

/** Assign a uniformly random strategy to each character */
export function assignStrategies(team: Character[]): void {
  const strategies = [AIStrategy.Aggro, AIStrategy.Protect, AIStrategy.Power];
  for (const c of team) {
    c.aiStrategy = strategies[Math.floor(Math.random() * strategies.length)];
  }
}

/** AI card selection — dispatches to strategy-specific weighting */
export function selectCardAI(character: Character, engine: AIEngineView): number {
  if (character.cards.length === 0) return 0;

  const strategy = character.aiStrategy ?? AIStrategy.Aggro;

  switch (strategy) {
    case AIStrategy.Aggro:
      return selectAggro(character, engine);
    case AIStrategy.Protect:
      return selectProtect(character, engine);
    case AIStrategy.Power:
      return selectPower(character, engine);
  }
}

function weightedPick(weights: number[]): number {
  const total = weights.reduce((s, w) => s + w, 0);
  let r = Math.random() * total;
  for (let i = 0; i < weights.length; i++) {
    r -= weights[i];
    if (r <= 0) return i;
  }
  return weights.length - 1;
}

function selectAggro(character: Character, engine: AIEngineView): number {
  const enemies = engine.getLivingEnemies(character.team);
  const enemyTeam = character.team === 1 ? engine.team2 : engine.team1;
  const weights: number[] = [];

  for (const card of character.cards) {
    let weight = 10.0;

    if (isAttack(card.cardType)) {
      weight += 20.0;

      const attackStat = isPhysical(card.cardType)
        ? character.getEffectiveStrength()
        : character.getEffectiveMagic();
      const diceAvg = isPhysical(card.cardType)
        ? (card.physicalAttack?.average() ?? 0)
        : (card.magicAttack?.average() ?? 0);

      if (enemies.length > 0) {
        const avgDefense = enemyTeam
          .filter(e => e.isAlive())
          .reduce((sum, e) => sum + e.getEffectiveDefense(), 0) / enemies.length;
        if (attackStat + diceAvg > avgDefense) {
          weight += 15.0;
        }
      }

      for (const idx of enemies) {
        if (enemyTeam[idx].currentWounds > 0) {
          weight += 15.0;
          break;
        }
      }
    } else if (isDefense(card.cardType)) {
      weight += 2.0;
    } else if (isFocus(card.cardType)) {
      if (card.effect.type === 'DodgeWithSpeedBoost' &&
          character.currentWounds >= character.maxWounds - 1) {
        weight += 15.0;
      } else {
        weight += 2.0;
      }
    }

    weight += card.speedMod * 1.5;
    weights.push(Math.max(1.0, weight));
  }

  return weightedPick(weights);
}

function selectProtect(character: Character, engine: AIEngineView): number {
  const allies = engine.getLivingAllies(character.team);
  const allyTeam = character.team === 1 ? engine.team1 : engine.team2;
  const weights: number[] = [];

  for (const card of character.cards) {
    let weight = 10.0;

    if (isDefense(card.cardType)) {
      weight += 20.0;

      for (const idx of allies) {
        if (allyTeam[idx].currentWounds > 0) {
          weight += 15.0;
          break;
        }
      }

      for (const idx of allies) {
        if (allyTeam[idx].playedCardIdx !== null &&
            isFocus(allyTeam[idx].cards[allyTeam[idx].playedCardIdx!].cardType)) {
          weight += 20.0;
          break;
        }
      }
    } else if (isAttack(card.cardType)) {
      weight += 8.0;
    } else if (isFocus(card.cardType)) {
      switch (card.effect.type) {
        case 'BlindingSmoke':
        case 'IntimidatingRoar':
        case 'IceTrap':
          weight += 12.0;
          break;
        case 'TeamSpeedDefenseBoost':
        case 'DefenseBoostDuration':
          weight += 15.0;
          break;
        case 'DodgeWithSpeedBoost':
          if (character.currentWounds >= character.maxWounds - 1) weight += 15.0;
          else weight += 3.0;
          break;
        default:
          weight += 3.0;
      }
    }

    weight += card.speedMod * 1.5;
    weights.push(Math.max(1.0, weight));
  }

  return weightedPick(weights);
}

function selectPower(character: Character, engine: AIEngineView): number {
  const enemies = engine.getLivingEnemies(character.team);
  const enemyTeam = character.team === 1 ? engine.team2 : engine.team1;

  const hasRestOfCombatBuff = character.modifiers.some(
    m => m.duration === ModifierDuration.RestOfCombat && m.getValue() > 0,
  );

  const weights: number[] = [];

  for (const card of character.cards) {
    let weight = 10.0;

    if (isFocus(card.cardType) && !hasRestOfCombatBuff) {
      switch (card.effect.type) {
        case 'StrengthBoost':
        case 'MagicBoost':
        case 'RageBoost':
        case 'PoisonWeapon':
        case 'EnchantWeapon':
          weight += 25.0;
          break;
        case 'DodgeWithSpeedBoost':
          if (character.currentWounds >= character.maxWounds - 1) weight += 15.0;
          else weight += 5.0;
          break;
        default:
          weight += 5.0;
      }
    } else if (isAttack(card.cardType)) {
      if (hasRestOfCombatBuff) {
        weight += 20.0;
      } else {
        weight += 8.0;
      }

      const attackStat = isPhysical(card.cardType)
        ? character.getEffectiveStrength()
        : character.getEffectiveMagic();
      const diceAvg = isPhysical(card.cardType)
        ? (card.physicalAttack?.average() ?? 0)
        : (card.magicAttack?.average() ?? 0);

      if (enemies.length > 0) {
        const avgDefense = enemyTeam
          .filter(e => e.isAlive())
          .reduce((sum, e) => sum + e.getEffectiveDefense(), 0) / enemies.length;
        if (attackStat + diceAvg > avgDefense) {
          weight += 10.0;
        }
      }
    } else if (isDefense(card.cardType)) {
      weight += 6.0;
    } else if (isFocus(card.cardType) && hasRestOfCombatBuff) {
      weight += 3.0;
    }

    weight += card.speedMod * 1.5;
    weights.push(Math.max(1.0, weight));
  }

  return weightedPick(weights);
}
