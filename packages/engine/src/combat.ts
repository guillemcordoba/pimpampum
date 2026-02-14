import { DiceRoll } from './dice.js';
import { Card, CardType, isAttack, isDefense, isFocus, isPhysical } from './card.js';
import { CombatModifier, ModifierDuration } from './modifier.js';
import { Character } from './character.js';
import { selectCardAI, assignStrategies } from './ai.js';
import type { StrategyStats } from './strategy.js';

export interface LogEntry {
  type: 'round' | 'play' | 'attack' | 'defense' | 'hit' | 'miss' | 'effect' | 'death' | 'focus-interrupted' | 'vengeance' | 'sacrifice' | 'skip';
  text: string;
  team?: number;
  characterName?: string;
}

export interface CardSelection {
  cardIdx: number;
  attackTarget?: [number, number]; // [team, idx] — for attacks and enemy-targeting effects
  allyTarget?: [number, number];   // [team, idx] — for defense and ally-targeting effects
}

export interface PlannedAction {
  team: number;
  charIdx: number;
  cardIdx: number;
  characterName: string;
  characterClass: string;
  cardName: string;
  cardType: CardType;
  effectiveSpeed: number;
}

export interface CardStats {
  plays: number;
  playsByWinner: number;
  interrupted: number;
}

export interface CombatStats {
  cardStats: Map<string, CardStats>;
  cardTypeStats: Map<string, CardStats>;
  classWins: Map<string, number>;
  classGames: Map<string, number>;
  strategyStats: Map<string, StrategyStats>;
}

function newCardStats(): CardStats {
  return { plays: 0, playsByWinner: 0, interrupted: 0 };
}

export function newCombatStats(): CombatStats {
  return {
    cardStats: new Map(),
    cardTypeStats: new Map(),
    classWins: new Map(),
    classGames: new Map(),
    strategyStats: new Map(),
  };
}

export function mergeCombatStats(target: CombatStats, other: CombatStats): void {
  for (const [name, stats] of other.cardStats) {
    const entry = target.cardStats.get(name) ?? newCardStats();
    entry.plays += stats.plays;
    entry.playsByWinner += stats.playsByWinner;
    entry.interrupted += stats.interrupted;
    target.cardStats.set(name, entry);
  }
  for (const [name, stats] of other.cardTypeStats) {
    const entry = target.cardTypeStats.get(name) ?? newCardStats();
    entry.plays += stats.plays;
    entry.playsByWinner += stats.playsByWinner;
    entry.interrupted += stats.interrupted;
    target.cardTypeStats.set(name, entry);
  }
  for (const [cls, wins] of other.classWins) {
    target.classWins.set(cls, (target.classWins.get(cls) ?? 0) + wins);
  }
  for (const [cls, games] of other.classGames) {
    target.classGames.set(cls, (target.classGames.get(cls) ?? 0) + games);
  }
  for (const [strategy, stats] of other.strategyStats) {
    const entry = target.strategyStats.get(strategy) ?? { games: 0, wins: 0 };
    entry.games += stats.games;
    entry.wins += stats.wins;
    target.strategyStats.set(strategy, entry);
  }
}

function cardTypeStr(cardType: CardType): string {
  return cardType;
}

/** How many turns a focus card should be set aside after resolving (-1 = permanent, 0 = not set aside) */
function getSetAsideDuration(effectType: string): number {
  switch (effectType) {
    // RestOfCombat effects — permanent set-aside
    case 'StrengthBoost':
    case 'MagicBoost':
    case 'RageBoost':
    case 'TeamSpeedBoost':
    case 'DefenseBoostDuration':
    case 'EnchantWeapon':
    case 'PoisonWeapon':
    case 'Vengeance':
    case 'DeathCurse':
    case 'SpiritInvocation':
      return -1;
    // NextTwoTurns effects — 3 turns set aside
    case 'IceTrap':
      return 3;
    // NextTurn effects — 2 turns set aside
    case 'BlindingSmoke':
    case 'DodgeWithSpeedBoost':
      return 2;
    // Immediate/ThisTurn effects — not set aside
    default:
      return 0;
  }
}

export class CombatEngine {
  public team1: Character[];
  public team2: Character[];
  public roundNumber = 0;
  public maxRounds = 20;
  public verbose: boolean;

  // Combat state
  public vengeanceTargets = new Map<string, string>();
  public sacrificeTargets = new Map<string, string>();
  public coordinatedAmbushTarget: string | null = null;
  public hitThisRound = new Set<string>();

  // Statistics tracking
  public stats: CombatStats = newCombatStats();
  public team1CardsPlayed: [string, string][] = [];
  public team2CardsPlayed: [string, string][] = [];

  // Log entries for web UI
  public logEntries: LogEntry[] = [];

  // Step-by-step resolution state
  public pendingActions: PlannedAction[] = [];
  public pendingActionIndex = 0;

  // Per-character target overrides for web UI (set before resolution, cleared after)
  private resolveTargets = new Map<string, { attackTarget?: [number, number]; allyTarget?: [number, number]; attackTargets?: [number, number][]; allyTargets?: [number, number][] }>();

  constructor(team1: Character[], team2: Character[], verbose = false) {
    this.team1 = team1;
    this.team2 = team2;
    this.verbose = verbose;

    for (const c of this.team1) {
      c.team = 1;
      c.resetForNewCombat();
    }
    for (const c of this.team2) {
      c.team = 2;
      c.resetForNewCombat();
    }
  }

  private log(msg: string): void {
    if (this.verbose) console.log(msg);
  }

  private addLog(entry: LogEntry): void {
    this.logEntries.push(entry);
  }

  getLivingEnemies(team: number): number[] {
    const enemyTeam = team === 1 ? this.team2 : this.team1;
    return enemyTeam
      .map((c, i) => c.isAlive() ? i : -1)
      .filter(i => i >= 0);
  }

  getLivingAllies(team: number, excludeIdx?: number): number[] {
    const allyTeam = team === 1 ? this.team1 : this.team2;
    return allyTeam
      .map((c, i) => c.isAlive() && i !== excludeIdx ? i : -1)
      .filter(i => i >= 0);
  }

  private getTeam(team: number): Character[] {
    return team === 1 ? this.team1 : this.team2;
  }

  private getEnemyTeam(team: number): Character[] {
    return team === 1 ? this.team2 : this.team1;
  }

  private recordPlay(cardName: string, cardType: string): void {
    if (!this.stats.cardStats.has(cardName)) this.stats.cardStats.set(cardName, newCardStats());
    this.stats.cardStats.get(cardName)!.plays++;
    if (!this.stats.cardTypeStats.has(cardType)) this.stats.cardTypeStats.set(cardType, newCardStats());
    this.stats.cardTypeStats.get(cardType)!.plays++;
  }

  private recordWinnerPlay(cardName: string, cardType: string): void {
    if (!this.stats.cardStats.has(cardName)) this.stats.cardStats.set(cardName, newCardStats());
    this.stats.cardStats.get(cardName)!.playsByWinner++;
    if (!this.stats.cardTypeStats.has(cardType)) this.stats.cardTypeStats.set(cardType, newCardStats());
    this.stats.cardTypeStats.get(cardType)!.playsByWinner++;
  }

  private recordInterrupted(cardName: string, cardType: string): void {
    if (!this.stats.cardStats.has(cardName)) this.stats.cardStats.set(cardName, newCardStats());
    this.stats.cardStats.get(cardName)!.interrupted++;
    if (!this.stats.cardTypeStats.has(cardType)) this.stats.cardTypeStats.set(cardType, newCardStats());
    this.stats.cardTypeStats.get(cardType)!.interrupted++;
  }

  selectTarget(attacker: Character): [number, number] | null {
    const enemies = this.getLivingEnemies(attacker.team);
    if (enemies.length === 0) return null;

    const enemyTeam = this.getEnemyTeam(attacker.team);
    const targetTeam = attacker.team === 1 ? 2 : 1;

    // Smart targeting after reveal: prioritize enemies playing focus (to interrupt them)
    const focusEnemies = enemies.filter(i =>
      enemyTeam[i].playedCardIdx !== null &&
      isFocus(enemyTeam[i].cards[enemyTeam[i].playedCardIdx!].cardType),
    );
    if (focusEnemies.length > 0) {
      // Target the focus enemy with the slowest card (most impactful to interrupt)
      const targetIdx = focusEnemies.reduce((best, i) => {
        const bestSpeed = enemyTeam[best].getEffectiveSpeed(enemyTeam[best].cards[enemyTeam[best].playedCardIdx!]);
        const iSpeed = enemyTeam[i].getEffectiveSpeed(enemyTeam[i].cards[enemyTeam[i].playedCardIdx!]);
        return iSpeed < bestSpeed ? i : best;
      }, focusEnemies[0]);
      return [targetTeam, targetIdx];
    }

    // Otherwise: target most hurt (lowest lives), then lowest defense
    const hurt = enemies.filter(i => enemyTeam[i].currentLives < enemyTeam[i].maxLives);
    let targetIdx: number;

    if (hurt.length > 0) {
      targetIdx = hurt.reduce((best, i) =>
        enemyTeam[i].currentLives < enemyTeam[best].currentLives ? i : best, hurt[0]);
    } else {
      targetIdx = enemies.reduce((best, i) =>
        enemyTeam[i].getEffectiveDefense() < enemyTeam[best].getEffectiveDefense() ? i : best, enemies[0]);
    }

    return [targetTeam, targetIdx];
  }

  private resolveAttack(
    attackerTeam: number,
    attackerIdx: number,
    targetTeam: number,
    targetIdx: number,
    card: Card,
    alreadyHitDefenders?: Set<string>,
  ): boolean {
    let tIdx = targetIdx;
    const targetList = this.getTeam(targetTeam);
    if (!targetList[tIdx].isAlive()) return false;

    const targetName = targetList[tIdx].name;

    // Check for sacrifice redirect
    const sacrificerName = this.sacrificeTargets.get(targetName);
    if (sacrificerName) {
      let found: [number, number] | null = null;
      for (let i = 0; i < this.team1.length; i++) {
        if (this.team1[i].name === sacrificerName && this.team1[i].isAlive()) {
          found = [1, i];
          break;
        }
      }
      if (!found) {
        for (let i = 0; i < this.team2.length; i++) {
          if (this.team2[i].name === sacrificerName && this.team2[i].isAlive()) {
            found = [2, i];
            break;
          }
        }
      }
      if (found) {
        this.log(`  → ${sacrificerName} intercepts the attack meant for ${targetName}!`);
        this.addLog({ type: 'sacrifice', text: `${sacrificerName} intercepts the attack meant for ${targetName}!`, characterName: sacrificerName });
        tIdx = found[1];
      }
    }

    const target = this.getTeam(targetTeam)[tIdx];

    if (target.dodging) {
      this.log(`  → ${target.name} dodges the attack!`);
      this.addLog({ type: 'miss', text: `${target.name} dodges the attack!`, characterName: target.name });
      return false;
    }

    const attacker = this.getTeam(attackerTeam)[attackerIdx];

    const [attackStat, dice] = isPhysical(card.cardType)
      ? [attacker.getEffectiveStrength(), card.physicalAttack]
      : [attacker.getEffectiveMagic(), card.magicAttack];

    let diceRoll = dice ? dice.roll() : 0;

    // Frenzy: +bonusDicePerLostLife per lost life on self
    if (card.effect?.type === 'Frenzy' && attacker.currentLives < attacker.maxLives) {
      const lostLives = attacker.maxLives - attacker.currentLives;
      for (let i = 0; i < lostLives; i++) {
        diceRoll += card.effect.bonusDicePerLostLife.roll();
      }
    }

    const attackBonus = attacker.getAttackBonus(target.name);
    const totalAttack = attackStat + diceRoll + attackBonus;

    const targetNameForVengeance = target.name;
    const attackerName = attacker.name;

    // Check if target has a defense card protecting them
    const defenseTeamChar = this.getTeam(targetTeam);
    const defenseBonusInfo = defenseTeamChar[tIdx].popDefenseBonus((t) => this.getTeam(t));

    let totalDefense: number;
    let defenderInfo: [number, number, string] | null = null;

    if (defenseBonusInfo) {
      const [defTeam, defIdx, defName, defValue] = defenseBonusInfo;
      // AoE defense: if this defender was already wounded by this attack burst, absorb without double wound
      const defKey = `${defTeam}-${defIdx}`;
      if (alreadyHitDefenders?.has(defKey)) {
        this.log(`  → ${defName} already absorbed an attack from this burst — ${target.name} is protected!`);
        this.addLog({ type: 'defense', text: `${defName} ja ha absorbit un atac d'aquesta ràfega — ${target.name} està protegit!`, characterName: defName });
        return false;
      }
      this.log(`  → ${defName} is defending with defense ${defValue}!`);
      this.addLog({ type: 'defense', text: `${defName} defends with defense ${defValue}!`, characterName: defName });
      totalDefense = defValue;
      defenderInfo = [defTeam, defIdx, defName];
    } else {
      totalDefense = this.getTeam(targetTeam)[tIdx].getEffectiveDefense();
    }

    this.log(`  → Attack: ${attackStat} + ${diceRoll} (dice) + ${attackBonus} (bonus) = ${totalAttack}`);
    this.log(`  → Defense: ${totalDefense}`);

    // Log attack roll details for web UI
    const statLabel = isPhysical(card.cardType) ? 'F' : 'M';
    const diceStr = dice ? `${dice}` : '';
    let attackParts = `${statLabel} ${attackStat}`;
    if (diceStr) attackParts += ` + ${diceStr}(${diceRoll})`;
    if (attackBonus !== 0) attackParts += ` + ${attackBonus}`;
    attackParts += ` = ${totalAttack}`;
    this.addLog({ type: 'attack', text: `${attackParts} vs D ${totalDefense}`, characterName: attackerName });

    // Check for vengeance counter-attack
    const protectorName = this.vengeanceTargets.get(targetNameForVengeance);
    if (protectorName) {
      let protectorStrength = 0;
      let protectorFound = false;
      for (const c of [...this.team1, ...this.team2]) {
        if (c.name === protectorName && c.isAlive()) {
          protectorStrength = c.getEffectiveStrength();
          protectorFound = true;
          break;
        }
      }
      if (protectorFound) {
        const counterAttack = protectorStrength + new DiceRoll(1, 8).roll();
        const attackerForCounter = this.getTeam(attackerTeam)[attackerIdx];
        const attackerDef = attackerForCounter.getEffectiveDefense();
        this.log(`  → Vengeance! ${protectorName} counter-attacks with ${counterAttack} vs ${attackerDef}`);
        this.addLog({ type: 'vengeance', text: `${protectorName} counter-attacks with ${counterAttack} vs ${attackerDef}`, characterName: protectorName });
        if (counterAttack > attackerDef) {
          const attackerMut = this.getTeam(attackerTeam)[attackerIdx];
          const died = attackerMut.loseLife();
          this.hitThisRound.add(attackerName);
          this.log(`  → ${attackerName} loses a life from vengeance! (${attackerMut.currentLives}/${attackerMut.maxLives})`);
          this.addLog({ type: 'hit', text: `${attackerName} loses a life from vengeance! (${attackerMut.currentLives}/${attackerMut.maxLives})`, characterName: attackerName });
          if (died) {
            this.log(`  ★ ${attackerName} is defeated!`);
            this.addLog({ type: 'death', text: `${attackerName} is defeated!`, characterName: attackerName });
          }
        }
      }
    }

    if (totalAttack > totalDefense) {
      // Attack succeeds
      let woundTeam: number, woundIdx: number, woundName: string;

      if (defenderInfo) {
        const [defTeam, defIdx, defName] = defenderInfo;
        this.checkFocusInterruption(defTeam, defIdx);
        const defenderMut = this.getTeam(defTeam)[defIdx];
        const died = defenderMut.loseLife();
        this.hitThisRound.add(defName);
        alreadyHitDefenders?.add(`${defTeam}-${defIdx}`);
        this.log(`  → HIT! ${defName} (defender) loses a life! (${defenderMut.currentLives}/${defenderMut.maxLives})`);
        this.addLog({ type: 'hit', text: `${defName} (defender) loses a life! (${defenderMut.currentLives}/${defenderMut.maxLives})`, characterName: defName });
        if (died) {
          this.log(`  ★ ${defName} is defeated!`);
          this.addLog({ type: 'death', text: `${defName} is defeated!`, characterName: defName });
        }

        // BerserkerEndurance: on wound, gain strength and counter-attack
        if (defenderMut.hasBerserkerEndurance && defenderMut.isAlive() && defenderMut.berserkerStrengthDice && defenderMut.berserkerCounterDice) {
          const strGain = defenderMut.berserkerStrengthDice.roll();
          defenderMut.modifiers.push(
            new CombatModifier('strength', strGain, ModifierDuration.RestOfCombat).withSource('Ira imparable'),
          );
          this.log(`  → ${defName} gains +${strGain} strength from berserker rage!`);
          this.addLog({ type: 'effect', text: `${defName} gains +${strGain} strength from berserker rage!`, characterName: defName });

          // Counter-attack
          const counterAttack = defenderMut.getEffectiveStrength() + defenderMut.berserkerCounterDice.roll();
          const attackerForCounter = this.getTeam(attackerTeam)[attackerIdx];
          const attackerDef = attackerForCounter.getEffectiveDefense();
          this.log(`  → ${defName} counter-attacks with ${counterAttack} vs ${attackerDef}`);
          this.addLog({ type: 'vengeance', text: `${defName} counter-attacks with ${counterAttack} vs ${attackerDef}`, characterName: defName });
          if (counterAttack > attackerDef && attackerForCounter.isAlive()) {
            const counterDied = attackerForCounter.loseLife();
            this.hitThisRound.add(attackerName);
            this.log(`  → ${attackerName} loses a life from counter-attack! (${attackerForCounter.currentLives}/${attackerForCounter.maxLives})`);
            this.addLog({ type: 'hit', text: `${attackerName} loses a life from counter-attack! (${attackerForCounter.currentLives}/${attackerForCounter.maxLives})`, characterName: attackerName });
            if (counterDied) {
              this.log(`  ★ ${attackerName} is defeated!`);
              this.addLog({ type: 'death', text: `${attackerName} is defeated!`, characterName: attackerName });
            }
          }
        }

        woundTeam = defTeam;
        woundIdx = defIdx;
        woundName = defName;
      } else {
        this.checkFocusInterruption(targetTeam, tIdx);
        const targetMut = this.getTeam(targetTeam)[tIdx];
        const tName = targetMut.name;
        const died = targetMut.loseLife();
        this.hitThisRound.add(tName);
        this.log(`  → HIT! ${tName} loses a life! (${targetMut.currentLives}/${targetMut.maxLives})`);
        this.addLog({ type: 'hit', text: `${tName} loses a life! (${targetMut.currentLives}/${targetMut.maxLives})`, characterName: tName });
        if (died) {
          this.log(`  ★ ${tName} is defeated!`);
          this.addLog({ type: 'death', text: `${tName} is defeated!`, characterName: tName });
        }
        woundTeam = targetTeam;
        woundIdx = tIdx;
        woundName = tName;
      }

      // Poison weapon check
      if (isPhysical(card.cardType)) {
        const attackerCheck = this.getTeam(attackerTeam)[attackerIdx];
        if (attackerCheck.hasPoisonWeapon) {
          const recipient = this.getTeam(woundTeam)[woundIdx];
          if (recipient.isAlive()) {
            const died = recipient.loseLife();
            this.log(`  → Poison deals extra damage to ${woundName}! (${recipient.currentLives}/${recipient.maxLives})`);
            this.addLog({ type: 'effect', text: `Poison deals extra damage to ${woundName}! (${recipient.currentLives}/${recipient.maxLives})`, characterName: woundName });
            if (died) {
              this.log(`  ★ ${woundName} is defeated by poison!`);
              this.addLog({ type: 'death', text: `${woundName} is defeated by poison!`, characterName: woundName });
            }
          }
        }
      }

      // Counter throw: attacker gets V-3 next turn
      if (defenderInfo) {
        const defender = this.getTeam(defenderInfo[0])[defenderInfo[1]];
        if (defender.hasCounterThrow) {
          const attackerMut = this.getTeam(attackerTeam)[attackerIdx];
          attackerMut.modifiers.push(
            new CombatModifier('speed', -3, ModifierDuration.NextTurn).withSource('Clon de fum'),
          );
          this.log(`  → ${attackerName} is thrown off balance by ${defenderInfo[2]}! V-3 next turn.`);
          this.addLog({ type: 'effect', text: `${attackerName} gets V-3 next turn from Clon de fum!`, characterName: attackerName });
        }
        // Shroud debuff: attacker gets F-2 next turn
        if (defender.hasShroudDebuff) {
          const attackerMut = this.getTeam(attackerTeam)[attackerIdx];
          attackerMut.modifiers.push(
            new CombatModifier('strength', -2, ModifierDuration.NextTurn).withSource('Sudari protector'),
          );
          this.log(`  → ${attackerName} is weakened by ${defenderInfo[2]}'s shroud! F-2 next turn.`);
          this.addLog({ type: 'effect', text: `${attackerName} gets F-2 next turn from Sudari protector!`, characterName: attackerName });
        }
      }
      return true;
    } else {
      this.log('  → MISS! Attack blocked.');
      this.addLog({ type: 'miss', text: `${attackerName}'s attack is blocked by ${this.getTeam(targetTeam)[tIdx].name}!`, characterName: attackerName });

      // Focus is interrupted when receiving an attack
      if (defenderInfo) {
        this.checkFocusInterruption(defenderInfo[0], defenderInfo[1]);
      } else {
        this.checkFocusInterruption(targetTeam, tIdx);
      }

      // Absorb pain on defender
      if (defenderInfo) {
        const [defTeam, defIdx, defName] = defenderInfo;
        const defender = this.getTeam(defTeam)[defIdx];
        if (defender.hasAbsorbPain) {
          defender.modifiers.push(
            new CombatModifier('defense', 1, ModifierDuration.RestOfCombat).withSource('Absorvir dolor'),
          );
          this.log(`  → ${defName} gains +1 defense from Absorvir dolor!`);
          this.addLog({ type: 'effect', text: `${defName} gains +1 defense from Absorvir dolor!`, characterName: defName });
        }

        // Counter throw: attacker gets V-3 next turn
        if (defender.hasCounterThrow) {
          const attackerMut = this.getTeam(attackerTeam)[attackerIdx];
          attackerMut.modifiers.push(
            new CombatModifier('speed', -3, ModifierDuration.NextTurn).withSource('Clon de fum'),
          );
          this.log(`  → ${attackerName} is thrown off balance by ${defName}! V-3 next turn.`);
          this.addLog({ type: 'effect', text: `${attackerName} gets V-3 next turn from Clon de fum!`, characterName: attackerName });
        }

        // Shroud debuff: attacker gets F-2 next turn
        if (defender.hasShroudDebuff) {
          const attackerMut = this.getTeam(attackerTeam)[attackerIdx];
          attackerMut.modifiers.push(
            new CombatModifier('strength', -2, ModifierDuration.NextTurn).withSource('Sudari protector'),
          );
          this.log(`  → ${attackerName} is weakened by ${defName}'s shroud! F-2 next turn.`);
          this.addLog({ type: 'effect', text: `${attackerName} gets F-2 next turn from Sudari protector!`, characterName: attackerName });
        }
      }
      return false;
    }
  }

  private resolveCard(charTeam: number, charIdx: number, card: Card): void {
    const character = this.getTeam(charTeam)[charIdx];
    const charName = character.name;
    const charClass = character.characterClass;
    const cardName = card.name;
    const cardTypeS = cardTypeStr(card.cardType);

    this.recordPlay(cardName, cardTypeS);
    if (charTeam === 1) {
      this.team1CardsPlayed.push([cardName, cardTypeS]);
    } else {
      this.team2CardsPlayed.push([cardName, cardTypeS]);
    }

    this.log(`\n${charName} (${charClass}) plays ${card.name}`);
    this.addLog({ type: 'play', text: `${charName} plays ${card.name}`, team: charTeam, characterName: charName });

    if (isFocus(card.cardType)) {
      if (this.getTeam(charTeam)[charIdx].focusInterrupted) {
        this.recordInterrupted(cardName, cardTypeS);
        this.log('  → Focus interrupted! Card has no effect.');
        this.addLog({ type: 'focus-interrupted', text: `${charName}'s ${card.name} is interrupted!`, characterName: charName });
        return;
      }
    }

    if (isAttack(card.cardType)) {
      if (this.getTeam(charTeam)[charIdx].stunned) {
        this.log(`  → ${charName} is stunned and cannot attack!`);
        this.addLog({ type: 'effect', text: `${charName} is stunned and cannot attack!`, characterName: charName });
        return;
      }
    }

    // Handle attacks
    if (isAttack(card.cardType)) {
      const eTeam = charTeam === 1 ? 2 : 1;
      const overrides = this.resolveTargets.get(charName);

      let targets: number[];
      if (card.effect.type === 'MultiTarget') {
        if (overrides?.attackTargets && overrides.attackTargets.length > 0) {
          targets = overrides.attackTargets.map(t => t[1]);
        } else {
          const enemies = this.getLivingEnemies(charTeam);
          targets = enemies.slice(0, card.effect.count);
        }
      } else if (overrides?.attackTarget && overrides.attackTarget[0] === eTeam) {
        targets = [overrides.attackTarget[1]];
      } else {
        const result = this.selectTarget(this.getTeam(charTeam)[charIdx]);
        targets = result ? [result[1]] : [];
      }

      const hitDefenders = new Set<string>();
      for (const ti of targets) {
        hitDefenders.add(`${eTeam}-${ti}`);
        const hit = this.resolveAttack(charTeam, charIdx, eTeam, ti, card, hitDefenders);

        // LifeDrain: heal attacker 1 life on hit
        if (hit && card.effect.type === 'LifeDrain') {
          const attacker = this.getTeam(charTeam)[charIdx];
          if (attacker.isAlive() && attacker.currentLives < attacker.maxLives) {
            attacker.currentLives++;
            this.log(`  → ${charName} drains life! Recovers 1 life. (${attacker.currentLives}/${attacker.maxLives})`);
            this.addLog({ type: 'effect', text: `${charName} drains life! (${attacker.currentLives}/${attacker.maxLives})`, characterName: charName });
          }
        }

        // VenomBite: on hit, target takes delayed damage next turn
        if (hit && card.effect.type === 'VenomBite') {
          const vTarget = this.getTeam(eTeam)[ti];
          if (vTarget.isAlive()) {
            vTarget.pendingVenomDamage++;
            this.log(`  → ${vTarget.name} is poisoned! Will lose a life at start of next round.`);
            this.addLog({ type: 'effect', text: `${vTarget.name} is poisoned!`, characterName: vTarget.name });
          }
        }

        // TouchOfDeath: apply F-2 and M-2 to target next turn on hit
        if (hit && card.effect.type === 'TouchOfDeath') {
          const target = this.getTeam(eTeam)[ti];
          if (target.isAlive()) {
            target.modifiers.push(
              new CombatModifier('strength', -card.effect.strengthDebuff, ModifierDuration.NextTurn).withSource(card.name),
            );
            target.modifiers.push(
              new CombatModifier('magic', -card.effect.magicDebuff, ModifierDuration.NextTurn).withSource(card.name),
            );
            this.log(`  → ${target.name} gets F-${card.effect.strengthDebuff} and M-${card.effect.magicDebuff} next turn!`);
            this.addLog({ type: 'effect', text: `${target.name} gets F-${card.effect.strengthDebuff} and M-${card.effect.magicDebuff} next turn!`, characterName: target.name });
          }
        }
      }

      // Handle stun effect
      if (card.effect.type === 'Stun') {
        const stunTarget = targets.length > 0 ? [eTeam, targets[0]] as [number, number] : this.selectTarget(this.getTeam(charTeam)[charIdx]);
        if (stunTarget) {
          const [tTeam, tIdx] = stunTarget;
          const tChar = this.getTeam(tTeam)[tIdx];
          if (tChar.isAlive()) {
            tChar.stunned = true;
            this.log(`  → ${tChar.name} is stunned!`);
            this.addLog({ type: 'effect', text: `${tChar.name} is stunned!`, characterName: tChar.name });
          }
        }
      }

      // Handle speed debuff
      if (card.effect.type === 'EnemySpeedDebuff') {
        const debuffTarget = targets.length > 0 ? [eTeam, targets[0]] as [number, number] : this.selectTarget(this.getTeam(charTeam)[charIdx]);
        if (debuffTarget) {
          const [tTeam, tIdx] = debuffTarget;
          const tChar = this.getTeam(tTeam)[tIdx];
          if (tChar.isAlive()) {
            tChar.modifiers.push(
              new CombatModifier('speed', -card.effect.amount, ModifierDuration.NextTurn).withSource(card.name),
            );
            this.log(`  → ${tChar.name} gets -${card.effect.amount} speed next turn!`);
            this.addLog({ type: 'effect', text: `${tChar.name} gets -${card.effect.amount} speed next turn!`, characterName: tChar.name });
          }
        }
      }

      // Handle strength debuff
      if (card.effect.type === 'EnemyStrengthDebuff') {
        const strDebuffTarget = targets.length > 0 ? [eTeam, targets[0]] as [number, number] : this.selectTarget(this.getTeam(charTeam)[charIdx]);
        if (strDebuffTarget) {
          const [tTeam, tIdx] = strDebuffTarget;
          const tChar = this.getTeam(tTeam)[tIdx];
          if (tChar.isAlive()) {
            tChar.modifiers.push(
              new CombatModifier('strength', -card.effect.amount, ModifierDuration.NextTurn).withSource(card.name),
            );
            this.log(`  → ${tChar.name} gets -${card.effect.amount} strength next turn!`);
          }
        }
      }

      // Handle Embestida effect
      if (card.effect.type === 'EmbestidaEffect') {
        const embTarget = targets.length > 0 ? [eTeam, targets[0]] as [number, number] : this.selectTarget(this.getTeam(charTeam)[charIdx]);
        if (embTarget) {
          const [tTeam, tIdx] = embTarget;
          const tChar = this.getTeam(tTeam)[tIdx];
          if (tChar.isAlive()) {
            tChar.modifiers.push(
              new CombatModifier('speed', -2, ModifierDuration.NextTurn).withSource(card.name),
            );
            this.log(`  → ${tChar.name} gets -2 speed next turn!`);
            this.addLog({ type: 'effect', text: `${tChar.name} gets -2 speed next turn!`, characterName: tChar.name });
          }
        }
        // Self -3 speed next turn
        const attacker = this.getTeam(charTeam)[charIdx];
        attacker.modifiers.push(
          new CombatModifier('speed', -3, ModifierDuration.NextTurn).withSource(card.name),
        );
        this.log(`  → ${charName} gets -3 speed next turn!`);
      }

      // Handle Reckless Attack
      if (card.effect.type === 'RecklessAttack') {
        const attacker = this.getTeam(charTeam)[charIdx];
        attacker.modifiers.push(
          new CombatModifier('defense', -2, ModifierDuration.ThisAndNextTurn).withSource(card.name),
        );
        this.log(`  → ${charName} gets -2 defense this and next turn!`);
        this.addLog({ type: 'effect', text: `${charName} gets -2 defense this and next turn!`, characterName: charName });
      }

      // Handle skip turns
      if (card.effect.type === 'SkipNextTurn') {
        this.getTeam(charTeam)[charIdx].skipTurns = 1;
        this.log(`  → ${charName} will skip next turn!`);
      }
      if (card.effect.type === 'SkipNextTurns') {
        this.getTeam(charTeam)[charIdx].skipTurns = card.effect.count;
        this.log(`  → ${charName} will skip the next ${card.effect.count} turns!`);
      }
    }

    // Handle defense cards
    if (isDefense(card.cardType)) {
      const defOverrides = this.resolveTargets.get(charName);

      if (card.effect.type === 'Sacrifice') {
        let protectedIdx: number | null = null;
        if (defOverrides?.allyTarget && defOverrides.allyTarget[0] === charTeam) {
          protectedIdx = defOverrides.allyTarget[1];
        } else {
          // Smart sacrifice targeting: prefer ally playing focus (after reveal)
          const allies = this.getLivingAllies(charTeam, charIdx);
          const focusAlly = allies.find(i => {
            const ally = this.getTeam(charTeam)[i];
            return ally.playedCardIdx !== null && isFocus(ally.cards[ally.playedCardIdx].cardType);
          });
          protectedIdx = focusAlly ?? (allies.length > 0 ? allies[0] : null);
        }
        if (protectedIdx !== null) {
          const allyTeam = this.getTeam(charTeam);
          const protectedName = allyTeam[protectedIdx].name;
          this.sacrificeTargets.set(protectedName, charName);
          this.log(`  → ${charName} will intercept attacks against ${protectedName}!`);
          this.addLog({ type: 'effect', text: `${charName} will intercept attacks against ${protectedName}!`, characterName: charName });
        }
      } else if (card.defense) {
        const defenseDice = card.defense;
        const allyTeamArr = this.getTeam(charTeam);

        let defTargets: number[];
        if (card.effect.type === 'DefendMultiple') {
          if (defOverrides?.allyTargets && defOverrides.allyTargets.length > 0) {
            defTargets = defOverrides.allyTargets.map(t => t[1]);
          } else {
            const allies = this.getLivingAllies(charTeam);
            defTargets = allies.slice(0, card.effect.count);
          }
        } else if (defOverrides?.allyTarget && defOverrides.allyTarget[0] === charTeam) {
          defTargets = [defOverrides.allyTarget[1]];
        } else {
          // Smart defense targeting: prefer ally playing focus (after reveal)
          const allies = this.getLivingAllies(charTeam, charIdx);
          const focusAlly = allies.find(i => {
            const ally = this.getTeam(charTeam)[i];
            return ally.playedCardIdx !== null && isFocus(ally.cards[ally.playedCardIdx].cardType);
          });
          defTargets = focusAlly !== undefined ? [focusAlly] : allies.slice(0, 1);
        }

        const defenderBaseDefense = (() => {
          const defender = this.getTeam(charTeam)[charIdx];
          return defender.defense + defender.getStatModifier('defense') + defender.getEquipmentDefense();
        })();

        for (const ti of defTargets) {
          allyTeamArr[ti].defenseBonuses.push([charTeam, charIdx, charName, defenderBaseDefense, defenseDice]);
          this.log(`  → ${allyTeamArr[ti].name} gains +${defenderBaseDefense} + ${defenseDice} defense this round from ${charName}!`);
          this.addLog({ type: 'defense', text: `${allyTeamArr[ti].name} gains defense from ${charName}!`, characterName: allyTeamArr[ti].name });
        }

        // Defender self-boost: playing defense puts you in a defensive stance,
        // making direct attacks against you harder to land (uses the card's defense dice)
        character.modifiers.push(
          new CombatModifier('defense', 0, ModifierDuration.ThisTurn)
            .withDice(defenseDice)
            .withSource(card.name),
        );

        if (card.effect.type === 'AbsorbPain') {
          this.getTeam(charTeam)[charIdx].hasAbsorbPain = true;
        }
        if (card.effect.type === 'CounterThrow') {
          this.getTeam(charTeam)[charIdx].hasCounterThrow = true;
        }
        if (card.effect.type === 'ShroudDebuff') {
          this.getTeam(charTeam)[charIdx].hasShroudDebuff = true;
        }
        if (card.effect.type === 'BerserkerEndurance') {
          const ch = this.getTeam(charTeam)[charIdx];
          ch.hasBerserkerEndurance = true;
          ch.berserkerStrengthDice = card.effect.strengthDice;
          ch.berserkerCounterDice = card.effect.counterAttackDice;
        }
      }
    }

    // Handle focus cards
    if (isFocus(card.cardType)) {
      switch (card.effect.type) {
        case 'StrengthBoost': {
          const ch = this.getTeam(charTeam)[charIdx];
          const diceBonus = card.effect.dice ? card.effect.dice.roll() : 0;
          const totalBoost = card.effect.amount + diceBonus;
          ch.modifiers.push(
            new CombatModifier('strength', totalBoost, ModifierDuration.RestOfCombat).withSource(card.name),
          );
          this.log(`  → ${charName} gains +${totalBoost} Strength for rest of combat!`);
          this.addLog({ type: 'effect', text: `${charName} gains +${totalBoost} Strength for rest of combat!`, characterName: charName });
          break;
        }
        case 'MagicBoost': {
          const ch = this.getTeam(charTeam)[charIdx];
          const magicDiceBonus = card.effect.dice ? card.effect.dice.roll() : 0;
          const totalMagic = card.effect.amount + magicDiceBonus;
          ch.modifiers.push(
            new CombatModifier('magic', totalMagic, ModifierDuration.RestOfCombat).withSource(card.name),
          );
          this.log(`  → ${charName} gains +${totalMagic} Magic for rest of combat!`);
          this.addLog({ type: 'effect', text: `${charName} gains +${totalMagic} Magic for rest of combat!`, characterName: charName });
          break;
        }
        case 'RageBoost': {
          const ch = this.getTeam(charTeam)[charIdx];
          const diceBonus = card.effect.dice ? card.effect.dice.roll() : 0;
          const totalStrength = card.effect.amount + diceBonus;
          ch.modifiers.push(new CombatModifier('strength', totalStrength, ModifierDuration.RestOfCombat).withSource(card.name));
          ch.modifiers.push(new CombatModifier('speed', card.effect.speedBoost, ModifierDuration.RestOfCombat).withSource(card.name));
          this.log(`  → ${charName} gains +${totalStrength} Strength and +${card.effect.speedBoost} Speed for rest of combat!`);
          this.addLog({ type: 'effect', text: `${charName} gains +${totalStrength} Strength and +${card.effect.speedBoost} Speed for rest of combat!`, characterName: charName });
          break;
        }
        case 'IntimidatingRoar': {
          const enemies = this.getLivingEnemies(charTeam);
          const enemyTeam = this.getEnemyTeam(charTeam);
          for (const idx of enemies) {
            const roll = new DiceRoll(1, 4).roll();
            if (roll <= 2) {
              enemyTeam[idx].stunned = true;
              this.log(`  → ${enemyTeam[idx].name} rolls ${roll} — stunned!`);
              this.addLog({ type: 'effect', text: `${enemyTeam[idx].name} rolls ${roll} — stunned!`, characterName: enemyTeam[idx].name });
            } else {
              this.log(`  → ${enemyTeam[idx].name} rolls ${roll} — resists!`);
              this.addLog({ type: 'effect', text: `${enemyTeam[idx].name} rolls ${roll} — resists!`, characterName: enemyTeam[idx].name });
            }
          }
          break;
        }
        case 'AllyStrengthThisTurn': {
          const allies = this.getLivingAllies(charTeam, charIdx);
          const allyTeam = this.getTeam(charTeam);
          for (const idx of allies) {
            allyTeam[idx].modifiers.push(
              new CombatModifier('strength', card.effect.amount, ModifierDuration.ThisTurn).withSource(card.name),
            );
          }
          this.log(`  → All allies gain +${card.effect.amount} Strength this turn!`);
          this.addLog({ type: 'effect', text: `All allies gain +${card.effect.amount} Strength this turn!`, characterName: charName });
          break;
        }
        case 'DefenseBoostDuration': {
          const ch = this.getTeam(charTeam)[charIdx];
          ch.modifiers.push(
            new CombatModifier('defense', 0, ModifierDuration.RestOfCombat)
              .withDice(card.effect.dice)
              .withSource(card.name),
          );
          const defBoostAllies = this.getLivingAllies(charTeam, charIdx);
          const defBoostAllyTeam = this.getTeam(charTeam);
          const defBoostNames = [charName];
          for (const idx of defBoostAllies) {
            defBoostAllyTeam[idx].modifiers.push(
              new CombatModifier('defense', 0, ModifierDuration.RestOfCombat)
                .withDice(card.effect.dice)
                .withSource(card.name),
            );
            defBoostNames.push(defBoostAllyTeam[idx].name);
          }
          this.log(`  → ${defBoostNames.join(', ')} gain +${card.effect.dice} defense for rest of combat!`);
          this.addLog({ type: 'effect', text: `${defBoostNames.join(', ')} gain +${card.effect.dice} defense!`, characterName: charName });
          break;
        }
        case 'TeamSpeedBoost': {
          const allAllies = this.getLivingAllies(charTeam);
          const allyTeam = this.getTeam(charTeam);
          allyTeam[charIdx].modifiers.push(new CombatModifier('speed', 4, ModifierDuration.RestOfCombat).withSource(card.name));
          for (const idx of allAllies) {
            if (idx !== charIdx) {
              allyTeam[idx].modifiers.push(new CombatModifier('speed', 4, ModifierDuration.RestOfCombat).withSource(card.name));
            }
          }
          this.log('  → All allies gain +4 speed for rest of combat!');
          this.addLog({ type: 'effect', text: 'All allies gain +4 speed for rest of combat!', characterName: charName });
          break;
        }
        case 'IceTrap': {
          const enemies = this.getLivingEnemies(charTeam);
          const enemyTeam = this.getEnemyTeam(charTeam);
          for (const idx of enemies) {
            enemyTeam[idx].modifiers.push(new CombatModifier('speed', -8, ModifierDuration.NextTwoTurns).withSource(card.name));
          }
          this.log('  → Enemies get -8 speed for the next two turns!');
          this.addLog({ type: 'effect', text: 'Enemies get -8 speed for the next two turns!', characterName: charName });
          break;
        }
        case 'BlindingSmoke': {
          const enemies = this.getLivingEnemies(charTeam);
          const enemyTeam = this.getEnemyTeam(charTeam);
          for (const idx of enemies) {
            enemyTeam[idx].modifiers.push(new CombatModifier('speed', -8, ModifierDuration.NextTurn).withSource(card.name));
            enemyTeam[idx].modifiers.push(new CombatModifier('defense', -8, ModifierDuration.NextTurn).withSource(card.name));
          }
          this.log('  → Enemies get -8 speed and -8 defense next turn!');
          this.addLog({ type: 'effect', text: 'Enemies get -8 speed / -8 defense next turn!', characterName: charName });
          break;
        }
        case 'DodgeWithSpeedBoost': {
          const ch = this.getTeam(charTeam)[charIdx];
          ch.dodging = true;
          ch.modifiers.push(new CombatModifier('speed', 5, ModifierDuration.NextTurn).withSource(card.name));
          ch.modifiers.push(new CombatModifier('strength', 4, ModifierDuration.NextTurn).withSource(card.name));
          this.log(`  → ${charName} will dodge all attacks this turn, +5 speed and +4 strength next turn!`);
          this.addLog({ type: 'effect', text: `${charName} dodges all attacks, +5 speed and +4 strength next turn!`, characterName: charName });
          break;
        }
        case 'CoordinatedAmbush': {
          const caOverrides = this.resolveTargets.get(charName);
          const enemies = this.getLivingEnemies(charTeam);
          let ambushTargetIdx: number | null = null;
          if (caOverrides?.attackTarget) {
            ambushTargetIdx = caOverrides.attackTarget[1];
          } else if (enemies.length > 0) {
            ambushTargetIdx = enemies[0];
          }
          if (ambushTargetIdx !== null) {
            const enemyTeam = this.getEnemyTeam(charTeam);
            const tName = enemyTeam[ambushTargetIdx].name;
            this.coordinatedAmbushTarget = tName;
            const allies = this.getLivingAllies(charTeam);
            const allyTeam = this.getTeam(charTeam);
            for (const idx of allies) {
              allyTeam[idx].modifiers.push(
                new CombatModifier('attack_bonus', 0, ModifierDuration.ThisTurn)
                  .withDice(new DiceRoll(1, 8, 2))
                  .withSource(card.name)
                  .withCondition(`attacking_${tName}`),
              );
            }
            this.log(`  → Team gets +1d6+2 when attacking ${tName}!`);
            this.addLog({ type: 'effect', text: `Team gets +1d6+2 when attacking ${tName}!`, characterName: charName });
          }
          break;
        }
        case 'Vengeance': {
          const vengOverrides = this.resolveTargets.get(charName);
          const allyTeam = this.getTeam(charTeam);
          let protectName: string;
          if (vengOverrides?.allyTarget && vengOverrides.allyTarget[0] === charTeam) {
            protectName = allyTeam[vengOverrides.allyTarget[1]].name;
          } else {
            const allies = this.getLivingAllies(charTeam, charIdx);
            if (allies.length === 0) {
              protectName = charName;
            } else {
              const hurt = allies.filter(i => allyTeam[i].currentLives < allyTeam[i].maxLives);
              if (hurt.length > 0) {
                const best = hurt.reduce((b, i) =>
                  allyTeam[i].currentLives < allyTeam[b].currentLives ? i : b, hurt[0]);
                protectName = allyTeam[best].name;
              } else {
                protectName = allyTeam[allies[0]].name;
              }
            }
          }
          this.vengeanceTargets.set(protectName, charName);
          this.log(`  → ${charName} will counter-attack anyone who attacks ${protectName}!`);
          this.addLog({ type: 'effect', text: `${charName} will counter-attack anyone attacking ${protectName}!`, characterName: charName });
          break;
        }
        case 'EnchantWeapon': {
          const ewOverrides = this.resolveTargets.get(charName);
          const allyTeam = this.getTeam(charTeam);
          let ewTargetIdx: number;
          if (ewOverrides?.allyTarget && ewOverrides.allyTarget[0] === charTeam) {
            ewTargetIdx = ewOverrides.allyTarget[1];
          } else {
            const allies = this.getLivingAllies(charTeam);
            ewTargetIdx = allies.length > 0
              ? allies.reduce((best, i) =>
                  Math.max(allyTeam[i].strength, allyTeam[i].magic) >
                  Math.max(allyTeam[best].strength, allyTeam[best].magic) ? i : best, allies[0])
              : charIdx;
          }
          const tName = allyTeam[ewTargetIdx].name;
          allyTeam[ewTargetIdx].modifiers.push(
            new CombatModifier('attack_bonus', 0, ModifierDuration.RestOfCombat)
              .withDice(new DiceRoll(1, 6))
              .withSource(card.name),
          );
          this.log(`  → ${tName}'s attacks now deal +1d6 damage!`);
          this.addLog({ type: 'effect', text: `${tName}'s attacks now deal +1d6 damage!`, characterName: tName });
          break;
        }
        case 'PoisonWeapon': {
          const allyTeam = this.getTeam(charTeam);
          const allAllies = this.getLivingAllies(charTeam);
          // Pick up to 3 allies (including self) sorted by strength
          const sorted = [...allAllies].sort((a, b) => allyTeam[b].strength - allyTeam[a].strength);
          const targets = sorted.slice(0, 3);
          const names: string[] = [];
          for (const idx of targets) {
            allyTeam[idx].hasPoisonWeapon = true;
            names.push(allyTeam[idx].name);
          }
          this.log(`  → ${names.join(' and ')}'s physical attacks now deal an extra wound!`);
          this.addLog({ type: 'effect', text: `${names.join(' and ')}'s physical attacks now deal an extra wound!`, characterName: charName });
          break;
        }
        case 'BloodThirst': {
          const enemies = this.getLivingEnemies(charTeam);
          const enemyTeam = this.getEnemyTeam(charTeam);
          for (const idx of enemies) {
            if (enemyTeam[idx].hitThisCombat) {
              const eName = enemyTeam[idx].name;
              const died = enemyTeam[idx].loseLife();
              this.log(`  → ${eName} loses a life from Blood Thirst! (${enemyTeam[idx].currentLives}/${enemyTeam[idx].maxLives})`);
              this.addLog({ type: 'hit', text: `${eName} loses a life from Blood Thirst! (${enemyTeam[idx].currentLives}/${enemyTeam[idx].maxLives})`, characterName: eName });
              if (died) {
                this.log(`  ★ ${eName} is defeated!`);
                this.addLog({ type: 'death', text: `${eName} is defeated!`, characterName: eName });
              }
            }
          }
          break;
        }
        case 'DeathCurse': {
          const dcOverrides = this.resolveTargets.get(charName);
          const enemies = this.getLivingEnemies(charTeam);
          let curseTargetIdx: number | null = null;
          if (dcOverrides?.attackTarget) {
            curseTargetIdx = dcOverrides.attackTarget[1];
          } else if (enemies.length > 0) {
            curseTargetIdx = enemies[0];
          }
          if (curseTargetIdx !== null) {
            const enemyTeam = this.getEnemyTeam(charTeam);
            const tName = enemyTeam[curseTargetIdx].name;
            // Apply +1d4 attack bonus vs cursed target to self and all allies
            character.modifiers.push(
              new CombatModifier('attack_bonus', 0, ModifierDuration.RestOfCombat)
                .withDice(card.effect.dice)
                .withSource(card.name)
                .withCondition(`attacking_${tName}`),
            );
            const allies = this.getLivingAllies(charTeam, charIdx);
            const allyTeam = this.getTeam(charTeam);
            for (const idx of allies) {
              allyTeam[idx].modifiers.push(
                new CombatModifier('attack_bonus', 0, ModifierDuration.RestOfCombat)
                  .withDice(card.effect.dice)
                  .withSource(card.name)
                  .withCondition(`attacking_${tName}`),
              );
            }
            this.log(`  → All allies get +${card.effect.dice} when attacking ${tName} for rest of combat!`);
            this.addLog({ type: 'effect', text: `All allies get +${card.effect.dice} when attacking ${tName}!`, characterName: charName });
          }
          break;
        }
        case 'SpiritInvocation': {
          // D+1d4 for self and all allies for rest of combat + death ward
          character.modifiers.push(
            new CombatModifier('defense', 0, ModifierDuration.RestOfCombat)
              .withDice(card.effect.dice)
              .withSource(card.name),
          );
          character.hasDeathWard = true;
          const allies = this.getLivingAllies(charTeam, charIdx);
          const allyTeam = this.getTeam(charTeam);
          for (const idx of allies) {
            allyTeam[idx].modifiers.push(
              new CombatModifier('defense', 0, ModifierDuration.RestOfCombat)
                .withDice(card.effect.dice)
                .withSource(card.name),
            );
            allyTeam[idx].hasDeathWard = true;
          }
          this.log(`  → ${charName} and all allies gain +${card.effect.dice} defense for rest of combat and death ward!`);
          this.addLog({ type: 'effect', text: `${charName} and allies gain +${card.effect.dice} defense and death ward!`, characterName: charName });
          break;
        }
        case 'HealAlly': {
          const healOverrides = this.resolveTargets.get(charName);
          const allyTeam = this.getTeam(charTeam);
          let healIdx: number | null = null;
          if (healOverrides?.allyTarget && healOverrides.allyTarget[0] === charTeam) {
            healIdx = healOverrides.allyTarget[1];
          } else {
            // AI: pick most hurt ally (lowest lives)
            const allies = this.getLivingAllies(charTeam);
            const hurt = allies.filter(i => allyTeam[i].currentLives < allyTeam[i].maxLives);
            if (hurt.length > 0) {
              healIdx = hurt.reduce((b, i) =>
                allyTeam[i].currentLives < allyTeam[b].currentLives ? i : b, hurt[0]);
            }
          }
          if (healIdx !== null && allyTeam[healIdx].currentLives < allyTeam[healIdx].maxLives) {
            allyTeam[healIdx].currentLives++;
            const tName = allyTeam[healIdx].name;
            this.log(`  → ${charName} heals ${tName}! (${allyTeam[healIdx].currentLives}/${allyTeam[healIdx].maxLives})`);
            this.addLog({ type: 'effect', text: `${charName} heals ${tName}! (${allyTeam[healIdx].currentLives}/${allyTeam[healIdx].maxLives})`, characterName: charName });
          } else {
            this.log(`  → ${charName} tries to heal but no one is hurt.`);
            this.addLog({ type: 'effect', text: `${charName} tries to heal but no one is hurt.`, characterName: charName });
          }
          break;
        }
        case 'PetrifyingGaze': {
          const enemies = this.getLivingEnemies(charTeam);
          const enemyTeam = this.getEnemyTeam(charTeam);
          for (const idx of enemies) {
            const roll = card.effect.dice.roll();
            if (roll <= card.effect.threshold) {
              enemyTeam[idx].stunned = true;
              enemyTeam[idx].skipTurns += card.effect.turns;
              this.log(`  → ${enemyTeam[idx].name} rolls ${roll} — petrified! Stunned and skips ${card.effect.turns} turns!`);
              this.addLog({ type: 'effect', text: `${enemyTeam[idx].name} rolls ${roll} — petrified! Skips ${card.effect.turns} turns!`, characterName: enemyTeam[idx].name });
            } else {
              this.log(`  → ${enemyTeam[idx].name} rolls ${roll} — resists!`);
              this.addLog({ type: 'effect', text: `${enemyTeam[idx].name} rolls ${roll} — resists the gaze!`, characterName: enemyTeam[idx].name });
            }
          }
          break;
        }
        case 'Regenerate': {
          const ch = this.getTeam(charTeam)[charIdx];
          if (ch.currentLives < ch.maxLives) {
            const healed = Math.min(card.effect.amount, ch.maxLives - ch.currentLives);
            ch.currentLives += healed;
            this.log(`  → ${charName} regenerates ${healed} life/lives! (${ch.currentLives}/${ch.maxLives})`);
            this.addLog({ type: 'effect', text: `${charName} regenerates ${healed} life/lives! (${ch.currentLives}/${ch.maxLives})`, characterName: charName });
          } else {
            this.log(`  → ${charName} tries to regenerate but is at full health.`);
            this.addLog({ type: 'effect', text: `${charName} tries to regenerate but is at full health.`, characterName: charName });
          }
          break;
        }
        default:
          break;
      }

      // Set aside the focus card if it has a lasting effect
      if (character.playedCardIdx !== null) {
        const duration = getSetAsideDuration(card.effect.type);
        if (duration !== 0) {
          character.setAsideCards.set(character.playedCardIdx, duration);
        }
      }
    }
  }

  private checkFocusInterruption(targetTeam: number, targetIdx: number): void {
    const target = this.getTeam(targetTeam)[targetIdx];
    if (target.playedCardIdx !== null) {
      if (isFocus(target.cards[target.playedCardIdx].cardType)) {
        target.focusInterrupted = true;
      }
    }
  }

  isCombatOver(): boolean {
    const team1Alive = this.team1.some(c => c.isAlive());
    const team2Alive = this.team2.some(c => c.isAlive());
    return !team1Alive || !team2Alive;
  }

  // =========================================================================
  // WEB UI INTERFACE — split round into phases
  // =========================================================================

  /** Prepare a new round: resets state and returns which characters need input */
  prepareRound(): { skipping: Map<number, Set<number>> } {
    this.roundNumber++;
    this.coordinatedAmbushTarget = null;
    this.sacrificeTargets.clear();
    this.hitThisRound.clear();
    this.logEntries = [];

    this.addLog({ type: 'round', text: `Round ${this.roundNumber}` });

    const skipping = new Map<number, Set<number>>();
    skipping.set(1, new Set());
    skipping.set(2, new Set());

    for (let idx = 0; idx < this.team1.length; idx++) {
      if (!this.team1[idx].isAlive()) continue;
      if (this.team1[idx].resetForNewRound()) {
        skipping.get(1)!.add(idx);
        this.addLog({ type: 'skip', text: `${this.team1[idx].name} skips this turn!`, team: 1, characterName: this.team1[idx].name });
      }
    }
    for (let idx = 0; idx < this.team2.length; idx++) {
      if (!this.team2[idx].isAlive()) continue;
      if (this.team2[idx].resetForNewRound()) {
        skipping.get(2)!.add(idx);
        this.addLog({ type: 'skip', text: `${this.team2[idx].name} skips this turn!`, team: 2, characterName: this.team2[idx].name });
      }
    }

    // Process venom damage at round start
    for (const ch of [...this.team1, ...this.team2]) {
      if (ch.pendingVenomDamage > 0 && ch.isAlive()) {
        for (let i = 0; i < ch.pendingVenomDamage; i++) {
          const died = ch.loseLife();
          this.addLog({ type: 'hit', text: `${ch.name} loses a life from venom! (${ch.currentLives}/${ch.maxLives})`, characterName: ch.name });
          if (died) {
            this.addLog({ type: 'death', text: `${ch.name} is defeated by venom!`, characterName: ch.name });
            break;
          }
        }
        ch.pendingVenomDamage = 0;
      }
    }

    return { skipping };
  }

  /** Submit card selections for both teams and resolve the round */
  submitSelectionsAndResolve(
    selections: Map<string, CardSelection>,
  ): LogEntry[] {
    this.logEntries = [];
    this.resolveTargets.clear();

    // Build action list and populate target overrides
    const actions: [number, number, number][] = []; // [team, charIdx, cardIdx]

    for (let idx = 0; idx < this.team1.length; idx++) {
      const sel = selections.get(this.team1[idx].name);
      if (sel === undefined) continue;
      this.team1[idx].playedCardIdx = sel.cardIdx;
      actions.push([1, idx, sel.cardIdx]);
      if (sel.attackTarget || sel.allyTarget) {
        this.resolveTargets.set(this.team1[idx].name, {
          attackTarget: sel.attackTarget,
          allyTarget: sel.allyTarget,
        });
      }
    }
    for (let idx = 0; idx < this.team2.length; idx++) {
      const sel = selections.get(this.team2[idx].name);
      if (sel === undefined) continue;
      this.team2[idx].playedCardIdx = sel.cardIdx;
      actions.push([2, idx, sel.cardIdx]);
      if (sel.attackTarget || sel.allyTarget) {
        this.resolveTargets.set(this.team2[idx].name, {
          attackTarget: sel.attackTarget,
          allyTarget: sel.allyTarget,
        });
      }
    }

    // Sort by speed (highest first)
    actions.sort((a, b) => {
      const charA = this.getTeam(a[0])[a[1]];
      const charB = this.getTeam(b[0])[b[1]];
      const speedA = charA.getEffectiveSpeed(charA.cards[a[2]]);
      const speedB = charB.getEffectiveSpeed(charB.cards[b[2]]);
      return speedB - speedA;
    });

    // Resolve
    for (const [team, charIdx, cardIdx] of actions) {
      const ch = this.getTeam(team)[charIdx];
      if (!ch.isAlive()) continue;
      const card = ch.cards[cardIdx];
      this.resolveCard(team, charIdx, card);
      if (this.isCombatOver()) break;
    }

    // Death ward recovery
    for (const ch of [...this.team1, ...this.team2]) {
      if (ch.hasDeathWard && ch.isAlive() && this.hitThisRound.has(ch.name)) {
        ch.currentLives = Math.min(ch.maxLives, ch.currentLives + 1);
        ch.hasDeathWard = false;
        this.log(`  → ${ch.name}'s death ward recovers 1 life! (${ch.currentLives}/${ch.maxLives})`);
        this.addLog({ type: 'effect', text: `${ch.name}'s death ward recovers 1 life! (${ch.currentLives}/${ch.maxLives})`, characterName: ch.name });
      }
    }

    // End of round cleanup
    for (const ch of [...this.team1, ...this.team2]) {
      ch.advanceTurnModifiers();
      ch.stunned = false;
    }

    return this.logEntries;
  }

  // =========================================================================
  // WEB UI — step-by-step resolution
  // =========================================================================

  /** Plan actions: set up card selections and sort by speed, but don't resolve. */
  planActions(selections: Map<string, CardSelection>): PlannedAction[] {
    this.logEntries = [];
    this.resolveTargets.clear();

    const actions: [number, number, number][] = [];

    for (let idx = 0; idx < this.team1.length; idx++) {
      const sel = selections.get(this.team1[idx].name);
      if (sel === undefined) continue;
      this.team1[idx].playedCardIdx = sel.cardIdx;
      actions.push([1, idx, sel.cardIdx]);
      if (sel.attackTarget || sel.allyTarget) {
        this.resolveTargets.set(this.team1[idx].name, {
          attackTarget: sel.attackTarget,
          allyTarget: sel.allyTarget,
        });
      }
    }
    for (let idx = 0; idx < this.team2.length; idx++) {
      const sel = selections.get(this.team2[idx].name);
      if (sel === undefined) continue;
      this.team2[idx].playedCardIdx = sel.cardIdx;
      actions.push([2, idx, sel.cardIdx]);
      if (sel.attackTarget || sel.allyTarget) {
        this.resolveTargets.set(this.team2[idx].name, {
          attackTarget: sel.attackTarget,
          allyTarget: sel.allyTarget,
        });
      }
    }

    // Sort by speed (highest first)
    actions.sort((a, b) => {
      const charA = this.getTeam(a[0])[a[1]];
      const charB = this.getTeam(b[0])[b[1]];
      const speedA = charA.getEffectiveSpeed(charA.cards[a[2]]);
      const speedB = charB.getEffectiveSpeed(charB.cards[b[2]]);
      return speedB - speedA;
    });

    this.pendingActions = actions.map(([team, charIdx, cardIdx]) => {
      const ch = this.getTeam(team)[charIdx];
      const card = ch.cards[cardIdx];
      return {
        team,
        charIdx,
        cardIdx,
        characterName: ch.name,
        characterClass: ch.characterClass,
        cardName: card.name,
        cardType: card.cardType,
        effectiveSpeed: ch.getEffectiveSpeed(card),
      };
    });
    this.pendingActionIndex = 0;

    return this.pendingActions;
  }

  /** Resolve the next pending action. Returns logs for just this action. */
  resolveNextAction(): { action: PlannedAction | null; logs: LogEntry[]; done: boolean; combatOver: boolean } {
    if (this.pendingActionIndex >= this.pendingActions.length) {
      return { action: null, logs: [], done: true, combatOver: this.isCombatOver() };
    }

    const planned = this.pendingActions[this.pendingActionIndex];
    this.pendingActionIndex++;
    this.logEntries = [];

    const ch = this.getTeam(planned.team)[planned.charIdx];
    if (!ch.isAlive()) {
      this.addLog({ type: 'skip', text: `${planned.characterName} can no longer act.`, characterName: planned.characterName });
      return {
        action: planned,
        logs: this.logEntries,
        done: this.pendingActionIndex >= this.pendingActions.length,
        combatOver: this.isCombatOver(),
      };
    }

    const card = ch.cards[planned.cardIdx];
    this.resolveCard(planned.team, planned.charIdx, card);

    const combatOver = this.isCombatOver();
    const done = combatOver || this.pendingActionIndex >= this.pendingActions.length;

    return { action: planned, logs: this.logEntries, done, combatOver };
  }

  /** Set a resolve target for a character (used for resolution-time targeting). */
  setResolveTarget(charName: string, targets: { attackTarget?: [number, number]; allyTarget?: [number, number]; attackTargets?: [number, number][]; allyTargets?: [number, number][] }): void {
    this.resolveTargets.set(charName, targets);
  }

  /** End-of-round cleanup after step-by-step resolution. */
  finishRound(): void {
    // Death ward recovery
    for (const ch of [...this.team1, ...this.team2]) {
      if (ch.hasDeathWard && ch.isAlive() && this.hitThisRound.has(ch.name)) {
        ch.currentLives = Math.min(ch.maxLives, ch.currentLives + 1);
        ch.hasDeathWard = false;
        this.addLog({ type: 'effect', text: `${ch.name}'s death ward recovers 1 life! (${ch.currentLives}/${ch.maxLives})`, characterName: ch.name });
      }
    }

    for (const ch of [...this.team1, ...this.team2]) {
      ch.advanceTurnModifiers();
      ch.stunned = false;
    }
    this.pendingActions = [];
    this.pendingActionIndex = 0;
  }

  // =========================================================================
  // FULL AUTO COMBAT (for simulator)
  // =========================================================================

  runRound(): boolean {
    this.roundNumber++;
    this.log(`\n${'─'.repeat(50)}`);
    this.log(`ROUND ${this.roundNumber}`);
    this.log('─'.repeat(50));

    this.coordinatedAmbushTarget = null;
    this.sacrificeTargets.clear();
    this.hitThisRound.clear();

    const actions: [number, number, number][] = [];
    const logs: string[] = [];

    // Reset rounds for all living characters
    const team1Skipping = new Set<number>();
    const team2Skipping = new Set<number>();

    for (let idx = 0; idx < this.team1.length; idx++) {
      if (!this.team1[idx].isAlive()) continue;
      if (this.team1[idx].resetForNewRound()) {
        logs.push(`${this.team1[idx].name} skips this turn!`);
        team1Skipping.add(idx);
      }
    }
    for (let idx = 0; idx < this.team2.length; idx++) {
      if (!this.team2[idx].isAlive()) continue;
      if (this.team2[idx].resetForNewRound()) {
        logs.push(`${this.team2[idx].name} skips this turn!`);
        team2Skipping.add(idx);
      }
    }

    // Process venom damage at round start
    for (const ch of [...this.team1, ...this.team2]) {
      if (ch.pendingVenomDamage > 0 && ch.isAlive()) {
        for (let i = 0; i < ch.pendingVenomDamage; i++) {
          const died = ch.loseLife();
          this.log(`  → ${ch.name} loses a life from venom! (${ch.currentLives}/${ch.maxLives})`);
          if (died) {
            this.log(`  ★ ${ch.name} is defeated by venom!`);
            break;
          }
        }
        ch.pendingVenomDamage = 0;
      }
    }
    if (this.isCombatOver()) return false;

    // Card selection is simultaneous — no peeking at ally picks.
    // Collect selections first, then assign playedCardIdx after.
    const pendingSelections: [number, number, number][] = [];
    for (let idx = 0; idx < this.team1.length; idx++) {
      if (!this.team1[idx].isAlive() || team1Skipping.has(idx)) continue;
      const cardIdx = selectCardAI(this.team1[idx], this);
      pendingSelections.push([1, idx, cardIdx]);
    }
    for (let idx = 0; idx < this.team2.length; idx++) {
      if (!this.team2[idx].isAlive() || team2Skipping.has(idx)) continue;
      const cardIdx = selectCardAI(this.team2[idx], this);
      pendingSelections.push([2, idx, cardIdx]);
    }
    // Reveal: assign all playedCardIdx simultaneously
    for (const [team, idx, cardIdx] of pendingSelections) {
      this.getTeam(team)[idx].playedCardIdx = cardIdx;
      actions.push([team, idx, cardIdx]);
      logs.push(`${this.getTeam(team)[idx].name} selects: ${this.getTeam(team)[idx].cards[cardIdx].name}`);
    }

    for (const l of logs) this.log(l);

    if (actions.length === 0) return false;

    // Sort by speed
    actions.sort((a, b) => {
      const charA = this.getTeam(a[0])[a[1]];
      const charB = this.getTeam(b[0])[b[1]];
      const speedA = charA.getEffectiveSpeed(charA.cards[a[2]]);
      const speedB = charB.getEffectiveSpeed(charB.cards[b[2]]);
      return speedB - speedA;
    });

    this.log('\nResolution order (by speed):');
    for (const [team, charIdx, cardIdx] of actions) {
      const ch = this.getTeam(team)[charIdx];
      const c = ch.cards[cardIdx];
      const speed = ch.getEffectiveSpeed(c);
      this.log(`  ${ch.name}: ${speed} (base ${ch.speed} + card ${c.speedMod} + mods)`);
    }

    // Resolve actions
    for (const [team, charIdx, cardIdx] of actions) {
      const ch = this.getTeam(team)[charIdx];
      if (!ch.isAlive()) continue;
      const card = ch.cards[cardIdx];
      this.resolveCard(team, charIdx, card);
      if (this.isCombatOver()) return false;
    }

    // Death ward recovery
    for (const ch of [...this.team1, ...this.team2]) {
      if (ch.hasDeathWard && ch.isAlive() && this.hitThisRound.has(ch.name)) {
        ch.currentLives = Math.min(ch.maxLives, ch.currentLives + 1);
        ch.hasDeathWard = false;
        this.log(`  → ${ch.name}'s death ward recovers 1 life! (${ch.currentLives}/${ch.maxLives})`);
      }
    }

    // End of round cleanup
    for (const ch of [...this.team1, ...this.team2]) {
      ch.advanceTurnModifiers();
      ch.stunned = false;
    }

    return true;
  }

  runCombat(): number {
    this.log('='.repeat(50));
    this.log('COMBAT START');
    this.log('='.repeat(50));

    this.log('\nTeam 1:');
    for (const c of this.team1) {
      this.log(`  ${c.name} (${c.characterClass}) - PV:${c.maxLives} F:${c.strength} M:${c.magic} D:${c.defense} V:${c.speed}`);
    }
    this.log('\nTeam 2:');
    for (const c of this.team2) {
      this.log(`  ${c.name} (${c.characterClass}) - PV:${c.maxLives} F:${c.strength} M:${c.magic} D:${c.defense} V:${c.speed}`);
    }

    // Assign AI strategies
    assignStrategies(this.team1);
    assignStrategies(this.team2);

    while (this.roundNumber < this.maxRounds) {
      if (!this.runRound()) break;
    }

    const team1Alive = this.team1.filter(c => c.isAlive()).length;
    const team2Alive = this.team2.filter(c => c.isAlive()).length;

    this.log(`\n${'─'.repeat(50)}`);
    this.log('COMBAT END');
    this.log('─'.repeat(50));

    let winner: number;
    if (team1Alive > 0 && team2Alive === 0) {
      this.log('TEAM 1 WINS!');
      winner = 1;
    } else if (team2Alive > 0 && team1Alive === 0) {
      this.log('TEAM 2 WINS!');
      winner = 2;
    } else if (team1Alive > team2Alive) {
      this.log(`TEAM 1 WINS! (${team1Alive} vs ${team2Alive} survivors)`);
      winner = 1;
    } else if (team2Alive > team1Alive) {
      this.log(`TEAM 2 WINS! (${team2Alive} vs ${team1Alive} survivors)`);
      winner = 2;
    } else {
      this.log('DRAW!');
      winner = 0;
    }

    // Record winner's cards
    const winnerCards = winner === 1 ? this.team1CardsPlayed : winner === 2 ? this.team2CardsPlayed : null;
    if (winnerCards) {
      for (const [cardName, cardType] of winnerCards) {
        this.recordWinnerPlay(cardName, cardType);
      }
    }

    // Record strategy stats
    const winnerTeam = winner === 1 ? this.team1 : winner === 2 ? this.team2 : null;
    for (const c of [...this.team1, ...this.team2]) {
      if (c.aiStrategy) {
        const entry = this.stats.strategyStats.get(c.aiStrategy) ?? { games: 0, wins: 0 };
        entry.games++;
        if (winnerTeam && winnerTeam.includes(c)) {
          entry.wins++;
        }
        this.stats.strategyStats.set(c.aiStrategy, entry);
      }
    }

    return winner;
  }
}
