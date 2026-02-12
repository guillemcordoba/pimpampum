import { Card, isAttack, isDefense, isFocus, isPhysical } from './card.js';
import { Character } from './character.js';

/** Interface for the engine state the AI needs (avoids circular dependency issues) */
export interface AIEngineView {
  team1: Character[];
  team2: Character[];
  getLivingEnemies(team: number): number[];
  getLivingAllies(team: number, excludeIdx?: number): number[];
}

export interface PlannedCombo {
  playerAIdx: number;
  cardAIdx: number;
  playerBIdx: number;
  cardBIdx: number;
  priority: number;
}

/** Score how well card_a supports card_b as a combo. Higher = better. 0 = no combo. */
export function comboScore(cardA: Card, cardB: Card): number {
  switch (cardA.effect.type) {
    case 'CoordinatedAmbush':
      if (isAttack(cardB.cardType)) return 10;
      break;
    case 'AllyStrengthThisTurn':
      if (isPhysical(cardB.cardType)) return 9;
      break;
    case 'PoisonWeapon':
      if (isPhysical(cardB.cardType)) return 9;
      break;
    case 'Sacrifice':
      if (isFocus(cardB.cardType) && cardB.speedMod <= 0) return 8;
      break;
    case 'BlindingSmoke':
      if (isFocus(cardB.cardType) && cardB.speedMod <= 0) return 7;
      break;
    case 'IceTrap':
      if (isAttack(cardB.cardType)) return 6;
      break;
    case 'IntimidatingRoar':
      if (isAttack(cardB.cardType)) return 6;
      break;
    case 'RageBoost':
      if (cardB.effect.type === 'Sacrifice') return 8;
      break;
    case 'DefenseBoostDuration':
      if (isFocus(cardB.cardType) && cardB.speedMod <= 0) return 6;
      break;
  }
  return 0;
}

/** Plan combos for a team before combat. Greedy non-overlapping selection. */
export function planCombos(team: Character[]): PlannedCombo[] {
  const living = team
    .map((c, i) => c.isAlive() ? i : -1)
    .filter(i => i >= 0);

  if (living.length < 2) return [];

  const a = living[0];
  const b = living[1];

  const candidates: PlannedCombo[] = [];

  for (let ca = 0; ca < team[a].cards.length; ca++) {
    for (let cb = 0; cb < team[b].cards.length; cb++) {
      const scoreAB = comboScore(team[a].cards[ca], team[b].cards[cb]);
      if (scoreAB > 0) {
        candidates.push({ playerAIdx: a, cardAIdx: ca, playerBIdx: b, cardBIdx: cb, priority: scoreAB });
      }
      const scoreBA = comboScore(team[b].cards[cb], team[a].cards[ca]);
      if (scoreBA > 0) {
        candidates.push({ playerAIdx: b, cardAIdx: cb, playerBIdx: a, cardBIdx: ca, priority: scoreBA });
      }
    }
  }

  candidates.sort((x, y) => y.priority - x.priority);

  const usedA = new Set<number>();
  const usedB = new Set<number>();
  const selected: PlannedCombo[] = [];

  for (const combo of candidates) {
    const aAlready = combo.playerAIdx === living[0] ? usedA.has(combo.cardAIdx) : usedB.has(combo.cardAIdx);
    const bAlready = combo.playerBIdx === living[0] ? usedA.has(combo.cardBIdx) : usedB.has(combo.cardBIdx);

    if (aAlready || bAlready) continue;

    if (combo.playerAIdx === living[0]) usedA.add(combo.cardAIdx); else usedB.add(combo.cardAIdx);
    if (combo.playerBIdx === living[0]) usedA.add(combo.cardBIdx); else usedB.add(combo.cardBIdx);

    selected.push(combo);
  }

  return selected;
}

/** AI card selection using weighted random */
export function selectCardAI(character: Character, engine: AIEngineView): number {
  if (character.cards.length === 0) return 0;

  const enemies = engine.getLivingEnemies(character.team);
  const allies = engine.getLivingAllies(character.team);

  const weights: number[] = [];

  for (const card of character.cards) {
    let weight = 10.0;

    if (isAttack(card.cardType)) {
      const enemyTeam = character.team === 1 ? engine.team2 : engine.team1;
      for (const idx of enemies) {
        if (enemyTeam[idx].currentWounds >= enemyTeam[idx].maxWounds - 1) {
          weight += 15.0;
        }
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
      if (character.currentWounds > 0) weight += 10.0;
      const allyTeam = character.team === 1 ? engine.team1 : engine.team2;
      for (const idx of allies) {
        if (allyTeam[idx].currentWounds > 0) weight += 5.0;
        if (allyTeam[idx].playedCardIdx !== null) {
          if (isFocus(allyTeam[idx].cards[allyTeam[idx].playedCardIdx!].cardType)) {
            weight += 20.0;
          }
        }
      }
    } else if (isFocus(card.cardType)) {
      switch (card.effect.type) {
        case 'StrengthBoost':
        case 'MagicBoost':
        case 'RageBoost':
          weight += 8.0; break;
        case 'IntimidatingRoar':
          weight += 7.0; break;
        case 'PoisonWeapon':
          weight += 10.0; break;
        case 'DodgeWithSpeedBoost':
          if (character.currentWounds >= character.maxWounds - 1) weight += 15.0;
          else weight += 3.0;
          break;
        case 'TeamSpeedDefenseBoost':
          weight += 7.0; break;
        case 'IceTrap':
          weight += 6.0; break;
        case 'BlindingSmoke':
          weight += 10.0; break;
        case 'CoordinatedAmbush':
          weight += 12.0; break;
        case 'Vengeance':
          weight += 4.0; break;
        case 'BloodThirst': {
          const enemyTeam = character.team === 1 ? engine.team2 : engine.team1;
          const woundedCount = enemyTeam.filter(e => e.woundedThisCombat).length;
          weight += woundedCount * 5.0;
          break;
        }
        default:
          weight += 3.0;
      }
    }

    weight += card.speedMod * 1.5;
    weights.push(Math.max(1.0, weight));
  }

  const total = weights.reduce((s, w) => s + w, 0);
  let r = Math.random() * total;
  for (let i = 0; i < weights.length; i++) {
    r -= weights[i];
    if (r <= 0) return i;
  }
  return character.cards.length - 1;
}
