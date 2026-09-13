<script setup lang="ts">
</script>

<template>
  <section class="home">
    <p class="eyebrow">Nexora｜知域</p>
    <h1>AI-native Knowledge Exploration</h1>
    <p class="lead">
      本地优先的知识探索应用。当前已落地 Knowledge Data Layer（IndexedDB），编辑器与图谱 UI
      仍在后续阶段。
    </p>

    <div class="actions">
      <RouterLink class="cta" to="/test-lab">打开数据层测试台</RouterLink>
    </div>

    <ul class="cards">
      <li>
        <h2>Workspace</h2>
        <p>顶层知识空间，挂载笔记、图谱、对话与资源引用。</p>
      </li>
      <li>
        <h2>Note · Block</h2>
        <p>结构化笔记与最小知识单元，类型与 data 判别联合绑定。</p>
      </li>
      <li>
        <h2>Graph</h2>
        <p>Node / Edge 内嵌于 Workspace，可关联 Note。</p>
      </li>
    </ul>
  </section>
</template>

<style scoped>
.home {
  max-width: 880px;
  margin: 0 auto;
  padding: 2.5rem 1.25rem 4rem;
}

.eyebrow {
  margin: 0 0 0.5rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  font-size: 0.75rem;
  color: var(--accent);
  font-weight: 700;
}

h1 {
  margin: 0;
  font-family: var(--display);
  font-size: clamp(2rem, 5vw, 3rem);
  line-height: 1.12;
  max-width: 14ch;
}

.lead {
  margin: 1rem 0 0;
  max-width: 38rem;
  color: var(--muted);
  font-size: 1.05rem;
}

.actions {
  margin-top: 1.5rem;
}

.cta {
  display: inline-flex;
  align-items: center;
  padding: 0.65rem 1.1rem;
  border-radius: 10px;
  background: var(--accent);
  color: var(--accent-ink);
  text-decoration: none;
  font-weight: 600;
}

.cta:hover {
  filter: brightness(1.05);
}

.cards {
  list-style: none;
  margin: 2.5rem 0 0;
  padding: 0;
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 0.85rem;
}

.cards li {
  background: var(--panel);
  border: 1px solid var(--line);
  border-radius: 14px;
  padding: 1rem 1.1rem;
}

.cards h2 {
  margin: 0 0 0.35rem;
  font-family: var(--display);
  font-size: 1.15rem;
}

.cards p {
  margin: 0;
  color: var(--muted);
  font-size: 0.95rem;
}
</style>
