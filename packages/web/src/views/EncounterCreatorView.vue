<script setup lang="ts">
import { ref, computed } from 'vue';
import {
  ENEMY_TEMPLATES, solveEncounter, classifyScore, winrateForRatio,
  type PoolSpec,
} from '@pimpampum/enemies';

const base = import.meta.env.BASE_URL;

// --- Inputs -----------------------------------------------------------------
// Party: each player's HIGHEST skill level (sums/averages don't predict strength).
const playerTopLevels = ref<number[]>([40, 40, 40, 40]);
// Desired player win rate (%) — drives the score budget via the measured
// logistic response curve.
const winrate = ref(65);
// Composition: which species and how many of each (the DM's creative input).
const pool = ref<{ templateId: string; count: number }[]>([
  { templateId: 'goblin', count: 4 },
]);

function addPlayer(): void {
  playerTopLevels.value.push(playerTopLevels.value[playerTopLevels.value.length - 1] ?? 40);
}
function removePlayer(i: number): void {
  if (playerTopLevels.value.length > 1) playerTopLevels.value.splice(i, 1);
}

const unusedTemplates = computed(() =>
  ENEMY_TEMPLATES.filter(t => !pool.value.some(p => p.templateId === t.id)));

function addSpecies(templateId: string): void {
  if (!templateId) return;
  const t = ENEMY_TEMPLATES.find(x => x.id === templateId);
  if (!t) return;
  pool.value.push({ templateId, count: t.role === 'solitari' ? 1 : 3 });
}
function removeSpecies(i: number): void {
  pool.value.splice(i, 1);
}
function bump(i: number, delta: number): void {
  pool.value[i].count = Math.max(1, pool.value[i].count + delta);
}

// --- The solve: composition + party + difficulty → levels & PV ---------------
const solved = computed(() => {
  const specs: PoolSpec[] = pool.value
    .map(p => ({ template: ENEMY_TEMPLATES.find(t => t.id === p.templateId)!, count: p.count }))
    .filter(p => p.template);
  return solveEncounter(specs, playerTopLevels.value, winrate.value / 100);
});
const band = computed(() => classifyScore(solved.value.score, solved.value.target));
// After level clamps, what win rate did we actually land on?
const achievedWinrate = computed(() => 100 * winrateForRatio(solved.value.ratio));
const templateOf = (id: string) => ENEMY_TEMPLATES.find(t => t.id === id);
</script>

<template>
  <div class="creator-page">
    <p class="screen-subtitle">
      Tria quants jugadors (amb la seva habilitat més alta), la dificultat i quins enemics (i quants) hi ha: el creador et diu el nivell i els PV de cadascun.
    </p>

    <div class="layout">
      <!-- Left: the party and the fight they want -->
      <section class="column">
        <h2 class="col-title">Jugadors</h2>

        <div class="subhead">Habilitat més alta de cadascú</div>
        <div class="party-row">
          <span v-for="(lvl, i) in playerTopLevels" :key="i" class="player-chip">
            <input v-model.number="playerTopLevels[i]" type="number" min="1" max="300" class="num">
            <button type="button" class="chip-x" title="Treu el jugador" @click="removePlayer(i)">×</button>
          </span>
          <button type="button" class="add-btn" @click="addPlayer">+ jugador</button>
        </div>

        <div class="subhead spaced">Probabilitat de victòria dels jugadors</div>
        <div class="winrate-row">
          <input v-model.number="winrate" type="range" min="0" max="100" step="5" class="winrate-slider">
          <span class="winrate-value">{{ winrate }}%</span>
        </div>
      </section>

      <!-- Right: the enemies and the difficulty that comes out -->
      <section class="column">
        <h2 class="col-title">Enemics</h2>

        <div class="pool">
          <div v-for="(p, i) in pool" :key="p.templateId" class="pool-row" :class="templateOf(p.templateId)?.classCss">
            <img :src="base + (templateOf(p.templateId)?.iconPath ?? '')" alt="">
            <div class="pool-count">
              <button type="button" class="step" @click="bump(i, -1)">−</button>
              <span class="count-num">{{ p.count }}</span>
              <button type="button" class="step" @click="bump(i, +1)">+</button>
            </div>
            <div class="pool-name">{{ templateOf(p.templateId)?.displayName }}</div>
            <div class="pool-solved" v-if="solved.groups.find(g => g.templateId === p.templateId)">
              nivell <strong>{{ solved.groups.find(g => g.templateId === p.templateId)!.level }}</strong>
              · <strong>{{ solved.groups.find(g => g.templateId === p.templateId)!.pv }}</strong> PV cadascun
            </div>
            <button type="button" class="chip-x" title="Treu aquest enemic" @click="removeSpecies(i)">×</button>
          </div>

          <div class="add-species">
            <select class="txt" @change="addSpecies(($event.target as HTMLSelectElement).value); ($event.target as HTMLSelectElement).value = ''">
              <option value="">+ afegeix un tipus d'enemic…</option>
              <option v-for="t in unusedTemplates" :key="t.id" :value="t.id">{{ t.displayName }}</option>
            </select>
          </div>
        </div>

        <div class="gauge" v-if="solved.groups.length">
          <div class="subhead spaced">Dificultat</div>
          <div class="gauge-line">
            Puntuació de l'encontre: <strong>{{ solved.score }}</strong>
            · lluita igualada per aquest grup: <strong>{{ Math.round(solved.target) }}</strong>
          </div>
          <div class="gauge-bar">
            <div class="gauge-fill" :class="band.id" :style="{ width: Math.min(100, 100 * band.ratio / 1.5) + '%' }"></div>
            <div class="gauge-even" :style="{ left: (100 / 1.5) + '%' }"></div>
          </div>
          <div class="gauge-band">
            Resultat: <strong>{{ band.label }}</strong>
            · victòria dels jugadors estimada: <strong>~{{ achievedWinrate.toFixed(0) }}%</strong>
          </div>
        </div>
      </section>
    </div>
  </div>
</template>

<style scoped>
.creator-page { padding: 1rem; max-width: 980px; margin: 0 auto; }

.layout {
  display: grid; grid-template-columns: minmax(260px, 2fr) 3fr;
  gap: 2rem; align-items: start; margin-top: 1.5rem;
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

.party-row { display: flex; flex-wrap: wrap; gap: 0.4rem; align-items: center; justify-content: center; }
.player-chip {
  display: inline-flex; align-items: center; gap: 0.15rem;
  background: rgba(0, 0, 0, 0.25); border: 1px solid var(--parchment-dark);
  border-radius: 4px; padding: 0.15rem 0.3rem;
}
.num {
  width: 3.4rem; background: transparent; border: none; color: var(--parchment);
  font-family: 'MedievalSharp', serif; font-size: 1rem; text-align: center;
}
.num:focus { outline: 1px solid var(--parchment); }
.chip-x { background: none; border: none; color: var(--parchment-dark); cursor: pointer; font-size: 1rem; padding: 0 0.2rem; }
.chip-x:hover { color: var(--parchment); }
.add-btn, .diff-btn {
  font-family: 'MedievalSharp', serif; font-size: 0.95rem;
  color: var(--parchment-dark); background: rgba(0, 0, 0, 0.2);
  border: 1px solid var(--parchment-dark); border-radius: 4px;
  padding: 0.3rem 0.7rem; cursor: pointer; transition: all 0.15s;
}
.add-btn:hover, .diff-btn:hover { color: var(--parchment); }
.winrate-row { display: flex; align-items: center; gap: 0.7rem; justify-content: center; }
.winrate-slider { width: 220px; accent-color: var(--parchment); }
.winrate-value {
  font-family: 'MedievalSharp', serif; color: var(--parchment);
  font-size: 1.15rem; min-width: 3.2ch; text-align: right;
}

.pool { display: flex; flex-direction: column; gap: 0.5rem; }
.pool-row {
  display: flex; align-items: center; gap: 0.8rem;
  background: rgba(0, 0, 0, 0.22);
  border: 1px solid var(--parchment-dark);
  border-left: 4px solid var(--class-color, var(--parchment-dark));
  border-radius: 6px; padding: 0.5rem 0.8rem;
}
.pool-row img { width: 36px; height: 36px; filter: invert(85%) sepia(15%) saturate(360%) hue-rotate(2deg) brightness(95%); }
.pool-count { display: flex; align-items: center; gap: 0.35rem; }
.step {
  width: 1.6rem; height: 1.6rem; border-radius: 4px; cursor: pointer;
  color: var(--parchment); background: rgba(0, 0, 0, 0.3); border: 1px solid var(--parchment-dark);
  font-size: 1rem; line-height: 1;
}
.count-num { font-family: 'MedievalSharp', serif; color: var(--parchment); min-width: 1.4ch; text-align: center; font-size: 1.1rem; }
.pool-name { font-family: 'Cinzel Decorative', serif; color: var(--parchment); flex: 1; }
.pool-solved { font-family: 'Crimson Text', serif; color: var(--parchment-dark); }
.pool-solved strong { color: var(--parchment); }

.add-species .txt {
  width: 100%; padding: 0.5rem 0.7rem;
  font-family: 'MedievalSharp', serif; font-size: 0.95rem;
  color: var(--parchment-dark); background: rgba(0, 0, 0, 0.25);
  border: 1px dashed var(--parchment-dark); border-radius: 4px;
  color-scheme: dark;
}
.add-species .txt option { background: #241c12; color: var(--parchment); }

.gauge { margin-top: 0.5rem; }
.gauge-line, .gauge-band {
  text-align: center; font-family: 'Crimson Text', serif; color: var(--parchment-dark);
  margin: 0.4rem 0;
}
.gauge-line strong, .gauge-band strong { color: var(--parchment); }
.gauge-bar {
  position: relative; height: 14px; border-radius: 7px; overflow: hidden;
  background: rgba(0, 0, 0, 0.35); border: 1px solid var(--parchment-dark);
}
.gauge-fill { height: 100%; transition: width 0.2s; }
.gauge-fill.trivial { background: #4a6b4a; }
.gauge-fill.easy { background: #5a7b4a; }
.gauge-fill.medium { background: #8b7b3a; }
.gauge-fill.hard { background: #9c5a1f; }
.gauge-fill.boss { background: #8b2c2c; }
.gauge-fill.deadly { background: #5c1a1a; }
.gauge-even { position: absolute; top: 0; bottom: 0; width: 2px; background: var(--parchment); opacity: 0.8; }

.pool-row.goblin { --class-color: var(--class-goblin); }
.pool-row.goblin-shaman { --class-color: var(--class-goblin-shaman); }
.pool-row.llop { --class-color: var(--class-llop); }
.pool-row.diable-espinos { --class-color: var(--class-diable-espinos); }
.pool-row.diable-dos { --class-color: var(--class-diable-dos); }
.pool-row.diable-banyut { --class-color: var(--class-diable-banyut); }
.pool-row.golem-de-pedra { --class-color: var(--class-golem-de-pedra); }
.pool-row.basilisc { --class-color: var(--class-basilisc); }

@media (max-width: 760px) { .layout { grid-template-columns: 1fr; gap: 1.2rem; } }
</style>
