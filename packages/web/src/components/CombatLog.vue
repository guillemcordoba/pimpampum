<script setup lang="ts">
import { ref, watch, nextTick } from 'vue';
import type { LogEntry } from '@pimpampum/engine';

const props = defineProps<{ entries: LogEntry[] }>();

const logEl = ref<HTMLDivElement>();

watch(() => props.entries.length, async () => {
  await nextTick();
  if (logEl.value) logEl.value.scrollTop = logEl.value.scrollHeight;
});

/** Split a message so damage / PV amounts can be emphasised. */
function segments(message: string): { text: string; num: boolean }[] {
  return message
    .split(/(\d+ dany|\d+ PV)/)
    .filter(s => s.length > 0)
    .map(s => ({ text: s, num: /^\d+ (dany|PV)$/.test(s) }));
}
</script>

<template>
  <div class="combat-log" ref="logEl">
    <div
      v-for="(entry, i) in entries"
      :key="i"
      class="log-entry"
      :class="entry.kind"
    >
      <template v-for="(s, j) in segments(entry.message)" :key="j">
        <strong v-if="s.num" class="log-num">{{ s.text }}</strong>
        <template v-else>{{ s.text }}</template>
      </template>
    </div>
    <div v-if="entries.length === 0" style="color: #999; text-align: center;">
      El combat comença...
    </div>
  </div>
</template>
