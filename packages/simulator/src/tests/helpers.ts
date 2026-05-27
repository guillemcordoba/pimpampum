import {
  Character, CombatEngine, CombatStats, newCombatStats,
  assignStrategies, AIStrategy, EffectRegistry,
} from '@pimpampum/engine';
import { PLAYER_SKILLS, buildCharacter, ALL_EQUIPMENT, createRegistry } from '@pimpampum/skills';
import { getEnemyTemplate, createEnemyFromTemplate, buildEncounter, getEncounter } from '@pimpampum/enemies';

/** Shared registry for all simulations. */
export const REGISTRY: EffectRegistry = createRegistry();

/** Default PV pool for a generated player character. */
export const PLAYER_PV = 10;

export function randInt(min: number, max: number): number {
  return min + Math.floor(Math.random() * (max - min + 1));
}

export function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

/** Randomly equip 0-3 items across distinct slots. */
function randomEquipment(): string[] {
  const bySlot = new Map<string, string[]>();
  for (const e of ALL_EQUIPMENT) {
    if (!bySlot.has(e.slot)) bySlot.set(e.slot, []);
    bySlot.get(e.slot)!.push(e.id);
  }
  const chosen: string[] = [];
  for (const ids of bySlot.values()) {
    if (Math.random() < 0.5) chosen.push(pick(ids));
  }
  return chosen;
}

/**
 * Build a random player character with total skill levels summing to ~budget,
 * spread over 1-2 skills, plus random equipment.
 */
export function randomPlayer(name: string, budget: number, equip = true): Character {
  const nSkills = randInt(1, 2);
  const chosen = shuffle(PLAYER_SKILLS).slice(0, nSkills);
  const skills: Record<string, number> = {};
  let remaining = budget;
  chosen.forEach((s, i) => {
    const last = i === chosen.length - 1;
    const lvl = last ? remaining : Math.round(remaining * (0.4 + Math.random() * 0.3));
    skills[s.id] = Math.max(5, Math.min(90, lvl));
    remaining -= skills[s.id];
  });
  return buildCharacter({
    name,
    classCss: chosen[0].classCss,
    iconPath: chosen[0].iconPath,
    pv: PLAYER_PV,
    skills,
    equipment: equip ? randomEquipment() : [],
  });
}

/** A team of `size` random players, each with the given per-player budget. */
export function randomTeam(prefix: string, size: number, perPlayerBudget: number, equip = true): Character[] {
  return Array.from({ length: size }, (_, i) => randomPlayer(`${prefix}${i + 1}`, perPlayerBudget, equip));
}

const STRATS = [AIStrategy.Power, AIStrategy.Aggro, AIStrategy.Protect];

/** Run one match; returns winning team index (0/1) or null for a draw. */
export function runMatch(teamA: Character[], teamB: Character[], stats?: CombatStats, maxRounds = 40): number | null {
  assignStrategies(teamA, shuffle(STRATS));
  assignStrategies(teamB, shuffle(STRATS));
  const engine = new CombatEngine(teamA, teamB, { registry: REGISTRY, maxRounds });
  return engine.runCombat(stats).winner;
}

export interface MatchupResult {
  games: number;
  aWins: number;
  bWins: number;
  draws: number;
  totalRounds: number;
}

/** Repeatedly fight two freshly-built teams (factories) and tally results. */
export function runMatchup(makeA: () => Character[], makeB: () => Character[], games: number, stats?: CombatStats): MatchupResult {
  const res: MatchupResult = { games, aWins: 0, bWins: 0, draws: 0, totalRounds: 0 };
  for (let i = 0; i < games; i++) {
    const teamA = makeA();
    const teamB = makeB();
    const before = stats ? { ...stats } : undefined;
    const local = newCombatStats();
    const winner = runMatch(teamA, teamB, stats ? local : undefined);
    if (stats) {
      stats.combats += local.combats;
      stats.rounds += local.rounds;
      for (const k of Object.keys(local.actionPlays)) stats.actionPlays[k] = (stats.actionPlays[k] ?? 0) + local.actionPlays[k];
      for (const k of Object.keys(local.actionWinPlays)) stats.actionWinPlays[k] = (stats.actionWinPlays[k] ?? 0) + local.actionWinPlays[k];
      for (const k of Object.keys(local.actionTypePlays)) stats.actionTypePlays[k] = (stats.actionTypePlays[k] ?? 0) + local.actionTypePlays[k];
    }
    void before;
    res.totalRounds += local.rounds || 0;
    if (winner === 0) res.aWins++;
    else if (winner === 1) res.bWins++;
    else res.draws++;
  }
  return res;
}

export { getEnemyTemplate, createEnemyFromTemplate, buildEncounter, getEncounter };
