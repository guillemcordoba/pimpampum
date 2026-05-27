<script setup lang="ts">
import { ref, computed } from 'vue';
import { ENEMY_TEMPLATES, unlockedEnemyActions } from '@pimpampum/enemies';
import { actionToDisplayProps } from '../composables/useActionDisplay';
import PrintableCard from '../components/cards/PrintableCard.vue';
import CardGrid from '../components/cards/CardGrid.vue';

const base = import.meta.env.BASE_URL;
const level = ref(30);

const enemies = computed(() => ENEMY_TEMPLATES.map(t => ({
  template: t,
  actions: t.skills.flatMap(skillId =>
    unlockedEnemyActions(skillId, level.value).map(def => ({ def, classCss: t.classCss }))),
})));
</script>

<template>
  <div class="enemies-page">
    <h1 class="screen-title">Enemics</h1>
    <p class="screen-subtitle">Tria un nivell per veure les accions de cada tipus d'enemic.</p>

    <div class="level-control no-print">
      <label>Nivell de l'enemic</label>
      <input v-model.number="level" type="range" min="1" max="100">
      <span class="level-value">{{ level }}</span>
    </div>

    <div v-for="e in enemies" :key="e.template.id" class="enemy-block">
      <div class="enemy-head" :class="e.template.classCss">
        <img :src="base + e.template.iconPath" :alt="e.template.displayName">
        <div>
          <div class="enemy-name">{{ e.template.displayName }}</div>
          <div class="enemy-meta">PV {{ e.template.basePV }}</div>
        </div>
      </div>
      <CardGrid v-if="e.actions.length">
        <PrintableCard
          v-for="a in e.actions"
          :key="a.def.id"
          v-bind="actionToDisplayProps(a.def, a.classCss)"
        />
      </CardGrid>
      <p v-else class="no-actions">Cap acció desbloquejada a aquest nivell.</p>
    </div>
  </div>
</template>

<style scoped>
.enemies-page { padding: 1rem; max-width: 1000px; margin: 0 auto; }
.level-control {
  display: flex; align-items: center; gap: 0.75rem; justify-content: center;
  color: var(--parchment); margin: 1rem 0 2rem;
}
.level-control input[type="range"] { width: 280px; }
.level-value { font-family: 'MedievalSharp', serif; font-size: 1.2rem; min-width: 2ch; }
.enemy-block { margin-bottom: 2.5rem; }
.enemy-head {
  display: flex; align-items: center; gap: 0.75rem; justify-content: center;
  border-left: 4px solid var(--parchment-dark); padding-left: 0.6rem; margin-bottom: 0.75rem;
}
.enemy-head img { width: 44px; height: 44px; }
.enemy-name { font-family: 'Cinzel Decorative', serif; color: var(--parchment); font-size: 1.2rem; }
.enemy-meta { font-family: 'Crimson Text', serif; color: var(--parchment-dark); font-size: 0.9rem; }
.no-actions { text-align: center; color: var(--parchment-dark); font-style: italic; }
@media print { .no-print { display: none !important; } }
</style>
