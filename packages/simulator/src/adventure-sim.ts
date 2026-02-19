import {
  Character,
  CombatEngine,
  createBarbarian,
  createCleric,
  createWarlock,
  createBard,
  createMonk,
  createGoblin,
  createGoblinShaman,
  createBasilisk,
  createSpinedDevil,
  createBoneDevil,
  createHornedDevil,
  createStoneGolem,
  ALL_EQUIPMENT,
  EquipmentSlot,
} from '@pimpampum/engine';
import type { EquipmentTemplate } from '@pimpampum/engine';

// =============================================================================
// RANDOM EQUIPMENT ASSIGNMENT (same as main simulator)
// =============================================================================

const equipmentBySlot = new Map<EquipmentSlot, EquipmentTemplate[]>();
for (const tmpl of ALL_EQUIPMENT) {
  const list = equipmentBySlot.get(tmpl.slot) ?? [];
  list.push(tmpl);
  equipmentBySlot.set(tmpl.slot, list);
}

function assignRandomEquipment(character: Character): void {
  for (const [, items] of equipmentBySlot) {
    const roll = Math.floor(Math.random() * (items.length + 1));
    if (roll < items.length) {
      character.equip(items[roll].creator());
    }
  }
}

// =============================================================================
// THE PARTY: Barbarian, Cleric, Warlock, Bard, Monk
// =============================================================================

type CharacterCreator = (name: string) => Character;

const PARTY: [string, CharacterCreator][] = [
  ['Bàrbar', createBarbarian],
  ['Clergue', createCleric],
  ['Bruixot', createWarlock],
  ['Trobador', createBard],
  ['Monjo', createMonk],
];

// =============================================================================
// FIGHT DEFINITIONS (from The Temple of Alak'Alar)
// =============================================================================

interface FightConfig {
  name: string;
  description: string;
  enemies: [string, CharacterCreator, number][]; // [label, creator, count]
  maxRounds: number;
  targetMin: number; // target win rate range (for display)
  targetMax: number;
}

const FIGHTS: FightConfig[] = [
  {
    name: 'Fight 1: Ice Goblin Camp',
    description: '5 players vs 8 goblins + 2 goblin shamans',
    enemies: [
      ['Goblin', createGoblin, 8],
      ['Goblin Xaman', createGoblinShaman, 2],
    ],
    maxRounds: 30,
    targetMin: 60, targetMax: 70,
  },
  {
    name: 'Fight 2a: Basilisk\'s Lair (First)',
    description: '5 players vs 1 basilisk',
    enemies: [
      ['Basilisc', createBasilisk, 1],
    ],
    maxRounds: 20,
    targetMin: 60, targetMax: 70,
  },
  {
    name: 'Fight 2b: Basilisk\'s Lair (Second)',
    description: '5 players vs 1 basilisk',
    enemies: [
      ['Basilisc', createBasilisk, 1],
    ],
    maxRounds: 20,
    targetMin: 60, targetMax: 70,
  },
  {
    name: 'Fight 3: Temple Devils (Kitchen Ambush)',
    description: '5 players vs 1 bone devil + 6 spined devils',
    enemies: [
      ["Diable d'Os", createBoneDevil, 1],
      ['Diable Espinós', createSpinedDevil, 6],
    ],
    maxRounds: 20,
    targetMin: 55, targetMax: 65,
  },
  {
    name: 'Fight 4: The Study (Stone Golems)',
    description: '5 players vs 2 stone golems',
    enemies: [
      ['Gòlem de Pedra', createStoneGolem, 2],
    ],
    maxRounds: 20,
    targetMin: 50, targetMax: 60,
  },
  {
    name: 'Fight 5: Guardian Chamber (Horned Devils)',
    description: '5 players vs 2 horned devils',
    enemies: [
      ['Diable Banyut', createHornedDevil, 2],
    ],
    maxRounds: 20,
    targetMin: 50, targetMax: 60,
  },
];

// =============================================================================
// CAMPAIGN SIMULATION (sequential fights with HP carryover + rest)
// =============================================================================

const REST_HEAL = 1; // lives healed per rest between fights

/**
 * Reset a character's combat state for the next fight WITHOUT resetting lives.
 * Calls resetForNewCombat() then restores the saved lives.
 */
function resetForNextFight(character: Character, savedLives: number): void {
  character.resetForNewCombat();
  character.currentLives = savedLives;
}

/**
 * Apply rest healing: each living character heals REST_HEAL lives (capped at maxLives).
 */
function applyRest(team: Character[]): void {
  for (const c of team) {
    if (c.currentLives > 0) {
      c.currentLives = Math.min(c.currentLives + REST_HEAL, c.maxLives);
    }
  }
}

function pad(str: string, width: number, right = false): string {
  return right ? str.padStart(width) : str.padEnd(width);
}

interface FightResult {
  playerWins: number;
  enemyWins: number;
  draws: number;
  totalRounds: number;
  playerSurvivorsTotal: number;
  enemySurvivorsTotal: number;
  classSurvivalCount: Map<string, number>;
  reached: number; // how many campaigns reached this fight
}

function main(): void {
  console.log('='.repeat(70));
  console.log('THE TEMPLE OF ALAK\'ALAR — CAMPAIGN SIMULATION');
  console.log('Party: Bàrbar, Clergue, Bruixot, Trobador, Monjo');
  console.log(`Rest between fights: heal ${REST_HEAL} life per character`);
  console.log('HP carries over between fights. Dead characters stay dead.');
  console.log('='.repeat(70));

  const NUM_SIMULATIONS = 2000;

  // Initialize per-fight stats
  const fightResults: FightResult[] = FIGHTS.map(() => ({
    playerWins: 0,
    enemyWins: 0,
    draws: 0,
    totalRounds: 0,
    playerSurvivorsTotal: 0,
    enemySurvivorsTotal: 0,
    classSurvivalCount: new Map(),
    reached: 0,
  }));

  let campaignsCompleted = 0;

  for (let sim = 0; sim < NUM_SIMULATIONS; sim++) {
    // Create party once per campaign
    const team1 = PARTY.map(([, creator], j) => {
      const c = creator(`Player_${j}_${sim}`);
      assignRandomEquipment(c);
      return c;
    });

    let campaignAlive = true;

    for (let fightIdx = 0; fightIdx < FIGHTS.length; fightIdx++) {
      if (!campaignAlive) break;

      const fight = FIGHTS[fightIdx];
      const result = fightResults[fightIdx];
      result.reached++;

      // Create enemies fresh for each fight
      const team2: Character[] = [];
      for (const [, creator, count] of fight.enemies) {
        for (let j = 0; j < count; j++) {
          team2.push(creator(`Enemy_${team2.length}_${sim}`));
        }
      }

      // Reset combat state for living party members (preserving lives)
      for (const c of team1) {
        if (c.currentLives > 0) {
          resetForNextFight(c, c.currentLives);
        }
      }

      // Run the fight
      const livingTeam1 = team1.filter(c => c.currentLives > 0);
      const engine = new CombatEngine(livingTeam1, team2);
      engine.maxRounds = fight.maxRounds;
      const winner = engine.runCombat();

      result.totalRounds += engine.roundNumber;

      if (winner === 1) {
        result.playerWins++;
        result.playerSurvivorsTotal += livingTeam1.filter(c => c.currentLives > 0).length;
      } else if (winner === 2) {
        result.enemyWins++;
        result.enemySurvivorsTotal += team2.filter(c => c.currentLives > 0).length;
        campaignAlive = false;
      } else {
        result.draws++;
        campaignAlive = false; // draw = campaign ends
      }

      // Track per-class survival at this fight
      for (let j = 0; j < team1.length; j++) {
        const cls = PARTY[j][0];
        if (team1[j].currentLives > 0) {
          result.classSurvivalCount.set(cls, (result.classSurvivalCount.get(cls) ?? 0) + 1);
        }
      }

      // Rest before next fight (if party won)
      if (campaignAlive && fightIdx < FIGHTS.length - 1) {
        applyRest(team1);
      }
    }

    if (campaignAlive) campaignsCompleted++;
  }

  // =============================================================================
  // PRINT RESULTS
  // =============================================================================

  for (let fightIdx = 0; fightIdx < FIGHTS.length; fightIdx++) {
    const fight = FIGHTS[fightIdx];
    const r = fightResults[fightIdx];

    console.log(`\n${'='.repeat(70)}`);
    console.log(fight.name);
    console.log('-'.repeat(70));
    console.log(fight.description);
    console.log(`Reached by ${r.reached} / ${NUM_SIMULATIONS} campaigns`);
    console.log('='.repeat(70));

    const winRate = r.reached > 0 ? (r.playerWins / r.reached) * 100 : 0;
    const lossRate = r.reached > 0 ? (r.enemyWins / r.reached) * 100 : 0;
    const drawRate = r.reached > 0 ? (r.draws / r.reached) * 100 : 0;
    const avgRounds = r.reached > 0 ? r.totalRounds / r.reached : 0;
    const avgPlayerSurvivors = r.playerWins > 0 ? r.playerSurvivorsTotal / r.playerWins : 0;
    const avgEnemySurvivors = r.enemyWins > 0 ? r.enemySurvivorsTotal / r.enemyWins : 0;

    console.log(`\nResults (conditional on reaching this fight):`);
    console.log(`  Player wins:  ${pad(String(r.playerWins), 5, true)} / ${pad(String(r.reached), 5, true)} (${winRate.toFixed(1)}%)`);
    console.log(`  Enemy wins:   ${pad(String(r.enemyWins), 5, true)} / ${pad(String(r.reached), 5, true)} (${lossRate.toFixed(1)}%)`);
    console.log(`  Draws:        ${pad(String(r.draws), 5, true)} / ${pad(String(r.reached), 5, true)} (${drawRate.toFixed(1)}%)`);
    console.log(`  Avg rounds:   ${avgRounds.toFixed(1)}`);
    if (r.playerWins > 0)
      console.log(`  Avg player survivors on win: ${avgPlayerSurvivors.toFixed(1)} / ${PARTY.length}`);
    if (r.enemyWins > 0) {
      const totalEnemies = fight.enemies.reduce((s, e) => s + e[2], 0);
      console.log(`  Avg enemy survivors on loss: ${avgEnemySurvivors.toFixed(1)} / ${totalEnemies}`);
    }

    // Per-class survival (among campaigns that reached this fight)
    console.log(`\n  Per-class survival rate (at end of this fight):`);
    for (const [cls] of PARTY) {
      const survived = r.classSurvivalCount.get(cls) ?? 0;
      const survivalRate = r.reached > 0 ? (survived / r.reached) * 100 : 0;
      console.log(`    ${pad(cls, 12)} ${survivalRate.toFixed(1)}%`);
    }

    // Balance assessment against target
    console.log(`\n  TARGET: ${fight.targetMin}-${fight.targetMax}% player win rate`);
    if (winRate >= fight.targetMin && winRate <= fight.targetMax) {
      console.log(`  ✓ ON TARGET — ${winRate.toFixed(1)}%`);
    } else if (winRate > fight.targetMax) {
      console.log(`  ⚠ TOO EASY — ${winRate.toFixed(1)}% (need to buff enemies by ~${(winRate - fight.targetMax).toFixed(0)}pp)`);
    } else {
      console.log(`  ⚠ TOO HARD — ${winRate.toFixed(1)}% (need to nerf enemies by ~${(fight.targetMin - winRate).toFixed(0)}pp)`);
    }
  }

  // Campaign summary
  console.log(`\n${'='.repeat(70)}`);
  console.log('CAMPAIGN SUMMARY');
  console.log('-'.repeat(70));
  const completionRate = (campaignsCompleted / NUM_SIMULATIONS) * 100;
  console.log(`  Campaigns completed (all ${FIGHTS.length} fights): ${campaignsCompleted} / ${NUM_SIMULATIONS} (${completionRate.toFixed(1)}%)`);
  for (let fightIdx = 0; fightIdx < FIGHTS.length; fightIdx++) {
    const r = fightResults[fightIdx];
    const cumulativeRate = (r.playerWins / NUM_SIMULATIONS) * 100;
    console.log(`  Survived through Fight ${fightIdx + 1}: ${r.playerWins} / ${NUM_SIMULATIONS} (${cumulativeRate.toFixed(1)}%)`);
  }
  console.log('='.repeat(70));
}

main();
