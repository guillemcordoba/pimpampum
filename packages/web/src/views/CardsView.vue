<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { ALL_SKILLS } from '@pimpampum/skills';
import { actionToDisplayProps } from '../composables/useActionDisplay';
import PrintableCard from '../components/cards/PrintableCard.vue';
import CardGrid from '../components/cards/CardGrid.vue';

const base = import.meta.env.BASE_URL;

// Enemy skills live in the Enemics section, equipment in Objectes.
const playerSkills = computed(() => ALL_SKILLS);

// --- Skill sidebar ---
const search = ref('');
const filteredSkills = computed(() => {
  const q = search.value.trim().toLowerCase();
  if (!q) return playerSkills.value;
  return playerSkills.value.filter(
    s => s.displayName.toLowerCase().includes(q) || s.description.toLowerCase().includes(q),
  );
});

const selectedId = ref<string>(playerSkills.value[0]?.id ?? '');
const selectedSkill = computed(() => playerSkills.value.find(s => s.id === selectedId.value) ?? null);

// Keep the selection valid as the filter narrows the list.
watch(filteredSkills, list => {
  if (!list.some(s => s.id === selectedId.value)) selectedId.value = list[0]?.id ?? '';
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
          placeholder="Cerca habilitats…"
          aria-label="Cerca habilitats"
        />
        <ul class="skill-list">
          <li v-for="skill in filteredSkills" :key="skill.id">
            <button
              type="button"
              class="skill-item"
              :class="[skill.classCss, { active: skill.id === selectedId }]"
              @click="selectedId = skill.id"
            >
              <img class="skill-item-icon" :src="base + skill.iconPath" :alt="''" />
              <span class="skill-item-name">{{ skill.displayName }}</span>
            </button>
          </li>
          <li v-if="filteredSkills.length === 0" class="skill-empty">Cap habilitat trobada</li>
        </ul>
      </aside>

      <section class="skill-content" v-if="selectedSkill">
        <h2 class="skill-heading no-print">
          {{ selectedSkill.displayName }} — {{ selectedSkill.description }}
        </h2>
        <CardGrid>
          <div v-for="action in selectedSkill.actions" :key="action.id" class="card-slot">
            <PrintableCard
              v-bind="actionToDisplayProps(action, selectedSkill.classCss, selectedSkill.displayName)"
            />
            <div class="card-level no-print">Nivell {{ action.unlockLevel }}</div>
          </div>
        </CardGrid>
      </section>
    </div>
  </div>
</template>

<style scoped>
.cards-page { padding: 1rem; }

.skills-layout { display: flex; gap: 1.5rem; align-items: flex-start; }

.skill-sidebar {
  flex: 0 0 16rem;
  position: sticky;
  top: 4.5rem;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  max-height: calc(100vh - 6rem);
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

/* Each printable card on this page is annotated with the level at which the
   action is learned. The label is screen-only; in print the wrapper collapses
   (display: contents) so the card grid prints exactly as elsewhere. */
.card-slot {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.5rem;
}
.card-level {
  font-family: 'Cinzel Decorative', serif;
  font-size: 0.8rem;
  letter-spacing: 0.5px;
  color: var(--parchment);
  background: rgba(0, 0, 0, 0.25);
  border: 1px solid var(--parchment-dark);
  border-radius: 999px;
  padding: 0.2rem 0.7rem;
}

.skill-content { flex: 1; min-width: 0; }
.skill-heading {
  font-family: 'Cinzel Decorative', serif; color: var(--parchment);
  text-align: center; font-size: 1.1rem; margin: 0 0 1rem;
}

/* Theme accent per class, mirroring the card border colors. */
.skill-item.guerrer { --class-color: var(--class-guerrer); }
.skill-item.murri { --class-color: var(--class-murri); }
.skill-item.mag { --class-color: var(--class-mag); }
.skill-item.barbar { --class-color: var(--class-barbar); }
.skill-item.clergue { --class-color: var(--class-clergue); }
.skill-item.monjo { --class-color: var(--class-monjo); }
.skill-item.trobador { --class-color: var(--class-trobador); }
.skill-item.fetiller { --class-color: var(--class-fetiller); }
.skill-item.bruixot { --class-color: var(--class-bruixot); }
.skill-item.paladi { --class-color: var(--class-paladi); }
.skill-item.druida { --class-color: var(--class-druida); }
.skill-item.objecte { --class-color: var(--class-objecte); }

@media (max-width: 720px) {
  .skills-layout { flex-direction: column; }
  .skill-sidebar { position: static; flex-basis: auto; width: 100%; max-height: none; }
}

@media print {
  .no-print { display: none !important; }
  .skill-sidebar { display: none !important; }
  /* Collapse the wrapper so .print-card flows directly into the print grid. */
  .card-slot { display: contents; }
}
</style>
