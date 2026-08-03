<script setup lang="ts">
import { ref, computed, nextTick } from 'vue';
import { ALL_EQUIPMENT } from '@pimpampum/skills';
import { ENEMY_DEFINITIONS, fullKitLevel } from '@pimpampum/enemies';
import type { Game } from '../composables/useGame';
import PartyRoster from './party/PartyRoster.vue';

const props = defineProps<{ game: Game }>();
const g = props.game;

// Catalog DOM refs — used to scroll a newly-picked row into view.
const enemyEquipCatalogEl = ref<HTMLElement | null>(null);

async function scrollRowIntoView(container: HTMLElement | null, id: string) {
  await nextTick();
  const el = container?.querySelector(`[data-id="${CSS.escape(id)}"]`) as HTMLElement | null;
  el?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
}

// --- Enemy draft ----------------------------------------------------------
const enemyTemplateId = ref(ENEMY_DEFINITIONS[0]?.id ?? '');
const enemyLevel = ref(3);
/** Creatures carry no printed PV — the encounter sets it. */
const DEFAULT_ENEMY_PV = 20;
const enemyPv = ref<number>(DEFAULT_ENEMY_PV);

const enemyTemplate = computed(() => ENEMY_DEFINITIONS.find(t => t.id === enemyTemplateId.value));
/** Max enemy level = the size of the template's kit (actions across its skills). */
const enemyMaxLevel = computed(() => {
  const t = enemyTemplate.value;
  if (!t) return 7;
  return fullKitLevel(t);
});
const enemyEquip = ref<string[]>([]);
const enemyEquipSearch = ref('');

/** Enemy equipment catalog: picked first (pinned), then filtered available. */
const enemyEquipCatalogRows = computed(() => {
  const picked = enemyEquip.value
    .map(id => ALL_EQUIPMENT.find(e => e.id === id))
    .filter((e): e is (typeof ALL_EQUIPMENT)[number] => !!e)
    .map(equip => ({ equip, picked: true as const }));

  const q = enemyEquipSearch.value.trim().toLowerCase();
  const available = ALL_EQUIPMENT
    .filter(e => !enemyEquip.value.includes(e.id))
    .filter(e => !q || e.name.toLowerCase().includes(q))
    .map(equip => ({ equip, picked: false as const }));

  return [...picked, ...available];
});

function addEnemyEquip(id: string) {
  if (enemyEquip.value.includes(id)) return;
  enemyEquip.value = [...enemyEquip.value, id];
  scrollRowIntoView(enemyEquipCatalogEl.value, id);
}
function removeEnemyEquip(id: string) {
  enemyEquip.value = enemyEquip.value.filter(e => e !== id);
}

function addEnemy() {
  if (!enemyTemplateId.value) return;
  g.addEnemy({
    enemyId: enemyTemplateId.value,
    level: Math.max(1, Math.min(enemyMaxLevel.value, enemyLevel.value)),
    equipment: [...enemyEquip.value],
    pv: Math.max(1, enemyPv.value || DEFAULT_ENEMY_PV),
  });
  enemyEquip.value = [];
  enemyEquipSearch.value = '';
}

// --- Sums -----------------------------------------------------------------
const enemyLevelSum = computed(() =>
  g.enemySpecs.value.reduce((sum, e) => sum + e.level, 0));

function templateName(id: string): string {
  return ENEMY_DEFINITIONS.find(t => t.id === id)?.displayName ?? id;
}
</script>

<template>
  <div class="setup">
    <div class="setup-cols">
      <!-- Left: the same stored party the encounter creator prices against -->
      <section class="setup-panel">
        <h2>Els jugadors</h2>
        <div class="party-scroll">
          <PartyRoster />
        </div>
      </section>

      <!-- Middle: the enemy roster + start button stacked underneath it -->
      <div class="teams-middle">
        <section class="setup-panel team-panel">
          <h2>Enemics (Σ {{ enemyLevelSum }})</h2>
          <div class="roster">
            <div v-for="(e, i) in g.enemySpecs.value" :key="i" class="roster-tile">
              <strong>{{ templateName(e.enemyId) }}</strong>
              <div class="roster-detail">nivell {{ e.level }}<template v-if="e.pv"> · PV {{ e.pv }}</template></div>
              <div v-if="e.equipment.length" class="roster-detail">⚙ {{ e.equipment.join(', ') }}</div>
              <button class="x" @click="g.removeEnemy(i)">✕</button>
            </div>
            <div v-if="g.enemySpecs.value.length === 0" class="empty-hint">Afegeix enemics →</div>
          </div>
        </section>

        <div class="start-row">
          <button class="btn btn-primary btn-big" :disabled="!g.canStart()" @click="g.startCombat()">
            Comença el combat
          </button>
        </div>
      </div>

      <!-- Enemy builder (right) -->
      <section class="setup-panel">
        <div class="builder">
          <select v-model="enemyTemplateId" class="txt">
            <option v-for="t in ENEMY_DEFINITIONS" :key="t.id" :value="t.id">{{ t.displayName }}</option>
          </select>
          <label class="pv-row">Nivell <input v-model.number="enemyLevel" type="number" min="1" :max="enemyMaxLevel" class="num"> PV <input v-model.number="enemyPv" type="number" min="1" class="num"></label>

          <div class="subhead">Equipament</div>
          <input v-model="enemyEquipSearch" type="search" placeholder="Cerca…" class="txt search-input">
          <div ref="enemyEquipCatalogEl" class="catalog catalog-static">
            <template v-for="row in enemyEquipCatalogRows" :key="row.equip.id">
              <div
                v-if="row.picked"
                class="catalog-row picked"
                :data-id="row.equip.id"
              >
                <span class="catalog-name">{{ row.equip.name }}</span>
                <button class="picked-x" @click="removeEnemyEquip(row.equip.id)" title="Treure">✕</button>
              </div>
              <button
                v-else
                type="button"
                class="catalog-row"
                :data-id="row.equip.id"
                @click="addEnemyEquip(row.equip.id)"
              >
                <span class="catalog-name">{{ row.equip.name }}</span>
                <span class="catalog-add">+</span>
              </button>
            </template>
            <div v-if="enemyEquipCatalogRows.length === 0" class="catalog-empty">Cap objecte</div>
          </div>

          <button class="btn" @click="addEnemy">← Afegir enemic</button>
        </div>
      </section>
    </div>
  </div>
</template>

<style scoped>
/* The setup screen fills whatever height its host gives it and never makes the
   page scroll: the three columns stretch to that height and only their inner
   catalogs/rosters scroll. Measuring the viewport instead (the old
   `calc(100vh - 7rem)`) broke the moment anything was added above it. */
.setup { height: 100%; min-height: 0; max-width: 1400px; margin: 0 auto; display: flex; flex-direction: column; }
.setup-cols {
  flex: 1; min-height: 0;
  display: grid; grid-template-columns: 1.4fr 2fr 1.4fr; gap: 1rem;
  align-items: stretch;
}
/* min-height: 0 prevents a grid item's default min-height: auto from refusing
   to shrink below its content and pushing the page past the host's height. */
.setup-cols > .setup-panel {
  min-height: 0;
  display: flex;
  flex-direction: column;
}
.teams-middle {
  min-height: 0;
  overflow-y: auto;
  display: flex; flex-direction: column; gap: 1rem; min-width: 0;
}
.setup-panel { background: rgba(0,0,0,0.2); border: 1px solid rgba(232,220,196,0.15); border-radius: 8px; padding: 1rem; min-width: 0; }
.setup-panel h2 { font-family: 'Cinzel Decorative', serif; color: var(--parchment); font-size: 1.05rem; margin: 0 0 0.7rem; }
/* The roster is the whole left panel: it takes the leftover height and
   scrolls inside, like the enemy builder's catalog does. */
.party-scroll { flex: 1; min-height: 0; overflow-y: auto; }
.team-panel { background: rgba(0,0,0,0.35); }
.empty-hint { color: var(--parchment-dark); opacity: 0.6; font-style: italic; padding: 0.5rem 0; text-align: center; font-size: 0.85rem; }
.roster { display: flex; flex-direction: column; gap: 0.4rem; }
.roster-tile { position: relative; background: rgba(0,0,0,0.3); border-left: 4px solid var(--parchment-dark); border-radius: 4px; padding: 0.4rem 0.6rem; color: var(--parchment); }
.roster-detail { font-size: 0.8rem; opacity: 0.8; }
.roster-tile .x { position: absolute; top: 0.3rem; right: 0.4rem; background: none; border: none; color: var(--parchment-dark); cursor: pointer; }
.builder { display: flex; flex-direction: column; gap: 0.5rem; flex: 1; min-height: 0; }
/* Pin the "Afegir heroi" / "Afegir enemic" button to the bottom of the panel
   even when the catalogs above don't fill the height. */
.builder > .btn:last-child { margin-top: auto; }
.subhead { font-family: 'MedievalSharp', serif; color: var(--parchment); margin-top: 0.3rem; font-size: 0.95rem; }

/* Remove ✕ inside a picked catalog row */
.picked-x { background: none; border: none; color: var(--parchment-dark); cursor: pointer; font-size: 0.85rem; padding: 0 0.2rem; }
.picked-x:hover { color: var(--parchment); }

/* Searchable equipment catalog (the enemy builder's only list) */
.search-input { font-size: 0.85rem; }
.catalog {
  display: flex; flex-direction: column; gap: 0.2rem;
  /* Soak up whatever leftover height the panel has and only scroll inside.
     min-height: 0 is critical — otherwise the catalog refuses to shrink
     below its content size and pushes the panel past its max-height. */
  flex: 1 1 0;
  min-height: 0;
  overflow-y: auto;
  background: rgba(0,0,0,0.25);
  border: 1px solid rgba(232,220,196,0.1);
  border-radius: 4px; padding: 0.3rem;
}
/* Variant used in the enemy builder, where equipment is the only catalog.
   We don't want it to stretch to the bottom of the panel — let it hug its
   content (and scroll only if the list is long enough to need it). */
.catalog-static {
  flex: 0 1 auto;
}
.catalog-row {
  display: flex; align-items: center; gap: 0.5rem;
  padding: 0.3rem 0.5rem;
  background: rgba(0,0,0,0.2);
  border: 1px solid transparent;
  border-left: 3px solid var(--class-color, var(--parchment-dark));
  border-radius: 3px;
  color: var(--parchment-dark);
  font-family: 'MedievalSharp', serif;
  font-size: 0.85rem;
  text-align: left;
  cursor: pointer;
  transition: background 0.12s, color 0.12s;
}
.catalog-row:not(:disabled):hover { background: rgba(232,220,196,0.1); color: var(--parchment); }
.catalog-row.picked { color: var(--parchment); background: rgba(232,220,196,0.08); cursor: default; }
.catalog-row:disabled { opacity: 0.7; }
.catalog-icon { width: 1.1rem; height: 1.1rem; flex-shrink: 0; filter: invert(85%) sepia(15%) saturate(360%) hue-rotate(2deg) brightness(95%); }
.catalog-name { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.catalog-add { color: var(--parchment-dark); font-weight: bold; }
.catalog-empty { color: var(--parchment-dark); opacity: 0.6; font-size: 0.8rem; padding: 0.4rem; text-align: center; font-style: italic; }

.txt, .num, select.txt { background: rgba(0,0,0,0.4); border: 1px solid rgba(232,220,196,0.3); border-radius: 4px; color: var(--parchment); padding: 0.3rem; }
select.txt { color-scheme: dark; }
select.txt option { background: #241c12; color: var(--parchment); }
.num { width: 4rem; }
.pv-row { color: var(--parchment); display: inline-flex; gap: 0.4rem; align-items: center; }
.start-row { text-align: center; }
.btn-big { font-size: 1.2rem; padding: 0.6rem 1.5rem; }

@media (max-width: 1100px) {
  .setup-cols { grid-template-columns: 1fr 1fr; }
  .teams-middle { grid-column: 1 / -1; }
}

/* Stacked on a phone there is no height to share out: let the page scroll
   normally instead of squeezing three panels into one screen. */
@media (max-width: 760px) {
  .setup { height: auto; }
  .setup-cols { grid-template-columns: 1fr; }
  .setup-cols > .setup-panel { height: auto; }
  .teams-middle { overflow-y: visible; }
  .party-scroll { overflow-y: visible; }
  .catalog { max-height: 45vh; }
}
</style>
