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

  // Edge case: all cards are set aside — pick the first non-set-aside, or 0
  const available = character.cards.findIndex((_, i) => !character.isCardSetAside(i));
  if (available === -1) return 0;

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

/** Compute expected PackTactics bonus for a card */
function getPackTacticsBonus(card: { effect: { type: string } }, character: Character, engine: AIEngineView): number {
  if (card.effect.type === 'PackTactics') {
    const eff = card.effect as { type: 'PackTactics'; alliesPerBonus: number };
    const allyTeam = character.team === 1 ? engine.team1 : engine.team2;
    const charIdx = allyTeam.indexOf(character);
    const livingAllies = engine.getLivingAllies(character.team, charIdx).length;
    return Math.floor(livingAllies / eff.alliesPerBonus);
  }
  return 0;
}

function selectAggro(character: Character, engine: AIEngineView): number {
  const enemies = engine.getLivingEnemies(character.team);
  const enemyTeam = character.team === 1 ? engine.team2 : engine.team1;
  const weights: number[] = [];

  for (let ci = 0; ci < character.cards.length; ci++) {
    if (character.isCardSetAside(ci)) { weights.push(0); continue; }
    const card = character.cards[ci];
    let weight = 10.0;

    if (isAttack(card.cardType)) {
      weight += 20.0;

      const attackStat = isPhysical(card.cardType)
        ? character.getEffectiveStrength()
        : character.getEffectiveMagic();
      const diceAvg = isPhysical(card.cardType)
        ? (card.physicalAttack?.average() ?? 0)
        : (card.magicAttack?.average() ?? 0);
      const packBonus = getPackTacticsBonus(card, character, engine);

      if (enemies.length > 0) {
        const avgDefense = enemyTeam
          .filter(e => e.isAlive())
          .reduce((sum, e) => sum + e.getEffectiveDefense(), 0) / enemies.length;
        if (attackStat + diceAvg + packBonus > avgDefense) {
          weight += 15.0;
        }
      }

      for (const idx of enemies) {
        if (enemyTeam[idx].currentLives < enemyTeam[idx].maxLives) {
          weight += 15.0;
          break;
        }
      }
      // PiercingStrike: bonus when enemies have defense-heavy allies (Protect strategy)
      if (card.effect.type === 'PiercingStrike') {
        const hasProtector = enemyTeam.some(e => e.isAlive() && e.aiStrategy === AIStrategy.Protect);
        if (hasProtector) weight += 10.0;
      }
      // FlurryOfBlows: bonus against low-defense targets
      if (card.effect.type === 'FlurryOfBlows') {
        if (enemies.length > 0) {
          const minDef = Math.min(...enemies.map(i => enemyTeam[i].getEffectiveDefense()));
          if (character.getEffectiveStrength() + (card.physicalAttack?.average() ?? 0) > minDef) {
            weight += 8.0;
          }
        }
      }
      // SilenceStrike: bonus when enemies have focus-heavy characters
      if (card.effect.type === 'SilenceStrike') {
        const hasBuffableEnemy = enemyTeam.some(e => e.isAlive() && !e.modifiers.some(
          m => m.duration === ModifierDuration.RestOfCombat && m.getValue() > 0,
        ));
        if (hasBuffableEnemy) weight += 5.0;
      }
      // Crossfire: bonus for coordinated attacks
      if (card.effect.type === 'Crossfire') weight += 12.0;
      // FireAndRetreat: attack + dodge combo
      if (card.effect.type === 'FireAndRetreat') {
        weight += 10.0;
        if (character.currentLives <= 1) weight += 8.0;
      }
      // DebilitatingVenom: permanent debuff
      if (card.effect.type === 'DebilitatingVenom') weight += 8.0;
      // Impale: tactical — prevents defense
      if (card.effect.type === 'Impale') weight += 8.0;
      // DoubleWound: devastating double damage
      if (card.effect.type === 'DoubleWound') {
        weight += 15.0;
        for (const idx of enemies) {
          if (enemyTeam[idx].currentLives <= 2) { weight += 5.0; break; }
        }
      }
      // DivineSmite: weight based on combined F+M
      if (card.effect.type === 'DivineSmite') {
        const combinedAttack = character.getEffectiveStrength() + character.getEffectiveMagic() + (card.physicalAttack?.average() ?? 0);
        if (enemies.length > 0) {
          const avgDef = enemyTeam.filter(e => e.isAlive()).reduce((s, e) => s + e.getEffectiveDefense(), 0) / enemies.length;
          if (combinedAttack > avgDef) weight += 8.0;
        }
      }
      // Dissonance: AoE debuff on hit
      if (card.effect.type === 'Dissonance') weight += 8.0;
      // Overcharge: AoE + self-wound — scales with enemy count
      if (card.effect.type === 'Overcharge') {
        if (enemies.length >= 2) weight += 10.0;
        else if (enemies.length === 1) weight -= 10.0;
        if (character.currentLives <= 1) weight -= 20.0;
        else if (character.currentLives >= 3) weight += 5.0;
      }
    } else if (isDefense(card.cardType)) {
      weight += 2.0;
      if (card.effect.type === 'BerserkerEndurance') weight += 5.0;
      if (card.effect.type === 'Deflection') weight += 4.0;
      if (card.effect.type === 'MagicDeflection') weight += 4.0;
      if (card.effect.type === 'InfernalRetaliation') weight += 6.0;
      if (card.effect.type === 'SpellReflection') weight += 4.0;
    } else if (isFocus(card.cardType)) {
      if (card.effect.type === 'DodgeWithSpeedBoost' &&
          character.currentLives <= 1) {
        weight += 15.0;
      } else if (card.effect.type === 'MeditationBoost') {
        const hasBuff = character.modifiers.some(
          m => m.duration === ModifierDuration.RestOfCombat && m.getValue() > 0,
        );
        if (!hasBuff) weight += 12.0;
        else weight += 2.0;
      } else if (card.effect.type === 'NimbleEscape') {
        // Goblins like hiding — coordinated ambush next turn
        const livingAllies = engine.getLivingAllies(character.team).length;
        weight += 8.0 + livingAllies * 1.5;
      } else if (card.effect.type === 'LingeringFire') {
        weight += 10.0;
      } else if (card.effect.type === 'TerrorAura') {
        weight += 12.0 + enemies.length * 5.0;
      } else if (card.effect.type === 'DoomMark') {
        weight += 15.0;
      } else if (card.effect.type === 'BloodContract') {
        weight += 12.0;
      } else if (card.effect.type === 'FuryScaling') {
        const livesLost = character.maxLives - character.currentLives;
        weight += 5.0 * livesLost;
      } else if (card.effect.type === 'VoiceOfValor') {
        const allyTeamA = character.team === 1 ? engine.team1 : engine.team2;
        const alliesA = engine.getLivingAllies(character.team);
        const anyWoundedA = alliesA.some(i => allyTeamA[i].currentLives < allyTeamA[i].maxLives)
          || character.currentLives < character.maxLives;
        if (anyWoundedA) weight += 15.0;
        else weight += 1.0;
      } else if (card.effect.type === 'Charm') {
        if (enemies.length >= 2) weight += 18.0;
        else if (enemies.length === 1) weight += 8.0;
      } else if (card.effect.type === 'Requiem') {
        const woundedEnemies = enemies.filter(i => enemyTeam[i].currentLives < enemyTeam[i].maxLives);
        weight += 5.0 + 5.0 * woundedEnemies.length;
      } else if (card.effect.type === 'BloodMagic') {
        if (character.currentLives >= 2) weight += 5.0;
        else weight += 0.0;
      } else if (card.effect.type === 'LayOnHands') {
        const at = character.team === 1 ? engine.team1 : engine.team2;
        const al = engine.getLivingAllies(character.team);
        const wounded = al.some(i => at[i].currentLives < at[i].maxLives)
          || character.currentLives < character.maxLives;
        if (wounded) weight += 3.0;
        else weight += 0.0;
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
  const enemies = engine.getLivingEnemies(character.team);
  const enemyTeam = character.team === 1 ? engine.team2 : engine.team1;

  // No peeking at ally picks — card selection is simultaneous.
  // Protect strategy pre-agrees to defend, so check if any ally MIGHT
  // play focus (i.e., has a Power strategy and hasn't buffed yet).
  let allyLikelyFocus = false;
  for (const idx of allies) {
    if (allyTeam[idx].aiStrategy === AIStrategy.Power) {
      const hasBuff = allyTeam[idx].modifiers.some(
        m => m.duration === ModifierDuration.RestOfCombat && m.getValue() > 0,
      );
      if (!hasBuff) allyLikelyFocus = true;
    }
  }

  // Check if any ally is critically wounded
  let allyCritical = false;
  for (const idx of allies) {
    if (allyTeam[idx].currentLives <= 1) {
      allyCritical = true;
      break;
    }
  }

  // Check if any ally has a permanent buff (Power ally already buffed)
  let allyHasBuff = false;
  for (const idx of allies) {
    if (allyTeam[idx].modifiers.some(
      m => m.duration === ModifierDuration.RestOfCombat && m.getValue() > 0,
    )) {
      allyHasBuff = true;
      break;
    }
  }

  // When only 1 enemy remains, aggressive play finishes the fight faster
  const fewEnemies = enemies.length <= 1;

  const weights: number[] = [];

  for (let ci = 0; ci < character.cards.length; ci++) {
    if (character.isCardSetAside(ci)) { weights.push(0); continue; }
    const card = character.cards[ci];
    let weight = 10.0;

    if (isDefense(card.cardType)) {
      if (fewEnemies) {
        // Few enemies left — finish them off, less need for defense
        weight += 5.0;
      } else if (allyLikelyFocus) {
        // Pre-agreed coordination: strongly defend when ally is likely playing focus
        weight += 80.0;
      } else if (allyCritical) {
        weight += 25.0;
      } else if (allyHasBuff) {
        // Keep defending the buffed ally — defense redirects ALL attacks
        weight += 30.0;
      } else {
        // No urgent reason to defend — moderate priority
        weight += 10.0;
      }
      if (card.effect.type === 'InfernalRetaliation') weight += 6.0;
      if (card.effect.type === 'MagicDeflection') weight += 4.0;
      if (card.effect.type === 'SpellReflection') weight += 4.0;
    } else if (isAttack(card.cardType)) {
      if (fewEnemies) {
        // Few enemies left — go aggressive to close out the fight
        weight += 25.0;
      } else if (allyLikelyFocus) {
        weight += 1.0;
      } else if (allyHasBuff) {
        // Buffed ally is the primary damage dealer — Protect shields them
        weight += 8.0;
      } else {
        // No Power ally — contribute damage
        weight += 18.0;

        const attackStat = isPhysical(card.cardType)
          ? character.getEffectiveStrength()
          : character.getEffectiveMagic();
        const diceAvg = isPhysical(card.cardType)
          ? (card.physicalAttack?.average() ?? 0)
          : (card.magicAttack?.average() ?? 0);
        const packBonus = getPackTacticsBonus(card, character, engine);

        if (enemies.length > 0) {
          const avgDefense = enemyTeam
            .filter(e => e.isAlive())
            .reduce((sum, e) => sum + e.getEffectiveDefense(), 0) / enemies.length;
          if (attackStat + diceAvg + packBonus > avgDefense) {
            weight += 10.0;
          }
        }

        for (const idx of enemies) {
          if (enemyTeam[idx].currentLives < enemyTeam[idx].maxLives) {
            weight += 10.0;
            break;
          }
        }
      }
      // Devil attack effect bonuses (apply regardless of ally state)
      if (card.effect.type === 'Crossfire') weight += 12.0;
      if (card.effect.type === 'FireAndRetreat') {
        weight += 10.0;
        if (character.currentLives <= 1) weight += 8.0;
      }
      if (card.effect.type === 'DebilitatingVenom') weight += 8.0;
      if (card.effect.type === 'Impale') weight += 8.0;
      if (card.effect.type === 'DoubleWound') weight += 15.0;
      if (card.effect.type === 'Dissonance') weight += 8.0;
      if (card.effect.type === 'DivineSmite') {
        const combinedAttack = character.getEffectiveStrength() + character.getEffectiveMagic() + (card.physicalAttack?.average() ?? 0);
        if (enemies.length > 0) {
          const avgDef = enemyTeam.filter(e => e.isAlive()).reduce((s, e) => s + e.getEffectiveDefense(), 0) / enemies.length;
          if (combinedAttack > avgDef) weight += 8.0;
        }
      }
      if (card.effect.type === 'Overcharge') {
        if (enemies.length >= 2) weight += 10.0;
        else if (enemies.length === 1) weight -= 10.0;
        if (character.currentLives <= 1) weight -= 20.0;
        else if (character.currentLives >= 3) weight += 5.0;
      }
    } else if (isDefense(card.cardType)) {
      if (allyLikelyFocus) {
        // Ally needs defense — don't focus, defend instead
        weight += 1.0;
      } else {
        switch (card.effect.type) {
          case 'CharacteristicModifier':
            if (card.effect.target === 'enemies') weight += 12.0;
            else if (card.effect.target === 'team') weight += 15.0;
            else weight += 3.0;
            break;
          case 'IntimidatingRoar':
            weight += 12.0;
            break;
          case 'SpiritInvocation':
            weight += 15.0;
            break;
          case 'DeathCurse':
            weight += 10.0;
            break;
          case 'MeditationBoost': {
            const hasBuff = character.modifiers.some(
              m => m.duration === ModifierDuration.RestOfCombat && m.getValue() > 0,
            );
            if (!hasBuff) weight += 12.0;
            else weight += 2.0;
            break;
          }
          case 'DodgeWithSpeedBoost':
            if (character.currentLives <= 1) weight += 15.0;
            else weight += 3.0;
            break;
          case 'HealAlly': {
            const anyWounded = allies.some(i => allyTeam[i].currentLives < allyTeam[i].maxLives);
            if (anyWounded) weight += 15.0;
            else weight += 1.0;
            break;
          }
          case 'NimbleEscape': {
            const la = engine.getLivingAllies(character.team).length;
            weight += 8.0 + la * 1.5;
            break;
          }
          case 'LingeringFire':
            weight += 10.0;
            break;
          case 'TerrorAura':
            weight += 12.0 + enemies.length * 5.0;
            break;
          case 'DoomMark':
            weight += 15.0;
            break;
          case 'BloodContract':
            weight += 12.0;
            break;
          case 'FuryScaling': {
            const livesLost2 = character.maxLives - character.currentLives;
            weight += 5.0 * livesLost2;
            break;
          }
          case 'VoiceOfValor': {
            const anyWoundedP = allies.some(i => allyTeam[i].currentLives < allyTeam[i].maxLives)
              || character.currentLives < character.maxLives;
            if (anyWoundedP) weight += 15.0;
            else weight += 1.0;
            break;
          }
          case 'Charm':
            if (enemies.length >= 2) weight += 18.0;
            else if (enemies.length === 1) weight += 8.0;
            break;
          case 'Requiem': {
            const woundedEnemiesP = enemies.filter(i => enemyTeam[i].currentLives < enemyTeam[i].maxLives);
            weight += 5.0 + 5.0 * woundedEnemiesP.length;
            break;
          }
          case 'BloodMagic':
            if (character.currentLives >= 2) weight += 3.0;
            break;
          case 'LayOnHands': {
            const anyWoundedLOH = allies.some(i => allyTeam[i].currentLives < allyTeam[i].maxLives)
              || character.currentLives < character.maxLives;
            if (anyWoundedLOH) weight += 20.0;
            else weight += 1.0;
            break;
          }
          default:
            weight += 3.0;
        }
      }
    }

    weight += card.speedMod * 1.0;
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

  for (let ci = 0; ci < character.cards.length; ci++) {
    if (character.isCardSetAside(ci)) { weights.push(0); continue; }
    const card = character.cards[ci];
    let weight = 10.0;

    if (isFocus(card.cardType) && !hasRestOfCombatBuff) {
      // Power strategy prefers attack-boosting focus cards.
      // Utility-only focus (speed/defense) is less valuable — sometimes better to just attack.
      // No speed penalty applied — slow focus cards are the whole point.
      switch (card.effect.type) {
        case 'CharacteristicModifier': {
          const isOffensiveSelf = card.effect.target === 'self' && card.effect.modifiers.some(
            m => m.characteristic === 'strength' || m.characteristic === 'magic',
          );
          if (isOffensiveSelf) weight += 40.0;
          else weight += 15.0;
          break;
        }
        case 'PoisonWeapon':
        case 'EnchantWeapon':
          weight += 40.0;
          break;
        case 'CoordinatedAmbush':
        case 'DeathCurse':
          weight += 30.0;
          break;
        case 'SpiritInvocation':
        case 'MeditationBoost':
          // Utility focus — helpful but doesn't boost attack power
          weight += 15.0;
          break;
        case 'DodgeWithSpeedBoost':
          if (character.currentLives <= 1) weight += 35.0;
          else weight += 10.0;
          break;
        case 'HealAlly': {
          const at = character.team === 1 ? engine.team1 : engine.team2;
          const al = engine.getLivingAllies(character.team);
          const wounded = al.some(i => at[i].currentLives < at[i].maxLives);
          if (wounded) weight += 20.0;
          else weight += 2.0;
          break;
        }
        case 'NimbleEscape': {
          const la = engine.getLivingAllies(character.team).length;
          weight += 8.0 + la * 1.5;
          break;
        }
        case 'LingeringFire':
          weight += 10.0;
          break;
        case 'TerrorAura':
          weight += 12.0 + enemies.length * 5.0;
          break;
        case 'DoomMark':
          weight += 15.0;
          break;
        case 'BloodContract':
          weight += 30.0;
          break;
        case 'FuryScaling': {
          const livesLost3 = character.maxLives - character.currentLives;
          weight += livesLost3 > 0 ? 5.0 * livesLost3 : 2.0;
          break;
        }
        case 'VoiceOfValor': {
          const atPow = character.team === 1 ? engine.team1 : engine.team2;
          const alPow = engine.getLivingAllies(character.team);
          const anyWoundedPow = alPow.some(i => atPow[i].currentLives < atPow[i].maxLives)
            || character.currentLives < character.maxLives;
          if (anyWoundedPow) weight += 30.0;
          else weight += 2.0;
          break;
        }
        case 'Charm':
          if (enemies.length >= 2) weight += 25.0;
          else if (enemies.length === 1) weight += 10.0;
          break;
        case 'Requiem': {
          const woundedEnemiesPow = enemies.filter(i => enemyTeam[i].currentLives < enemyTeam[i].maxLives);
          weight += 5.0 + 8.0 * woundedEnemiesPow.length;
          break;
        }
        case 'BloodMagic':
          if (character.currentLives >= 2) weight += 25.0;
          break;
        case 'LayOnHands': {
          const atLOH = character.team === 1 ? engine.team1 : engine.team2;
          const alLOH = engine.getLivingAllies(character.team);
          const woundedLOH = alLOH.some(i => atLOH[i].currentLives < atLOH[i].maxLives)
            || character.currentLives < character.maxLives;
          if (woundedLOH) weight += 15.0;
          else weight += 2.0;
          break;
        }
        default:
          weight += 10.0;
      }
      weights.push(Math.max(1.0, weight));
      continue;
    } else if (isAttack(card.cardType)) {
      if (hasRestOfCombatBuff) {
        weight += 30.0;
      } else {
        // Not buffed yet — still attack if focus available is utility-only
        weight += 12.0;
      }

      const attackStat = isPhysical(card.cardType)
        ? character.getEffectiveStrength()
        : character.getEffectiveMagic();
      const diceAvg = isPhysical(card.cardType)
        ? (card.physicalAttack?.average() ?? 0)
        : (card.magicAttack?.average() ?? 0);
      const packBonus = getPackTacticsBonus(card, character, engine);

      if (enemies.length > 0) {
        const avgDefense = enemyTeam
          .filter(e => e.isAlive())
          .reduce((sum, e) => sum + e.getEffectiveDefense(), 0) / enemies.length;
        if (attackStat + diceAvg + packBonus > avgDefense) {
          weight += 10.0;
        }
      }
      // Devil attack effect bonuses
      if (card.effect.type === 'Crossfire') weight += 12.0;
      if (card.effect.type === 'FireAndRetreat') {
        weight += 10.0;
        if (character.currentLives <= 1) weight += 8.0;
      }
      if (card.effect.type === 'DebilitatingVenom') weight += 8.0;
      if (card.effect.type === 'Impale') weight += 8.0;
      if (card.effect.type === 'DoubleWound') weight += 15.0;
      if (card.effect.type === 'Dissonance') weight += 8.0;
      if (card.effect.type === 'DivineSmite') {
        const combinedAttack = character.getEffectiveStrength() + character.getEffectiveMagic() + (card.physicalAttack?.average() ?? 0);
        if (enemies.length > 0) {
          const avgDef = enemyTeam.filter(e => e.isAlive()).reduce((s, e) => s + e.getEffectiveDefense(), 0) / enemies.length;
          if (combinedAttack > avgDef) weight += 15.0;
        }
      }
      if (card.effect.type === 'Overcharge') {
        if (enemies.length >= 2) weight += 15.0;
        else if (enemies.length === 1) weight -= 10.0;
        if (character.currentLives <= 1) weight -= 20.0;
        else if (character.currentLives >= 3) weight += 5.0;
      }
    } else if (isDefense(card.cardType)) {
      weight += 4.0;
      if (card.effect.type === 'InfernalRetaliation') weight += 6.0;
      if (card.effect.type === 'MagicDeflection') weight += 4.0;
      if (card.effect.type === 'SpellReflection') weight += 4.0;
    } else if (isFocus(card.cardType) && hasRestOfCombatBuff) {
      weight += 2.0;
    }

    weight += card.speedMod * 1.5;
    weights.push(Math.max(1.0, weight));
  }

  return weightedPick(weights);
}
