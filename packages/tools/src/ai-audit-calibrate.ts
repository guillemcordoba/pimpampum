/**
 * WHAT REAL FIGHTS LOOK LIKE — the measurement behind the AI audit's
 * generator profile (`ai/src/audit/profile.ts`).
 *
 * The audit deals imaginary cards and must never import a set; to look like
 * the real game anyway, its parameter distributions are measured HERE, from
 * both sets, and frozen there as constants. Re-run this after a content change;
 * it prints the measured tables in the profile's shape and the frozen ones
 * beside them, so drift is visible.
 *
 * Measured:
 *  - every card of every kit, both sides: speed and dice by type, area dice,
 *    the type mix, fatigue costs;
 *  - the reference party and every calibration shape's solved encounter: hand
 *    sizes, skill levels, PV, armour, bodies per side;
 *  - those fights played by the production AI: rounds, and how many of the
 *    statuses on the table price themselves (`positionValue`).
 *
 * Run: pnpm --filter @pimpampum/tools exec tsx src/ai-audit-calibrate.ts
 */
import { ActionType, CombatEngine, withSeed, type ActionDefinition, type Character } from '@pimpampum/engine';
import { aiPolicy } from '@pimpampum/ai';
import { PROFILE } from '@pimpampum/ai/audit';
import { games, referenceParty, shapeEnemies, theRegistry, useSet, SMOKE, type GameSet } from '@pimpampum/bench';

type Table = Map<string | number, number>;
const bump = (t: Table, k: string | number, n = 1): void => { t.set(k, (t.get(k) ?? 0) + n); };
const show = (t: Table): string => `[${[...t.entries()].sort((a, b) => (typeof a[0] === 'number' ? (a[0] as number) - (b[0] as number) : String(a[0]).localeCompare(String(b[0])))).map(([k, v]) => `[${typeof k === 'number' ? k : `'${k}'`}, ${v}]`).join(', ')}]`;

const t = {
  speed: { attack: new Map() as Table, defense: new Map() as Table, focus: new Map() as Table },
  dice: { attack: new Map() as Table, area: new Map() as Table, defense: new Map() as Table },
  types: new Map() as Table,
  fatigue: { costs: 0, cards: 0 },
  hand: { hero: new Map() as Table, enemy: new Map() as Table },
  level: { hero: new Map() as Table, enemy: new Map() as Table },
  pv: { hero: new Map() as Table, enemy: new Map() as Table },
  armour: { hero: new Map() as Table, enemy: new Map() as Table },
  shapes: new Map() as Table,
  rounds: new Map() as Table,
  statuses: { priced: 0, behaving: 0 },
};

const typeOf = (d: ActionDefinition): 'attack' | 'defense' | 'focus' =>
  d.actionType === ActionType.Atac ? 'attack' : d.actionType === ActionType.Defensa ? 'defense' : 'focus';
const diceOf = (d: ActionDefinition): string | null => (d.dice ? `${d.dice.numDice}d${d.dice.sides}` : null);

function cards(set: GameSet): void {
  for (const side of ['player', 'enemy'] as const) {
    for (const id of set.kitIds(side)) {
      for (const d of set.kit(id)?.actions ?? []) {
        if (d.lastResort) continue;
        const type = typeOf(d);
        bump(t.speed[type], d.speed);
        bump(t.types, type);
        const dice = diceOf(d);
        if (dice) {
          if (type === 'attack' && (d.targetCount ?? 1) > 1) bump(t.dice.area, dice);
          else if (type !== 'focus') bump(t.dice[type], dice);
        }
        t.fatigue.cards++;
        if (d.effects.some(e => /fatigue|enter_rage|adrenaline/.test(e.type))) t.fatigue.costs++;
      }
    }
  }
}

function body(c: Character, who: 'hero' | 'enemy'): void {
  bump(t.hand[who], c.actions.filter(a => !a.def.lastResort).length);
  bump(t.level[who], Math.max(0, ...c.skills.values()));
  bump(t.pv[who], c.maxPV);
  bump(t.armour[who], c.getPassiveArmor());
}

function fights(set: GameSet, perShape: number): void {
  const registry = theRegistry();
  set.calibration.shapes.forEach((_, i) => {
    const groups = shapeEnemies(i);
    if (!groups.length) return;
    for (let g = 0; g < perShape; g++) {
      withSeed(4242 + g, () => {
        const heroes = set.buildParty(referenceParty());
        const enemies = set.buildEncounter(groups);
        heroes.forEach(c => { c.aiControlled = true; });
        enemies.forEach(c => { c.aiControlled = true; });
        if (g === 0) {
          heroes.forEach(c => body(c, 'hero'));
          enemies.forEach(c => body(c, 'enemy'));
          bump(t.shapes, `${heroes.length}x${enemies.length}`);
        }
        const engine = new CombatEngine(heroes, enemies, { registry, maxRounds: 30, ...aiPolicy({ depth: 1 }) });
        while (!engine.isOver() && engine.round < engine.maxRounds) {
          engine.runRound();
          for (const c of [...engine.teams[0], ...engine.teams[1]]) {
            for (const [, s] of c.statuses) {
              if (!s.behavior) continue;
              t.statuses.behaving++;
              if (s.behavior.positionValue) t.statuses.priced++;
            }
          }
        }
        bump(t.rounds, engine.round);
      });
    }
  });
}

const PER_SHAPE = games(12);
for (const id of SMOKE ? ['fantasy'] : ['fantasy', 'elements']) {
  const mod = await import(id === 'fantasy' ? '@pimpampum/set-fantasy/bench' : '@pimpampum/set-elements/bench') as Record<string, GameSet>;
  const set = mod[id === 'fantasy' ? 'FANTASY' : 'ELEMENTS'];
  useSet(set);
  cards(set);
  fights(set, PER_SHAPE);
}

const total = [...t.types.values()].reduce((a, b) => a + b, 0);
console.log(`\nMeasured ${new Date().toISOString().slice(0, 10)}, ${PER_SHAPE} fights per calibration shape per set.`);
console.log('Paste into ai/src/audit/profile.ts (frozen value shown under each):\n');
const line = (name: string, measured: string, frozen: unknown): void => {
  console.log(`  ${name}: ${measured}`);
  console.log(`  ${' '.repeat(name.length)}  frozen ${JSON.stringify(frozen)}`);
};
line('speed.attack', show(t.speed.attack), PROFILE.speed.attack);
line('speed.defense', show(t.speed.defense), PROFILE.speed.defense);
line('speed.focus', show(t.speed.focus), PROFILE.speed.focus);
line('dice.attack', show(t.dice.attack), PROFILE.dice.attack);
line('dice.area', show(t.dice.area), PROFILE.dice.area);
line('dice.defense', show(t.dice.defense), PROFILE.dice.defense);
line('typeMix', `{ attack: ${((t.types.get('attack') ?? 0) / total).toFixed(2)}, defense: ${((t.types.get('defense') ?? 0) / total).toFixed(2)}, focus: ${((t.types.get('focus') ?? 0) / total).toFixed(2)} }`, PROFILE.typeMix);
line('handSize.hero', show(t.hand.hero), PROFILE.handSize.hero);
line('handSize.enemy', show(t.hand.enemy), PROFILE.handSize.enemy);
line('level.hero', show(t.level.hero), PROFILE.level.hero);
line('level.enemy', show(t.level.enemy), PROFILE.level.enemy);
line('pv.hero', show(t.pv.hero), PROFILE.pv.hero);
line('pv.enemy', show(t.pv.enemy), PROFILE.pv.enemy);
line('armour.hero', show(t.armour.hero), PROFILE.armour.hero);
line('armour.enemy', show(t.armour.enemy), PROFILE.armour.enemy);
line('fatigueCostShare', (t.fatigue.costs / Math.max(1, t.fatigue.cards)).toFixed(3), PROFILE.fatigueCostShare);
line('pricedShare', (t.statuses.priced / Math.max(1, t.statuses.behaving)).toFixed(2), PROFILE.pricedShare);
line('shapes', show(t.shapes), PROFILE.shapes);
line('rounds', show(t.rounds), PROFILE.rounds);
