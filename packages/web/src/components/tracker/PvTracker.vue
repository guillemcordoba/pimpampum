<script setup lang="ts">
import { computed } from 'vue';
import { STAT_ICONS } from '@pimpampum/engine';

const base = import.meta.env.BASE_URL;

const props = withDefaults(defineProps<{
  current: number;
  max: number;
  /** Bigger type and a thicker bar, for the players' shared screen. */
  large?: boolean;
  /** Read-only: no steppers, no editable number. */
  readonly?: boolean;
}>(), { large: false, readonly: false });

const emit = defineEmits<{ (e: 'update', value: number): void }>();

const pct = computed(() => Math.max(0, Math.min(100, Math.round(100 * props.current / Math.max(1, props.max)))));
const dead = computed(() => props.current <= 0);

function set(value: number): void {
  const clamped = Math.max(0, Math.min(props.max, Math.round(value) || 0));
  if (clamped !== props.current) emit('update', clamped);
}

/** Typed edit of the current PV. An empty field is mid-typing, not 0 PV. */
function onInput(event: Event): void {
  const raw = (event.target as HTMLInputElement).value;
  if (raw.trim() === '') return;
  set(Number(raw));
}
</script>

<template>
  <div class="pv-tracker" :class="{ large, dead }">
    <div class="bar">
      <div class="fill" :style="{ width: pct + '%' }"></div>
    </div>
    <div class="row">
      <!-- ±5 as well as ±1: a single margin routinely takes 5-8 PV off, and
           clicking − six times mid-fight is the slow way to run a table. -->
      <button v-if="!readonly" type="button" class="step big" title="−5 PV" @click="set(current - 5)">−5</button>
      <button v-if="!readonly" type="button" class="step" title="−1 PV" @click="set(current - 1)">−</button>
      <span class="value">
        <img :src="base + STAT_ICONS.pv" alt="PV">
        <input
          v-if="!readonly"
          class="cur" type="number" :value="current" :min="0" :max="max"
          @input="onInput"
          @blur="($event.target as HTMLInputElement).value = String(current)"
        >
        <span v-else class="cur-static">{{ current }}</span>
        <span class="max">/ {{ max }}</span>
      </span>
      <button v-if="!readonly" type="button" class="step" title="+1 PV" @click="set(current + 1)">+</button>
      <button v-if="!readonly" type="button" class="step big" title="+5 PV" @click="set(current + 5)">+5</button>
    </div>
  </div>
</template>

<style scoped>
/* Wide enough for ±5, ±1 and the number without the row wrapping. The players'
   screen is read-only (no steppers), so it is not held to this. */
.pv-tracker { display: flex; flex-direction: column; gap: 0.3rem; min-width: 13rem; }
.pv-tracker.large { min-width: 0; }

.bar {
  height: 8px; border-radius: 4px; overflow: hidden;
  background: rgba(0, 0, 0, 0.45);
  border: 1px solid rgba(232, 220, 196, 0.18);
}
/* `--tile-scale` is set by whatever hosts the tracker (the players' board sizes
   its tiles to the room), so the large variant grows with its tile. */
.large .bar {
  height: calc(14px * var(--tile-scale, 1));
  border-radius: calc(7px * var(--tile-scale, 1));
}
.fill {
  height: 100%;
  background: linear-gradient(90deg, #a4302c, #7fae3f);
  transition: width 0.3s ease;
}
.dead .fill { background: #4a1f1d; }

.row { display: flex; align-items: center; gap: 0.4rem; justify-content: center; }

.value {
  display: flex; align-items: baseline; gap: 0.25rem;
  font-family: 'MedievalSharp', serif; color: var(--parchment);
  font-size: 1rem;
}
.large .value { font-size: calc(1.6rem * var(--tile-scale, 1)); }
.value img { width: 15px; height: 15px; align-self: center; opacity: 0.85; }
.large .value img {
  width: calc(23px * var(--tile-scale, 1));
  height: calc(23px * var(--tile-scale, 1));
}

.cur {
  width: 2.8ch; padding: 0; text-align: right;
  font-family: inherit; font-size: inherit; color: inherit;
  background: none; border: none; border-bottom: 1px dotted transparent;
  -moz-appearance: textfield;
}
.large .cur { width: 3.4ch; }
.cur::-webkit-outer-spin-button, .cur::-webkit-inner-spin-button { -webkit-appearance: none; margin: 0; }
.cur:hover { border-bottom-color: var(--parchment-dark); }
.cur:focus { outline: none; border-bottom-color: var(--parchment); }
.cur-static { font-variant-numeric: tabular-nums; }
.max { color: var(--parchment-dark); font-size: 0.8em; }

.dead .value, .dead .max { color: #a4302c; }

.step {
  width: 1.7rem; height: 1.7rem; flex: 0 0 auto;
  display: flex; align-items: center; justify-content: center;
  font-size: 1.1rem; line-height: 1;
  color: var(--parchment); background: rgba(0, 0, 0, 0.3);
  border: 1px solid var(--parchment-dark); border-radius: 4px;
  cursor: pointer; transition: background 0.15s;
}
.step:hover { background: rgba(232, 220, 196, 0.18); }
.step:active { background: rgba(232, 220, 196, 0.3); }
/* The ±5 pair reads as the secondary action: same height, wider for its two
   glyphs, and dimmer so the ±1 buttons stay the ones the eye lands on. */
.step.big {
  width: 2.1rem; font-size: 0.82rem;
  color: var(--parchment-dark);
  border-color: rgba(232, 220, 196, 0.3);
}
.step.big:hover { color: var(--parchment); }
</style>
