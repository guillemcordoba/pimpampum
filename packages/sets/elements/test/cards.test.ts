/**
 * ELEMENTS CARDS, PLAYED EXACTLY — each card's own effects, on hand-built
 * one- or two-round positions with scripted choices. Where a card's dice would
 * make the result a range, the test plays a COPY of the card with flat dice:
 * the effects are what is under test, and an action's description wins over
 * its handler (CLAUDE.md).
 */
import { describe, it, expect } from 'vitest';
import { type ActionDefinition, ActionType, CombatEngine, DiceRoll, firstLegalChooser } from '@pimpampum/engine';
import { armour, attackCard, fighter, focusCard, playRound, punchingBag, type Selection } from '@pimpampum/engine/testing';
import { buildCharacter, createEnemy, createRegistry, getAction, getEnemy } from '../src/index.js';

const registry = createRegistry();
const wait = focusCard();

/** A live card with flat dice: `n`d1 plus `bonus`. */
function flat(id: string, n: number, bonus = 0, over: Partial<ActionDefinition> = {}): ActionDefinition {
  const card = getAction(id) ?? getEnemy(id)?.skills[0].actions[0];
  if (!card) throw new Error(`no card ${id}`);
  return { ...card, dice: new DiceRoll(n, 1), rollBonus: bonus, ...over };
}

/** The live card a creature holds, by id. */
function enemyCard(enemyId: string, cardId: string): ActionDefinition {
  const card = getEnemy(enemyId)?.skills.flatMap(s => s.actions).find(a => a.id === cardId);
  if (!card) throw new Error(`no card ${cardId} on ${enemyId}`);
  return card;
}

function engineFor(team0: ReturnType<typeof fighter>[], team1: ReturnType<typeof fighter>[]): CombatEngine {
  return new CombatEngine(team0, team1, { registry, actionChooser: firstLegalChooser });
}

const sel = (team: number, idx: number, actionIdx: number, targets?: Selection['targets']): Selection =>
  ({ team, idx, actionIdx, targets });

describe("Mestre de l'aigua", () => {
  it('Desviar el corrent: a blocked attacker takes the margin it lost by', () => {
    // Defense 7 (flat) against an attack of 4: the water comes back for 3.
    const water = fighter('Aigua', [flat('desviar-el-corrent', 1, 6)], { pv: 30 });
    const foe = fighter('Foe', [attackCard('hit', { dice: new DiceRoll(1, 1), rollBonus: 3, speed: 0 })], { pv: 30 });
    const engine = engineFor([water], [foe]);
    playRound(engine, [sel(0, 0, 0, [{ team: 0, idx: 0 }]), sel(1, 0, 0, [{ team: 0, idx: 0 }])]);
    expect(water.currentPV).toBe(30);
    expect(foe.currentPV).toBe(27);
  });

  it('Desviar el corrent: however far the defense wins by, at most 4 comes back', () => {
    // Defense 30 against an attack of 4 would be 26; the card caps it.
    const water = fighter('Aigua', [flat('desviar-el-corrent', 1, 29)], { pv: 30 });
    const foe = fighter('Foe', [attackCard('hit', { dice: new DiceRoll(1, 1), rollBonus: 3, speed: 0 })], { pv: 30 });
    const engine = engineFor([water], [foe]);
    playRound(engine, [sel(0, 0, 0, [{ team: 0, idx: 0 }]), sel(1, 0, 0, [{ team: 0, idx: 0 }])]);
    expect(foe.currentPV).toBe(26);
  });

  it("Domini de la sang: next turn the puppet's blow lands on its own ally, and the bender bleeds for it", () => {
    const water = fighter('Aigua', [getAction('domini-de-la-sang')!, wait], { pv: 30 });
    const puppet = fighter('Titella', [wait, attackCard('hit', { dice: new DiceRoll(1, 1), rollBonus: 4 })], { pv: 30 });
    const friend = fighter('Amic', [wait], { pv: 30 });
    const engine = engineFor([water], [puppet, friend]);
    playRound(engine, [sel(0, 0, 0, [{ team: 1, idx: 0 }]), sel(1, 0, 0), sel(1, 1, 0)]);
    expect(water.currentPV, 'the taboo costs 2 PV').toBe(28);
    playRound(engine, [sel(0, 0, 1), sel(1, 0, 1, [{ team: 0, idx: 0 }]), sel(1, 1, 0)]);
    expect(water.currentPV, 'the bender is spared').toBe(28);
    expect(friend.currentPV, 'the puppet struck its own ally').toBe(25);
  });

  it('Presó de gel: a hit takes Atacs out of the target\'s hand next turn', () => {
    const water = fighter('Aigua', [flat('preso-de-gel', 1, 5)], { pv: 30 });
    const foe = fighter('Foe', [wait, attackCard()], { pv: 30 });
    const engine = engineFor([water], [foe]);
    playRound(engine, [sel(0, 0, 0, [{ team: 1, idx: 0 }]), sel(1, 0, 0)]);
    const locked = foe.statusRefs().find(r => r.key === 'bloquejat');
    expect(locked?.entry.behavior?.blocksActionType?.(locked, ActionType.Atac)).toBe(true);
    expect(locked?.entry.behavior?.blocksActionType?.(locked, ActionType.Focus)).toBe(false);
  });
});

describe('Mestre de la terra', () => {
  it('Dominar el metall: an armoured target can neither defend nor soak it', () => {
    const earth = fighter('Terra', [flat('dominar-el-metall', 1, 5)], { pv: 30 });
    const foe = fighter('Foe', [{ ...attackCard('block'), actionType: ActionType.Defensa, speed: 5, rollBonus: 1000 }],
      { pv: 30, equipment: [armour(2)] });
    const engine = engineFor([earth], [foe]);
    playRound(engine, [sel(0, 0, 0, [{ team: 1, idx: 0 }]), sel(1, 0, 0, [{ team: 1, idx: 0 }])]);
    expect(foe.currentPV).toBe(24);
  });
});

describe('Mestre del foc', () => {
  it('Llamp: 3d6 that no guard stops — unless the bender is hurt first', () => {
    const fire = buildCharacter({ name: 'Foc', pv: 30, skills: { firebender: 5 } });
    const lightning = fire.actions.findIndex(a => a.def.id === 'llamp');
    const target = fighter('Foe', [{ ...attackCard('block'), actionType: ActionType.Defensa, speed: 5, rollBonus: 1000 }], { pv: 30 });
    const engine = engineFor([fire], [target]);
    playRound(engine, [sel(0, 0, lightning, [{ team: 1, idx: 0 }]), sel(1, 0, 0, [{ team: 1, idx: 0 }])]);
    expect(target.currentPV).toBeLessThanOrEqual(27);
    expect(target.currentPV).toBeGreaterThanOrEqual(12);

    const calm = buildCharacter({ name: 'Foc', pv: 30, skills: { firebender: 5 } });
    const hitter = fighter('Foe', [attackCard('hit', { speed: 9 })], { pv: 30 });
    const engine2 = engineFor([calm], [hitter]);
    playRound(engine2, [sel(0, 0, lightning, [{ team: 1, idx: 0 }]), sel(1, 0, 0, [{ team: 0, idx: 0 }])]);
    expect(hitter.currentPV, 'hurt before it resolved, the lightning never left').toBe(30);
  });
});

describe('Els set chakres', () => {
  it('Obrir el chakra de la terra: strips a lock, and the next one does not take hold', () => {
    const monk = fighter('Monjo', [getAction('obrir-el-chakra-de-la-terra')!, wait], { pv: 30 });
    const ally = fighter('Aliat', [wait], { pv: 30 });
    const pin = { ...enemyCard('arquer-de-la-muralla', 'clavar-a-la-paret'), dice: new DiceRoll(1, 1), rollBonus: 5, speed: 9 };
    const archer = fighter('Arquer', [pin, wait], { pv: 30 });
    const engine = engineFor([monk, ally], [archer]);
    // Round 1: the archer pins the ally.
    playRound(engine, [sel(0, 0, 1), sel(0, 1, 0), sel(1, 0, 0, [{ team: 0, idx: 1 }])]);
    expect(ally.hasStatus('bloquejat')).toBe(true);
    // Round 2: the monk opens the ally's earth chakra.
    playRound(engine, [sel(0, 0, 0, [{ team: 0, idx: 1 }]), sel(0, 1, 0), sel(1, 0, 1)]);
    expect(ally.hasStatus('bloquejat'), 'the lock is gone').toBe(false);
    // Round 3: the archer pins again, and the open chakra turns it away.
    playRound(engine, [sel(0, 0, 1), sel(0, 1, 0), sel(1, 0, 0, [{ team: 0, idx: 1 }])]);
    expect(ally.hasStatus('bloquejat')).toBe(false);
  });

  it("Obrir el chakra del cor: the ally's wound lands on the carer", () => {
    const monk = buildCharacter({ name: 'Monjo', pv: 30, skills: { chakra: 2 } });
    const heart = monk.actions.findIndex(a => a.def.id === 'obrir-el-chakra-del-cor');
    const ally = fighter('Aliat', [wait], { pv: 30 });
    const foe = fighter('Foe', [attackCard('hit', { dice: new DiceRoll(1, 1), rollBonus: 5, speed: -1 })], { pv: 30 });
    const engine = engineFor([monk, ally], [foe]);
    playRound(engine, [sel(0, 0, heart, [{ team: 0, idx: 1 }]), sel(0, 1, 0), sel(1, 0, 0, [{ team: 0, idx: 1 }])]);
    expect(ally.currentPV).toBe(30);
    expect(monk.currentPV).toBe(24);
  });
});

describe('El Senyor de la Por', () => {
  it('cannot be reached while one of his bodies stands', () => {
    const body = createEnemy('rostre-de-ferro', { pv: 10 })!;
    const lord = createEnemy('senyor-de-la-por', { pv: 10 })!;
    const hero = fighter('Heroi', [attackCard('hit', { dice: new DiceRoll(1, 1), rollBonus: 20, targetCount: 2 })], { pv: 30 });
    const engine = engineFor([hero], [body, lord]);
    expect(lord.statusRefs().some(r => r.entry.behavior?.untargetable?.(r))).toBe(true);
    body.currentPV = 0;
    expect(lord.statusRefs().some(r => r.entry.behavior?.untargetable?.(r)), 'his last body fell').toBe(false);
    void engine;
  });

  it("Rei de l'infern stands a fallen body back up at half its PV", () => {
    const naraka = fighter('Infern', [enemyCard('rostre-de-l-infern', 'rei-de-l-infern')], { pv: 20, ai: false });
    const fallen = fighter('Ferro', [wait], { pv: 20 });
    const hero = punchingBag(50);
    const engine = engineFor([naraka, fallen], [hero]);
    fallen.currentPV = 0;
    playRound(engine, [sel(0, 0, 0), sel(0, 1, 0)].slice(0, 1));
    expect(fallen.currentPV).toBe(10);
  });

  it('Empenta universal: the push leaves the body without a guard next turn', () => {
    const deva = fighter('Empenta', [enemyCard('rostre-de-l-empenta', 'empenta-universal'), wait], { pv: 20 });
    const hero = punchingBag(50);
    const engine = engineFor([deva], [hero]);
    playRound(engine, [sel(0, 0, 0, [{ team: 0, idx: 0 }])]);
    const locked = deva.statusRefs().find(r => r.key === 'bloquejat');
    expect(locked?.entry.behavior?.blocksActionType?.(locked, ActionType.Defensa)).toBe(true);
  });
});
