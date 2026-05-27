<script setup lang="ts">
import { ref, computed } from 'vue';
import { PLAYER_SKILLS, ALL_EQUIPMENT } from '@pimpampum/skills';
import { ENEMY_TEMPLATES } from '@pimpampum/enemies';
import type { Game } from '../composables/useGame';

const props = defineProps<{ game: Game }>();
const g = props.game;
const base = import.meta.env.BASE_URL;

// --- Player draft ---------------------------------------------------------
const draftName = ref('');
const draftPv = ref(12);
const draftSkills = ref<Record<string, number>>({});
const draftEquip = ref<string[]>([]);

function toggleSkill(id: string) {
  const next = { ...draftSkills.value };
  if (id in next) delete next[id];
  else next[id] = 25;
  draftSkills.value = next;
}
function toggleEquip(id: string) {
  draftEquip.value = draftEquip.value.includes(id)
    ? draftEquip.value.filter(e => e !== id)
    : [...draftEquip.value, id];
}

const draftSkillIds = computed(() => Object.keys(draftSkills.value));
const canAddPlayer = computed(() => draftSkillIds.value.length > 0);

function addPlayer() {
  if (!canAddPlayer.value) return;
  const firstSkill = PLAYER_SKILLS.find(s => s.id === draftSkillIds.value[0])!;
  g.addPlayer({
    name: draftName.value || `Heroi ${g.playerSpecs.value.length + 1}`,
    classCss: firstSkill.classCss,
    iconPath: firstSkill.iconPath,
    pv: draftPv.value,
    skills: { ...draftSkills.value },
    equipment: [...draftEquip.value],
  });
  draftName.value = '';
  draftPv.value = 20;
  draftSkills.value = {};
  draftEquip.value = [];
}

// --- Enemy draft ----------------------------------------------------------
const enemyTemplateId = ref(ENEMY_TEMPLATES[0]?.id ?? '');
const enemyLevel = ref(20);
function addEnemy() {
  if (!enemyTemplateId.value) return;
  g.addEnemy({ templateId: enemyTemplateId.value, level: enemyLevel.value });
}

// --- Sums -----------------------------------------------------------------
const playerSkillSum = computed(() =>
  g.playerSpecs.value.reduce((sum, p) => sum + Object.values(p.skills).reduce((a, b) => a + b, 0), 0));

function templateName(id: string): string {
  return ENEMY_TEMPLATES.find(t => t.id === id)?.displayName ?? id;
}
</script>

<template>
  <div class="setup">
    <h1>Prepara el combat</h1>

    <div class="setup-cols">
      <!-- Player builder -->
      <section class="setup-panel">
        <h2>Herois (suma d'habilitats: {{ playerSkillSum }})</h2>

        <div class="roster">
          <div v-for="(p, i) in g.playerSpecs.value" :key="i" class="roster-tile" :class="p.classCss">
            <strong>{{ p.name }}</strong>
            <div class="roster-detail">PV {{ p.pv }} · {{ Object.entries(p.skills).map(([s, l]) => `${s} ${l}`).join(', ') }}</div>
            <div v-if="p.equipment.length" class="roster-detail">⚙ {{ p.equipment.join(', ') }}</div>
            <button class="x" @click="g.removePlayer(i)">✕</button>
          </div>
        </div>

        <div class="builder">
          <input v-model="draftName" placeholder="Nom de l'heroi" class="txt">
          <label class="pv-row">PV <input v-model.number="draftPv" type="number" min="5" max="60" class="num"></label>

          <div class="subhead">Habilitats</div>
          <div class="chips">
            <label v-for="s in PLAYER_SKILLS" :key="s.id" class="chip" :class="{ on: s.id in draftSkills }">
              <input type="checkbox" :checked="s.id in draftSkills" @change="toggleSkill(s.id)">
              <img :src="base + s.iconPath" :alt="s.displayName" class="chip-icon">
              {{ s.displayName }}
              <input
                v-if="s.id in draftSkills"
                type="number" min="1" max="100"
                :value="draftSkills[s.id]"
                @input="draftSkills[s.id] = Number(($event.target as HTMLInputElement).value)"
                class="num lvl"
                @click.stop
              >
            </label>
          </div>

          <div class="subhead">Equipament</div>
          <div class="chips">
            <label v-for="e in ALL_EQUIPMENT" :key="e.id" class="chip" :class="{ on: draftEquip.includes(e.id) }">
              <input type="checkbox" :checked="draftEquip.includes(e.id)" @change="toggleEquip(e.id)">
              {{ e.name }}
            </label>
          </div>

          <button class="btn btn-primary" :disabled="!canAddPlayer" @click="addPlayer">Afegir heroi</button>
        </div>
      </section>

      <!-- Enemy builder -->
      <section class="setup-panel">
        <h2>Enemics</h2>
        <div class="roster">
          <div v-for="(e, i) in g.enemySpecs.value" :key="i" class="roster-tile">
            <strong>{{ templateName(e.templateId) }}</strong>
            <div class="roster-detail">nivell {{ e.level }}</div>
            <button class="x" @click="g.removeEnemy(i)">✕</button>
          </div>
        </div>
        <div class="builder">
          <select v-model="enemyTemplateId" class="txt">
            <option v-for="t in ENEMY_TEMPLATES" :key="t.id" :value="t.id">{{ t.displayName }} (PV {{ t.basePV }})</option>
          </select>
          <label class="pv-row">Nivell <input v-model.number="enemyLevel" type="number" min="1" max="100" class="num"></label>
          <button class="btn" @click="addEnemy">Afegir enemic</button>
        </div>
      </section>
    </div>

    <div class="start-row">
      <button class="btn btn-primary btn-big" :disabled="!g.canStart()" @click="g.startCombat()">
        Comença el combat
      </button>
    </div>
  </div>
</template>

<style scoped>
.setup { max-width: 1100px; margin: 0 auto; }
.setup-cols { display: flex; gap: 1.5rem; flex-wrap: wrap; }
.setup-panel { flex: 1; min-width: 320px; background: rgba(0,0,0,0.2); border: 1px solid rgba(232,220,196,0.15); border-radius: 8px; padding: 1rem; }
.roster { display: flex; flex-direction: column; gap: 0.4rem; margin-bottom: 0.75rem; }
.roster-tile { position: relative; background: rgba(0,0,0,0.3); border-left: 4px solid var(--parchment-dark); border-radius: 4px; padding: 0.4rem 0.6rem; color: var(--parchment); }
.roster-detail { font-size: 0.8rem; opacity: 0.8; }
.roster-tile .x { position: absolute; top: 0.3rem; right: 0.4rem; background: none; border: none; color: var(--parchment-dark); cursor: pointer; }
.builder { display: flex; flex-direction: column; gap: 0.5rem; }
.subhead { font-family: 'MedievalSharp', serif; color: var(--parchment); margin-top: 0.3rem; }
.chips { display: flex; flex-wrap: wrap; gap: 0.3rem; }
.chip { display: inline-flex; align-items: center; gap: 0.25rem; background: rgba(0,0,0,0.3); border: 1px solid rgba(232,220,196,0.2); border-radius: 4px; padding: 0.2rem 0.4rem; font-size: 0.8rem; color: var(--parchment-dark); cursor: pointer; }
.chip.on { color: var(--parchment); border-color: var(--parchment); }
.chip-icon { width: 16px; height: 16px; }
.txt, .num, select.txt { background: rgba(0,0,0,0.4); border: 1px solid rgba(232,220,196,0.3); border-radius: 4px; color: var(--parchment); padding: 0.3rem; }
.num { width: 4rem; }
.lvl { width: 3.2rem; }
.pv-row { color: var(--parchment); display: inline-flex; gap: 0.4rem; align-items: center; }
.start-row { text-align: center; margin-top: 1.5rem; }
.btn-big { font-size: 1.2rem; padding: 0.6rem 1.5rem; }
</style>
