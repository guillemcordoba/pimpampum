/**
 * THE ELEMENTS SET — Els Quatre Elements: a world where water, earth, fire and
 * air have benders, and where el Mestre de la Por rules through six borrowed
 * bodies. Design and inspirations: `DESIGN.md`.
 *
 * Everything a table needs, and nothing that measures it: player kits,
 * creatures, equipment, the party builder, and the encounter balancer bound to
 * all of those. Safe to bundle for a browser. The measurement side is
 * `@pimpampum/set-elements/bench`, kept apart because it pulls in Node.
 */
export * from './players/index.js';
export * from './enemies/index.js';
export * from './encounters.js';
export { createRegistry } from './registry.js';
