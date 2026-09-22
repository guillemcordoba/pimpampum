// bench-exempt(sample): a scripted hand-played round with no sampling at all —
// there is no sample size to turn down, which is why harnesses.test.ts runs it
// as-is to prove it still executes.
/**
 * Manual play harness — drive a combat by hand, one round at a time, with a
 * SEEDED rng so the same script always replays the same game.
 *
 * Protocol (mirrors the real information flow):
 *   1. Write the round's card picks into SCRIPT below and run → the harness
 *      plays every earlier round, then prints the REVEAL and stops. Cards are
 *      therefore chosen blind, exactly like at the table.
 *   2. Add that round's `targets` (chosen with the reveal visible) and re-run
 *      → the round resolves and the next reveal is waiting.
 *
 * Run: pnpm --filter @pimpampum/simulator exec tsx src/play.ts
 */
import { CombatEngine, ActionType, Character, TargetRef } from '@pimpampum/engine';
import { aiPolicy } from '@pimpampum/ai';
import { createRegistry, buildCharacter } from '@pimpampum/skills';
import { createEnemy, registerEnemySkills } from '@pimpampum/enemies';

// ---------------------------------------------------------------- seeded rng
declare const process: { env: Record<string, string | undefined> };

let seed = Number(process.env.SEED ?? 12345);
Math.random = () => {
  seed = (seed * 1664525 + 1013904223) >>> 0;
  return seed / 4294967296;
};

// ------------------------------------------------------------------ the game
const PLAYERS: { name: string; classCss: string; pv: number; skills: Record<string, number>; equipment: string[] }[] = [
  { name: 'Vera',  classCss: 'mestre-armes', pv: 12, skills: { 'mestre-armes': 4 },       equipment: ['destral', 'escut'] },
  { name: 'Bran',  classCss: 'terra',        pv: 12, skills: { earthbender: 4 },          equipment: ['escut'] },
  { name: 'Cira',  classCss: 'metge',        pv: 12, skills: { metge: 3, gel: 3 },        equipment: [] },
  { name: 'Dell',  classCss: 'enginyer',     pv: 12, skills: { 'enginyer-explosius': 4 }, equipment: [] },
];
/** ARMOUR=cuir|ferro adds that armour to every player (default: none). */
const ARMOUR = { cuir: 'armadura-de-cuir', ferro: 'armadura-de-ferro' }[process.env.ARMOUR ?? ''] ?? null;
const ENEMY_COUNT = Number(process.env.GOBLINS ?? 6);
const ENEMY_PV = Number(process.env.GOBPV ?? 15);
const ENEMY_LEVEL = Number(process.env.GOBLVL ?? 4);

/** One round of decisions. `cards` = action id (or index) per player name. */
interface RoundScript {
  cards: Record<string, string>;
  /** Target(s) per player name, given at the resolution prompt. Use
   *  'E0'..'E5' for enemies, 'P0'..'P3' for players, e.g. ['E2'] or ['P1']. */
  targets?: Record<string, string[]>;
}

const SCRIPT: RoundScript[] = JSON.parse(process.env.SCRIPT ?? '[]');

// ------------------------------------------------------------------- helpers
const reg = createRegistry();
registerEnemySkills(reg);

/**
 * Depth 0 on purpose: this is a hand-play harness, not a measurement — you are the one choosing cards, and strong play would only
 * make it slower. Stated rather than defaulted, because an implicit depth is
 * indistinguishable from a forgotten one.
 */
const AI_DEPTH = 0;

const players = PLAYERS.map(p => buildCharacter(
  ARMOUR ? { ...p, equipment: [...p.equipment, ARMOUR] } : p,
));
const enemies = Array.from({ length: ENEMY_COUNT }, (_, i) => {
  return createEnemy('goblin', { level: ENEMY_LEVEL, name: `Gob${i + 1}`, pv: ENEMY_PV })!;
});
const eng = new CombatEngine(players, enemies, { registry: reg, maxRounds: 40, ...aiPolicy({ depth: AI_DEPTH }) });


const TYPE_NAMES: Record<string, string> = {
  [ActionType.Atac]: 'ATAC', [ActionType.Defensa]: 'DEF', [ActionType.Focus]: 'FOCUS',
};
const typeName = (t: ActionType) => TYPE_NAMES[String(t)] ?? '?';

function parseRef(s: string): TargetRef {
  const team = s[0].toUpperCase() === 'E' ? 1 : 0;
  return { team, idx: Number(s.slice(1)) };
}

function showState(): void {
  console.log('\n--- STATE ---');
  for (const [ti, team] of [players, enemies].entries()) {
    for (const [i, c] of team.entries()) {
      if (!c.isAlive()) { console.log(`  ${ti ? 'E' : 'P'}${i} ${c.name.padEnd(6)} DEAD`); continue; }
      const st = c.statusRefs().map(r => `${r.key}:${r.entry.value}`).join(',');
      console.log(`  ${ti ? 'E' : 'P'}${i} ${c.name.padEnd(6)} PV ${String(c.currentPV).padStart(3)}/${c.maxPV}  arm ${c.getPassiveArmor()}  fat ${c.fatigue}${st ? '  [' + st + ']' : ''}`);
    }
  }
}

function showHand(c: Character, idx: number): void {
  const cards = c.actions
    .map((a, i) => ({ a, i }))
    .filter(({ a }) => c.getSkillLevel(a.def.skillId) >= a.def.unlockLevel && a.isAvailable() && !a.def.lastResort);
  console.log(`  P${idx} ${c.name} (PV ${c.currentPV}, fat ${c.fatigue}):`);
  for (const { a } of cards) {
    const dice = a.def.dice ? a.def.dice.toString() : '—';
    console.log(`      ${a.def.id.padEnd(22)} ${typeName(a.def.actionType).padEnd(5)} vel ${String(c.getEffectiveSpeed(a)).padStart(3)}  ${dice.padEnd(6)} ${a.def.description ?? ''}`);
  }
}

// -------------------------------------------------------------------- driver
for (const [ri, round] of SCRIPT.entries()) {
  if (!eng.isOver()) eng.prepareRound();
  const sel = players.map((c, idx) => {
    if (!c.isAlive()) return null;
    const want = round.cards[c.name];
    if (want === undefined) throw new Error(`round ${ri + 1}: no card for ${c.name}`);
    const ai = c.actions.findIndex(a => a.def.id === want);
    if (ai < 0) throw new Error(`round ${ri + 1}: ${c.name} has no card '${want}'`);
    return { team: 0, idx, actionIdx: ai };
  }).filter(Boolean) as { team: number; idx: number; actionIdx: number }[];

  const revealed = eng.planActions(sel);
  console.log(`\n================ ROUND ${eng.round} — REVEAL (speed order) ================`);
  for (const r of revealed) {
    const who = r.actorTeam === 0 ? `P${r.actorIdx}` : `E${r.actorIdx}`;
    console.log(`  vel ${String(r.speed).padStart(3)}  ${who} ${r.actorName.padEnd(6)} ${r.actionName.padEnd(22)} ${typeName(r.actionType)}`);
  }

  if (!round.targets) {
    console.log('\n>>> reveal shown. Add `targets` for this round and re-run. <<<');
    showState();
    break;
  }

  console.log('\n--- RESOLUTION ---');
  let step = eng.resolveNextAction();
  let guard = 0;
  while (step.kind !== 'done' && guard++ < 200) {
    if (step.kind === 'target') {
      const p = step.prompt;
      if (p.actorTeam === 0) {
        const want = round.targets[p.actorName];
        if (!want) throw new Error(`round ${ri + 1}: no target for ${p.actorName} (${p.actionName}, ${p.requirement})`);
        console.log(`   [target] ${p.actorName} ${p.actionName} (${p.requirement}) → ${want.join(',')}`);
        eng.setResolveTarget(want.map(parseRef));
      } else {
        eng.setResolveTarget([]);
      }
    } else {
      for (const l of step.logs) console.log('   ' + l.message);
    }
    step = eng.resolveNextAction();
  }
  eng.finishRound();
  showState();
  if (eng.isOver()) {
    console.log(`\n*** COMBAT OVER — winner: ${eng.winner() === 0 ? 'PLAYERS' : eng.winner() === 1 ? 'GOBLINS' : 'draw'} (round ${eng.round}) ***`);
    break;
  }
}

if (SCRIPT.length === 0) {
  console.log('=== OPENING POSITION ===');
  showState();
  console.log('\n--- PLAYER HANDS ---');
  players.forEach((c, i) => showHand(c, i));
  console.log('\n--- GOBLIN KIT (all 6 identical) ---');
  showHand(enemies[0], 0);
}
