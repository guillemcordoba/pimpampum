/**
 * What actually decides the long fights the balancer produces?
 *
 * The 100-encounter sweep (experiment-gm-encounters.ts) showed the solver
 * hitting its target winrate almost perfectly while handing out 400-PV wolves
 * and 29-round fights. A fight that long runs past the daily fatigue budget
 * (FATIGUE_CONFIG.max = 20), after which the only playable card is Cop
 * desesperat — 1d4, and 1 PV of SELF-damage per swing, on a 12 PV hero.
 *
 * So: re-measure the same solved encounters with the fatigue ceiling lifted.
 * If the winrate moves, those fights were being decided by exhaustion rather
 * than by the creatures — and the difficulty number means something other
 * than what a GM would read into it.
 *
 * Run: pnpm --filter @pimpampum/simulator exec tsx src/experiment-long-fights.ts
 */
import { FATIGUE_CONFIG } from '@pimpampum/engine';
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

/** The exact encounters the solver produced, with the PV it chose. */
const CASES: { label: string; asked: number; groups: FieldedGroup[] }[] = [
  { label: '1× Llop @432          ', asked: 0.50, groups: [{ enemyId: 'wolf', count: 1, level: 4, pv: 432 }] },
  { label: '6× Llop @63           ', asked: 0.50, groups: [{ enemyId: 'wolf', count: 6, level: 4, pv: 63 }] },
  { label: '1× Diable Espinós @415', asked: 0.50, groups: [{ enemyId: 'spined-devil', count: 1, level: 4, pv: 415 }] },
  { label: '1× Goblin @353        ', asked: 0.80, groups: [{ enemyId: 'goblin', count: 1, level: 5, pv: 353 }] },
  { label: '3× Goblin @67         ', asked: 0.80, groups: [{ enemyId: 'goblin', count: 3, level: 5, pv: 67 }] },
  // Controls: fights the solver kept SHORT. These should barely move.
  { label: '3× Basilisc @10 (curt)', asked: 0.50, groups: [{ enemyId: 'basilisk', count: 3, level: 5, pv: 10 }] },
  { label: '3× Gòlem @22 (curt)   ', asked: 0.50, groups: [{ enemyId: 'stone-golem', count: 3, level: 4, pv: 22 }] },
  { label: '6× Goblin @26         ', asked: 0.50, groups: [{ enemyId: 'goblin', count: 6, level: 5, pv: 26 }] },
];

const GAMES = 800;
const SEED = 20260803;

function measure(groups: FieldedGroup[], fatigueMax: number) {
  const saved = FATIGUE_CONFIG.max;
  FATIGUE_CONFIG.max = fatigueMax;
  try {
    return simulateEncounter(groups, PARTY, { games: GAMES, seed: SEED });
  } finally {
    FATIGUE_CONFIG.max = saved;
  }
}

console.log(`Fatiga real (max ${FATIGUE_CONFIG.max}) vs fatiga il·limitada · ${GAMES} combats, mateixa llavor\n`);
console.log('ENCONTRE                  demanat   amb fatiga   sense fatiga   diferència   rondes');
console.log('-'.repeat(88));

for (const c of CASES) {
  const withF = measure(c.groups, 20);
  const without = measure(c.groups, 100000);
  const delta = without.winrate - withF.winrate;
  console.log(
    `${c.label}    ${(c.asked * 100).toFixed(0)}%`
    + `        ${(withF.winrate * 100).toFixed(0).padStart(3)}%`
    + `          ${(without.winrate * 100).toFixed(0).padStart(3)}%`
    + `        ${delta >= 0 ? '+' : ''}${(delta * 100).toFixed(0).padStart(3)}pp`
    + `      ${withF.avgRounds.toFixed(1)}`,
  );
}

console.log(`\nUn heroi té 12 PV. Cop desesperat costa 1 PV per ús i és l'única carta jugable`);
console.log(`un cop superada la fatiga màxima (${20}), és a dir a partir de la ronda ~20.`);
