/**
 * The shape of winrate-vs-PV for one composition.
 *
 * The creator solved «6× Goblin + 1× Goblin Xaman, nivell 4, mitjana (80%)» to
 * 1 PV per body. Either that is true — the swarm is already harder than 80% at
 * the minimum PV — or the solver is landing somewhere it should not. Plot the
 * curve and the question answers itself.
 *
 * Run: pnpm --filter @pimpampum/simulator exec tsx src/experiment-pv-curve.ts
 */
import { simulateEncounter, type FieldedGroup } from '@pimpampum/enemies';
import { PLAYER_SKILLS, COMPLEMENTARY_SKILLS, type PartySpec, type CharacterBuildSpec } from '@pimpampum/skills';

const MAINS = PLAYER_SKILLS.filter(s => !COMPLEMENTARY_SKILLS.has(s.id));
function hero(name: string, skillId: string, level = 5): CharacterBuildSpec {
  const skill = PLAYER_SKILLS.find(s => s.id === skillId)!;
  const equipment = ['escut', 'armadura-de-cuir'];
  if (skill.actions.some(a => a.effects.some(e => e.type === 'weapon_damage'))) equipment.push('destral');
  return { name, pv: 12, skills: { [skill.id]: Math.min(skill.actions.length, level) }, equipment, category: 'player' };
}
const PARTY: PartySpec = { characters: MAINS.slice(0, 4).map((s, i) => hero(`Heroi ${i + 1}`, s.id)) };

const CASES: { label: string; groups: (pv: number) => FieldedGroup[] }[] = [
  {
    label: '6× Goblin + 1× Xaman (nivell 4)',
    groups: pv => [
      { enemyId: 'goblin', count: 6, level: 4, pv },
      { enemyId: 'goblin-shaman', count: 1, level: 4, pv },
    ],
  },
  {
    label: '6× Goblin (nivell 4)',
    groups: pv => [{ enemyId: 'goblin', count: 6, level: 4, pv }],
  },
  {
    label: '6× Goblin (nivell 1)',
    groups: pv => [{ enemyId: 'goblin', count: 6, level: 1, pv }],
  },
];

const PVS = [1, 2, 3, 4, 6, 8, 12, 16, 20, 26, 34];
const GAMES = 1200;
const SEED = 555000;

for (const c of CASES) {
  console.log(`\n${c.label}   ·   ${GAMES} combats per punt`);
  console.log('  PV/cos   victòria jugadors   rondes');
  for (const pv of PVS) {
    const r = simulateEncounter(c.groups(pv), PARTY, { games: GAMES, seed: SEED });
    const bar = '█'.repeat(Math.round(r.winrate * 40));
    console.log(
      `  ${String(pv).padStart(5)}   ${(r.winrate * 100).toFixed(0).padStart(5)}% ±${(r.stderr * 100).toFixed(1)}`
      + `          ${r.avgRounds.toFixed(1).padStart(4)}   ${bar}`,
    );
  }
}
