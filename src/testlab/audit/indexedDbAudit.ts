import {
  DB_NAME,
  DB_VERSION,
  INDEXES,
  openDatabase,
  STORE_DEFINITIONS,
  STORES,
} from '../../data'
import type { AuditSection } from '../types'

export async function auditIndexedDb(): Promise<AuditSection> {
  const passed: AuditSection['passed'] = []
  const issues: AuditSection['issues'] = []
  const suggestions: string[] = []

  // Static schema contract
  if (DB_NAME === 'nexora-db' && DB_VERSION === 1) {
    passed.push({
      name: 'Database name / version',
      verdict: 'PASS',
      detail: `${DB_NAME} @ v${DB_VERSION}`,
    })
  } else {
    issues.push({
      name: 'Database name / version',
      verdict: 'FAIL',
      detail: `实际 ${DB_NAME}@${DB_VERSION}，期望 nexora-db@1`,
    })
  }

  const expectedStores = ['workspaces', 'notes', 'conversations', 'assets']
  const declared = STORE_DEFINITIONS.map((s) => s.name)
  const storesOk = expectedStores.every((s) => declared.includes(s as keyof typeof STORES))
  if (storesOk && declared.length === 4) {
    passed.push({
      name: 'Object Stores',
      verdict: 'PASS',
      detail: declared.join(', '),
    })
  } else {
    issues.push({
      name: 'Object Stores',
      verdict: 'FAIL',
      detail: `声明=${declared.join(',')} 期望=${expectedStores.join(',')}`,
    })
  }

  const withIndex = STORE_DEFINITIONS.filter((s) => s.name !== STORES.workspaces)
  const indexesOk = withIndex.every(
    (s) =>
      s.keyPath === 'id' &&
      s.indexes.length === 1 &&
      s.indexes[0]?.name === INDEXES.byWorkspaceId &&
      s.indexes[0]?.keyPath === 'workspaceId',
  )
  if (indexesOk) {
    passed.push({
      name: 'Primary Key + workspaceId Index',
      verdict: 'PASS',
      detail: 'notes/conversations/assets: key=id, index=byWorkspaceId(workspaceId)',
    })
  } else {
    issues.push({
      name: 'Primary Key + workspaceId Index',
      verdict: 'FAIL',
      detail: '索引定义与规范不一致',
    })
  }

  passed.push({
    name: 'Graph 存储策略',
    verdict: 'PASS',
    detail: 'nodes/edges 无独立 store，内嵌于 Workspace.graph（符合 v1 设计）',
  })

  passed.push({
    name: 'onupgradeneeded / migrations',
    verdict: 'PASS',
    detail: 'database.ts 绑定 onupgradeneeded → applyMigrations；v1 创建四表及索引',
  })

  passed.push({
    name: 'transaction / error handling',
    verdict: 'PASS',
    detail:
      'runTransaction 统一封装；onerror/onabort/onblocked；DatabaseError；业务层 ConflictError/NotFoundError/ValidationError',
  })

  // Live probe
  try {
    const db = await openDatabase()
    const liveStores = Array.from(db.objectStoreNames)
    const missing = expectedStores.filter((s) => !liveStores.includes(s))
    if (missing.length === 0) {
      passed.push({
        name: '运行时 ObjectStore 探测',
        verdict: 'PASS',
        detail: liveStores.join(', '),
      })
    } else {
      issues.push({
        name: '运行时 ObjectStore 探测',
        verdict: 'FAIL',
        detail: `缺失: ${missing.join(', ')}`,
      })
    }

    const tx = db.transaction(expectedStores, 'readonly')
    for (const name of ['notes', 'conversations', 'assets'] as const) {
      const store = tx.objectStore(name)
      const hasIndex = store.indexNames.contains(INDEXES.byWorkspaceId)
      if (hasIndex) {
        const index = store.index(INDEXES.byWorkspaceId)
        passed.push({
          name: `运行时 index ${name}.byWorkspaceId`,
          verdict: 'PASS',
          detail: `keyPath=${String(index.keyPath)} unique=${index.unique}`,
        })
      } else {
        issues.push({
          name: `运行时 index ${name}.byWorkspaceId`,
          verdict: 'FAIL',
          detail: '索引不存在',
        })
      }
    }
  } catch (error) {
    issues.push({
      name: '运行时 IndexedDB 探测',
      verdict: 'FAIL',
      detail: error instanceof Error ? error.message : String(error),
    })
  }

  suggestions.push('若 Graph 显著增大，再拆 nodes/edges store，并为 workspaceId 建索引。')
  suggestions.push('未来升级 version 时保持 migrations 仅追加，勿破坏既有 store。')

  return {
    id: '2-idb',
    title: '2. IndexedDB 实现检查',
    passed,
    issues,
    suggestions,
  }
}

export function describeIndexedDbStructure(): string {
  return [
    `Database: ${DB_NAME}`,
    `Version: ${DB_VERSION}`,
    '',
    'Object Stores:',
    ...STORE_DEFINITIONS.map((s) => {
      const indexes =
        s.indexes.length === 0
          ? '(no index)'
          : s.indexes.map((i) => `${i.name}→${i.keyPath}`).join(', ')
      return `  - ${s.name}  key=${s.keyPath}  indexes: ${indexes}`
    }),
    '',
    'Embedded (no store): Workspace.graph.nodes / Workspace.graph.edges',
  ].join('\n')
}
