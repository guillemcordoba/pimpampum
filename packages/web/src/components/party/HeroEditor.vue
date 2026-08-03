<script setup lang="ts">
import { ref, computed, watch, nextTick } from 'vue';
import { PLAYER_SKILLS, ALL_EQUIPMENT, ALL_POTIONS, getSkill, getPotion } from '@pimpampum/skills';
import type { HeroSpec } from '../../composables/party';

/**
 * The full character builder — name, PV, skills and gear — as a modal.
 *
 * It is the ONE place a player character is written, opened from the party
 * roster in both the encounter creator and the AI-combat setup. It edits a
 * DRAFT and only emits on save, so cancelling leaves the stored party alone.
 */

const props = defineProps<{
  /** The hero being edited; null/undefined opens a blank one. */
  hero?: HeroSpec | null;
  /** Shown in the header — "Nou heroi" vs the name being edited. */
  title?: string;
}>();

const emit = defineEmits<{ save: [HeroSpec]; cancel: [] }>();

const base = import.meta.env.BASE_URL;
const DEFAULT_SKILL_LEVEL = 1;
const DEFAULT_PV = 12;

// --- the draft --------------------------------------------------------------
const draftName = ref('');
const draftPv = ref(DEFAULT_PV);
const draftSkills = ref<Record<string, number>>({});
const draftEquip = ref<string[]>([]);
const draftPotions = ref<string[]>([]);
const skillSearch = ref('');
const equipSearch = ref('');

watch(() => props.hero, hero => {
  draftName.value = hero?.name ?? '';
  draftPv.value = hero?.pv ?? DEFAULT_PV;
  draftSkills.value = { ...(hero?.skills ?? {}) };
  draftEquip.value = [...(hero?.equipment ?? [])];
  draftPotions.value = [...(hero?.potions ?? [])];
  skillSearch.value = '';
  equipSearch.value = '';
}, { immediate: true });

// Catalog DOM refs — used to scroll a newly-picked row into view.
const skillCatalogEl = ref<HTMLElement | null>(null);
const equipCatalogEl = ref<HTMLElement | null>(null);

async function scrollRowIntoView(container: HTMLElement | null, id: string) {
  await nextTick();
  const el = container?.querySelector(`[data-id="${CSS.escape(id)}"]`) as HTMLElement | null;
  el?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
}

const draftSkillIds = computed(() => Object.keys(draftSkills.value));
const canSave = computed(() => draftSkillIds.value.length > 0);

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

/** Equipment AND potions in one flat list, all rendered identically.
 *  Picked rows pinned first, then filtered available. */
interface EquipCatalogRow { id: string; name: string; picked: boolean; isPotion: boolean; }

const equipCatalogRows = computed<EquipCatalogRow[]>(() => {
  const q = equipSearch.value.trim().toLowerCase();
  const pickedEquip = draftEquip.value
    .map(id => ALL_EQUIPMENT.find(e => e.id === id))
    .filter((e): e is (typeof ALL_EQUIPMENT)[number] => !!e)
    .map(e => ({ id: e.id, name: e.name, picked: true, isPotion: false }));
  const pickedPotions = draftPotions.value
    .map(id => getPotion(id))
    .filter((p): p is NonNullable<ReturnType<typeof getPotion>> => !!p)
    .map(p => ({ id: p.id, name: p.name, picked: true, isPotion: true }));
  const availEquip = ALL_EQUIPMENT
    .filter(e => !draftEquip.value.includes(e.id))
    .filter(e => !q || e.name.toLowerCase().includes(q))
    .map(e => ({ id: e.id, name: e.name, picked: false, isPotion: false }));
  const availPotions = ALL_POTIONS
    .filter(p => !draftPotions.value.includes(p.id))
    .filter(p => !q || p.name.toLowerCase().includes(q))
    .map(p => ({ id: p.id, name: p.name, picked: false, isPotion: true }));

  return [...pickedEquip, ...pickedPotions, ...availEquip, ...availPotions];
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
/** Max level of a skill = the number of actions it defines (level N = knows
 *  the first N actions). */
function skillMaxLevel(id: string): number {
  return getSkill(id)?.actions.length ?? 7;
}
function setSkillLevel(id: string, level: number) {
  const clamped = Math.max(1, Math.min(skillMaxLevel(id), Math.round(level) || 1));
  draftSkills.value = { ...draftSkills.value, [id]: clamped };
}
function addEquip(id: string) {
  if (draftEquip.value.includes(id)) return;
  draftEquip.value = [...draftEquip.value, id];
  scrollRowIntoView(equipCatalogEl.value, id);
}
function removeEquip(id: string) {
  draftEquip.value = draftEquip.value.filter(e => e !== id);
}
function addPotion(id: string) {
  if (draftPotions.value.includes(id)) return;
  draftPotions.value = [...draftPotions.value, id];
  scrollRowIntoView(equipCatalogEl.value, id);
}
function removePotion(id: string) {
  draftPotions.value = draftPotions.value.filter(p => p !== id);
}

/** Total skill levels — the number the balance principle is stated in. */
const levelSum = computed(() =>
  Object.values(draftSkills.value).reduce((a, b) => a + b, 0));

function save() {
  if (!canSave.value) return;
  // The first skill gives the hero its colour and icon, as it does everywhere.
  const first = PLAYER_SKILLS.find(s => s.id === draftSkillIds.value[0]);
  emit('save', {
    name: draftName.value.trim() || 'Heroi',
    classCss: first?.classCss ?? 'guerrer',
    iconPath: first?.iconPath ?? '',
    pv: Math.max(1, draftPv.value || DEFAULT_PV),
    skills: { ...draftSkills.value },
    equipment: [...draftEquip.value],
    potions: [...draftPotions.value],
  });
}
</script>

<template>
  <div class="modal-backdrop" @click.self="emit('cancel')">
    <div class="modal" role="dialog" aria-modal="true">
      <header class="modal-head">
        <h2>{{ title ?? (hero ? 'Edita l\'heroi' : 'Nou heroi') }}</h2>
        <button type="button" class="close" title="Tanca" @click="emit('cancel')">✕</button>
      </header>

      <div class="modal-body">
        <div class="top-row">
          <input v-model="draftName" placeholder="Nom de l'heroi" class="txt name-input">
          <label class="pv-row">PV <input v-model.number="draftPv" type="number" min="1" max="60" class="num"></label>
        </div>

        <div class="cols">
          <div class="col">
            <div class="subhead">Habilitats <span class="sum">Σ {{ levelSum }}</span></div>
            <input v-model="skillSearch" type="search" placeholder="Cerca…" class="txt search-input">
            <div ref="skillCatalogEl" class="catalog">
              <template v-for="row in skillCatalogRows" :key="row.skill.id">
                <div
                  v-if="row.picked"
                  class="catalog-row picked"
                  :class="row.skill.classCss"
                  :data-id="row.skill.id"
                >
                  <img :src="base + row.skill.iconPath" alt="" class="catalog-icon">
                  <span class="catalog-name">{{ row.skill.displayName }}</span>
                  <input
                    type="number" min="1" :max="skillMaxLevel(row.skill.id)"
                    :value="draftSkills[row.skill.id]"
                    class="num lvl"
                    @input="setSkillLevel(row.skill.id, Number(($event.target as HTMLInputElement).value))"
                  >
                  <button class="picked-x" title="Treure" @click="removeSkill(row.skill.id)">✕</button>
                </div>
                <button
                  v-else
                  type="button"
                  class="catalog-row"
                  :class="row.skill.classCss"
                  :data-id="row.skill.id"
                  @click="addSkill(row.skill.id)"
                >
                  <img :src="base + row.skill.iconPath" alt="" class="catalog-icon">
                  <span class="catalog-name">{{ row.skill.displayName }}</span>
                  <span class="catalog-add">+</span>
                </button>
              </template>
              <div v-if="skillCatalogRows.length === 0" class="catalog-empty">Cap habilitat</div>
            </div>
          </div>

          <div class="col">
            <div class="subhead">Equipament</div>
            <input v-model="equipSearch" type="search" placeholder="Cerca…" class="txt search-input">
            <div ref="equipCatalogEl" class="catalog">
              <template v-for="row in equipCatalogRows" :key="row.id">
                <div v-if="row.picked" class="catalog-row picked" :data-id="row.id">
                  <span class="catalog-name">{{ row.name }}</span>
                  <button
                    class="picked-x" title="Treure"
                    @click="row.isPotion ? removePotion(row.id) : removeEquip(row.id)"
                  >✕</button>
                </div>
                <button
                  v-else
                  type="button"
                  class="catalog-row"
                  :data-id="row.id"
                  @click="row.isPotion ? addPotion(row.id) : addEquip(row.id)"
                >
                  <span class="catalog-name">{{ row.name }}</span>
                  <span class="catalog-add">+</span>
                </button>
              </template>
              <div v-if="equipCatalogRows.length === 0" class="catalog-empty">Cap objecte</div>
            </div>
          </div>
        </div>
      </div>

      <footer class="modal-foot">
        <button type="button" class="btn" @click="emit('cancel')">Cancel·la</button>
        <button type="button" class="btn btn-primary" :disabled="!canSave" @click="save">
          {{ hero ? 'Desa' : 'Afegeix' }}
        </button>
      </footer>
    </div>
  </div>
</template>

<style scoped>
.modal-backdrop {
  position: fixed; inset: 0; z-index: 300;
  background: rgba(0, 0, 0, 0.65);
  display: flex; align-items: center; justify-content: center;
  padding: 1.5rem;
}
.modal {
  width: min(760px, 100%); max-height: 100%;
  display: flex; flex-direction: column; min-height: 0;
  background: var(--bg-dark, #1a140d);
  border: 1px solid rgba(232, 220, 196, 0.3);
  border-radius: 10px;
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.6);
}
.modal-head {
  display: flex; align-items: center; gap: 1rem;
  padding: 0.9rem 1.1rem;
  border-bottom: 1px solid rgba(232, 220, 196, 0.15);
}
.modal-head h2 {
  flex: 1; margin: 0;
  font-family: 'Cinzel Decorative', serif; color: var(--parchment); font-size: 1.15rem;
}
.close { background: none; border: none; color: var(--parchment-dark); cursor: pointer; font-size: 1.1rem; }
.close:hover { color: var(--parchment); }

.modal-body { flex: 1; min-height: 0; overflow-y: auto; padding: 1rem 1.1rem; }
.top-row { display: flex; flex-wrap: wrap; gap: 0.6rem; align-items: center; margin-bottom: 0.9rem; }
.name-input { flex: 1; min-width: 12rem; }

/* Skills and gear side by side: the modal is wide, unlike the column the
   roster lives in — that width is the whole reason the editor is a modal. */
.cols { display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; }
.col { display: flex; flex-direction: column; gap: 0.4rem; min-width: 0; }

.subhead {
  display: flex; align-items: baseline; gap: 0.5rem;
  font-family: 'MedievalSharp', serif; color: var(--parchment); font-size: 0.95rem;
}
.sum { font-family: 'Crimson Text', serif; font-style: italic; color: var(--parchment-dark); font-size: 0.85rem; }

.search-input { font-size: 0.85rem; }
.catalog {
  display: flex; flex-direction: column; gap: 0.2rem;
  height: min(46vh, 22rem); overflow-y: auto;
  background: rgba(0, 0, 0, 0.25);
  border: 1px solid rgba(232, 220, 196, 0.1);
  border-radius: 4px; padding: 0.3rem;
}
.catalog-row {
  display: flex; align-items: center; gap: 0.5rem;
  padding: 0.3rem 0.5rem;
  background: rgba(0, 0, 0, 0.2);
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
.catalog-row:not(:disabled):hover { background: rgba(232, 220, 196, 0.1); color: var(--parchment); }
.catalog-row.picked { color: var(--parchment); background: rgba(232, 220, 196, 0.08); cursor: default; }
.catalog-icon { width: 1.1rem; height: 1.1rem; flex-shrink: 0; filter: invert(85%) sepia(15%) saturate(360%) hue-rotate(2deg) brightness(95%); }
.catalog-name { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.catalog-add { color: var(--parchment-dark); font-weight: bold; }
.catalog-empty { color: var(--parchment-dark); opacity: 0.6; font-size: 0.8rem; padding: 0.4rem; text-align: center; font-style: italic; }
.picked-x { background: none; border: none; color: var(--parchment-dark); cursor: pointer; font-size: 0.85rem; padding: 0 0.2rem; }
.picked-x:hover { color: var(--parchment); }

/* Class accent for skill rows (mirrors the skills page) */
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
.catalog-row.terra { --class-color: var(--class-terra); }

.txt, .num {
  background: rgba(0, 0, 0, 0.4); border: 1px solid rgba(232, 220, 196, 0.3);
  border-radius: 4px; color: var(--parchment); padding: 0.3rem;
}
.num { width: 4rem; }
.lvl { width: 3.2rem; }
.pv-row { color: var(--parchment); display: inline-flex; gap: 0.4rem; align-items: center; }

.modal-foot {
  display: flex; justify-content: flex-end; gap: 0.6rem;
  padding: 0.8rem 1.1rem;
  border-top: 1px solid rgba(232, 220, 196, 0.15);
}

@media (max-width: 700px) {
  .modal-backdrop { padding: 0; }
  .modal { width: 100%; height: 100%; max-height: 100%; border-radius: 0; }
  .cols { grid-template-columns: 1fr; }
  .catalog { height: 14rem; }
}
</style>
