/**
 * Scratch experiment: prototype character sizes (Gran/Mitjà/Petit) without
 * touching the engine. PV is adjusted after build; the speed modifier rides on
 * a pseudo-equipment item with a negative speedPenalty (equipment survives
 * resetForNewCombat, unlike CombatModifiers).
 *
 * Not part of the balance suite — run with:
 *   pnpm --filter @pimpampum/simulator exec tsx src/size-experiment.ts
 */
import { Character, newCombatStats, EquipmentDefinition } from '@pimpampum/engine';
import { randomPlayer, runMatch } from './tests/helpers.js';

type SizeName = 'gran' | 'mitja' | 'petit';
const SIZE_NAMES: SizeName[] = ['gran', 'mitja', 'petit'];

interface SizeConfig {
  label: string;
  pv: Record<SizeName, number>;
  speed: Record<SizeName, number>;
  /** Added to every character's PV regardless of size (baseline shift). */
  basePvShift?: number;
}

const CONFIGS: SizeConfig[] = [
  {
    label: 'PV +3/0/-3, speed -1/0/+1',
    pv: { gran: 3, mitja: 0, petit: -3 },
    speed: { gran: -1, mitja: 0, petit: 1 },
  },
  {
    label: 'PV +4/0/-3, speed -1/0/+1',
    pv: { gran: 4, mitja: 0, petit: -3 },
    speed: { gran: -1, mitja: 0, petit: 1 },
  },
  {
    label: 'PV +5/0/-3, speed -1/0/+1',
    pv: { gran: 5, mitja: 0, petit: -3 },
    speed: { gran: -1, mitja: 0, petit: 1 },
  },
];

const TEAM_SIZE = 3;
const BUDGET = 40;
const DUEL_GAMES = 1000;
const MIXED_GAMES = 2000;

function applySize(c: Character, size: SizeName, cfg: SizeConfig): Character {
  c.maxPV += (cfg.basePvShift ?? 0) + cfg.pv[size];
  c.currentPV = c.maxPV;
  const sp = cfg.speed[size];
  if (sp !== 0) {
    c.equipment.push({
      id: `mida-${size}`, name: `Mida (${size})`, slot: 'Mida',
      passiveArmor: 0, speedPenalty: -sp, skillBonuses: [],
      iconPath: '', slotLabel: 'Mida',
    } as unknown as EquipmentDefinition);
  }
  return c;
}

function uniformTeam(prefix: string, size: SizeName, cfg: SizeConfig): Character[] {
  return Array.from({ length: TEAM_SIZE }, (_, i) =>
    applySize(randomPlayer(`${prefix}${i + 1}`, BUDGET), size, cfg));
}

function pct(n: number, of: number): string {
  return (100 * n / of).toFixed(1) + '%';
}

function duel(cfg: SizeConfig, sizeA: SizeName, sizeB: SizeName): void {
  const stats = newCombatStats();
  let aWins = 0, bWins = 0, draws = 0;
  for (let i = 0; i < DUEL_GAMES; i++) {
    const winner = runMatch(uniformTeam('A', sizeA, cfg), uniformTeam('B', sizeB, cfg), stats);
    if (winner === 0) aWins++; else if (winner === 1) bWins++; else draws++;
  }
  const avgRounds = (stats.rounds / stats.combats).toFixed(1);
  console.log(
    `   ${sizeA.padEnd(6)} vs ${sizeB.padEnd(6)}  ` +
    `${pct(aWins, DUEL_GAMES).padStart(6)} / ${pct(bWins, DUEL_GAMES).padStart(6)}  ` +
    `draws ${pct(draws, DUEL_GAMES).padStart(6)}  avg rounds ${avgRounds}`);
}

function mixed(cfg: SizeConfig): void {
  const bySize = new Map<SizeName, { games: number; wins: number }>(
    SIZE_NAMES.map(s => [s, { games: 0, wins: 0 }]));
  const stats = newCombatStats();
  let draws = 0;

  for (let i = 0; i < MIXED_GAMES; i++) {
    const sizesA: SizeName[] = [], sizesB: SizeName[] = [];
    const teamA = Array.from({ length: TEAM_SIZE }, (_, j) => {
      const s = SIZE_NAMES[Math.floor(Math.random() * 3)];
      sizesA.push(s);
      return applySize(randomPlayer(`A${j + 1}`, BUDGET), s, cfg);
    });
    const teamB = Array.from({ length: TEAM_SIZE }, (_, j) => {
      const s = SIZE_NAMES[Math.floor(Math.random() * 3)];
      sizesB.push(s);
      return applySize(randomPlayer(`B${j + 1}`, BUDGET), s, cfg);
    });
    const winner = runMatch(teamA, teamB, stats);
    if (winner === null) { draws++; continue; }
    for (const s of sizesA) { const e = bySize.get(s)!; e.games++; if (winner === 0) e.wins++; }
    for (const s of sizesB) { const e = bySize.get(s)!; e.games++; if (winner === 1) e.wins++; }
  }

  console.log(`   mixed teams (${MIXED_GAMES} games, draws ${pct(draws, MIXED_GAMES)}, avg rounds ${(stats.rounds / stats.combats).toFixed(1)}) — per-size win correlation:`);
  for (const s of SIZE_NAMES) {
    const e = bySize.get(s)!;
    console.log(`     ${s.padEnd(6)} ${pct(e.wins, e.games).padStart(6)}  (${e.games} character-games)`);
  }
}

console.log(`Size experiment — ${TEAM_SIZE}v${TEAM_SIZE} @ budget ${BUDGET}, base PV 10`);
for (const cfg of CONFIGS) {
  console.log(`\n=== ${cfg.label} ===`);
  duel(cfg, 'gran', 'petit');
  duel(cfg, 'gran', 'mitja');
  duel(cfg, 'petit', 'mitja');
  mixed(cfg);
}
