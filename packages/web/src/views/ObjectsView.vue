<script setup lang="ts">
import { computed, ref } from 'vue';
import { ALL_EQUIPMENT, ALL_POTIONS } from '@pimpampum/skills';
import { equipmentToDisplayProps, actionToDisplayProps } from '../composables/useActionDisplay';
import PrintableCard from '../components/cards/PrintableCard.vue';
import CardGrid from '../components/cards/CardGrid.vue';

const base = import.meta.env.BASE_URL;
const ICON = 'icons/000000/transparent/1x1/';

// --- Object categories (sidebar entries) ---
const categories = [
  {
    id: 'armadura',
    displayName: 'Armadura',
    iconPath: ICON + 'lorc/armor-vest.svg',
    cards: ALL_EQUIPMENT.filter(e => !e.dice).map(e => equipmentToDisplayProps(e)),
  },
  {
    id: 'armes',
    displayName: 'Armes',
    iconPath: ICON + 'lorc/crossed-swords.svg',
    cards: ALL_EQUIPMENT.filter(e => e.dice).map(e => equipmentToDisplayProps(e)),
  },
  {
    id: 'pocions',
    displayName: 'Pocions',
    iconPath: ICON + 'lorc/bubbling-flask.svg',
    cards: ALL_POTIONS.map(p => actionToDisplayProps(p, 'objecte', 'Poció')),
  },
];

const selectedId = ref<string>(categories[0]!.id);
const selected = computed(() => categories.find(c => c.id === selectedId.value) ?? null);
</script>

<template>
  <div class="cards-page">
    <div class="skills-layout">
      <aside class="skill-sidebar no-print">
        <ul class="skill-list">
          <li v-for="c in categories" :key="c.id">
            <button
              type="button"
              class="skill-item objecte"
              :class="{ active: c.id === selectedId }"
              @click="selectedId = c.id"
            >
              <img class="skill-item-icon" :src="base + c.iconPath" :alt="''" />
              <span class="skill-item-name">{{ c.displayName }}</span>
            </button>
          </li>
        </ul>
      </aside>

      <section class="skill-content" v-if="selected">
        <CardGrid>
          <PrintableCard v-for="(c, i) in selected.cards" :key="i" v-bind="c" />
        </CardGrid>
      </section>
    </div>
  </div>
</template>

<style scoped>
/* The page never scrolls: it bleeds over <main>'s padding to fill it edge to
   edge, the sidebar stays fixed in place, and only the card pane scrolls —
   its scrollbar spans the full tab height. Insets live INSIDE the panes. */
.cards-page { height: calc(100% + 3rem); margin: -1.5rem; }
.skills-layout { display: flex; gap: 1.5rem; align-items: stretch; height: 100%; }

.skill-sidebar {
  flex: 0 0 17rem;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  min-height: 0;
  padding: 1rem 0 1rem 1.5rem;
}

.skill-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  overflow-y: auto;
  flex: 1 1 auto;
  min-height: 0;
}

.skill-item {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  width: 100%;
  padding: 0.45rem 0.6rem;
  font-family: 'MedievalSharp', serif;
  font-size: 0.95rem;
  text-align: left;
  color: var(--parchment-dark);
  background: rgba(0, 0, 0, 0.15);
  border: 1px solid transparent;
  border-left: 3px solid var(--class-color, var(--parchment-dark));
  border-radius: 4px;
  cursor: pointer;
  transition: all 0.15s;
}
.skill-item:hover { color: var(--parchment); background: rgba(0, 0, 0, 0.3); }
.skill-item.active {
  color: var(--parchment);
  background: rgba(232, 220, 196, 0.12);
  border-color: var(--parchment-dark);
  border-left-color: var(--class-color, var(--parchment));
}

.skill-item-icon {
  width: 1.4rem;
  height: 1.4rem;
  flex-shrink: 0;
  filter: invert(85%) sepia(15%) saturate(360%) hue-rotate(2deg) brightness(95%);
}
.skill-item-name { flex: 1; }

.skill-content { flex: 1; min-width: 0; min-height: 0; overflow-y: auto; padding: 1rem 1.5rem 1rem 0; }

/* Theme accent, mirroring the card border colors. */
.skill-item.objecte { --class-color: var(--class-objecte); }

@media (max-width: 720px) {
  .cards-page { height: auto; margin: 0; }
  .skills-layout { flex-direction: column; height: auto; }
  .skill-sidebar { flex-basis: auto; width: 100%; padding: 0; }
  .skill-content { overflow-y: visible; padding: 0; }
}

@media print {
  .no-print { display: none !important; }
  .skill-sidebar { display: none !important; }
  .cards-page { height: auto; margin: 0; }
  .skills-layout { height: auto; }
  .skill-content { overflow-y: visible; padding: 0; }
}
</style>
