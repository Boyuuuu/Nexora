<script setup lang="ts">
defineProps<{ name: 'sidebar' | 'search' | 'close' | 'note' | 'chat' | 'plus' | 'more' | 'chevron' | 'folder' | 'canvas' | 'download' | 'upload' | 'reset' | 'fit' | 'undo' | 'trash' | 'connection' }>()
</script>

<template>
  <svg
    class="app-icon"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="1.7"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
    focusable="false"
  >
    <template v-if="name === 'sidebar'">
      <rect x="3" y="4" width="18" height="16" rx="3" />
      <path d="M9 4v16" />
    </template>
    <template v-else-if="name === 'search'">
      <circle cx="10.75" cy="10.75" r="6.75" />
      <path d="m16 16 4.5 4.5" />
    </template>
    <path v-else-if="name === 'close'" d="m6 6 12 12M18 6 6 18" />
    <path v-else-if="name === 'reset'" d="M3 10a9 9 0 1 1 2 8M3 4v6h6" />
    <path v-else-if="name === 'fit'" d="M8 3H3v5M16 3h5v5M21 16v5h-5M8 21H3v-5M9 9h6v6H9Z" />
    <path v-else-if="name === 'undo'" d="m8 4-5 5 5 5M3 9h11a6 6 0 0 1 0 12h-3" />
    <path v-else-if="name === 'trash'" d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7M14 10v7" />
    <template v-else-if="name === 'connection'">
      <circle cx="5" cy="5" r="2" /><circle cx="19" cy="19" r="2" /><path d="M7 5h5a3 3 0 0 1 3 3v8a3 3 0 0 0 2 3" />
    </template>
    <path v-else-if="name === 'chat'" d="M21 11.5a8.5 8.5 0 0 1-8.5 8.5H7l-4 2V7a4 4 0 0 1 4-4h5.5a8.5 8.5 0 0 1 8.5 8.5Z" />
    <path v-else-if="name === 'plus'" d="M12 5v14M5 12h14" />
    <path v-else-if="name === 'download'" d="M12 3v12m-5-5 5 5 5-5M4 16v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3" />
    <path v-else-if="name === 'upload'" d="M12 15V3m-5 5 5-5 5 5M4 16v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3" />
    <template v-else-if="name === 'more'">
      <circle cx="5" cy="12" r="1" fill="currentColor" />
      <circle cx="12" cy="12" r="1" fill="currentColor" />
      <circle cx="19" cy="12" r="1" fill="currentColor" />
    </template>
    <path v-else-if="name === 'chevron'" d="m9 5 7 7-7 7" />
    <path v-else-if="name === 'folder'" d="M3 7V5a2 2 0 0 1 2-2h5l2 3h7a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z" />
    <template v-else-if="name === 'canvas'">
      <rect x="8" y="3" width="8" height="6" rx="1.5" />
      <rect x="2" y="16" width="7" height="5" rx="1.5" />
      <rect x="15" y="16" width="7" height="5" rx="1.5" />
      <path d="M12 9v4M5.5 16v-3h13v3" />
    </template>
    <template v-else>
      <path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9Z" />
      <path d="M14 3v6h6M8 13h8M8 17h5" />
    </template>
  </svg>
</template>

<style scoped>
.app-icon {
  width: var(--icon-size);
  height: var(--icon-size);
  flex: none;
}
</style>
