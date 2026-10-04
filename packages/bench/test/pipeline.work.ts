/**
 * The measuring half of `pipeline.slow.test.ts`: the delta of a subject across
 * the synthetic set's solved cells, in its own process.
 */
import { ActionType, DiceRoll, type ActionDefinition } from '@pimpampum/engine';
import {
  games, runMatrix, shapeEnemies, subjectParty, theRegistry, usableCells, useSet, type CellSetup, type SubjectKit,
} from '../src/index.js';
import { SYNTHETIC } from '../src/testing.js';

/** The neutral stand-in's shape, with other dice. */
function scaled(id: string, dice: [string, string, string]): SubjectKit {
  const mk = (i: number, name: string, type: ActionType, d: string, speed: number): ActionDefinition => ({
    id: `${id}-${i}`, name, skillId: id, unlockLevel: i, actionType: type, speed,
    dice: DiceRoll.parse(d), effects: [], description: '', iconPath: '',
  });
  return { id, actions: [
    mk(1, 'Strike', ActionType.Atac, dice[0], 2),
    mk(2, 'Block', ActionType.Defensa, dice[1], 3),
    mk(3, 'Heavy', ActionType.Atac, dice[2], 1),
  ] };
}

const KITS: Record<string, SubjectKit> = {
  // Far bigger than the stand-in: with searched targets, enemies focus the
  // biggest threat, which eats into a merely bigger kit's lead (NEXT-STEPS §31).
  giant: scaled('giant', ['6d6', '6d6', '8d6']),
  weakling: scaled('weakling', ['1d4', '1d4', '1d6']),
};

export interface Measured { cells: number; delta: number; deltaStderr: number; winrate: number; games: number }

/** `neutral` is the stand-in itself; `giant` and `weakling` are installed for the run. */
export function measure(kitId: string): Measured {
  useSet(SYNTHETIC);
  theRegistry();
  const uninstall = KITS[kitId] ? SYNTHETIC.installKit(KITS[kitId]) : () => {};
  try {
    const cells = usableCells();
    const full = SYNTHETIC.kit(kitId)!.fullLevel;
    const setup = (cell: (typeof cells)[number]): CellSetup => ({
      party: subjectParty(kitId, full, cell.companyIdx), enemies: shapeEnemies(cell.shapeIdx), subjectTeam: 0,
    });
    const r = runMatrix(cells, setup, games(1200));
    return { cells: cells.length, delta: r.delta, deltaStderr: r.deltaStderr, winrate: r.winrate, games: r.games };
  } finally {
    uninstall();
  }
}
