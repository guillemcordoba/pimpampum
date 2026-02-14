<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import { useRouter } from 'vue-router';
import { PLAYER_TEMPLATES, ENEMY_TEMPLATES, ALL_EQUIPMENT, createCharacter } from '@pimpampum/engine';
import { cardToDisplayProps, equipmentToDisplayProps } from '../composables/useCardDisplay';
import CardGrid from '../components/cards/CardGrid.vue';
import PrintableCard from '../components/cards/PrintableCard.vue';
import CharacterCard from '../components/cards/CharacterCard.vue';
import RulesCard from '../components/cards/RulesCard.vue';
import '../assets/cards.css';

const props = defineProps<{
  section?: string;
  characterId?: string;
}>();

const router = useRouter();

const activeSection = ref(props.section ?? 'classes');
const activeClassId = ref(props.characterId ?? PLAYER_TEMPLATES[0].id);
const activeEnemyId = ref(props.characterId ?? ENEMY_TEMPLATES[0].id);

watch(() => props.section, (s) => {
  if (s) activeSection.value = s;
});

watch(() => props.characterId, (id) => {
  if (!id) return;
  if (activeSection.value === 'classes') activeClassId.value = id;
  else if (activeSection.value === 'enemies') activeEnemyId.value = id;
});

// --- Classes ---
const classTemplate = computed(() =>
  PLAYER_TEMPLATES.find(t => t.id === activeClassId.value) ?? PLAYER_TEMPLATES[0],
);
const classCharacter = computed(() =>
  createCharacter(classTemplate.value, classTemplate.value.displayName),
);
const classCardProps = computed(() =>
  classCharacter.value.cards.map(card =>
    cardToDisplayProps(card, classTemplate.value.classCss, classTemplate.value.displayName),
  ),
);

// --- Enemies ---
const enemyTemplate = computed(() =>
  ENEMY_TEMPLATES.find(t => t.id === activeEnemyId.value) ?? ENEMY_TEMPLATES[0],
);
const enemyCharacter = computed(() =>
  createCharacter(enemyTemplate.value, enemyTemplate.value.displayName),
);
const enemyCardProps = computed(() =>
  enemyCharacter.value.cards.map(card =>
    cardToDisplayProps(card, enemyTemplate.value.classCss, enemyTemplate.value.displayName),
  ),
);

// --- Objects ---
const equipDisplayProps = ALL_EQUIPMENT.map(e => equipmentToDisplayProps(e));

function selectSection(section: string) {
  activeSection.value = section;
  router.replace(`/cards/${section}`);
}

function selectClass(id: string) {
  activeClassId.value = id;
  router.replace(`/cards/classes/${id}`);
}

function selectEnemy(id: string) {
  activeEnemyId.value = id;
  router.replace(`/cards/enemies/${id}`);
}

function handlePrint() {
  window.print();
}
</script>

<template>
  <div class="cards-page">
    <!-- Section tabs -->
    <div class="section-tabs no-print">
      <button
        class="section-tab"
        :class="{ active: activeSection === 'classes' }"
        @click="selectSection('classes')"
      >Classes</button>
      <button
        class="section-tab"
        :class="{ active: activeSection === 'objects' }"
        @click="selectSection('objects')"
      >Objectes</button>
      <button
        class="section-tab"
        :class="{ active: activeSection === 'enemies' }"
        @click="selectSection('enemies')"
      >Enemics</button>
      <button
        class="section-tab"
        :class="{ active: activeSection === 'rules' }"
        @click="selectSection('rules')"
      >Regles</button>
    </div>

    <!-- Classes subsection -->
    <template v-if="activeSection === 'classes'">
      <div class="sub-tabs no-print">
        <button
          v-for="t in PLAYER_TEMPLATES"
          :key="t.id"
          class="sub-tab"
          :class="[t.classCss, { active: t.id === activeClassId }]"
          @click="selectClass(t.id)"
        >
          <img :src="'/' + t.iconPath" :alt="t.displayName">
          <span>{{ t.displayName }}</span>
        </button>
      </div>

      <div class="print-btn-row no-print">
        <button class="btn" @click="handlePrint">Imprimir cartes</button>
      </div>

      <CardGrid>
        <CharacterCard :template="classTemplate" />
        <PrintableCard
          v-for="(p, i) in classCardProps"
          :key="i"
          v-bind="p"
        />
      </CardGrid>
    </template>

    <!-- Objects subsection -->
    <template v-if="activeSection === 'objects'">
      <div class="print-btn-row no-print">
        <button class="btn" @click="handlePrint">Imprimir cartes</button>
      </div>

      <CardGrid>
        <PrintableCard
          v-for="(p, i) in equipDisplayProps"
          :key="i"
          v-bind="p"
        />
      </CardGrid>
    </template>

    <!-- Enemies subsection -->
    <template v-if="activeSection === 'enemies'">
      <div class="sub-tabs no-print">
        <button
          v-for="t in ENEMY_TEMPLATES"
          :key="t.id"
          class="sub-tab"
          :class="[t.classCss, { active: t.id === activeEnemyId }]"
          @click="selectEnemy(t.id)"
        >
          <img :src="'/' + t.iconPath" :alt="t.displayName">
          <span>{{ t.displayName }}</span>
        </button>
      </div>

      <div class="print-btn-row no-print">
        <button class="btn" @click="handlePrint">Imprimir cartes</button>
      </div>

      <CardGrid>
        <CharacterCard :template="enemyTemplate" />
        <PrintableCard
          v-for="(p, i) in enemyCardProps"
          :key="i"
          v-bind="p"
        />
      </CardGrid>
    </template>

    <!-- Rules subsection -->
    <template v-if="activeSection === 'rules'">
      <div class="print-btn-row no-print">
        <button class="btn" @click="handlePrint">Imprimir cartes</button>
      </div>

      <CardGrid>
        <RulesCard />
        <RulesCard />
        <RulesCard />
      </CardGrid>
    </template>
  </div>
</template>

<style scoped>
.cards-page {
  padding: 1rem;
}

/* -- Section tabs (top level) -- */
.section-tabs {
  display: flex;
  gap: 0;
  justify-content: center;
  margin-bottom: 1.5rem;
}

.section-tab {
  padding: 0.5rem 1.5rem;
  border: 2px solid rgba(232, 220, 196, 0.2);
  background: rgba(232, 220, 196, 0.06);
  color: var(--parchment-dark);
  font-family: 'MedievalSharp', serif;
  font-size: 1.05rem;
  cursor: pointer;
  transition: all 0.2s;
}

.section-tab:first-child {
  border-radius: 6px 0 0 6px;
}

.section-tab:last-child {
  border-radius: 0 6px 6px 0;
}

.section-tab:not(:first-child) {
  border-left: none;
}

.section-tab:hover {
  background: rgba(232, 220, 196, 0.12);
  color: var(--parchment);
}

.section-tab.active {
  background: rgba(232, 220, 196, 0.15);
  color: var(--parchment);
  border-color: var(--parchment-dark);
}

/* -- Sub tabs (character/enemy selector) -- */
.sub-tabs {
  display: flex;
  gap: 0.5rem;
  justify-content: center;
  flex-wrap: wrap;
  margin-bottom: 1.5rem;
}

.sub-tab {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  padding: 0.5rem 1rem;
  border: 2px solid rgba(232, 220, 196, 0.2);
  border-radius: 6px;
  background: rgba(232, 220, 196, 0.06);
  color: var(--parchment-dark);
  font-family: 'MedievalSharp', serif;
  font-size: 1rem;
  cursor: pointer;
  transition: all 0.2s;
}

.sub-tab img {
  width: 24px;
  height: 24px;
  filter: invert(0.7);
}

.sub-tab:hover {
  background: rgba(232, 220, 196, 0.12);
  color: var(--parchment);
}

.sub-tab.active {
  border-color: currentColor;
  color: var(--parchment);
  background: rgba(232, 220, 196, 0.15);
}

.sub-tab.guerrer.active { border-color: var(--class-guerrer); }
.sub-tab.murri.active { border-color: var(--class-murri); }
.sub-tab.mag.active { border-color: var(--class-mag); }
.sub-tab.barbar.active { border-color: var(--class-barbar); }
.sub-tab.clergue.active { border-color: var(--class-clergue); }
.sub-tab.goblin.active { border-color: var(--class-goblin); }
.sub-tab.goblin-shaman.active { border-color: var(--class-goblin-shaman); }

.print-btn-row {
  text-align: center;
  margin-bottom: 1.5rem;
}

@media print {
  .no-print {
    display: none !important;
  }
  .cards-page {
    padding: 0;
  }
}
</style>
