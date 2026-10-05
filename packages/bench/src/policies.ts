/**
 * THE POLICY LADDER — what the AI is measured AGAINST.
 *
 * The AI is this package's instrument: every kit report card, every solved
 * encounter and every dead-card verdict is a number produced by it playing the
 * game. So "is the AI any good" is not a side question, it is a calibration
 * question, and it has the same problem every calibration here has — there is
 * no ground truth for GOOD PLAY in a game nobody has played ten thousand hours
 * of, and §16.1 is emphatic that an AI may be corrected where it disagrees with
 * the RULES but never tuned until the tests go green.
 *
 * Two kinds of signal survive that objection, and this module holds both.
 *
 *  - BASELINES: fixed, deliberately stupid strategies. They are defined from
 *    the CARDS, never from the AI — `spam` reads dice averages, `feeble` reads
 *    them backwards, `firstLegal` reads nothing at all. That independence is
 *    the whole point: a baseline derived from the heuristic (an "anti-policy"
 *    picking whatever the AI likes least, say) would move every time the AI
 *    moved, and "the AI beats it" would drift into meaning nothing.
 *  - THE COMPUTE LADDER: the same AI, thinking harder. A stronger search is a
 *    usable ground truth for a weaker one, which is the one comparison here
 *    that cannot be satisfied by turning a weight — a weight moves both rungs
 *    at once.
 *
 * Both are read in MIRROR matches (`headToHead`): identical parties, the same
 * seeds, each pairing played from both seats so seat bias cancels. A mirror is
 * the honest form of "X plays better than Y", because the only thing that
 * differs between the sides is the decision-making.
 *
 * `ai-benchmark.ts` prints these; `sets/fantasy/test/ai-strength.slow.test.ts` asserts on them.
 * One definition, so the report and the gate can never disagree about what the
 * policy under test actually is — the mistake `cells.ts` records for
 * "played out of the times it was legal", which had three implementations.
 */
import {
  ActionType, availableActionIndices, type Character, CombatEngine, random, setAIControlled,
  withSeed,
} from '@pimpampum/engine';
import { aiPolicy, DEFAULT_LOOKAHEAD, lookaheadChooser, selectAction } from '@pimpampum/ai';

/** Who gets hit, in every duel: the production AI's choice, for both seats.
 *  The policies differ in what they PLAY; targeting is not what is compared. */
const TARGETS = aiPolicy().targetChooser;
import { theRegistry } from './arena.js';
import { theSet, type PartySpec } from './gameset.js';
import { calibrationParty } from './positions.js';

/** A policy: pick an action index for `actor`, or null to leave it to the
 *  engine's own AI. Matches the engine's `actionChooser` seam. */
export type Chooser = (engine: CombatEngine, actor: Character) => number | null;

/** Dispatch per team, so two policies can share one combat. */
export function split(team0: Chooser, team1: Chooser): Chooser {
  return (engine, actor) => (actor.team === 0 ? team0 : team1)(engine, actor);
}

// --- The AI, at three depths ------------------------------------------------

/** The engine's card-scoring heuristic alone (`aiDepth: 0`). Not a serious
 *  policy — it is in the ladder because it is what the search SEEDS from and
 *  what plays both sides inside every rollout. It used to ALSO decide which
 *  cards the search was allowed to consider, via `topK`; removing that was the
 *  single biggest gain the AI has had (see `DEFAULT_LOOKAHEAD`). */
export const heuristic: Chooser = (engine, actor) => {
  const { actionIdx } = selectAction(engine, actor);
  return actionIdx >= 0 ? actionIdx : null;
};

/** PRODUCTION — `DEFAULT_LOOKAHEAD` itself, so the ladder can never drift from
 *  the settings every number in this package is actually measured through. */
export const depth1: Chooser = lookaheadChooser(DEFAULT_LOOKAHEAD);

/** The same AI with a bigger budget. Its only job is to be a rung ABOVE
 *  production: if it plays better, production is not converged, and every
 *  measurement made through production is a fact about a search budget rather
 *  than about the game. Doubled samples and one more pass — the two dials that
 *  remain once `topK` is gone. */
export const depth1x: Chooser = lookaheadChooser({
  ...DEFAULT_LOOKAHEAD, samples: DEFAULT_LOOKAHEAD.samples * 2, passes: DEFAULT_LOOKAHEAD.passes + 1,
});

// --- The baselines: fixed, stupid, and defined without reference to the AI ---

/** Uniformly random over legal cards. The floor — anything that fails to beat
 *  this is not a policy.
 *
 *  Draws from the engine's SEEDED `random()`, not `Math.random()`, or the floor
 *  of every comparison here would be irreproducible while looking deterministic
 *  (which it was, until 2026-09-20). */
export const uniform: Chooser = (engine, actor) => {
  const legal = availableActionIndices(actor, engine.registry);
  return legal.length ? legal[Math.floor(random() * legal.length)] : null;
};

/** Attack indices for `actor`, biggest dice average first. Shared by `spam` and
 *  `feeble` so the two are exactly each other's mirror image. */
function attacksByPower(engine: CombatEngine, actor: Character): number[] {
  const legal = availableActionIndices(actor, engine.registry);
  return legal
    .filter(i => actor.actions[i].def.actionType === ActionType.Atac && !actor.actions[i].def.lastResort)
    .sort((a, b) => {
      const avg = (i: number) => {
        const def = actor.actions[i].def;
        return (def.dice?.average() ?? 0) + (def.rollBonus ?? 0);
      };
      return avg(b) - avg(a);
    });
}

/** Always the biggest attack — the strategy the triangle in `intentions.md`
 *  must beat. The AI used to LOSE to this in a mirror (45.3%, 2026-09-22); it
 *  is the baseline that drove the `topK` finding. */
export const spam: Chooser = (engine, actor) => {
  const attacks = attacksByPower(engine, actor);
  if (attacks.length) return attacks[0];
  const legal = availableActionIndices(actor, engine.registry);
  return legal.length ? legal[0] : null;
};

/** Always the SMALLEST attack. `spam` read backwards, and a floor that owes
 *  nothing to any judgement about the game: whatever the right play is, it is
 *  not "throw the weakest thing you have, every round, forever". */
export const feeble: Chooser = (engine, actor) => {
  const attacks = attacksByPower(engine, actor);
  if (attacks.length) return attacks[attacks.length - 1];
  const legal = availableActionIndices(actor, engine.registry);
  return legal.length ? legal[legal.length - 1] : null;
};

/** The lowest-index legal card, every round. No strategy whatsoever — not even
 *  a bad one — so it is the cleanest possible "the AI must beat THIS". */
export const firstLegal: Chooser = (engine, actor) => {
  const legal = availableActionIndices(actor, engine.registry);
  return legal.length ? legal[0] : null;
};

// --- Play styles: the corners of the strategy triangle ----------------------

/**
 * Production play LEANING towards one action type: each round, a seeded coin
 * decides per side whether it commits to the style — the lookahead restricted
 * to `type` (falling back to the whole hand when nothing of that type is
 * legal) — or plays freely.
 *
 * A LEAN, NOT A RESTRICTION. A side that may only ever defend or only ever
 * focus never deals damage, so two of the three corners met each other in
 * stalls and the "triangle" was really a measurement of who stalls whom
 * (NEXT-STEPS §22.1 measured the hard restriction). Per ROUND, not per seat,
 * because the lookahead plans a side jointly and a style is a side's choice.
 */
export function leaning(type: ActionType, share: number): Chooser {
  const styled = lookaheadChooser({ ...DEFAULT_LOOKAHEAD, restrictTo: [type] });
  let coin: { engine: CombatEngine; round: number; team: number; styled: boolean } | null = null;
  return (engine, actor) => {
    if (!coin || coin.engine !== engine || coin.round !== engine.round || coin.team !== actor.team) {
      coin = { engine, round: engine.round, team: actor.team, styled: random() < share };
    }
    return (coin.styled ? styled : depth1)(engine, actor);
  };
}

/** How much a style leans: the share of rounds it commits to its type. */
export const STYLE_SHARE = 0.5;

/** intentions.md's three strategies, in the order the triangle claims each
 *  beats the next: Power > Protect > Aggro > Power. */
export function triangleStyles(share = STYLE_SHARE): { name: string; chooser: Chooser }[] {
  return [
    { name: 'Power', chooser: leaning(ActionType.Focus, share) },
    { name: 'Protect', chooser: leaning(ActionType.Defensa, share) },
    { name: 'Aggro', chooser: leaning(ActionType.Atac, share) },
  ];
}

// --- Mirror matches ---------------------------------------------------------

/** The party both sides field. The CALIBRATION party, so a number here means
 *  the same thing as a number in a report-card cell. */
export function mirrorParty(): PartySpec { return calibrationParty(0); }

/** Shared so the harness and the test meet the same dice. */
export const MIRROR_SEED = 424242;

export interface HeadToHead {
  /** X's winrate, averaged over both seats. Draws count ½. */
  winrate: number;
  /** Combats behind the number — the total across both seats. */
  games: number;
}

/**
 * Mirrored parties: X on one side, Y on the other, played BOTH WAYS ROUND and
 * averaged.
 *
 * Playing both seats is not a nicety. Speed ties are broken by a shuffle, but
 * the queue is still built team-0-first elsewhere, and a measured ~52/48 seat
 * bias is exactly the size of the effects this comparison reads. Half the games
 * from each seat cancels it; taking `1 − play(y, x)` converts Y's winrate from
 * the second seat back into X's.
 */
export function headToHead(
  x: Chooser, y: Chooser, games: number, seed = MIRROR_SEED,
  /** Called on every fight's two teams, X's first, before it starts — how a
   *  side is fielded without a card (playtest `blameEdge`). */
  prepare?: (xTeam: Character[], yTeam: Character[]) => void,
): HeadToHead {
  const half = Math.max(1, Math.round(games / 2));
  const play = (a: Chooser, b: Chooser, xFirst: boolean): number => {
    let wins = 0;
    // COMMON RANDOM NUMBERS: the same seed for both seats, so the two halves
    // meet the same dice and differ only by which policy sat where.
    withSeed(seed, () => {
      for (let i = 0; i < half; i++) {
        const teamA = theSet().buildParty(mirrorParty());
        const teamB = theSet().buildParty(mirrorParty());
        setAIControlled(teamA);
        setAIControlled(teamB);
        if (prepare) { if (xFirst) prepare(teamA, teamB); else prepare(teamB, teamA); }
        const res = new CombatEngine(teamA, teamB, {
          registry: theRegistry(), maxRounds: 40, actionChooser: split(a, b), targetChooser: TARGETS,
        }).runCombat();
        if (res.winner === 0) wins++;
        else if (res.winner === null) wins += 0.5;
      }
    });
    return wins / half;
  };
  return { winrate: (play(x, y, true) + (1 - play(y, x, false))) / 2, games: half * 2 };
}

/** One edge of a cycle: `winner` is claimed to beat `loser`. */
export interface CycleEdge { winner: string; loser: string; duel: HeadToHead }

/**
 * Each style against the NEXT one, wrapping round: [a, b, c] plays a–b, b–c
 * and c–a, each read as the first style's winrate. Content-agnostic, so the
 * controls can hand it styles whose order is known by construction.
 */
export function cycleDuels(styles: { name: string; chooser: Chooser }[], games: number, seed = MIRROR_SEED): CycleEdge[] {
  return styles.map((w, i) => {
    const l = styles[(i + 1) % styles.length];
    return { winner: w.name, loser: l.name, duel: headToHead(w.chooser, l.chooser, games, seed) };
  });
}
