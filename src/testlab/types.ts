export type Verdict = 'PASS' | 'FAIL' | 'INFO' | 'WARN'

export interface CheckItem {
  name: string
  verdict: Verdict
  detail: string
}

export interface AuditSection {
  id: string
  title: string
  passed: CheckItem[]
  issues: CheckItem[]
  suggestions: string[]
}

export interface TestItem {
  name: string
  verdict: 'PASS' | 'FAIL'
  detail: string
}

export interface SuiteResult {
  id: string
  title: string
  items: TestItem[]
  summary: string
  issues: string[]
}

export interface FinalScorecard {
  dataModel: 'PASS' | 'FAIL'
  indexedDb: 'PASS' | 'FAIL'
  workspace: 'PASS' | 'FAIL'
  note: 'PASS' | 'FAIL'
  block: 'PASS' | 'FAIL'
  graph: 'PASS' | 'FAIL'
  conversation: 'PASS' | 'FAIL'
  asset: 'PASS' | 'FAIL'
  persistence: 'PASS' | 'FAIL'
  transfer: 'PASS' | 'FAIL'
}

export function allPass(items: TestItem[]): boolean {
  return items.every((item) => item.verdict === 'PASS')
}

export function passCount(items: TestItem[]): string {
  const ok = items.filter((item) => item.verdict === 'PASS').length
  return `${ok}/${items.length}`
}
