import { CombatEngine, setAIControlled } from '@pimpampum/engine';
import { aiPolicy } from '@pimpampum/ai';
import { buildReferenceParty } from '@pimpampum/skills';
import { createEnemy } from '@pimpampum/enemies';
import { games, theRegistry as reg, useSet } from '@pimpampum/bench';
import { referenceParty, FANTASY } from '@pimpampum/set-fantasy';

// THE SET THIS HARNESS MEASURES. `@pimpampum/bench` takes its content as a
// parameter and throws rather than guess, so every entry point says so once.
useSet(FANTASY);

/**
 * Depth 0 on purpose: this is a smoke test, not a measurement — it asks
 * whether combats terminate and the step API works, and strong play would only
 * make it slower. Stated rather than defaulted, because an implicit depth is
 * indistinguishable from a forgotten one.
 */
const AI_DEPTH = 0;
let p = 0, e = 0, d = 0, rounds = 0;
const GAMES = games(200);
for (let i = 0; i < GAMES; i++) {
  const players = buildReferenceParty(referenceParty()).slice(0, 2);
  setAIControlled(players);
  const enemies = [createEnemy('goblin', { pv: 16, name: 'G1' })!, createEnemy('goblin', { pv: 16, name: 'G2' })!, createEnemy('goblin-shaman', { pv: 19 })!];
  const eng = new CombatEngine(players, enemies, { registry: reg(), maxRounds: 40, ...aiPolicy({ depth: AI_DEPTH }) });
  const r = eng.runCombat();
  rounds += r.rounds;
  if (r.winner === 0) p++; else if (r.winner === 1) e++; else d++;
}
console.log(`players ${p} enemies ${e} draws ${d} avgRounds ${(rounds / GAMES).toFixed(1)}`);

// Step-API smoke: drive one round manually like the web would.
const players = buildReferenceParty(referenceParty()).slice(0, 1);
const enemies = [createEnemy('goblin', { pv: 16, name: 'Gob' })!];
const eng = new CombatEngine(players, enemies, { registry: reg(), maxRounds: 40, ...aiPolicy({ depth: AI_DEPTH }) });
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
