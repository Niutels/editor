import type { LandrushPoint2 } from '@/components/landrush/types'
import {
  LANDRUSH_ISLAND_AMBIENT_DAY_PALM_INSTANCE_COUNT,
  LANDRUSH_ISLAND_AMBIENT_PALM_INSTANCE_COUNT,
  LANDRUSH_ISLAND_AMBIENT_PALMS,
} from './landrush-island-ambient-catalog'
import type { ZombieEscapeCollisionCircleSource } from './zombie-escape-collision-world'

export type LandrushIslandPalmPlacement = Readonly<{
  catalogIndex: number
  heightMeters: number
  id: string
  instanceIndex: number
  position: LandrushPoint2
  trunkRadiusMeters: number
}>

export type LandrushIslandAmbientPalmSlot = Readonly<{
  instanceIndex: number
  visible: boolean
}>

export function createLandrushIslandPalmLayout({
  center,
  instanceCount = LANDRUSH_ISLAND_AMBIENT_PALM_INSTANCE_COUNT,
  shoreline,
}: {
  center: LandrushPoint2
  instanceCount?: number
  shoreline: readonly LandrushPoint2[]
}): readonly LandrushIslandPalmPlacement[] {
  return Array.from({ length: instanceCount }, (_, instanceIndex) => {
    const catalogIndex = instanceIndex % LANDRUSH_ISLAND_AMBIENT_PALMS.length
    const palm = LANDRUSH_ISLAND_AMBIENT_PALMS[catalogIndex]!
    const sizeFactor = 0.9 + (instanceIndex % 5) * 0.035
    return {
      catalogIndex,
      heightMeters: palm.heightMeters * sizeFactor,
      id: `palm:${String(instanceIndex)}`,
      instanceIndex,
      position: resolveLandrushIslandAmbientPalmPosition({
        center,
        dayInstanceCount: LANDRUSH_ISLAND_AMBIENT_DAY_PALM_INSTANCE_COUNT,
        instanceCount,
        instanceIndex,
        shoreline,
      }),
      trunkRadiusMeters: palm.trunkRadiusMeters * sizeFactor,
    }
  })
}

export function resolveLandrushIslandPalmLayoutCenter(points: readonly LandrushPoint2[]) {
  if (points.length === 0) return { x: 0, z: 0 }
  let x = 0
  let z = 0
  for (const point of points) {
    x += point.x
    z += point.z
  }
  return { x: x / points.length, z: z / points.length }
}

export function createLandrushIslandPalmCollisionCircles({
  layout,
  origin,
}: {
  layout: readonly LandrushIslandPalmPlacement[]
  origin: Readonly<{ x: number; z: number }>
}): readonly ZombieEscapeCollisionCircleSource[] {
  return layout.map((placement) => ({
    breakable: false,
    id: `${placement.id}:trunk`,
    maximumY: placement.heightMeters,
    minimumY: 0,
    navigationLayerY: 0,
    objectId: placement.id,
    radius: placement.trunkRadiusMeters,
    x: placement.position.x - origin.x,
    z: placement.position.z - origin.z,
  }))
}

export function resolveLandrushIslandAmbientPalmSlots({
  catalogIndex,
  catalogSize,
  dayInstanceCount,
  instanceCount,
  zombieIslandActive,
}: {
  catalogIndex: number
  catalogSize: number
  dayInstanceCount: number
  instanceCount: number
  zombieIslandActive: boolean
}): readonly LandrushIslandAmbientPalmSlot[] {
  const slots: LandrushIslandAmbientPalmSlot[] = []
  for (
    let instanceIndex = catalogIndex;
    instanceIndex < instanceCount;
    instanceIndex += catalogSize
  ) {
    slots.push({
      instanceIndex,
      visible: zombieIslandActive || instanceIndex < dayInstanceCount,
    })
  }
  return slots
}

export function resolveLandrushIslandAmbientPalmPosition({
  center,
  dayInstanceCount,
  instanceCount,
  instanceIndex,
  shoreline,
}: {
  center: LandrushPoint2
  dayInstanceCount: number
  instanceCount: number
  instanceIndex: number
  shoreline: readonly LandrushPoint2[]
}): LandrushPoint2 {
  const daySlot = instanceIndex < dayInstanceCount
  const placementCount = daySlot ? dayInstanceCount : instanceCount
  const inset = daySlot ? 0.82 : 0.77 + (instanceIndex % 3) * 0.035
  const point =
    shoreline[
      Math.floor(((instanceIndex + 0.55) * shoreline.length) / Math.max(1, placementCount)) %
        shoreline.length
    ]
  if (!point) return center
  return {
    x: center.x + (point.x - center.x) * inset,
    z: center.z + (point.z - center.z) * inset,
  }
}
