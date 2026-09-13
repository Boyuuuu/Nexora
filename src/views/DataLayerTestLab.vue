<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { auditTypeSystem } from '../testlab/audit/typeAudit'
import {
  auditIndexedDb,
  describeIndexedDbStructure,
} from '../testlab/audit/indexedDbAudit'
import { runWorkspaceNoteSuite } from '../testlab/suites/workspaceNoteSuite'
import { runBlockSuite } from '../testlab/suites/blockSuite'
import { runGraphConvAssetSuite } from '../testlab/suites/graphConvAssetSuite'
import {
  buildScorecard,
  cleanupPersistenceFixture,
  hasPersistFixture,
  seedPersistenceFixture,
  verifyPersistenceFixture,
} from '../testlab/suites/persistenceSuite'
import { runTransferSuite } from '../testlab/suites/transferSuite'
import type { AuditSection, FinalScorecard, SuiteResult } from '../testlab/types'
import { allPass } from '../testlab/types'

const busy = ref(false)
const status = ref('就绪')
const typeAudit = ref<AuditSection | null>(null)
const idbAudit = ref<AuditSection | null>(null)
const idbStructure = ref('')
const workspaceNote = ref<SuiteResult | null>(null)
const block = ref<SuiteResult | null>(null)
const gca = ref<SuiteResult | null>(null)
const persistSeed = ref<SuiteResult | null>(null)
const persistVerify = ref<SuiteResult | null>(null)
const transfer = ref<SuiteResult | null>(null)
const fixtureReady = ref(false)

const scorecard = computed<FinalScorecard | null>(() => {
  if (!typeAudit.value || !idbAudit.value) return null
  const typeOk = typeAudit.value.issues.every((i) => i.verdict !== 'FAIL')
  const idbOk = idbAudit.value.issues.every((i) => i.verdict !== 'FAIL')
  return buildScorecard({
    typeOk,
    idbOk,
    workspaceNote: workspaceNote.value,
    block: block.value,
    gca: gca.value,
    persistSeed: persistSeed.value,
    persistVerify: persistVerify.value,
    transfer: transfer.value,
  })
})

const scoreRows = computed(() => {
  const card = scorecard.value
  if (!card) return []
  return [
    ['Data Model', card.dataModel],
    ['IndexedDB', card.indexedDb],
    ['Workspace', card.workspace],
    ['Note', card.note],
    ['Block', card.block],
    ['Graph', card.graph],
    ['Conversation', card.conversation],
    ['Asset', card.asset],
    ['Persistence', card.persistence],
    ['Transfer', card.transfer],
  ] as const
})

onMounted(() => {
  fixtureReady.value = hasPersistFixture()
  typeAudit.value = auditTypeSystem()
  idbStructure.value = describeIndexedDbStructure()
  void runIdbAudit()
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
    fixtureReady.value = hasPersistFixture()
  }
}

function runTypeAudit() {
  typeAudit.value = auditTypeSystem()
}

async function runIdbAudit() {
  await withBusy('检查 IndexedDB…', async () => {
    idbAudit.value = await auditIndexedDb()
    idbStructure.value = describeIndexedDbStructure()
  })
}

async function runWsNote() {
  await withBusy('测试 Workspace / Note…', async () => {
    workspaceNote.value = await runWorkspaceNoteSuite()
  })
}

async function runBlocks() {
  await withBusy('测试 Block…', async () => {
    block.value = await runBlockSuite()
  })
}

async function runGca() {
  await withBusy('测试 Graph / Conversation / Asset…', async () => {
    gca.value = await runGraphConvAssetSuite()
  })
}

async function runPersistA() {
  await withBusy('写入持久化 Fixture…', async () => {
    persistSeed.value = await seedPersistenceFixture()
    persistVerify.value = null
  })
}

async function runPersistB() {
  await withBusy('重读持久化 Fixture…', async () => {
    persistVerify.value = await verifyPersistenceFixture()
  })
}

async function cleanPersist() {
  await withBusy('清理 Fixture…', async () => {
    status.value = await cleanupPersistenceFixture()
    persistSeed.value = null
    persistVerify.value = null
  })
}

async function runTransfer() {
  await withBusy('测试导出 / 导入…', async () => {
    transfer.value = await runTransferSuite()
  })
}

async function runAll() {
  await withBusy('运行全部检查与测试…', async () => {
    typeAudit.value = auditTypeSystem()
    idbAudit.value = await auditIndexedDb()
    idbStructure.value = describeIndexedDbStructure()
    workspaceNote.value = await runWorkspaceNoteSuite()
    block.value = await runBlockSuite()
    gca.value = await runGraphConvAssetSuite()
    persistSeed.value = await seedPersistenceFixture()
    persistVerify.value = await verifyPersistenceFixture()
    transfer.value = await runTransferSuite()
  })
}

function suiteClass(suite: SuiteResult | null): string {
  if (!suite) return ''
  return allPass(suite.items) ? 'ok' : 'bad'
}
</script>

<template>
  <div class="lab">
    <header class="hero">
      <div>
        <p class="eyebrow">Nexora｜知域</p>
        <h1>Knowledge Data Layer Test Lab</h1>
        <p class="sub">
          静态类型 / IndexedDB 结构检查 + Workspace · Note · Block · Graph · Conversation · Asset ·
          持久化实跑。不修改数据层代码。
        </p>
      </div>
      <div class="hero-actions">
        <button class="primary" :disabled="busy" @click="runAll">一键跑完全部</button>
        <p class="status">{{ status }}</p>
      </div>
    </header>

    <section v-if="scorecard" class="scorecard">
      <h2>最终 Scorecard</h2>
      <div class="grid scores">
        <div
          v-for="[label, value] in scoreRows"
          :key="label"
          :class="['chip', value === 'PASS' ? 'ok' : 'bad']"
        >
          <span>{{ label }}</span>
          <strong>{{ value }}</strong>
        </div>
      </div>
    </section>

    <!-- 1 -->
    <section class="panel">
      <div class="panel-head">
        <h2>1. Knowledge 数据结构检查</h2>
        <button :disabled="busy" @click="runTypeAudit">重新检查</button>
      </div>
      <template v-if="typeAudit">
        <h3>通过项</h3>
        <ul class="checks">
          <li v-for="item in typeAudit.passed" :key="item.name" class="pass">
            <strong>{{ item.name }}</strong>
            <span>{{ item.detail }}</span>
          </li>
        </ul>
        <h3>问题</h3>
        <ul class="checks">
          <li
            v-for="item in typeAudit.issues"
            :key="item.name"
            :class="item.verdict === 'FAIL' ? 'fail' : 'warn'"
          >
            <strong>[{{ item.verdict }}] {{ item.name }}</strong>
            <span>{{ item.detail }}</span>
          </li>
        </ul>
        <h3>修改建议</h3>
        <ul class="suggestions">
          <li v-for="(s, i) in typeAudit.suggestions" :key="i">{{ s }}</li>
        </ul>
      </template>
    </section>

    <!-- 2 -->
    <section class="panel">
      <div class="panel-head">
        <h2>2. IndexedDB 实现检查</h2>
        <button :disabled="busy" @click="runIdbAudit">运行检查</button>
      </div>
      <h3>当前 IndexedDB 结构</h3>
      <pre class="structure">{{ idbStructure }}</pre>
      <template v-if="idbAudit">
        <h3>通过项</h3>
        <ul class="checks">
          <li v-for="item in idbAudit.passed" :key="item.name" class="pass">
            <strong>{{ item.name }}</strong>
            <span>{{ item.detail }}</span>
          </li>
        </ul>
        <h3>问题</h3>
        <ul v-if="idbAudit.issues.length" class="checks">
          <li
            v-for="item in idbAudit.issues"
            :key="item.name"
            :class="item.verdict === 'FAIL' ? 'fail' : 'warn'"
          >
            <strong>[{{ item.verdict }}] {{ item.name }}</strong>
            <span>{{ item.detail }}</span>
          </li>
        </ul>
        <p v-else class="muted">无 FAIL 级问题。</p>
        <h3>修改建议</h3>
        <ul class="suggestions">
          <li v-for="(s, i) in idbAudit.suggestions" :key="i">{{ s }}</li>
        </ul>
      </template>
    </section>

    <!-- 3 -->
    <section class="panel" :class="suiteClass(workspaceNote)">
      <div class="panel-head">
        <h2>3. Workspace & Note 测试</h2>
        <button :disabled="busy" @click="runWsNote">运行测试</button>
      </div>
      <p v-if="workspaceNote" class="summary">{{ workspaceNote.summary }}</p>
      <ul v-if="workspaceNote" class="checks">
        <li
          v-for="item in workspaceNote.items"
          :key="item.name"
          :class="item.verdict === 'PASS' ? 'pass' : 'fail'"
        >
          <strong>{{ item.verdict }} · {{ item.name }}</strong>
          <span>{{ item.detail }}</span>
        </li>
      </ul>
      <ul v-if="workspaceNote?.issues.length" class="suggestions">
        <li v-for="(issue, i) in workspaceNote.issues" :key="i">{{ issue }}</li>
      </ul>
    </section>

    <!-- 4 -->
    <section class="panel" :class="suiteClass(block)">
      <div class="panel-head">
        <h2>4. Block 测试</h2>
        <button :disabled="busy" @click="runBlocks">运行测试</button>
      </div>
      <p v-if="block" class="summary">{{ block.summary }}</p>
      <ul v-if="block" class="checks">
        <li
          v-for="item in block.items"
          :key="item.name"
          :class="item.verdict === 'PASS' ? 'pass' : 'fail'"
        >
          <strong>{{ item.verdict }} · {{ item.name }}</strong>
          <span>{{ item.detail }}</span>
        </li>
      </ul>
    </section>

    <!-- 5 -->
    <section class="panel" :class="suiteClass(gca)">
      <div class="panel-head">
        <h2>5. Graph / Conversation / Asset 测试</h2>
        <button :disabled="busy" @click="runGca">运行测试</button>
      </div>
      <p v-if="gca" class="summary">{{ gca.summary }}</p>
      <ul v-if="gca" class="checks">
        <li
          v-for="item in gca.items"
          :key="item.name"
          :class="item.verdict === 'PASS' ? 'pass' : 'fail'"
        >
          <strong>{{ item.verdict }} · {{ item.name }}</strong>
          <span>{{ item.detail }}</span>
        </li>
      </ul>
    </section>

    <!-- 6 -->
    <section class="panel">
      <div class="panel-head">
        <h2>6. 最终持久化测试</h2>
        <div class="btn-row">
          <button :disabled="busy" @click="runPersistA">6A 写入完整树</button>
          <button :disabled="busy || !fixtureReady" @click="runPersistB">6B 重读验证</button>
          <button class="ghost" :disabled="busy" @click="cleanPersist">清理 Fixture</button>
        </div>
      </div>
      <p class="hint">
        流程：点 6A →（可选刷新页面）→ 点 6B。Fixture id 存在 localStorage，刷新后仍可验证 IndexedDB。
        当前 fixture：{{ fixtureReady ? '已就绪' : '无' }}
      </p>
      <div v-if="persistSeed" :class="['subpanel', suiteClass(persistSeed)]">
        <h3>{{ persistSeed.title }} · {{ persistSeed.summary }}</h3>
        <ul class="checks">
          <li
            v-for="item in persistSeed.items"
            :key="item.name"
            :class="item.verdict === 'PASS' ? 'pass' : 'fail'"
          >
            <strong>{{ item.verdict }} · {{ item.name }}</strong>
            <span>{{ item.detail }}</span>
          </li>
        </ul>
      </div>
      <div v-if="persistVerify" :class="['subpanel', suiteClass(persistVerify)]">
        <h3>{{ persistVerify.title }} · {{ persistVerify.summary }}</h3>
        <ul class="checks">
          <li
            v-for="item in persistVerify.items"
            :key="item.name"
            :class="item.verdict === 'PASS' ? 'pass' : 'fail'"
          >
            <strong>{{ item.verdict }} · {{ item.name }}</strong>
            <span>{{ item.detail }}</span>
          </li>
        </ul>
      </div>
    </section>

    <!-- 7 -->
    <section class="panel" :class="suiteClass(transfer)">
      <div class="panel-head">
        <h2>7. 导出 / 导入（快照）测试</h2>
        <button :disabled="busy" @click="runTransfer">运行测试</button>
      </div>
      <p class="hint">
        导出快照 → 删除 → 恢复 → 覆盖 → 导入副本 → 全量备份 → 单篇笔记，以及非法文件的拒绝路径。
        测试会自建并清理自己的工作区。
      </p>
      <p v-if="transfer" class="summary">{{ transfer.summary }}</p>
      <ul v-if="transfer" class="checks">
        <li
          v-for="item in transfer.items"
          :key="item.name"
          :class="item.verdict === 'PASS' ? 'pass' : 'fail'"
        >
          <strong>{{ item.verdict }} · {{ item.name }}</strong>
          <span>{{ item.detail }}</span>
        </li>
      </ul>
      <ul v-if="transfer?.issues.length" class="suggestions">
        <li v-for="(issue, i) in transfer.issues" :key="i">{{ issue }}</li>
      </ul>
    </section>
  </div>
</template>
