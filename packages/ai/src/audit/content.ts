/**
 * The audit's cards as a `RefereeContent`: what a copy of an audit position on
 * another thread needs. Status behaviours are named by the status key they
 * belong to and their place in `STATUS_BEHAVIORS` (the table a serialised
 * position already replays its statuses from).
 */
import { STATUS_BEHAVIORS } from './catalogue.js';
import { auditRegistryShared } from './position.js';
import type { RefereeContent } from './referee.js';

const NAMES = new Map<object, string>();
const OBJECTS = new Map<string, object>();
for (const [key, pair] of Object.entries(STATUS_BEHAVIORS)) {
  pair.forEach((behavior, i) => {
    const name = `${key}#${i}`;
    // A behaviour shared by two keys keeps its first name; either finds it.
    if (!NAMES.has(behavior)) NAMES.set(behavior, name);
    OBJECTS.set(name, behavior);
  });
}

export const AUDIT_CONTENT: RefereeContent = {
  registry: auditRegistryShared(),
  refOf: o => NAMES.get(o),
  deref: name => {
    const o = OBJECTS.get(name);
    if (!o) throw new Error(`audit content: no behaviour named ${name}`);
    return o;
  },
};
