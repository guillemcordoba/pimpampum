import { ref, computed, type Ref, type ComputedRef } from 'vue';
import { PLAYER_SKILLS, COMPLEMENTARY_SKILLS, PLAYER_PV, getSkill, type CharacterBuildSpec } from '@pimpampum/skills';

/**
 * The GM's PARTIES — the players who sit at their table.
 *
 * This is the thing a GM enters once and then stops thinking about. Both
 * screens that need players read it: the encounter creator prices fights
 * against the REAL party (their kits, levels, PV and gear go straight into the
 * balancer as an explicit `PartySpec`), and the AI combat fields the same
 * heroes instead of inventing new ones.
 *
 * A GM may run more than one table, so parties are a keyed list — the same
 * shape `combatTracker.ts` uses for saved combats, and for the same reason:
 * localStorage keys ARE the index, so there is no separate list to drift out
 * of sync. One party is `active` at a time; that pointer lives under its own
 * key (not under the party prefix, or the key scan would pick it up).
 *
 * The state is a module-level singleton rather than per-component, so editing
 * a hero in the creator is visible in the AI setup without a round-trip
 * through storage events.
 */

const PREFIX = 'pimpampum.party.';
const ACTIVE_KEY = 'pimpampum.activeParty';
/** Set once the first-run default party has been handed out — see ensureLoaded. */
const SEEDED_KEY = 'pimpampum.partySeeded';
const VERSION = 1;

/** One player character, exactly as the character builder produces it. */
export interface HeroSpec {
  name: string;
  classCss: string;
  iconPath: string;
  pv: number;
  /** skillId -> level (= how many of the skill's actions they know). */
  skills: Record<string, number>;
  equipment: string[];
  potions: string[];
}

export interface StoredParty {
  v: number;
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  heroes: HeroSpec[];
}

// --- ids ---------------------------------------------------------------------

function randomId(length = 8): string {
  const alphabet = 'abcdefghijkmnopqrstuvwxyz23456789'; // no l/1/0/o: these get read aloud
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return [...bytes].map(b => alphabet[b % alphabet.length]).join('');
}

// --- storage -----------------------------------------------------------------

function partyKey(id: string): string {
  return PREFIX + id;
}

function readParty(id: string): StoredParty | null {
  try {
    const raw = localStorage.getItem(partyKey(id));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredParty;
    return parsed && parsed.v === VERSION && Array.isArray(parsed.heroes) ? parsed : null;
  } catch {
    return null;
  }
}

function writeParty(party: StoredParty): void {
  try {
    localStorage.setItem(partyKey(party.id), JSON.stringify(party));
  } catch {
    // Storage full or blocked (private mode): the party still works in memory.
  }
}

function readAll(): StoredParty[] {
  const out: StoredParty[] = [];
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key?.startsWith(PREFIX)) continue;
      const party = readParty(key.slice(PREFIX.length));
      if (party) out.push(party);
    }
  } catch { /* ignore */ }
  return out.sort((a, b) => b.updatedAt - a.updatedAt);
}

// --- the default party -------------------------------------------------------

/** Passive-armour value → the Armor item that provides it (mirrors party.ts). */
const ARMOR_BY_VALUE: Record<number, string | null> = {
  0: null,
  1: 'armadura-de-cuir',
  2: 'armadura-de-ferro',
};

const DEFAULT_HERO_LEVEL = 5;

/** Build one hero around a single skill, geared so its cards actually work. */
export function heroFromSkill(name: string, skillId: string, level = DEFAULT_HERO_LEVEL, armor = 1): HeroSpec {
  const skill = getSkill(skillId) ?? PLAYER_SKILLS[0];
  const equipment = ['escut'];
  const armorId = ARMOR_BY_VALUE[Math.max(0, Math.min(2, Math.round(armor)))];
  if (armorId) equipment.push(armorId);
  // Weapon cards roll their own dice PLUS the wielded weapon's modifier and
  // require a weapon at all — an unarmed weapon kit is a dead hand.
  const usesWeapon = skill.actions.some(a => a.effects.some(e => e.type === 'weapon_damage'));
  if (usesWeapon) equipment.push('destral');
  return {
    name,
    classCss: skill.classCss,
    iconPath: skill.iconPath,
    pv: PLAYER_PV,
    skills: { [skill.id]: Math.max(1, Math.min(skill.actions.length, level)) },
    equipment,
    potions: [],
  };
}

/**
 * The party a GM gets before they have entered anything: four heroes on four
 * different MAIN kits. It exists so the encounter creator is usable on the
 * first visit — every part of it is meant to be overwritten.
 */
function defaultHeroes(): HeroSpec[] {
  const mains = PLAYER_SKILLS.filter(s => !COMPLEMENTARY_SKILLS.has(s.id));
  return Array.from({ length: 4 }, (_, i) =>
    heroFromSkill(`Heroi ${i + 1}`, (mains[i % mains.length] ?? PLAYER_SKILLS[0]).id));
}

// --- the reactive store ------------------------------------------------------

const parties = ref<StoredParty[]>([]);
const activeId = ref<string>('');

function persist(party: StoredParty): void {
  party.updatedAt = Date.now();
  writeParty(party);
  // Re-sort so the list stays newest-activity-first, like the stored order.
  parties.value = [...parties.value].sort((a, b) => b.updatedAt - a.updatedAt);
}

function makeParty(name: string, heroes: HeroSpec[]): StoredParty {
  const now = Date.now();
  return { v: VERSION, id: randomId(), name, createdAt: now, updatedAt: now, heroes };
}

let loaded = false;

/** Read localStorage once, seeding a default party the first time EVER.
 *
 *  "Ever" is the point of `SEEDED_KEY`: without it, deleting every party and
 *  reloading would conjure the default back, which reads as the delete having
 *  silently failed. Once the GM has been given a starting party, having none is
 *  a valid state. */
function ensureLoaded(): void {
  if (loaded) return;
  loaded = true;
  parties.value = readAll();

  let seededBefore = false;
  try { seededBefore = localStorage.getItem(SEEDED_KEY) === '1'; } catch { /* ignore */ }
  if (parties.value.length === 0 && !seededBefore) {
    const seeded = makeParty('Els meus jugadors', defaultHeroes());
    writeParty(seeded);
    parties.value = [seeded];
    try { localStorage.setItem(SEEDED_KEY, '1'); } catch { /* ignore */ }
  }

  let stored = '';
  try { stored = localStorage.getItem(ACTIVE_KEY) ?? ''; } catch { /* ignore */ }
  activeId.value = parties.value.some(p => p.id === stored)
    ? stored
    : parties.value[0]?.id ?? '';
  writeActive();
}

function writeActive(): void {
  try { localStorage.setItem(ACTIVE_KEY, activeId.value); } catch { /* ignore */ }
}

export interface UseParties {
  parties: Ref<StoredParty[]>;
  activeId: Ref<string>;
  /** The party currently being played with; null when every party is deleted. */
  active: ComputedRef<StoredParty | null>;
  heroes: ComputedRef<HeroSpec[]>;
  selectParty(id: string): void;
  createParty(name?: string): StoredParty;
  renameParty(id: string, name: string): void;
  deleteParty(id: string): void;
  addHero(hero: HeroSpec): void;
  updateHero(index: number, hero: HeroSpec): void;
  removeHero(index: number): void;
}

export function useParties(): UseParties {
  ensureLoaded();

  const active = computed(() => parties.value.find(p => p.id === activeId.value) ?? null);
  const heroes = computed(() => active.value?.heroes ?? []);

  function touchActive(): void {
    const p = active.value;
    if (p) persist(p);
  }

  return {
    parties,
    activeId,
    active,
    heroes,

    selectParty(id: string): void {
      if (!parties.value.some(p => p.id === id)) return;
      activeId.value = id;
      writeActive();
    },

    createParty(name?: string): StoredParty {
      const party = makeParty(name?.trim() || `Grup ${parties.value.length + 1}`, []);
      writeParty(party);
      parties.value = [party, ...parties.value];
      activeId.value = party.id;
      writeActive();
      return party;
    },

    renameParty(id: string, name: string): void {
      const p = parties.value.find(x => x.id === id);
      if (!p) return;
      p.name = name.trim() || p.name;
      persist(p);
    },

    // Deleting the LAST party leaves none, on purpose: re-seeding a default
    // here would make the delete look like it had failed. The default party is
    // a first-run convenience, not an invariant — `active` is simply null when
    // there is nothing to point at, and the screens offer to create one.
    //
    // A party's COMBATS are not touched: they are the table's history and are
    // stored separately (`combatTracker.ts`). They resurface under «sense grup».
    deleteParty(id: string): void {
      try { localStorage.removeItem(partyKey(id)); } catch { /* ignore */ }
      parties.value = parties.value.filter(p => p.id !== id);
      if (!parties.value.some(p => p.id === activeId.value)) {
        activeId.value = parties.value[0]?.id ?? '';
      }
      writeActive();
    },

    addHero(hero: HeroSpec): void {
      const p = active.value;
      if (!p || p.heroes.length >= 10) return;
      p.heroes.push(hero);
      touchActive();
    },

    updateHero(index: number, hero: HeroSpec): void {
      const p = active.value;
      if (!p || !p.heroes[index]) return;
      p.heroes[index] = hero;
      touchActive();
    },

    removeHero(index: number): void {
      const p = active.value;
      if (!p) return;
      p.heroes.splice(index, 1);
      touchActive();
    },
  };
}

// --- handing the party to the balancer / the engine --------------------------

/** A hero as the character builder and the balancer want it. */
export function heroBuildSpec(hero: HeroSpec, fallbackIndex = 0): CharacterBuildSpec {
  return {
    name: hero.name || `Heroi ${fallbackIndex + 1}`,
    classCss: hero.classCss,
    iconPath: hero.iconPath,
    pv: hero.pv,
    skills: { ...hero.skills },
    equipment: [...hero.equipment],
    potions: [...hero.potions],
    category: 'player',
  };
}

/** A short human label: who is in the party, for a picker row. */
export function partyLabel(party: StoredParty): string {
  if (party.heroes.length === 0) return 'sense herois';
  return party.heroes.map(h => h.name).join(', ');
}
