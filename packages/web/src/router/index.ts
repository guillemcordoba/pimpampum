import { createRouter, createWebHistory } from 'vue-router';

const router = createRouter({
  history: createWebHistory('/pimpampum/'),
  routes: [
    {
      path: '/',
      name: 'home',
      component: () => import('../views/HomeView.vue'),
    },
    {
      // Everything about setting up a fight lives under one tab: build an
      // encounter, run one against real players, or play one against the AI.
      path: '/combats',
      component: () => import('../views/CombatsView.vue'),
      children: [
        { path: '', redirect: { name: 'encounters' } },
        {
          path: 'creador',
          name: 'encounters',
          component: () => import('../views/EncounterCreatorView.vue'),
        },
        {
          // The combats run at a table are filed under the PARTY that fought
          // them: this is the list of parties, one level up from the fights.
          path: 'jugadors',
          name: 'player-combats',
          component: () => import('../views/PlayerCombatsView.vue'),
        },
        {
          // One party's history. A literal `grup/` segment keeps it clear of
          // `jugadors/:id`, which is a combat — the tracker URLs predate this
          // screen and are read aloud at tables, so they do not move.
          path: 'jugadors/grup/:partyId',
          name: 'party-combats',
          component: () => import('../views/PartyCombatsView.vue'),
        },
        {
          // One combat being run by a GM at a real table: the enemy cards plus
          // a PV tracker per body, kept in localStorage under the id in the URL
          // so a refresh loses nothing. Renders without the sub-tab strip — it
          // is a focused screen with its own bar and a way back to the list.
          path: 'jugadors/:id',
          name: 'tracker',
          component: () => import('../views/TrackerView.vue'),
        },
        {
          path: 'ia',
          name: 'ai-combat',
          component: () => import('../views/CombatView.vue'),
        },
      ],
    },
    {
      // The same combat, read-only, for a second screen the players watch.
      // Top-level (not a /combats child) so it gets no app chrome at all.
      path: '/combats/jugadors/:id/pantalla',
      name: 'tracker-players',
      component: () => import('../views/TrackerPlayersView.vue'),
      meta: { bare: true },
    },
    // The paths these screens used to live at.
    { path: '/combat', redirect: { name: 'ai-combat' } },
    { path: '/encounters', redirect: { name: 'encounters' } },
    { path: '/tracker/:id', redirect: to => ({ name: 'tracker', params: to.params }) },
    { path: '/tracker/:id/players', redirect: to => ({ name: 'tracker-players', params: to.params }) },
    {
      path: '/skills',
      name: 'skills',
      component: () => import('../views/CardsView.vue'),
    },
    {
      path: '/objects',
      name: 'objects',
      component: () => import('../views/ObjectsView.vue'),
    },
    {
      path: '/enemies',
      name: 'enemies',
      component: () => import('../views/EnemiesView.vue'),
    },
    {
      path: '/rules',
      name: 'rules',
      component: () => import('../views/RulesView.vue'),
    },
  ],
});

export default router;
