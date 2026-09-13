<script setup lang="ts">
import AppIcon from './AppIcon.vue'
import { RouterLink, type RouteLocationRaw } from 'vue-router'

withDefaults(defineProps<{
  icon: 'sidebar' | 'search' | 'close' | 'chat' | 'plus' | 'more' | 'download' | 'reset' | 'fit' | 'undo' | 'trash'
  to?: RouteLocationRaw
  label: string
  text?: string
  size?: 'default' | 'compact'
  tooltipAlign?: 'start' | 'center' | 'end'
}>(), { tooltipAlign: 'center', size: 'default' })
</script>

<template>
  <component
    :is="to ? RouterLink : 'button'"
    :to="to"
    :type="to ? undefined : 'button'"
    class="icon-button"
    :class="[`tooltip-${tooltipAlign}`, `size-${size}`, { 'with-text': text }]"
    :aria-label="label"
    :data-tooltip="label"
  >
    <AppIcon :name="icon" />
    <span v-if="text">{{ text }}</span>
  </component>
</template>

<style scoped>
.icon-button {
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: none;
  width: var(--control-size);
  height: var(--control-size);
  padding: 0;
  text-decoration: none;
  border: 0;
  border-radius: var(--control-radius);
  background: transparent;
  color: var(--muted);
  transition: color 140ms ease, background-color 140ms ease;
}

.icon-button:hover:not(:disabled),
.icon-button:focus-visible {
  background: var(--control-hover);
  color: var(--ink);
}

.size-compact {
  --control-size: 32px;
  --icon-size: 16px;
}

.with-text {
  width: auto;
  gap: 6px;
  padding: 0 10px;
  font: 500 14px/1 var(--sans);
}

.icon-button:active:not(:disabled) {
  background: var(--control-active);
}

.icon-button:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}

.icon-button::after {
  content: attr(data-tooltip);
  position: absolute;
  top: calc(100% + 8px);
  left: 50%;
  transform: translateX(-50%);
  z-index: 100;
  padding: 5px 9px;
  border-radius: 6px;
  background: var(--ink);
  color: var(--panel);
  font: 12px/1.4 var(--sans);
  white-space: nowrap;
  pointer-events: none;
  opacity: 0;
  visibility: hidden;
}

.icon-button:hover:not(:disabled)::after,
.icon-button:focus-visible::after {
  opacity: 1;
  visibility: visible;
  transition: opacity 120ms ease 250ms, visibility 0s linear 250ms;
}

.tooltip-start::after {
  left: 0;
  transform: none;
}

.tooltip-end::after {
  left: auto;
  right: 0;
  transform: none;
}

@media (prefers-reduced-motion: reduce) {
  .icon-button {
    transition: none;
  }
}
</style>
