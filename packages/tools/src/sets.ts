/**
 * WHICH SET A HARNESS MEASURES — `--set fantasy` (the default) or
 * `--set elements`.
 *
 * Measurement never names a set (CLAUDE.md), but a harness has to install one,
 * and it used to import the fantasy set by name. Both sets export the same
 * surface — the content root and a `./bench` adapter with the calibration
 * data — so a harness takes everything from here and runs on either.
 */
import { flag } from '@pimpampum/bench';
import type { GameSet } from '@pimpampum/bench';

type Root = typeof import('@pimpampum/set-fantasy');
type Bench = typeof import('@pimpampum/set-fantasy/bench');

const SETS = {
  fantasy: { root: '@pimpampum/set-fantasy', bench: '@pimpampum/set-fantasy/bench', export: 'FANTASY' },
  elements: { root: '@pimpampum/set-elements', bench: '@pimpampum/set-elements/bench', export: 'ELEMENTS' },
} as const;

export interface ChosenSet {
  id: keyof typeof SETS;
  root: Root;
  bench: Bench;
  gameSet: GameSet;
  /** What an isolated child loads to install the same set. */
  ref: { module: string; export: string };
}

export async function chosenSet(): Promise<ChosenSet> {
  const id = (flag('--set') ?? 'fantasy') as keyof typeof SETS;
  const spec = SETS[id];
  if (!spec) throw new Error(`--set ${id}: unknown set (${Object.keys(SETS).join(', ')})`);
  const root = await import(spec.root) as Root;
  const bench = await import(spec.bench) as Bench & Record<string, GameSet>;
  return { id, root, bench, gameSet: bench[spec.export], ref: { module: import.meta.resolve(spec.bench), export: spec.export } };
}
