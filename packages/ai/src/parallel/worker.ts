/**
 * One worker thread of a cell pool (`pool.ts`): it rebuilds each solve's root
 * round from its snapshot and evaluates cells of each batch, exactly as the
 * solving thread would (`Referee.evaluateCell`). The solving thread is
 * blocked meanwhile, so every answer goes through shared memory: the cells are
 * claimed from a shared counter, the numbers written to a shared array, and
 * the count of finished cells is what wakes the solving thread.
 */
import { parentPort, workerData, type MessagePort } from 'node:worker_threads';
import { CombatEngine } from '@pimpampum/engine';
import { BudgetExceeded, Referee, Unsupported, type Joint, type RefereeContent, type RootRound } from '../audit/referee.js';
import { DONE, ERR, NEXT, READY } from './shared.js';

const { specifier, name, ctrl: ctrlBuffer, errors } = workerData as { specifier: string; name: string; ctrl: SharedArrayBuffer; errors: MessagePort };
const ctrl = new Int32Array(ctrlBuffer);

/** An error the solving thread reads once it wakes: flagged in shared
 *  memory, its text on this worker's own port (read synchronously there). */
function report(e: unknown): void {
  const kind = e instanceof BudgetExceeded ? 'BudgetExceeded' : e instanceof Unsupported ? 'Unsupported' : 'Error';
  errors.postMessage({ kind, message: e instanceof Error ? e.message : String(e), stack: e instanceof Error ? e.stack : undefined });
  Atomics.store(ctrl, ERR, 1);
}

let content: RefereeContent | undefined;
try {
  content = (await import(specifier))[name] as RefereeContent;
  if (!content?.registry) throw new Error(`cell pool worker: ${specifier} exports no content named ${name}`);
} catch (e) {
  report(e);
}
Atomics.add(ctrl, READY, 1);
Atomics.notify(ctrl, READY);

let solve: { referee: Referee; prepared: CombatEngine; root: RootRound } | null = null;

type Message =
  | { type: 'begin'; root: RootRound }
  | { type: 'batch'; pairs: { row: Joint; col: Joint }[]; claim: SharedArrayBuffer; results: SharedArrayBuffer };

parentPort!.on('message', (m: Message) => {
  if (m.type === 'begin') {
    if (!content) return;
    // A fresh referee per solve, as the solving thread makes: its memo is per round.
    solve = { referee: new Referee(m.root.opts), prepared: CombatEngine.restore(m.root.snapshot, content.registry, content.deref), root: m.root };
    return;
  }
  const claim = new Int32Array(m.claim);
  const results = new Float64Array(m.results);
  for (let i = Atomics.add(claim, NEXT, 1); i < m.pairs.length; i = Atomics.add(claim, NEXT, 1)) {
    try {
      if (!solve) throw new Error('cell pool worker: a batch before any round');
      const before = solve.referee.sims;
      const stat = solve.referee.evaluateCell(solve.prepared, solve.root.sig, solve.root.depth, m.pairs[i].row, m.pairs[i].col);
      results.set([stat.mean, stat.se, solve.referee.sims - before], i * 3);
    } catch (e) {
      report(e);
    }
    Atomics.add(claim, DONE, 1);
    Atomics.notify(claim, DONE);
  }
});

