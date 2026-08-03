import { ref, watch, onBeforeUnmount, type Ref } from 'vue';
import { getEnemy, type SolvedEncounter } from '@pimpampum/enemies';

/**
 * A COMBAT TRACKER session: the state a GM keeps while running a solved
 * encounter at a real table — who is on the board and how much PV each body
 * has left.
 *
 * It lives in localStorage under a random id that also sits in the URL, so a
 * refresh (or a closed tab) never loses a fight in progress, and a second tab
 * pointed at the same id — the players' view — follows along through the
 * `storage` event.
 */

const PREFIX = 'pimpampum.tracker.';
const VERSION = 1;

/** One body on the board: the PV tracker is the whole model. */
export interface TrackedBody {
  uid: string;
  /** The GM's OWN name for this body, if they gave it one. Absent means "follow
   *  the group" — the display name is derived, never stored. Storing the
   *  derived name is what used to make a group rename stop halfway: any body
   *  whose stored string had drifted from the expected default was silently
   *  skipped, and the players' screen kept the old name. */
  name?: string;
  maxPV: number;
  currentPV: number;
}

/** Every body of one creature: they all share a kit, so their cards are shown
 *  once for the group and only the PV trackers repeat. */
export interface TrackedGroup {
  enemyId: string;
  level: number;
  /** Starting PV the balancer solved for each body of this group. */
  pv: number;
  /** What the GM calls this lot at the table — «Els guàrdies del pont» rather
   *  than «Goblin». Empty/absent means the creature's own name; the field is an
   *  override, never a copy, so renaming a creature in the catalog still shows
   *  through on old sessions. */
  name?: string;
  bodies: TrackedBody[];
}

export interface TrackerSession {
  v: number;
  id: string;
  createdAt: number;
  updatedAt: number;
  /** Which party fought this. Optional because sessions created before combats
   *  were filed under a party have none — those surface as unfiled rather than
   *  being dropped. */
  partyId?: string;
  /** The party's name AT THE TIME, so a renamed or deleted party still reads
   *  sensibly in the list. */
  partyName?: string;
  /** When false the players' view shows only the DAMAGE each enemy has taken,
   *  never its PV — the GM decides fight by fight. */
  revealPV: boolean;
  summary: { targetWinrate: number; predictedWinrate: number; avgRounds: number };
  groups: TrackedGroup[];
}

// --- ids ---------------------------------------------------------------------

function randomId(length = 8): string {
  const alphabet = 'abcdefghijkmnopqrstuvwxyz23456789'; // no l/1/0/o: these get read aloud
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return [...bytes].map(b => alphabet[b % alphabet.length]).join('');
}

// --- storage -----------------------------------------------------------------

export function trackerKey(id: string): string {
  return PREFIX + id;
}

/**
 * Sessions written before body names became derived stored the auto-generated
 * string on every body. Drop those, so they follow their group again; anything
 * that does NOT look auto-generated was typed by the GM and is kept.
 *
 * Both spellings are checked — the creature's name and the group's current name
 * — because a session may have been renamed while the old push-down code was
 * live, leaving bodies on either form.
 */
function dropDerivedBodyNames(session: TrackerSession): TrackerSession {
  for (const group of session.groups ?? []) {
    const count = group.bodies.length;
    const creature = getEnemy(group.enemyId)?.displayName ?? group.enemyId;
    const label = groupName(group);
    group.bodies.forEach((body, i) => {
      if (body.name === undefined) return;
      if (body.name === defaultBodyName(creature, i, count)
        || body.name === defaultBodyName(label, i, count)) {
        delete body.name;
      }
    });
  }
  return session;
}

export function loadTrackerSession(id: string): TrackerSession | null {
  try {
    const raw = localStorage.getItem(trackerKey(id));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as TrackerSession;
    if (!parsed || parsed.v !== VERSION || !Array.isArray(parsed.groups)) return null;
    return dropDerivedBodyNames(parsed);
  } catch {
    return null;
  }
}

export function saveTrackerSession(session: TrackerSession): void {
  try {
    localStorage.setItem(trackerKey(session.id), JSON.stringify(session));
  } catch {
    // Storage full or blocked (private mode): the tracker still works in memory.
  }
}

export function deleteTrackerSession(id: string): void {
  try {
    localStorage.removeItem(trackerKey(id));
  } catch { /* ignore */ }
}

/** Every stored combat, newest activity first. The index IS the key scan —
 *  a separate index list would only drift out of sync with the sessions. */
export function listTrackerSessions(): TrackerSession[] {
  const out: TrackerSession[] = [];
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key?.startsWith(PREFIX)) continue;
      const session = loadTrackerSession(key.slice(PREFIX.length));
      if (session) out.push(session);
    }
  } catch { /* ignore */ }
  return out.sort((a, b) => b.updatedAt - a.updatedAt);
}

// --- creation ----------------------------------------------------------------

/** Every stored combat fought by one party, newest activity first. */
export function listTrackerSessionsFor(partyId: string): TrackerSession[] {
  return listTrackerSessions().filter(s => s.partyId === partyId);
}

export interface TrackerSessionInput {
  encounter: SolvedEncounter;
  /** The party that walked into this fight. */
  partyId?: string;
  partyName?: string;
}

/** Turn a solved encounter into a fresh tracker session and persist it.
 *
 *  Only the ENEMIES are tracked: the players sit at the table with their own
 *  sheets and dice, and the GM has no business keeping their PV. */
export function createTrackerSession(input: TrackerSessionInput): TrackerSession {
  const { encounter, partyId, partyName } = input;
  const now = Date.now();

  const session: TrackerSession = {
    v: VERSION,
    id: randomId(),
    createdAt: now,
    updatedAt: now,
    partyId,
    partyName,
    revealPV: false,
    summary: {
      targetWinrate: encounter.targetWinrate,
      predictedWinrate: encounter.predictedWinrate,
      avgRounds: encounter.avgRounds,
    },
    groups: encounter.groups.map(g => ({
      enemyId: g.enemyId,
      level: g.level,
      pv: g.pv,
      // No `name`: unnamed bodies follow their group, so renaming the group
      // renames them everywhere at once.
      bodies: Array.from({ length: g.count }, () => ({
        uid: randomId(6),
        maxPV: g.pv,
        currentPV: g.pv,
      })),
    })),
  };
  saveTrackerSession(session);
  return session;
}

/** What to call a group: the GM's own name for it, else the creature's. */
export function groupName(group: TrackedGroup): string {
  return group.name?.trim() || getEnemy(group.enemyId)?.displayName || group.enemyId;
}

/** What a body is called when nobody has named it by hand: the group's name,
 *  numbered when there is more than one of them. */
export function defaultBodyName(groupLabel: string, index: number, count: number): string {
  return count > 1 ? `${groupLabel} ${index + 1}` : groupLabel;
}

/** What to show for a body: the GM's own name, else derived from the group.
 *  EVERY screen calls this — deriving it in one place is what guarantees the
 *  GM's tracker and the players' screen can never disagree. */
export function bodyName(group: TrackedGroup, index: number): string {
  const own = group.bodies[index]?.name?.trim();
  return own || defaultBodyName(groupName(group), index, group.bodies.length);
}

/** A short human label for a session (used by the saved-combats list). */
export function sessionLabel(session: TrackerSession): string {
  const parts = session.groups.map(g => {
    const name = groupName(g);
    return g.bodies.length > 1 ? `${g.bodies.length}× ${name}` : name;
  });
  return parts.join(' · ') || 'Encontre buit';
}

// --- the reactive session ----------------------------------------------------

export interface UseTrackerSession {
  session: Ref<TrackerSession | null>;
  /** True once the id has been looked up and found missing. */
  missing: Ref<boolean>;
  /** Persist the current state (bumping `updatedAt`). */
  touch(): void;
}

/**
 * Bind a session id to reactive state.
 *
 * `writable: false` (the players' view) never persists — it only follows the
 * GM's tab. Writers guard against re-persisting state they just received from
 * another tab, or two GM tabs would bounce `storage` events off each other
 * forever.
 */
export function useTrackerSession(id: Ref<string>, writable = true): UseTrackerSession {
  const session = ref<TrackerSession | null>(null);
  const missing = ref(false);
  let lastSerialized = '';

  function read(): void {
    const loaded = loadTrackerSession(id.value);
    session.value = loaded;
    missing.value = loaded === null;
    lastSerialized = loaded ? JSON.stringify(loaded) : '';
  }

  function touch(): void {
    const s = session.value;
    if (!s || !writable) return;
    s.updatedAt = Date.now();
    const serialized = JSON.stringify(s);
    if (serialized === lastSerialized) return;
    lastSerialized = serialized;
    saveTrackerSession(s);
  }

  watch(id, read, { immediate: true });

  if (writable) {
    // Any edit in the GM's view persists immediately: the whole point is that
    // a refresh mid-fight loses nothing.
    watch(session, () => {
      const s = session.value;
      if (!s) return;
      // Compare BEFORE stamping updatedAt, so an echo of another tab's write
      // (which only changed `updatedAt`) does not bounce back out.
      const { updatedAt: _ignored, ...rest } = s;
      const { updatedAt: _prev, ...prevRest } = lastSerialized ? JSON.parse(lastSerialized) as TrackerSession : ({} as TrackerSession);
      if (JSON.stringify(rest) === JSON.stringify(prevRest)) return;
      touch();
    }, { deep: true });
  }

  function onStorage(event: StorageEvent): void {
    if (event.key !== trackerKey(id.value)) return;
    read();
  }
  window.addEventListener('storage', onStorage);
  onBeforeUnmount(() => window.removeEventListener('storage', onStorage));

  return { session, missing, touch };
}
