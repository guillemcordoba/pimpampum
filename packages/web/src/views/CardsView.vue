<script setup lang="ts">
import { ref, reactive, computed, watch } from 'vue';
import { useRouter } from 'vue-router';
import { PLAYER_TEMPLATES, ENEMY_TEMPLATES, ALL_EQUIPMENT, createCharacter, STAT_ICONS, STAT_DISPLAY_NAMES, getTraitsForClass } from '@pimpampum/engine';
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
const base = import.meta.env.BASE_URL;

const activeSection = ref(props.section ?? 'classes');
const activeClassId = ref(props.characterId ?? PLAYER_TEMPLATES[0].id);
const activeEnemyId = ref(props.characterId ?? ENEMY_TEMPLATES[0].id);
const printAll = ref(false);
const showPrintDialog = ref(false);
// Per-character per-card print selection
const characterCardNames = computed(() => {
  const map: Record<string, string[]> = {};
  for (const t of [...PLAYER_TEMPLATES, ...ENEMY_TEMPLATES]) {
    const ch = createCharacter(t, t.displayName);
    map[t.id] = ch.cards.map(c => c.name);
  }
  return map;
});
const printCards = reactive<Record<string, Record<string, boolean>>>(
  Object.fromEntries(
    [...PLAYER_TEMPLATES, ...ENEMY_TEMPLATES].map(t => {
      const ch = createCharacter(t, t.displayName);
      return [t.id, Object.fromEntries(ch.cards.map(c => [c.name, true]))];
    }),
  ),
);
const expandedCharacters = ref(new Set<string>());
const printObjects = ref(true);
const printRules = ref(true);
const printRulesCount = ref(3);
const printSheet = ref(true);
const printSheetCount = ref(3);
const saveInk = ref(false);

function isCharFullyChecked(id: string): boolean {
  const cards = printCards[id];
  return cards ? Object.values(cards).every(Boolean) : false;
}
function isCharAnyChecked(id: string): boolean {
  const cards = printCards[id];
  return cards ? Object.values(cards).some(Boolean) : false;
}
function toggleCharacter(id: string, checked: boolean) {
  const cards = printCards[id];
  if (cards) for (const key of Object.keys(cards)) cards[key] = checked;
}
function toggleExpand(id: string) {
  const set = expandedCharacters.value;
  if (set.has(id)) set.delete(id); else set.add(id);
}
function toggleAllClasses(checked: boolean) {
  for (const t of PLAYER_TEMPLATES) toggleCharacter(t.id, checked);
}
function toggleAllEnemies(checked: boolean) {
  for (const t of ENEMY_TEMPLATES) toggleCharacter(t.id, checked);
}
const allClassesChecked = computed(() => PLAYER_TEMPLATES.every(t => isCharFullyChecked(t.id)));
const someClassesChecked = computed(() => PLAYER_TEMPLATES.some(t => isCharAnyChecked(t.id)));
const allEnemiesChecked = computed(() => ENEMY_TEMPLATES.every(t => isCharFullyChecked(t.id)));
const someEnemiesChecked = computed(() => ENEMY_TEMPLATES.some(t => isCharAnyChecked(t.id)));

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

async function handlePrint() {
  showPrintDialog.value = false;
  printAll.value = true;
  // Wait for Vue to render the print-all-section, then wait for all images to load
  await new Promise(resolve => requestAnimationFrame(resolve));
  const section = document.querySelector('.print-all-section');
  if (section) {
    const images = Array.from(section.querySelectorAll('img'));
    await Promise.all(
      images.map(img =>
        img.complete
          ? Promise.resolve()
          : new Promise(resolve => {
              img.onload = resolve;
              img.onerror = resolve;
            }),
      ),
    );
  }
  window.print();
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
        <button class="btn btn-sm" @click="showPrintDialog = true">Imprimir</button>
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
          <img :src="base + t.iconPath" :alt="t.displayName">
          <span>{{ t.displayName }}</span>
        </button>
      </div>

      <div :class="{ 'no-print': printAll }">
        <div class="character-description" :class="classTemplate.classCss">
          <img class="char-desc-icon" :src="base + classTemplate.iconPath" :alt="classTemplate.displayName">
          <div class="char-desc-info">
            <h2 class="char-desc-name">{{ classTemplate.displayName }}</h2>
            <div class="char-desc-stats">
              <span v-for="stat in getCharacterStats(classTemplate)" :key="stat.key" class="char-desc-stat">
                <img :src="base + stat.icon" :alt="stat.label"> {{ stat.label }} {{ stat.value }}
              </span>
            </div>
            <div v-if="getTraitsForClass(classTemplate.id).length" class="char-desc-traits">
              <span v-for="trait in getTraitsForClass(classTemplate.id)" :key="trait.id" class="trait-badge">
                <img :src="base + trait.iconPath" :alt="trait.displayName">
                {{ trait.displayName }}
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
          <img :src="base + t.iconPath" :alt="t.displayName">
          <span>{{ t.displayName }}</span>
        </button>
      </div>

      <div :class="{ 'no-print': printAll }">
        <div class="character-description" :class="enemyTemplate.classCss">
          <img class="char-desc-icon" :src="base + enemyTemplate.iconPath" :alt="enemyTemplate.displayName">
          <div class="char-desc-info">
            <h2 class="char-desc-name">{{ enemyTemplate.displayName }}</h2>
            <div class="char-desc-stats">
              <span v-for="stat in getCharacterStats(enemyTemplate)" :key="stat.key" class="char-desc-stat">
                <img :src="base + stat.icon" :alt="stat.label"> {{ stat.label }} {{ stat.value }}
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

    <!-- Print dialog -->
    <Teleport to="body">
      <div v-if="showPrintDialog" class="print-dialog-overlay no-print" @click.self="showPrintDialog = false">
        <div class="print-dialog">
          <h2 class="print-dialog-title">Imprimir</h2>
          <p class="print-dialog-subtitle">Selecciona les seccions a imprimir:</p>
          <div class="print-dialog-columns">
            <div class="print-dialog-col">
              <label class="print-dialog-group">
                <input
                  type="checkbox"
                  :checked="allClassesChecked"
                  :indeterminate="someClassesChecked && !allClassesChecked"
                  @change="toggleAllClasses(($event.target as HTMLInputElement).checked)"
                >
                <span>Classes</span>
              </label>
              <div class="print-dialog-indent">
                <div v-for="t in PLAYER_TEMPLATES" :key="t.id" class="print-dialog-char">
                  <label class="print-dialog-check">
                    <button class="print-dialog-expand" @click.prevent="toggleExpand(t.id)">
                      {{ expandedCharacters.has(t.id) ? '▾' : '▸' }}
                    </button>
                    <input
                      type="checkbox"
                      :checked="isCharFullyChecked(t.id)"
                      :indeterminate="isCharAnyChecked(t.id) && !isCharFullyChecked(t.id)"
                      @change="toggleCharacter(t.id, ($event.target as HTMLInputElement).checked)"
                    >
                    <img :src="base + t.iconPath" :alt="t.displayName" class="print-dialog-icon">
                    <span>{{ t.displayName }}</span>
                  </label>
                  <div v-if="expandedCharacters.has(t.id)" class="print-dialog-cards">
                    <label v-for="cardName in characterCardNames[t.id]" :key="cardName" class="print-dialog-check print-dialog-card-check">
                      <input type="checkbox" v-model="printCards[t.id][cardName]">
                      <span>{{ cardName }}</span>
                    </label>
                  </div>
                </div>
              </div>
            </div>

            <div class="print-dialog-col">
              <label class="print-dialog-group">
                <input
                  type="checkbox"
                  :checked="allEnemiesChecked"
                  :indeterminate="someEnemiesChecked && !allEnemiesChecked"
                  @change="toggleAllEnemies(($event.target as HTMLInputElement).checked)"
                >
                <span>Enemics</span>
              </label>
              <div class="print-dialog-indent">
                <div v-for="t in ENEMY_TEMPLATES" :key="t.id" class="print-dialog-char">
                  <label class="print-dialog-check">
                    <button class="print-dialog-expand" @click.prevent="toggleExpand(t.id)">
                      {{ expandedCharacters.has(t.id) ? '▾' : '▸' }}
                    </button>
                    <input
                      type="checkbox"
                      :checked="isCharFullyChecked(t.id)"
                      :indeterminate="isCharAnyChecked(t.id) && !isCharFullyChecked(t.id)"
                      @change="toggleCharacter(t.id, ($event.target as HTMLInputElement).checked)"
                    >
                    <img :src="base + t.iconPath" :alt="t.displayName" class="print-dialog-icon">
                    <span>{{ t.displayName }}</span>
                  </label>
                  <div v-if="expandedCharacters.has(t.id)" class="print-dialog-cards">
                    <label v-for="cardName in characterCardNames[t.id]" :key="cardName" class="print-dialog-check print-dialog-card-check">
                      <input type="checkbox" v-model="printCards[t.id][cardName]">
                      <span>{{ cardName }}</span>
                    </label>
                  </div>
                </div>
              </div>
            </div>

            <div class="print-dialog-col">
              <span class="print-dialog-group-label">Altres</span>
              <div class="print-dialog-indent">
                <label class="print-dialog-check">
                  <input type="checkbox" v-model="printObjects">
                  <span>Objectes</span>
                </label>
                <label class="print-dialog-check">
                  <input type="checkbox" v-model="printRules">
                  <span>Regles</span>
                  <input
                    v-if="printRules"
                    type="number"
                    v-model.number="printRulesCount"
                    min="1"
                    max="20"
                    class="print-dialog-count"
                  >
                </label>
                <label class="print-dialog-check">
                  <input type="checkbox" v-model="printSheet">
                  <span>Fitxa</span>
                  <input
                    v-if="printSheet"
                    type="number"
                    v-model.number="printSheetCount"
                    min="1"
                    max="20"
                    class="print-dialog-count"
                  >
                </label>
              </div>
              <div class="print-dialog-separator"></div>
              <label class="print-dialog-check">
                <input type="checkbox" v-model="saveInk">
                <span>Estalviar tinta</span>
              </label>
            </div>
          </div>
          <div class="print-dialog-actions">
            <button class="btn" @click="handlePrint">Imprimir</button>
            <button class="btn btn-secondary" @click="showPrintDialog = false">Cancel·lar</button>
          </div>
        </div>
      </div>
    </Teleport>

    <!-- Print-all: single continuous 3x3 grid for easy cutting -->
    <div v-if="printAll" class="print-all-section" :class="{ 'save-ink': saveInk }">
      <CardGrid>
        <!-- Player class cards -->
        <template v-for="(data, ci) in allClassData" :key="'class-' + ci">
          <template v-for="(p, i) in data.cards" :key="'c' + ci + '-' + i">
            <PrintableCard
              v-if="printCards[data.template.id]?.[p.name]"
              v-bind="p"
            />
          </template>
        </template>

        <!-- Equipment -->
        <template v-if="printObjects">
          <PrintableCard
            v-for="(p, i) in equipDisplayProps"
            :key="'equip-' + i"
            v-bind="p"
          />
        </template>

        <!-- Enemy cards -->
        <template v-for="(data, ci) in allEnemyData" :key="'enemy-' + ci">
          <template v-for="(p, i) in data.cards" :key="'e' + ci + '-' + i">
            <PrintableCard
              v-if="printCards[data.template.id]?.[p.name]"
              v-bind="p"
            />
          </template>
        </template>

        <!-- Rules -->
        <template v-if="printRules">
          <RulesCard v-for="i in printRulesCount" :key="'rules-' + i" />
        </template>
      </CardGrid>

      <!-- Character sheets -->
      <template v-if="printSheet">
        <CharacterSheet v-for="i in printSheetCount" :key="'sheet-' + i" />
      </template>
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
.sub-tab.llop.active { border-color: var(--class-llop); }

.print-btn-col {
  flex-shrink: 0;
  position: absolute;
  right: 0;
  top: 0;
}

.btn-sm {
  font-size: 0.85rem;
  padding: 0.3rem 0.75rem;
}

/* -- Print dialog -- */
.print-dialog-overlay {
  position: fixed;
  inset: 0;
  z-index: 1000;
  background: rgba(0, 0, 0, 0.6);
  display: flex;
  align-items: center;
  justify-content: center;
}

.print-dialog {
  background: var(--bg-dark, #1a1410);
  border: 2px solid var(--parchment-dark, #b8a88a);
  border-radius: 8px;
  padding: 1.5rem 2rem;
  min-width: 280px;
  max-width: 90vw;
}

.print-dialog-title {
  font-family: 'Cinzel Decorative', serif;
  font-size: 1.3rem;
  font-weight: 700;
  color: var(--parchment, #e8dcc4);
  text-transform: uppercase;
  letter-spacing: 1.5px;
  margin: 0 0 0.25rem;
}

.print-dialog-subtitle {
  font-family: 'Crimson Text', serif;
  font-size: 1rem;
  color: var(--parchment-dark, #b8a88a);
  margin: 0 0 1rem;
}

.print-dialog-columns {
  display: flex;
  gap: 2rem;
  margin-bottom: 1.25rem;
}

.print-dialog-col {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.print-dialog-group {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  font-family: 'MedievalSharp', serif;
  font-size: 1.05rem;
  color: var(--parchment, #e8dcc4);
  cursor: pointer;
  font-weight: bold;
}

.print-dialog-group-label {
  font-family: 'MedievalSharp', serif;
  font-size: 1.05rem;
  color: var(--parchment, #e8dcc4);
  font-weight: bold;
  padding-left: 0.1rem;
}

.print-dialog-indent {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
  padding-left: 1.6rem;
}

.print-dialog-icon {
  width: 20px;
  height: 20px;
  filter: invert(0.7);
}

.print-dialog-check {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  font-family: 'MedievalSharp', serif;
  font-size: 1.05rem;
  color: var(--parchment, #e8dcc4);
  cursor: pointer;
}

.print-dialog-group input[type="checkbox"],
.print-dialog-check input[type="checkbox"] {
  appearance: none;
  width: 18px;
  height: 18px;
  border: 2px solid var(--parchment-dark, #b8a88a);
  border-radius: 3px;
  background: rgba(232, 220, 196, 0.06);
  cursor: pointer;
  flex-shrink: 0;
  position: relative;
}

.print-dialog-group input[type="checkbox"]:checked,
.print-dialog-check input[type="checkbox"]:checked {
  background: rgba(232, 220, 196, 0.15);
  border-color: var(--parchment, #e8dcc4);
}

.print-dialog-group input[type="checkbox"]:checked::after,
.print-dialog-check input[type="checkbox"]:checked::after {
  content: '\2713';
  position: absolute;
  top: -1px;
  left: 2px;
  font-size: 14px;
  color: var(--parchment, #e8dcc4);
}

.print-dialog-group input[type="checkbox"]:indeterminate,
.print-dialog-check input[type="checkbox"]:indeterminate {
  background: rgba(232, 220, 196, 0.15);
  border-color: var(--parchment, #e8dcc4);
}

.print-dialog-group input[type="checkbox"]:indeterminate::after,
.print-dialog-check input[type="checkbox"]:indeterminate::after {
  content: '\2012';
  position: absolute;
  top: -1px;
  left: 2px;
  font-size: 14px;
  color: var(--parchment, #e8dcc4);
}

.print-dialog-count {
  width: 3rem;
  margin-left: auto;
  padding: 0.15rem 0.3rem;
  border: 1.5px solid var(--parchment-dark, #b8a88a);
  border-radius: 3px;
  background: rgba(232, 220, 196, 0.06);
  color: var(--parchment, #e8dcc4);
  font-family: 'MedievalSharp', serif;
  font-size: 1rem;
  text-align: center;
  appearance: textfield;
  -moz-appearance: textfield;
}

.print-dialog-count::-webkit-inner-spin-button,
.print-dialog-count::-webkit-outer-spin-button {
  opacity: 1;
}

.print-dialog-char {
  display: flex;
  flex-direction: column;
}

.print-dialog-expand {
  background: none;
  border: none;
  color: var(--parchment-dark, #b8a88a);
  cursor: pointer;
  font-size: 0.9rem;
  padding: 0 0.1rem 0 0;
  line-height: 1;
}

.print-dialog-expand:hover {
  color: var(--parchment, #e8dcc4);
}

.print-dialog-cards {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  padding-left: 2.4rem;
  padding-top: 0.25rem;
  padding-bottom: 0.15rem;
}

.print-dialog-card-check {
  font-size: 0.9rem !important;
  color: var(--parchment-dark, #b8a88a) !important;
}

.print-dialog-card-check input[type="checkbox"] {
  width: 15px !important;
  height: 15px !important;
}

.print-dialog-card-check input[type="checkbox"]:checked::after {
  font-size: 11px !important;
}

.print-dialog-separator {
  border-top: 1px solid rgba(232, 220, 196, 0.15);
  margin: 0.4rem 0;
}

.print-dialog-actions {
  display: flex;
  gap: 0.75rem;
  justify-content: flex-end;
}

.print-dialog-actions .btn-secondary {
  opacity: 0.7;
}

.print-dialog-actions .btn-secondary:hover {
  opacity: 1;
}

.print-all-section {
  height: 0;
  overflow: hidden;
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
.character-description.llop { border-left-color: var(--class-llop); }

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
    height: auto;
    overflow: visible;
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
  .char-desc-stats {
    display: none;
  }
}

/* -- Trait badges -- */
.char-desc-traits {
  display: flex;
  flex-wrap: wrap;
  gap: 0.3rem;
  margin-top: 0.3rem;
}

.trait-badge {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  padding: 0.15rem 0.5rem;
  border: 1.5px solid rgba(232, 220, 196, 0.25);
  border-radius: 4px;
  background: rgba(232, 220, 196, 0.06);
  font-family: 'Crimson Text', Georgia, serif;
  font-size: 0.8rem;
  color: var(--parchment-dark);
  white-space: nowrap;
}

.trait-badge img {
  width: 14px;
  height: 14px;
  filter: invert(0.6);
}
</style>
