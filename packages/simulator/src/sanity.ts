import { CombatEngine, assignStrategies, AIStrategy } from '@pimpampum/engine';
import { createRegistry, buildCharacter } from '@pimpampum/skills';
import { createEnemy } from '@pimpampum/enemies';

const reg = createRegistry();
let p = 0, e = 0, d = 0, rounds = 0;
for (let i = 0; i < 200; i++) {
  const players = [
    buildCharacter({ name: 'A', classCss: 'enginyer', pv: 22, skills: { 'enginyer-explosius': 60 } }),
    buildCharacter({ name: 'B', classCss: 'enginyer', pv: 18, skills: { 'enginyer-explosius': 55 } }),
  ];
  const enemies = [createEnemy('goblin', {}, 'G1')!, createEnemy('goblin', {}, 'G2')!, createEnemy('goblin-shaman')!];
  assignStrategies(enemies, [AIStrategy.Aggro]);
  const eng = new CombatEngine(players, enemies, { registry: reg, maxRounds: 40 });
  const r = eng.runCombat();
  rounds += r.rounds;
  if (r.winner === 0) p++; else if (r.winner === 1) e++; else d++;
}
console.log(`players ${p} enemies ${e} draws ${d} avgRounds ${(rounds / 200).toFixed(1)}`);

// Step-API smoke: drive one round manually like the web would.
const players = [buildCharacter({ name: 'Hero', classCss: 'enginyer', pv: 22, skills: { 'enginyer-explosius': 50 } })];
const enemies = [createEnemy('goblin', {}, 'Gob')!];
assignStrategies(enemies, [AIStrategy.Aggro]);
const eng = new CombatEngine(players, enemies, { registry: reg, maxRounds: 40 });
eng.prepareRound();
const revealed = eng.planActions([{ team: 0, idx: 0, actionIdx: 0 }]);
console.log('revealed:', revealed.map(r => `${r.actorName}:${r.actionName}@${r.speed}`).join(', '));
let step = eng.resolveNextAction();
let guard = 0;
while (step.kind !== 'done' && guard++ < 20) {
  if (step.kind === 'target') {
    console.log('  prompt:', step.prompt.actorName, step.prompt.actionName, step.prompt.requirement);
    eng.setResolveTarget([{ team: 1, idx: 0 }]);
  } else {
    for (const l of step.logs) console.log('   log:', l.message);
  }
  step = eng.resolveNextAction();
}
eng.finishRound();
console.log('step-API round ok');
