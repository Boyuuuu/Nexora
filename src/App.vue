<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import AppNav from './components/AppNav.vue'

const route = useRoute()
const isWorkspace = computed(() => route.meta.workspace === true)
</script>

<template>
  <div class="app-shell" :class="{ 'is-workspace': isWorkspace }">
    <AppNav v-if="!isWorkspace" />
    <main class="app-main" :class="{ 'is-workspace': isWorkspace }">
      <RouterView />
    </main>
  </div>
</template>

<style scoped>
.app-shell {
  min-height: 100vh;
}

.app-shell.is-workspace,
.app-main.is-workspace {
  height: 100vh;
  min-height: 100vh;
  overflow: hidden;
}

.app-main {
  min-height: calc(100vh - 3.5rem);
}

.app-main.is-workspace {
  min-height: 100vh;
}
</style>
