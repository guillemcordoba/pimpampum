/**
 * EARTH, FIRE, AIR AND THE CREATURES, PLAYED EXACTLY — each card's own rule on
 * a hand-built one- or two-round position with scripted choices and flat dice
 * (`n`d1 + bonus), so every number is exact. The card's description is the
 * contract (CLAUDE.md). The water kit lives in cards.test.ts.
 *
 * "An enemy you choose" falls to the engine's deterministic fallback here (no
 * target policy): the first eligible enemy.
 */
import { describe, it, expect } from 'vitest';
import { type ActionDefinition, CombatEngine, DiceRoll, firstLegalChooser, withSeed } from '@pimpampum/engine';
import { armour, attackCard, defenseCard, fighter, focusCard, playRound, type Selection } from '@pimpampum/engine/testing';
import { createRegistry, getAction, getEnemy } from '../src/index.js';

const registry = createRegistry();
const wait = focusCard();

/** A card (hero or creature) by id, with flat dice: `n`d1 plus `bonus`. */
function flat(id: string, n: number, bonus = 0, over: Partial<ActionDefinition> = {}): ActionDefinition {
  const card = getAction(id) ?? enemyCard(id);
  return { ...card, dice: new DiceRoll(n, 1), rollBonus: bonus, ...over };
}

function enemyCard(id: string): ActionDefinition {
  for (const e of ['soldat-del-foc', 'shirshu', 'unagi', 'arquer-yuyan']) {
    const c = getEnemy(e)?.skills.flatMap(s => s.actions).find(a => a.id === id);
    if (c) return c;
  }
  throw new Error(`no card ${id}`);
}

/** A plain attack of exactly `total`, fast or not. */
const blow = (total: number, fast = false) => attackCard('cop', { dice: new DiceRoll(1, 1), rollBonus: total - 1, fast });
/** A defense of exactly `total`, fast or not. */
const guard = (total: number, fast = false) => defenseCard('guarda', { dice: new DiceRoll(1, 1), rollBonus: total - 1, fast });

function engineFor(team0: ReturnType<typeof fighter>[], team1: ReturnType<typeof fighter>[]): CombatEngine {
  return new CombatEngine(team0, team1, { registry, actionChooser: firstLegalChooser });
}

const sel = (team: number, idx: number, actionIdx: number, targets?: Selection['targets']): Selection =>
  ({ team, idx, actionIdx, targets });
const T = (team: number, idx: number) => [{ team, idx }];

describe('Mestre de la terra', () => {
  it('Armadura de terra: an ally has +3 on its defenses for the next rounds', () => {
    const earth = fighter('Terra', [flat('armadura-de-terra', 0), wait], { pv: 30 });
    const ally = fighter('Amic', [guard(4)], { pv: 30 });
    const foe = fighter('Foe', [wait, blow(6)], { pv: 30 });
    const engine = engineFor([earth, ally], [foe]);
    playRound(engine, [sel(0, 0, 0, T(0, 1)), sel(0, 1, 0, T(0, 1)), sel(1, 0, 0)]);
    // 6 against the guard's 4 + 3: it holds.
    playRound(engine, [sel(0, 0, 1), sel(0, 1, 0, T(0, 1)), sel(1, 0, 1, T(0, 1))]);
    expect(ally.currentPV).toBe(30);
  });

  it('Esquerda: the chosen enemy loses the dice in PV if it played a Defense this round', () => {
    const earth = fighter('Terra', [flat('esquerda', 5, 0)], { pv: 30 });
    const foe = fighter('Foe', [guard(100)], { pv: 30 });
    playRound(engineFor([earth], [foe]), [sel(0, 0, 0, T(1, 0)), sel(1, 0, 0, T(1, 0))]);
    expect(foe.currentPV).toBe(25);
  });

  it('Esquerda: nothing if the chosen enemy did not defend', () => {
    const earth = fighter('Terra', [flat('esquerda', 5, 0)], { pv: 30 });
    const foe = fighter('Foe', [wait], { pv: 30 });
    playRound(engineFor([earth], [foe]), [sel(0, 0, 0, T(1, 0)), sel(1, 0, 0)]);
    expect(foe.currentPV).toBe(30);
  });

  it('Trampa de terra: an attacker it holds is trapped — no attacks next turn', () => {
    const earth = fighter('Terra', [flat('trampa-de-terra', 1, 100)], { pv: 30 });
    const foe = fighter('Foe', [blow(4), wait], { pv: 30 });
    const engine = engineFor([earth], [foe]);
    playRound(engine, [sel(0, 0, 0, T(0, 0)), sel(1, 0, 0, T(0, 0))]);
    expect(earth.currentPV).toBe(30);
    engine.prepareRound();
    expect(engine.canPlayActionIdx(foe, 0)).toBe(false);
    expect(engine.canPlayActionIdx(foe, 1)).toBe(true);
  });

  it('Búnquer: nobody on its side attacks this round — fast attacks included', () => {
    const earth = fighter('Terra', [getAction('bunquer')!], { pv: 30 });
    const ally = fighter('Amic', [blow(5, true)], { pv: 30 });
    const foe = fighter('Foe', [wait], { pv: 30 });
    playRound(engineFor([earth, ally], [foe]), [sel(0, 0, 0), sel(0, 1, 0, T(1, 0)), sel(1, 0, 0)]);
    expect(foe.currentPV).toBe(30);
  });

  it('Allau: a second burial in the same round does not add a lost turn', () => {
    const e1 = fighter('T1', [flat('allau', 1, 5)], { pv: 30 });
    const e2 = fighter('T2', [flat('allau', 1, 5)], { pv: 30 });
    const foe = fighter('Foe', [wait], { pv: 30 });
    playRound(engineFor([e1, e2], [foe]), [sel(0, 0, 0, T(1, 0)), sel(0, 1, 0, T(1, 0)), sel(1, 0, 0)]);
    expect(foe.skipTurns).toBe(1);
  });

  it('Trampa de terra: the trapped attacker cannot attack for two rounds', () => {
    const earth = fighter('Terra', [flat('trampa-de-terra', 1, 100), wait], { pv: 30 });
    const foe = fighter('Foe', [blow(4), wait], { pv: 30 });
    const engine = engineFor([earth], [foe]);
    playRound(engine, [sel(0, 0, 0, T(0, 0)), sel(1, 0, 0, T(0, 0))]);
    playRound(engine, [sel(0, 0, 1), sel(1, 0, 1)]);
    engine.prepareRound();
    expect(engine.canPlayActionIdx(foe, 0)).toBe(false);
  });

  it('Mur de pedra: it still stands before whoever it covered the round after, then falls', () => {
    const earth = fighter('Terra', [flat('mur-de-pedra', 1, 9), wait], { pv: 30 });
    const ally = fighter('Amic', [wait], { pv: 30 });
    const foe = fighter('Foe', [wait, blow(5)], { pv: 30 });
    const engine = engineFor([earth, ally], [foe]);
    playRound(engine, [sel(0, 0, 0, T(0, 1)), sel(0, 1, 0), sel(1, 0, 0)]);
    // Next round the stone still stands before the ally: 5 against 1 + 9.
    playRound(engine, [sel(0, 0, 1), sel(0, 1, 0), sel(1, 0, 1, T(0, 1))]);
    expect(ally.currentPV).toBe(30);
    playRound(engine, [sel(0, 0, 1), sel(0, 1, 0), sel(1, 0, 1, T(0, 1))]);
    expect(ally.currentPV).toBe(25);
  });

  it("Sorres movedisses: the chosen enemy's card resolves last — a Defense after the blow it was for", () => {
    const earth = fighter('Terra', [flat('sorres-movedisses', 0)], { pv: 30 });
    const ally = fighter('Amic', [blow(5)], { pv: 30 });
    const foe = fighter('Foe', [guard(100)], { pv: 30 });
    playRound(engineFor([earth, ally], [foe]), [sel(0, 0, 0, T(1, 0)), sel(0, 1, 0, T(1, 0)), sel(1, 0, 0, T(1, 0))]);
    expect(foe.currentPV).toBe(25);
  });

  it('Allau: a target it wounds is buried and loses its next turn', () => {
    const earth = fighter('Terra', [flat('allau', 1, 2)], { pv: 30 });
    const foe = fighter('Foe', [wait], { pv: 30 });
    playRound(engineFor([earth], [foe]), [sel(0, 0, 0, T(1, 0)), sel(1, 0, 0)]);
    expect(foe.currentPV).toBe(27);
    expect(foe.skipTurns).toBe(1);
  });

  it('Búnquer: one defense over the whole party, and nobody on the side attacks', () => {
    const earth = fighter('Terra', [flat('bunquer', 1, 100)], { pv: 30 });
    const ally = fighter('Amic', [blow(5)], { pv: 30 });
    const foe = fighter('Foe', [blow(6)], { pv: 30 });
    playRound(engineFor([earth, ally], [foe]), [sel(0, 0, 0), sel(0, 1, 0, T(1, 0)), sel(1, 0, 0, T(0, 1))]);
    expect(ally.currentPV).toBe(30);
    expect(foe.currentPV).toBe(30);
  });

  it('Roca viva: a stone golem joins the side; 2 fatigue', () => {
    const earth = fighter('Terra', [flat('roca-viva', 0)], { pv: 30 });
    const foe = fighter('Foe', [wait], { pv: 30 });
    const engine = engineFor([earth], [foe]);
    playRound(engine, [sel(0, 0, 0), sel(1, 0, 0)]);
    expect(engine.teams[0].length).toBe(2);
    expect(engine.teams[0][1].maxPV).toBe(26);
    expect(earth.fatigue).toBe(2);
  });

  it('Terratrèmol: every enemy is struck', () => {
    const earth = fighter('Terra', [flat('terratremol', 1, 3)], { pv: 30 });
    const a = fighter('A', [wait], { pv: 30 });
    const b = fighter('B', [wait], { pv: 30 });
    playRound(engineFor([earth], [a, b]), [sel(0, 0, 0), sel(1, 0, 0), sel(1, 1, 0)]);
    expect([a.currentPV, b.currentPV]).toEqual([26, 26]);
  });
});

describe('Mestre del foc', () => {
  it('Bola de foc: a target it wounds is burned — 2 PV at the end of this round and the next', () => {
    const fire = fighter('Foc', [flat('bola-de-foc', 1, 2), wait], { pv: 30 });
    const bag = fighter('Sac', [wait], { pv: 30 });
    const engine = engineFor([fire], [bag]);
    playRound(engine, [sel(0, 0, 0, T(1, 0)), sel(1, 0, 0)]);
    expect(bag.currentPV).toBe(30 - 3 - 2);
    playRound(engine, [sel(0, 0, 1), sel(1, 0, 0)]);
    expect(bag.currentPV).toBe(23);
    playRound(engine, [sel(0, 0, 1), sel(1, 0, 0)]);
    expect(bag.currentPV).toBe(23);
  });

  it('Bola de foc: burning again restarts the two rounds, never stacks', () => {
    const fire = fighter('Foc', [flat('bola-de-foc', 1, 0), wait], { pv: 30 });
    const bag = fighter('Sac', [wait], { pv: 30 });
    const engine = engineFor([fire], [bag]);
    playRound(engine, [sel(0, 0, 0, T(1, 0)), sel(1, 0, 0)]);
    playRound(engine, [sel(0, 0, 0, T(1, 0)), sel(1, 0, 0)]);
    // Two hits of 1, a burn of 2 each round end; the second restarts it.
    expect(bag.currentPV).toBe(30 - 1 - 2 - 1 - 2);
    playRound(engine, [sel(0, 0, 1), sel(1, 0, 0)]);
    expect(bag.currentPV).toBe(22);
    playRound(engine, [sel(0, 0, 1), sel(1, 0, 0)]);
    expect(bag.currentPV).toBe(22);
  });

  it('Mantell de flames: whoever attacks someone it defends loses 3 PV and is burned, held or not', () => {
    const held = (bonus: number) => {
      const fire = fighter('Foc', [flat('mantell-de-flames', 1, bonus)], { pv: 30 });
      const ally = fighter('Amic', [wait], { pv: 30 });
      const foe = fighter('Foe', [blow(4)], { pv: 30 });
      playRound(engineFor([fire, ally], [foe]), [sel(0, 0, 0, T(0, 1)), sel(0, 1, 0), sel(1, 0, 0, T(0, 1))]);
      return foe.currentPV;
    };
    expect(held(100)).toBe(25);
    expect(held(0)).toBe(25);
  });

  it('Esclat encegador: an enemy still to attack that rolls low misses; one already struck is untouched', () => {
    const fire = fighter('Foc', [flat('esclat-encegador', 0, 0, { effects: [{ type: 'flare', params: { below: 20 } }] })], { pv: 30 });
    const ally = fighter('Amic', [wait], { pv: 30 });
    const quick = fighter('Ràpid', [blow(2, true)], { pv: 30 });
    const foe = fighter('Foe', [blow(5)], { pv: 30 });
    playRound(engineFor([fire, ally], [quick, foe]), [sel(0, 0, 0), sel(0, 1, 0), sel(1, 0, 0, T(0, 1)), sel(1, 1, 0, T(0, 1))]);
    // The fast blow landed before the flash; the slow one never does.
    expect(ally.currentPV).toBe(28);
  });

  it('Esclat encegador: a roll above the threshold leaves the attack alone', () => {
    const fire = fighter('Foc', [flat('esclat-encegador', 0, 0, { effects: [{ type: 'flare', params: { below: 0 } }] })], { pv: 30 });
    const foe = fighter('Foe', [blow(5)], { pv: 30 });
    const friend = fighter('Company', [wait], { pv: 30 });
    playRound(engineFor([fire], [foe, friend]), [sel(0, 0, 0), sel(1, 0, 0, T(0, 0)), sel(1, 1, 0)]);
    expect(fire.currentPV).toBe(25);
  });

  it("Tempesta d'espurnes: every enemy loses the dice in PV, through any defense and armour", () => {
    const fire = fighter('Foc', [flat('tempesta-d-espurnes', 2, 0)], { pv: 30 });
    const a = fighter('A', [wait], { pv: 30 });
    const b = fighter('B', [guard(100)], { pv: 30 });
    playRound(engineFor([fire], [a, b]), [sel(0, 0, 0), sel(1, 0, 0), sel(1, 1, 0, T(1, 1))]);
    expect([a.currentPV, b.currentPV]).toEqual([28, 28]);
  });

  it('Incendi: a wounded target burns 2, 4, 6… at each round end; when it falls, the fire leaps to an ally', () => {
    const fire = fighter('Foc', [flat('incendi', 1, 0), wait], { pv: 30 });
    const a = fighter('A', [wait], { pv: 12 });
    const b = fighter('B', [wait], { pv: 30 });
    const engine = engineFor([fire], [a, b]);
    playRound(engine, [sel(0, 0, 0, T(1, 0)), sel(1, 0, 0), sel(1, 1, 0)]);
    // The blow's 1, then the first step's 2.
    expect(a.currentPV).toBe(9);
    playRound(engine, [sel(0, 0, 1), sel(1, 0, 0), sel(1, 1, 0)]);
    expect(a.currentPV).toBe(5);
    playRound(engine, [sel(0, 0, 1), sel(1, 0, 0), sel(1, 1, 0)]);
    expect(a.isAlive()).toBe(false);
    expect(b.hasStatus('incendi')).toBe(true);
    playRound(engine, [sel(0, 0, 1), sel(1, 1, 0)]);
    expect(b.currentPV).toBe(28);
  });

  it('Incendi: a blow that does not wound lights nothing', () => {
    const fire = fighter('Foc', [flat('incendi', 1, 0)], { pv: 30 });
    const foe = fighter('Foe', [guard(100)], { pv: 30 });
    playRound(engineFor([fire], [foe]), [sel(0, 0, 0, T(1, 0)), sel(1, 0, 0, T(1, 0))]);
    expect(foe.hasStatus('incendi')).toBe(false);
  });

  it('Fúria de flames: a blow that wounds leaves the bender untouched', () => {
    const fire = fighter('Foc', [flat('furia-de-flames', 1, 9)], { pv: 30 });
    const foe = fighter('Foe', [wait], { pv: 30 });
    playRound(engineFor([fire], [foe]), [sel(0, 0, 0, T(1, 0)), sel(1, 0, 0)]);
    expect([fire.currentPV, foe.currentPV]).toEqual([30, 20]);
    expect(fire.hasStatus('cremat')).toBe(false);
  });

  it('Fúria de flames: a blow that wounds nobody bursts around the bender, who burns with every ally', () => {
    const fire = fighter('Foc', [flat('furia-de-flames', 1, 9)], { pv: 30 });
    const ally = fighter('Amic', [wait], { pv: 30 });
    const foe = fighter('Foe', [guard(100)], { pv: 30 });
    playRound(engineFor([fire, ally], [foe]), [sel(0, 0, 0, T(1, 0)), sel(0, 1, 0), sel(1, 0, 0, T(1, 0))]);
    expect([fire.hasStatus('cremat'), ally.hasStatus('cremat'), foe.hasStatus('cremat')]).toEqual([true, true, false]);
    expect([fire.currentPV, ally.currentPV]).toEqual([28, 28]);
  });

  it('Foc interior: +10 on the bender\'s attacks for the next two rounds', () => {
    const fire = fighter('Foc', [getAction('foc-interior')!, blow(1)], { pv: 30 });
    const bag = fighter('Sac', [wait], { pv: 30 });
    const engine = engineFor([fire], [bag]);
    playRound(engine, [sel(0, 0, 0), sel(1, 0, 0)]);
    for (let r = 0; r < 3; r++) playRound(engine, [sel(0, 0, 1, T(1, 0)), sel(1, 0, 0)]);
    expect(bag.currentPV).toBe(30 - 11 - 11 - 1);
  });

  it('Anell de foc: for the next two rounds, every enemy that attacks loses 10 PV and is burned', () => {
    const fire = fighter('Foc', [getAction('anell-de-foc')!, wait], { pv: 60 });
    const foe = fighter('Foe', [wait, blow(2)], { pv: 30 });
    const idle = fighter('Quiet', [wait], { pv: 30 });
    const engine = engineFor([fire], [foe, idle]);
    playRound(engine, [sel(0, 0, 0), sel(1, 0, 0), sel(1, 1, 0)]);
    playRound(engine, [sel(0, 0, 1), sel(1, 0, 1, T(0, 0)), sel(1, 1, 0)]);
    expect(foe.currentPV).toBe(30 - 10 - 2);
    playRound(engine, [sel(0, 0, 1), sel(1, 0, 1, T(0, 0)), sel(1, 1, 0)]);
    expect(foe.currentPV).toBe(6);
    // The ring is gone; the last burn still ticks once.
    playRound(engine, [sel(0, 0, 1), sel(1, 0, 1, T(0, 0)), sel(1, 1, 0)]);
    expect(foe.currentPV).toBe(4);
    expect(idle.currentPV).toBe(30);
  });

  it('Llamp: fast, it lands before a normal defense goes up', () => {
    const fire = fighter('Foc', [flat('llamp', 1, 5)], { pv: 30 });
    const foe = fighter('Foe', [guard(100)], { pv: 30 });
    playRound(engineFor([fire], [foe]), [sel(0, 0, 0, T(1, 0)), sel(1, 0, 0, T(1, 0))]);
    expect(foe.currentPV).toBe(24);
  });

  it('Supernova: every enemy, then the bender drops to 0 PV', () => {
    const fire = fighter('Foc', [flat('supernova', 1, 4)], { pv: 30 });
    const a = fighter('A', [wait], { pv: 30 });
    const b = fighter('B', [wait], { pv: 30 });
    playRound(engineFor([fire], [a, b]), [sel(0, 0, 0), sel(1, 0, 0), sel(1, 1, 0)]);
    expect([a.currentPV, b.currentPV]).toEqual([25, 25]);
    expect(fire.currentPV).toBe(0);
    expect(fire.isAlive()).toBe(false);
  });
});

describe("Mestre de l'aire", () => {
  it('Ventada: fast, every enemy; a foe it wounds acts last — its attack, not its Defense', () => {
    const air = fighter('Aire', [flat('ventada', 1, 1)], { pv: 30 });
    const ally = fighter('Amic', [blow(5)], { pv: 30 });
    const guarded = fighter('Guàrdia', [guard(100)], { pv: 30 });
    const striker = fighter('Atacant', [blow(3)], { pv: 30 });
    const engine = engineFor([air, ally], [guarded, striker]);
    playRound(engine, [sel(0, 0, 0), sel(0, 1, 0, T(1, 0)), sel(1, 0, 0, T(1, 0)), sel(1, 1, 0, T(0, 1))]);
    // The guard still goes up (only the 2 of the gust gets through); the striker is shoved back.
    expect(guarded.currentPV).toBe(28);
    expect(engine.logEntries.some(l => /Atacant recula/.test(l.message))).toBe(true);
    expect(engine.logEntries.some(l => /Guàrdia recula/.test(l.message))).toBe(false);
  });

  it('Ràfega desviadora: a held blow is turned, whole, on an enemy', () => {
    const air = fighter('Aire', [flat('rafega-desviadora', 1, 100)], { pv: 30 });
    const foe = fighter('Foe', [blow(6)], { pv: 30 });
    playRound(engineFor([air], [foe]), [sel(0, 0, 0, T(0, 0)), sel(1, 0, 0, T(0, 0))]);
    expect(air.currentPV).toBe(30);
    expect(foe.currentPV).toBe(24);
  });

  it('Ràfega desviadora: a blow already turned aside is not turned again (no endless bounce)', () => {
    const air = fighter('Aire', [flat('rafega-desviadora', 1, 100)], { pv: 30 });
    const striker = fighter('Foe', [blow(6)], { pv: 30 });
    const mirror = fighter('Mirall', [flat('rafega-desviadora', 1, 100)], { pv: 30 });
    playRound(engineFor([air], [striker, mirror]), [sel(0, 0, 0, T(0, 0)), sel(1, 0, 0, T(0, 0)), sel(1, 1, 0, T(1, 0))]);
    // Turned on the striker, held by the mirror's gust, and there it stops.
    expect([air.currentPV, striker.currentPV, mirror.currentPV]).toEqual([30, 30, 30]);
  });

  it('Asfíxia: unless someone wounds the bender, the chosen enemy falls at the end of next round; 2 fatigue', () => {
    const air = fighter('Aire', [flat('asfixia', 0), wait], { pv: 30 });
    const foe = fighter('Foe', [wait], { pv: 30 });
    const engine = engineFor([air], [foe]);
    playRound(engine, [sel(0, 0, 0, T(1, 0)), sel(1, 0, 0)]);
    expect(air.fatigue).toBe(2);
    expect(foe.currentPV).toBe(30);
    playRound(engine, [sel(0, 0, 1), sel(1, 0, 0)]);
    expect(foe.isAlive()).toBe(false);
  });

  it('Asfíxia: a wound on the bender breaks the choke', () => {
    const air = fighter('Aire', [flat('asfixia', 0), wait], { pv: 30 });
    const foe = fighter('Foe', [wait, blow(3)], { pv: 30 });
    const engine = engineFor([air], [foe]);
    playRound(engine, [sel(0, 0, 0, T(1, 0)), sel(1, 0, 0)]);
    playRound(engine, [sel(0, 0, 1), sel(1, 0, 1, T(0, 0))]);
    playRound(engine, [sel(0, 0, 1), sel(1, 0, 0)]);
    expect(foe.currentPV).toBe(30);
    expect(foe.hasStatus('asfixia')).toBe(false);
  });

  it("Vent a favor: the ally's card resolves right after it, before the normal guards, with +4", () => {
    const air = fighter('Aire', [flat('vent-a-favor', 0)], { pv: 30 });
    const ally = fighter('Amic', [blow(5)], { pv: 30 });
    const foe = fighter('Foe', [guard(100)], { pv: 30 });
    playRound(engineFor([air, ally], [foe]), [sel(0, 0, 0, T(0, 1)), sel(0, 1, 0, T(1, 0)), sel(1, 0, 0, T(1, 0))]);
    expect(foe.currentPV).toBe(21);
  });

  it('Fulles de vent: two blows, one at each chosen enemy', () => {
    const air = fighter('Aire', [flat('fulles-de-vent', 1, 2)], { pv: 30 });
    const a = fighter('A', [wait], { pv: 30 });
    const b = fighter('B', [wait], { pv: 30 });
    const c = fighter('C', [wait], { pv: 30 });
    playRound(engineFor([air], [a, b, c]), [sel(0, 0, 0, [{ team: 1, idx: 0 }, { team: 1, idx: 2 }]), sel(1, 0, 0), sel(1, 1, 0), sel(1, 2, 0)]);
    expect([a.currentPV, b.currentPV, c.currentPV]).toEqual([27, 30, 27]);
  });

  it('Fulles de vent: the picks may repeat — both blades at one enemy', () => {
    const air = fighter('Aire', [flat('fulles-de-vent', 1, 2)], { pv: 30 });
    const a = fighter('A', [wait], { pv: 30 });
    const b = fighter('B', [wait], { pv: 30 });
    playRound(engineFor([air], [a, b]), [sel(0, 0, 0, [{ team: 1, idx: 0 }, { team: 1, idx: 0 }]), sel(1, 0, 0), sel(1, 1, 0)]);
    expect([a.currentPV, b.currentPV]).toEqual([24, 30]);
  });

  it('Fulles de vent: with one enemy chosen, both blows go at it, each against its own roll', () => {
    const air = fighter('Aire', [flat('fulles-de-vent', 1, 2)], { pv: 30 });
    const foe = fighter('Foe', [wait], { pv: 30, equipment: [armour(1)] });
    playRound(engineFor([air], [foe]), [sel(0, 0, 0, T(1, 0)), sel(1, 0, 0)]);
    expect(foe.currentPV).toBe(30 - 2 * (3 - 1));
  });

  it('Finta a contrapeu: a held blow leaves the attacker −6 on its attacks and its defenses next round', () => {
    const air = fighter('Aire', [flat('finta-a-contrapeu', 1, 100), blow(4)], { pv: 30 });
    const foe = fighter('Foe', [blow(5), guard(5), blow(5)], { pv: 30 });
    const engine = engineFor([air], [foe]);
    playRound(engine, [sel(0, 0, 0, T(0, 0)), sel(1, 0, 0, T(0, 0))]);
    expect(air.currentPV).toBe(30);
    // Its guard of 5 rolls nothing against the 4.
    playRound(engine, [sel(0, 0, 1, T(1, 0)), sel(1, 0, 1, T(1, 0))]);
    expect(foe.currentPV).toBe(26);
  });

  it('Finta a contrapeu: the attacker blows land 6 softer next round', () => {
    const air = fighter('Aire', [flat('finta-a-contrapeu', 1, 100), wait], { pv: 30 });
    const foe = fighter('Foe', [blow(8)], { pv: 30 });
    const engine = engineFor([air], [foe]);
    playRound(engine, [sel(0, 0, 0, T(0, 0)), sel(1, 0, 0, T(0, 0))]);
    playRound(engine, [sel(0, 0, 1), sel(1, 0, 0, T(0, 0))]);
    expect(air.currentPV).toBe(28);
  });

  it("Coixí d'aire: this round every blow on the side lands 6 softer", () => {
    const air = fighter('Aire', [flat('coixi-d-aire', 0)], { pv: 30 });
    const ally = fighter('Amic', [wait], { pv: 30 });
    const f1 = fighter('F1', [blow(8)], { pv: 30 });
    const f2 = fighter('F2', [blow(5)], { pv: 30 });
    playRound(engineFor([air, ally], [f1, f2]), [sel(0, 0, 0), sel(0, 1, 0), sel(1, 0, 0, T(0, 1)), sel(1, 1, 0, T(0, 0))]);
    expect([air.currentPV, ally.currentPV]).toEqual([30, 28]);
  });

  it('Contracorrent: the rest of the round runs backwards, so a normal guard comes up after the blow', () => {
    const air = fighter('Aire', [flat('contracorrent', 0)], { pv: 30 });
    const ally = fighter('Amic', [guard(100)], { pv: 30 });
    const foe = fighter('Foe', [blow(5)], { pv: 30 });
    playRound(engineFor([air, ally], [foe]), [sel(0, 0, 0), sel(0, 1, 0, T(0, 1)), sel(1, 0, 0, T(0, 1))]);
    expect(ally.currentPV).toBe(25);
  });

  it('Contracorrent: a fast guard, up before it, still holds', () => {
    const air = fighter('Aire', [flat('contracorrent', 0)], { pv: 30 });
    const ally = fighter('Amic', [guard(100, true)], { pv: 30 });
    const foe = fighter('Foe', [blow(5)], { pv: 30 });
    playRound(engineFor([air, ally], [foe]), [sel(0, 0, 0), sel(0, 1, 0, T(0, 1)), sel(1, 0, 0, T(0, 1))]);
    expect(ally.currentPV).toBe(30);
  });

  it('Remolí: for the next two rounds the chosen enemy plays no card and nobody can aim at it', () => {
    const air = fighter('Aire', [flat('remoli-de-vent', 0), wait], { pv: 30 });
    const foe = fighter('Foe', [wait], { pv: 30 });
    const other = fighter('Altre', [wait], { pv: 30 });
    const engine = engineFor([air], [foe, other]);
    playRound(engine, [sel(0, 0, 0, T(1, 0)), sel(1, 0, 0), sel(1, 1, 0)]);
    expect(foe.skipTurns).toBe(2);
    expect(engine.enemiesOf(air)).toEqual([other]);
    playRound(engine, [sel(0, 0, 1), sel(1, 1, 0)]);
    expect(engine.enemiesOf(air)).toEqual([other]);
    playRound(engine, [sel(0, 0, 1), sel(1, 1, 0)]);
    expect(engine.enemiesOf(air)).toEqual([foe, other]);
  });

  it('Remolí: never two rounds running', () => {
    // Unlocked from level 0: the test fighter knows no level of the skill.
    const air = fighter('Aire', [flat('remoli-de-vent', 0, 0, { unlockLevel: 0 }), wait], { pv: 30 });
    const foe = fighter('Foe', [wait], { pv: 30 });
    const other = fighter('Altre', [wait], { pv: 30 });
    const engine = engineFor([air], [foe, other]);
    playRound(engine, [sel(0, 0, 0, T(1, 0)), sel(1, 0, 0), sel(1, 1, 0)]);
    expect(engine.canPlayActionIdx(air, 0)).toBe(false);
    playRound(engine, [sel(0, 0, 1), sel(1, 1, 0)]);
    playRound(engine, [sel(0, 0, 1), sel(1, 1, 0)]);
    expect(engine.canPlayActionIdx(air, 0)).toBe(true);
  });

  it('Tornado: every enemy; the wounded lose their next turn; 2 fatigue', () => {
    const air = fighter('Aire', [flat('tornado', 1, 2)], { pv: 30 });
    const a = fighter('A', [wait], { pv: 30 });
    const b = fighter('B', [wait], { pv: 30 });
    playRound(engineFor([air], [a, b]), [sel(0, 0, 0), sel(1, 0, 0), sel(1, 1, 0)]);
    expect([a.currentPV, b.currentPV]).toEqual([27, 27]);
    expect([a.skipTurns, b.skipTurns]).toEqual([1, 1]);
    expect(air.fatigue).toBe(2);
  });
});

describe('Soldat del foc', () => {
  it('Punyals de foc: +2 against a target that already lost PV this round', () => {
    const s = fighter('Soldat', [flat('punyals-de-foc', 1, 1, {})], { pv: 30 });
    const hero = fighter('Heroi', [wait], { pv: 30 });
    const hitter = fighter('Primer', [blow(1, true)], { pv: 30 });
    playRound(engineFor([s, hitter], [hero]), [sel(0, 0, 0, T(1, 0)), sel(0, 1, 0, T(1, 0)), sel(1, 0, 0)]);
    expect(hero.currentPV).toBe(30 - 1 - 4);
  });

  it('Calar foc: every hero is burned, 2 PV at the end of this round and the next; a second torch does not stack', () => {
    const s1 = fighter('S1', [getAction('calar-foc') ?? flat('calar-foc', 0), wait], { pv: 30 });
    const s2 = fighter('S2', [flat('calar-foc', 0), wait], { pv: 30 });
    const hero = fighter('Heroi', [wait], { pv: 30 });
    const engine = engineFor([s1, s2], [hero]);
    playRound(engine, [sel(0, 0, 0), sel(0, 1, 0), sel(1, 0, 0)]);
    expect(hero.currentPV).toBe(28);
    for (let i = 0; i < 3; i++) playRound(engine, [sel(0, 0, 1), sel(0, 1, 1), sel(1, 0, 0)]);
    expect(hero.currentPV).toBe(26);
  });

  it('Foc en formació: +2 for every other soldier playing it this round (+6 at most)', () => {
    const card = flat('foc-en-formacio', 1);
    const soldiers = [1, 2, 3].map(i => fighter(`S${i}`, [card], { pv: 30 }));
    const hero = fighter('Heroi', [wait], { pv: 100 });
    playRound(engineFor(soldiers, [hero]), [...soldiers.map((_, i) => sel(0, i, 0, T(1, 0))), sel(1, 0, 0)]);
    expect(hero.currentPV).toBe(100 - 3 * 5);
  });
});

describe('Shirshu', () => {
  it('Llengua paralitzant: a wound costs the next action, a deep one (5+) the next two; never stacks', () => {
    const sh = fighter('Shirshu', [flat('llengua-paralitzant', 1, 1)], { pv: 30 });
    const deep = fighter('Shirshu2', [flat('llengua-paralitzant', 1, 5)], { pv: 30 });
    const a = fighter('A', [wait], { pv: 30 });
    const b = fighter('B', [wait], { pv: 30 });
    playRound(engineFor([sh, deep], [a, b]), [sel(0, 0, 0, T(1, 0)), sel(0, 1, 0, T(1, 1)), sel(1, 0, 0), sel(1, 1, 0)]);
    expect([a.skipTurns, b.skipTurns]).toEqual([1, 2]);
  });

  it('Bava paralitzant: a hold costs the attacker its next action', () => {
    const sh = fighter('Shirshu', [flat('bava-paralitzant', 1, 100)], { pv: 30 });
    const hero = fighter('Heroi', [blow(4)], { pv: 30 });
    playRound(engineFor([sh], [hero]), [sel(0, 0, 0, T(0, 0)), sel(1, 0, 0, T(0, 0))]);
    expect(hero.skipTurns).toBe(1);
  });

  it("Rastre d'olor: the tracked hero's allies cannot defend it against shirshus", () => {
    const sh = fighter('Shirshu', [flat('rastre-d-olor', 0), blow(6)], { pv: 30, level: 0 });
    sh.skills.set('shirshu', 4);
    const hero = fighter('Heroi', [wait], { pv: 30 });
    const tank = fighter('Tanc', [guard(100)], { pv: 30 });
    const engine = engineFor([sh], [hero, tank]);
    playRound(engine, [sel(0, 0, 0, T(1, 0)), sel(1, 0, 0), sel(1, 1, 0, T(1, 0))]);
    playRound(engine, [sel(0, 0, 1, T(1, 0)), sel(1, 0, 0), sel(1, 1, 0, T(1, 0))]);
    expect(hero.currentPV).toBe(24);
  });

  it('Llengotades a cegues: three lashes, each at a random combatant, the wounded paralysed', () => {
    const sh = fighter('Shirshu', [flat('llengotades-a-cegues', 1, 3)], { pv: 30 });
    const ally = fighter('Company', [wait], { pv: 30 });
    const heroes = [1, 2, 3].map(i => fighter(`H${i}`, [wait], { pv: 30 }));
    const engine = engineFor([sh, ally], heroes);
    playRound(engine, [sel(0, 0, 0), sel(0, 1, 0), ...heroes.map((_, i) => sel(1, i, 0))]);
    const lost = [ally, ...heroes].reduce((n, c) => n + (30 - c.currentPV), 0);
    expect(lost).toBe(3 * 4);
  });
});

describe('Unagi', () => {
  it("Canó d'aigua: also lands, whole, on everyone defending the target", () => {
    const eel = fighter('Unagi', [flat('cano-d-aigua', 1, 7)], { pv: 50 });
    const hero = fighter('Heroi', [wait], { pv: 30 });
    const tank = fighter('Tanc', [guard(5)], { pv: 30 });
    playRound(engineFor([eel], [hero, tank]), [sel(0, 0, 0, T(1, 0)), sel(1, 0, 0), sel(1, 1, 0, T(1, 0))]);
    // The breached guard's 3, and the 8 whole on the tank, open while it guards the hero.
    expect(tank.currentPV).toBe(19);
  });

  it('Remolí: every hero whose blow it holds takes the margin back', () => {
    // Defense 10 against blows of 4 and 6: the attackers take 6 and 4.
    const eel = fighter('Unagi', [flat('remoli', 1, 9)], { pv: 50 });
    const h1 = fighter('H1', [blow(4)], { pv: 30 });
    const h2 = fighter('H2', [blow(6)], { pv: 30 });
    playRound(engineFor([eel], [h1, h2]), [sel(0, 0, 0), sel(1, 0, 0, T(0, 0)), sel(1, 1, 0, T(0, 0))]);
    expect(eel.currentPV).toBe(50);
    expect([h1.currentPV, h2.currentPV]).toEqual([24, 26]);
  });

  it('Capbussada: next round its attacks cannot be defended', () => {
    const eel = fighter('Unagi', [flat('capbussada', 1, 100), blow(6)], { pv: 50 });
    const hero = fighter('Heroi', [guard(100)], { pv: 30 });
    const engine = engineFor([eel], [hero]);
    playRound(engine, [sel(0, 0, 0, T(0, 0)), sel(1, 0, 0, T(1, 0))]);
    playRound(engine, [sel(0, 0, 1, T(1, 0)), sel(1, 0, 0, T(1, 0))]);
    expect(hero.currentPV).toBe(24);
  });

  it('Onada de cua: every hero', () => {
    const eel = fighter('Unagi', [flat('onada-de-cua', 1, 2)], { pv: 50 });
    const heroes = [1, 2].map(i => fighter(`H${i}`, [wait], { pv: 30 }));
    playRound(engineFor([eel], heroes), [sel(0, 0, 0), sel(1, 0, 0), sel(1, 1, 0)]);
    expect(heroes.map(h => h.currentPV)).toEqual([27, 27]);
  });

  it('Engolir: the swallowed hero is out of reach and out of the fight, digests 2 a round, and is spat out after a 6-PV round', () => {
    const eel = fighter('Unagi', [flat('engolir', 1, 3), wait], { pv: 50 });
    const hero = fighter('Heroi', [wait], { pv: 30 });
    const friend = fighter('Amic', [wait, blow(6)], { pv: 30 });
    const engine = engineFor([eel], [hero, friend]);
    playRound(engine, [sel(0, 0, 0, T(1, 0)), sel(1, 0, 0), sel(1, 1, 0)]);
    expect(hero.hasStatus('engolit')).toBe(true);
    expect(hero.currentPV).toBe(30 - 4 - 2);
    expect(engine.enemiesOf(eel)).toEqual([friend]);
    // The friend hurts the eel for 6 in one round: the hero is spat out.
    playRound(engine, [sel(0, 0, 1), sel(1, 1, 1, T(0, 0))]);
    expect(hero.hasStatus('engolit')).toBe(false);
    expect(hero.skipTurns).toBe(0);
  });
});

describe('Arquer yuyan', () => {
  it("Fletxa a l'escletxa: ignores armour", () => {
    const archer = fighter('Arquer', [flat('fletxa-a-l-escletxa', 1, 3)], { pv: 30 });
    const hero = fighter('Heroi', [wait], { pv: 30, equipment: [armour(2)] });
    playRound(engineFor([archer], [hero]), [sel(0, 0, 0, T(1, 0)), sel(1, 0, 0)]);
    expect(hero.currentPV).toBe(26);
  });

  it('Fletxa de senyal: calls a fire soldier, at most two per archer', () => {
    const archer = fighter('Arquer', [flat('fletxa-de-senyal', 0)], { pv: 20 });
    const hero = fighter('Heroi', [wait], { pv: 30 });
    const engine = engineFor([archer], [hero]);
    for (let i = 0; i < 3; i++) playRound(engine, [sel(0, 0, 0), sel(1, 0, 0)]);
    expect(engine.teams[0].length).toBe(3);
    expect(engine.teams[0][1].maxPV).toBe(21);
  });

  it("Clavar a l'arbre: no damage, and until the end of next round nobody can defend the target", () => {
    const archer = fighter('Arquer', [flat('clavar-a-l-arbre', 1, 3), blow(5)], { pv: 30 });
    const hero = fighter('Heroi', [wait, guard(100)], { pv: 30 });
    const engine = engineFor([archer], [hero]);
    playRound(engine, [sel(0, 0, 0, T(1, 0)), sel(1, 0, 0)]);
    expect(hero.currentPV).toBe(30);
    playRound(engine, [sel(0, 0, 1, T(1, 0)), sel(1, 0, 1, T(1, 0))]);
    expect(hero.currentPV).toBe(25);
  });
});
