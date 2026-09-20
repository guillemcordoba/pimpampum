<script setup lang="ts">
import { ref, computed } from 'vue';
import { clampFatigue, FATIGUE_LEVEL_NAMES } from '@pimpampum/engine';
import { getSkill, getPotion, getEquipment } from '@pimpampum/skills';
import { useParties, type HeroSpec } from '../../composables/party';
import HeroEditor from './HeroEditor.vue';

/**
 * The party, compactly: which group is at the table, who is in it, and the
 * ways to change that. The full character builder is a MODAL — this list has
 * to fit a narrow column in the encounter creator.
 *
 * Both the creator and the AI-combat setup mount this component against the
 * same store, so a hero edited in one is the hero the other fields.
 */

defineProps<{
  /** Hides the party picker where only one party makes sense on screen. */
  hidePicker?: boolean;
}>();

const base = import.meta.env.BASE_URL;
const party = useParties();

// --- the editor modal -------------------------------------------------------
/** -1 = closed, null-hero = adding, otherwise the index being edited. */
const editingIndex = ref<number | null>(null);
const editingHero = computed<HeroSpec | null>(() =>
  editingIndex.value !== null && editingIndex.value >= 0
    ? party.heroes.value[editingIndex.value] ?? null
    : null);

function openNew(): void { editingIndex.value = -1; }
function openEdit(i: number): void { editingIndex.value = i; }
function closeEditor(): void { editingIndex.value = null; }

function saveHero(hero: HeroSpec): void {
  if (editingIndex.value === null) return;
  if (editingIndex.value < 0) party.addHero(hero);
  else party.updateHero(editingIndex.value, hero);
  closeEditor();
}

// --- party management -------------------------------------------------------
const renaming = ref(false);
const renameDraft = ref('');

function startRename(): void {
  renameDraft.value = party.active.value?.name ?? '';
  renaming.value = true;
}
function commitRename(): void {
  if (party.active.value) party.renameParty(party.active.value.id, renameDraft.value);
  renaming.value = false;
}
function newParty(): void {
  party.createParty();
  openNew();
}
function deleteParty(): void {
  const p = party.active.value;
  if (!p) return;
  // Say what survives: the fights this table has played are kept, so the GM is
  // not deciding the fate of their whole history from one button.
  if (!confirm(
    `Esborra el grup «${p.name}» i els seus herois? No es pot desfer.\n\n`
    + 'Els combats que ha jugat es conserven, sota «Combats sense grup».',
  )) return;
  party.deleteParty(p.id);
}

/** PV, edited straight from the roster row — it changes every session and is
 *  not worth opening the character builder for. */
function setPv(index: number, value: number): void {
  const hero = party.heroes.value[index];
  if (!hero) return;
  const pv = Math.max(1, Math.min(99, Math.round(value) || hero.pv));
  party.updateHero(index, { ...hero, pv });
}

/** Fatigue level, likewise edited from the row: the DM assigns it from the
 *  fiction between fights, and the balancer prices the party at that level. */
function setFatigue(index: number, value: number): void {
  const hero = party.heroes.value[index];
  if (!hero) return;
  party.updateHero(index, { ...hero, fatigue: clampFatigue(value) });
}

// --- hero summaries ---------------------------------------------------------
function skillSummary(hero: HeroSpec): string {
  return Object.entries(hero.skills)
    .map(([id, lvl]) => `${getSkill(id)?.displayName ?? id} ${lvl}`)
    .join(', ');
}
function gearSummary(hero: HeroSpec): string {
  const gear = hero.equipment.map(id => getEquipment(id)?.name ?? id);
  const potions = hero.potions.map(id => getPotion(id)?.name ?? id);
  return [...gear, ...potions].join(', ');
}

/**
 * A hero whose kit has weapon cards but no weapon is holding a DEAD HAND:
 * weapon-tagged actions require one, so they are unplayable. The balancer
 * prices that faithfully and the encounters come out bizarre (it once solved
 * six goblins to 1 PV each), so the roster has to say it out loud.
 */
function missingWeapon(hero: HeroSpec): boolean {
  const needsWeapon = Object.keys(hero.skills).some(id =>
    getSkill(id)?.actions.some(a => a.effects.some(e => e.type === 'weapon_damage')));
  if (!needsWeapon) return false;
  return !hero.equipment.some(id => getEquipment(id)?.attackBonus !== undefined);
}
/** Total skill levels of the party — the number the balance principle uses. */
const levelSum = computed(() => party.heroes.value.reduce(
  (sum, h) => sum + Object.values(h.skills).reduce((a, b) => a + b, 0), 0));
</script>

<template>
  <div class="party-roster">
    <!-- Every party can be deleted, including the last one, so "no party at
         all" is a state this component has to render rather than assume away. -->
    <div v-if="!party.active.value" class="no-party">
      <p class="empty-hint">Encara no hi ha cap grup de jugadors.</p>
      <button type="button" class="add-hero" @click="newParty">+ crea un grup</button>
    </div>

    <template v-else>
    <div v-if="!hidePicker" class="picker">
      <select
        v-if="!renaming"
        class="txt party-select"
        :value="party.activeId.value"
        @change="party.selectParty(($event.target as HTMLSelectElement).value)"
      >
        <option v-for="p in party.parties.value" :key="p.id" :value="p.id">{{ p.name }}</option>
      </select>
      <input
        v-else
        v-model="renameDraft"
        class="txt party-select"
        autofocus
        @keyup.enter="commitRename"
        @keyup.esc="renaming = false"
        @blur="commitRename"
      >
      <button v-if="!renaming" type="button" class="icon-btn" title="Canvia el nom" @click="startRename">✎</button>
      <button type="button" class="icon-btn" title="Un grup nou" @click="newParty">＋</button>
      <button type="button" class="icon-btn" title="Esborra aquest grup" @click="deleteParty">🗑</button>
    </div>

    <div class="heroes">
      <div
        v-for="(h, i) in party.heroes.value" :key="i"
        class="hero-row" :class="h.classCss"
      >
        <img v-if="h.iconPath" :src="base + h.iconPath" alt="" class="hero-icon">
        <div class="hero-main">
          <div class="hero-name">{{ h.name }}</div>
          <div class="hero-detail">
            <!-- PV moves every session, so it is edited HERE. Opening the whole
                 character builder to nudge a number was the cumbersome part. -->
            <label class="pv-inline" title="Punts de vida">
              PV
              <input
                type="number" min="1" max="99" class="pv-input"
                :value="h.pv"
                @change="setPv(i, Number(($event.target as HTMLInputElement).value))"
              >
            </label>
            <label class="pv-inline" title="Nivell de fatiga: −1 a totes les tirades per nivell">
              Fatiga
              <select
                class="pv-input fatigue-select"
                :value="h.fatigue ?? 0"
                @change="setFatigue(i, Number(($event.target as HTMLSelectElement).value))"
              >
                <option v-for="(name, lvl) in FATIGUE_LEVEL_NAMES" :key="lvl" :value="lvl">{{ lvl }} · {{ name }}</option>
              </select>
            </label>
            · {{ skillSummary(h) }}
          </div>
          <!-- Always rendered, empty included: an unequipped hero is a very
               different character from an equipped one, and silence read as
               "fine" while the balancer priced them as nearly helpless. -->
          <div class="hero-detail" :class="{ warn: !gearSummary(h) }">
            ⚙ {{ gearSummary(h) || 'sense equipament' }}
          </div>
          <div v-if="missingWeapon(h)" class="hero-detail warn">
            ⚠ les seves cartes d'arma no es poden jugar sense arma
          </div>
        </div>
        <div class="hero-actions">
          <button type="button" class="icon-btn" title="Edita" @click="openEdit(i)">✎</button>
          <button type="button" class="icon-btn" title="Treu del grup" @click="party.removeHero(i)">✕</button>
        </div>
      </div>

      <div v-if="party.heroes.value.length === 0" class="empty-hint">
        Encara no hi ha cap heroi en aquest grup.
      </div>

      <button type="button" class="add-hero" @click="openNew">+ afegeix un heroi</button>
    </div>

    <div v-if="party.heroes.value.length" class="party-foot">
      {{ party.heroes.value.length }} herois · Σ {{ levelSum }} nivells
    </div>
    </template>

    <HeroEditor
      v-if="editingIndex !== null"
      :hero="editingHero"
      @save="saveHero"
      @cancel="closeEditor"
    />
  </div>
</template>

<style scoped>
.party-roster { display: flex; flex-direction: column; gap: 0.6rem; min-width: 0; }

.picker { display: flex; align-items: center; gap: 0.3rem; }
.party-select {
  flex: 1; min-width: 0;
  font-family: 'MedievalSharp', serif; font-size: 0.9rem;
  background: rgba(0, 0, 0, 0.35); border: 1px solid var(--parchment-dark);
  border-radius: 4px; color: var(--parchment); padding: 0.3rem 0.4rem;
  color-scheme: dark;
}
.party-select option { background: #241c12; color: var(--parchment); }
.icon-btn {
  background: none; border: 1px solid transparent; border-radius: 4px;
  color: var(--parchment-dark); cursor: pointer;
  font-size: 0.9rem; line-height: 1; padding: 0.25rem 0.35rem;
}
.icon-btn:hover { color: var(--parchment); background: rgba(232, 220, 196, 0.1); }

.heroes { display: flex; flex-direction: column; gap: 0.4rem; }
.hero-row {
  display: flex; align-items: flex-start; gap: 0.5rem;
  background: rgba(0, 0, 0, 0.25);
  border: 1px solid rgba(232, 220, 196, 0.12);
  border-left: 4px solid var(--class-color, var(--parchment-dark));
  border-radius: 5px; padding: 0.4rem 0.5rem;
}
.hero-icon {
  width: 1.6rem; height: 1.6rem; flex-shrink: 0; margin-top: 0.1rem;
  filter: invert(85%) sepia(15%) saturate(360%) hue-rotate(2deg) brightness(95%);
}
.hero-main { flex: 1; min-width: 0; }
.hero-name { font-family: 'Cinzel Decorative', serif; color: var(--parchment); font-size: 0.95rem; }
.hero-detail {
  font-family: 'Crimson Text', serif; color: var(--parchment-dark);
  font-size: 0.82rem; overflow-wrap: anywhere;
}
.hero-detail.warn { color: #d9924a; }
.hero-actions { display: flex; flex-direction: column; gap: 0.1rem; }

.pv-inline { display: inline-flex; align-items: center; gap: 0.25rem; }
.pv-input {
  width: 3rem; text-align: center;
  font-family: 'MedievalSharp', serif; font-size: 0.82rem;
  color: var(--parchment); background: rgba(0, 0, 0, 0.35);
  border: 1px solid rgba(232, 220, 196, 0.25); border-radius: 3px;
  padding: 0.05rem 0.15rem;
}
.pv-input:focus { outline: none; border-color: var(--parchment); }
.fatigue-select { width: auto; }

.no-party { display: flex; flex-direction: column; gap: 0.5rem; }

.add-hero {
  font-family: 'MedievalSharp', serif; font-size: 0.9rem;
  color: var(--parchment-dark); background: rgba(0, 0, 0, 0.25);
  border: 1px dashed var(--parchment-dark); border-radius: 5px;
  padding: 0.45rem 0.7rem; cursor: pointer; transition: all 0.15s;
}
.add-hero:hover { color: var(--parchment); border-color: var(--parchment); background: rgba(232, 220, 196, 0.08); }

.empty-hint {
  color: var(--parchment-dark); opacity: 0.7; font-style: italic;
  font-family: 'Crimson Text', serif; font-size: 0.88rem;
  text-align: center; padding: 0.4rem 0;
}
.party-foot {
  text-align: center; font-family: 'Crimson Text', serif; font-style: italic;
  color: var(--parchment-dark); font-size: 0.85rem;
}

/* Class accent, keyed the same way the skill cards are. */
.hero-row.guerrer { --class-color: var(--class-guerrer); }
.hero-row.murri { --class-color: var(--class-murri); }
.hero-row.mag { --class-color: var(--class-mag); }
.hero-row.barbar { --class-color: var(--class-barbar); }
.hero-row.clergue { --class-color: var(--class-clergue); }
.hero-row.monjo { --class-color: var(--class-monjo); }
.hero-row.trobador { --class-color: var(--class-trobador); }
.hero-row.fetiller { --class-color: var(--class-fetiller); }
.hero-row.bruixot { --class-color: var(--class-bruixot); }
.hero-row.paladi { --class-color: var(--class-paladi); }
.hero-row.druida { --class-color: var(--class-druida); }
.hero-row.terra { --class-color: var(--class-terra); }
.hero-row.objecte { --class-color: var(--class-objecte); }
</style>
