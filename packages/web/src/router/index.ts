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
      path: '/cards',
      name: 'cards',
      component: () => import('../views/CardsView.vue'),
    },
    {
      path: '/cards/:section',
      name: 'cards-section',
      component: () => import('../views/CardsView.vue'),
      props: route => ({ section: route.params.section as string }),
    },
    {
      path: '/cards/:section/:id',
      name: 'cards-detail',
      component: () => import('../views/CardsView.vue'),
      props: route => ({
        section: route.params.section as string,
        characterId: route.params.id as string,
      }),
    },
    {
      path: '/rules',
      name: 'rules',
      component: () => import('../views/RulesView.vue'),
    },
  ],
});

export default router;
