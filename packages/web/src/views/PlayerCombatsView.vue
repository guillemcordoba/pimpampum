<script setup lang="ts">
import { ref } from 'vue';
import { getEnemy } from '@pimpampum/enemies';
import {
  listTrackerSessions, deleteTrackerSession, sessionLabel, type TrackerSession,
} from '../composables/combatTracker';

const base = import.meta.env.BASE_URL;

// Every combat the GM has open at a table, newest first. They live in this
// browser's localStorage — there is no account and no server.
const combats = ref<TrackerSession[]>(listTrackerSessions());

function forget(id: string): void {
  deleteTrackerSession(id);
  combats.value = listTrackerSessions();
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
  <div class="list-page">
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
      Cap combat obert.
      <router-link :to="{ name: 'encounters' }">Crea'n un</router-link>
      i tria «Combat contra els jugadors».
    </p>
  </div>
</template>

<style scoped>
.list-page { max-width: 800px; margin: 0 auto; }

.list { display: flex; flex-direction: column; gap: 0.4rem; }
.row { display: flex; align-items: center; gap: 0.4rem; }

.row-link {
  flex: 1; display: flex; align-items: center; gap: 0.8rem;
  padding: 0.55rem 0.9rem; text-decoration: none;
  background: rgba(0, 0, 0, 0.22);
  border: 1px solid var(--parchment-dark); border-radius: 6px;
  transition: all 0.15s;
}
.row-link:hover { background: rgba(232, 220, 196, 0.12); border-color: var(--parchment); }

.row-icons { display: flex; gap: 0.2rem; }
.row-icons img {
  width: 26px; height: 26px;
  filter: invert(85%) sepia(15%) saturate(360%) hue-rotate(2deg) brightness(95%);
}
.row-name { font-family: 'MedievalSharp', serif; color: var(--parchment); flex: 1; }
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
  text-align: center; padding: 3rem 1rem;
  font-family: 'Crimson Text', serif; font-style: italic; color: var(--parchment-dark);
}
.empty a { color: var(--parchment); }

@media (max-width: 620px) {
  .row-alive, .row-date { display: none; }
}
</style>
