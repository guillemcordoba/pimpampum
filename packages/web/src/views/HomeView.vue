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

      <router-link to="/skills" class="nav-tile">
        <div class="nav-tile-icon">&#9812;</div>
        <div class="nav-tile-title">Habilitats</div>
        <div class="nav-tile-desc">Habilitats i les seves accions</div>
      </router-link>

      <router-link to="/objects" class="nav-tile">
        <div class="nav-tile-icon">&#128737;</div>
        <div class="nav-tile-title">Objectes</div>
        <div class="nav-tile-desc">Equipament i objectes</div>
      </router-link>

      <router-link to="/enemies" class="nav-tile">
        <div class="nav-tile-icon">&#9760;</div>
        <div class="nav-tile-title">Enemics</div>
        <div class="nav-tile-desc">Enemics i les seves accions</div>
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
  padding: 1rem;
  min-height: calc(100vh - 6.5rem);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
}

.home-page .screen-title {
  margin: 0.5rem 0;
}

.home-page .screen-subtitle {
  margin-bottom: 1.25rem;
}

.nav-tiles {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 1.25rem;
  max-width: 900px;
  width: 100%;
  margin: 1.5rem auto 0;
}

.nav-tile {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 1.4rem 1.5rem;
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
  font-size: 2rem;
  margin-bottom: 0.5rem;
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
