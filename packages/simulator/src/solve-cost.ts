/** How much does pricing at depth 1 actually cost, and how far does it move
 *  the answer? Same request, same seed, only the AI's thinking depth changing. */
import { solveEncounter } from '@pimpampum/enemies';
import { PLAYER_SKILLS, COMPLEMENTARY_SKILLS, ALL_SKILLS, type PartySpec, type CharacterBuildSpec } from '@pimpampum/skills';

const MAINS = PLAYER_SKILLS.filter(s => !COMPLEMENTARY_SKILLS.has(s.id));
function hero(name: string, skillId: string): CharacterBuildSpec {
  const skill = ALL_SKILLS.find(s => s.id === skillId)!;
  const equipment = ['escut', 'armadura-de-cuir'];
  if (skill.actions.some(a => a.effects.some(e => e.type === 'weapon_damage'))) equipment.push('destral');
  return { name, pv: 12, category: 'player', equipment, skills: { [skill.id]: 5 } };
}
const party: PartySpec = { characters: MAINS.slice(0, 4).map((s, i) => hero(`Heroi ${i + 1}`, s.id)) };
const pool = [{ enemyId: 'goblin', count: 4 }];

const CASES = [
  { label: 'depth 0            ', aiDepth: 0 },
  { label: 'depth 1 s2 p1 k3   ', aiDepth: 1 },
  { label: 'depth 1 s1 p1 k2   ', aiDepth: 1, aiLookahead: { samples: 1, passes: 1, topK: 2 } },
];
for (const c of CASES) {
  const t0 = performance.now();
  const solved = solveEncounter(pool, party, 0.65, { games: 120, ...c } as never)!;
  const ms = performance.now() - t0;
  const pv = solved.groups.map(g => `${g.count}x pv${g.pv}`).join(' + ');
  console.log(`${c.label}: ${(ms / 1000).toFixed(1)}s  →  ${pv}  (${solved.avgRounds?.toFixed(1) ?? '?'} rondes)`);
}
