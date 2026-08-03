<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { useRoute } from 'vue-router';
import { getEnemy } from '@pimpampum/enemies';
import { useTrackerSession, bodyName } from '../composables/combatTracker';
import PvTracker from '../components/tracker/PvTracker.vue';

const base = import.meta.env.BASE_URL;
const route = useRoute();

const id = computed(() => String(route.params.id ?? ''));
// Read-only: this screen only ever FOLLOWS the GM's tab (via the `storage`
// event), so it can sit on a projector without anyone touching it.
const { session, missing } = useTrackerSession(id, false);

const defOf = (enemyId: string) => getEnemy(enemyId);

/** Every enemy body, flattened — the players see bodies, not groups.
 *  The label comes from `bodyName()`, the same helper the GM's screen uses, so
 *  renaming a group on the tracker shows up here without anything being copied
 *  between the two. */
const bodies = computed(() =>
  session.value?.groups.flatMap(g =>
    g.bodies.map((b, i) => ({ ...b, enemyId: g.enemyId, label: bodyName(g, i) }))) ?? []);

// --- Fitting the board -------------------------------------------------------
// This screen is read from across a table, so the tiles should be as large as
// the room allows: one enemy fills the board, and the grid only shrinks when
// there are enough bodies to force it. A fixed `auto-fit` track can't do that —
// it sizes to a guess, not to how many enemies there are — so the layout is
// solved against the measured board instead, on both axes.

const boardEl = ref<HTMLElement | null>(null);
const boardW = ref(0);
const boardH = ref(0);

let observer: ResizeObserver | null = null;
onMounted(() => {
  if (!boardEl.value) return;
  observer = new ResizeObserver(([entry]) => {
    boardW.value = entry.contentRect.width;
    boardH.value = entry.contentRect.height;
  });
  observer.observe(boardEl.value);
});
onBeforeUnmount(() => observer?.disconnect());

const GAP = 20;              // px, matches the grid gap
const TILE_ASPECT = 1.05;    // a tile is about as wide as it is tall
const MIN_TILE = 150;        // px; past this the board scrolls instead

/**
 * How many columns make the tiles biggest? Try every split and keep the one
 * whose cell is largest once BOTH axes are honoured — the same reason a photo
 * grid picks 3×2 over 6×1 on a wide screen but flips on a narrow one.
 */
const layout = computed(() => {
  const n = bodies.value.length;
  if (n === 0) return { cols: 1, rows: 1, cell: MIN_TILE };
  const w = boardW.value, h = boardH.value;
  if (w <= 0 || h <= 0) return { cols: Math.min(n, 3), rows: Math.ceil(n / 3), cell: MIN_TILE };

  let best = { cols: n, rows: 1, cell: 0 };
  for (let cols = 1; cols <= n; cols++) {
    const rows = Math.ceil(n / cols);
    const cellW = (w - GAP * (cols - 1)) / cols;
    const cellH = (h - GAP * (rows - 1)) / rows;
    // Score by the tile height a cell of this shape can actually hold.
    const cell = Math.min(cellW / TILE_ASPECT, cellH);
    if (cell > best.cell) best = { cols, rows, cell };
  }
  return { ...best, cell: Math.max(MIN_TILE, best.cell) };
});

/** Everything inside a tile scales with it, so one enemy reads from the back
 *  of the room and twelve still fit. 190px is the tile's natural size. */
const tileScale = computed(() =>
  Math.max(0.75, Math.min(4, layout.value.cell / 190)));

const gridStyle = computed(() => ({
  gridTemplateColumns: `repeat(${layout.value.cols}, minmax(0, 1fr))`,
  gridTemplateRows: `repeat(${layout.value.rows}, minmax(${MIN_TILE}px, 1fr))`,
  '--tile-scale': String(tileScale.value),
}));
</script>

<template>
  <div v-if="session" class="board">
    <section ref="boardEl" class="enemies" :style="gridStyle">
      <div
        v-for="b in bodies" :key="b.uid"
        class="enemy-tile"
        :class="{ down: b.currentPV <= 0 }"
        :style="{ '--class-color': `var(--class-${defOf(b.enemyId)?.classCss})` }"
      >
        <img class="enemy-icon" :src="base + (defOf(b.enemyId)?.iconPath ?? '')" alt="">
        <div class="enemy-name">{{ b.label }}</div>

        <div v-if="b.currentPV <= 0" class="downed">Abatut</div>

        <!-- PV revealed: the whole bar. Hidden: only the damage it has taken,
             which never leaks how much more it can still take. -->
        <PvTracker
          v-else-if="session.revealPV"
          class="tile-tracker" large readonly
          :current="b.currentPV" :max="b.maxPV"
        />
        <div v-else class="damage" :class="{ untouched: b.maxPV - b.currentPV === 0 }">
          <span class="damage-num">{{ b.maxPV - b.currentPV }}</span>
          <span class="damage-label">de dany</span>
        </div>
      </div>
      <div v-if="bodies.length === 0" class="board-empty">Cap enemic en aquest combat.</div>
    </section>
  </div>

  <div v-else-if="missing" class="board-missing">
    Aquest combat no existeix en aquest navegador.
  </div>
</template>

<style scoped>
.board {
  /* Fills the app shell (#app is a full-height flex column) and scrolls
     internally, so a big roster never spills off a projector. */
  flex: 1; min-height: 0; overflow-y: auto;
  display: flex; flex-direction: column;
  padding: 1.2rem;
  background:
    radial-gradient(ellipse at 50% 0%, rgba(232, 220, 196, 0.07), transparent 60%),
    var(--bg-dark);
}

.enemies {
  flex: 1; min-height: 0;
  display: grid;
  gap: 20px;                 /* keep in step with GAP in the script */
  justify-items: center; align-items: center;
}

.enemy-tile {
  width: 100%; height: 100%;
  max-width: calc(30rem * var(--tile-scale, 1) / 1.6);
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  gap: calc(0.4rem * var(--tile-scale, 1));
  padding: calc(0.8rem * var(--tile-scale, 1));
  background: rgba(0, 0, 0, 0.28);
  border: 1px solid rgba(232, 220, 196, 0.2);
  border-top: 4px solid var(--class-color, var(--parchment-dark));
  border-radius: 10px;
  transition: opacity 0.3s;
}
.enemy-tile.down { opacity: 0.35; }

.enemy-icon {
  width: calc(62px * var(--tile-scale, 1));
  height: calc(62px * var(--tile-scale, 1));
  flex-shrink: 1; min-height: 0; object-fit: contain;
  filter: invert(85%) sepia(15%) saturate(360%) hue-rotate(2deg) brightness(95%);
}
.enemy-name {
  font-family: 'Cinzel Decorative', serif; color: var(--parchment);
  font-size: calc(1.1rem * var(--tile-scale, 1));
  line-height: 1.2; text-align: center;
}
.tile-tracker { width: 92%; }

.downed {
  font-family: 'Cinzel Decorative', serif; color: #a4302c;
  font-size: calc(1.2rem * var(--tile-scale, 1));
  letter-spacing: 0.2em; text-transform: uppercase;
}

.damage { display: flex; align-items: baseline; gap: 0.45rem; }
.damage-num {
  font-family: 'Cinzel Decorative', serif; color: #d9924a;
  font-size: calc(2.3rem * var(--tile-scale, 1));
  line-height: 1; font-variant-numeric: tabular-nums;
}
.damage-label {
  font-family: 'Crimson Text', serif; color: var(--parchment-dark);
  font-size: calc(0.9rem * var(--tile-scale, 1));
}
.damage.untouched .damage-num { color: var(--parchment-dark); opacity: 0.55; }

.board-empty, .board-missing {
  grid-column: 1 / -1;
  text-align: center; padding: 4rem 1rem;
  font-family: 'Crimson Text', serif; font-style: italic; color: var(--parchment-dark);
}
</style>
