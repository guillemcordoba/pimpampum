<script setup lang="ts">
import { computed } from 'vue';
import { useRouter } from 'vue-router';
import { listTrackerSessions, type TrackerSession } from '../composables/combatTracker';
import { useParties } from '../composables/party';

/**
 * The combats a GM runs at a real table, filed under the PARTY that fought
 * them: this screen lists the parties, and one party's page lists its fights.
 *
 * Combats saved before they were filed (or whose party has since been deleted)
 * are not dropped — they collect under an "unfiled" row.
 */

const base = import.meta.env.BASE_URL;
const router = useRouter();
const party = useParties();

const sessions = listTrackerSessions();

/** Combats per party id, newest activity first (as `listTrackerSessions` sorts). */
const byParty = computed(() => {
  const map = new Map<string, TrackerSession[]>();
  for (const s of sessions) {
    const key = s.partyId ?? '';
    const list = map.get(key);
    if (list) list.push(s);
    else map.set(key, [s]);
  }
  return map;
});

interface PartyRow {
  id: string;
  name: string;
  heroes: string[];
  /** The heroes' own skill icons — the party at a glance. */
  icons: string[];
  combats: number;
  lastPlayed: number | null;
  orphan: boolean;
}

const rows = computed<PartyRow[]>(() => {
  const out: PartyRow[] = party.parties.value.map(p => {
    const combats = byParty.value.get(p.id) ?? [];
    return {
      id: p.id,
      name: p.name,
      heroes: p.heroes.map(h => h.name),
      icons: p.heroes.map(h => h.iconPath).filter(Boolean),
      combats: combats.length,
      lastPlayed: combats[0]?.updatedAt ?? null,
      orphan: false,
    };
  });

  // Combats whose party is gone (or that predate the filing) still deserve a
  // way in — losing a fight in progress because a party was renamed away would
  // be the worst possible failure of this screen.
  const known = new Set(party.parties.value.map(p => p.id));
  const stray = sessions.filter(s => !s.partyId || !known.has(s.partyId));
  if (stray.length > 0) {
    out.push({
      id: '',
      name: 'Combats sense grup',
      heroes: [],
      icons: [],
      combats: stray.length,
      lastPlayed: stray[0]?.updatedAt ?? null,
      orphan: true,
    });
  }
  return out;
});

const dateFormat = new Intl.DateTimeFormat('ca-ES', {
  day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
});
const formatDate = (ms: number) => dateFormat.format(new Date(ms));

/** A new party opens straight onto its own page, which is where its heroes
 *  get added. */
function newParty(): void {
  const created = party.createParty();
  router.push({ name: 'party-combats', params: { partyId: created.id } });
}
</script>

<template>
  <div class="list-page">
    <div class="list">
      <router-link
        v-for="r in rows" :key="r.id || 'orphans'"
        class="row-link"
        :class="{ orphan: r.orphan }"
        :to="{ name: 'party-combats', params: { partyId: r.id || 'sense-grup' } }"
      >
        <span class="row-icons">
          <img v-for="(p, i) in r.icons" :key="i" :src="base + p" alt="">
        </span>
        <span class="row-main">
          <span class="row-name">{{ r.name }}</span>
          <span v-if="r.heroes.length" class="row-heroes">{{ r.heroes.join(', ') }}</span>
        </span>
        <span class="row-count">
          {{ r.combats }} {{ r.combats === 1 ? 'combat' : 'combats' }}
        </span>
        <span class="row-date">{{ r.lastPlayed ? formatDate(r.lastPlayed) : '—' }}</span>
      </router-link>
    </div>

    <button type="button" class="new-party" @click="newParty">+ crea un grup de jugadors</button>

    <p class="hint">
      Els combats es guarden dins el grup que els juga.
      <router-link :to="{ name: 'encounters' }">Crea un encontre</router-link>
      i tria «Combat contra els jugadors».
    </p>
  </div>
</template>

<style scoped>
.list-page { max-width: 800px; margin: 0 auto; }
.list { display: flex; flex-direction: column; gap: 0.4rem; }

.row-link {
  display: flex; align-items: center; gap: 0.8rem;
  padding: 0.7rem 0.9rem; text-decoration: none;
  background: rgba(0, 0, 0, 0.22);
  border: 1px solid var(--parchment-dark); border-radius: 6px;
  transition: all 0.15s;
}
.row-link:hover { background: rgba(232, 220, 196, 0.12); border-color: var(--parchment); }
.row-link.orphan { border-style: dashed; opacity: 0.85; }

.row-icons { display: flex; gap: 0.2rem; flex-shrink: 0; }
.row-icons img {
  width: 26px; height: 26px;
  filter: invert(85%) sepia(15%) saturate(360%) hue-rotate(2deg) brightness(95%);
}
.row-main { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 0.1rem; }
.row-name { font-family: 'Cinzel Decorative', serif; color: var(--parchment); }
.row-heroes {
  font-family: 'Crimson Text', serif; color: var(--parchment-dark); font-size: 0.85rem;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.row-count, .row-date {
  font-family: 'Crimson Text', serif; color: var(--parchment-dark); font-size: 0.9rem;
}
.row-date { font-style: italic; min-width: 9ch; text-align: right; }

.new-party {
  margin-top: 0.6rem; width: 100%;
  font-family: 'MedievalSharp', serif; font-size: 0.95rem;
  color: var(--parchment-dark); background: rgba(0, 0, 0, 0.22);
  border: 1px dashed var(--parchment-dark); border-radius: 6px;
  padding: 0.6rem 0.9rem; cursor: pointer; transition: all 0.15s;
}
.new-party:hover {
  color: var(--parchment); border-color: var(--parchment);
  background: rgba(232, 220, 196, 0.1);
}

.hint {
  text-align: center; padding: 2rem 1rem 0;
  font-family: 'Crimson Text', serif; font-style: italic; color: var(--parchment-dark);
}
.hint a { color: var(--parchment); }

@media (max-width: 620px) {
  .row-date { display: none; }
}
</style>
