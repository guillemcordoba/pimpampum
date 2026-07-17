import {
  Character, CombatEngine, CombatStats, newCombatStats,
  assignStrategies, AIStrategy, EffectRegistry,
} from '@pimpampum/engine';
import { PLAYER_SKILLS, buildCharacter, ALL_EQUIPMENT, createRegistry } from '@pimpampum/skills';
import { getEnemyTemplate, createEnemyFromTemplate, buildSolvedEncounter, registerEnemySkills } from '@pimpampum/enemies';

/** Shared registry for all simulations (player + enemy skill handlers). */
export const REGISTRY: EffectRegistry = createRegistry();
registerEnemySkills(REGISTRY);

/** Default PV pool for a generated player character (rules.md: provisional
 *  default, tuned 2026-07-17 from 20 → 12 for the ≤5-round duration target). */
export const PLAYER_PV = 12;

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

/** Skills DESIGNED as complementary second kits (support/utility) — they never
 *  stand alone in intended play, always alongside a main skill. */
const COMPLEMENTARY_SKILLS = new Set(['metge', 'runes', 'ombres', 'gel']);

/**
 * Build a random player character with total skill levels (ordinals: each
 * level = one action known) summing to ~budget, spread over 1-2 skills
 * (each clamped to the skill's own action count), plus random equipment.
 * Models intended play: the FIRST skill is always a main (non-complementary)
 * kit; complementary skills only ever appear as the second skill.
 */
export function randomPlayer(name: string, budget: number, equip = true, pv = PLAYER_PV): Character {
  const mains = PLAYER_SKILLS.filter(s => !COMPLEMENTARY_SKILLS.has(s.id));
  const main = shuffle(mains)[0];
  const chosen = [main];
  if (Math.random() < 0.5) {
    const second = shuffle(PLAYER_SKILLS.filter(s => s !== main))[0];
    chosen.push(second);
  }
  const skills: Record<string, number> = {};
  let remaining = budget;
  chosen.forEach((s, i) => {
    const last = i === chosen.length - 1;
    const want = last ? remaining : Math.round(remaining * (0.5 + Math.random() * 0.3));
    skills[s.id] = Math.max(1, Math.min(s.actions.length, want));
    remaining -= skills[s.id];
  });
  const equipment = equip ? randomEquipment() : [];
  // Weapon-based skills (e.g. Mestre d'Armes) roll 0 without a wielded weapon,
  // so guarantee one. The fallback is the MID weapon (destral): defaulting to
  // the bastó gave weapon kits the worst weapon half the time — a systematic
  // handicap, not flavour.
  const usesWeapon = chosen.some(s => s.actions.some(a => a.effects.some(e => e.type === 'weapon_damage')));
  const hasWeapon = equipment.some(id => ['basto', 'destral', 'gran-destral'].includes(id));
  if (usesWeapon && !hasWeapon) equipment.push('destral');
  return buildCharacter({
    name,
    classCss: chosen[0].classCss,
    iconPath: chosen[0].iconPath,
    pv,
    skills,
    equipment,
  });
}

/** A team of `size` random players, each with the given per-player budget. */
export function randomTeam(prefix: string, size: number, perPlayerBudget: number, equip = true, pv = PLAYER_PV): Character[] {
  return Array.from({ length: size }, (_, i) => randomPlayer(`${prefix}${i + 1}`, perPlayerBudget, equip, pv));
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

export { getEnemyTemplate, createEnemyFromTemplate, buildSolvedEncounter };
