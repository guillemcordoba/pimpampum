<script setup lang="ts">
import { computed } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ACTION_TYPE_CSS } from '@pimpampum/engine';
import { getEnemy, unlockedEnemyActions } from '@pimpampum/enemies';
import { getEquipment } from '@pimpampum/skills';
import {
  useTrackerSession, deleteTrackerSession, groupName, defaultBodyName, bodyName,
  type TrackedBody, type TrackedGroup,
} from '../composables/combatTracker';
import PvTracker from '../components/tracker/PvTracker.vue';

const base = import.meta.env.BASE_URL;
/** Marks the name list as "these are its cards" (game-icons.net, CC BY 3.0). */
const CARD_ICON = 'icons/000000/transparent/1x1/quoting/card-play.svg';
const route = useRoute();
const router = useRouter();

const id = computed(() => String(route.params.id ?? ''));
const { session, missing, touch } = useTrackerSession(id);

// The players' screen is a separate URL so it can live on a second window or
// a projector; it follows this tab through the `storage` event.
const playersHref = computed(() =>
  router.resolve({ name: 'tracker-players', params: { id: id.value } }).href);

const defOf = (enemyId: string) => getEnemy(enemyId);

/** The names of every card a body of this group holds: its kit at that level,
 *  plus the cards its gear grants (the goblin's shield IS a defense card).
 *  Names only — the GM plays from the printed deck, this is the checklist. */
function groupCards(group: TrackedGroup): { key: string; name: string; typeCss: string }[] {
  const def = getEnemy(group.enemyId);
  if (!def) return [];
  const cards = def.skills
    .flatMap(s => unlockedEnemyActions(s.id, group.level))
    .map(a => ({ key: a.id, name: a.name, typeCss: ACTION_TYPE_CSS[a.actionType] }));
  const gear = (def.equipment ?? [])
    .flatMap(id => {
      const e = getEquipment(id);
      if (!e) return [];
      const granted = e.grantsActions ?? [];
      return granted.length > 0
        ? granted.map(a => ({ key: `${e.id}-${a.id}`, name: a.name, typeCss: ACTION_TYPE_CSS[a.actionType] }))
        : [{ key: e.id, name: e.name, typeCss: 'objecte' }];
    });
  return [...cards, ...gear];
}

/** Passive armour a body of this group carries (scales + gear). */
function groupArmor(group: TrackedGroup): number {
  const def = getEnemy(group.enemyId);
  if (!def) return 0;
  const gear = (def.equipment ?? [])
    .map(getEquipment)
    .reduce((sum, e) => sum + (e?.passiveArmor ?? 0), 0);
  return (def.naturalArmor ?? 0) + gear;
}

function setPV(body: TrackedBody, value: number): void {
  body.currentPV = value;
  touch();
}

/** Renaming a group needs no fan-out: bodies without a name of their own
 *  DERIVE it from the group, on every screen, through `bodyName()`. */
function renameGroup(group: TrackedGroup, value: string): void {
  group.name = value.trim();
  touch();
}

/** A body's own name, or nothing — blank means "follow the group", which is
 *  what the placeholder shows. */
function renameBody(group: TrackedGroup, index: number, value: string): void {
  const own = value.trim();
  const body = group.bodies[index];
  if (!body) return;
  if (own && own !== defaultBodyName(groupName(group), index, group.bodies.length)) {
    body.name = own;
  } else {
    delete body.name;
  }
  touch();
}

function resetCombat(): void {
  const s = session.value;
  if (!s) return;
  if (!confirm('Torna a posar tots els enemics a PV plens?')) return;
  for (const g of s.groups) for (const b of g.bodies) b.currentPV = b.maxPV;
  touch();
}

function discardTracker(): void {
  if (!confirm('Esborra aquest combat? No es pot desfer.')) return;
  const back = backTo.value;   // read before the session goes away
  deleteTrackerSession(id.value);
  router.push(back);
}

// Back goes to the party whose history this fight belongs to, not to the top
// of the tree — that is the screen the GM came from.
const backTo = computed(() => ({
  name: 'party-combats',
  params: { partyId: session.value?.partyId || 'sense-grup' },
}));

const aliveCount = computed(() =>
  session.value?.groups.reduce((n, g) => n + g.bodies.filter(b => b.currentPV > 0).length, 0) ?? 0);
const enemyCount = computed(() =>
  session.value?.groups.reduce((n, g) => n + g.bodies.length, 0) ?? 0);
</script>

<template>
  <div v-if="session" class="tracker-page">
    <!-- The GM's control strip: it never scrolls away mid-fight. -->
    <header class="tracker-bar">
      <router-link class="back-link" :to="backTo">← Combats</router-link>

      <div class="bar-info">
        <span><strong>{{ aliveCount }}</strong>/{{ enemyCount }} enemics dempeus</span>
        <span class="dot">·</span>
        <span>victòria prevista <strong>{{ Math.round(session.summary.predictedWinrate * 100) }}%</strong></span>
        <span class="dot">·</span>
        <span>~<strong>{{ session.summary.avgRounds.toFixed(1) }}</strong> rondes</span>
      </div>

      <div class="bar-actions">
        <label class="switch" title="Què veuen els jugadors a la seva pantalla">
          <input v-model="session.revealPV" type="checkbox" @change="touch()">
          <span>PV exactes als jugadors</span>
        </label>
        <a class="bar-btn primary" :href="playersHref" target="_blank" rel="noopener">
          Vista dels jugadors ↗
        </a>
        <button type="button" class="bar-btn" @click="resetCombat">Reinicia</button>
        <button type="button" class="bar-btn danger" @click="discardTracker">Esborra</button>
      </div>
    </header>

    <!-- One panel per creature: the kit is shown once, the trackers repeat. -->
    <section
      v-for="g in session.groups" :key="g.enemyId"
      class="panel group"
      :style="{ '--class-color': `var(--class-${defOf(g.enemyId)?.classCss})` }"
    >
      <div class="group-head">
        <img class="group-icon" :src="base + (defOf(g.enemyId)?.iconPath ?? '')" alt="">
        <!-- The GM names the lot on the table: «Els guàrdies del pont» beats
             «Goblin» when two groups of the same creature are in one fight.
             Blank falls back to the creature's own name. -->
        <input
          class="group-name-input"
          type="text"
          :value="g.name"
          :placeholder="defOf(g.enemyId)?.displayName"
          :title="`Nom d'aquest grup (per defecte: ${defOf(g.enemyId)?.displayName})`"
          @change="renameGroup(g, ($event.target as HTMLInputElement).value)"
        >
        <span class="group-meta">
          ×{{ g.bodies.length }} · nivell <strong>{{ g.level }}</strong> ·
          <strong>{{ g.pv }}</strong> PV
          <template v-if="groupArmor(g) > 0"> · armadura <strong>{{ groupArmor(g) }}</strong></template>
        </span>
      </div>

      <ul class="card-list">
        <li class="card-label">
          <img :src="base + CARD_ICON" alt="">Cartes
        </li>
        <li
          v-for="c in groupCards(g)" :key="c.key"
          class="card-name"
          :style="{ '--type-color': `var(--type-${c.typeCss}, var(--parchment-dark))` }"
        >{{ c.name }}</li>
      </ul>

      <div class="bodies">
        <div v-for="(b, i) in g.bodies" :key="b.uid" class="body-card" :class="{ down: b.currentPV <= 0 }">
          <input
            class="name-input" type="text"
            :value="b.name ?? ''"
            :placeholder="bodyName(g, i)"
            title="Nom d'aquest enemic (buit = segueix el nom del grup)"
            @change="renameBody(g, i, ($event.target as HTMLInputElement).value)"
          >
          <PvTracker :current="b.currentPV" :max="b.maxPV" @update="setPV(b, $event)" />
        </div>
      </div>

    </section>
  </div>

  <div v-else-if="missing" class="empty">
    <p>Aquest combat ja no existeix (o es va crear en un altre navegador).</p>
    <router-link :to="backTo" class="bar-btn primary">Torna als combats</router-link>
  </div>
</template>

<style scoped>
.tracker-page { max-width: 1250px; margin: 0 auto; padding-bottom: 3rem; }

.tracker-bar {
  position: sticky; top: 0; z-index: 20;
  display: flex; align-items: center; gap: 1.2rem; flex-wrap: wrap;
  padding: 0.7rem 1rem; margin: -1.5rem -1.5rem 2rem;
  background: var(--bg-dark);
  border-bottom: 1px solid rgba(232, 220, 196, 0.2);
}
.back-link {
  font-family: 'MedievalSharp', serif; font-size: 0.95rem;
  color: var(--parchment-dark); text-decoration: none;
  padding: 0.25rem 0.6rem 0.25rem 0;
  border-right: 1px solid rgba(232, 220, 196, 0.2);
  transition: color 0.15s;
}
.back-link:hover { color: var(--parchment); }

.bar-info {
  font-family: 'Crimson Text', serif; color: var(--parchment-dark);
  display: flex; gap: 0.4rem; flex-wrap: wrap;
}
.bar-info strong { color: var(--parchment); }
.bar-info .dot { opacity: 0.5; }
.bar-actions { margin-left: auto; display: flex; align-items: center; gap: 0.6rem; flex-wrap: wrap; }

.switch {
  display: flex; align-items: center; gap: 0.4rem; cursor: pointer;
  font-family: 'Crimson Text', serif; color: var(--parchment-dark);
}
.switch input { accent-color: var(--parchment); }
.switch:hover { color: var(--parchment); }

.bar-btn {
  font-family: 'MedievalSharp', serif; font-size: 0.9rem;
  color: var(--parchment-dark); background: rgba(0, 0, 0, 0.25);
  border: 1px solid var(--parchment-dark); border-radius: 4px;
  padding: 0.35rem 0.8rem; cursor: pointer; text-decoration: none;
  transition: all 0.15s;
}
.bar-btn:hover { color: var(--parchment); background: rgba(232, 220, 196, 0.14); }
.bar-btn.primary { color: var(--parchment); border-color: var(--parchment); }
.bar-btn.danger:hover { color: #e0705f; border-color: #e0705f; }

.panel {
  background: rgba(0, 0, 0, 0.16);
  border: 1px solid rgba(232, 220, 196, 0.22);
  border-radius: 8px;
  padding: 1rem 1.2rem 1.2rem;
  margin-bottom: 1.2rem;
}
.panel.group { border-left: 4px solid var(--class-color, var(--parchment-dark)); }
.panel-title {
  font-family: 'Cinzel Decorative', serif; color: var(--parchment);
  font-size: 1.15rem; margin: 0 0 0.9rem;
}
.panel-title.flush { margin: 0; }

.group-head { display: flex; align-items: center; gap: 0.8rem; flex-wrap: wrap; margin-bottom: 1rem; }
/* Reads as the panel's heading, but is a text field — the dotted rule is the
   standing hint that the GM can rename this lot. */
.group-name-input {
  font-family: 'Cinzel Decorative', serif; font-size: 1.15rem;
  color: var(--parchment); background: rgba(0, 0, 0, 0.2);
  border: 1px solid transparent; border-bottom: 1px dotted var(--parchment-dark);
  border-radius: 4px; padding: 0.15rem 0.45rem; min-width: 8rem;
}
.group-name-input::placeholder { color: var(--parchment); opacity: 0.75; }
.group-name-input:hover { background: rgba(232, 220, 196, 0.08); }
.group-name-input:focus {
  outline: none; background: rgba(0, 0, 0, 0.35);
  border-color: var(--parchment); border-bottom-style: solid;
}
.group-icon {
  width: 40px; height: 40px;
  filter: invert(85%) sepia(15%) saturate(360%) hue-rotate(2deg) brightness(95%);
}
.group-meta { font-family: 'Crimson Text', serif; color: var(--parchment-dark); }
.group-meta strong { color: var(--parchment); }

.bodies { display: flex; flex-wrap: wrap; gap: 0.8rem; }

.body-card {
  display: flex; flex-direction: column; align-items: center; gap: 0.45rem;
  position: relative;
  min-width: 11.5rem;
  padding: 0.7rem 0.9rem;
  background: rgba(0, 0, 0, 0.25);
  border: 1px solid var(--parchment-dark);
  border-radius: 6px;
  transition: opacity 0.2s;
}
.body-card.down { opacity: 0.45; }

/* Editable, and it has to LOOK it: the underline used to be transparent until
   hover, so a GM had no way to know a body could be renamed. */
.name-input {
  width: 100%; text-align: center;
  font-family: 'MedievalSharp', serif; font-size: 1rem;
  color: var(--parchment); background: rgba(0, 0, 0, 0.18);
  border: 1px solid transparent; border-bottom: 1px dotted var(--parchment-dark);
  border-radius: 3px; padding: 0.1rem 0.25rem;
}
.name-input:hover { background: rgba(232, 220, 196, 0.08); }
.name-input:focus {
  outline: none; background: rgba(0, 0, 0, 0.32);
  border-color: var(--parchment); border-bottom-style: solid;
}

/* The kit as a checklist: the GM plays from the printed deck, so the screen
   only needs to say WHICH cards this creature holds at its level. */
.card-list {
  list-style: none; margin: 0 0 1rem; padding: 0;
  display: flex; flex-wrap: wrap; align-items: center; gap: 0.4rem;
}
.card-label {
  display: flex; align-items: center; gap: 0.35rem;
  font-family: 'Crimson Text', serif; font-style: italic;
  color: var(--parchment-dark); font-size: 0.9rem;
  padding-right: 0.2rem;
}
.card-label img {
  width: 17px; height: 17px;
  filter: invert(85%) sepia(15%) saturate(360%) hue-rotate(2deg) brightness(95%);
  opacity: 0.75;
}
.card-name {
  font-family: 'MedievalSharp', serif; font-size: 0.95rem;
  color: var(--parchment);
  background: rgba(0, 0, 0, 0.25);
  border: 1px solid rgba(232, 220, 196, 0.18);
  border-left: 3px solid var(--type-color);
  border-radius: 4px;
  padding: 0.25rem 0.6rem;
}

.empty {
  text-align: center; padding: 4rem 1rem;
  font-family: 'Crimson Text', serif; color: var(--parchment-dark);
}
.empty p { margin-bottom: 1.2rem; }

@media print {
  .tracker-bar { display: none !important; }
}
</style>
