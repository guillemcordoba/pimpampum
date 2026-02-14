<script setup lang="ts">
import { useRoute } from 'vue-router';

const route = useRoute();
</script>

<template>
  <nav class="app-nav no-print">
    <router-link to="/" class="nav-title">Pim Pam Pum</router-link>
    <div class="nav-links">
      <router-link to="/rules" :class="{ active: route.path === '/rules' }">Regles</router-link>
      <router-link to="/cards" :class="{ active: route.path.startsWith('/cards') }">Cartes</router-link>
      <router-link to="/combat" :class="{ active: route.path === '/combat' }">Combat</router-link>
    </div>
  </nav>
  <main>
    <slot />
  </main>
</template>

<style scoped>
.app-nav {
  position: sticky;
  top: 0;
  z-index: 100;
  display: flex;
  align-items: center;
  gap: 2rem;
  padding: 0.75rem 1.5rem;
  background: var(--bg-dark);
  border-bottom: 1px solid rgba(232, 220, 196, 0.15);
}

.nav-title {
  font-family: 'Cinzel Decorative', serif;
  font-size: 1.3rem;
  color: var(--parchment);
  text-decoration: none;
  letter-spacing: 1px;
  white-space: nowrap;
}

.nav-links {
  display: flex;
  gap: 1.5rem;
  flex-wrap: wrap;
}

.nav-links a {
  font-family: 'MedievalSharp', serif;
  font-size: 1.05rem;
  color: var(--parchment-dark);
  text-decoration: none;
  padding: 0.3rem 0;
  border-bottom: 2px solid transparent;
  transition: all 0.2s;
}

.nav-links a:hover {
  color: var(--parchment);
}

.nav-links a.active,
.nav-links a.router-link-exact-active {
  color: var(--parchment);
  border-bottom-color: var(--parchment-dark);
}

main {
  padding: 1.5rem;
}

@media print {
  .no-print {
    display: none !important;
  }
}
</style>
