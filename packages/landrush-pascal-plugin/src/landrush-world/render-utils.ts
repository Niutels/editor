import {
  DataTexture,
  LinearFilter,
  RepeatWrapping,
  RGBAFormat,
  Shape,
  UnsignedByteType,
} from 'three'
import type { Point2 } from './render-types'
import type { LandrushWorldNode } from './schema'

export function expandBounds(
  bounds: LandrushWorldNode['perimeter']['bounds'],
  padding: number,
): LandrushWorldNode['perimeter']['bounds'] {
  return {
    minX: bounds.minX - padding,
    maxX: bounds.maxX + padding,
    minZ: bounds.minZ - padding,
    maxZ: bounds.maxZ + padding,
    width: bounds.width + padding * 2,
    depth: bounds.depth + padding * 2,
  }
}

export function shapeFromPoints(points: readonly Point2[]): Shape {
  const shape = new Shape()
  const first = points[0]
  if (!first) return shape

  shape.moveTo(first.x, -first.z)
  for (let index = 1; index < points.length; index += 1) {
    const point = points[index]
    if (point) shape.lineTo(point.x, -point.z)
  }
  shape.closePath()
  return shape
}

export function pointInPolygon(point: Point2, polygon: readonly Point2[]) {
  let inside = false
  for (let index = 0, previousIndex = polygon.length - 1; index < polygon.length; index += 1) {
    const current = polygon[index]
    const previous = polygon[previousIndex]
    if (!(current && previous)) continue

    const intersects =
      current.z > point.z !== previous.z > point.z &&
      point.x <
        ((previous.x - current.x) * (point.z - current.z)) / (previous.z - current.z || 0.000001) +
          current.x
    if (intersects) inside = !inside
    previousIndex = index
  }
  return inside
}

export function createStyleRandom(seed: string) {
  let hash = hashSeed(seed)
  return () => {
    hash += 0x6d2b79f5
    let value = hash
    value = Math.imul(value ^ (value >>> 15), value | 1)
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61)
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296
  }
}

export function hashSeed(seed: string) {
  let hash = 2166136261
  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}

export function createProceduralTexture(
  data: Uint8Array,
  width: number,
  height: number,
  worldSize?: number,
) {
  const texture = new DataTexture(data, width, height, RGBAFormat, UnsignedByteType)
  texture.magFilter = LinearFilter
  texture.minFilter = LinearFilter
  texture.wrapS = RepeatWrapping
  texture.wrapT = RepeatWrapping
  if (worldSize) {
    texture.repeat.set(1 / worldSize, 1 / worldSize)
    texture.offset.set(0.5, 0.5)
  }
  texture.needsUpdate = true
  return texture
}

export function smoothstep(edge0: number, edge1: number, value: number) {
  const t = clamp01((value - edge0) / (edge1 - edge0))
  return t * t * (3 - 2 * t)
}

export function hexToRgb(color: string) {
  return {
    r: Number.parseInt(color.slice(1, 3), 16),
    g: Number.parseInt(color.slice(3, 5), 16),
    b: Number.parseInt(color.slice(5, 7), 16),
  }
}

export function mixRgb(
  a: { r: number; g: number; b: number },
  b: { r: number; g: number; b: number },
  t: number,
) {
  return {
    r: clampByte(lerp(a.r, b.r, t)),
    g: clampByte(lerp(a.g, b.g, t)),
    b: clampByte(lerp(a.b, b.b, t)),
  }
}

export function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t
}

export function clamp01(value: number) {
  return Math.max(0, Math.min(1, value))
}

export function clampByte(value: number) {
  return Math.max(0, Math.min(255, Math.round(value)))
}
