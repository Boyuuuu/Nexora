<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { OPERATION_ERROR_CODES, OPERATION_TYPES } from '../operations'
import { runOperationSuite } from '../testlab/suites/operationSuite'
import { runStoreSuite } from '../testlab/suites/storeSuite'
import {
  cleanupOperationFixture,
  hasOperationFixture,
  runOperationScenario,
  verifyOperationScenario,
} from '../testlab/suites/operationPersistenceSuite'
import type { SuiteResult } from '../testlab/types'
import { allPass } from '../testlab/types'

const busy = ref(false)
const status = ref('就绪')
const suite = ref<SuiteResult | null>(null)
const scenario = ref<SuiteResult | null>(null)
const reload = ref<SuiteResult | null>(null)
const store = ref<SuiteResult | null>(null)
const fixtureReady = ref(false)

const pipeline = [
  'Operation',
  '  ↓',
  'Operation Engine   (dispatch)',
  '  ↓',
  'Validation         (target / parent / id / reference / type / data)',
  '  ↓',
  'Repository         (one write = one IndexedDB transaction)',
  '  ↓',
  'IndexedDB',
].join('\n')

onMounted(() => {
  fixtureReady.value = hasOperationFixture()
})

async function withBusy(label: string, work: () => Promise<void>) {
  if (busy.value) return
  busy.value = true
  status.value = label
  try {
    await work()
    status.value = '完成'
  } catch (error) {
    status.value = error instanceof Error ? error.message : String(error)
  } finally {
    busy.value = false
    fixtureReady.value = hasOperationFixture()
  }
}

async function runSuite() {
  await withBusy('运行 Operation 测试…', async () => {
    suite.value = await runOperationSuite()
  })
}

async function runScenario() {
  await withBusy('执行 10 个 Operation…', async () => {
    scenario.value = await runOperationScenario()
    reload.value = null
  })
}

async function runReload() {
  await withBusy('重读 IndexedDB…', async () => {
    reload.value = await verifyOperationScenario()
  })
}

async function cleanup() {
  await withBusy('清理 Fixture…', async () => {
    status.value = await cleanupOperationFixture()
    scenario.value = null
    reload.value = null
  })
}

async function runStore() {
  await withBusy('测试 Store 层…', async () => {
    store.value = await runStoreSuite()
  })
}

async function runAll() {
  await withBusy('运行全部…', async () => {
    suite.value = await runOperationSuite()
    scenario.value = await runOperationScenario()
    reload.value = await verifyOperationScenario()
    store.value = await runStoreSuite()
  })
}

function suiteClass(result: SuiteResult | null): string {
  if (!result) return ''
  return allPass(result.items) ? 'ok' : 'bad'
}
</script>

<template>
  <div class="lab">
    <header class="hero">
      <div>
        <p class="eyebrow">Nexora｜知域</p>
        <h1>Operations Layer Test Lab</h1>
        <p class="sub">
          所有修改都通过 Operation Engine 下发：Block 的 create / delete / update / move，Graph 的
          node 与 edge 操作，以及错误场景与刷新后的持久化验证。
        </p>
      </div>
      <div class="hero-actions">
        <button class="primary" :disabled="busy" @click="runAll">一键跑完全部</button>
        <p class="status">{{ status }}</p>
      </div>
    </header>

    <section class="panel">
      <div class="panel-head">
        <h2>执行链路</h2>
      </div>
      <pre class="structure">{{ pipeline }}</pre>
      <h3>Operation ({{ OPERATION_TYPES.length }})</h3>
      <p class="muted">{{ OPERATION_TYPES.join(' · ') }}</p>
      <h3>Error Code ({{ OPERATION_ERROR_CODES.length }})</h3>
      <p class="muted">{{ OPERATION_ERROR_CODES.join(' · ') }}</p>
    </section>

    <section class="panel" :class="suiteClass(suite)">
      <div class="panel-head">
        <h2>1. Operation Engine 测试</h2>
        <button :disabled="busy" @click="runSuite">运行测试</button>
      </div>
      <p v-if="suite" class="summary">{{ suite.summary }}</p>
      <ul v-if="suite" class="checks">
        <li
          v-for="item in suite.items"
          :key="item.name"
          :class="item.verdict === 'PASS' ? 'pass' : 'fail'"
        >
          <strong>{{ item.verdict }} · {{ item.name }}</strong>
          <span>{{ item.detail }}</span>
        </li>
      </ul>
      <ul v-if="suite?.issues.length" class="suggestions">
        <li v-for="(issue, i) in suite.issues" :key="i">{{ issue }}</li>
      </ul>
    </section>

    <section class="panel">
      <div class="panel-head">
        <h2>2. 完整场景 + 刷新验证</h2>
        <div class="btn-row">
          <button :disabled="busy" @click="runScenario">2A 执行 10 个 Operation</button>
          <button :disabled="busy || !fixtureReady" @click="runReload">2B 刷新后重读</button>
          <button class="ghost" :disabled="busy" @click="cleanup">清理 Fixture</button>
        </div>
      </div>
      <p class="hint">
        流程：点 2A → 刷新页面 → 点 2B。Fixture id 存在 localStorage，所以刷新后仍能定位同一份
        IndexedDB 数据。当前 fixture：{{ fixtureReady ? '已就绪' : '无' }}
      </p>

      <div v-if="scenario" :class="['subpanel', suiteClass(scenario)]">
        <h3>{{ scenario.title }} · {{ scenario.summary }}</h3>
        <ul class="checks">
          <li
            v-for="item in scenario.items"
            :key="item.name"
            :class="item.verdict === 'PASS' ? 'pass' : 'fail'"
          >
            <strong>{{ item.verdict }} · {{ item.name }}</strong>
            <span>{{ item.detail }}</span>
          </li>
        </ul>
      </div>

      <div v-if="reload" :class="['subpanel', suiteClass(reload)]">
        <h3>{{ reload.title }} · {{ reload.summary }}</h3>
        <ul class="checks">
          <li
            v-for="item in reload.items"
            :key="item.name"
            :class="item.verdict === 'PASS' ? 'pass' : 'fail'"
          >
            <strong>{{ item.verdict }} · {{ item.name }}</strong>
            <span>{{ item.detail }}</span>
          </li>
        </ul>
      </div>
    </section>

    <section class="panel" :class="suiteClass(store)">
      <div class="panel-head">
        <h2>3. Store 层测试</h2>
        <button :disabled="busy" @click="runStore">运行测试</button>
      </div>
      <p class="hint">
        界面用的那一层：执行 Operation 后状态是否自动与 IndexedDB 对齐，失败时是否只上抛错误而不改动数据。
      </p>
      <p v-if="store" class="summary">{{ store.summary }}</p>
      <ul v-if="store" class="checks">
        <li
          v-for="item in store.items"
          :key="item.name"
          :class="item.verdict === 'PASS' ? 'pass' : 'fail'"
        >
          <strong>{{ item.verdict }} · {{ item.name }}</strong>
          <span>{{ item.detail }}</span>
        </li>
      </ul>
      <ul v-if="store?.issues.length" class="suggestions">
        <li v-for="(issue, i) in store.issues" :key="i">{{ issue }}</li>
      </ul>
    </section>
  </div>
</template>
