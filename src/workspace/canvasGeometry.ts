import type { GraphNodePosition } from '../data'

// Shared by the cards, connectors, hit testing and layout.
export const NODE_W = 208
export const NODE_H = 120
export const PORT_SIDES = ['top', 'right', 'bottom', 'left'] as const
export type PortSide = (typeof PORT_SIDES)[number]
type Point = GraphNodePosition
export type Port = Point & { side: PortSide; nx: number; ny: number }

export function portAt(position: Point, side: PortSide): Port {
  const { x, y } = position
  switch (side) {
    case 'top': return { x: x + NODE_W / 2, y, nx: 0, ny: -1, side }
    case 'right': return { x: x + NODE_W, y: y + NODE_H / 2, nx: 1, ny: 0, side }
    case 'bottom': return { x: x + NODE_W / 2, y: y + NODE_H, nx: 0, ny: 1, side }
    case 'left': return { x, y: y + NODE_H / 2, nx: -1, ny: 0, side }
  }
}

/** Choose facing ports from the dominant direction, accounting for the card's aspect ratio. */
export function facingPorts(source: Point, target: Point): { source: Port; target: Port } {
  const dx = target.x - source.x, dy = target.y - source.y
  if (Math.abs(dx) / NODE_W > Math.abs(dy) / NODE_H) {
    return { source: portAt(source, dx >= 0 ? 'right' : 'left'), target: portAt(target, dx >= 0 ? 'left' : 'right') }
  }
  return { source: portAt(source, dy >= 0 ? 'bottom' : 'top'), target: portAt(target, dy >= 0 ? 'top' : 'bottom') }
}

export function curveBetween(a: Port, b: Port, lane = 0): string {
  const distance = Math.hypot(b.x - a.x, b.y - a.y)
  const bend = Math.min(120, distance * 0.45)
  const dx = b.x - a.x, dy = b.y - a.y
  const offsetX = distance ? -dy / distance * lane : lane
  const offsetY = distance ? dx / distance * lane : 0
  return `M ${a.x} ${a.y} C ${a.x + a.nx * bend + offsetX} ${a.y + a.ny * bend + offsetY}, ${b.x + b.nx * bend + offsetX} ${b.y + b.ny * bend + offsetY}, ${b.x} ${b.y}`
}

export function connectionPath(source: Point, target: Point, lane = 0): string {
  // Overlapping rectangles have no exposed facing pair. Route around their outside.
  if (source.x < target.x + NODE_W && source.x + NODE_W > target.x && source.y < target.y + NODE_H && source.y + NODE_H > target.y) {
    const a = portAt(source, 'top'), b = portAt(target, 'right')
    const top = Math.min(source.y, target.y) - 60 - Math.abs(lane)
    const right = Math.max(source.x, target.x) + NODE_W + 60 + Math.abs(lane)
    return `M ${a.x} ${a.y} C ${a.x} ${top}, ${right} ${top}, ${right} ${b.y} Q ${right} ${b.y} ${b.x} ${b.y}`
  }
  const ports = facingPorts(source, target)
  return curveBetween(ports.source, ports.target, lane)
}

export function fallbackPosition(index: number): Point {
  return { x: 64 + (index % 3) * (NODE_W + 64), y: 64 + Math.floor(index / 3) * (NODE_H + 88) }
}

export function fitViewport(positions: Point[], width: number, height: number): Point & { zoom: number } {
  if (!positions.length) return { x: 48, y: 36, zoom: 1 }
  const minX = Math.min(...positions.map(p => p.x)), minY = Math.min(...positions.map(p => p.y))
  const graphWidth = Math.max(...positions.map(p => p.x)) + NODE_W - minX
  const graphHeight = Math.max(...positions.map(p => p.y)) + NODE_H - minY
  // Do not impose a minimum zoom that would crop a large graph after reset.
  const zoom = Math.min(1.1, Math.max(1, width - 96) / graphWidth, Math.max(1, height - 112) / graphHeight)
  return { x: (width - graphWidth * zoom) / 2 - minX * zoom, y: (height - graphHeight * zoom) / 2 - minY * zoom, zoom }
}
