<script setup lang="ts">
import { ref, watch, nextTick } from 'vue';
import type { LogEntry } from '@pimpampum/engine';

const props = defineProps<{
  entries: LogEntry[];
}>();

const logEl = ref<HTMLDivElement>();

watch(() => props.entries.length, async () => {
  await nextTick();
  if (logEl.value) {
    logEl.value.scrollTop = logEl.value.scrollHeight;
  }
});
</script>

<template>
  <div class="combat-log" ref="logEl">
    <div
      v-for="(entry, i) in entries"
      :key="i"
      class="log-entry"
      :class="entry.type"
    >
      {{ entry.text }}
    </div>
    <div v-if="entries.length === 0" style="color: #999; text-align: center;">
      El combat comença...
    </div>
  </div>
</template>
