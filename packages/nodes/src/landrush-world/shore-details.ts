import type { LandrushWorldNode } from '@pascal-app/core'
import type {
  LandrushCoastTower,
  LandrushDock,
  LandrushDockPlank,
  LandrushParcelYardDetail,
  LandrushShoreRock,
  LandrushShoreTerrace,
  Point2,
} from './render-types'
import { createStyleRandom } from './render-utils'

const SHORE_TERRACE_COLORS = ['#8f8170', '#b6a386', '#74695e', '#d3be91'] as const

export function createParcelYardDetails(
  seed: string,
  parcels: LandrushWorldNode['parcels'],
): LandrushParcelYardDetail[] {
  return parcels.flatMap((parcel) => {
    if (parcel.kind === 'owner') return []

    const random = createStyleRandom(`${seed}:yard:${parcel.id}`)
    const entryVector = {
      x: parcel.entryPoint.x - parcel.centroid.x,
      z: parcel.entryPoint.z - parcel.centroid.z,
    }
    const entryLength = Math.max(Math.hypot(entryVector.x, entryVector.z), 0.001)
    const rotation = Math.atan2(entryVector.x, entryVector.z)
    const walkLength = Math.max(1.2, entryLength * 0.46)
    const walkCenter = {
      x: parcel.centroid.x + (entryVector.x / entryLength) * walkLength * 0.54,
      z: parcel.centroid.z + (entryVector.z / entryLength) * walkLength * 0.54,
    }
    const side = random() > 0.5 ? 1 : -1
    const sideVector = {
      x: Math.cos(rotation) * side,
      z: -Math.sin(rotation) * side,
    }

    return [
      {
        color: '#e5dbc0',
        footprint: [0.72, 0.05, walkLength] as [number, number, number],
        id: `yard-walk-${parcel.id}`,
        parcelId: parcel.id,
        position: [walkCenter.x, 0.34, walkCenter.z] as [number, number, number],
        rotation,
        type: 'walk' as const,
      },
      {
        color: random() > 0.45 ? '#7aa44e' : '#6d9146',
        footprint: [
          Math.max(1.25, parcel.radius * (0.24 + random() * 0.1)),
          0.12,
          Math.max(0.85, parcel.radius * (0.15 + random() * 0.1)),
        ] as [number, number, number],
        id: `yard-garden-${parcel.id}`,
        parcelId: parcel.id,
        position: [
          parcel.centroid.x + sideVector.x * parcel.radius * (0.46 + random() * 0.1),
          0.37,
          parcel.centroid.z + sideVector.z * parcel.radius * (0.34 + random() * 0.12),
        ] as [number, number, number],
        rotation: rotation + (random() - 0.5) * 0.5,
        type: 'garden' as const,
      },
      {
        color: '#3d6f35',
        footprint: [Math.max(1.15, parcel.radius * (0.26 + random() * 0.08)), 0.38, 0.28] as [
          number,
          number,
          number,
        ],
        id: `yard-hedge-${parcel.id}`,
        parcelId: parcel.id,
        position: [
          parcel.centroid.x - sideVector.x * parcel.radius * (0.54 + random() * 0.08),
          0.53,
          parcel.centroid.z - sideVector.z * parcel.radius * (0.42 + random() * 0.08),
        ] as [number, number, number],
        rotation: rotation + Math.PI / 2 + (random() - 0.5) * 0.24,
        type: 'hedge' as const,
      },
    ]
  })
}

export function createDocks(seed: string, perimeter: readonly Point2[]): LandrushDock[] {
  const random = createStyleRandom(`${seed}:docks`)
  const candidates = perimeter
    .slice(0, -1)
    .map((point, index) => {
      const next = perimeter[index + 1]
      if (!next) return null
      const edgeVector = { x: next.x - point.x, z: next.z - point.z }
      const edgeLength = Math.hypot(edgeVector.x, edgeVector.z)
      if (edgeLength < 2.8) return null
      const midpoint = { x: (point.x + next.x) / 2, z: (point.z + next.z) / 2 }
      const score =
        midpoint.x < -24 ? -midpoint.x + Math.abs(midpoint.z) * 0.12 : midpoint.z < -30 ? 34 : 0
      return score > 0 ? { edgeLength, edgeVector, midpoint, score } : null
    })
    .filter((candidate): candidate is NonNullable<typeof candidate> => Boolean(candidate))
    .sort((a, b) => b.score - a.score)

  return candidates.slice(0, 2).map((candidate, dockIndex) => {
    const edgeLength = Math.max(candidate.edgeLength, 0.001)
    const tangent = {
      x: candidate.edgeVector.x / edgeLength,
      z: candidate.edgeVector.z / edgeLength,
    }
    const inwardNormal = { x: -tangent.z, z: tangent.x }
    const outward = { x: -inwardNormal.x, z: -inwardNormal.z }
    const rotation = Math.atan2(outward.x, outward.z)
    const length = 5.4 + random() * 2.4
    const start = {
      x: candidate.midpoint.x + outward.x * 1.25,
      z: candidate.midpoint.z + outward.z * 1.25,
    }
    const center = {
      x: start.x + outward.x * length * 0.45,
      z: start.z + outward.z * length * 0.45,
    }
    const width = 1.5 + random() * 0.35
    const planks: LandrushDockPlank[] = [
      {
        footprint: [width, 0.16, length] as [number, number, number],
        position: [center.x, 0.22, center.z],
        rotation,
      },
    ]

    for (let index = 0; index < 4; index += 1) {
      const t = index / 3 - 0.5
      planks.push({
        footprint: [width + 0.22, 0.06, 0.18] as [number, number, number],
        position: [center.x + outward.x * t * length, 0.34, center.z + outward.z * t * length],
        rotation,
      })
    }

    const posts: [number, number, number][] = []
    for (const t of [-0.42, 0.18, 0.48] as const) {
      for (const side of [-1, 1] as const) {
        posts.push([
          center.x + outward.x * t * length + tangent.x * side * width * 0.56,
          0.32,
          center.z + outward.z * t * length + tangent.z * side * width * 0.56,
        ])
      }
    }

    return {
      id: `dock-${dockIndex}`,
      planks,
      posts,
    }
  })
}

export function createCoastTower(perimeter: readonly Point2[]): LandrushCoastTower | null {
  let best: { point: Point2; score: number } | null = null

  for (const point of perimeter.slice(0, -1)) {
    const score = -point.x + Math.max(0, point.z) * 0.18
    if (!best || score > best.score) {
      best = { point, score }
    }
  }

  if (!best) return null

  return {
    id: 'coast-tower',
    position: [best.point.x * 0.92, 0.28, best.point.z * 0.88],
    rotation: Math.atan2(-best.point.x, -best.point.z),
  }
}

export function createShoreTerraces(
  seed: string,
  perimeter: readonly Point2[],
): LandrushShoreTerrace[] {
  const random = createStyleRandom(`${seed}:shore-terraces`)
  const terraces: LandrushShoreTerrace[] = []
  let terraceIndex = 0

  for (let index = 0; index < perimeter.length - 1; index += 1) {
    const start = perimeter[index]
    const end = perimeter[index + 1]
    if (!(start && end)) continue

    const edgeVector = { x: end.x - start.x, z: end.z - start.z }
    const edgeLength = Math.hypot(edgeVector.x, edgeVector.z)
    if (edgeLength < 1.6) continue

    const midpoint = {
      x: (start.x + end.x) / 2,
      z: (start.z + end.z) / 2,
    }
    const cliffBias = midpoint.x < -20 || midpoint.z < -28 || (midpoint.x < -8 && midpoint.z > 22)
    if (!cliffBias && random() > 0.2) continue

    const tangent = {
      x: edgeVector.x / Math.max(edgeLength, 0.001),
      z: edgeVector.z / Math.max(edgeLength, 0.001),
    }
    const inwardNormal = { x: -tangent.z, z: tangent.x }
    const outward = { x: -inwardNormal.x, z: -inwardNormal.z }
    const count = cliffBias ? 2 + Math.floor(random() * 3) : 1

    for (let item = 0; item < count; item += 1) {
      const t = count === 1 ? 0.5 : (item + 0.45 + random() * 0.18) / count
      const base = {
        x: start.x + edgeVector.x * t,
        z: start.z + edgeVector.z * t,
      }
      const layer = item % 3
      const length = Math.min(edgeLength * (0.46 + random() * 0.22), 4.8)
      const depth = 1.2 + random() * 1.6
      const offset = 1.3 + layer * 1.05 + random() * 0.65

      terraces.push({
        color: SHORE_TERRACE_COLORS[(terraceIndex + layer) % SHORE_TERRACE_COLORS.length]!,
        id: `shore-terrace-${terraceIndex}`,
        position: [base.x + outward.x * offset, -0.38 - layer * 0.22, base.z + outward.z * offset],
        rotation: [
          (random() - 0.5) * 0.18,
          Math.atan2(tangent.x, tangent.z) + (random() - 0.5) * 0.24,
          (random() - 0.5) * 0.18,
        ],
        scale: [Math.max(0.9, length), 0.46 + random() * 0.44, depth],
      })
      terraceIndex += 1
    }
  }

  return terraces
}

export function createShoreRocks(seed: string, perimeter: readonly Point2[]): LandrushShoreRock[] {
  const random = createStyleRandom(`${seed}:shore-rocks`)
  const rocks: LandrushShoreRock[] = []
  let rockIndex = 0

  for (let index = 0; index < perimeter.length - 1; index += 1) {
    const start = perimeter[index]
    const end = perimeter[index + 1]
    if (!(start && end)) continue
    const segmentLength = Math.hypot(end.x - start.x, end.z - start.z)
    if (segmentLength < 1.2) continue

    const midpoint = {
      x: (start.x + end.x) / 2,
      z: (start.z + end.z) / 2,
    }
    const edgeVector = { x: end.x - start.x, z: end.z - start.z }
    const edgeLength = Math.max(segmentLength, 0.001)
    const inwardNormal = { x: -edgeVector.z / edgeLength, z: edgeVector.x / edgeLength }
    const outsideBias = midpoint.x < -14 || midpoint.z < -21 ? 0.78 : 0.22
    if (random() > outsideBias) continue

    const count = outsideBias > 0.5 && segmentLength > 3.8 && random() > 0.45 ? 2 : 1
    for (let item = 0; item < count; item += 1) {
      const t = count === 1 ? 0.5 : 0.28 + item * 0.44
      const base = {
        x: start.x + (end.x - start.x) * t,
        z: start.z + (end.z - start.z) * t,
      }
      const shape = outsideBias > 0.5 && random() > 0.32 ? 'cliff' : 'rock'
      const offset = shape === 'cliff' ? 2.6 + random() * 1.6 : 1.7 + random() * 2.4
      const position: [number, number, number] = [
        base.x - inwardNormal.x * offset,
        shape === 'cliff' ? -0.36 : -0.03,
        base.z - inwardNormal.z * offset,
      ]
      const scale: [number, number, number] =
        shape === 'cliff'
          ? [0.85 + random() * 1.45, 0.48 + random() * 0.92, 0.7 + random() * 1.45]
          : [0.38 + random() * 0.82, 0.22 + random() * 0.54, 0.38 + random() * 0.88]

      rocks.push({
        color: shape === 'cliff' ? '#9c907b' : random() > 0.45 ? '#b8ae97' : '#766f63',
        id: `shore-rock-${rockIndex}`,
        position,
        rotation: [
          (random() - 0.5) * 0.28,
          Math.atan2(edgeVector.x, edgeVector.z) + (random() - 0.5) * 0.8,
          (random() - 0.5) * 0.28,
        ],
        scale,
        shape,
      })
      rockIndex += 1
    }
  }

  return rocks
}
