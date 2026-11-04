/**
 * THE FANTASY SET — the game this project has been designing.
 *
 * Everything a table needs, and nothing that measures it: player kits,
 * creatures, equipment, the party builder, and the encounter balancer bound to
 * all of those. Safe to bundle for a browser.
 *
 * The measurement side — the `GameSet` adapter and this set's calibration
 * (reference party, fight shapes) — is `@pimpampum/set-fantasy/bench`, kept
 * apart because it pulls in the Node-only bench layer.
 */
export * from './players/index.js';
export * from './enemies/index.js';
export * from './encounters.js';
export { createRegistry } from './registry.js';

/** The dice ladder this set's cards are built on (`sets/common/src/ladder.ts`). */
export { ATTACK_LADDER, DEFENSE_LADDER, BODY_PV } from '@pimpampum/set-common';
