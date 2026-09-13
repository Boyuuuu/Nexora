<script setup lang="ts">
import { useRoute } from 'vue-router'

const route = useRoute()

const primary = [{ to: '/', label: '工作区', match: 'exact' as const }]

const labs = [
  { to: '/test-lab', label: '数据层' },
  { to: '/operation-lab', label: '操作层' },
  { to: '/backup', label: '备份' },
]

function isActive(to: string, match: 'exact' | 'prefix'): boolean {
  return match === 'exact' ? route.path === to : route.path.startsWith(to)
}
</script>

<template>
  <header class="app-nav">
    <RouterLink class="brand" to="/">
      <span class="brand-mark">N</span>
      <span class="brand-text">
        <strong>Nexora</strong>
        <small>知域</small>
      </span>
    </RouterLink>

    <nav class="primary" aria-label="产品">
      <RouterLink
        v-for="link in primary"
        :key="link.to"
        :to="link.to"
        class="nav-link"
        :class="{ 'is-active': isActive(link.to, link.match) }"
      >
        {{ link.label }}
      </RouterLink>
    </nav>

    <nav class="labs" aria-label="测试与工具">
      <span class="labs-label">测试</span>
      <RouterLink
        v-for="link in labs"
        :key="link.to"
        :to="link.to"
        class="nav-link"
        :class="{ 'is-active': isActive(link.to, 'prefix') }"
      >
        {{ link.label }}
      </RouterLink>
    </nav>
  </header>
</template>

<style scoped>
.app-nav {
  display: flex;
  align-items: center;
  gap: 1rem;
  height: 3.5rem;
  padding: 0 1.15rem;
  border-bottom: 1px solid var(--line);
  background: rgba(255, 253, 248, 0.94);
  position: sticky;
  top: 0;
  z-index: 40;
}

.brand {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  text-decoration: none;
  color: inherit;
  flex: none;
}

.brand-mark {
  width: 1.85rem;
  height: 1.85rem;
  border-radius: 8px;
  display: grid;
  place-items: center;
  background: var(--accent);
  color: var(--accent-ink);
  font-family: var(--display);
  font-weight: 700;
}

.brand-text {
  display: flex;
  flex-direction: column;
  line-height: 1.1;
}

.brand-text strong {
  font-family: var(--display);
  font-size: 1.02rem;
}

.brand-text small {
  color: var(--muted);
  font-size: 0.72rem;
}

.primary {
  display: flex;
  align-items: center;
}

.labs {
  display: flex;
  align-items: center;
  gap: 0.15rem;
  margin-left: auto;
  padding-left: 0.85rem;
  border-left: 1px solid var(--line);
}

.labs-label {
  margin-right: 0.25rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  font-size: 0.66rem;
  font-weight: 700;
  color: var(--muted);
}

.nav-link {
  text-decoration: none;
  color: var(--muted);
  padding: 0.32rem 0.7rem;
  border-radius: 999px;
  font-weight: 600;
  font-size: 0.9rem;
}

.nav-link:hover {
  color: var(--ink);
  background: rgba(15, 118, 110, 0.06);
}

.nav-link.is-active {
  color: var(--accent);
  background: rgba(15, 118, 110, 0.1);
}

@media (max-width: 720px) {
  .app-nav {
    height: auto;
    min-height: 3.5rem;
    flex-wrap: wrap;
    padding: 0.55rem 0.85rem;
    gap: 0.45rem 0.75rem;
  }

  .brand-text small {
    display: none;
  }

  .labs {
    width: 100%;
    margin-left: 0;
    padding-left: 0;
    border-left: 0;
    padding-top: 0.15rem;
  }
}
</style>
