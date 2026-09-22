/**
 * THE CONTRACT A CONTENT SET IMPLEMENTS SO IT CAN BE MEASURED.
 *
 * This package used to reach straight into `@pimpampum/skills` and
 * `@pimpampum/enemies` — nine of its thirteen modules did — which meant the
 * measurement layer was welded to one set of content. That was fine while
 * there was one game. It is not fine now: the whole point of separating
 * `engine` from content is that a second set (a Star Wars set, a hard-SF set)
 * gets the same rules and must answer the same requirements, on ITS cards.
 *
 * So the set is a PARAMETER. Everything here takes a `GameSet` and asks it for
 * the four things measurement actually needs: a registry to play with, a way to
 * build a party, a way to build an opposition, and a fingerprint so the cache
 * can tell one set's numbers from another's.
 *
 * WHAT IS DELIBERATELY NOT HERE: the reference party and the fight shapes.
 * Which kits make a fair benchmark, and which creatures make a fair fight, are
 * properties of a SET — its own calibration — not of measurement. They live
 * with the content and arrive through `referenceParty()` and `shapes()`.
 * Keeping them in bench is exactly why bench could never have served a second
 * set.
 */
import type {
  ActionDefinition, Character, EffectHandler, EffectRegistry,
} from '@pimpampum/engine';

/** How many bodies of one creature stand on the table, and how tough each is.
 *  `pv` is required: a group whose toughness is left to a default is a fight
 *  nobody chose, and the whole point of a solved shape is that its difficulty
 *  was measured rather than assumed. */
export interface FieldedGroup {
  enemyId: string;
  count: number;
  /** Kit ordinal; the creature's full kit when omitted. */
  level?: number;
  /** PV per body. */
  pv: number;
}

/**
 * A PARTY, in one of two flavours.
 *
 *  - EXPLICIT: the real table, built identically every game. This is what the
 *    web app passes and what a reference party is.
 *  - DRAWN: "four players, about this strong" — a representative party is drawn
 *    per game. Sweeps use this so a result is not about one lucky roster.
 *
 * The distinction matters to the ERROR BARS, which is the only reason bench
 * cares: a drawn party makes games non-iid, and the real spread runs ~25%
 * wider than binomial. `characters` is the discriminant.
 *
 * These fields are declared HERE and matched by the set, not the other way
 * round. It reads backwards — bench describing a party it cannot build — and
 * it is the whole inversion: the instrument states what it needs to know about
 * a party in order to size a sample, and a set that wants measuring answers in
 * those terms.
 */
export type PartySpec = DrawnPartySpec | ExplicitPartySpec;

export interface DrawnPartySpec {
  /** How many players. */
  count: number;
  /** Total skill levels per player. A single number applies to everyone; an
   *  array gives each player their own (short arrays repeat the last). */
  levels: number | number[];
  /** Passive armour per player, same broadcasting rule as `levels`. */
  armor?: number | number[];
  /** PV per player; the set's own default when omitted. */
  pv?: number;
  /** Fatigue per player, same broadcasting rule as `levels`. */
  fatigue?: number | number[];
  /** Name prefix for generated characters. */
  prefix?: string;
  characters?: undefined;
}

/** The real party: build exactly these characters, every game. */
export interface ExplicitPartySpec {
  characters: CharacterBuildSpec[];
}

/** True when the party is fixed rather than redrawn each simulated game.
 *  Callers use it to decide whether party-composition variance is a source of
 *  sampling noise on top of the binomial. */
export function isExplicitParty(spec: PartySpec): spec is ExplicitPartySpec {
  return Array.isArray(spec.characters);
}

/**
 * WHICH KITS A PARTY HOLDS.
 *
 * Asked by every harness that reports per-card numbers, because a table of
 * cards the party never held is a table of `n/d` — and a row of "no data" for
 * a kit that was never in the fight reads like a kit nobody plays. A drawn
 * party has no fixed answer, so it gets the empty set rather than a guess.
 */
export function partyKits(spec: PartySpec): Set<string> {
  if (!isExplicitParty(spec)) return new Set();
  return new Set(spec.characters.flatMap(c => Object.keys(c.skills ?? {})));
}

/**
 * ONE CHARACTER, described well enough to be rebuilt identically every game.
 *
 * The set resolves the ids — which cards a kit level unlocks, what a piece of
 * equipment does — so bench never needs to know what any of them mean.
 */
export interface CharacterBuildSpec {
  name: string;
  /** PV pool. Required: a hero whose toughness came from a default is not the
   *  hero the report is about. */
  pv: number;
  /** skillId -> level (= how many of the kit's actions this character knows). */
  skills: Record<string, number>;
  /** Explicit action ids; all the levels unlock, when omitted. */
  actions?: string[];
  equipment?: string[];
  potions?: string[];
  fatigue?: number;
  classCss?: string;
  iconPath?: string;
  category?: 'player' | 'enemy';
}

/** A fight the set defines: which creatures are available and how many. How
 *  tough each one ends up is the set's solver's business, not ours. */
export interface Shape {
  label: string;
  pool: { enemyId: string; count: number }[];
}

/**
 * ONE MEASURABLE POSITION — a fight shape, a company row, and the score a
 * NEUTRAL subject gets there.
 *
 * Everything this package reports is a DELTA against `baseline`, which is why
 * the baseline travels with the position rather than being looked up later: a
 * subject's winrate on its own says more about which fight it was handed than
 * about the subject.
 *
 * Producing cells is the SET's job — it owns the solver that decides how tough
 * a shape has to be, and the neutral kit the baseline is measured with. Bench
 * only ever consumes them.
 */
export interface Cell {
  shapeIdx: number;
  companyIdx: number;
  label: string;
  /** Neutral subject's winrate in this seat — subtracted from every subject's. */
  baseline: number;
  baselineGames: number;
}

/**
 * A SYNTHETIC KIT injected into a set for the length of one measurement.
 *
 * This is how control subjects work (`control-kits.ts`): a kit whose verdict
 * follows from its construction, run through the real analyzer to check the
 * analyzer says the known thing. It has to become visible to the set's own
 * lookups — a kit the character builder cannot resolve hands every hero an
 * empty hand and every requirement a plausible number about nothing.
 */
export interface SubjectKit {
  id: string;
  actions: ActionDefinition[];
  effects?: Record<string, EffectHandler>;
}

export interface GameSet {
  /** Identifies the set in cache keys and report headers. */
  id: string;
  /** Generic handlers plus this set's own — including its enemies'. A registry
   *  missing the enemy handlers plays a different game, silently. */
  registry(): EffectRegistry;
  buildParty(spec: PartySpec): Character[];
  buildEncounter(groups: FieldedGroup[]): Character[];
  /** A random party at a skill-level budget — the drawn flavour above. */
  randomParty(prefix: string, size: number, budget: number, equip?: boolean, pv?: number): Character[];
  /** Default PV for a player in this set. */
  playerPV: number;
  /** This set's benchmark party — see the note at the top of this file. */
  referenceParty(): PartySpec;
  /** The calibration party for one company row. Rotating the company is how a
   *  kit gets measured as an ALLY and not only as a subject. */
  calibrationParty(companyIdx: number): PartySpec;
  /** How many company rows this set defines. */
  companyCount: number;
  /** The fight shapes a kit is measured across. */
  shapes(): Shape[];
  /** Positions worth measuring in — shapes × companies, minus the ones whose
   *  neutral baseline is pinned against an edge and so cannot separate two
   *  subjects. Solving these is the expensive part of a run; the set is
   *  expected to cache them (see `cached()`). */
  cells(): Cell[];
  /** The positions `cells()` rejected, so a report can name them rather than
   *  silently measuring in fewer places than the reader assumes. */
  saturatedCells(): Cell[];
  /**
   * Make a synthetic kit resolvable by this set's builders, and hand back the
   * undo.
   *
   * The undo is not optional and not a courtesy: a leaked control kit is a fake
   * subject in every later sweep in the process, and because catalogues are
   * usually computed at module load it shows up in some lookups and not others.
   */
  installKit(kit: SubjectKit): () => void;
  /** Which of a kit's actions a character at `level` actually ends up holding.
   *  Bench uses it to check a control kit REACHED the character before trusting
   *  a single number measured on it. */
  unlockedActions(kitId: string, level: number): ActionDefinition[];
  /** Fingerprint of ONE kit / ONE creature. Finer than `print()` on purpose:
   *  editing a single kit should invalidate only the cached numbers that
   *  depended on it, not every number in the package. */
  skillPrint(id: string): string;
  enemyPrint(id: string): string;
  /**
   * FINGERPRINT OF EVERYTHING THAT CHANGES A FIGHT — cards, dice, effects,
   * enemy kits. The cache keys on it, so editing a card invalidates exactly
   * the numbers that depended on it and nothing else. A fingerprint that
   * missed a field would hand back numbers for content as it used to be, which
   * is the worst failure this layer could have.
   */
  print(): string;
}


/**
 * THE SET IN PLAY, installed once per process.
 *
 * A module-level binding rather than a parameter on forty functions, and the
 * trade is deliberate: a process measures ONE set at a time, and threading
 * `set` through `runMatch`, `runMatrix`, `valuePosition`, `measureKit` and
 * every caller of those would be noise in every signature for a value that
 * never changes inside a run.
 *
 * What makes it safe rather than a hidden global:
 *
 *  - it FAILS LOUDLY when unset, naming the fix, instead of quietly measuring
 *    some default content;
 *  - the cache keys on `print()`, which includes the set id, so two sets can
 *    never read each other's numbers;
 *  - tests install a SYNTHETIC set, which is how bench and playtest get
 *    verified without depending on any real content at all.
 */
let current: GameSet | null = null;

export function useSet(set: GameSet): void {
  current = set;
}

export function theSet(): GameSet {
  if (!current) {
    throw new Error(
      `@pimpampum/bench: no GameSet installed. Call useSet(...) before measuring `
      + `— e.g. useSet(FANTASY) from @pimpampum/set-fantasy.`,
    );
  }
  return current;
}
