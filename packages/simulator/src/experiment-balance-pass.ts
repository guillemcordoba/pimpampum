/**
 * Per-skill balance pass: measure berserk trim candidates and support-kit
 * buffs (runtime param mutations, restored after). Per-skill win correlation
 * from mirror 2v2 games.
 *
 * Run: pnpm --filter @pimpampum/simulator exec tsx src/experiment-balance-pass.ts
 */
import { DiceRoll, newCombatStats } from '@pimpampum/engine';
import { PLAYER_SKILLS } from '@pimpampum/skills';
import { randomTeam, runMatch } from './tests/helpers.js';

const GAMES = 4000;

// --- Mutation handles ---------------------------------------------------------
const berserk = PLAYER_SKILLS.find(s => s.id === 'berserk')!;
const temerari = berserk.actions.find(a => a.id === 'atac-temerari')!
  .effects.find(e => e.type === 'reckless')!.params as { attack: number };
const rage = berserk.actions.find(a => a.id === 'entrar-en-furia')!
  .effects.find(e => e.type === 'enter_rage')!.params as { value: number; pvCost?: number };
const implacable = berserk.actions.find(a => a.id === 'furia-implacable')!;

const runes = PLAYER_SKILLS.find(s => s.id === 'runes')!;
const runeParams = runes.actions.map(a =>
  a.effects.find(e => e.type === 'carve_rune')!.params as { uses: number });

const gel = PLAYER_SKILLS.find(s => s.id === 'gel')!;
const ale = gel.actions.find(a => a.id === 'ale-de-gebre')! as { dice?: DiceRoll };

const ombres = PLAYER_SKILLS.find(s => s.id === 'ombres')!;
const melt = ombres.actions.find(a => a.id === 'desapareixer-en-lombra')!
  .effects.find(e => e.type === 'shadow_melt')!.params as { bonus: number };

interface Snapshot { tem: number; pvCost: number | undefined; capBonus: number | undefined; uses: number[]; aleDice: DiceRoll | undefined; meltBonus: number }
function snap(): Snapshot {
  return {
    tem: temerari.attack, pvCost: rage.pvCost, capBonus: implacable.rollBonus,
    uses: runeParams.map(p => p.uses), aleDice: ale.dice, meltBonus: melt.bonus,
  };
}
function restore(s: Snapshot): void {
  temerari.attack = s.tem; rage.pvCost = s.pvCost;
  (implacable as { rollBonus?: number }).rollBonus = s.capBonus;
  runeParams.forEach((p, i) => { p.uses = s.uses[i]; });
  ale.dice = s.aleDice; melt.bonus = s.meltBonus;
}
const original = snap();

// --- Measurement --------------------------------------------------------------
function sweep(label: string): void {
  const stats = newCombatStats();
  const bySkill = new Map<string, { games: number; wins: number }>();
  let draws = 0;
  for (let i = 0; i < GAMES; i++) {
    const a = randomTeam('A', 2, 6);
    const b = randomTeam('B', 2, 6);
    const w = runMatch(a, b, stats);
    if (w === null) draws++;
    for (const [team, won] of [[a, w === 0], [b, w === 1]] as const) {
      for (const c of team) {
        for (const id of c.skills.keys()) {
          const e = bySkill.get(id) ?? { games: 0, wins: 0 };
          e.games++;
          if (won) e.wins++;
          bySkill.set(id, e);
        }
      }
    }
  }
  const cells = [...bySkill.entries()]
    .map(([id, e]) => ({ id, pct: 100 * e.wins / e.games }))
    .sort((x, y) => y.pct - x.pct)
    .map(s => `${s.id.slice(0, 10)} ${s.pct.toFixed(1)}`);
  console.log(`\n${label}`);
  console.log(`  draws ${(100 * draws / GAMES).toFixed(1)}%  rounds ${(stats.rounds / stats.combats).toFixed(1)}`);
  console.log(`  ${cells.join(' | ')}`);
}

sweep('BASELINE');

temerari.attack = 2;
sweep('trim A: temerari +3→+2');

rage.pvCost = 3;
sweep('trim B: A + rage blood price 3 PV');

rage.pvCost = original.pvCost; (implacable as { rollBonus?: number }).rollBonus = 0;
sweep('trim C: A + capstone arma×2 (no +2)');

restore(original);
runeParams.forEach(p => { p.uses = 4; });
ale.dice = new DiceRoll(2, 4);
melt.bonus = 3;
sweep('BUFFS: runes 4 usos + alè de gebre 2d4 + ombra +3');

temerari.attack = 2; rage.pvCost = 3;
sweep('COMBINED: trim B + buffs');

restore(original);
