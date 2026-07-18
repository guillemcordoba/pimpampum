<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { ENEMY_TEMPLATES, getEnemySkill } from '@pimpampum/enemies';
import { actionToDisplayProps } from '../composables/useActionDisplay';
import PrintableCard from '../components/cards/PrintableCard.vue';
import CardGrid from '../components/cards/CardGrid.vue';

const base = import.meta.env.BASE_URL;

// --- Enemy sidebar ---
const search = ref('');
const filteredEnemies = computed(() => {
  const q = search.value.trim().toLowerCase();
  if (!q) return ENEMY_TEMPLATES;
  return ENEMY_TEMPLATES.filter(
    t => t.displayName.toLowerCase().includes(q)
      || t.skills.some(s => (getEnemySkill(s)?.displayName ?? '').toLowerCase().includes(q)),
  );
});

const selectedId = ref<string>(ENEMY_TEMPLATES[0]?.id ?? '');
const selected = computed(() => ENEMY_TEMPLATES.find(t => t.id === selectedId.value) ?? null);

// Keep the selection valid as the filter narrows the list.
watch(filteredEnemies, list => {
  if (!list.some(t => t.id === selectedId.value)) selectedId.value = list[0]?.id ?? '';
});

const actions = computed(() => {
  if (!selected.value) return [];
  return selected.value.skills.flatMap(skillId => getEnemySkill(skillId)?.actions ?? []);
});
</script>

<template>
  <div class="cards-page">
    <div class="skills-layout">
      <aside class="skill-sidebar no-print">
        <input
          v-model="search"
          type="search"
          class="skill-search"
          placeholder="Cerca enemics…"
          aria-label="Cerca enemics"
        />
        <ul class="skill-list">
          <li v-for="t in filteredEnemies" :key="t.id">
            <button
              type="button"
              class="skill-item"
              :class="[t.classCss, { active: t.id === selectedId }]"
              @click="selectedId = t.id"
            >
              <img class="skill-item-icon" :src="base + t.iconPath" :alt="''" />
              <span class="skill-item-name">{{ t.displayName }}</span>
            </button>
          </li>
          <li v-if="filteredEnemies.length === 0" class="skill-empty">Cap enemic trobat</li>
        </ul>
      </aside>

      <section class="skill-content" v-if="selected">
        <CardGrid>
          <PrintableCard
            v-for="a in actions"
            :key="a.id"
            v-bind="actionToDisplayProps(a, selected.classCss)"
          />
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

.skill-search {
  width: 100%;
  padding: 0.5rem 0.7rem;
  font-family: 'MedievalSharp', serif;
  font-size: 0.95rem;
  color: var(--parchment);
  background: rgba(0, 0, 0, 0.25);
  border: 1px solid var(--parchment-dark);
  border-radius: 4px;
}
.skill-search::placeholder { color: var(--parchment-dark); opacity: 0.7; }
.skill-search:focus { outline: none; border-color: var(--parchment); }

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

.skill-empty {
  padding: 0.5rem 0.6rem;
  font-family: 'MedievalSharp', serif;
  color: var(--parchment-dark);
  opacity: 0.7;
}

.skill-content { flex: 1; min-width: 0; min-height: 0; overflow-y: auto; padding: 1rem 1.5rem 1rem 0; }
.skill-heading {
  font-family: 'Cinzel Decorative', serif; color: var(--parchment);
  text-align: center; font-size: 1.1rem; margin: 0 0 1rem;
}

/* Theme accent per enemy class, mirroring the card border colors. */
.skill-item.goblin { --class-color: var(--class-goblin); }
.skill-item.goblin-shaman { --class-color: var(--class-goblin-shaman); }
.skill-item.basilisc { --class-color: var(--class-basilisc); }
.skill-item.diable-espinos { --class-color: var(--class-diable-espinos); }
.skill-item.diable-dos { --class-color: var(--class-diable-dos); }
.skill-item.diable-banyut { --class-color: var(--class-diable-banyut); }
.skill-item.golem-de-pedra { --class-color: var(--class-golem-de-pedra); }
.skill-item.llop { --class-color: var(--class-llop); }

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
