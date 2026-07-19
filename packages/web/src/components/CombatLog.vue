<script setup lang="ts">
import { ref, watch, nextTick } from 'vue';
import type { LogEntry } from '@pimpampum/engine';

const props = defineProps<{ entries: LogEntry[] }>();

const logEl = ref<HTMLDivElement>();

watch(() => props.entries.length, async () => {
  await nextTick();
  if (logEl.value) logEl.value.scrollTop = logEl.value.scrollHeight;
});

/** Download the full combat log as a plain-text file, grouped by round. */
function downloadLog(): void {
  const lines: string[] = [];
  let lastRound = -1;
  for (const e of props.entries) {
    if (e.round !== lastRound) { lines.push(''); lastRound = e.round; }
    lines.push(e.message);
  }
  const blob = new Blob([lines.join('\n').trim() + '\n'], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'pimpampum-combat-log.txt';
  a.click();
  URL.revokeObjectURL(url);
}

/** Split a message so damage / PV amounts can be emphasised. */
function segments(message: string): { text: string; num: boolean }[] {
  return message
    .split(/(\d+ dany|\d+ PV)/)
    .filter(s => s.length > 0)
    .map(s => ({ text: s, num: /^\d+ (dany|PV)$/.test(s) }));
}
</script>

<template>
  <div class="log-header">
    <span class="log-title">Registre de combat</span>
    <button
      type="button" class="download-log"
      :disabled="entries.length === 0"
      title="Descarrega el registre com a fitxer de text"
      @click="downloadLog"
    >⭳ Descarrega</button>
  </div>
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

<style scoped>
.log-header {
  display: flex; align-items: center; justify-content: space-between;
  gap: 0.5rem; margin-bottom: 0.5rem;
}
.log-title {
  font-family: 'MedievalSharp', serif; color: var(--parchment);
  font-size: 1.05rem;
}
.download-log {
  font-family: inherit; font-size: 0.85rem; cursor: pointer;
  color: var(--parchment); background: rgba(0, 0, 0, 0.25);
  border: 1px solid var(--parchment-dark); border-radius: 6px;
  padding: 0.25rem 0.6rem; transition: background 0.15s, opacity 0.15s;
}
.download-log:hover:not(:disabled) { background: rgba(0, 0, 0, 0.45); }
.download-log:disabled { opacity: 0.4; cursor: default; }
</style>
