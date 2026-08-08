/** Where does a depth-1 decision actually spend its time? clone / resolve /
 *  score, measured on the reference fight. Determines whether the lookahead's
 *  cost is a constant factor worth optimising or an inherent one. */
import { CombatEngine, positionScore, setAIControlled, bestResponse } from '@pimpampum/engine';
import { PLAYER_SKILLS, COMPLEMENTARY_SKILLS, ALL_SKILLS, buildReferenceParty, type PartySpec, type CharacterBuildSpec } from '@pimpampum/skills';
import { buildComposition } from '@pimpampum/enemies';
import { REGISTRY } from './tests/helpers.js';

const MAINS = PLAYER_SKILLS.filter(s => !COMPLEMENTARY_SKILLS.has(s.id));
function hero(name: string, skillId: string): CharacterBuildSpec {
  const skill = ALL_SKILLS.find(s => s.id === skillId)!;
  const equipment = ['escut', 'armadura-de-cuir'];
  if (skill.actions.some(a => a.effects.some(e => e.type === 'weapon_damage'))) equipment.push('destral');
  return { name, pv: 12, category: 'player', equipment, skills: { [skill.id]: 5 } };
}
const party: PartySpec = { characters: MAINS.slice(0, 4).map((s, i) => hero(`Heroi ${i + 1}`, s.id)) };

function fresh(): CombatEngine {
  const players = buildReferenceParty(party);
  setAIControlled(players);
  const enemies = buildComposition([{ enemyId: 'goblin', count: 4, level: 3, pv: 20 }]);
  return new CombatEngine(players, enemies, { registry: REGISTRY, maxRounds: 40 });
}

const time = (label: string, n: number, fn: () => void) => {
  const t0 = performance.now();
  for (let i = 0; i < n; i++) fn();
  const per = (performance.now() - t0) / n;
  console.log(`  ${label.padEnd(28)} ${per.toFixed(4)} ms`);
};

const e = fresh();
console.log('\nPer-operation cost (4 heroes vs 4 goblins):');
time('engine.clone()', 2000, () => { e.clone(); });
time('positionScore()', 20000, () => { positionScore(e, 0); });
time('clone + resolve one round', 500, () => {
  const sim = e.clone();
  sim.aiDepth = 0;
  sim.prepareRound();
  sim.planActions([]);
  let s = sim.resolveNextAction();
  let g = 0;
  while (s.kind !== 'done' && g++ < 400) { if (s.kind === 'target') sim.setResolveTarget([]); s = sim.resolveNextAction(); }
  sim.finishRound();
});
time('bestResponse d1 s2 p1 k3', 100, () => { bestResponse(e, 0, { depth: 1, samples: 2, passes: 1, topK: 3 }); });
console.log('');
