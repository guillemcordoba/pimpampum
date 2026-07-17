/**
 * Tuning experiment harness: sweeps candidate knob settings (player PV,
 * armour scale) over mirror matches and prints comparable rows. Mutates
 * ALL_EQUIPMENT armour in place per scenario and restores it after.
 *
 * Run: pnpm --filter @pimpampum/simulator exec tsx src/experiment-tuning.ts
 */
import { newCombatStats } from '@pimpampum/engine';
import { ALL_EQUIPMENT } from '@pimpampum/skills';
import { randomTeam, runMatch } from './tests/helpers.js';

const GAMES = 1500;

function mirror(label: string, pv: number): void {
  const stats = newCombatStats();
  let a = 0, b = 0, d = 0;
  for (let i = 0; i < GAMES; i++) {
    const w = runMatch(randomTeam('A', 2, 6, true, pv), randomTeam('B', 2, 6, true, pv), stats);
    if (w === 0) a++; else if (w === 1) b++; else d++;
  }
  const atk = stats.actionTypePlays['Atac'] ?? 0;
  const def = stats.actionTypePlays['Defensa'] ?? 0;
  const foc = stats.actionTypePlays['Focus'] ?? 0;
  const total = atk + def + foc;
  console.log(
    `${label.padEnd(26)} draws ${(100 * d / GAMES).toFixed(1).padStart(5)}%  ` +
    `avgRounds ${(stats.rounds / stats.combats).toFixed(1).padStart(5)}  ` +
    `A/B ${(100 * a / GAMES).toFixed(1)}/${(100 * b / GAMES).toFixed(1)}  ` +
    `mix A:${(100 * atk / total).toFixed(0)}% D:${(100 * def / total).toFixed(0)}% F:${(100 * foc / total).toFixed(0)}%`,
  );
}

const originalArmor = new Map(ALL_EQUIPMENT.map(e => [e.id, e.passiveArmor]));
function setArmorHalved(halved: boolean): void {
  for (const e of ALL_EQUIPMENT) {
    (e as { passiveArmor: number }).passiveArmor = halved
      ? Math.ceil(originalArmor.get(e.id)! / 2)
      : originalArmor.get(e.id)!;
  }
}

console.log(`Mirror 2v2 @ budget 6, ${GAMES} games per scenario\n`);
mirror('baseline (PV 20)', 20);
mirror('PV 12', 12);
setArmorHalved(true);
mirror('PV 20 + armour halved', 20);
mirror('PV 12 + armour halved', 12);
mirror('PV 15 + armour halved', 15);
setArmorHalved(false);
