<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { getEnemy } from '@pimpampum/enemies';
import {
  listTrackerSessions, deleteTrackerSession, sessionLabel, type TrackerSession,
} from '../composables/combatTracker';
import { useParties } from '../composables/party';
import PartyRoster from '../components/party/PartyRoster.vue';

/**
 * One party's page: who they are (editable right here) and every fight they
 * have walked into.
 *
 * Opening a party MAKES IT ACTIVE, so the encounter creator immediately prices
 * against the table you were just looking at — that is the whole point of the
 * party being one stored thing.
 *
 * The `sense-grup` id is the catch-all for combats saved before they were filed
 * under a party, or whose party has since been deleted: they stay reachable
 * rather than stranded in localStorage. It has no roster to show.
 */

const base = import.meta.env.BASE_URL;
const route = useRoute();
const router = useRouter();
const party = useParties();

const partyId = computed(() => String(route.params.partyId ?? ''));
const unfiled = computed(() => partyId.value === 'sense-grup');
const stored = computed(() => party.parties.value.find(p => p.id === partyId.value) ?? null);

watch(partyId, id => {
  if (id && id !== 'sense-grup') party.selectParty(id);
}, { immediate: true });

const all = ref<TrackerSession[]>(listTrackerSessions());

const combats = computed(() => {
  if (!unfiled.value) return all.value.filter(s => s.partyId === partyId.value);
  const known = new Set(party.parties.value.map(p => p.id));
  return all.value.filter(s => !s.partyId || !known.has(s.partyId));
});

const title = computed(() =>
  unfiled.value ? 'Combats sense grup' : stored.value?.name ?? 'Grup desconegut');

// --- party name & deletion ---------------------------------------------------
const renaming = ref(false);
const renameDraft = ref('');

function startRename(): void {
  renameDraft.value = stored.value?.name ?? '';
  renaming.value = true;
}
function commitRename(): void {
  if (stored.value) party.renameParty(stored.value.id, renameDraft.value);
  renaming.value = false;
}

function removeParty(): void {
  const p = stored.value;
  if (!p) return;
  // Say what survives: the fights this table has played are kept, so the GM is
  // not deciding the fate of their whole history from one button.
  const kept = combats.value.length > 0
    ? `\n\nEls ${combats.value.length} combats que ha jugat es conserven, sota «Combats sense grup».`
    : '';
  if (!confirm(`Esborra el grup «${p.name}» i els seus herois? No es pot desfer.${kept}`)) return;
  party.deleteParty(p.id);
  router.push({ name: 'player-combats' });
}

function forget(id: string): void {
  deleteTrackerSession(id);
  all.value = listTrackerSessions();
}

const dateFormat = new Intl.DateTimeFormat('ca-ES', {
  day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
});
const formatDate = (ms: number) => dateFormat.format(new Date(ms));

/** Distinct creature icons of a combat, for a glance-able row. */
const icons = (s: TrackerSession) =>
  s.groups.map(g => getEnemy(g.enemyId)?.iconPath).filter((p): p is string => !!p);

const aliveOf = (s: TrackerSession) =>
  s.groups.reduce((n, g) => n + g.bodies.filter(b => b.currentPV > 0).length, 0);
const totalOf = (s: TrackerSession) =>
  s.groups.reduce((n, g) => n + g.bodies.length, 0);
</script>

<template>
  <div class="party-page">
    <header class="head">
      <router-link class="back" :to="{ name: 'player-combats' }">← Grups de jugadors</router-link>

      <div class="title-row">
        <h2 v-if="!renaming" class="title">{{ title }}</h2>
        <input
          v-else
          v-model="renameDraft"
          class="title-input"
          autofocus
          @keyup.enter="commitRename"
          @keyup.esc="renaming = false"
          @blur="commitRename"
        >
        <template v-if="stored && !renaming">
          <button type="button" class="icon-btn" title="Canvia el nom" @click="startRename">✎</button>
          <button type="button" class="icon-btn danger" title="Esborra aquest grup" @click="removeParty">🗑</button>
        </template>
      </div>
    </header>

    <div class="cols">
      <!-- Who they are. Edited right here — same roster as the creator.
           Gated on `stored`, not on `unfiled`: for an unknown id the roster
           would otherwise show whichever party happens to be active. -->
      <section v-if="stored" class="col panel">
        <h3 class="col-title">Els herois</h3>
        <PartyRoster hide-picker />
      </section>

      <!-- What they have fought. -->
      <section class="col panel" :class="{ wide: !stored }">
        <h3 class="col-title">Combats</h3>

        <div v-if="combats.length > 0" class="list">
          <div v-for="c in combats" :key="c.id" class="row">
            <router-link class="row-link" :to="{ name: 'tracker', params: { id: c.id } }">
              <span class="row-icons">
                <img v-for="(p, i) in icons(c)" :key="i" :src="base + p" alt="">
              </span>
              <span class="row-name">{{ sessionLabel(c) }}</span>
              <span class="row-alive">{{ aliveOf(c) }}/{{ totalOf(c) }} dempeus</span>
              <span class="row-date">{{ formatDate(c.updatedAt) }}</span>
            </router-link>
            <button type="button" class="chip-x" title="Esborra aquest combat" @click="forget(c.id)">×</button>
          </div>
        </div>

        <p v-else class="empty">
          Aquest grup encara no ha lluitat cap combat.
          <router-link :to="{ name: 'encounters' }">Crea'n un</router-link>
          i tria «Combat contra els jugadors».
        </p>
      </section>
    </div>
  </div>
</template>

<style scoped>
.party-page { max-width: 1100px; margin: 0 auto; }

.head { margin-bottom: 1.1rem; }
.back {
  font-family: 'MedievalSharp', serif; font-size: 0.9rem;
  color: var(--parchment-dark); text-decoration: none;
}
.back:hover { color: var(--parchment); }

.title-row { display: flex; align-items: center; gap: 0.4rem; margin-top: 0.3rem; }
.title {
  font-family: 'Cinzel Decorative', serif; color: var(--parchment);
  font-size: 1.3rem; margin: 0;
}
.title-input {
  font-family: 'Cinzel Decorative', serif; font-size: 1.15rem;
  color: var(--parchment); background: rgba(0, 0, 0, 0.35);
  border: 1px solid var(--parchment-dark); border-radius: 4px;
  padding: 0.2rem 0.4rem; min-width: 12rem;
}
.icon-btn {
  background: none; border: 1px solid transparent; border-radius: 4px;
  color: var(--parchment-dark); cursor: pointer;
  font-size: 0.9rem; line-height: 1; padding: 0.25rem 0.35rem;
}
.icon-btn:hover { color: var(--parchment); background: rgba(232, 220, 196, 0.1); }
.icon-btn.danger:hover { color: #e0705f; }

/* Heroes beside history: the two things a party page is about. */
.cols { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1.4fr); gap: 1rem; align-items: start; }
.col.wide { grid-column: 1 / -1; }
.panel {
  background: rgba(0, 0, 0, 0.14);
  border: 1px solid rgba(232, 220, 196, 0.25);
  border-radius: 8px; padding: 1rem;
}
.col-title {
  font-family: 'Cinzel Decorative', serif; color: var(--parchment);
  font-size: 1.05rem; margin: 0 0 0.8rem; text-align: center;
}

.list { display: flex; flex-direction: column; gap: 0.4rem; }
.row { display: flex; align-items: center; gap: 0.4rem; }
.row-link {
  flex: 1; display: flex; align-items: center; gap: 0.8rem; min-width: 0;
  padding: 0.55rem 0.9rem; text-decoration: none;
  background: rgba(0, 0, 0, 0.22);
  border: 1px solid var(--parchment-dark); border-radius: 6px;
  transition: all 0.15s;
}
.row-link:hover { background: rgba(232, 220, 196, 0.12); border-color: var(--parchment); }

.row-icons { display: flex; gap: 0.2rem; flex-shrink: 0; }
.row-icons img {
  width: 26px; height: 26px;
  filter: invert(85%) sepia(15%) saturate(360%) hue-rotate(2deg) brightness(95%);
}
.row-name {
  font-family: 'MedievalSharp', serif; color: var(--parchment); flex: 1;
  min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.row-alive, .row-date {
  font-family: 'Crimson Text', serif; color: var(--parchment-dark); font-size: 0.9rem;
}
.row-date { font-style: italic; min-width: 9ch; text-align: right; }

.chip-x {
  background: none; border: none; cursor: pointer;
  color: var(--parchment-dark); font-size: 1.1rem; padding: 0 0.3rem;
}
.chip-x:hover { color: #e0705f; }

.empty {
  text-align: center; padding: 2rem 1rem;
  font-family: 'Crimson Text', serif; font-style: italic; color: var(--parchment-dark);
}
.empty a { color: var(--parchment); }

@media (max-width: 860px) {
  .cols { grid-template-columns: 1fr; }
}
@media (max-width: 620px) {
  .row-alive, .row-date { display: none; }
}
</style>
