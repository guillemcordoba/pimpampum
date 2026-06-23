<script setup lang="ts">
import { computed } from 'vue';
import type { Character } from '@pimpampum/engine';
import { STAT_ICONS } from '@pimpampum/engine';
import { maxCharges } from '@pimpampum/skills';

const base = import.meta.env.BASE_URL;

const props = defineProps<{
  character: Character;
  isEnemy?: boolean;
  isHighlighted?: boolean;
  compact?: boolean;
}>();

const pvPct = computed(() => Math.max(0, Math.round(100 * props.character.currentPV / props.character.maxPV)));

const skills = computed(() =>
  [...props.character.skills.entries()].map(([id, level]) => ({ id, level: props.character.getSkillLevel(id) })));

const statusBadges = computed(() => {
  const out: { text: string; positive: boolean; pending: boolean }[] = [];
  for (const m of props.character.modifiers) {
    const val = m.dice ? m.dice.toString() : `${m.value >= 0 ? '+' : ''}${m.value}`;
    const pending = typeof m.duration === 'object' && (m.duration as { pending?: boolean }).pending === true;
    out.push({ text: `${m.stat} ${val}`, positive: m.value >= 0, pending });
  }
  for (const [key, entry] of props.character.statuses) {
    if (key === 'carregues') continue; // shown as its own bandolier counter
    out.push({ text: entry.value > 1 ? `${key} ×${entry.value}` : key, positive: false, pending: false });
  }
  return out;
});

// The explosive engineer's finite bandolier, shown as current/max càrregues.
const bandolier = computed(() => {
  if (!props.character.hasStatus('carregues')) return null;
  return { current: props.character.getStatusValue('carregues', 0), max: maxCharges(props.character) };
});
</script>

<template>
  <div
    class="portrait"
    :class="[character.characterClass, { dead: !character.isAlive(), highlighted: isHighlighted, compact }]"
  >
    <img class="portrait-icon" :src="base + character.iconPath" :alt="character.name">
    <div class="portrait-name">{{ character.name }}</div>
    <div class="portrait-pv">
      <div class="pv-bar"><div class="pv-fill" :style="{ width: pvPct + '%' }"></div></div>
      <span class="pv-text">
        <img :src="base + STAT_ICONS.pv" alt="PV">{{ character.currentPV }}/{{ character.maxPV }}
      </span>
      <span class="fatigue-text" :class="{ tired: character.getFatiguePenalty() > 0 }">
        <img :src="base + STAT_ICONS.fatigue" alt="Fatiga">{{ character.fatigue }} · {{ character.getFatigueStateName() }}
        <span v-if="character.getFatiguePenalty() > 0" class="fatigue-penalty">−{{ character.getFatiguePenalty() }}</span>
      </span>
      <span v-if="bandolier" class="bandolier-text" :class="{ empty: bandolier.current === 0 }">
        <img :src="base + STAT_ICONS.charge" alt="Càrregues">{{ bandolier.current }}/{{ bandolier.max }} càrregues
      </span>
    </div>
    <div class="portrait-stats">
      <span v-for="s in skills" :key="s.id" class="skill-chip">{{ s.id }} {{ s.level }}</span>
    </div>
    <div v-if="statusBadges.length > 0" class="portrait-modifiers">
      <span
        v-for="(b, i) in statusBadges"
        :key="i"
        class="modifier-badge"
        :class="{ positive: b.positive, negative: !b.positive, pending: b.pending }"
      >{{ b.text }}</span>
    </div>
  </div>
</template>

<style scoped>
.portrait-pv {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  margin: 0.2rem 0;
}
.pv-bar {
  width: 80%;
  height: 6px;
  background: rgba(0, 0, 0, 0.4);
  border-radius: 3px;
  overflow: hidden;
}
.pv-fill {
  height: 100%;
  background: linear-gradient(90deg, #b33, #6c3);
  transition: width 0.3s;
}
.pv-text {
  display: flex;
  align-items: center;
  gap: 2px;
  font-size: 0.8rem;
}
.pv-text img {
  width: 14px;
  height: 14px;
}
.fatigue-text {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 0.7rem;
  opacity: 0.75;
}
.fatigue-text img {
  width: 12px;
  height: 12px;
}
.fatigue-text.tired {
  opacity: 1;
  color: #c64;
  font-weight: bold;
}
.fatigue-penalty {
  font-weight: bold;
  margin-left: 2px;
}
.bandolier-text {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 0.7rem;
  color: var(--class-enginyer, #9c5a1f);
  font-weight: bold;
}
.bandolier-text img {
  width: 12px;
  height: 12px;
}
.bandolier-text.empty {
  opacity: 0.55;
  font-weight: normal;
}
.skill-chip {
  font-size: 0.65rem;
  opacity: 0.85;
  white-space: nowrap;
}
</style>
