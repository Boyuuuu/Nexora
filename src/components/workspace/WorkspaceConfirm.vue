<script setup lang="ts">
import { useWorkspaceUi } from '../../composables/useWorkspaceUi'

const ui = useWorkspaceUi()

function onBackdrop(): void {
  ui.resolveConfirm(false)
}
</script>

<template>
  <Teleport to="body">
    <div v-if="ui.confirmRequest.value" class="overlay" @click.self="onBackdrop">
      <div class="dialog" role="dialog" aria-modal="true">
        <h2>{{ ui.confirmRequest.value.title }}</h2>
        <p>{{ ui.confirmRequest.value.message }}</p>
        <div class="actions">
          <button type="button" class="ghost" @click="ui.resolveConfirm(false)">Cancel</button>
          <button
            type="button"
            :class="ui.confirmRequest.value.danger ? 'danger' : 'primary'"
            @click="ui.resolveConfirm(true)"
          >
            {{ ui.confirmRequest.value.confirmLabel ?? 'Confirm' }}
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.overlay {
  position: fixed;
  inset: 0;
  background: rgba(28, 25, 23, 0.28);
  display: grid;
  place-items: center;
  z-index: 80;
  padding: 1.5rem;
}

.dialog {
  width: min(100%, 380px);
  background: var(--panel);
  border: 1px solid var(--line);
  border-radius: 14px;
  padding: 1.25rem 1.3rem 1.1rem;
  box-shadow: 0 16px 40px rgba(28, 25, 23, 0.08);
}

h2 {
  margin: 0;
  font-family: var(--display);
  font-size: 1.2rem;
}

p {
  margin: 0.55rem 0 0;
  color: var(--muted);
  font-size: 0.95rem;
}

.actions {
  display: flex;
  justify-content: flex-end;
  gap: 0.5rem;
  margin-top: 1.15rem;
}

button.danger {
  background: #9f1239;
  border-color: #9f1239;
  color: #fff;
  font-weight: 600;
}
</style>
