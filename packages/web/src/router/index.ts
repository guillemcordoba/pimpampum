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
      path: '/combat',
      name: 'combat',
      component: () => import('../views/CombatView.vue'),
    },
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
