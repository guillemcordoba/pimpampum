<script setup lang="ts">
import { computed } from 'vue';
import { useRoute } from 'vue-router';

// The three ways to set up a fight, under one tab. Only the active section
// renders, so the whole grouping costs one thin strip of vertical space.
const TABS = [
  { name: 'encounters', label: 'Creador de combats' },
  { name: 'player-combats', label: 'Combats contra els jugadors' },
  { name: 'ai-combat', label: 'Combat contra la IA' },
];

const route = useRoute();

// A single combat being tracked is nested under this tab for its URL, but it
// is a focused screen: it carries its own bar and its own way back to the list.
const showTabs = computed(() => TABS.some(t => t.name === route.name));
</script>

<template>
  <div class="combats-page">
    <nav v-if="showTabs" class="subtabs no-print">
      <router-link
        v-for="t in TABS" :key="t.name"
        class="subtab" :class="{ active: route.name === t.name }"
        :to="{ name: t.name }"
      >{{ t.label }}</router-link>
    </nav>

    <div class="section">
      <router-view />
    </div>
  </div>
</template>

<style scoped>
/* Fills <main> exactly: the strip keeps its natural height and the section
   below absorbs the rest, so sections size to the screen instead of pushing
   the whole page into a scrollbar. */
.combats-page { height: 100%; display: flex; flex-direction: column; min-height: 0; }
.section { flex: 1; min-height: 0; }

.subtabs {
  display: flex; flex-wrap: wrap; gap: 0.3rem;
  padding-bottom: 0.6rem; margin-bottom: 0.9rem;
  border-bottom: 1px solid rgba(232, 220, 196, 0.15);
}
.subtab {
  font-family: 'MedievalSharp', serif; font-size: 0.95rem;
  color: var(--parchment-dark); text-decoration: none;
  padding: 0.25rem 0.8rem; border-radius: 4px;
  border: 1px solid transparent;
  transition: all 0.15s;
}
.subtab:hover { color: var(--parchment); background: rgba(232, 220, 196, 0.08); }
.subtab.active {
  color: var(--parchment);
  background: rgba(232, 220, 196, 0.14);
  border-color: var(--parchment-dark);
}

@media (max-width: 760px) { .combats-page { height: auto; } }

@media print { .no-print { display: none !important; } }
</style>
