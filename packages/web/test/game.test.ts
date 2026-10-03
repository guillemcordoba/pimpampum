/**
 * THE APP'S GAME LOOP, PLAYED THROUGH — `useGame` is the state machine the
 * combat screen renders, sitting on the engine, the AI and the fantasy set.
 * This drives it exactly as a person at the screen does (pick a card per
 * hero, confirm, resolve step by step answering every target prompt, next
 * round) until someone wins. It is the one place the app's wiring is checked
 * end to end: a missing policy, a prompt the UI cannot answer, a round that
 * never finishes — each would strand a real table mid-fight.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { withSeed } from '@pimpampum/engine';
import { ALL_SKILLS, buildCharacter, getAction, solveEncounter, unlockedActions } from '@pimpampum/set-fantasy';
import { useGame, type Game } from '../src/composables/useGame';
import { heroBuildSpec, heroFromSkill } from '../src/composables/party';
import { setPendingEncounter } from '../src/composables/pendingEncounter';

beforeEach(() => localStorage.clear());

/** Answer whatever the screen is asking, as a player would. */
function playOneRound(game: Game): void {
  const eng = game.engine.value!;
  game.playerTeam.value.forEach((c, i) => {
    if (!c.isAlive() || game.skippingPlayers.value.has(i)) return;
    const idx = c.actions.findIndex((_, a) => eng.canPlayActionIdx(c, a));
    if (idx >= 0) game.selectCard(i, idx);
  });
  expect(game.canConfirmCards(), 'every living hero has a card chosen').toBe(true);
  game.confirmCards();
  expect(game.gamePhase.value).toBe('reveal');
  game.startResolving();
  let guard = 0;
  while (!game.roundComplete.value) {
    expect(guard++, 'the round never finished resolving').toBeLessThan(200);
    const prompt = game.currentTargetPrompt.value;
    if (!prompt) { game.advanceResolution(); continue; }
    const enemies = game.enemyTeam.value.map((c, idx) => ({ c, idx })).filter(x => x.c.isAlive());
    const allies = game.playerTeam.value.map((c, idx) => ({ c, idx }))
      .filter(x => x.c.isAlive() || prompt.canReviveTarget)
      .filter(x => prompt.requirement !== 'ally_other' || x.idx !== prompt.actorIdx);
    const pool = prompt.requirement === 'enemy'
      ? enemies.map(x => ({ team: 1, idx: x.idx }))
      : prompt.requirement === 'self' || prompt.requirement === 'defense'
        ? [{ team: 0, idx: prompt.actorIdx }]
        : allies.map(x => ({ team: 0, idx: x.idx }));
    expect(pool.length, `nothing to answer a ${prompt.requirement} prompt with`).toBeGreaterThan(0);
    for (const t of pool.slice(0, prompt.count)) game.selectTarget(t.team, t.idx);
    if (game.currentTargetPrompt.value) game.confirmTargets();
  }
  game.nextRound();
}

function playToTheEnd(game: Game): void {
  let rounds = 0;
  while (game.gamePhase.value !== 'victory') {
    expect(game.gamePhase.value).toBe('card-selection');
    expect(rounds++, 'the fight never ended').toBeLessThan(60);
    playOneRound(game);
  }
}

describe('a game in the app', () => {
  it('plays from setup to a result, answering every prompt the way the screen does', () => {
    withSeed(11, () => {
      const game = useGame();
      expect(game.playerSpecs.value.length, 'a first run seeds a default party').toBeGreaterThan(0);
      game.addEnemy({ enemyId: 'goblin', level: 2, equipment: [], pv: 6 });
      game.addEnemy({ enemyId: 'bone-devil', level: 2, equipment: [], pv: 10 });
      expect(game.canStart()).toBe(true);
      game.startCombat();
      playToTheEnd(game);
      expect([0, 1, null]).toContain(game.winner.value);
      expect(game.combatLog.value.length).toBeGreaterThan(0);
    });
  });

  it('an encounter handed over by the creator starts the fight straight away, as solved', () => {
    const solved = solveEncounter([{ enemyId: 'goblin', count: 2 }], { count: 4, levels: 6, armor: 1 }, 0.65,
      { searchGames: 20, games: 20, aiDepth: 0 })!;
    setPendingEncounter(solved);
    const game = useGame();
    expect(game.gamePhase.value).toBe('card-selection');
    expect(game.enemyTeam.value.map(e => e.maxPV)).toEqual(solved.groups.flatMap(g => Array(g.count).fill(g.pv)));
    playToTheEnd(game);
  });
});

describe('the party a table fields', () => {
  it('gears every quick hero so their cards work — a weapon kit gets a weapon', () => {
    for (const skill of ALL_SKILLS) {
      const hero = heroFromSkill('H', skill.id);
      expect(hero.equipment).toContain('escut');
      const needs = skill.actions.some(a => a.effects.some(e => e.type === 'weapon_damage'));
      expect(hero.equipment.includes('destral'), skill.id).toBe(needs);
    }
  });

  it('turns into a character holding exactly the cards its levels unlock', () => {
    for (const skill of ALL_SKILLS) {
      const spec = heroBuildSpec(heroFromSkill('H', skill.id, 3));
      const c = buildCharacter(spec);
      for (const a of unlockedActions(skill.id, spec.skills[skill.id])) {
        expect(c.actions.some(x => x.def === getAction(a.id)), `${skill.id}: ${a.id}`).toBe(true);
      }
    }
  });
});
