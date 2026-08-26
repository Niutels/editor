import { buildFirstPersonColliderWorld, type FirstPersonColliderWorld } from '@landrush/runtime'
import { CylinderGeometry } from 'three'
import type { LandrushPoint2 } from '@/components/landrush/types'
import {
  LANDRUSH_ISLAND_AMBIENT_DAY_PALM_INSTANCE_COUNT,
  LANDRUSH_ISLAND_AMBIENT_PALM_INSTANCE_COUNT,
} from './landrush-island-ambient-catalog'
import {
  createLandrushIslandPalmCollisionCircles,
  type LandrushIslandPalmPlacement,
} from './landrush-island-palm-layout'

const LANDRUSH_ISLAND_PALM_COLLIDER_RADIAL_SEGMENTS = 16
const LANDRUSH_ISLAND_PALM_COLLIDER_THETA_START =
  -Math.PI / 2 - Math.PI / LANDRUSH_ISLAND_PALM_COLLIDER_RADIAL_SEGMENTS

export type LandrushIslandPalmNavigationFootprint = Readonly<{
  id: string
  points: readonly LandrushPoint2[]
}>

export function resolveLandrushIslandVisiblePalmLayout({
  layout,
  zombieIslandActive,
}: {
  layout: readonly LandrushIslandPalmPlacement[]
  zombieIslandActive: boolean
}) {
  const visibleCount = zombieIslandActive
    ? LANDRUSH_ISLAND_AMBIENT_PALM_INSTANCE_COUNT
    : LANDRUSH_ISLAND_AMBIENT_DAY_PALM_INSTANCE_COUNT
  return layout.slice(0, visibleCount)
}

export function createLandrushIslandPalmTrunkColliderWorld({
  groundY,
  layout,
}: {
  groundY: number
  layout: readonly LandrushIslandPalmPlacement[]
}): FirstPersonColliderWorld | null {
  const circles = createLandrushIslandPalmCollisionCircles({
    layout,
    origin: { x: 0, z: 0 },
  })
  const geometries = circles.map((circle) => {
    if (circle.minimumY === undefined || circle.maximumY === undefined) {
      throw new Error(`Palm trunk circle ${circle.id} is missing its vertical bounds.`)
    }
    const height = circle.maximumY - circle.minimumY
    const geometry = new CylinderGeometry(
      circumscribedRadius(circle.radius, LANDRUSH_ISLAND_PALM_COLLIDER_RADIAL_SEGMENTS),
      circumscribedRadius(circle.radius, LANDRUSH_ISLAND_PALM_COLLIDER_RADIAL_SEGMENTS),
      height,
      LANDRUSH_ISLAND_PALM_COLLIDER_RADIAL_SEGMENTS,
      1,
      true,
      LANDRUSH_ISLAND_PALM_COLLIDER_THETA_START,
    )
    geometry.translate(circle.x, groundY + circle.minimumY + height / 2, circle.z)
    return geometry
  })
  const world = buildFirstPersonColliderWorld(geometries)
  if (!world) return null

  world.mesh.name = 'landrush-island-palm-trunk-colliders'
  world.mesh.userData = {
    ...world.mesh.userData,
    excludeFloatHit: true,
    landrushPalmTrunkColliderCount: circles.length,
  }
  return world
}

export function createLandrushIslandPalmNavigationFootprints({
  layout,
  paddingMeters,
}: {
  layout: readonly LandrushIslandPalmPlacement[]
  paddingMeters: number
}): readonly LandrushIslandPalmNavigationFootprint[] {
  const circles = createLandrushIslandPalmCollisionCircles({
    layout,
    origin: { x: 0, z: 0 },
  })
  const angleStep = (Math.PI * 2) / LANDRUSH_ISLAND_PALM_COLLIDER_RADIAL_SEGMENTS
  const angleStart = Math.PI - angleStep / 2

  return circles.map((circle) => {
    const radius = circumscribedRadius(
      circle.radius + Math.max(0, paddingMeters),
      LANDRUSH_ISLAND_PALM_COLLIDER_RADIAL_SEGMENTS,
    )
    return {
      id: circle.id,
      points: Array.from({ length: LANDRUSH_ISLAND_PALM_COLLIDER_RADIAL_SEGMENTS }, (_, index) => {
        const angle = angleStart + index * angleStep
        return {
          x: circle.x + Math.cos(angle) * radius,
          z: circle.z + Math.sin(angle) * radius,
        }
      }),
    }
  })
}

function circumscribedRadius(radius: number, segmentCount: number) {
  return radius / Math.cos(Math.PI / segmentCount)
}
