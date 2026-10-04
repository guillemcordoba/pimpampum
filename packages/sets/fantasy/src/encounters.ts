/**
 * THE BALANCER, BOUND TO THIS SET.
 *
 * `@pimpampum/combat-balancer` prices a fight by playing it and knows nothing about
 * what it plays; this file is the one place that tells it. Everything the app
 * and the harnesses call — `solveEncounter(pool, party, target)` and friends —
 * is the generic solver with the fantasy set's builders filled in.
 */
import type { Character, EffectRegistry } from '@pimpampum/engine';
import {
  playChunk, simulateEncounter as simulateWith, solveEncounter as solveWith, solveEncounterAsync as solveWithAsync,
  type ChunkJob, type ChunkRunner, type ChunkTotals, type EncounterContent, type FieldedGroup, type PoolSpec,
  type SimOptions, type SimResult, type SolvedEncounter, type SolveOptions,
} from '@pimpampum/combat-balancer';
import { buildReferenceParty, isExplicitParty, type PartySpec } from './players/party.js';
import { buildComposition } from './enemies/factory.js';
import { getEnemy } from './enemies/catalog.js';
import { fullKitLevel, type EnemyDefinition } from './enemies/types.js';
import { createRegistry } from './registry.js';

export {
  TARGET_WINRATES, PV_MIN, PV_MAX, DEFAULT_MAX_AVG_ROUNDS, SOLVE_MISS_EPSILON,
} from '@pimpampum/combat-balancer';
export type {
  PoolSpec, SolvedGroup, SolvedEncounter, FieldedGroup,
  SimOptions, SimResult, SolveOptions, ChunkJob, ChunkTotals, ChunkRunner,
} from '@pimpampum/combat-balancer';

let registry: EffectRegistry | null = null;

export const FANTASY_ENCOUNTERS: EncounterContent<PartySpec> = {
  registry: () => (registry ??= createRegistry()),
  buildParty: buildReferenceParty,
  isFixedParty: isExplicitParty,
  buildEncounter: buildComposition,
  creature(enemyId) {
    const def = getEnemy(enemyId);
    return def && { bulk: def.bulk ?? 1, fullKitLevel: fullKitLevel(def) };
  },
};

/** Play a composition against a party; the player winrate IS its difficulty. */
export function simulateEncounter(groups: FieldedGroup[], party: PartySpec, opts?: SimOptions): SimResult {
  return simulateWith(FANTASY_ENCOUNTERS, groups, party, opts);
}

/** Set the enemies' PV so the simulated player winrate hits `targetWinrate`. */
export function solveEncounter(
  pool: PoolSpec[], party: PartySpec, targetWinrate: number, opts?: SolveOptions,
): SolvedEncounter | null {
  return solveWith(FANTASY_ENCOUNTERS, pool, party, targetWinrate, opts);
}

/** Single-species convenience: solve `count` of one creature against the party. */
export function generateEncounter(
  def: EnemyDefinition, count: number, party: PartySpec, targetWinrate: number, opts?: SolveOptions,
): SolvedEncounter | null {
  return solveEncounter([{ enemyId: def.id, count }], party, targetWinrate, opts);
}

/** Instantiate every enemy of a solved encounter. */
export function buildSolvedEncounter(solved: SolvedEncounter): Character[] {
  return buildComposition(solved.groups);
}

/**
 * Solve with every simulation's fights spread over `run` — a pool of workers
 * each calling `playEncounterChunk`. The same answer as `solveEncounter`,
 * several times sooner: the encounter creator has a 3-second budget
 * (`test/encounter-speed.test.ts`) that one thread cannot meet.
 */
export function solveEncounterAsync(
  pool: PoolSpec[], party: PartySpec, targetWinrate: number, run: ChunkRunner,
  opts: SolveOptions = {}, cancelled?: () => boolean,
): Promise<SolvedEncounter | null> {
  return solveWithAsync(FANTASY_ENCOUNTERS, pool, party, targetWinrate, opts, run, cancelled);
}

/** What a worker runs: one chunk of fights of this set. */
export function playEncounterChunk(party: PartySpec, job: ChunkJob): ChunkTotals {
  return playChunk(FANTASY_ENCOUNTERS, party, job);
}
