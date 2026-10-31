/**
 * One worker thread of a cell pool (`pool.ts`): it rebuilds each solve's root
 * round from its snapshot and evaluates the cells it is handed, exactly as
 * the solving thread would (`Referee.evaluateCell`).
 */
import { parentPort, workerData } from 'node:worker_threads';
import { CombatEngine } from '@pimpampum/engine';
import { BudgetExceeded, Referee, Unsupported, type Joint, type RefereeContent, type RootRound } from '../audit/referee.js';

const { specifier, name } = workerData as { specifier: string; name: string };
const content = (await import(specifier))[name] as RefereeContent;
if (!content?.registry) throw new Error(`cell pool worker: ${specifier} exports no content named ${name}`);

let solve: { referee: Referee; prepared: CombatEngine; root: RootRound } | null = null;

type Message = { type: 'begin'; root: RootRound } | { type: 'cell'; id: number; row: Joint; col: Joint };

parentPort!.on('message', (m: Message) => {
  if (m.type === 'begin') {
    // A fresh referee per solve, as the solving thread makes: its memo is per round.
    solve = { referee: new Referee(m.root.opts), prepared: CombatEngine.restore(m.root.snapshot, content.registry, content.deref), root: m.root };
    return;
  }
  try {
    if (!solve) throw new Error('cell pool worker: a cell before any round');
    const before = solve.referee.sims;
    const stat = solve.referee.evaluateCell(solve.prepared, solve.root.sig, solve.root.depth, m.row, m.col);
    parentPort!.postMessage({ id: m.id, stat, sims: solve.referee.sims - before });
  } catch (e) {
    const kind = e instanceof BudgetExceeded ? 'BudgetExceeded' : e instanceof Unsupported ? 'Unsupported' : 'Error';
    parentPort!.postMessage({ id: m.id, error: { kind, message: e instanceof Error ? e.message : String(e), stack: e instanceof Error ? e.stack : undefined } });
  }
});
