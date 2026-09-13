<template>
  <!-- Temporary test navigation: remove this component's two mounts for release. -->
  <details class="test-tools">
    <summary>测试工具</summary>
    <nav aria-label="开发测试">
      <RouterLink to="/test-lab">数据层</RouterLink>
      <RouterLink to="/operation-lab">操作层</RouterLink>
    </nav>
  </details>
</template>

<style scoped>
.test-tools { color: var(--muted); font-size: 12px; }
summary { width: fit-content; padding: 6px 8px; border-radius: var(--control-radius); cursor: pointer; }
summary::marker { font-size: 9px; }
nav { display: flex; gap: 4px; padding: 2px 0 0 8px; }
a { display: inline-flex; align-items: center; min-height: 32px; padding: 4px 8px; color: var(--muted); border-radius: var(--control-radius); text-decoration: none; }
summary:hover, a:hover { background: var(--control-hover); color: var(--ink); }
summary:focus-visible, a:focus-visible { outline: 2px solid var(--accent); outline-offset: -2px; }
</style>
