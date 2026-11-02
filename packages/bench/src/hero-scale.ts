/**
 * HERO SCALE — the game as the table plays it: heroes against heroes at the
 * set's own PV, the production AI on both sides, random teams of its main kits.
 *
 * WHY: every kit cell fights creatures whose PV the solver raises until a fight
 * lasts about five rounds (30 to 120 PV a body), so no single blow there is
 * ever lethal, and a card that takes a fresh 12-PV hero to 0 in one play reads
 * as merely good. Llamp did, as a fast 4d6 nothing could answer: two agent
 * playtests found it and the kit analyzer never could (2026-11-02, OPEN.md B19).
 * Against heroes the same blow is a KO, and this measures how often.
 */
import { ActionType, CombatEngine, ROUND_CAP, random, setAIControlled, withSeed, type Character } from '@pimpampum/engine';
import { aiPolicy } from '@pimpampum/ai';
import { theRegistry } from './arena.js';
import { CELL_AI } from './cells.js';
import { theSet } from './gameset.js';

export interface HeroScaleCard {
  id: string;
  name: string;
  skillId: string;
  type: ActionType;
  fast: boolean;
  /** Times it resolved (not cancelled, not interrupted). */
  plays: number;
  /** Foes it took from full PV to 0 in a single play (an area blow can take several). */
  oneShots: number;
}

export interface HeroScaleRun {
  level: number;
  teamSize: number;
  fights: number;
  /** Rounds each fight lasted. */
  rounds: number[];
  /** Heroes fielded, and those that fell before any card of theirs resolved. */
  heroes: number;
  diedBeforeActing: number;
  cards: HeroScaleCard[];
  /** A kit's share of the fights its team won (draws ½), over the seats it filled
   *  (a team may field one kit twice). */
  kits: { id: string; winrate: number; seats: number }[];
  /** Whether any fielded card is a fast Defense: the one answer to a fast attack. */
  fastDefense: boolean;
}

export const HERO_SCALE_SEED = 515_000;

/**
 * `fights` fights at `level`, each between two teams of `teamSize` heroes drawn
 * from the set's main kits (repeats allowed, as at the table).
 */
export function heroScaleRun(level: number, fights: number, teamSize = 2, seed = HERO_SCALE_SEED): HeroScaleRun {
  const set = theSet();
  const kits = set.calibration.mainKits;
  const cards = new Map<string, HeroScaleCard>();
  const kitTally = new Map<string, { wins: number; seats: number }>();
  const rounds: number[] = [];
  let heroes = 0, diedBeforeActing = 0, fastDefense = false;

  withSeed(seed + level * 1009, () => {
    for (let f = 0; f < fights; f++) {
      const draw = () => Array.from({ length: teamSize }, () => kits[Math.floor(random() * kits.length)]);
      const picks = [draw(), draw()];
      const teams = picks.map((team, side) => set.buildParty({
        characters: team.map((kit, i) => ({ name: `${side === 0 ? 'A' : 'B'}${i + 1}`, pv: set.playerPV, skills: { [kit]: level } })),
      }));
      for (const t of teams) setAIControlled(t);
      for (const c of teams.flat()) {
        for (const a of c.actions) if (a.def.fast && a.def.actionType === ActionType.Defensa) fastDefense = true;
      }
      const engine = new CombatEngine(teams[0], teams[1], { registry: theRegistry(), maxRounds: ROUND_CAP, ...aiPolicy(CELL_AI) });
      const acted = new Set<Character>();
      const fallen = new Set<Character>();
      heroes += teams[0].length + teams[1].length;
      while (!engine.isOver() && engine.round < engine.maxRounds) {
        engine.prepareRound();
        engine.planActions([]);
        for (;;) {
          const before = new Map(engine.teams.flat().map(c => [c, c.currentPV]));
          const step = engine.resolveNextAction();
          if (step.kind === 'done') break;
          if (step.kind === 'target') { engine.setResolveTarget([]); continue; }
          if (step.kind === 'choice') { engine.setResolveChoice(); continue; }
          const actor = engine.teams[step.action.actorTeam][step.action.actorIdx];
          if (!step.action.cancelled && actor) {
            acted.add(actor);
            const def = actor.actions.find(a => a.def.id === step.action.actionId)?.def;
            if (def) {
              let card = cards.get(def.id);
              if (!card) cards.set(def.id, card = { id: def.id, name: def.name, skillId: def.skillId, type: def.actionType, fast: !!def.fast, plays: 0, oneShots: 0 });
              card.plays++;
              for (const foe of engine.teams[1 - actor.team]) {
                if (before.get(foe) === foe.maxPV && foe.currentPV <= 0) card.oneShots++;
              }
            }
          }
          for (const c of engine.teams.flat()) {
            if (c.currentPV > 0 || fallen.has(c)) continue;
            fallen.add(c);
            if (!acted.has(c)) diedBeforeActing++;
          }
        }
        engine.finishRound();
      }
      rounds.push(engine.round);
      const winner = engine.winner();
      picks.forEach((team, side) => {
        for (const kit of team) {
          const t = kitTally.get(kit) ?? { wins: 0, seats: 0 };
          t.seats++;
          t.wins += winner === side ? 1 : winner === null ? 0.5 : 0;
          kitTally.set(kit, t);
        }
      });
    }
  });

  return {
    level, teamSize, fights, rounds, heroes, diedBeforeActing, fastDefense,
    cards: [...cards.values()],
    kits: [...kitTally].map(([id, t]) => ({ id, winrate: t.wins / t.seats, seats: t.seats })),
  };
}
