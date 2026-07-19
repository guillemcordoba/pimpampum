import { CombatEngine, assignStrategies, AIStrategy } from '@pimpampum/engine';
import { getEnemyTemplate, createEnemyFromTemplate } from '@pimpampum/enemies';
import { REGISTRY, randomTeam } from './tests/helpers.js';
const tpl = getEnemyTemplate('goblin')!;

for (let g = 0; g < 10; g++) {
  const party = randomTeam('P', 4, 5);
  const gobs = Array.from({ length: 6 }, (_, k) => createEnemyFromTemplate(tpl, { goblin: 5 }, `G${k+1}`, [], 14));
  assignStrategies(party, [AIStrategy.Power, AIStrategy.Aggro, AIStrategy.Protect]);
  const eng = new CombatEngine(party, gobs, { registry: REGISTRY, maxRounds: 40 });
  console.log(`\n===== GAME ${g+1} =====`);
  console.log('Party:', party.map(p => `${p.name}[${[...p.skills].filter(([k])=>k!=='desesperacio').map(([k,v])=>k+' '+v).join('+')}]`).join('  '));
  while (!eng.isOver() && eng.round < 40) {
    const before = eng.logEntries.length;
    eng.runRound();
    // sum goblin damage this round
    let gobDmg = 0;
    for (const e of eng.logEntries.slice(before)) {
      const m = e.message.match(/colpeja (P\d).*: (\d+) dany/);
      if (m && e.kind === 'attack') { const isGob = e.message.startsWith('💥 G'); if (isGob) gobDmg += Number(m[2]); }
    }
    const pv = party.map(c => c.isAlive() ? c.currentPV : '†').join('/');
    console.log(`  R${eng.round}: players[${pv}]  goblins alive ${gobs.filter(x=>x.isAlive()).length}  (goblins dealt ${gobDmg})`);
  }
  console.log(`  >>> ${eng.winner()===0?'PLAYERS WIN':eng.winner()===1?'GOBLINS WIN (TPK)':'draw'}  after ${eng.round} rounds, survivors ${party.filter(p=>p.isAlive()).length}/4`);
}
