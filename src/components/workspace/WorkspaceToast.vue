<script setup lang="ts">
import { useWorkspaceUi } from '../../composables/useWorkspaceUi'

const ui = useWorkspaceUi()
</script>

<template>
  <Teleport to="body">
    <p v-if="ui.toast.value" class="toast" role="status" @click="ui.dismissToast()">
      {{ ui.toast.value }}
    </p>
  </Teleport>
</template>

<style scoped>
.toast {
  position: fixed;
  left: 50%;
  bottom: 1.25rem;
  transform: translateX(-50%);
  z-index: 90;
  margin: 0;
  max-width: min(420px, calc(100vw - 2rem));
  white-space: pre-line;
  background: #1c1917;
  color: #fafaf9;
  border-radius: 10px;
  padding: 0.7rem 0.95rem;
  font-size: 0.92rem;
  line-height: 1.45;
  box-shadow: 0 10px 28px rgba(28, 25, 23, 0.18);
  cursor: pointer;
}
</style>
