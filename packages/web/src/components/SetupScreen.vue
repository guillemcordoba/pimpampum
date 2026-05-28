<script setup lang="ts">
import { ref, computed, nextTick } from 'vue';
import { PLAYER_SKILLS, ALL_EQUIPMENT, getSkill } from '@pimpampum/skills';
import { ENEMY_TEMPLATES } from '@pimpampum/enemies';
import type { Game } from '../composables/useGame';

const props = defineProps<{ game: Game }>();
const g = props.game;
const base = import.meta.env.BASE_URL;

const DEFAULT_SKILL_LEVEL = 25;

// --- Player draft ---------------------------------------------------------
const draftName = ref('');
const draftPv = ref(12);
const draftSkills = ref<Record<string, number>>({});
const draftEquip = ref<string[]>([]);
const skillSearch = ref('');
const equipSearch = ref('');

// Catalog DOM refs — used to scroll a newly-picked row into view.
const skillCatalogEl = ref<HTMLElement | null>(null);
const equipCatalogEl = ref<HTMLElement | null>(null);
const enemyEquipCatalogEl = ref<HTMLElement | null>(null);

async function scrollRowIntoView(container: HTMLElement | null, id: string) {
  await nextTick();
  const el = container?.querySelector(`[data-id="${CSS.escape(id)}"]`) as HTMLElement | null;
  el?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
}

/** Picked skills pinned at the top (always visible regardless of search);
 *  available skills below, filtered by search. */
const skillCatalogRows = computed(() => {
  const picked = draftSkillIds.value
    .map(id => PLAYER_SKILLS.find(s => s.id === id))
    .filter((s): s is (typeof PLAYER_SKILLS)[number] => !!s)
    .map(skill => ({ skill, picked: true as const }));

  const q = skillSearch.value.trim().toLowerCase();
  const available = PLAYER_SKILLS
    .filter(s => !(s.id in draftSkills.value))
    .filter(s => !q || s.displayName.toLowerCase().includes(q) || s.description.toLowerCase().includes(q))
    .map(skill => ({ skill, picked: false as const }));

  return [...picked, ...available];
});

/** Player equipment catalog: picked first (pinned), then filtered available. */
const equipCatalogRows = computed(() => {
  const picked = draftEquip.value
    .map(id => ALL_EQUIPMENT.find(e => e.id === id))
    .filter((e): e is (typeof ALL_EQUIPMENT)[number] => !!e)
    .map(equip => ({ equip, picked: true as const }));

  const q = equipSearch.value.trim().toLowerCase();
  const available = ALL_EQUIPMENT
    .filter(e => !draftEquip.value.includes(e.id))
    .filter(e => !q || e.name.toLowerCase().includes(q))
    .map(equip => ({ equip, picked: false as const }));

  return [...picked, ...available];
});

function addSkill(id: string) {
  if (id in draftSkills.value) return;
  draftSkills.value = { ...draftSkills.value, [id]: DEFAULT_SKILL_LEVEL };
  scrollRowIntoView(skillCatalogEl.value, id);
}
function removeSkill(id: string) {
  const next = { ...draftSkills.value };
  delete next[id];
  draftSkills.value = next;
}
function setSkillLevel(id: string, level: number) {
  draftSkills.value = { ...draftSkills.value, [id]: level };
}
function addEquip(id: string) {
  if (draftEquip.value.includes(id)) return;
  draftEquip.value = [...draftEquip.value, id];
  scrollRowIntoView(equipCatalogEl.value, id);
}
function removeEquip(id: string) {
  draftEquip.value = draftEquip.value.filter(e => e !== id);
}

const draftSkillIds = computed(() => Object.keys(draftSkills.value));
const canAddPlayer = computed(() => draftSkillIds.value.length > 0);

function addPlayer() {
  if (!canAddPlayer.value) return;
  const firstSkill = PLAYER_SKILLS.find(s => s.id === draftSkillIds.value[0])!;
  g.addPlayer({
    name: draftName.value || `Heroi ${g.playerSpecs.value.length + 1}`,
    classCss: firstSkill.classCss,
    iconPath: firstSkill.iconPath,
    pv: draftPv.value,
    skills: { ...draftSkills.value },
    equipment: [...draftEquip.value],
  });
  draftName.value = '';
  draftPv.value = 12;
  draftSkills.value = {};
  draftEquip.value = [];
  skillSearch.value = '';
  equipSearch.value = '';
}

// --- Enemy draft ----------------------------------------------------------
const enemyTemplateId = ref(ENEMY_TEMPLATES[0]?.id ?? '');
const enemyLevel = ref(20);
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
    templateId: enemyTemplateId.value,
    level: enemyLevel.value,
    equipment: [...enemyEquip.value],
  });
  enemyEquip.value = [];
  enemyEquipSearch.value = '';
}

// --- Sums -----------------------------------------------------------------
const playerSkillSum = computed(() =>
  g.playerSpecs.value.reduce((sum, p) => sum + Object.values(p.skills).reduce((a, b) => a + b, 0), 0));
const enemyLevelSum = computed(() =>
  g.enemySpecs.value.reduce((sum, e) => sum + e.level, 0));

function templateName(id: string): string {
  return ENEMY_TEMPLATES.find(t => t.id === id)?.displayName ?? id;
}
function skillName(id: string): string {
  return getSkill(id)?.displayName ?? id;
}
</script>

<template>
  <div class="setup">
    <div class="setup-cols">
      <!-- Player builder (left) -->
      <section class="setup-panel">
        <div class="builder">
          <input v-model="draftName" placeholder="Nom de l'heroi" class="txt">
          <label class="pv-row">PV <input v-model.number="draftPv" type="number" min="5" max="60" class="num"></label>

          <div class="subhead">Habilitats</div>
          <input v-model="skillSearch" type="search" placeholder="Cerca…" class="txt search-input">
          <div ref="skillCatalogEl" class="catalog">
            <template v-for="row in skillCatalogRows" :key="row.skill.id">
              <div
                v-if="row.picked"
                class="catalog-row picked"
                :class="row.skill.classCss"
                :data-id="row.skill.id"
              >
                <img :src="base + row.skill.iconPath" :alt="''" class="catalog-icon">
                <span class="catalog-name">{{ row.skill.displayName }}</span>
                <input
                  type="number" min="1" max="100"
                  :value="draftSkills[row.skill.id]"
                  class="num lvl"
                  @input="setSkillLevel(row.skill.id, Number(($event.target as HTMLInputElement).value))"
                >
                <button class="picked-x" @click="removeSkill(row.skill.id)" title="Treure">✕</button>
              </div>
              <button
                v-else
                type="button"
                class="catalog-row"
                :class="row.skill.classCss"
                :data-id="row.skill.id"
                @click="addSkill(row.skill.id)"
              >
                <img :src="base + row.skill.iconPath" :alt="''" class="catalog-icon">
                <span class="catalog-name">{{ row.skill.displayName }}</span>
                <span class="catalog-add">+</span>
              </button>
            </template>
            <div v-if="skillCatalogRows.length === 0" class="catalog-empty">Cap habilitat</div>
          </div>

          <div class="subhead">Equipament</div>
          <input v-model="equipSearch" type="search" placeholder="Cerca…" class="txt search-input">
          <div ref="equipCatalogEl" class="catalog">
            <template v-for="row in equipCatalogRows" :key="row.equip.id">
              <div
                v-if="row.picked"
                class="catalog-row picked"
                :data-id="row.equip.id"
              >
                <span class="catalog-name">{{ row.equip.name }}</span>
                <button class="picked-x" @click="removeEquip(row.equip.id)" title="Treure">✕</button>
              </div>
              <button
                v-else
                type="button"
                class="catalog-row"
                :data-id="row.equip.id"
                @click="addEquip(row.equip.id)"
              >
                <span class="catalog-name">{{ row.equip.name }}</span>
                <span class="catalog-add">+</span>
              </button>
            </template>
            <div v-if="equipCatalogRows.length === 0" class="catalog-empty">Cap objecte</div>
          </div>

          <button class="btn btn-primary" :disabled="!canAddPlayer" @click="addPlayer">Afegir heroi →</button>
        </div>
      </section>

      <!-- Middle: both team rosters + start button stacked underneath them -->
      <div class="teams-middle">
        <div class="teams-row">
          <section class="setup-panel team-panel">
            <h2>Herois (Σ {{ playerSkillSum }})</h2>
            <div class="roster">
              <div v-for="(p, i) in g.playerSpecs.value" :key="i" class="roster-tile" :class="p.classCss">
                <strong>{{ p.name }}</strong>
                <div class="roster-detail">PV {{ p.pv }} · {{ Object.entries(p.skills).map(([s, l]) => `${skillName(s)} ${l}`).join(', ') }}</div>
                <div v-if="p.equipment.length" class="roster-detail">⚙ {{ p.equipment.join(', ') }}</div>
                <button class="x" @click="g.removePlayer(i)">✕</button>
              </div>
              <div v-if="g.playerSpecs.value.length === 0" class="empty-hint">← Afegeix herois</div>
            </div>
          </section>

          <section class="setup-panel team-panel">
            <h2>Enemics (Σ {{ enemyLevelSum }})</h2>
            <div class="roster">
              <div v-for="(e, i) in g.enemySpecs.value" :key="i" class="roster-tile">
                <strong>{{ templateName(e.templateId) }}</strong>
                <div class="roster-detail">nivell {{ e.level }}</div>
                <div v-if="e.equipment.length" class="roster-detail">⚙ {{ e.equipment.join(', ') }}</div>
                <button class="x" @click="g.removeEnemy(i)">✕</button>
              </div>
              <div v-if="g.enemySpecs.value.length === 0" class="empty-hint">Afegeix enemics →</div>
            </div>
          </section>
        </div>

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
            <option v-for="t in ENEMY_TEMPLATES" :key="t.id" :value="t.id">{{ t.displayName }} (PV {{ t.basePV }})</option>
          </select>
          <label class="pv-row">Nivell <input v-model.number="enemyLevel" type="number" min="1" max="100" class="num"></label>

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
.setup { max-width: 1400px; margin: 0 auto; }
.setup-cols { display: grid; grid-template-columns: 1.4fr 2fr 1.4fr; gap: 1rem; align-items: start; }
/* Cap each column at the viewport. ~7rem subtracts the sticky nav + main padding.
   The builder panels become flex columns so their inner catalogs can absorb the
   leftover height instead of producing an outer panel scrollbar. */
/* Fixed height — the two builder panels always fill the viewport so their
   catalogs absorb leftover space whether content is small or large.
   min-height: 0 prevents the grid item's default min-height: auto from
   overriding the cap when content is tall. */
.setup-cols > .setup-panel {
  height: calc(100vh - 7rem);
  min-height: 0;
  display: flex;
  flex-direction: column;
}
.teams-middle {
  max-height: calc(100vh - 7rem);
  min-height: 0;
  overflow-y: auto;
  display: flex; flex-direction: column; gap: 1rem; min-width: 0;
}
.teams-row { display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; align-items: start; }
.setup-panel { background: rgba(0,0,0,0.2); border: 1px solid rgba(232,220,196,0.15); border-radius: 8px; padding: 1rem; min-width: 0; }
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

/* Searchable catalog (skills + equipment) */
.search-input { font-size: 0.85rem; }
.catalog {
  display: flex; flex-direction: column; gap: 0.2rem;
  /* Soak up whatever leftover height the panel has, share it between the
     skill catalog and the equipment catalog, and only scroll inside.
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

/* Class accent for skill rows (mirrors skills page) */
.catalog-row.guerrer { --class-color: var(--class-guerrer); }
.catalog-row.murri { --class-color: var(--class-murri); }
.catalog-row.mag { --class-color: var(--class-mag); }
.catalog-row.barbar { --class-color: var(--class-barbar); }
.catalog-row.clergue { --class-color: var(--class-clergue); }
.catalog-row.monjo { --class-color: var(--class-monjo); }
.catalog-row.trobador { --class-color: var(--class-trobador); }
.catalog-row.fetiller { --class-color: var(--class-fetiller); }
.catalog-row.bruixot { --class-color: var(--class-bruixot); }
.catalog-row.paladi { --class-color: var(--class-paladi); }
.catalog-row.druida { --class-color: var(--class-druida); }
.catalog-row.objecte { --class-color: var(--class-objecte); }

.txt, .num, select.txt { background: rgba(0,0,0,0.4); border: 1px solid rgba(232,220,196,0.3); border-radius: 4px; color: var(--parchment); padding: 0.3rem; }
.num { width: 4rem; }
.lvl { width: 3.2rem; }
.pv-row { color: var(--parchment); display: inline-flex; gap: 0.4rem; align-items: center; }
.start-row { text-align: center; }
.btn-big { font-size: 1.2rem; padding: 0.6rem 1.5rem; }

@media (max-width: 1100px) {
  .setup-cols { grid-template-columns: 1fr 1fr; }
  .teams-middle { grid-column: 1 / -1; }
}
</style>
