<script setup lang="ts">
</script>

<template>
  <div class="home-page">
    <h1 class="screen-title">Pim Pam Pum</h1>
    <p class="screen-subtitle">Sistema de combat per jocs de rol de taula</p>

    <div class="nav-tiles">
      <router-link to="/rules" class="nav-tile">
        <div class="nav-tile-icon">&#9997;</div>
        <div class="nav-tile-title">Regles</div>
        <div class="nav-tile-desc">Resum de les regles de combat</div>
      </router-link>

      <router-link to="/cards" class="nav-tile">
        <div class="nav-tile-icon">&#9812;</div>
        <div class="nav-tile-title">Cartes</div>
        <div class="nav-tile-desc">Classes, objectes i enemics</div>
      </router-link>

      <router-link to="/trets" class="nav-tile">
        <div class="nav-tile-icon">&#9733;</div>
        <div class="nav-tile-title">Trets</div>
        <div class="nav-tile-desc">Trets i resolució fora de combat</div>
      </router-link>

      <router-link to="/combat" class="nav-tile">
        <div class="nav-tile-icon">&#9876;</div>
        <div class="nav-tile-title">Combat</div>
        <div class="nav-tile-desc">Juga una batalla al navegador</div>
      </router-link>
    </div>
  </div>
</template>

<style scoped>
.home-page {
  text-align: center;
  padding: 2rem 1rem;
}

.nav-tiles {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 1.5rem;
  max-width: 900px;
  margin: 2rem auto 0;
}

.nav-tile {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 2rem 1.5rem;
  background: rgba(232, 220, 196, 0.08);
  border: 2px solid rgba(232, 220, 196, 0.2);
  border-radius: 10px;
  text-decoration: none;
  color: var(--parchment);
  transition: all 0.2s;
}

.nav-tile:hover {
  background: rgba(232, 220, 196, 0.15);
  border-color: var(--parchment-dark);
  transform: translateY(-3px);
}

.nav-tile-icon {
  font-size: 2.5rem;
  margin-bottom: 0.75rem;
}

.nav-tile-title {
  font-family: 'Cinzel Decorative', serif;
  font-size: 1.3rem;
  margin-bottom: 0.5rem;
}

.nav-tile-desc {
  font-family: 'Crimson Text', Georgia, serif;
  font-size: 0.95rem;
  color: var(--parchment-dark);
}
</style>
