import { DiceRoll } from './dice.js';
import { Card, CardType, type SpecialEffect, isAttack, isDefense, isFocus, isPhysical } from './card.js';
import { CombatModifier, ModifierDuration } from './modifier.js';
import { Character, createCharacter } from './character.js';
import { ALL_CHARACTER_TEMPLATES } from './characters/index.js';
import { selectCardAI, assignStrategies } from './ai.js';
import type { StrategyStats } from './strategy.js';

export interface LogEntry {
  type: 'round' | 'play' | 'attack' | 'defense' | 'hit' | 'miss' | 'effect' | 'death' | 'focus-interrupted' | 'vengeance' | 'skip';
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
function getSetAsideDuration(effect: SpecialEffect): number {
  if (effect.type === 'CharacteristicModifier') {
    if (effect.duration === 'RestOfCombat') return -1;
    if (typeof effect.duration === 'object') return effect.duration.remaining + 1;
    return 0;
  }
  switch (effect.type) {
    // RestOfCombat effects — permanent set-aside
    case 'EnchantWeapon':
    case 'PoisonWeapon':
    case 'Vengeance':
    case 'DeathCurse':
    case 'SpiritInvocation':
    case 'MeditationBoost':
    case 'BloodContract':
    case 'FuryScaling':
    case 'VoiceOfValor':
    case 'BloodMagic':
    case 'LayOnHands':
    case 'WildShape':
      return -1;
    // NextTurn effects — 2 turns set aside
    case 'DodgeWithSpeedBoost':
    case 'WindStance':
    case 'ArcaneTeleport':
      return 2;
    // NimbleEscape — 1 turn set aside
    case 'NimbleEscape':
      return 1;
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

  getDefeatedAllies(team: number, excludeIdx?: number): number[] {
    const allyTeam = team === 1 ? this.team1 : this.team2;
    return allyTeam
      .map((c, i) => !c.isAlive() && i !== excludeIdx ? i : -1)
      .filter(i => i >= 0);
  }

  private getTeam(team: number): Character[] {
    return team === 1 ? this.team1 : this.team2;
  }

  private getEnemyTeam(team: number): Character[] {
    return team === 1 ? this.team2 : this.team1;
  }

  /** Select a random available (non-set-aside, non-consumed) card for a hypnotized character */
  private selectRandomCard(character: Character): number {
    const available: number[] = [];
    for (let i = 0; i < character.cards.length; i++) {
      if (!character.isCardSetAside(i) && !character.cards[i].consumed) available.push(i);
    }
    character.forceRandomCardTurns--;
    return available[Math.floor(Math.random() * available.length)];
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

    // PackTactics: bonus based on living allies
    let packTacticsBonus = 0;
    if (card.effect?.type === 'PackTactics') {
      const livingAllies = this.getLivingAllies(attackerTeam, attackerIdx).length;
      packTacticsBonus = Math.floor(livingAllies / card.effect.alliesPerBonus);
    }

    // Crossfire: bonus from allies who also played attack cards this turn
    let crossfireBonus = 0;
    if (card.effect?.type === 'Crossfire') {
      const allyTeam = this.getTeam(attackerTeam);
      let attackingAllies = 0;
      for (let i = 0; i < allyTeam.length; i++) {
        if (i === attackerIdx) continue;
        if (!allyTeam[i].isAlive()) continue;
        if (allyTeam[i].playedCardIdx !== null) {
          const allyCard = allyTeam[i].cards[allyTeam[i].playedCardIdx!];
          if (isAttack(allyCard.cardType)) attackingAllies++;
        }
      }
      crossfireBonus = Math.min(attackingAllies, card.effect.maxBonus);
      if (crossfireBonus > 0) {
        this.log(`  → Crossfire: +${crossfireBonus} from allies attacking!`);
        this.addLog({ type: 'effect', text: `${attacker.name} gains +${crossfireBonus} (foc creuat)`, characterName: attacker.name });
      }
    }

    // DivineSmite: add magic stat to physical attack
    let divineSmiteBonus = 0;
    if (card.effect?.type === 'DivineSmite') {
      divineSmiteBonus = attacker.getEffectiveMagic();
    }

    const totalAttack = attackStat + diceRoll + attackBonus + packTacticsBonus + crossfireBonus + divineSmiteBonus;

    const targetNameForVengeance = target.name;
    const attackerName = attacker.name;

    // PiercingStrike: bypass defense card redirection entirely
    const piercing = card.effect?.type === 'PiercingStrike';

    // Impale: impaled targets can't be defended
    const targetImpaled = target.impaledTurns > 0;

    // Check if target has a defense card protecting them
    const defenseTeamChar = this.getTeam(targetTeam);
    const defenseBonusInfo = (piercing || targetImpaled) ? null : defenseTeamChar[tIdx].popDefenseBonus((t) => this.getTeam(t));

    if (targetImpaled && defenseTeamChar[tIdx].hasDefenseBonus()) {
      this.log(`  → ${target.name} is impaled — defense is bypassed!`);
      this.addLog({ type: 'effect', text: `${target.name} is impaled — defense bypassed!`, characterName: target.name });
    }

    if (piercing && defenseTeamChar[tIdx].hasDefenseBonus()) {
      this.log(`  → Piercing strike bypasses defense protection!`);
      this.addLog({ type: 'effect', text: `${attacker.name}'s piercing strike bypasses defense!`, characterName: attacker.name });
    }

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
    if (packTacticsBonus > 0) attackParts += ` + ${packTacticsBonus}(horda)`;
    if (crossfireBonus > 0) attackParts += ` + ${crossfireBonus}(foc creuat)`;
    if (divineSmiteBonus > 0) attackParts += ` + ${divineSmiteBonus}(càstig diví)`;
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

        // BerserkerEndurance: on wound, gain strength + speed rest of combat
        if (defenderMut.hasBerserkerEndurance && defenderMut.isAlive() && defenderMut.berserkerStrengthBoost > 0) {
          defenderMut.modifiers.push(
            new CombatModifier('strength', defenderMut.berserkerStrengthBoost, ModifierDuration.RestOfCombat).withSource('Venjança'),
          );
          if (defenderMut.berserkerSpeedBoost > 0) {
            defenderMut.modifiers.push(
              new CombatModifier('speed', defenderMut.berserkerSpeedBoost, ModifierDuration.RestOfCombat).withSource('Venjança'),
            );
          }
          const boosts = [`+${defenderMut.berserkerStrengthBoost} strength`];
          if (defenderMut.berserkerSpeedBoost > 0) boosts.push(`+${defenderMut.berserkerSpeedBoost} speed`);
          this.log(`  → ${defName} gains ${boosts.join(' and ')} for the rest of combat from vengeance!`);
          this.addLog({ type: 'effect', text: `${defName} gains ${boosts.join(' and ')} for the rest of combat from vengeance!`, characterName: defName });
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

      // DoubleWound: attack deals 2 wounds total
      if (card.effect?.type === 'DoubleWound') {
        const recipient = this.getTeam(woundTeam)[woundIdx];
        if (recipient.isAlive()) {
          const died = recipient.loseLife();
          this.log(`  → ${woundName} takes a double wound! (${recipient.currentLives}/${recipient.maxLives})`);
          this.addLog({ type: 'hit', text: `${woundName} takes a double wound! (${recipient.currentLives}/${recipient.maxLives})`, characterName: woundName });
          if (died) {
            this.log(`  ★ ${woundName} is defeated!`);
            this.addLog({ type: 'death', text: `${woundName} is defeated!`, characterName: woundName });
          }
        }
      }

      // DoomMark: marked targets lose an extra life when hit
      {
        const recipient = this.getTeam(woundTeam)[woundIdx];
        if (recipient.doomMarked && recipient.isAlive()) {
          const died = recipient.loseLife();
          recipient.doomMarked = false;
          this.log(`  → ${woundName}'s doom mark triggers — extra wound! (${recipient.currentLives}/${recipient.maxLives})`);
          this.addLog({ type: 'hit', text: `${woundName}'s doom mark triggers! (${recipient.currentLives}/${recipient.maxLives})`, characterName: woundName });
          if (died) {
            this.log(`  ★ ${woundName} is defeated!`);
            this.addLog({ type: 'death', text: `${woundName} is defeated!`, characterName: woundName });
          }
        }
      }

      // Impale: target can't be defended for 2 turns
      if (card.effect?.type === 'Impale') {
        const recipient = this.getTeam(woundTeam)[woundIdx];
        if (recipient.isAlive()) {
          recipient.impaledTurns = 2;
          this.log(`  → ${woundName} is impaled! Cannot be defended for 2 turns.`);
          this.addLog({ type: 'effect', text: `${woundName} is impaled!`, characterName: woundName });
        }
      }

      // DebilitatingVenom: on hit, permanently reduce target's defense
      if (card.effect?.type === 'DebilitatingVenom') {
        const recipient = this.getTeam(woundTeam)[woundIdx];
        if (recipient.isAlive()) {
          recipient.modifiers.push(
            new CombatModifier('defense', -card.effect.defenseReduction, ModifierDuration.RestOfCombat).withSource(card.name),
          );
          this.log(`  → ${woundName} gets D-${card.effect.defenseReduction} permanently from venom!`);
          this.addLog({ type: 'effect', text: `${woundName} gets D-${card.effect.defenseReduction} permanently!`, characterName: woundName });
        }
      }

      // InfernalBurn: on hit, reduce target's strength for 2 turns
      if (card.effect?.type === 'InfernalBurn') {
        const recipient = this.getTeam(woundTeam)[woundIdx];
        if (recipient.isAlive()) {
          recipient.modifiers.push(
            new CombatModifier('strength', -card.effect.strengthReduction, ModifierDuration.NextNTurns(2)).withSource(card.name),
          );
          this.log(`  → ${woundName} gets F-${card.effect.strengthReduction} for 2 turns from infernal fire!`);
          this.addLog({ type: 'effect', text: `${woundName} gets F-${card.effect.strengthReduction} for 2 turns!`, characterName: woundName });
        }
      }

      // BloodContract: attacker pays 1 life if attacking the contracted team
      {
        const attackerCheck2 = this.getTeam(attackerTeam)[attackerIdx];
        if (attackerCheck2.bloodContractTeam !== 0 && targetTeam === attackerCheck2.bloodContractTeam && attackerCheck2.isAlive()) {
          const contractDied = attackerCheck2.loseLife();
          this.hitThisRound.add(attackerName);
          this.log(`  → ${attackerName}'s blood contract triggers — loses a life! (${attackerCheck2.currentLives}/${attackerCheck2.maxLives})`);
          this.addLog({ type: 'hit', text: `${attackerName}'s blood contract triggers! (${attackerCheck2.currentLives}/${attackerCheck2.maxLives})`, characterName: attackerName });
          if (contractDied) {
            this.log(`  ★ ${attackerName} is defeated by blood contract!`);
            this.addLog({ type: 'death', text: `${attackerName} is defeated by blood contract!`, characterName: attackerName });
          }
        }
      }

      // Counter throw: attacker gets V-3 next turn
      if (defenderInfo) {
        const defender = this.getTeam(defenderInfo[0])[defenderInfo[1]];
        if (defender.hasCounterThrow) {
          const attackerMut = this.getTeam(attackerTeam)[attackerIdx];
          attackerMut.modifiers.push(
            new CombatModifier('speed', -3, ModifierDuration.NextNTurns(1)).withSource('Clon de fum'),
          );
          this.log(`  → ${attackerName} is thrown off balance by ${defenderInfo[2]}! V-3 next turn.`);
          this.addLog({ type: 'effect', text: `${attackerName} gets V-3 next turn from Clon de fum!`, characterName: attackerName });
        }
        // Shroud debuff: attacker gets F-2 next turn
        if (defender.hasShroudDebuff) {
          const attackerMut = this.getTeam(attackerTeam)[attackerIdx];
          attackerMut.modifiers.push(
            new CombatModifier('strength', -2, ModifierDuration.NextNTurns(1)).withSource('Mantell diví'),
          );
          this.log(`  → ${attackerName} is weakened by ${defenderInfo[2]}'s shroud! F-2 next turn.`);
          this.addLog({ type: 'effect', text: `${attackerName} gets F-2 next turn from Mantell diví!`, characterName: attackerName });
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

      // Deflection: defender counter-attacks on successful block
      if (defenderInfo) {
        const [defTeam, defIdx, defName] = defenderInfo;
        const defender = this.getTeam(defTeam)[defIdx];
        if (defender.hasDeflection && defender.deflectionCounterDice && defender.isAlive()) {
          const counterAttack = defender.getEffectiveStrength() + defender.deflectionCounterDice.roll();
          const attackerForCounter = this.getTeam(attackerTeam)[attackerIdx];
          const attackerDef = attackerForCounter.getEffectiveDefense();
          this.log(`  → ${defName} deflects and counter-attacks with ${counterAttack} vs ${attackerDef}`);
          this.addLog({ type: 'vengeance', text: `${defName} deflects and counter-attacks with ${counterAttack} vs ${attackerDef}`, characterName: defName });
          if (counterAttack > attackerDef && attackerForCounter.isAlive()) {
            const counterDied = attackerForCounter.loseLife();
            this.hitThisRound.add(attackerName);
            this.log(`  → ${attackerName} loses a life from deflection! (${attackerForCounter.currentLives}/${attackerForCounter.maxLives})`);
            this.addLog({ type: 'hit', text: `${attackerName} loses a life from deflection! (${attackerForCounter.currentLives}/${attackerForCounter.maxLives})`, characterName: attackerName });
            if (counterDied) {
              this.log(`  ★ ${attackerName} is defeated!`);
              this.addLog({ type: 'death', text: `${attackerName} is defeated!`, characterName: attackerName });
            }
          }
        }
      }

      // MagicDeflection: defender counter-attacks with magic on successful block
      if (defenderInfo) {
        const [defTeamM, defIdxM, defNameM] = defenderInfo;
        const defenderM = this.getTeam(defTeamM)[defIdxM];
        if (defenderM.hasMagicDeflection && defenderM.magicDeflectionCounterDice && defenderM.isAlive()) {
          const counterAttack = defenderM.getEffectiveMagic() + defenderM.magicDeflectionCounterDice.roll();
          const attackerForCounter = this.getTeam(attackerTeam)[attackerIdx];
          const attackerDef = attackerForCounter.getEffectiveDefense();
          this.log(`  → ${defNameM} counterpoints with magic! ${counterAttack} vs ${attackerDef}`);
          this.addLog({ type: 'vengeance', text: `${defNameM} counterpoints with magic! ${counterAttack} vs ${attackerDef}`, characterName: defNameM });
          if (counterAttack > attackerDef && attackerForCounter.isAlive()) {
            const counterDied = attackerForCounter.loseLife();
            this.hitThisRound.add(attackerName);
            this.log(`  → ${attackerName} loses a life from magic deflection! (${attackerForCounter.currentLives}/${attackerForCounter.maxLives})`);
            this.addLog({ type: 'hit', text: `${attackerName} loses a life from magic deflection! (${attackerForCounter.currentLives}/${attackerForCounter.maxLives})`, characterName: attackerName });
            if (counterDied) {
              this.log(`  ★ ${attackerName} is defeated!`);
              this.addLog({ type: 'death', text: `${attackerName} is defeated!`, characterName: attackerName });
            }
          }
        }
      }

      // InfernalRetaliation: defender hurts the attacker when blocking
      if (defenderInfo) {
        const [defTeam2, defIdx2, defName2] = defenderInfo;
        const defender2 = this.getTeam(defTeam2)[defIdx2];
        if (defender2.hasInfernalRetaliation && defender2.isAlive()) {
          const attackerForRet = this.getTeam(attackerTeam)[attackerIdx];
          if (attackerForRet.isAlive()) {
            const retDied = attackerForRet.loseLife();
            this.hitThisRound.add(attackerName);
            this.log(`  → ${defName2}'s infernal defense burns ${attackerName}! (${attackerForRet.currentLives}/${attackerForRet.maxLives})`);
            this.addLog({ type: 'hit', text: `${defName2}'s infernal defense burns ${attackerName}! (${attackerForRet.currentLives}/${attackerForRet.maxLives})`, characterName: attackerName });
            if (retDied) {
              this.log(`  ★ ${attackerName} is defeated!`);
              this.addLog({ type: 'death', text: `${attackerName} is defeated!`, characterName: attackerName });
            }
          }
        }
      }

      // CursedWard: if an attack misses against this defender, attacker gets V-3 next turn
      if (defenderInfo) {
        const [defTeamCW, defIdxCW, defNameCW] = defenderInfo;
        const defenderCW = this.getTeam(defTeamCW)[defIdxCW];
        if (defenderCW.hasCursedWard && defenderCW.isAlive()) {
          const attackerForCW = this.getTeam(attackerTeam)[attackerIdx];
          if (attackerForCW.isAlive()) {
            attackerForCW.modifiers.push(
              new CombatModifier('speed', -3, ModifierDuration.NextNTurns(1)).withSource('Barrera arcana'),
            );
            this.log(`  → ${defNameCW}'s cursed ward slows ${attackerName}! V-3 next turn.`);
            this.addLog({ type: 'effect', text: `La barrera arcana de ${defNameCW} alenteix ${attackerName}! {V}-3 el pròxim torn.`, characterName: attackerName });
          }
        }
      }

      // SpellAbsorption: if a magic attack misses against this defender, M+2 self and M-2 attacker next turn
      if (defenderInfo) {
        const [defTeamSA, defIdxSA, defNameSA] = defenderInfo;
        const defenderSA = this.getTeam(defTeamSA)[defIdxSA];
        if (defenderSA.hasSpellAbsorption && !isPhysical(card.cardType) && defenderSA.isAlive()) {
          defenderSA.modifiers.push(
            new CombatModifier('magic', 2, ModifierDuration.NextNTurns(1)).withSource('Absorció màgica'),
          );
          this.log(`  → ${defNameSA} absorbs magical energy! M+2 next turn.`);
          this.addLog({ type: 'effect', text: `${defNameSA} absorbeix energia màgica! M+2 el pròxim torn.`, characterName: defNameSA });

          const attackerForAbs = this.getTeam(attackerTeam)[attackerIdx];
          if (attackerForAbs.isAlive()) {
            attackerForAbs.modifiers.push(
              new CombatModifier('magic', -2, ModifierDuration.NextNTurns(1)).withSource('Absorció màgica'),
            );
            this.log(`  → ${attackerName} is drained! M-2 next turn.`);
            this.addLog({ type: 'effect', text: `${attackerName} perd energia! M-2 el pròxim torn.`, characterName: attackerName });
          }
        }
      }

      // DivineBulwark: on miss, defended ally gains +1D RestOfCombat
      if (defenderInfo) {
        const [defTeamDB, defIdxDB, defNameDB] = defenderInfo;
        const defenderDB = this.getTeam(defTeamDB)[defIdxDB];
        if (defenderDB.hasDivineBulwark && defenderDB.isAlive()) {
          const originalTarget = this.getTeam(targetTeam)[tIdx];
          if (originalTarget.isAlive()) {
            originalTarget.modifiers.push(
              new CombatModifier('defense', 1, ModifierDuration.RestOfCombat).withSource('Escut de fe'),
            );
            this.log(`  → ${defNameDB}'s divine shield strengthens ${originalTarget.name}! +1 defense for rest of combat.`);
            this.addLog({ type: 'effect', text: `${originalTarget.name} gains +1D from Escut de fe!`, characterName: originalTarget.name });
          }
        }
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
            new CombatModifier('speed', -3, ModifierDuration.NextNTurns(1)).withSource('Clon de fum'),
          );
          this.log(`  → ${attackerName} is thrown off balance by ${defName}! V-3 next turn.`);
          this.addLog({ type: 'effect', text: `${attackerName} gets V-3 next turn from Clon de fum!`, characterName: attackerName });
        }

        // Shroud debuff: attacker gets F-2 next turn
        if (defender.hasShroudDebuff) {
          const attackerMut = this.getTeam(attackerTeam)[attackerIdx];
          attackerMut.modifiers.push(
            new CombatModifier('strength', -2, ModifierDuration.NextNTurns(1)).withSource('Mantell diví'),
          );
          this.log(`  → ${attackerName} is weakened by ${defName}'s shroud! F-2 next turn.`);
          this.addLog({ type: 'effect', text: `${attackerName} gets F-2 next turn from Mantell diví!`, characterName: attackerName });
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

    // Counterspell: only cancels magic attacks and focus cards (not physical attacks or defense)
    if (character.counterspelled) {
      if (card.cardType === CardType.MagicAttack || isFocus(card.cardType)) {
        this.recordInterrupted(cardName, cardTypeS);
        this.log(`  → ${charName} has been counterspelled! Card has no effect.`);
        this.addLog({ type: 'effect', text: `${charName} ha sigut contrarestat! La carta no té efecte.`, characterName: charName });
        return;
      }
      // Physical attacks and defense cards are not affected by counterspell
      this.log(`  → ${charName} was counterspelled but plays a non-magical card — not affected!`);
      this.addLog({ type: 'effect', text: `${charName} ha sigut contrarestat però la seva carta no és màgica!`, characterName: charName });
    }

    if (isFocus(card.cardType)) {
      const focusChar = this.getTeam(charTeam)[charIdx];
      // SilenceStrike: silenced characters have focus auto-interrupted
      if (focusChar.silencedTurns > 0) {
        focusChar.focusInterrupted = true;
        this.log(`  → ${charName} is silenced! Focus is automatically interrupted.`);
        this.addLog({ type: 'effect', text: `${charName} is silenced — focus interrupted!`, characterName: charName });
      }
      if (focusChar.focusInterrupted) {
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
      } else if (card.effect.type === 'ArcaneMark' && card.effect.count && card.effect.count > 1) {
        if (overrides?.attackTargets && overrides.attackTargets.length > 0) {
          targets = overrides.attackTargets.map(t => t[1]);
        } else {
          const enemies = this.getLivingEnemies(charTeam);
          targets = enemies.slice(0, card.effect.count);
        }
      } else if (card.effect.type === 'Overcharge') {
        // Overcharge: attack ALL living enemies (allies handled separately below)
        targets = this.getLivingEnemies(charTeam);
      } else if (overrides?.attackTarget && overrides.attackTarget[0] === eTeam) {
        targets = [overrides.attackTarget[1]];
      } else {
        const result = this.selectTarget(this.getTeam(charTeam)[charIdx]);
        targets = result ? [result[1]] : [];
      }

      const hitDefenders = new Set<string>();
      for (const ti of targets) {
        hitDefenders.add(`${eTeam}-${ti}`);

        // FlurryOfBlows: attack the same target twice
        const attackCount = card.effect.type === 'FlurryOfBlows' ? 2 : 1;
        for (let atkNum = 0; atkNum < attackCount; atkNum++) {
          if (attackCount > 1 && atkNum > 0) {
            const flurryTarget = this.getTeam(eTeam)[ti];
            if (!flurryTarget.isAlive()) break;
            this.log(`  → Flurry of Blows — second attack!`);
            this.addLog({ type: 'effect', text: `${charName} attacks again!`, characterName: charName });
          }

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
              new CombatModifier('strength', -card.effect.strengthDebuff, ModifierDuration.NextNTurns(1)).withSource(card.name),
            );
            target.modifiers.push(
              new CombatModifier('magic', -card.effect.magicDebuff, ModifierDuration.NextNTurns(1)).withSource(card.name),
            );
            this.log(`  → ${target.name} gets F-${card.effect.strengthDebuff} and M-${card.effect.magicDebuff} next turn!`);
            this.addLog({ type: 'effect', text: `${target.name} gets F-${card.effect.strengthDebuff} and M-${card.effect.magicDebuff} next turn!`, characterName: target.name });
          }
        }

        // Dissonance: on hit, ALL living enemies get -1 to all stats next turn
        if (hit && card.effect.type === 'Dissonance') {
          const enemies = this.getLivingEnemies(charTeam);
          const enemyTeam = this.getEnemyTeam(charTeam);
          for (const idx of enemies) {
            for (const stat of ['strength', 'magic', 'defense', 'speed'] as const) {
              enemyTeam[idx].modifiers.push(
                new CombatModifier(stat, -1, ModifierDuration.NextNTurns(1)).withSource(card.name),
              );
            }
          }
          this.log(`  → Dissonant chord! All enemies get -1 to all stats next turn!`);
          this.addLog({ type: 'effect', text: `All enemies get -1 to all stats next turn!`, characterName: charName });
        }

        // SwiftStrike: on hit, attacker gets F+2 next turn
        if (hit && card.effect.type === 'SwiftStrike') {
          const attacker = this.getTeam(charTeam)[charIdx];
          if (attacker.isAlive()) {
            attacker.modifiers.push(
              new CombatModifier('strength', 2, ModifierDuration.NextNTurns(1)).withSource(card.name),
            );
            this.log(`  → ${charName} gains +2 strength next turn!`);
            this.addLog({ type: 'effect', text: `${charName} gains +2 strength next turn!`, characterName: charName });
          }
        }

        // SilenceStrike: on hit, target's focus is auto-interrupted for 2 turns
        if (hit && card.effect.type === 'SilenceStrike') {
          const target = this.getTeam(eTeam)[ti];
          if (target.isAlive()) {
            target.silencedTurns = 2;
            this.log(`  → ${target.name} is silenced for 2 turns! Focus cards will be interrupted.`);
            this.addLog({ type: 'effect', text: `${target.name} is silenced for 2 turns!`, characterName: target.name });
          }
        }

        // HypnoticSong: roll dice, if above threshold target plays random cards
        if (card.effect.type === 'HypnoticSong') {
          const target = this.getTeam(eTeam)[ti];
          if (target.isAlive()) {
            const roll = card.effect.dice.roll();
            if (roll > card.effect.threshold) {
              target.forceRandomCardTurns = card.effect.turns;
              this.log(`  → Hypnotic song roll: ${roll} > ${card.effect.threshold} — ${target.name} is hypnotized for ${card.effect.turns} turns!`);
              this.addLog({ type: 'effect', text: `Cançó hipnòtica (${roll} > ${card.effect.threshold}): ${target.name} hipnotitzat ${card.effect.turns} torns!`, characterName: target.name });
            } else {
              this.log(`  → Hypnotic song roll: ${roll} ≤ ${card.effect.threshold} — ${target.name} resists!`);
              this.addLog({ type: 'effect', text: `Cançó hipnòtica (${roll} ≤ ${card.effect.threshold}): ${target.name} resisteix!`, characterName: target.name });
            }
          }
        }

        // ArcaneMark: mark target regardless of hit
        if (card.effect?.type === 'ArcaneMark') {
          const target = this.getTeam(eTeam)[ti];
          if (target.isAlive()) {
            target.arcaneMarkCount++;
            this.log(`  → ${target.name} is marked with an arcane mark! (${target.arcaneMarkCount} marks)`);
            this.addLog({ type: 'effect', text: `${target.name} rep una marca arcana! (${target.arcaneMarkCount})`, characterName: target.name });
          }
        }

        // SpellLeech: on hit, steal a random modifier from target
        if (hit && card.effect.type === 'SpellLeech') {
          const target = this.getTeam(eTeam)[ti];
          const attacker = this.getTeam(charTeam)[charIdx];
          if (target.isAlive() && attacker.isAlive()) {
            if (target.modifiers.length > 0) {
              const stolen = target.modifiers[Math.floor(Math.random() * target.modifiers.length)];
              target.modifiers = target.modifiers.filter(m => m !== stolen);
              attacker.modifiers.push(stolen);
              this.log(`  → ${charName} steals a modifier from ${target.name}! (${stolen.stat} ${stolen.getValue() > 0 ? '+' : ''}${stolen.getValue()})`);
              this.addLog({ type: 'effect', text: `${charName} roba ${stolen.stat} ${stolen.getValue() > 0 ? '+' : ''}${stolen.getValue()} de ${target.name}!`, characterName: charName });
            } else {
              this.log(`  → ${charName} tries to steal but ${target.name} has no modifiers.`);
              this.addLog({ type: 'effect', text: `${charName} intenta robar però ${target.name} no té modificadors.`, characterName: charName });
            }
          }
        }

        } // end FlurryOfBlows attack loop
      }

      // Overcharge: attack allies with reduced dice (1d6-1), then self-wound
      if (card.effect.type === 'Overcharge') {
        const allyTargets = this.getLivingAllies(charTeam, charIdx);
        const allyCard = Object.create(card) as Card;
        allyCard.magicAttack = new DiceRoll(1, 6, -2);
        for (const ai of allyTargets) {
          this.resolveAttack(charTeam, charIdx, charTeam, ai, allyCard, new Set());
        }
        const attacker = this.getTeam(charTeam)[charIdx];
        if (attacker.isAlive()) {
          const died = attacker.loseLife();
          this.hitThisRound.add(charName);
          this.log(`  → ${charName} takes a self-wound from Overcharge! (${attacker.currentLives}/${attacker.maxLives})`);
          this.addLog({ type: 'hit', text: `${charName} takes a self-wound from Overcharge! (${attacker.currentLives}/${attacker.maxLives})`, characterName: charName });
          if (died) {
            this.log(`  ★ ${charName} is defeated by Overcharge!`);
            this.addLog({ type: 'death', text: `${charName} is defeated by Overcharge!`, characterName: charName });
          }
        }
      }

      // FireAndRetreat: attacker dodges after attacking
      if (card.effect.type === 'FireAndRetreat') {
        const attacker = this.getTeam(charTeam)[charIdx];
        if (attacker.isAlive()) {
          attacker.dodging = true;
          this.log(`  → ${charName} retreats after attacking — dodging!`);
          this.addLog({ type: 'effect', text: `${charName} retreats — dodging!`, characterName: charName });
        }
      }

      // ActionSurge: after primary attack, make a second attack against a random living enemy
      if (card.effect.type === 'ActionSurge') {
        const attacker = this.getTeam(charTeam)[charIdx];
        if (attacker.isAlive()) {
          const livingEnemies = this.getLivingEnemies(charTeam);
          if (livingEnemies.length > 0) {
            const randomIdx = livingEnemies[Math.floor(Math.random() * livingEnemies.length)];
            this.log(`  → Action Surge! ${charName} attacks again!`);
            this.addLog({ type: 'effect', text: `${charName} fa un segon atac!`, characterName: charName });

            // Build a temporary card-like context for the second attack using the same dice
            const secondAttackStat = attacker.getEffectiveStrength();
            const secondDiceRoll = card.effect.secondAttackDice.roll();
            const secondTotal = secondAttackStat + secondDiceRoll;
            const secondTarget = this.getTeam(eTeam)[randomIdx];
            const secondTargetDef = secondTarget.getEffectiveDefense();

            this.addLog({ type: 'attack', text: `F ${secondAttackStat} + ${card.effect.secondAttackDice}(${secondDiceRoll}) = ${secondTotal} vs D ${secondTargetDef}`, characterName: charName });

            if (secondTotal > secondTargetDef && secondTarget.isAlive()) {
              this.checkFocusInterruption(eTeam, randomIdx);
              const died = secondTarget.loseLife();
              this.hitThisRound.add(secondTarget.name);
              this.log(`  → HIT! ${secondTarget.name} loses a life! (${secondTarget.currentLives}/${secondTarget.maxLives})`);
              this.addLog({ type: 'hit', text: `${secondTarget.name} loses a life! (${secondTarget.currentLives}/${secondTarget.maxLives})`, characterName: secondTarget.name });
              if (died) {
                this.log(`  ★ ${secondTarget.name} is defeated!`);
                this.addLog({ type: 'death', text: `${secondTarget.name} is defeated!`, characterName: secondTarget.name });
              }
            } else {
              this.log(`  → MISS! Second attack blocked by ${secondTarget.name}.`);
              this.addLog({ type: 'miss', text: `${charName}'s second attack is blocked by ${secondTarget.name}!`, characterName: charName });
            }
          }
        }
      }

      // Handle Reckless Attack
      if (card.effect.type === 'RecklessAttack') {
        const attacker = this.getTeam(charTeam)[charIdx];
        const defRed = card.effect.defenseReduction;
        attacker.modifiers.push(
          new CombatModifier('defense', -defRed, { remaining: 1, pending: false }).withSource(card.name),
        );
        this.log(`  → ${charName} gets -${defRed} defense this and next turn!`);
        this.addLog({ type: 'effect', text: `${charName} gets -${defRed} defense this and next turn!`, characterName: charName });
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

      if (card.defense) {
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
          ch.berserkerStrengthBoost = card.effect.strengthBoost;
          ch.berserkerSpeedBoost = card.effect.speedBoost ?? 0;
        }
        if (card.effect.type === 'Deflection') {
          const ch = this.getTeam(charTeam)[charIdx];
          ch.hasDeflection = true;
          ch.deflectionCounterDice = card.effect.counterAttackDice;
        }
        if (card.effect.type === 'MagicDeflection') {
          const ch = this.getTeam(charTeam)[charIdx];
          ch.hasMagicDeflection = true;
          ch.magicDeflectionCounterDice = card.effect.counterAttackDice;
        }
        if (card.effect.type === 'InfernalRetaliation') {
          this.getTeam(charTeam)[charIdx].hasInfernalRetaliation = true;
        }
        if (card.effect.type === 'CursedWard') {
          this.getTeam(charTeam)[charIdx].hasCursedWard = true;
        }
        if (card.effect.type === 'SpellAbsorption') {
          this.getTeam(charTeam)[charIdx].hasSpellAbsorption = true;
        }
        if (card.effect.type === 'DivineBulwark') {
          this.getTeam(charTeam)[charIdx].hasDivineBulwark = true;
        }
      }
    }

    // Handle focus cards
    if (isFocus(card.cardType)) {
      switch (card.effect.type) {
        case 'IntimidatingRoar': {
          const roarer = this.getTeam(charTeam)[charIdx];
          const roarerF = roarer.getEffectiveStrength();
          const enemies = this.getLivingEnemies(charTeam);
          const enemyTeam = this.getEnemyTeam(charTeam);
          for (const idx of enemies) {
            const enemy = enemyTeam[idx];
            const enemyFM = enemy.getEffectiveStrength() + enemy.getEffectiveMagic();
            const roll = card.effect.dice.roll();
            const attackTotal = roarerF + roll;
            const resistTotal = enemyFM + card.effect.threshold;
            if (attackTotal > resistTotal) {
              enemy.stunned = true;
              this.log(`  → ${enemy.name}: F${roarerF}+${roll}=${attackTotal} > ${enemyFM}+${card.effect.threshold}=${resistTotal} — stunned!`);
              this.addLog({ type: 'effect', text: `${enemy.name}: ${attackTotal} vs ${resistTotal} — stunned!`, characterName: enemy.name });
            } else {
              this.log(`  → ${enemy.name}: F${roarerF}+${roll}=${attackTotal} ≤ ${enemyFM}+${card.effect.threshold}=${resistTotal} — resists!`);
              this.addLog({ type: 'effect', text: `${enemy.name}: ${attackTotal} vs ${resistTotal} — resists!`, characterName: enemy.name });
            }
          }
          break;
        }
        case 'DodgeWithSpeedBoost': {
          const ch = this.getTeam(charTeam)[charIdx];
          ch.dodging = true;
          ch.modifiers.push(new CombatModifier('speed', 5, ModifierDuration.NextNTurns(1)).withSource(card.name));
          ch.modifiers.push(new CombatModifier('strength', 4, ModifierDuration.NextNTurns(1)).withSource(card.name));
          this.log(`  → ${charName} will dodge all attacks this turn, +5 speed and +4 strength next turn!`);
          this.addLog({ type: 'effect', text: `${charName} dodges all attacks, +5 speed and +4 strength next turn!`, characterName: charName });
          break;
        }
        case 'WindStance': {
          const ch = this.getTeam(charTeam)[charIdx];
          ch.dodging = true;
          ch.modifiers.push(new CombatModifier('strength', card.effect.strengthBoost, ModifierDuration.NextNTurns(1)).withSource(card.name));
          this.log(`  → ${charName} enters a wind stance! Dodges all attacks, +${card.effect.strengthBoost} strength next turn!`);
          this.addLog({ type: 'effect', text: `${charName} adopta la postura del vent! Esquiva tots els atacs, +${card.effect.strengthBoost} força el torn següent!`, characterName: charName });
          break;
        }
        case 'ArcaneTeleport': {
          const ch = this.getTeam(charTeam)[charIdx];
          ch.dodging = true;
          ch.modifiers.push(new CombatModifier('magic', card.effect.magicBoost, ModifierDuration.NextNTurns(1)).withSource(card.name));
          this.log(`  → ${charName} teleports! Dodges all attacks, +${card.effect.magicBoost} magic next turn!`);
          this.addLog({ type: 'effect', text: `${charName} es teletransporta! Esquiva tots els atacs, +${card.effect.magicBoost} màgia el torn següent!`, characterName: charName });
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
          // D+dice for self and all allies for rest of combat
          character.modifiers.push(
            new CombatModifier('defense', 0, ModifierDuration.RestOfCombat)
              .withDice(card.effect.dice)
              .withSource(card.name),
          );
          const allies = this.getLivingAllies(charTeam, charIdx);
          const allyTeam = this.getTeam(charTeam);
          for (const idx of allies) {
            allyTeam[idx].modifiers.push(
              new CombatModifier('defense', 0, ModifierDuration.RestOfCombat)
                .withDice(card.effect.dice)
                .withSource(card.name),
            );
          }
          this.log(`  → ${charName} and all allies gain +${card.effect.dice} defense for rest of combat!`);
          this.addLog({ type: 'effect', text: `${charName} and allies gain +${card.effect.dice} defense!`, characterName: charName });
          break;
        }
        case 'HealAlly': {
          const healOverrides = this.resolveTargets.get(charName);
          const allyTeam = this.getTeam(charTeam);
          let healIdx: number | null = null;
          if (healOverrides?.allyTarget && healOverrides.allyTarget[0] === charTeam) {
            healIdx = healOverrides.allyTarget[1];
          } else {
            // AI: prefer defeated allies (recuperation), then most hurt living ally
            const defeated = this.getDefeatedAllies(charTeam);
            if (defeated.length > 0) {
              healIdx = defeated[0];
            } else {
              const allies = this.getLivingAllies(charTeam);
              const hurt = allies.filter(i => allyTeam[i].currentLives < allyTeam[i].maxLives);
              if (hurt.length > 0) {
                healIdx = hurt.reduce((b, i) =>
                  allyTeam[i].currentLives < allyTeam[b].currentLives ? i : b, hurt[0]);
              }
            }
          }
          if (healIdx !== null && allyTeam[healIdx].currentLives < allyTeam[healIdx].maxLives) {
            const wasDefeated = allyTeam[healIdx].currentLives === 0;
            const healAmount = Math.min(card.effect.amount, allyTeam[healIdx].maxLives - allyTeam[healIdx].currentLives);
            allyTeam[healIdx].currentLives += healAmount;
            const tName = allyTeam[healIdx].name;
            if (wasDefeated) {
              this.log(`  → ${charName} recuperates ${tName}! (${allyTeam[healIdx].currentLives}/${allyTeam[healIdx].maxLives})`);
              this.addLog({ type: 'effect', text: `${charName} recupera ${tName}! (${allyTeam[healIdx].currentLives}/${allyTeam[healIdx].maxLives})`, characterName: charName });
            } else {
              this.log(`  → ${charName} heals ${tName} for ${healAmount} life/lives! (${allyTeam[healIdx].currentLives}/${allyTeam[healIdx].maxLives})`);
              this.addLog({ type: 'effect', text: `${charName} heals ${tName} for ${healAmount} life/lives! (${allyTeam[healIdx].currentLives}/${allyTeam[healIdx].maxLives})`, characterName: charName });
            }
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
        case 'NimbleEscape': {
          const ch = this.getTeam(charTeam)[charIdx];
          ch.dodging = true;
          this.log(`  → ${charName} hides! Dodges all attacks this turn.`);
          this.addLog({ type: 'effect', text: `${charName} s'amaga! Esquiva tots els atacs.`, characterName: charName });
          break;
        }
        case 'MeditationBoost': {
          const ch = this.getTeam(charTeam)[charIdx];
          const defDiceRoll = card.effect.defenseDice.roll();
          const totalDefBoost = card.effect.defenseFlat + defDiceRoll;
          ch.modifiers.push(
            new CombatModifier('defense', totalDefBoost, ModifierDuration.RestOfCombat).withSource(card.name),
          );
          ch.modifiers.push(
            new CombatModifier('speed', card.effect.speedBoost, ModifierDuration.RestOfCombat).withSource(card.name),
          );
          this.log(`  → ${charName} meditates! Gains +${totalDefBoost} Defense and +${card.effect.speedBoost} Speed for rest of combat!`);
          this.addLog({ type: 'effect', text: `${charName} gains +${totalDefBoost} Defense and +${card.effect.speedBoost} Speed for rest of combat!`, characterName: charName });
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
        case 'LingeringFire': {
          const lfOverrides = this.resolveTargets.get(charName);
          const enemies = this.getLivingEnemies(charTeam);
          let lfTargetIdx: number | null = null;
          if (lfOverrides?.attackTarget) {
            lfTargetIdx = lfOverrides.attackTarget[1];
          } else if (enemies.length > 0) {
            lfTargetIdx = enemies[0];
          }
          if (lfTargetIdx !== null) {
            const enemyTeam = this.getEnemyTeam(charTeam);
            const tName = enemyTeam[lfTargetIdx].name;
            enemyTeam[lfTargetIdx].pendingLingeringFireDamage++;
            this.log(`  → ${tName} is set ablaze! Will lose a life at start of next round.`);
            this.addLog({ type: 'effect', text: `${tName} is set ablaze!`, characterName: tName });
          }
          break;
        }
        case 'TerrorAura': {
          const enemies = this.getLivingEnemies(charTeam);
          const enemyTeam = this.getEnemyTeam(charTeam);
          for (const idx of enemies) {
            for (const stat of ['strength', 'magic', 'defense', 'speed'] as const) {
              enemyTeam[idx].modifiers.push(
                new CombatModifier(stat, -card.effect.statReduction, { remaining: 1, pending: false }).withSource(card.name),
              );
            }
            this.log(`  → ${enemyTeam[idx].name} is terrified! All stats -${card.effect.statReduction} for 2 turns!`);
            this.addLog({ type: 'effect', text: `${enemyTeam[idx].name} is terrified! All stats -${card.effect.statReduction}!`, characterName: enemyTeam[idx].name });
          }
          break;
        }
        case 'DoomMark': {
          const dmOverrides = this.resolveTargets.get(charName);
          const enemies = this.getLivingEnemies(charTeam);
          let dmTargetIdx: number | null = null;
          if (dmOverrides?.attackTarget) {
            dmTargetIdx = dmOverrides.attackTarget[1];
          } else if (enemies.length > 0) {
            dmTargetIdx = enemies[0];
          }
          if (dmTargetIdx !== null) {
            const enemyTeam = this.getEnemyTeam(charTeam);
            const tName = enemyTeam[dmTargetIdx].name;
            enemyTeam[dmTargetIdx].doomMarked = true;
            this.log(`  → ${tName} is marked for doom! Next hit costs an extra life.`);
            this.addLog({ type: 'effect', text: `${tName} is marked for doom!`, characterName: tName });
          }
          break;
        }
        case 'BloodContract': {
          const bcOverrides = this.resolveTargets.get(charName);
          const enemies = this.getLivingEnemies(charTeam);
          let bcTargetIdx: number | null = null;
          if (bcOverrides?.attackTarget) {
            bcTargetIdx = bcOverrides.attackTarget[1];
          } else if (enemies.length > 0) {
            bcTargetIdx = enemies[0];
          }
          if (bcTargetIdx !== null) {
            const enemyTeam = this.getEnemyTeam(charTeam);
            const tName = enemyTeam[bcTargetIdx].name;
            enemyTeam[bcTargetIdx].bloodContractTeam = charTeam;
            enemyTeam[bcTargetIdx].bloodContractSource = charName;
            this.log(`  → ${tName} is bound by blood contract! Attacks against ${charName}'s team cost a life.`);
            this.addLog({ type: 'effect', text: `${tName} is bound by blood contract!`, characterName: tName });
          }
          break;
        }
        case 'FuryScaling': {
          const ch = this.getTeam(charTeam)[charIdx];
          const livesLost = ch.maxLives - ch.currentLives;
          if (livesLost > 0) {
            ch.modifiers.push(
              new CombatModifier('strength', livesLost, ModifierDuration.RestOfCombat).withSource(card.name),
            );
            this.log(`  → ${charName}'s fury grows! +${livesLost} strength for rest of combat!`);
            this.addLog({ type: 'effect', text: `${charName}'s fury grows! +${livesLost} strength!`, characterName: charName });
          } else {
            this.log(`  → ${charName} tries to channel fury but is uninjured.`);
            this.addLog({ type: 'effect', text: `${charName} channels fury but is uninjured.`, characterName: charName });
          }
          break;
        }
        case 'VoiceOfValor': {
          const vovOverrides = this.resolveTargets.get(charName);
          const allyTeam = this.getTeam(charTeam);
          let vovIdx: number | null = null;
          if (vovOverrides?.allyTarget && vovOverrides.allyTarget[0] === charTeam) {
            vovIdx = vovOverrides.allyTarget[1];
          } else {
            // AI: prefer defeated allies (recuperation), then most hurt living ally, then self
            const defeated = this.getDefeatedAllies(charTeam);
            if (defeated.length > 0) {
              vovIdx = defeated[0];
            } else {
              const allies = this.getLivingAllies(charTeam);
              const hurt = allies.filter(i => allyTeam[i].currentLives < allyTeam[i].maxLives);
              if (hurt.length > 0) {
                vovIdx = hurt.reduce((b, i) =>
                  allyTeam[i].currentLives < allyTeam[b].currentLives ? i : b, hurt[0]);
              } else {
                // No wounded allies — check self
                if (character.currentLives < character.maxLives) {
                  vovIdx = charIdx;
                }
              }
            }
          }
          if (vovIdx !== null && allyTeam[vovIdx].currentLives < allyTeam[vovIdx].maxLives) {
            const wasDefeated = allyTeam[vovIdx].currentLives === 0;
            const target = allyTeam[vovIdx];
            target.currentLives++;
            target.modifiers.push(
              new CombatModifier('strength', 2, ModifierDuration.RestOfCombat).withSource(card.name),
            );
            target.modifiers.push(
              new CombatModifier('magic', 2, ModifierDuration.RestOfCombat).withSource(card.name),
            );
            const tName = target.name;
            if (wasDefeated) {
              this.log(`  → ${charName} sings the Voice of Valor and recuperates ${tName}! +2F/+2M for rest of combat! (${target.currentLives}/${target.maxLives})`);
              this.addLog({ type: 'effect', text: `${charName} inspira i recupera ${tName}! +2F/+2M per la resta del combat! (${target.currentLives}/${target.maxLives})`, characterName: charName });
            } else {
              this.log(`  → ${charName} sings the Voice of Valor for ${tName}! Heals 1 life and gains +2F/+2M for rest of combat! (${target.currentLives}/${target.maxLives})`);
              this.addLog({ type: 'effect', text: `${charName} inspires ${tName}! Heals 1 life, +2F/+2M for rest of combat! (${target.currentLives}/${target.maxLives})`, characterName: charName });
            }
          } else {
            this.log(`  → ${charName} sings the Voice of Valor but no one is wounded.`);
            this.addLog({ type: 'effect', text: `${charName} sings but no one is wounded.`, characterName: charName });
          }
          break;
        }
        case 'Counterspell': {
          const csOverrides = this.resolveTargets.get(charName);
          const csEnemies = this.getLivingEnemies(charTeam);
          let csTargetIdx: number | null = null;
          if (csOverrides?.attackTarget) {
            csTargetIdx = csOverrides.attackTarget[1];
          } else if (csEnemies.length > 0) {
            csTargetIdx = csEnemies[0];
          }
          if (csTargetIdx !== null) {
            const enemyTeam = this.getEnemyTeam(charTeam);
            const csTarget = enemyTeam[csTargetIdx];
            if (csTarget.isAlive()) {
              csTarget.counterspelled = true;
              const tName = csTarget.name;
              this.log(`  → ${charName} counterspells ${tName}! Their card is cancelled!`);
              this.addLog({ type: 'effect', text: `${charName} contrarresta ${tName}! La seva carta s'anul·la!`, characterName: charName });
            }
          }
          break;
        }
        case 'Charm': {
          const charmOverrides = this.resolveTargets.get(charName);
          const enemies = this.getLivingEnemies(charTeam);
          let charmTargetIdx: number | null = null;
          if (charmOverrides?.attackTarget) {
            charmTargetIdx = charmOverrides.attackTarget[1];
          } else if (enemies.length > 0) {
            charmTargetIdx = enemies[0];
          }
          if (charmTargetIdx !== null) {
            const enemyTeam = this.getEnemyTeam(charTeam);
            const charmTarget = enemyTeam[charmTargetIdx];
            if (charmTarget.isAlive()) {
              // Charm: target skips their NEXT turn and wounds an ally when confused
              charmTarget.skipTurns = 1;
              charmTarget.charmedConfusion = true;
              const tName = charmTarget.name;
              this.log(`  → ${charName} charms ${tName}! Their next turn will be cancelled!`);
              this.addLog({ type: 'effect', text: `${charName} encisa ${tName}! El seu següent torn serà cancel·lat!`, characterName: charName });
            }
          }
          break;
        }
        case 'BloodMagic': {
          const ch = this.getTeam(charTeam)[charIdx];
          // Sacrifice 1 life
          const bmDied = ch.loseLife();
          this.hitThisRound.add(charName);
          this.log(`  → ${charName} sacrifices blood! Loses 1 life. (${ch.currentLives}/${ch.maxLives})`);
          this.addLog({ type: 'hit', text: `${charName} sacrifices blood! (${ch.currentLives}/${ch.maxLives})`, characterName: charName });
          if (bmDied) {
            this.log(`  ★ ${charName} is defeated by Blood Magic!`);
            this.addLog({ type: 'death', text: `${charName} is defeated by Blood Magic!`, characterName: charName });
          } else {
            // Apply +3M and +2V for rest of combat
            ch.modifiers.push(
              new CombatModifier('magic', 3, ModifierDuration.RestOfCombat).withSource(card.name),
            );
            ch.modifiers.push(
              new CombatModifier('speed', 2, ModifierDuration.RestOfCombat).withSource(card.name),
            );
            this.log(`  → ${charName} gains +3 magic and +2 speed for rest of combat!`);
            this.addLog({ type: 'effect', text: `${charName} gains +3M/+2V for rest of combat!`, characterName: charName });
          }
          break;
        }
        case 'SecondWind': {
          const ch = this.getTeam(charTeam)[charIdx];
          if (ch.currentLives < ch.maxLives) {
            ch.currentLives = Math.min(ch.currentLives + card.effect.healAmount, ch.maxLives);
            this.log(`  → ${charName} recovers ${card.effect.healAmount} life! (${ch.currentLives}/${ch.maxLives})`);
            this.addLog({ type: 'effect', text: `${charName} recovers ${card.effect.healAmount} life! (${ch.currentLives}/${ch.maxLives})`, characterName: charName });
          }
          ch.modifiers.push(
            new CombatModifier('defense', card.effect.defenseBoost, ModifierDuration.ThisTurn).withSource(card.name),
          );
          this.log(`  → ${charName} gains +${card.effect.defenseBoost} defense this turn!`);
          this.addLog({ type: 'effect', text: `${charName} gains +${card.effect.defenseBoost} defense this turn!`, characterName: charName });
          break;
        }
        case 'LayOnHands': {
          const healOverrides = this.resolveTargets.get(charName);
          const allyTeam = this.getTeam(charTeam);
          let healIdx: number | null = null;
          if (healOverrides?.allyTarget && healOverrides.allyTarget[0] === charTeam) {
            healIdx = healOverrides.allyTarget[1];
          } else {
            // AI: prefer defeated allies (recuperation), then most hurt living ally (or self)
            const defeated = this.getDefeatedAllies(charTeam);
            if (defeated.length > 0) {
              healIdx = defeated[0];
            } else {
              const allies = this.getLivingAllies(charTeam);
              const allCandidates = [...allies, charIdx];
              const hurt = allCandidates.filter(i => allyTeam[i].currentLives < allyTeam[i].maxLives);
              if (hurt.length > 0) {
                healIdx = hurt.reduce((b, i) =>
                  allyTeam[i].currentLives < allyTeam[b].currentLives ? i : b, hurt[0]);
              }
            }
          }
          if (healIdx !== null && allyTeam[healIdx].currentLives < allyTeam[healIdx].maxLives) {
            const wasDefeated = allyTeam[healIdx].currentLives === 0;
            allyTeam[healIdx].currentLives++;
            const tName = allyTeam[healIdx].name;
            if (wasDefeated) {
              this.log(`  → ${charName} lays hands on ${tName} and recuperates them! (${allyTeam[healIdx].currentLives}/${allyTeam[healIdx].maxLives})`);
              this.addLog({ type: 'effect', text: `${charName} recupera ${tName}! (${allyTeam[healIdx].currentLives}/${allyTeam[healIdx].maxLives})`, characterName: charName });
            } else {
              this.log(`  → ${charName} lays hands on ${tName}! Healed to (${allyTeam[healIdx].currentLives}/${allyTeam[healIdx].maxLives})`);
              this.addLog({ type: 'effect', text: `${charName} heals ${tName}! (${allyTeam[healIdx].currentLives}/${allyTeam[healIdx].maxLives})`, characterName: charName });
            }

            // Cleanse negative modifiers and silence
            const target = allyTeam[healIdx];
            const beforeMods = target.modifiers.length;
            target.modifiers = target.modifiers.filter(m => m.getValue() >= 0);
            const removed = beforeMods - target.modifiers.length;
            if (target.silencedTurns > 0) {
              target.silencedTurns = 0;
              this.log(`  → ${tName} is cleansed of silence!`);
              this.addLog({ type: 'effect', text: `${tName} is cleansed of silence!`, characterName: tName });
            }
            if (removed > 0) {
              this.log(`  → ${tName} is cleansed of ${removed} negative effect(s)!`);
              this.addLog({ type: 'effect', text: `${tName} is cleansed of ${removed} negative effect(s)!`, characterName: tName });
            }
          } else {
            this.log(`  → ${charName} lays on hands but no one needs healing.`);
            this.addLog({ type: 'effect', text: `${charName} lays on hands but no one needs healing.`, characterName: charName });
          }
          break;
        }
        case 'WildShape': {
          const ch = this.getTeam(charTeam)[charIdx];
          // Apply strength and defense boosts for rest of combat
          ch.modifiers.push(
            new CombatModifier('strength', card.effect.strengthBoost, ModifierDuration.RestOfCombat).withSource(card.name),
          );
          ch.modifiers.push(
            new CombatModifier('defense', card.effect.defenseBoost, ModifierDuration.RestOfCombat).withSource(card.name),
          );
          // Grant temporary lives
          ch.maxLives += card.effect.temporaryLives;
          ch.currentLives += card.effect.temporaryLives;
          ch.wildShapeLivesBonus = card.effect.temporaryLives;
          this.log(`  → ${charName} transforms into beast form! F+${card.effect.strengthBoost}, D+${card.effect.defenseBoost}, +${card.effect.temporaryLives} life! (${ch.currentLives}/${ch.maxLives})`);
          this.addLog({ type: 'effect', text: `${charName} transforms into beast form! F+${card.effect.strengthBoost}/D+${card.effect.defenseBoost}/+${card.effect.temporaryLives} PV! (${ch.currentLives}/${ch.maxLives})`, characterName: charName });
          break;
        }
        case 'Requiem': {
          const enemies = this.getLivingEnemies(charTeam);
          const enemyTeam = this.getEnemyTeam(charTeam);
          let woundCount = 0;
          for (const idx of enemies) {
            if (enemyTeam[idx].currentLives < enemyTeam[idx].maxLives) {
              const eName = enemyTeam[idx].name;
              const died = enemyTeam[idx].loseLife();
              woundCount++;
              this.log(`  → ${eName} hears the Requiem and loses a life! (${enemyTeam[idx].currentLives}/${enemyTeam[idx].maxLives})`);
              this.addLog({ type: 'hit', text: `${eName} hears the Requiem! (${enemyTeam[idx].currentLives}/${enemyTeam[idx].maxLives})`, characterName: eName });
              if (died) {
                this.log(`  ★ ${eName} is defeated!`);
                this.addLog({ type: 'death', text: `${eName} is defeated!`, characterName: eName });
              }
            }
          }
          if (woundCount === 0) {
            this.log(`  → ${charName} sings the Requiem but no enemies are wounded.`);
            this.addLog({ type: 'effect', text: `${charName} sings the Requiem but no enemies are wounded.`, characterName: charName });
          }
          break;
        }
        case 'ArcaneDetonation': {
          const enemies = this.getLivingEnemies(charTeam);
          const enemyTeam = this.getEnemyTeam(charTeam);
          let totalDetonations = 0;
          for (const idx of enemies) {
            const enemy = enemyTeam[idx];
            if (enemy.arcaneMarkCount > 0) {
              const marks = enemy.arcaneMarkCount;
              totalDetonations += marks;
              enemy.arcaneMarkCount = 0;
              for (let m = 0; m < marks; m++) {
                if (!enemy.isAlive()) break;
                const died = enemy.loseLife();
                this.hitThisRound.add(enemy.name);
                this.log(`  → ${enemy.name} takes detonation damage! (${enemy.currentLives}/${enemy.maxLives})`);
                this.addLog({ type: 'hit', text: `${enemy.name} rep dany de detonació! (${enemy.currentLives}/${enemy.maxLives})`, characterName: enemy.name });
                if (died) {
                  this.log(`  ★ ${enemy.name} is defeated by arcane detonation!`);
                  this.addLog({ type: 'death', text: `${enemy.name} is defeated by arcane detonation!`, characterName: enemy.name });
                }
              }
            }
          }
          if (totalDetonations === 0) {
            this.log(`  → ${charName} tries to detonate but no enemies have arcane marks.`);
            this.addLog({ type: 'effect', text: `${charName} intenta detonar però cap enemic té marques arcanes.`, characterName: charName });
          } else {
            this.log(`  → ${charName} detonates ${totalDetonations} arcane marks!`);
            this.addLog({ type: 'effect', text: `${charName} detona ${totalDetonations} marques arcanes!`, characterName: charName });
          }
          break;
        }
        case 'SummonAlly': {
          const summonEffect = card.effect as { type: 'SummonAlly'; templateId: string };
          const allyTeam = this.getTeam(charTeam);
          if (allyTeam.length >= 10) {
            this.log(`  → ${charName} howls but the pack is too large!`);
            this.addLog({ type: 'effect', text: `${charName} udola però la manada és massa gran!`, characterName: charName });
          } else {
            const template = ALL_CHARACTER_TEMPLATES.find(t => t.id === summonEffect.templateId);
            if (template) {
              const summonName = `${template.displayName} ${allyTeam.length + 1}`;
              const summoned = createCharacter(template, summonName);
              summoned.team = charTeam;
              summoned.resetForNewCombat();
              allyTeam.push(summoned);
              this.log(`  → ${charName} howls! A new ${template.displayName} joins the battle!`);
              this.addLog({ type: 'effect', text: `${charName} udola! Un nou ${template.displayName} s'uneix al combat!`, characterName: charName });
            }
          }
          break;
        }
        default:
          break;
      }

      // Set aside the focus card if it has a lasting effect
      if (character.playedCardIdx !== null) {
        const duration = getSetAsideDuration(card.effect);
        if (duration !== 0) {
          character.setAsideCards.set(character.playedCardIdx, duration);
        }
      }

      // Consume consumable cards after successful focus resolution
      if (card.isConsumable && !card.consumed) {
        card.consumed = true;
      }
    }

    // Handle CharacteristicModifier effects (card-type-agnostic — works on any card type)
    if (card.effect.type === 'CharacteristicModifier') {
      const eff = card.effect;

      // Determine target characters
      let targetChars: Character[] = [];
      switch (eff.target) {
        case 'self':
          targetChars = [character];
          break;
        case 'allies': {
          const allyIndices = this.getLivingAllies(charTeam, charIdx);
          targetChars = allyIndices.map(i => this.getTeam(charTeam)[i]);
          break;
        }
        case 'team': {
          const allyIndices = this.getLivingAllies(charTeam, charIdx);
          targetChars = [character, ...allyIndices.map(i => this.getTeam(charTeam)[i])];
          break;
        }
        case 'enemy': {
          const eTeam = charTeam === 1 ? 2 : 1;
          const overrides = this.resolveTargets.get(charName);
          let targetIdx: number | null = null;
          if (overrides?.attackTarget && overrides.attackTarget[0] === eTeam) {
            targetIdx = overrides.attackTarget[1];
          } else {
            const result = this.selectTarget(character);
            targetIdx = result ? result[1] : null;
          }
          if (targetIdx !== null) {
            const target = this.getTeam(eTeam)[targetIdx];
            if (target.isAlive()) targetChars = [target];
          }
          break;
        }
        case 'enemies': {
          const enemyIndices = this.getLivingEnemies(charTeam);
          const enemyTeam = this.getEnemyTeam(charTeam);
          targetChars = enemyIndices.map(i => enemyTeam[i]);
          break;
        }
      }

      // Apply each modifier to each target
      for (const target of targetChars) {
        for (const mod of eff.modifiers) {
          let value = mod.amount;
          if (mod.dice) {
            value += mod.dice.roll();
          }
          target.modifiers.push(
            new CombatModifier(mod.characteristic, value, eff.duration).withSource(card.name),
          );
          const sign = value >= 0 ? '+' : '';
          this.log(`  → ${target.name} gets ${sign}${value} ${mod.characteristic}!`);
          this.addLog({ type: 'effect', text: `${target.name} gets ${sign}${value} ${mod.characteristic}!`, characterName: target.name });
        }
      }

      // Set aside for non-focus cards with lasting effects (focus cards handled above)
      if (!isFocus(card.cardType) && character.playedCardIdx !== null) {
        const duration = getSetAsideDuration(card.effect);
        if (duration !== 0) {
          character.setAsideCards.set(character.playedCardIdx, duration);
        }
      }
    }

  }

  /** Post-resolution: count successful NimbleEscape users per team and apply F bonus */
  private resolveNimbleEscape(): void {
    for (const teamNum of [1, 2]) {
      const team = this.getTeam(teamNum);
      const hiders = team.filter(c =>
        c.isAlive() && c.playedCardIdx !== null &&
        isFocus(c.cards[c.playedCardIdx].cardType) &&
        c.cards[c.playedCardIdx].effect.type === 'NimbleEscape' &&
        !c.focusInterrupted,
      );
      if (hiders.length > 0) {
        for (const hider of hiders) {
          hider.modifiers.push(
            new CombatModifier('strength', hiders.length, ModifierDuration.NextNTurns(1))
              .withSource('Amagar-se'),
          );
        }
        this.log(`  → ${hiders.length} goblins hid — each gets +${hiders.length} strength next turn!`);
        this.addLog({
          type: 'effect',
          text: `${hiders.length} goblins s'amaguen — cadascun guanya +${hiders.length} F el proper torn!`,
          characterName: hiders[0].name,
        });
      }
    }
  }

  private resolveCharmedConfusion(team: Character[]): void {
    for (const ch of team) {
      if (!ch.charmedConfusion || !ch.isAlive()) continue;
      ch.charmedConfusion = false;
      // Find living allies (teammates other than the charmed character)
      const allies = team.filter(a => a !== ch && a.isAlive());
      if (allies.length === 0) continue;
      const victim = allies[Math.floor(Math.random() * allies.length)];
      const victimDied = victim.loseLife();
      this.log(`  → ${ch.name}, confused, wounds ${victim.name}! (${victim.currentLives}/${victim.maxLives})`);
      this.addLog({ type: 'hit', text: `${ch.name}, confós, fereix ${victim.name}! (${victim.currentLives}/${victim.maxLives})`, characterName: victim.name });
      if (victimDied) {
        this.log(`  ★ ${victim.name} is defeated!`);
        this.addLog({ type: 'death', text: `${victim.name} ha caigut!`, characterName: victim.name });
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
  prepareRound(): { skipping: Map<number, Set<number>>; forcedRandom: Map<number, Map<number, number>> } {
    this.roundNumber++;
    this.coordinatedAmbushTarget = null;
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

    // Process lingering fire damage at round start
    for (const ch of [...this.team1, ...this.team2]) {
      if (ch.pendingLingeringFireDamage > 0 && ch.isAlive()) {
        for (let i = 0; i < ch.pendingLingeringFireDamage; i++) {
          const died = ch.loseLife();
          this.addLog({ type: 'hit', text: `${ch.name} loses a life from fire! (${ch.currentLives}/${ch.maxLives})`, characterName: ch.name });
          if (died) {
            this.addLog({ type: 'death', text: `${ch.name} is defeated by fire!`, characterName: ch.name });
            break;
          }
        }
        ch.pendingLingeringFireDamage = 0;
      }
    }

    // Process charmed confusion at round start
    this.resolveCharmedConfusion(this.team1);
    this.resolveCharmedConfusion(this.team2);

    // Assign random cards for hypnotized characters
    const forcedRandom = new Map<number, Map<number, number>>();
    for (const [teamNum, team] of [[1, this.team1], [2, this.team2]] as const) {
      for (let idx = 0; idx < team.length; idx++) {
        if (!team[idx].isAlive() || team[idx].forceRandomCardTurns <= 0) continue;
        if (!forcedRandom.has(teamNum)) forcedRandom.set(teamNum, new Map());
        const cardIdx = this.selectRandomCard(team[idx]);
        forcedRandom.get(teamNum)!.set(idx, cardIdx);
        this.addLog({ type: 'effect', text: `${team[idx].name} està hipnotitzat i juga una carta aleatòria!`, characterName: team[idx].name });
      }
    }

    return { skipping, forcedRandom };
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

    // Post-resolution: NimbleEscape coordinated hiding bonus
    this.resolveNimbleEscape();

    // Death ward recovery
    for (const ch of [...this.team1, ...this.team2]) {
      if (ch.hasDeathWard && ch.isAlive() && this.hitThisRound.has(ch.name)) {
        ch.currentLives = Math.min(ch.maxLives, ch.currentLives + 1);
        ch.hasDeathWard = false;
        this.log(`  → ${ch.name}'s death ward recovers 1 life! (${ch.currentLives}/${ch.maxLives})`);
        this.addLog({ type: 'effect', text: `${ch.name}'s death ward recovers 1 life! (${ch.currentLives}/${ch.maxLives})`, characterName: ch.name });
      }
    }

    // Blood contract cleanup: clear contracts whose source is dead
    for (const ch of [...this.team1, ...this.team2]) {
      if (ch.bloodContractSource) {
        const sourceAlive = [...this.team1, ...this.team2].some(
          c => c.name === ch.bloodContractSource && c.isAlive(),
        );
        if (!sourceAlive) {
          ch.bloodContractTeam = 0;
          ch.bloodContractSource = '';
        }
      }
    }

    // End of round cleanup
    for (const ch of [...this.team1, ...this.team2]) {
      ch.advanceTurnModifiers();
      ch.stunned = false;
      if (ch.silencedTurns > 0) ch.silencedTurns--;
      if (ch.impaledTurns > 0) ch.impaledTurns--;
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
    // Post-resolution: NimbleEscape coordinated hiding bonus
    this.resolveNimbleEscape();

    // Death ward recovery
    for (const ch of [...this.team1, ...this.team2]) {
      if (ch.hasDeathWard && ch.isAlive() && this.hitThisRound.has(ch.name)) {
        ch.currentLives = Math.min(ch.maxLives, ch.currentLives + 1);
        ch.hasDeathWard = false;
        this.addLog({ type: 'effect', text: `${ch.name}'s death ward recovers 1 life! (${ch.currentLives}/${ch.maxLives})`, characterName: ch.name });
      }
    }

    // Blood contract cleanup: clear contracts whose source is dead
    for (const ch of [...this.team1, ...this.team2]) {
      if (ch.bloodContractSource) {
        const sourceAlive = [...this.team1, ...this.team2].some(
          c => c.name === ch.bloodContractSource && c.isAlive(),
        );
        if (!sourceAlive) {
          ch.bloodContractTeam = 0;
          ch.bloodContractSource = '';
        }
      }
    }

    for (const ch of [...this.team1, ...this.team2]) {
      ch.advanceTurnModifiers();
      ch.stunned = false;
      if (ch.silencedTurns > 0) ch.silencedTurns--;
      if (ch.impaledTurns > 0) ch.impaledTurns--;
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

    // Process lingering fire damage at round start
    for (const ch of [...this.team1, ...this.team2]) {
      if (ch.pendingLingeringFireDamage > 0 && ch.isAlive()) {
        for (let i = 0; i < ch.pendingLingeringFireDamage; i++) {
          const died = ch.loseLife();
          this.log(`  → ${ch.name} loses a life from fire! (${ch.currentLives}/${ch.maxLives})`);
          if (died) {
            this.log(`  ★ ${ch.name} is defeated by fire!`);
            break;
          }
        }
        ch.pendingLingeringFireDamage = 0;
      }
    }

    // Process charmed confusion at round start
    this.resolveCharmedConfusion(this.team1);
    this.resolveCharmedConfusion(this.team2);

    if (this.isCombatOver()) return false;

    // Card selection is simultaneous — no peeking at ally picks.
    // Collect selections first, then assign playedCardIdx after.
    const pendingSelections: [number, number, number][] = [];
    for (let idx = 0; idx < this.team1.length; idx++) {
      if (!this.team1[idx].isAlive() || team1Skipping.has(idx)) continue;
      const cardIdx = this.team1[idx].forceRandomCardTurns > 0
        ? this.selectRandomCard(this.team1[idx])
        : selectCardAI(this.team1[idx], this);
      pendingSelections.push([1, idx, cardIdx]);
    }
    for (let idx = 0; idx < this.team2.length; idx++) {
      if (!this.team2[idx].isAlive() || team2Skipping.has(idx)) continue;
      const cardIdx = this.team2[idx].forceRandomCardTurns > 0
        ? this.selectRandomCard(this.team2[idx])
        : selectCardAI(this.team2[idx], this);
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

    // Post-resolution: NimbleEscape coordinated hiding bonus
    this.resolveNimbleEscape();

    // Death ward recovery
    for (const ch of [...this.team1, ...this.team2]) {
      if (ch.hasDeathWard && ch.isAlive() && this.hitThisRound.has(ch.name)) {
        ch.currentLives = Math.min(ch.maxLives, ch.currentLives + 1);
        ch.hasDeathWard = false;
        this.log(`  → ${ch.name}'s death ward recovers 1 life! (${ch.currentLives}/${ch.maxLives})`);
      }
    }

    // Blood contract cleanup: clear contracts whose source is dead
    for (const ch of [...this.team1, ...this.team2]) {
      if (ch.bloodContractSource) {
        const sourceAlive = [...this.team1, ...this.team2].some(
          c => c.name === ch.bloodContractSource && c.isAlive(),
        );
        if (!sourceAlive) {
          ch.bloodContractTeam = 0;
          ch.bloodContractSource = '';
        }
      }
    }

    // End of round cleanup
    for (const ch of [...this.team1, ...this.team2]) {
      ch.advanceTurnModifiers();
      ch.stunned = false;
      if (ch.silencedTurns > 0) ch.silencedTurns--;
      if (ch.impaledTurns > 0) ch.impaledTurns--;
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
