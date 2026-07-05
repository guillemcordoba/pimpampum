<script setup lang="ts">
import { reactive, ref, computed } from 'vue';
import { ALL_SKILLS, ALL_EQUIPMENT } from '@pimpampum/skills';
import { ENEMY_TEMPLATES, getEnemySkill } from '@pimpampum/enemies';
import type { ActionDefinition } from '@pimpampum/engine';
import { actionToDisplayProps, equipmentToDisplayProps } from '../composables/useActionDisplay';
import { printDialogOpen, printingAll, closePrintDialog } from '../composables/usePrintDialog';
import PrintableCard from './cards/PrintableCard.vue';
import CardGrid from './cards/CardGrid.vue';
import RulesCard from './cards/RulesCard.vue';
import CharacterSheet from './cards/CharacterSheet.vue';

const base = import.meta.env.BASE_URL;

function enemyActions(templateId: string): ActionDefinition[] {
  const t = ENEMY_TEMPLATES.find(x => x.id === templateId);
  if (!t) return [];
  return t.skills.flatMap(sid => getEnemySkill(sid)?.actions ?? []);
}

// --- Selection state -------------------------------------------------------
const playerSel = reactive<Record<string, Record<string, boolean>>>(
  Object.fromEntries(
    ALL_SKILLS.map(s => [s.id, Object.fromEntries(s.actions.map(a => [a.id, true]))]),
  ),
);

const enemySel = reactive<Record<string, Record<string, boolean>>>(
  Object.fromEntries(
    ENEMY_TEMPLATES.map(t => [
      t.id,
      Object.fromEntries(enemyActions(t.id).map(a => [a.id, true])),
    ]),
  ),
);

const equipSel = reactive<Record<string, boolean>>(
  Object.fromEntries(ALL_EQUIPMENT.map(e => [e.id, true])),
);
const equipCount = reactive<Record<string, number>>(
  Object.fromEntries(ALL_EQUIPMENT.map(e => [e.id, 1])),
);

const rulesEnabled = ref(true);
const rulesCount = ref(3);
const sheetEnabled = ref(true);
const sheetCount = ref(3);
const saveInk = ref(false);

const expanded = reactive<Record<string, boolean>>({});
const expandedEquip = ref(false);

function toggleExpand(key: string) {
  expanded[key] = !expanded[key];
}

// --- Group helpers (all / any / toggle-all per group) ---------------------
function skillAll(skillId: string, sel: Record<string, Record<string, boolean>>) {
  const cards = sel[skillId];
  return cards ? Object.values(cards).every(Boolean) : false;
}
function skillAny(skillId: string, sel: Record<string, Record<string, boolean>>) {
  const cards = sel[skillId];
  return cards ? Object.values(cards).some(Boolean) : false;
}
function toggleSkill(skillId: string, sel: Record<string, Record<string, boolean>>, checked: boolean) {
  const cards = sel[skillId];
  if (cards) for (const k of Object.keys(cards)) cards[k] = checked;
}

const allPlayersChecked = computed(() => ALL_SKILLS.every(s => skillAll(s.id, playerSel)));
const somePlayersChecked = computed(() => ALL_SKILLS.some(s => skillAny(s.id, playerSel)));
function toggleAllPlayers(checked: boolean) {
  for (const s of ALL_SKILLS) toggleSkill(s.id, playerSel, checked);
}

const allEnemiesChecked = computed(() => ENEMY_TEMPLATES.every(t => skillAll(t.id, enemySel)));
const someEnemiesChecked = computed(() => ENEMY_TEMPLATES.some(t => skillAny(t.id, enemySel)));
function toggleAllEnemies(checked: boolean) {
  for (const t of ENEMY_TEMPLATES) toggleSkill(t.id, enemySel, checked);
}

const allEquipChecked = computed(() => ALL_EQUIPMENT.every(e => equipSel[e.id]));
const someEquipChecked = computed(() => ALL_EQUIPMENT.some(e => equipSel[e.id]));
function toggleAllEquip(checked: boolean) {
  for (const e of ALL_EQUIPMENT) equipSel[e.id] = checked;
}

// --- Cards to render in print-all section ---------------------------------
interface PrintItem {
  key: string;
  props: ReturnType<typeof actionToDisplayProps>;
}

const printCards = computed<PrintItem[]>(() => {
  const items: PrintItem[] = [];
  for (const skill of ALL_SKILLS) {
    for (const a of skill.actions) {
      if (playerSel[skill.id]?.[a.id]) {
        items.push({
          key: `p-${skill.id}-${a.id}`,
          props: actionToDisplayProps(a, skill.classCss, skill.displayName),
        });
      }
    }
  }
  for (const t of ENEMY_TEMPLATES) {
    for (const sid of t.skills) {
      const skill = getEnemySkill(sid);
      if (!skill) continue;
      for (const a of skill.actions) {
        if (enemySel[t.id]?.[a.id]) {
          items.push({
            key: `e-${t.id}-${a.id}`,
            props: actionToDisplayProps(a, t.classCss, skill.displayName),
          });
        }
      }
    }
  }
  for (const e of ALL_EQUIPMENT) {
    if (!equipSel[e.id]) continue;
    const count = Math.max(1, equipCount[e.id] ?? 1);
    const props = equipmentToDisplayProps(e);
    for (let i = 0; i < count; i++) {
      items.push({ key: `q-${e.id}-${i}`, props });
    }
  }
  return items;
});

// --- Print trigger --------------------------------------------------------
async function handlePrint() {
  closePrintDialog();
  printingAll.value = true;
  // Let Vue render the print-all section, then wait for images to load
  // so they appear in the print output.
  await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
  const section = document.querySelector('.print-all-section');
  if (section) {
    const images = Array.from(section.querySelectorAll('img'));
    await Promise.all(
      images.map(img =>
        img.complete
          ? Promise.resolve()
          : new Promise<void>(resolve => {
              img.onload = () => resolve();
              img.onerror = () => resolve();
            }),
      ),
    );
  }
  // Reset only once printing is really done: mobile browsers return from
  // window.print() immediately and snapshot the page afterwards, so a
  // setTimeout(0) reset would put the normal page back into the printout.
  // Desktop fires `afterprint`; on mobile the window regains focus when the
  // print sheet closes.
  const reset = () => {
    printingAll.value = false;
    window.removeEventListener('afterprint', reset);
    window.removeEventListener('focus', reset);
  };
  window.addEventListener('afterprint', reset);
  window.addEventListener('focus', reset);
  window.print();
}
</script>

<template>
  <Teleport to="body">
    <div
      v-if="printDialogOpen"
      class="print-dialog-overlay no-print"
      @click.self="closePrintDialog"
    >
      <div class="print-dialog">
        <h2 class="print-dialog-title">Imprimir</h2>
        <p class="print-dialog-subtitle">Selecciona què vols imprimir:</p>

        <div class="print-dialog-columns">
          <!-- Player skills -->
          <div class="print-dialog-col">
            <label class="print-dialog-group">
              <input
                type="checkbox"
                :checked="allPlayersChecked"
                :indeterminate.prop="somePlayersChecked && !allPlayersChecked"
                @change="toggleAllPlayers(($event.target as HTMLInputElement).checked)"
              >
              <span>Habilitats</span>
            </label>
            <div class="print-dialog-indent">
              <div v-for="s in ALL_SKILLS" :key="s.id" class="print-dialog-char">
                <label class="print-dialog-check">
                  <button class="print-dialog-expand" @click.prevent="toggleExpand('p-' + s.id)">
                    {{ expanded['p-' + s.id] ? '▾' : '▸' }}
                  </button>
                  <input
                    type="checkbox"
                    :checked="skillAll(s.id, playerSel)"
                    :indeterminate.prop="skillAny(s.id, playerSel) && !skillAll(s.id, playerSel)"
                    @change="toggleSkill(s.id, playerSel, ($event.target as HTMLInputElement).checked)"
                  >
                  <img :src="base + s.iconPath" :alt="s.displayName" class="print-dialog-icon">
                  <span>{{ s.displayName }}</span>
                </label>
                <div v-if="expanded['p-' + s.id]" class="print-dialog-cards">
                  <label
                    v-for="a in s.actions"
                    :key="a.id"
                    class="print-dialog-check print-dialog-card-check"
                  >
                    <input type="checkbox" v-model="playerSel[s.id][a.id]">
                    <span>{{ a.name }}</span>
                  </label>
                </div>
              </div>
            </div>
          </div>

          <!-- Enemies -->
          <div class="print-dialog-col">
            <label class="print-dialog-group">
              <input
                type="checkbox"
                :checked="allEnemiesChecked"
                :indeterminate.prop="someEnemiesChecked && !allEnemiesChecked"
                @change="toggleAllEnemies(($event.target as HTMLInputElement).checked)"
              >
              <span>Enemics</span>
            </label>
            <div class="print-dialog-indent">
              <div v-for="t in ENEMY_TEMPLATES" :key="t.id" class="print-dialog-char">
                <label class="print-dialog-check">
                  <button class="print-dialog-expand" @click.prevent="toggleExpand('e-' + t.id)">
                    {{ expanded['e-' + t.id] ? '▾' : '▸' }}
                  </button>
                  <input
                    type="checkbox"
                    :checked="skillAll(t.id, enemySel)"
                    :indeterminate.prop="skillAny(t.id, enemySel) && !skillAll(t.id, enemySel)"
                    @change="toggleSkill(t.id, enemySel, ($event.target as HTMLInputElement).checked)"
                  >
                  <img :src="base + t.iconPath" :alt="t.displayName" class="print-dialog-icon">
                  <span>{{ t.displayName }}</span>
                </label>
                <div v-if="expanded['e-' + t.id]" class="print-dialog-cards">
                  <label
                    v-for="a in enemyActions(t.id)"
                    :key="a.id"
                    class="print-dialog-check print-dialog-card-check"
                  >
                    <input type="checkbox" v-model="enemySel[t.id][a.id]">
                    <span>{{ a.name }}</span>
                  </label>
                </div>
              </div>
            </div>
          </div>

          <!-- Other -->
          <div class="print-dialog-col">
            <span class="print-dialog-group-label">Altres</span>
            <div class="print-dialog-indent">
              <div class="print-dialog-char">
                <label class="print-dialog-check">
                  <button class="print-dialog-expand" @click.prevent="expandedEquip = !expandedEquip">
                    {{ expandedEquip ? '▾' : '▸' }}
                  </button>
                  <input
                    type="checkbox"
                    :checked="allEquipChecked"
                    :indeterminate.prop="someEquipChecked && !allEquipChecked"
                    @change="toggleAllEquip(($event.target as HTMLInputElement).checked)"
                  >
                  <span>Objectes</span>
                </label>
                <div v-if="expandedEquip" class="print-dialog-cards">
                  <label
                    v-for="e in ALL_EQUIPMENT"
                    :key="e.id"
                    class="print-dialog-check print-dialog-card-check"
                  >
                    <input type="checkbox" v-model="equipSel[e.id]">
                    <span>{{ e.name }}</span>
                    <input
                      v-if="equipSel[e.id]"
                      type="number"
                      v-model.number="equipCount[e.id]"
                      min="1"
                      max="20"
                      class="print-dialog-count"
                    >
                  </label>
                </div>
              </div>
              <label class="print-dialog-check">
                <input type="checkbox" v-model="rulesEnabled">
                <span>Regles</span>
                <input
                  v-if="rulesEnabled"
                  type="number"
                  v-model.number="rulesCount"
                  min="1"
                  max="20"
                  class="print-dialog-count"
                >
              </label>
              <label class="print-dialog-check">
                <input type="checkbox" v-model="sheetEnabled">
                <span>Fitxa</span>
                <input
                  v-if="sheetEnabled"
                  type="number"
                  v-model.number="sheetCount"
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
          <button class="btn btn-secondary" @click="closePrintDialog">Cancel·lar</button>
        </div>
      </div>
    </div>
  </Teleport>

  <!-- Hidden print-only grid. Built only while printing so unselected cards
       are never instantiated. -->
  <div v-if="printingAll" class="print-all-section" :class="{ 'save-ink': saveInk }">
    <CardGrid>
      <PrintableCard v-for="item in printCards" :key="item.key" v-bind="item.props" />
      <template v-if="rulesEnabled">
        <RulesCard v-for="i in rulesCount" :key="'rules-' + i" />
      </template>
    </CardGrid>
    <template v-if="sheetEnabled">
      <CharacterSheet v-for="i in sheetCount" :key="'sheet-' + i" />
    </template>
  </div>
</template>

<style scoped>
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
  max-height: 85vh;
  display: flex;
  flex-direction: column;
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
  overflow-y: auto;
  min-height: 0;
}

.print-dialog-col {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  min-width: 14rem;
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
  position: absolute;
  left: -10000px;
  top: 0;
  width: 210mm;
}

@media print {
  .print-all-section {
    position: static;
    left: auto;
    width: auto;
  }
}
</style>
