<script setup lang="ts">
import { computed } from 'vue';
import type { Character } from '@pimpampum/engine';
import type { CharacterTemplate } from '@pimpampum/engine';

const props = defineProps<{
  character: Character;
  template: CharacterTemplate;
  isEnemy?: boolean;
  isHighlighted?: boolean;
}>();

const wounds = computed(() => {
  const result = [];
  for (let i = 0; i < props.character.maxWounds; i++) {
    result.push(i < props.character.currentWounds ? 'full' : 'empty');
  }
  return result;
});

const modifierBadges = computed(() => {
  return props.character.modifiers.map(m => {
    const sign = m.value >= 0 ? '+' : '';
    const val = m.dice ? m.dice.toString() : `${sign}${m.value}`;
    return {
      text: `${m.stat.charAt(0).toUpperCase()} ${val}`,
      positive: m.value >= 0,
    };
  });
});
</script>

<template>
  <div
    class="portrait"
    :class="[
      template.classCss,
      { dead: !character.isAlive(), highlighted: isHighlighted },
    ]"
  >
    <img class="portrait-icon" :src="'/' + template.iconPath" :alt="template.displayName">
    <div class="portrait-name">{{ character.name }}</div>
    <div class="portrait-wounds">
      <span
        v-for="(w, i) in wounds"
        :key="i"
        class="wound-heart"
        :class="w"
      >{{ w === 'full' ? '💀' : '❤️' }}</span>
    </div>
    <div class="portrait-stats">
      <span><img src="/icons/000000/transparent/1x1/lorc/crossed-swords.svg" alt="F">{{ character.getEffectiveStrength() }}</span>
      <span><img src="/icons/000000/transparent/1x1/lorc/crystal-wand.svg" alt="M">{{ character.getEffectiveMagic() }}</span>
      <span><img src="/icons/000000/transparent/1x1/willdabeast/round-shield.svg" alt="D">{{ character.getEffectiveDefense() }}</span>
      <span><img src="/icons/000000/transparent/1x1/darkzaitzev/running-ninja.svg" alt="V">{{ character.getEffectiveSpeed() }}</span>
    </div>
    <div v-if="modifierBadges.length > 0" class="portrait-modifiers">
      <span
        v-for="(b, i) in modifierBadges"
        :key="i"
        class="modifier-badge"
        :class="{ positive: b.positive, negative: !b.positive }"
      >{{ b.text }}</span>
    </div>
  </div>
</template>
