/**
 * `@pimpampum/ai/parallel` — a solve's cells on worker threads (Node only).
 * See `pool.ts`.
 */
import { AUDIT_CONTENT } from '../audit/content.js';
import { createCellPool, type NodeCellPool } from './pool.js';

export { createCellPool, NodeCellPool } from './pool.js';
export type { CellPoolOptions } from './pool.js';

/** A pool for the audit's cards (the positions `@pimpampum/ai/audit` deals). */
export function auditCellPool(workers: number): NodeCellPool {
  return createCellPool({ workers, content: AUDIT_CONTENT, contentModule: { specifier: '@pimpampum/ai/audit', name: 'AUDIT_CONTENT' } });
}
