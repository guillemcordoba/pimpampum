<script setup lang="ts">
import { computed } from 'vue';
import { useRoute } from 'vue-router';
import { getEnemy } from '@pimpampum/enemies';
import { useTrackerSession } from '../composables/combatTracker';
import PvTracker from '../components/tracker/PvTracker.vue';

const base = import.meta.env.BASE_URL;
const route = useRoute();

const id = computed(() => String(route.params.id ?? ''));
// Read-only: this screen only ever FOLLOWS the GM's tab (via the `storage`
// event), so it can sit on a projector without anyone touching it.
const { session, missing } = useTrackerSession(id, false);

const defOf = (enemyId: string) => getEnemy(enemyId);

/** Every enemy body, flattened — the players see bodies, not groups. */
const bodies = computed(() =>
  session.value?.groups.flatMap(g => g.bodies.map(b => ({ ...b, enemyId: g.enemyId }))) ?? []);
</script>

<template>
  <div v-if="session" class="board">
    <section class="enemies">
      <div
        v-for="b in bodies" :key="b.uid"
        class="enemy-tile"
        :class="{ down: b.currentPV <= 0 }"
        :style="{ '--class-color': `var(--class-${defOf(b.enemyId)?.classCss})` }"
      >
        <img class="enemy-icon" :src="base + (defOf(b.enemyId)?.iconPath ?? '')" alt="">
        <div class="enemy-name">{{ b.name }}</div>

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
  padding: 1.5rem 2rem 2rem;
  background:
    radial-gradient(ellipse at 50% 0%, rgba(232, 220, 196, 0.07), transparent 60%),
    var(--bg-dark);
}

.enemies {
  flex: 1;
  display: grid; gap: 1.2rem;
  grid-template-columns: repeat(auto-fit, minmax(15rem, 1fr));
  align-content: start;
}

.enemy-tile {
  display: flex; flex-direction: column; align-items: center; gap: 0.5rem;
  padding: 1.2rem 1rem;
  background: rgba(0, 0, 0, 0.28);
  border: 1px solid rgba(232, 220, 196, 0.2);
  border-top: 4px solid var(--class-color, var(--parchment-dark));
  border-radius: 10px;
  transition: opacity 0.3s;
}
.enemy-tile.down { opacity: 0.35; }

.enemy-icon {
  width: 74px; height: 74px;
  filter: invert(85%) sepia(15%) saturate(360%) hue-rotate(2deg) brightness(95%);
}
.enemy-name {
  font-family: 'Cinzel Decorative', serif; color: var(--parchment);
  font-size: 1.25rem; text-align: center;
}
.tile-tracker { width: 100%; }

.downed {
  font-family: 'Cinzel Decorative', serif; color: #a4302c;
  font-size: 1.5rem; letter-spacing: 3px; text-transform: uppercase;
}

.damage { display: flex; align-items: baseline; gap: 0.45rem; }
.damage-num {
  font-family: 'Cinzel Decorative', serif; color: #d9924a;
  font-size: 2.6rem; line-height: 1; font-variant-numeric: tabular-nums;
}
.damage-label {
  font-family: 'Crimson Text', serif; color: var(--parchment-dark); font-size: 1rem;
}
.damage.untouched .damage-num { color: var(--parchment-dark); opacity: 0.55; }

.board-empty, .board-missing {
  text-align: center; padding: 4rem 1rem;
  font-family: 'Crimson Text', serif; font-style: italic; color: var(--parchment-dark);
}
</style>
