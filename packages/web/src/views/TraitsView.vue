<script setup lang="ts">
import { ref, computed } from 'vue';
import { ALL_RACES, OUT_OF_COMBAT_RULES, PLAYER_TEMPLATES, CLASS_TRAITS, getTraitsForClass, getTraitsForRace } from '@pimpampum/engine';
import type { TraitDefinition } from '@pimpampum/engine';

const base = import.meta.env.BASE_URL;

const domainLabels: Record<string, string> = {
  physical: 'Fysic',
  mental: 'Mental',
  social: 'Social',
  supernatural: 'Sobrenatural',
};

const domainColors: Record<string, string> = {
  physical: '#a63d2f',
  mental: '#6b3fa0',
  social: '#2f6a8a',
  supernatural: '#8a7a2f',
};

const classesWithTraits = PLAYER_TEMPLATES.filter(t => CLASS_TRAITS[t.id]);

const selectedClassId = ref(classesWithTraits[0]?.id ?? '');
const selectedRaceId = ref(ALL_RACES[0]?.id ?? '');

const selectedClass = computed(() => classesWithTraits.find(t => t.id === selectedClassId.value));
const selectedRace = computed(() => ALL_RACES.find(r => r.id === selectedRaceId.value));

const combinedTraits = computed(() => {
  const classTraits = getTraitsForClass(selectedClassId.value);
  const raceTraits = getTraitsForRace(selectedRaceId.value);
  // Deduplicate by id (in case class and race share a trait)
  const seen = new Set<string>();
  const result: { trait: TraitDefinition; source: 'class' | 'race' | 'both' }[] = [];
  const raceTraitIds = new Set(raceTraits.map(t => t.id));
  const classTraitIds = new Set(classTraits.map(t => t.id));
  for (const t of classTraits) {
    seen.add(t.id);
    result.push({ trait: t, source: raceTraitIds.has(t.id) ? 'both' : 'class' });
  }
  for (const t of raceTraits) {
    if (!seen.has(t.id)) {
      result.push({ trait: t, source: 'race' });
    }
  }
  return result;
});

const diceCount = computed(() => combinedTraits.value.length);
</script>

<template>
  <div class="traits-page">
    <h1 class="screen-title">Trets</h1>
    <p class="screen-subtitle">Sistema de resolució fora de combat</p>

    <!-- Mechanics explanation -->
    <section class="traits-section">
      <div class="rules-box">
        <h2 class="rules-box-title">{{ OUT_OF_COMBAT_RULES.title }}</h2>
        <p v-for="(p, i) in OUT_OF_COMBAT_RULES.paragraphs" :key="i" class="rules-box-text" v-html="p"></p>
        <table class="rules-table">
          <thead>
            <tr>
              <th>Trets aplicables</th>
              <th>Tirada</th>
              <th>Tipus</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in OUT_OF_COMBAT_RULES.table" :key="row.traits">
              <td>{{ row.traits }}</td>
              <td>{{ row.dice }}</td>
              <td>{{ row.label }}</td>
            </tr>
          </tbody>
        </table>
        <p class="rules-box-footer" v-html="OUT_OF_COMBAT_RULES.footer"></p>
      </div>
    </section>

    <!-- Interactive picker -->
    <section class="traits-section">
      <h2 class="section-heading">Els teus trets</h2>

      <div class="picker">
        <!-- Class picker -->
        <div class="picker-group">
          <span class="picker-label">Classe</span>
          <div class="picker-buttons">
            <button
              v-for="t in classesWithTraits"
              :key="t.id"
              class="picker-btn"
              :class="[t.classCss, { active: t.id === selectedClassId }]"
              @click="selectedClassId = t.id"
            >
              <img :src="base + t.iconPath" :alt="t.displayName">
              <span>{{ t.displayName }}</span>
            </button>
          </div>
        </div>

        <!-- Race picker -->
        <div class="picker-group">
          <span class="picker-label">Raça</span>
          <div class="picker-buttons">
            <button
              v-for="r in ALL_RACES"
              :key="r.id"
              class="picker-btn"
              :class="{ active: r.id === selectedRaceId }"
              @click="selectedRaceId = r.id"
            >
              <img :src="base + r.iconPath" :alt="r.displayName">
              <span>{{ r.displayName }}</span>
            </button>
          </div>
        </div>
      </div>

      <!-- Combined result -->
      <div class="result-box" :class="selectedClass?.classCss">
        <div class="result-header">
          <span class="result-title">
            {{ selectedClass?.displayName }} {{ selectedRace?.displayName }}
          </span>
          <span class="result-dice">
            {{ diceCount }} {{ diceCount === 1 ? 'tret' : 'trets' }} disponibles
          </span>
        </div>

        <table class="result-table">
          <tbody>
            <tr v-for="{ trait, source } in combinedTraits" :key="trait.id">
              <td class="result-icon-cell">
                <img :src="base + trait.iconPath" :alt="trait.displayName">
              </td>
              <td class="result-name">{{ trait.displayName }}</td>
              <td class="result-desc">{{ trait.description }}</td>
              <td class="result-source">
                <span class="source-tag" :class="source">
                  {{ source === 'class' ? 'Classe' : source === 'race' ? 'Raça' : 'Ambdós' }}
                </span>
              </td>
              <td>
                <span class="trait-domain-tag" :style="{ background: domainColors[trait.domain] }">
                  {{ domainLabels[trait.domain] }}
                </span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  </div>
</template>

<style scoped>
.traits-page {
  padding: 1rem;
  max-width: 1000px;
  margin: 0 auto;
}

.traits-section {
  margin-bottom: 2.5rem;
}

.section-heading {
  font-family: 'Cinzel Decorative', serif;
  font-size: 1.4rem;
  color: var(--parchment);
  text-transform: uppercase;
  letter-spacing: 2px;
  margin-bottom: 1.25rem;
  text-align: center;
}

/* -- Rules explanation box -- */
.rules-box {
  background: rgba(232, 220, 196, 0.08);
  border: 2px solid rgba(232, 220, 196, 0.2);
  border-radius: 10px;
  padding: 1.5rem 2rem;
  max-width: 700px;
  margin: 1.5rem auto 0;
}

.rules-box-title {
  font-family: 'Cinzel Decorative', serif;
  font-size: 1.2rem;
  color: var(--parchment);
  text-transform: uppercase;
  letter-spacing: 1.5px;
  margin-bottom: 0.75rem;
}

.rules-box-text {
  font-family: 'Crimson Text', Georgia, serif;
  font-size: 1rem;
  color: var(--parchment-dark);
  line-height: 1.5;
  margin-bottom: 0.75rem;
}

.rules-table {
  width: 100%;
  border-collapse: collapse;
  margin: 1rem 0;
  font-family: 'Crimson Text', Georgia, serif;
  font-size: 0.95rem;
}

.rules-table th {
  font-family: 'MedievalSharp', serif;
  text-align: left;
  color: var(--parchment);
  padding: 0.5rem 0.75rem;
  border-bottom: 2px solid rgba(232, 220, 196, 0.3);
}

.rules-table td {
  color: var(--parchment-dark);
  padding: 0.4rem 0.75rem;
  border-bottom: 1px solid rgba(232, 220, 196, 0.1);
}

.rules-box-footer {
  font-family: 'Crimson Text', Georgia, serif;
  font-size: 0.95rem;
  font-style: italic;
  color: var(--parchment-dark);
  line-height: 1.5;
  margin-top: 0.5rem;
}

/* -- Picker -- */
.picker {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  margin-bottom: 1.5rem;
}

.picker-group {
  display: flex;
  align-items: center;
  gap: 1rem;
}

.picker-label {
  font-family: 'MedievalSharp', serif;
  font-size: 1.05rem;
  color: var(--parchment);
  min-width: 60px;
}

.picker-buttons {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
}

.picker-btn {
  display: flex;
  align-items: center;
  gap: 0.3rem;
  padding: 0.35rem 0.7rem;
  border: 2px solid rgba(232, 220, 196, 0.2);
  border-radius: 6px;
  background: rgba(232, 220, 196, 0.06);
  color: var(--parchment-dark);
  font-family: 'MedievalSharp', serif;
  font-size: 0.9rem;
  cursor: pointer;
  transition: all 0.2s;
}

.picker-btn img {
  width: 20px;
  height: 20px;
  filter: invert(0.7);
}

.picker-btn:hover {
  background: rgba(232, 220, 196, 0.12);
  color: var(--parchment);
}

.picker-btn.active {
  border-color: currentColor;
  color: var(--parchment);
  background: rgba(232, 220, 196, 0.15);
}

.picker-btn.guerrer.active { border-color: var(--class-guerrer); }
.picker-btn.murri.active { border-color: var(--class-murri); }
.picker-btn.mag.active { border-color: var(--class-mag); }
.picker-btn.barbar.active { border-color: var(--class-barbar); }
.picker-btn.clergue.active { border-color: var(--class-clergue); }
.picker-btn.monjo.active { border-color: var(--class-monjo); }
.picker-btn.trobador.active { border-color: var(--class-trobador); }
.picker-btn.bruixot.active { border-color: var(--class-bruixot); }
.picker-btn.paladi.active { border-color: var(--class-paladi); }
.picker-btn.druida.active { border-color: var(--class-druida); }

/* -- Result box -- */
.result-box {
  background: rgba(232, 220, 196, 0.06);
  border: 2px solid rgba(232, 220, 196, 0.2);
  border-left: 4px solid var(--parchment-dark);
  border-radius: 0 10px 10px 0;
  padding: 1rem 1.25rem;
}

.result-box.guerrer { border-left-color: var(--class-guerrer); }
.result-box.murri { border-left-color: var(--class-murri); }
.result-box.mag { border-left-color: var(--class-mag); }
.result-box.barbar { border-left-color: var(--class-barbar); }
.result-box.clergue { border-left-color: var(--class-clergue); }
.result-box.monjo { border-left-color: var(--class-monjo); }
.result-box.trobador { border-left-color: var(--class-trobador); }
.result-box.bruixot { border-left-color: var(--class-bruixot); }
.result-box.paladi { border-left-color: var(--class-paladi); }
.result-box.druida { border-left-color: var(--class-druida); }

.result-header {
  display: flex;
  align-items: baseline;
  gap: 1rem;
  margin-bottom: 0.75rem;
}

.result-title {
  font-family: 'Cinzel Decorative', serif;
  font-size: 1.1rem;
  font-weight: 700;
  color: var(--parchment);
  text-transform: uppercase;
  letter-spacing: 1px;
}

.result-dice {
  font-family: 'Crimson Text', Georgia, serif;
  font-size: 0.9rem;
  color: var(--parchment-dark);
  font-style: italic;
}

.result-table {
  width: 100%;
  border-collapse: collapse;
  font-family: 'Crimson Text', Georgia, serif;
  font-size: 0.95rem;
}

.result-table td {
  padding: 0.3rem 0.5rem;
  color: var(--parchment-dark);
  vertical-align: middle;
  border-bottom: 1px solid rgba(232, 220, 196, 0.08);
}

.result-icon-cell {
  width: 28px;
  padding-right: 0 !important;
}

.result-icon-cell img {
  width: 22px;
  height: 22px;
  filter: invert(0.7);
  vertical-align: middle;
}

.result-name {
  font-family: 'MedievalSharp', serif;
  color: var(--parchment);
  white-space: nowrap;
}

.result-desc {
  font-size: 0.9rem;
}

.source-tag {
  font-family: 'Crimson Text', Georgia, serif;
  font-size: 0.7rem;
  padding: 0.1rem 0.4rem;
  border-radius: 3px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  white-space: nowrap;
}

.source-tag.class {
  background: rgba(232, 220, 196, 0.15);
  color: var(--parchment);
}

.source-tag.race {
  background: rgba(232, 220, 196, 0.08);
  color: var(--parchment-dark);
}

.source-tag.both {
  background: rgba(232, 220, 196, 0.2);
  color: var(--parchment);
  font-weight: 600;
}

.trait-domain-tag {
  font-family: 'Crimson Text', Georgia, serif;
  font-size: 0.7rem;
  color: #f0e6d6;
  padding: 0.1rem 0.4rem;
  border-radius: 3px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  white-space: nowrap;
}

@media (max-width: 600px) {
  .picker-group {
    flex-direction: column;
    align-items: flex-start;
  }
  .result-header {
    flex-direction: column;
    gap: 0.25rem;
  }
  .result-desc {
    display: none;
  }
}
</style>
