import { describe, expect, test } from 'bun:test'
import { Line3, Raycaster, Vector3 } from 'three'
import {
  LANDRUSH_ISLAND_AMBIENT_DAY_PALM_INSTANCE_COUNT,
  LANDRUSH_ISLAND_AMBIENT_PALM_INSTANCE_COUNT,
} from './landrush-island-ambient-catalog'
import {
  createLandrushIslandPalmNavigationFootprints,
  createLandrushIslandPalmTrunkColliderWorld,
  resolveLandrushIslandVisiblePalmLayout,
} from './landrush-island-palm-collider'
import type { LandrushIslandPalmPlacement } from './landrush-island-palm-layout'

const GROUND_Y = 1.25
const PLAYER_CAPSULE_RADIUS = 0.25
const PALM_RADIUS = 0.4

function createPlacement(index: number): LandrushIslandPalmPlacement {
  return {
    catalogIndex: index % 4,
    heightMeters: 7 + index * 0.01,
    id: `palm:${String(index)}`,
    instanceIndex: index,
    position: { x: index * 3, z: index * -2 },
    trunkRadiusMeters: PALM_RADIUS,
  }
}

function distanceToSegment(
  point: { x: number; z: number },
  start: { x: number; z: number },
  end: { x: number; z: number },
) {
  const segmentX = end.x - start.x
  const segmentZ = end.z - start.z
  const lengthSquared = segmentX * segmentX + segmentZ * segmentZ
  const amount = Math.max(
    0,
    Math.min(1, ((point.x - start.x) * segmentX + (point.z - start.z) * segmentZ) / lengthSquared),
  )
  return Math.hypot(
    point.x - (start.x + segmentX * amount),
    point.z - (start.z + segmentZ * amount),
  )
}

describe('Landrush island palm player colliders', () => {
  test('uses the same day and zombie-night visibility counts as the rendered palms', () => {
    const layout = Array.from({ length: LANDRUSH_ISLAND_AMBIENT_PALM_INSTANCE_COUNT }, (_, index) =>
      createPlacement(index),
    )

    expect(resolveLandrushIslandVisiblePalmLayout({ layout, zombieIslandActive: false })).toEqual(
      layout.slice(0, LANDRUSH_ISLAND_AMBIENT_DAY_PALM_INSTANCE_COUNT),
    )
    expect(resolveLandrushIslandVisiblePalmLayout({ layout, zombieIslandActive: true })).toEqual(
      layout,
    )
  })

  test('builds one merged, open-ended BVH mesh that blocks a horizontal trunk ray', () => {
    const layout = [createPlacement(0), createPlacement(1)]
    const world = createLandrushIslandPalmTrunkColliderWorld({ groundY: GROUND_Y, layout })
    expect(world).not.toBeNull()
    if (!world) return

    expect(world.mesh.geometry.boundsTree).toBeDefined()
    expect(world.mesh.userData.excludeCollisionCheck).toBe(false)
    expect(world.mesh.userData.excludeFloatHit).toBe(true)
    expect(world.mesh.userData.landrushPalmTrunkColliderCount).toBe(layout.length)
    expect(world.bounds?.min.y).toBeCloseTo(GROUND_Y, 5)
    expect(world.bounds?.max.y).toBeCloseTo(GROUND_Y + layout[1]!.heightMeters, 5)

    const raycaster = new Raycaster(new Vector3(-2, GROUND_Y + 1, 0), new Vector3(1, 0, 0), 0, 4)
    const hit = raycaster.intersectObject(world.mesh, false)[0]
    expect(hit).toBeDefined()
    expect(hit?.point.x).toBeCloseTo(-PALM_RADIUS, 4)

    const geometry = world.mesh.geometry
    world.dispose()
    expect(geometry.boundsTree).toBeNull()
  })

  test('meets the BVH capsule at trunk radius plus player radius', () => {
    const world = createLandrushIslandPalmTrunkColliderWorld({
      groundY: GROUND_Y,
      layout: [createPlacement(0)],
    })
    expect(world).not.toBeNull()
    if (!world) return

    const boundsTree = world.mesh.geometry.boundsTree
    expect(boundsTree).toBeDefined()
    if (!boundsTree) return
    const capsuleSegment = new Line3(
      new Vector3(0, GROUND_Y + 0.25, 0),
      new Vector3(0, GROUND_Y + 1.25, 0),
    )
    const trianglePoint = new Vector3()
    const capsulePoint = new Vector3()
    const minimumTriangleDistance = (capsuleCenterX: number) => {
      capsuleSegment.start.x = capsuleCenterX
      capsuleSegment.end.x = capsuleCenterX
      let minimumDistance = Number.POSITIVE_INFINITY
      boundsTree.shapecast({
        intersectsBounds: () => true,
        intersectsTriangle: (triangle) => {
          triangle.closestPointToSegment(capsuleSegment, trianglePoint, capsulePoint)
          minimumDistance = Math.min(minimumDistance, trianglePoint.distanceTo(capsulePoint))
          return false
        },
      })
      return minimumDistance
    }

    expect(minimumTriangleDistance(-(PALM_RADIUS + PLAYER_CAPSULE_RADIUS))).toBeCloseTo(
      PLAYER_CAPSULE_RADIUS,
      4,
    )
    expect(minimumTriangleDistance(-(PALM_RADIUS + PLAYER_CAPSULE_RADIUS - 0.01))).toBeLessThan(
      PLAYER_CAPSULE_RADIUS,
    )
    expect(minimumTriangleDistance(-(PALM_RADIUS + PLAYER_CAPSULE_RADIUS + 0.01))).toBeGreaterThan(
      PLAYER_CAPSULE_RADIUS,
    )

    world.dispose()
  })

  test('circumscribes every padded navigation edge around the physical trunk', () => {
    const placement = createPlacement(0)
    const paddingMeters = PLAYER_CAPSULE_RADIUS + 0.08
    const footprint = createLandrushIslandPalmNavigationFootprints({
      layout: [placement],
      paddingMeters,
    })[0]
    expect(footprint).toBeDefined()
    if (!footprint) return

    const requiredRadius = placement.trunkRadiusMeters + paddingMeters
    for (let index = 0; index < footprint.points.length; index += 1) {
      const start = footprint.points[index]!
      const end = footprint.points[(index + 1) % footprint.points.length]!
      expect(distanceToSegment(placement.position, start, end)).toBeCloseTo(requiredRadius, 8)
    }
  })
})
