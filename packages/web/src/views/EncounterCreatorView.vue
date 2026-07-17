<script setup lang="ts">
import { ref, computed } from 'vue';
import {
  ENEMY_TEMPLATES, getEnemyTemplate, solveEncounter, TARGET_WINRATES,
  type PoolSpec,
} from '@pimpampum/enemies';

const base = import.meta.env.BASE_URL;

// --- Inputs -----------------------------------------------------------------
const playerCount = ref(4);
const PLAYER_COUNTS = [3, 4, 5, 6];

// Target difficulty is an INPUT to the balancer: the players' win probability.
const winrate = ref(Math.round(TARGET_WINRATES.medium * 100));
const PRESETS = [
  { label: 'Fàcil', value: Math.round(TARGET_WINRATES.easy * 100) },
  { label: 'Mitjana', value: Math.round(TARGET_WINRATES.medium * 100) },
  { label: 'Difícil', value: Math.round(TARGET_WINRATES.hard * 100) },
  { label: 'Èpica', value: Math.round(TARGET_WINRATES.boss * 100) },
];

// Composition: which species, how many (starts at 1), at which level.
interface PoolRow { templateId: string; count: number; level: number; }
const pool = ref<PoolRow[]>([
  { templateId: 'goblin', count: 1, level: getEnemyTemplate('goblin')?.suggestedLevel ?? 1 },
]);

const templateOf = (id: string) => getEnemyTemplate(id);
const unusedTemplates = computed(() =>
  ENEMY_TEMPLATES.filter(t => !pool.value.some(p => p.templateId === t.id)));

function addSpecies(templateId: string): void {
  const t = getEnemyTemplate(templateId);
  if (!t) return;
  pool.value.push({ templateId, count: 1, level: t.suggestedLevel });
}
function removeSpecies(i: number): void {
  pool.value.splice(i, 1);
}
function bump(row: PoolRow, delta: number): void {
  row.count = Math.max(1, row.count + delta);
}
function levelOptions(templateId: string): number[] {
  const kit = templateOf(templateId)?.suggestedLevel ?? 1;
  return Array.from({ length: kit }, (_, i) => i + 1);
}

// --- The solve (pure & cheap: recomputed on every input change) --------------
const solved = computed(() => {
  const specs: PoolSpec[] = pool.value.map(p =>
    ({ templateId: p.templateId, count: p.count, level: p.level }));
  return solveEncounter(specs, playerCount.value, winrate.value / 100);
});

const predictedPct = computed(() =>
  solved.value ? Math.round(solved.value.predictedWinrate * 100) : null);
// The solver clamps (levels, body counts, PV multiplier); highlight when the
// achievable winrate drifts more than 2 pp from the requested one.
const clamped = computed(() =>
  solved.value !== null &&
  Math.abs(solved.value.predictedWinrate - solved.value.targetWinrate) > 0.02);
</script>

<template>
  <div class="creator-page">
    <p class="screen-subtitle">
      Tria quants jugadors, la dificultat i quins enemics: el creador et diu quants en surten i amb quins PV.
    </p>

    <div class="layout">
      <!-- Left: the party and the fight they want -->
      <section class="column">
        <h2 class="col-title">Els jugadors</h2>

        <div class="subhead">Nombre de jugadors</div>
        <div class="choice-row">
          <button
            v-for="n in PLAYER_COUNTS" :key="n" type="button"
            class="choice-btn" :class="{ active: playerCount === n }"
            @click="playerCount = n"
          >{{ n }}</button>
        </div>

        <div class="subhead spaced">Dificultat</div>
        <div class="choice-row">
          <button
            v-for="p in PRESETS" :key="p.label" type="button"
            class="choice-btn" :class="{ active: winrate === p.value }"
            @click="winrate = p.value"
          >{{ p.label }}</button>
        </div>

        <div class="winrate-row">
          <input v-model.number="winrate" type="range" min="5" max="95" step="5" class="winrate-slider">
          <span class="winrate-value">{{ winrate }}%</span>
        </div>
        <div class="winrate-caption">probabilitat de victòria dels jugadors</div>
      </section>

      <!-- Right: the species pool -->
      <section class="column">
        <h2 class="col-title">Enemics</h2>

        <div class="pool">
          <div
            v-for="(p, i) in pool" :key="p.templateId"
            class="pool-row"
            :style="{ '--class-color': `var(--class-${templateOf(p.templateId)?.classCss})` }"
          >
            <img :src="base + (templateOf(p.templateId)?.iconPath ?? '')" alt="">
            <div class="pool-name">{{ templateOf(p.templateId)?.displayName }}</div>

            <div class="pool-count">
              <button type="button" class="step" @click="bump(p, -1)">−</button>
              <span class="count-num">{{ p.count }}</span>
              <button type="button" class="step" @click="bump(p, +1)">+</button>
            </div>

            <span class="level-label">nivell</span>
            <select v-model.number="p.level" class="level-select" title="Nivell (accions que coneix)">
              <option v-for="l in levelOptions(p.templateId)" :key="l" :value="l">{{ l }}</option>
            </select>

            <button type="button" class="chip-x" title="Treu aquest enemic" @click="removeSpecies(i)">×</button>
          </div>

          <div class="add-species">
            <select
              class="txt"
              @change="addSpecies(($event.target as HTMLSelectElement).value); ($event.target as HTMLSelectElement).value = ''"
            >
              <option value="">+ afegeix un tipus d'enemic…</option>
              <option v-for="t in unusedTemplates" :key="t.id" :value="t.id">{{ t.displayName }}</option>
            </select>
          </div>
        </div>
      </section>

      <!-- The solved encounter -->
      <section class="column result">
        <h2 class="col-title">Encontre</h2>

        <template v-if="solved">
          <div class="result-groups">
            <div
              v-for="g in solved.groups" :key="g.templateId"
              class="result-row"
              :style="{ '--class-color': `var(--class-${templateOf(g.templateId)?.classCss})` }"
            >
              <img :src="base + (templateOf(g.templateId)?.iconPath ?? '')" alt="">
              <span class="result-count">{{ g.count }}×</span>
              <span class="result-name">{{ templateOf(g.templateId)?.displayName }}</span>
              <span class="result-detail">
                <template v-if="g.level < (templateOf(g.templateId)?.suggestedLevel ?? g.level)">
                  nivell <strong>{{ g.level }}</strong> (coneix les primeres {{ g.level }} accions) ·
                </template>
                <strong>{{ g.pv }}</strong> PV cadascun
              </span>
            </div>
          </div>

          <div class="result-meta">
            <span :class="{ warn: clamped }">
              Probabilitat de victòria prevista: <strong>{{ predictedPct }}%</strong>
              <template v-if="clamped"> (el creador no ha pogut ajustar-se més al {{ winrate }}% demanat)</template>
            </span>
            · Multiplicador de PV: <strong>×{{ solved.pvMult.toFixed(2) }}</strong>
          </div>
        </template>
        <div v-else class="result-empty">Afegeix enemics per veure l'encontre.</div>
      </section>
    </div>
  </div>
</template>

<style scoped>
.creator-page { padding: 1rem 2rem; max-width: 1500px; margin: 0 auto; }

.layout {
  display: grid; grid-template-columns: minmax(240px, 1fr) minmax(320px, 1.5fr) minmax(320px, 1.5fr);
  gap: 2rem; align-items: start; margin-top: 1.5rem;
}
@media (max-width: 1100px) {
  .layout { grid-template-columns: 1fr 1fr; }
  .layout .result { grid-column: 1 / -1; }
}
.column {
  background: rgba(0, 0, 0, 0.14);
  border: 1px solid rgba(232, 220, 196, 0.25);
  border-radius: 8px; padding: 1rem 1.2rem 1.4rem;
}
.col-title {
  font-family: 'Cinzel Decorative', serif; color: var(--parchment);
  text-align: center; font-size: 1.25rem; margin: 0.2rem 0 1rem;
}
.subhead { font-family: 'MedievalSharp', serif; color: var(--parchment); margin-bottom: 0.5rem; text-align: center; }
.subhead.spaced { margin-top: 1.4rem; }

.choice-row { display: flex; flex-wrap: wrap; gap: 0.4rem; justify-content: center; }
.choice-btn {
  font-family: 'MedievalSharp', serif; font-size: 0.95rem;
  color: var(--parchment-dark); background: rgba(0, 0, 0, 0.2);
  border: 1px solid var(--parchment-dark); border-radius: 4px;
  padding: 0.3rem 0.8rem; cursor: pointer; transition: all 0.15s;
}
.choice-btn:hover { color: var(--parchment); }
.choice-btn.active {
  color: var(--parchment); background: rgba(232, 220, 196, 0.18);
  border-color: var(--parchment);
}

.winrate-row { display: flex; align-items: center; gap: 0.7rem; justify-content: center; margin-top: 1rem; }
.winrate-slider { width: 220px; accent-color: var(--parchment); }
.winrate-value {
  font-family: 'MedievalSharp', serif; color: var(--parchment);
  font-size: 1.15rem; min-width: 3.2ch; text-align: right;
}
.winrate-caption {
  text-align: center; font-family: 'Crimson Text', serif; font-style: italic;
  color: var(--parchment-dark); font-size: 0.9rem; margin-top: 0.2rem;
}

.pool { display: flex; flex-direction: column; gap: 0.5rem; }
.pool-row {
  display: flex; align-items: center; gap: 0.7rem;
  background: rgba(0, 0, 0, 0.22);
  border: 1px solid var(--parchment-dark);
  border-left: 4px solid var(--class-color, var(--parchment-dark));
  border-radius: 6px; padding: 0.5rem 0.8rem;
}
.pool-row img { width: 36px; height: 36px; filter: invert(85%) sepia(15%) saturate(360%) hue-rotate(2deg) brightness(95%); }
.pool-name { font-family: 'Cinzel Decorative', serif; color: var(--parchment); flex: 1; }
.pool-count { display: flex; align-items: center; gap: 0.35rem; }
.step {
  width: 1.6rem; height: 1.6rem; border-radius: 4px; cursor: pointer;
  color: var(--parchment); background: rgba(0, 0, 0, 0.3); border: 1px solid var(--parchment-dark);
  font-size: 1rem; line-height: 1;
}
.count-num { font-family: 'MedievalSharp', serif; color: var(--parchment); min-width: 1.4ch; text-align: center; font-size: 1.1rem; }
.chip-x { background: none; border: none; color: var(--parchment-dark); cursor: pointer; font-size: 1rem; padding: 0 0.2rem; }
.chip-x:hover { color: var(--parchment); }

.level-label {
  font-family: 'Crimson Text', serif; font-style: italic;
  color: var(--parchment-dark); font-size: 0.9rem;
}
.level-select, .add-species .txt {
  font-family: 'MedievalSharp', serif; font-size: 0.9rem;
  color: var(--parchment-dark); background: rgba(0, 0, 0, 0.25);
  border: 1px solid var(--parchment-dark); border-radius: 4px;
  padding: 0.25rem 0.4rem; color-scheme: dark;
}
.level-select option, .add-species .txt option { background: #241c12; color: var(--parchment); }
.add-species .txt { width: 100%; padding: 0.5rem 0.7rem; border-style: dashed; font-size: 0.95rem; }

.result-empty {
  text-align: center; font-family: 'Crimson Text', serif; font-style: italic;
  color: var(--parchment-dark); padding: 1rem 0;
}
.result-groups { display: flex; flex-direction: column; gap: 0.5rem; }
.result-row {
  display: flex; align-items: center; gap: 0.7rem;
  background: rgba(0, 0, 0, 0.22);
  border: 1px solid var(--parchment-dark);
  border-left: 4px solid var(--class-color, var(--parchment-dark));
  border-radius: 6px; padding: 0.5rem 0.8rem;
}
.result-row img { width: 32px; height: 32px; filter: invert(85%) sepia(15%) saturate(360%) hue-rotate(2deg) brightness(95%); }
.result-count { font-family: 'MedievalSharp', serif; color: var(--parchment); font-size: 1.15rem; min-width: 2.2ch; text-align: right; }
.result-name { font-family: 'Cinzel Decorative', serif; color: var(--parchment); flex: 1; }
.result-detail { font-family: 'Crimson Text', serif; color: var(--parchment-dark); }
.result-detail strong { color: var(--parchment); }

.result-meta {
  text-align: center; font-family: 'Crimson Text', serif; color: var(--parchment-dark);
  margin-top: 0.9rem;
}
.result-meta strong { color: var(--parchment); }
.result-meta .warn, .result-meta .warn strong { color: #d9924a; }

@media (max-width: 760px) { .layout { grid-template-columns: 1fr; gap: 1.2rem; } }
</style>
