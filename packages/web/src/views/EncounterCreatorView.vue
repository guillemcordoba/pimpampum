<script setup lang="ts">
import { ref, computed, watch, onBeforeUnmount } from 'vue';
import { useRouter } from 'vue-router';
import {
  ENEMY_DEFINITIONS, getEnemy, solveEncounter, TARGET_WINRATES,
  type PoolSpec, type SolvedEncounter,
} from '@pimpampum/enemies';
import type { PartySpec } from '@pimpampum/skills';
import type { SolveRequest, SolveReply } from '../workers/solve-worker';
import { setPendingEncounter } from '../composables/pendingEncounter';
import { createTrackerSession } from '../composables/combatTracker';

const base = import.meta.env.BASE_URL;

// --- Inputs -----------------------------------------------------------------
const playerCount = ref(4);
const PLAYER_COUNTS = [3, 4, 5, 6];

// Per-player total skill levels (an input to the balancer's party strength).
// UI default: 5 levels per player (the balancer's calibration reference,
// PLAYER_REF_LEVELS, stays 6 — the input just starts a notch below it).
const DEFAULT_PLAYER_LEVELS = 5;
const playerLevels = ref<number[]>(Array(4).fill(DEFAULT_PLAYER_LEVELS));
// Per-player passive armour (0-2): a balancer input AND what each hero is
// equipped with when combat begins.
const DEFAULT_ARMOR = 1;
const playerArmor = ref<number[]>(Array(4).fill(DEFAULT_ARMOR));
watch(playerCount, n => {
  const pl = playerLevels.value, pa = playerArmor.value;
  playerLevels.value = Array.from({ length: n }, (_, i) => pl[i] ?? DEFAULT_PLAYER_LEVELS);
  playerArmor.value = Array.from({ length: n }, (_, i) => pa[i] ?? DEFAULT_ARMOR);
});
function setPlayerArmor(i: number, value: number) {
  const clamped = Math.max(0, Math.min(2, Math.round(value) || 0));
  playerArmor.value = playerArmor.value.map((a, k) => (k === i ? clamped : a));
}
function setPlayerLevel(i: number, value: number) {
  const clamped = Math.max(1, Math.min(20, Math.round(value) || DEFAULT_PLAYER_LEVELS));
  playerLevels.value = playerLevels.value.map((l, k) => (k === i ? clamped : l));
}

// Target difficulty is an INPUT to the balancer: the players' win probability.
const winrate = ref(Math.round(TARGET_WINRATES.medium * 100));
const PRESETS = [
  { label: 'Fàcil', value: Math.round(TARGET_WINRATES.easy * 100) },
  { label: 'Mitjana', value: Math.round(TARGET_WINRATES.medium * 100) },
  { label: 'Difícil', value: Math.round(TARGET_WINRATES.hard * 100) },
  { label: 'Èpica', value: Math.round(TARGET_WINRATES.boss * 100) },
];

// Composition: which species and how many. Levels are NOT an input — the
// solver produces them (enemies scale by levels; green kits for easy fights).
interface PoolRow { enemyId: string; count: number; }
const pool = ref<PoolRow[]>([
  { enemyId: 'goblin', count: 1 },
]);

const templateOf = (id: string) => getEnemy(id);
const unusedTemplates = computed(() =>
  ENEMY_DEFINITIONS.filter(t => !pool.value.some(p => p.enemyId === t.id)));

function addSpecies(enemyId: string): void {
  const t = getEnemy(enemyId);
  if (!t) return;
  pool.value.push({ enemyId, count: 1 });
}
function removeSpecies(i: number): void {
  pool.value.splice(i, 1);
}
function bump(row: PoolRow, delta: number): void {
  row.count = Math.max(1, row.count + delta);
}

// --- The solve --------------------------------------------------------------
// The balancer PLAYS the encounter a few hundred times rather than predicting
// it from a formula, so a solve costs ~1-2s of solid CPU. That runs in a
// WORKER: on the main thread it froze the page, and — worse — a synchronous
// solve cannot be interrupted, so bumping the enemy count during one meant
// waiting for it to finish before anything responded.
//
// Cancellation is `terminate()`. There is no cooperative abort to ask for: the
// solve is one long synchronous call inside the worker, so killing the worker
// outright is the only thing that actually stops the work.
const solved = ref<SolvedEncounter | null>(null);
const solving = ref(false);
let solveToken = 0;
let solveTimer: ReturnType<typeof setTimeout> | undefined;
let worker: Worker | null = null;

function disposeWorker(): void {
  worker?.terminate();
  worker = null;
}

function runSolve(): void {
  const token = ++solveToken;
  const specs: PoolSpec[] = pool.value.map(p =>
    ({ enemyId: p.enemyId, count: p.count }));
  const party: PartySpec = {
    count: playerCount.value,
    levels: [...playerLevels.value],
    armor: [...playerArmor.value],
  };
  const target = winrate.value / 100;
  if (specs.length === 0) { solved.value = null; solving.value = false; return; }
  solving.value = true;

  // A previous solve may still be burning CPU — kill it before starting another.
  disposeWorker();
  try {
    worker = new Worker(new URL('../workers/solve-worker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (event: MessageEvent<SolveReply>) => {
      const reply = event.data;
      if (reply.id !== token) return;          // a newer solve superseded this one
      solved.value = reply.ok ? reply.result : null;
      solving.value = false;
      disposeWorker();
    };
    worker.onerror = () => {
      // Fall back to solving inline rather than leaving the panel spinning.
      disposeWorker();
      if (token !== solveToken) return;
      solved.value = solveEncounter(specs, party, target);
      solving.value = false;
    };
    const request: SolveRequest = { id: token, pool: specs, party, target };
    worker.postMessage(request);
  } catch {
    // No worker support: solve inline. The page will hitch, but it still works.
    const result = solveEncounter(specs, party, target);
    if (token !== solveToken) return;
    solved.value = result;
    solving.value = false;
  }
}

watch(
  [pool, playerCount, playerLevels, playerArmor, winrate],
  () => {
    // Invalidate and STOP whatever is in flight, so a run of rapid clicks does
    // not queue up solves behind each other.
    solveToken++;
    disposeWorker();
    solving.value = true;
    clearTimeout(solveTimer);
    solveTimer = setTimeout(runSolve, 350);
  },
  { deep: true, immediate: true },
);

// Leaving the page mid-solve must not leave a worker chewing CPU.
onBeforeUnmount(() => {
  clearTimeout(solveTimer);
  disposeWorker();
});

const predictedPct = computed(() =>
  solved.value ? Math.round(solved.value.predictedWinrate * 100) : null);
/** 1σ sampling error of the simulated winrate, in points. */
const marginPct = computed(() =>
  solved.value ? Math.max(1, Math.round(solved.value.stderr * 100)) : null);
// Flag when the achievable winrate drifts from the request by more than the
// simulation's own error bar — i.e. a real miss, not sampling noise.
const clamped = computed(() =>
  solved.value !== null
  && Math.abs(solved.value.predictedWinrate - solved.value.targetWinrate)
     > Math.max(0.02, 2 * solved.value.stderr));

// Hand the solved encounter to the combat view: its enemy roster arrives
// pre-filled; the players are created there as usual.
const router = useRouter();
function playEncounter(): void {
  if (!solved.value) return;
  setPendingEncounter(solved.value, [...playerLevels.value], [...playerArmor.value]);
  router.push({ name: 'ai-combat' });
}

// --- Running it at a real table ---------------------------------------------
// The other way to start: not a simulated fight but a combat tracker for a GM
// running it by hand — the enemy cards and a PV tracker per body, persisted
// under a random id that also sits in the URL. It then shows up under
// «Combats contra els jugadors».
function openTracker(): void {
  if (!solved.value) return;
  const session = createTrackerSession({ encounter: solved.value });
  router.push({ name: 'tracker', params: { id: session.id } });
}
</script>

<template>
  <div class="creator-page">
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

        <div class="subhead spaced">Nivells dels jugadors</div>
        <div class="levels-row">
          <input
            v-for="(l, i) in playerLevels" :key="i"
            type="number" min="1" max="20" class="level-input"
            :value="l"
            title="Suma de nivells d'habilitat del jugador"
            @input="setPlayerLevel(i, Number(($event.target as HTMLInputElement).value))"
          >
        </div>
        <div class="winrate-caption">suma de nivells d'habilitat de cada jugador</div>

        <div class="subhead spaced">Armadura dels jugadors</div>
        <div class="levels-row">
          <input
            v-for="(a, i) in playerArmor" :key="i"
            type="number" min="0" max="2" class="level-input"
            :value="a"
            title="Armadura passiva del jugador (0-2)"
            @input="setPlayerArmor(i, Number(($event.target as HTMLInputElement).value))"
          >
        </div>
        <div class="winrate-caption">armadura passiva (0-2); els herois l'equipen al combat</div>

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
            v-for="(p, i) in pool" :key="p.enemyId"
            class="pool-row"
            :style="{ '--class-color': `var(--class-${templateOf(p.enemyId)?.classCss})` }"
          >
            <img :src="base + (templateOf(p.enemyId)?.iconPath ?? '')" alt="">
            <div class="pool-name">{{ templateOf(p.enemyId)?.displayName }}</div>

            <div class="pool-count">
              <button type="button" class="step" @click="bump(p, -1)">−</button>
              <span class="count-num">{{ p.count }}</span>
              <button type="button" class="step" @click="bump(p, +1)">+</button>
            </div>

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

        <div v-if="solving" class="result-solving">
          <span class="spinner"></span>
          Simulant l'encontre…
        </div>

        <template v-else-if="solved">
          <div class="result-groups">
            <div
              v-for="g in solved.groups" :key="g.enemyId"
              class="result-row"
              :style="{ '--class-color': `var(--class-${templateOf(g.enemyId)?.classCss})` }"
            >
              <img :src="base + (templateOf(g.enemyId)?.iconPath ?? '')" alt="">
              <span class="result-count">{{ g.count }}×</span>
              <span class="result-name">{{ templateOf(g.enemyId)?.displayName }}</span>
              <span class="result-detail">
                nivell <strong>{{ g.level }}</strong> · <strong>{{ g.pv }}</strong> PV cadascun
              </span>
            </div>
          </div>

          <div class="result-meta">
            <span :class="{ warn: clamped }">
              Probabilitat de victòria mesurada:
              <strong>{{ predictedPct }}%</strong> <span class="margin">±{{ marginPct }}</span>
              <template v-if="clamped"> (el creador no ha pogut ajustar-se més al {{ winrate }}% demanat)</template>
            </span>
            · Durada mitjana: <strong>{{ solved.avgRounds.toFixed(1) }}</strong> rondes
          </div>
          <p class="result-note">
            Mesurada jugant l'encontre {{ solved.games }} vegades contra un grup
            com el teu, no estimada amb una fórmula.
          </p>

          <div class="start-buttons">
            <button type="button" class="play-btn" @click="playEncounter">
              ⚔ Combat contra la IA
            </button>
            <button type="button" class="play-btn tracker" @click="openTracker">
              📋 Combat contra els jugadors
            </button>
          </div>
        </template>
        <div v-else class="result-empty">Afegeix enemics per veure l'encontre.</div>
      </section>
    </div>
  </div>
</template>

<style scoped>
/* Sizes to the height it is given, never to the viewport: the three columns
   stretch to fill it and each scrolls on its own if its content is long, so
   the page itself never grows a scrollbar. */
.creator-page {
  height: 100%; min-height: 0; max-width: 1250px; margin: 0 auto;
  display: flex; flex-direction: column;
}

.layout {
  flex: 1; min-height: 0;
  display: grid; grid-template-columns: repeat(3, minmax(0, 1fr));
  /* One row, capped at the container: `minmax(0, 1fr)` lets it shrink below
     its content so a long column scrolls instead of growing the page. */
  grid-template-rows: minmax(0, 1fr);
  justify-content: center;
  gap: 1.5rem;
  /* Each panel ends where its content ends — no boxes stretched to the
     tallest column — while still never spilling past the screen. */
  align-items: start;
}
.column {
  min-height: 0; max-height: 100%; overflow-y: auto;
  background: rgba(0, 0, 0, 0.14);
  border: 1px solid rgba(232, 220, 196, 0.25);
  border-radius: 8px; padding: 1rem 1.2rem 1.4rem;
}
/* Declared AFTER .column: a media query adds no specificity, so the override
   only wins by coming later. */
@media (max-width: 1100px) {
  /* Two columns can't share one screen height sensibly: let the page scroll. */
  .creator-page { height: auto; }
  .layout { grid-template-columns: 1fr 1fr; grid-template-rows: none; }
  .layout .result { grid-column: 1 / -1; }
  .column { max-height: none; overflow-y: visible; }
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

.levels-row { display: flex; flex-wrap: wrap; gap: 0.4rem; justify-content: center; }
.level-input {
  width: 3.2rem; text-align: center;
  font-family: 'MedievalSharp', serif; font-size: 0.95rem;
  color: var(--parchment); background: rgba(0, 0, 0, 0.25);
  border: 1px solid var(--parchment-dark); border-radius: 4px;
  padding: 0.3rem 0.2rem;
}
.level-input:focus { outline: none; border-color: var(--parchment); }

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
.result-meta .margin { font-size: 0.85em; opacity: 0.75; }

.result-note {
  text-align: center; font-family: 'Crimson Text', serif; font-style: italic;
  color: var(--parchment-dark); opacity: 0.75; font-size: 0.88rem;
  margin: 0.35rem 0 0;
}

.result-solving {
  display: flex; align-items: center; justify-content: center; gap: 0.6rem;
  font-family: 'Crimson Text', serif; font-style: italic;
  color: var(--parchment-dark); padding: 2rem 0;
}
.spinner {
  width: 14px; height: 14px; border-radius: 50%;
  border: 2px solid var(--parchment-dark); border-top-color: transparent;
  animation: spin 0.7s linear infinite;
}
@keyframes spin { to { transform: rotate(360deg); } }
@media (prefers-reduced-motion: reduce) { .spinner { animation-duration: 2s; } }

.start-buttons {
  display: flex; flex-wrap: wrap; gap: 0.7rem; justify-content: center; margin-top: 1.2rem;
}
.play-btn {
  font-family: 'Cinzel Decorative', serif; font-size: 1.05rem;
  color: var(--parchment); background: rgba(232, 220, 196, 0.12);
  border: 1px solid var(--parchment); border-radius: 6px;
  padding: 0.55rem 1.4rem; cursor: pointer; transition: all 0.15s;
}
.play-btn:hover { background: rgba(232, 220, 196, 0.22); }
.play-btn.tracker { background: rgba(0, 0, 0, 0.25); border-color: var(--parchment-dark); }
.play-btn.tracker:hover { border-color: var(--parchment); background: rgba(232, 220, 196, 0.16); }

/* Stacked on a phone there is no height to share out: let the page scroll
   normally instead of squeezing three columns into one screen. */
@media (max-width: 760px) {
  .creator-page { height: auto; }
  .layout { grid-template-columns: 1fr; gap: 1.2rem; }
  .column { overflow-y: visible; }
}
</style>
