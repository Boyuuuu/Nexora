import type { Graph, GraphNodePosition } from '../data'
import { NODE_H, NODE_W } from './canvasGeometry'

/** Deterministic layered layout. Collapse cycles before ranking so any graph can be tidied. */
export function arrangeGraph(graph: Graph): Record<string, GraphNodePosition> {
  const ids = graph.nodes.map(n => n.id)
  const outgoing = new Map(ids.map(id => [id, new Set<string>()]))
  for (const edge of graph.edges) {
    if (outgoing.has(edge.source) && outgoing.has(edge.target)) outgoing.get(edge.source)!.add(edge.target)
  }
  const indices = new Map<string, number>(), low = new Map<string, number>()
  const stack: string[] = [], active = new Set<string>(), groups: string[][] = []
  let cursor = 0
  function visit(id: string): void {
    indices.set(id, cursor); low.set(id, cursor++)
    stack.push(id); active.add(id)
    for (const next of outgoing.get(id)!) {
      if (!indices.has(next)) { visit(next); low.set(id, Math.min(low.get(id)!, low.get(next)!)) }
      else if (active.has(next)) low.set(id, Math.min(low.get(id)!, indices.get(next)!))
    }
    if (indices.get(id) === low.get(id)) {
      const group: string[] = []
      let item: string
      do { item = stack.pop()!; active.delete(item); group.push(item) } while (item !== id)
      groups.push(group)
    }
  }
  ids.forEach(id => { if (!indices.has(id)) visit(id) })
  const membership = new Map(groups.flatMap((group, index) => group.map(id => [id, index] as const)))
  const successors = groups.map(() => new Set<number>())
  const degrees = groups.map(() => 0), ranks = groups.map(() => 0)
  for (const [id, targets] of outgoing) for (const next of targets) {
    const a = membership.get(id)!, b = membership.get(next)!
    if (a !== b && !successors[a]!.has(b)) { successors[a]!.add(b); degrees[b]!++ }
  }
  const queue = degrees.flatMap((degree, index) => degree === 0 ? [index] : [])
  for (let i = 0; i < queue.length; i++) {
    const group = queue[i]!
    for (const next of successors[group]!) {
      ranks[next] = Math.max(ranks[next]!, ranks[group]! + 1)
      if (--degrees[next]! === 0) queue.push(next)
    }
  }
  const layers: string[][] = []
  for (const id of ids) (layers[ranks[membership.get(id)!]!] ??= []).push(id)
  const neighbours = new Map(ids.map(id => [id, new Set<string>()]))
  for (const [id, targets] of outgoing) for (const next of targets) {
    neighbours.get(id)!.add(next); neighbours.get(next)!.add(id)
  }
  // Barycentric sweeps reduce crossings while retaining stable ties.
  const order = new Map<string, number>()
  const updateOrder = () => layers.forEach(layer => layer.forEach((id, index) => order.set(id, index - (layer.length - 1) / 2)))
  updateOrder()
  for (let pass = 0; pass < 4; pass++) {
    const sequence = pass % 2 ? [...layers].reverse() : layers
    for (const layer of sequence) {
      const score = (id: string) => {
        const adjacent = [...neighbours.get(id)!].filter(next => !layer.includes(next))
        return adjacent.length ? adjacent.reduce((sum, next) => sum + order.get(next)!, 0) / adjacent.length : order.get(id)!
      }
      const scores = new Map(layer.map(id => [id, score(id)]))
      layer.sort((a, b) => scores.get(a)! - scores.get(b)!)
      updateOrder()
    }
  }
  const maxColumns = Math.max(1, Math.ceil(Math.sqrt(ids.length) * 1.6))
  const rows = layers.flatMap(layer => {
    const result: string[][] = []
    for (let i = 0; i < layer.length; i += maxColumns) result.push(layer.slice(i, i + maxColumns))
    return result
  })
  const columns = Math.max(1, ...rows.map(row => row.length))
  return Object.fromEntries(rows.flatMap((row, y) => row.map((id, x) => [id, {
    x: Math.round(64 + (x + (columns - row.length) / 2) * (NODE_W + 64)),
    y: 64 + y * (NODE_H + 76),
  }])))
}
