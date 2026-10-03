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
