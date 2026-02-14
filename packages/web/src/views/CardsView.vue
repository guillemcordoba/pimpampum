<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import { useRouter } from 'vue-router';
import { PLAYER_TEMPLATES, ENEMY_TEMPLATES, ALL_EQUIPMENT, createCharacter, STAT_ICONS, STAT_DISPLAY_NAMES } from '@pimpampum/engine';
import type { CharacterTemplate } from '@pimpampum/engine';
import { cardToDisplayProps, equipmentToDisplayProps } from '../composables/useCardDisplay';
import CardGrid from '../components/cards/CardGrid.vue';
import PrintableCard from '../components/cards/PrintableCard.vue';
import RulesCard from '../components/cards/RulesCard.vue';
import CharacterSheet from '../components/cards/CharacterSheet.vue';
import '../assets/cards.css';

function getCharacterStats(t: CharacterTemplate) {
  return [
    { key: 'lives' as const, value: t.baseLives, icon: STAT_ICONS.lives, label: STAT_DISPLAY_NAMES.lives },
    { key: 'strength' as const, value: t.baseStrength, icon: STAT_ICONS.strength, label: STAT_DISPLAY_NAMES.strength },
    { key: 'magic' as const, value: t.baseMagic, icon: STAT_ICONS.magic, label: STAT_DISPLAY_NAMES.magic },
    { key: 'defense' as const, value: t.baseDefense, icon: STAT_ICONS.defense, label: STAT_DISPLAY_NAMES.defense },
    { key: 'speed' as const, value: t.baseSpeed, icon: STAT_ICONS.speed, label: STAT_DISPLAY_NAMES.speed },
  ];
}

const props = defineProps<{
  section?: string;
  characterId?: string;
}>();

const router = useRouter();

const activeSection = ref(props.section ?? 'classes');
const activeClassId = ref(props.characterId ?? PLAYER_TEMPLATES[0].id);
const activeEnemyId = ref(props.characterId ?? ENEMY_TEMPLATES[0].id);
const printAll = ref(false);

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

// --- All classes (for print all) ---
const allClassData = computed(() =>
  PLAYER_TEMPLATES.map(t => {
    const ch = createCharacter(t, t.displayName);
    return {
      template: t,
      stats: getCharacterStats(t),
      cards: ch.cards.map(card => cardToDisplayProps(card, t.classCss, t.displayName)),
    };
  }),
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

// --- All enemies (for print all) ---
const allEnemyData = computed(() =>
  ENEMY_TEMPLATES.map(t => {
    const ch = createCharacter(t, t.displayName);
    return {
      template: t,
      stats: getCharacterStats(t),
      cards: ch.cards.map(card => cardToDisplayProps(card, t.classCss, t.displayName)),
    };
  }),
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
  printAll.value = false;
  window.print();
}

function handlePrintAll() {
  printAll.value = true;
  requestAnimationFrame(() => window.print());
}
</script>

<template>
  <div class="cards-page">
    <!-- Top bar: section tabs + print buttons -->
    <div class="top-bar no-print">
      <div class="section-tabs">
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
        <button
          class="section-tab"
          :class="{ active: activeSection === 'sheet' }"
          @click="selectSection('sheet')"
        >Fitxa</button>
      </div>
      <div class="print-btn-col">
        <button class="btn btn-sm" @click="handlePrintAll">Imprimir totes les cartes</button>
        <button class="btn btn-sm btn-secondary" @click="handlePrint">Imprimir aquestes cartes</button>
      </div>
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

      <div :class="{ 'no-print': printAll }">
        <div class="character-description" :class="classTemplate.classCss">
          <img class="char-desc-icon" :src="'/' + classTemplate.iconPath" :alt="classTemplate.displayName">
          <div class="char-desc-info">
            <h2 class="char-desc-name">{{ classTemplate.displayName }}</h2>
            <div class="char-desc-stats">
              <span v-for="stat in getCharacterStats(classTemplate)" :key="stat.key" class="char-desc-stat">
                <img :src="'/' + stat.icon" :alt="stat.label"> {{ stat.label }} {{ stat.value }}
              </span>
            </div>
          </div>
        </div>
        <CardGrid>
          <PrintableCard
            v-for="(p, i) in classCardProps"
            :key="i"
            v-bind="p"
          />
        </CardGrid>
      </div>
    </template>

    <!-- Objects subsection -->
    <template v-if="activeSection === 'objects'">
      <div :class="{ 'no-print': printAll }">
        <CardGrid>
          <PrintableCard
            v-for="(p, i) in equipDisplayProps"
            :key="i"
            v-bind="p"
          />
        </CardGrid>
      </div>
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

      <div :class="{ 'no-print': printAll }">
        <div class="character-description" :class="enemyTemplate.classCss">
          <img class="char-desc-icon" :src="'/' + enemyTemplate.iconPath" :alt="enemyTemplate.displayName">
          <div class="char-desc-info">
            <h2 class="char-desc-name">{{ enemyTemplate.displayName }}</h2>
            <div class="char-desc-stats">
              <span v-for="stat in getCharacterStats(enemyTemplate)" :key="stat.key" class="char-desc-stat">
                <img :src="'/' + stat.icon" :alt="stat.label"> {{ stat.label }} {{ stat.value }}
              </span>
            </div>
          </div>
        </div>
        <CardGrid>
          <PrintableCard
            v-for="(p, i) in enemyCardProps"
            :key="i"
            v-bind="p"
          />
        </CardGrid>
      </div>
    </template>

    <!-- Rules subsection -->
    <template v-if="activeSection === 'rules'">
      <div :class="{ 'no-print': printAll }">
        <CardGrid>
          <RulesCard />
          <RulesCard />
          <RulesCard />
        </CardGrid>
      </div>
    </template>

    <!-- Character sheet subsection -->
    <template v-if="activeSection === 'sheet'">
      <div :class="{ 'no-print': printAll }">
        <CharacterSheet />
      </div>
    </template>

    <!-- Print-all: all cards rendered, hidden on screen -->
    <div v-if="printAll" class="print-all-section">
      <!-- All player classes -->
      <template v-for="(data, ci) in allClassData" :key="'class-' + ci">
        <div class="character-description" :class="data.template.classCss">
          <img class="char-desc-icon" :src="'/' + data.template.iconPath" :alt="data.template.displayName">
          <div class="char-desc-info">
            <h2 class="char-desc-name">{{ data.template.displayName }}</h2>
            <div class="char-desc-stats">
              <span v-for="stat in data.stats" :key="stat.key" class="char-desc-stat">
                <img :src="'/' + stat.icon" :alt="stat.label"> {{ stat.label }} {{ stat.value }}
              </span>
            </div>
          </div>
        </div>
        <CardGrid>
          <PrintableCard
            v-for="(p, i) in data.cards"
            :key="i"
            v-bind="p"
          />
        </CardGrid>
      </template>

      <!-- Equipment -->
      <CardGrid>
        <PrintableCard
          v-for="(p, i) in equipDisplayProps"
          :key="'equip-' + i"
          v-bind="p"
        />
      </CardGrid>

      <!-- All enemies -->
      <template v-for="(data, ci) in allEnemyData" :key="'enemy-' + ci">
        <div class="character-description" :class="data.template.classCss">
          <img class="char-desc-icon" :src="'/' + data.template.iconPath" :alt="data.template.displayName">
          <div class="char-desc-info">
            <h2 class="char-desc-name">{{ data.template.displayName }}</h2>
            <div class="char-desc-stats">
              <span v-for="stat in data.stats" :key="stat.key" class="char-desc-stat">
                <img :src="'/' + stat.icon" :alt="stat.label"> {{ stat.label }} {{ stat.value }}
              </span>
            </div>
          </div>
        </div>
        <CardGrid>
          <PrintableCard
            v-for="(p, i) in data.cards"
            :key="i"
            v-bind="p"
          />
        </CardGrid>
      </template>

      <!-- Rules -->
      <CardGrid>
        <RulesCard />
        <RulesCard />
        <RulesCard />
      </CardGrid>

      <!-- Character sheets -->
      <CharacterSheet />
    </div>
  </div>
</template>

<style scoped>
.cards-page {
  padding: 1rem;
}

/* -- Top bar: tabs + print buttons -- */
.top-bar {
  display: flex;
  align-items: flex-start;
  margin-bottom: 1.5rem;
  position: relative;
}

.top-bar .section-tabs {
  margin: 0 auto;
}

.section-tabs {
  display: flex;
  gap: 0;
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
.sub-tab.basilisc.active { border-color: var(--class-basilisc); }

.print-btn-col {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  flex-shrink: 0;
  position: absolute;
  right: 0;
  top: 0;
}

.btn-sm {
  font-size: 0.85rem;
  padding: 0.3rem 0.75rem;
}

.btn-secondary {
  opacity: 0.7;
}

.btn-secondary:hover {
  opacity: 1;
}

.print-all-section {
  display: none;
}

/* -- Character description header -- */
.character-description {
  display: flex;
  align-items: center;
  gap: 1rem;
  max-width: 210mm;
  margin: 0 auto 1rem;
  padding: 0.75rem 1.25rem;
  border-left: 4px solid var(--parchment-dark);
  background: rgba(232, 220, 196, 0.06);
  border-radius: 0 6px 6px 0;
}

.character-description.guerrer { border-left-color: var(--class-guerrer); }
.character-description.murri { border-left-color: var(--class-murri); }
.character-description.mag { border-left-color: var(--class-mag); }
.character-description.barbar { border-left-color: var(--class-barbar); }
.character-description.clergue { border-left-color: var(--class-clergue); }
.character-description.goblin { border-left-color: var(--class-goblin); }
.character-description.goblin-shaman { border-left-color: var(--class-goblin-shaman); }

.char-desc-icon {
  width: 48px;
  height: 48px;
  filter: invert(0.8);
  flex-shrink: 0;
}

.char-desc-info {
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
}

.char-desc-name {
  font-family: 'Cinzel Decorative', serif;
  font-size: 1.2rem;
  font-weight: 700;
  color: var(--parchment);
  text-transform: uppercase;
  letter-spacing: 1.5px;
  margin: 0;
}

.char-desc-stats {
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem;
  align-items: center;
}

.char-desc-stat {
  display: flex;
  align-items: center;
  gap: 0.25rem;
  font-family: 'Crimson Text', serif;
  font-size: 0.95rem;
  color: var(--parchment-dark);
}

.char-desc-stat img {
  width: 18px;
  height: 18px;
  filter: invert(0.6);
}

@media print {
  .no-print {
    display: none !important;
  }
  .cards-page {
    padding: 0;
  }
  .print-all-section {
    display: block;
  }
  .character-description {
    margin-bottom: 2mm;
    padding: 1mm 3mm;
    background: none;
  }
  .char-desc-icon {
    width: 8mm;
    height: 8mm;
    filter: none;
  }
  .char-desc-name {
    font-size: 10pt;
    color: #333;
  }
  .char-desc-stat {
    font-size: 8pt;
    color: #333;
  }
  .char-desc-stat img {
    width: 4mm;
    height: 4mm;
    filter: none;
  }
}
</style>
