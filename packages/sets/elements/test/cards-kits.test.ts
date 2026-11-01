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
  it('Guant de pedra: after the punch, the rock defends the bender for the rest of the round', () => {
    const earth = fighter('Terra', [flat('guant-de-pedra', 1, 10)], { pv: 30 });
    const bag = fighter('Sac', [wait], { pv: 30 });
    const foe = fighter('Foe', [blow(5)], { pv: 30 });
    playRound(engineFor([earth], [bag, foe]), [sel(0, 0, 0, T(1, 0)), sel(1, 0, 0), sel(1, 1, 0, T(0, 0))]);
    expect(bag.currentPV).toBe(19);
    expect(earth.currentPV).toBe(30);
  });

  it('Mur ariet: a block that holds rams the attacker once with the card\'s own dice', () => {
    // The ram rolls the card's dice (1d1 = 1), undefended.
    const earth = fighter('Terra', [flat('mur-ariet', 1, 100)], { pv: 30 });
    const ally = fighter('Amic', [wait], { pv: 30 });
    const foe = fighter('Foe', [blow(4)], { pv: 30 });
    playRound(engineFor([earth, ally], [foe]), [sel(0, 0, 0, T(1, 0)), sel(0, 1, 0), sel(1, 0, 0, T(0, 1))]);
    expect(ally.currentPV).toBe(30);
    expect(foe.currentPV).toBe(29);
  });

  it('Sentit sísmic: next round the bender\'s side chooses after the enemies, and sees their cards', () => {
    const earth = fighter('Terra', [getAction('sentit-sismic')!, wait], { pv: 30 });
    const ally = fighter('Amic', [wait], { pv: 30 });
    const foe = fighter('Foe', [wait, blow(3)], { pv: 30 });
    const engine = engineFor([earth, ally], [foe]);
    playRound(engine, [sel(0, 0, 0), sel(0, 1, 0), sel(1, 0, 0)]);
    engine.prepareRound();
    engine.planActions([sel(0, 0, 1), sel(0, 1, 0), sel(1, 0, 1, T(0, 0))]);
    expect(engine.revealedPlanFor(earth)).toEqual([{ team: 1, idx: 0, actionIdx: 1 }]);
    expect(engine.revealedPlanFor(ally)).toEqual([{ team: 1, idx: 0, actionIdx: 1 }]);
    expect(engine.revealedPlanFor(foe)).toEqual([]);
  });

  it('Armadura de roca: +1 armour for the rest of the fight each time, up to +3', () => {
    const earth = fighter('Terra', [flat('armadura-de-roca', 1, 100)], { pv: 30 });
    const foe = fighter('Foe', [wait], { pv: 30 });
    const engine = engineFor([earth], [foe]);
    for (let i = 0; i < 4; i++) playRound(engine, [sel(0, 0, 0, T(0, 0)), sel(1, 0, 0)]);
    expect(earth.getPassiveArmor()).toBe(3);
  });

  it('Sorra movedissa: a wounded target cannot play Defenses next turn', () => {
    const earth = fighter('Terra', [flat('sorra-movedissa', 1, 4)], { pv: 30 });
    const foe = fighter('Foe', [guard(1), wait], { pv: 30 });
    const engine = engineFor([earth], [foe]);
    playRound(engine, [sel(0, 0, 0, T(1, 0)), sel(1, 0, 1)]);
    engine.prepareRound();
    expect(engine.canPlayActionIdx(foe, 0)).toBe(false);
  });

  it('Doblegar el metall: ignores armour, and a wound strips the target\'s armour for good', () => {
    const earth = fighter('Terra', [flat('doblegar-el-metall', 1, 4)], { pv: 30 });
    const foe = fighter('Foe', [wait], { pv: 30, equipment: [armour(2)] });
    playRound(engineFor([earth], [foe]), [sel(0, 0, 0, T(1, 0)), sel(1, 0, 0)]);
    expect(foe.currentPV).toBe(25);
    expect(foe.getPassiveArmor()).toBe(0);
  });

  it('Cúpula de pedra: the dome keeps defending the party in later rounds until a blow beats it', () => {
    const earth = fighter('Terra', [flat('cupula-de-pedra', 1, 100), wait], { pv: 30 });
    const ally = fighter('Amic', [wait], { pv: 30 });
    const foe = fighter('Foe', [wait, blow(10)], { pv: 30 });
    const engine = engineFor([earth, ally], [foe]);
    playRound(engine, [sel(0, 0, 0), sel(0, 1, 0), sel(1, 0, 0)]);
    playRound(engine, [sel(0, 0, 1), sel(0, 1, 0), sel(1, 0, 1, T(0, 1))]);
    expect(ally.currentPV).toBe(30);
    expect(ally.hasStatus('cupula-de-pedra')).toBe(true);
  });

  it('Mà de la terra: the wounded target is hurled into another enemy, who takes the same damage', () => {
    const earth = fighter('Terra', [flat('ma-de-la-terra', 1, 4)], { pv: 30 });
    const a = fighter('A', [wait], { pv: 30 });
    const b = fighter('B', [wait], { pv: 30 });
    playRound(engineFor([earth], [a, b]), [sel(0, 0, 0, T(1, 0)), sel(1, 0, 0), sel(1, 1, 0)]);
    expect([a.currentPV, b.currentPV]).toEqual([25, 25]);
  });

  it('Puny de la muntanya: +1 per attack aimed at the bender this fight, and it costs a fatigue level', () => {
    const earth = fighter('Terra', [wait, flat('puny-de-la-muntanya', 1)], { pv: 30 });
    const f1 = fighter('F1', [blow(1), wait], { pv: 30 });
    const f2 = fighter('F2', [blow(1), wait], { pv: 30 });
    const engine = engineFor([earth], [f1, f2]);
    playRound(engine, [sel(0, 0, 0), sel(1, 0, 0, T(0, 0)), sel(1, 1, 0, T(0, 0))]);
    playRound(engine, [sel(0, 0, 1, T(1, 0)), sel(1, 0, 1), sel(1, 1, 1)]);
    expect(f1.currentPV).toBe(27);
    expect(earth.fatigue).toBe(1);
  });

  it('Partir la terra: every enemy wounded falls in; next round each climbs out (its action) or takes the wound again', () => {
    // 3 to each. A (30) can afford it: stays, and the earth closes on it for 3
    // more as the next round opens. B (8) cannot: it climbs out, losing its
    // next action.
    const earth = fighter('Terra', [flat('partir-la-terra', 1, 2)], { pv: 30 });
    const a = fighter('A', [wait], { pv: 30 });
    const b = fighter('B', [wait], { pv: 8 });
    const engine = engineFor([earth], [a, b]);
    playRound(engine, [sel(0, 0, 0), sel(1, 0, 0), sel(1, 1, 0)]);
    expect([a.currentPV, b.currentPV]).toEqual([27, 5]);
    expect(b.skipTurns).toBe(1);
    expect(earth.fatigue).toBe(2);
    engine.prepareRound();
    expect(a.currentPV).toBe(24);
    expect(b.currentPV).toBe(5);
  });
});

describe('Mestre del foc', () => {
  it('Bola de foc: a target it wounds is burned — 1 PV at the end of this round and the next', () => {
    const fire = fighter('Foc', [flat('bola-de-foc', 1, 2), wait], { pv: 30 });
    const bag = fighter('Sac', [wait], { pv: 30 });
    const engine = engineFor([fire], [bag]);
    playRound(engine, [sel(0, 0, 0, T(1, 0)), sel(1, 0, 0)]);
    expect(bag.currentPV).toBe(30 - 3 - 1);
    playRound(engine, [sel(0, 0, 1), sel(1, 0, 0)]);
    expect(bag.currentPV).toBe(25);
    playRound(engine, [sel(0, 0, 1), sel(1, 0, 0)]);
    expect(bag.currentPV).toBe(25);
  });

  it('Bola de foc: burning again restarts the two rounds, never stacks', () => {
    const fire = fighter('Foc', [flat('bola-de-foc', 1, 0), wait], { pv: 30 });
    const bag = fighter('Sac', [wait], { pv: 30 });
    const engine = engineFor([fire], [bag]);
    playRound(engine, [sel(0, 0, 0, T(1, 0)), sel(1, 0, 0)]);
    playRound(engine, [sel(0, 0, 0, T(1, 0)), sel(1, 0, 0)]);
    // Two hits of 1, a burn each round end; the second restarts it.
    expect(bag.currentPV).toBe(30 - 1 - 1 - 1 - 1);
    playRound(engine, [sel(0, 0, 1), sel(1, 0, 0)]);
    expect(bag.currentPV).toBe(25);
    playRound(engine, [sel(0, 0, 1), sel(1, 0, 0)]);
    expect(bag.currentPV).toBe(25);
  });

  it('Mantell de flames: whoever attacks someone it defends is burned, held or not', () => {
    const held = (bonus: number) => {
      const fire = fighter('Foc', [flat('mantell-de-flames', 1, bonus)], { pv: 30 });
      const ally = fighter('Amic', [wait], { pv: 30 });
      const foe = fighter('Foe', [blow(4)], { pv: 30 });
      playRound(engineFor([fire, ally], [foe]), [sel(0, 0, 0, T(0, 1)), sel(0, 1, 0), sel(1, 0, 0, T(0, 1))]);
      return foe.currentPV;
    };
    expect(held(100)).toBe(29);
    expect(held(0)).toBe(29);
  });

  it('Esclat: an enemy still to attack that rolls low hits a random combatant — never itself', () => {
    withSeed(7, () => {
      const fire = fighter('Foc', [flat('esclat', 0, 0, { effects: [{ type: 'flare', params: { below: 20 } }] })], { pv: 30 });
      const ally = fighter('Amic', [wait], { pv: 30 });
      const foe = fighter('Foe', [blow(5)], { pv: 30 });
      const friend = fighter('Company', [wait], { pv: 30 });
      playRound(engineFor([fire, ally], [foe, friend]), [sel(0, 0, 0), sel(0, 1, 0), sel(1, 0, 0, T(0, 0)), sel(1, 1, 0)]);
      expect(foe.currentPV).toBe(30);
      expect(fire.currentPV + ally.currentPV + friend.currentPV).toBe(90 - 5);
    });
  });

  it('Esclat: a roll above the threshold leaves the attack where it aimed', () => {
    const fire = fighter('Foc', [flat('esclat', 0, 0, { effects: [{ type: 'flare', params: { below: 0 } }] })], { pv: 30 });
    const foe = fighter('Foe', [blow(5)], { pv: 30 });
    const friend = fighter('Company', [wait], { pv: 30 });
    playRound(engineFor([fire], [foe, friend]), [sel(0, 0, 0), sel(1, 0, 0, T(0, 0)), sel(1, 1, 0)]);
    expect(fire.currentPV).toBe(25);
  });

  it("Tempesta d'espurnes: every enemy loses 2 PV, through any defense", () => {
    const fire = fighter('Foc', [flat('tempesta-d-espurnes', 0, 0)], { pv: 30 });
    const a = fighter('A', [wait], { pv: 30 });
    const b = fighter('B', [guard(100)], { pv: 30 });
    playRound(engineFor([fire], [a, b]), [sel(0, 0, 0), sel(1, 0, 0), sel(1, 1, 0, T(1, 1))]);
    expect([a.currentPV, b.currentPV]).toEqual([28, 28]);
  });

  it("Pell d'obsidiana: it still defends the round after, then falls", () => {
    const fire = fighter('Foc', [flat('pell-d-obsidiana', 1, 9), wait], { pv: 30 });
    const ally = fighter('Amic', [wait], { pv: 30 });
    const foe = fighter('Foe', [wait, blow(5)], { pv: 30 });
    const engine = engineFor([fire, ally], [foe]);
    playRound(engine, [sel(0, 0, 0, T(0, 1)), sel(0, 1, 0), sel(1, 0, 0)]);
    // Next round the skin still stands before the ally: 5 against 1 + 9.
    playRound(engine, [sel(0, 0, 1), sel(0, 1, 0), sel(1, 0, 1, T(0, 1))]);
    expect(ally.currentPV).toBe(30);
    playRound(engine, [sel(0, 0, 1), sel(0, 1, 0), sel(1, 0, 1, T(0, 1))]);
    expect(ally.currentPV).toBe(25);
  });

  it('Alè de drac: two enemies, and the ones it wounds are burned', () => {
    const fire = fighter('Foc', [flat('ale-de-drac', 1, 2)], { pv: 30 });
    const a = fighter('A', [wait], { pv: 30 });
    const b = fighter('B', [wait], { pv: 30 });
    const c = fighter('C', [wait], { pv: 30 });
    playRound(engineFor([fire], [a, b, c]), [sel(0, 0, 0, [{ team: 1, idx: 0 }, { team: 1, idx: 1 }]), sel(1, 0, 0), sel(1, 1, 0), sel(1, 2, 0)]);
    expect([a.currentPV, b.currentPV, c.currentPV]).toEqual([26, 26, 30]);
  });

  it('Foc interior: +6 on the bender\'s attacks for the next two rounds', () => {
    const fire = fighter('Foc', [getAction('foc-interior')!, blow(1)], { pv: 30 });
    const bag = fighter('Sac', [wait], { pv: 30 });
    const engine = engineFor([fire], [bag]);
    playRound(engine, [sel(0, 0, 0), sel(1, 0, 0)]);
    for (let r = 0; r < 3; r++) playRound(engine, [sel(0, 0, 1, T(1, 0)), sel(1, 0, 0)]);
    expect(bag.currentPV).toBe(30 - 7 - 7 - 1);
  });

  it('Anell de foc: for the next two rounds, every enemy that attacks loses 3 PV and is burned', () => {
    const fire = fighter('Foc', [getAction('anell-de-foc')!, wait], { pv: 60 });
    const foe = fighter('Foe', [wait, blow(2)], { pv: 30 });
    const idle = fighter('Quiet', [wait], { pv: 30 });
    const engine = engineFor([fire], [foe, idle]);
    playRound(engine, [sel(0, 0, 0), sel(1, 0, 0), sel(1, 1, 0)]);
    playRound(engine, [sel(0, 0, 1), sel(1, 0, 1, T(0, 0)), sel(1, 1, 0)]);
    expect(foe.currentPV).toBe(30 - 3 - 1);
    playRound(engine, [sel(0, 0, 1), sel(1, 0, 1, T(0, 0)), sel(1, 1, 0)]);
    expect(foe.currentPV).toBe(22);
    // The ring is gone; the last burn still ticks once.
    playRound(engine, [sel(0, 0, 1), sel(1, 0, 1, T(0, 0)), sel(1, 1, 0)]);
    expect(foe.currentPV).toBe(21);
    expect(idle.currentPV).toBe(30);
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
  it("Palmell d'aire: a wounded target acts last this round", () => {
    const air = fighter('Aire', [flat('palmell-d-aire', 1)], { pv: 30 });
    const slow = fighter('Lent', [focusCard('lent', {})], { pv: 30 });
    const foe = fighter('Foe', [blow(1, true)], { pv: 30 });
    const engine = engineFor([air, slow], [foe]);
    playRound(engine, [sel(0, 0, 0, T(1, 0)), sel(0, 1, 0), sel(1, 0, 0, T(0, 1))]);
    const order = engine.history.map(ev => ev.actor.name);
    expect(order.indexOf('Foe')).toBeGreaterThan(order.indexOf('Lent'));
  });

  it('Coixí de vent: neither the ally it defends nor the bender (who takes what gets through) drop below 1 PV this round', () => {
    const air = fighter('Aire', [flat('coixi-de-vent', 1)], { pv: 30 });
    const ally = fighter('Amic', [wait], { pv: 10 });
    const foe = fighter('Foe', [blow(50)], { pv: 30 });
    playRound(engineFor([air, ally], [foe]), [sel(0, 0, 0, T(0, 1)), sel(0, 1, 0), sel(1, 0, 0, T(0, 1))]);
    expect(ally.currentPV).toBe(10);
    expect(air.currentPV).toBe(1);
  });

  it("Patinet d'aire: next round the bender's card is fast, and the first attack on it misses", () => {
    const air = fighter('Aire', [getAction('patinet-d-aire')!, wait], { pv: 30 });
    const foe = fighter('Foe', [wait, blow(5)], { pv: 30 });
    const engine = engineFor([air], [foe]);
    playRound(engine, [sel(0, 0, 0), sel(1, 0, 0)]);
    const reveal = (engine.prepareRound(), engine.planActions([sel(0, 0, 1), sel(1, 0, 1, T(0, 0))]));
    // Its plain wait goes in the fast step, ahead of the foe's normal blow.
    expect(reveal[0]).toMatchObject({ actorName: 'Aire', fast: true });
    let r = engine.resolveNextAction();
    while (r.kind !== 'done') r = engine.resolveNextAction();
    engine.finishRound();
    expect(air.currentPV).toBe(30);
  });

  it('Esquivar-los a tots: every enemy must attack the bender', () => {
    const air = fighter('Aire', [flat('esquivar-los-a-tots', 1, 100)], { pv: 30 });
    const ally = fighter('Amic', [wait], { pv: 30 });
    const f1 = fighter('F1', [blow(6)], { pv: 30 });
    const f2 = fighter('F2', [blow(6)], { pv: 30 });
    playRound(engineFor([air, ally], [f1, f2]), [sel(0, 0, 0), sel(0, 1, 0), sel(1, 0, 0, T(0, 1)), sel(1, 1, 0, T(0, 1))]);
    expect(ally.currentPV).toBe(30);
    expect(air.currentPV).toBe(30);
  });

  it('Catapulta de vent: a wounded target loses its action this round', () => {
    const air = fighter('Aire', [flat('catapulta-de-vent', 1, 1)], { pv: 30 });
    const foe = fighter('Foe', [blow(9)], { pv: 30 });
    playRound(engineFor([air], [foe]), [sel(0, 0, 0, T(1, 0)), sel(1, 0, 0, T(0, 0))]);
    expect(air.currentPV).toBe(30);
  });

  it('Remolí del mareig: the blocked enemy\'s blows go at random combatants', () => {
    // Over many seeds, the dizzy foe's blow lands somewhere other than its aim.
    let elsewhere = 0;
    for (let s = 0; s < 20; s++) {
      withSeed(s + 1, () => {
        const air = fighter('Aire', [flat('remoli-del-mareig', 1, 100)], { pv: 30 });
        const ally = fighter('Amic', [wait], { pv: 30 });
        const foe = fighter('Foe', [blow(3)], { pv: 30 });
        const friend = fighter('Company', [wait], { pv: 30 });
        playRound(engineFor([air, ally], [foe, friend]), [sel(0, 0, 0, T(1, 0)), sel(0, 1, 0), sel(1, 0, 0, T(0, 1)), sel(1, 1, 0)]);
        if (friend.currentPV < 30) elsewhere++;
      });
    }
    expect(elsewhere).toBeGreaterThan(0);
  });

  it('Cop i fuga: after the strike, attacks on the bender miss for the rest of the round', () => {
    const air = fighter('Aire', [flat('cop-i-fuga', 1, 4)], { pv: 30 });
    const foe = fighter('Foe', [blow(6)], { pv: 30 });
    playRound(engineFor([air], [foe]), [sel(0, 0, 0, T(1, 0)), sel(1, 0, 0, T(0, 0))]);
    expect(foe.currentPV).toBe(25);
    expect(air.currentPV).toBe(30);
  });

  it('Salt del meteor: until it lands nothing touches the bender, then it hits every enemy', () => {
    const air = fighter('Aire', [flat('salt-del-meteor', 1, 2)], { pv: 30 });
    const a = fighter('A', [blow(6, true)], { pv: 30 });
    const b = fighter('B', [wait], { pv: 30 });
    playRound(engineFor([air], [a, b]), [sel(0, 0, 0), sel(1, 0, 0, T(0, 0)), sel(1, 1, 0)]);
    expect(air.currentPV).toBe(30);
    expect([a.currentPV, b.currentPV]).toEqual([27, 27]);
  });

  it("Ull de l'huracà: every enemy, and this round the wounded strike random combatants; 2 fatigue", () => {
    // Over many seeds, a dizzy enemy's blow lands on its own side at least once.
    let ownSide = 0;
    for (let s = 0; s < 20; s++) {
      withSeed(s + 1, () => {
        const air = fighter('Aire', [flat('ull-de-l-huraca', 1, 1)], { pv: 30 });
        const a = fighter('A', [blow(3)], { pv: 30 });
        const b = fighter('B', [blow(3)], { pv: 30 });
        playRound(engineFor([air], [a, b]), [sel(0, 0, 0), sel(1, 0, 0, T(0, 0)), sel(1, 1, 0, T(0, 0))]);
        expect(air.fatigue).toBe(2);
        if (a.currentPV < 28 || b.currentPV < 28) ownSide++;
      });
    }
    expect(ownSide).toBeGreaterThan(0);
  });

  it('Bosc de tornados: each wounded enemy is hurled into another, who takes the same damage', () => {
    const air = fighter('Aire', [flat('bosc-de-tornados', 1, 2)], { pv: 30 });
    const a = fighter('A', [wait], { pv: 30 });
    const b = fighter('B', [wait], { pv: 30 });
    playRound(engineFor([air], [a, b]), [sel(0, 0, 0), sel(1, 0, 0), sel(1, 1, 0)]);
    // Each takes 3 from the tornado and 3 more from the other one thrown in.
    expect([a.currentPV, b.currentPV]).toEqual([24, 24]);
  });

  it('Bosc de tornados: a lone enemy slams into the ground and takes it twice', () => {
    const air = fighter('Aire', [flat('bosc-de-tornados', 1, 2)], { pv: 30 });
    const a = fighter('A', [wait], { pv: 30 });
    playRound(engineFor([air], [a]), [sel(0, 0, 0), sel(1, 0, 0)]);
    expect(a.currentPV).toBe(24);
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

  it('Calar foc: every hero loses 2 PV at the end of the next two rounds; a second torch does not stack', () => {
    const s1 = fighter('S1', [getAction('calar-foc') ?? flat('calar-foc', 0), wait], { pv: 30 });
    const s2 = fighter('S2', [flat('calar-foc', 0), wait], { pv: 30 });
    const hero = fighter('Heroi', [wait], { pv: 30 });
    const engine = engineFor([s1, s2], [hero]);
    playRound(engine, [sel(0, 0, 0), sel(0, 1, 0), sel(1, 0, 0)]);
    expect(hero.currentPV).toBe(30);
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
    expect(tank.currentPV).toBe(24);
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
