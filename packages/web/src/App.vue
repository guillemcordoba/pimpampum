<script setup lang="ts">
import { useRoute } from 'vue-router';
import AppLayout from './components/AppLayout.vue';

// `bare` routes (the players' table screen) render edge to edge, with no app
// chrome: they live on a projector or a second monitor, not in a browsing session.
const route = useRoute();
</script>

<template>
  <router-view v-if="route.meta.bare" />
  <AppLayout v-else>
    <router-view />
  </AppLayout>
</template>
