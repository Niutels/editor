import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { createRoot, unmountComponentAtNode } from '@react-three/fiber'
import { act, createElement, useMemo } from 'react'
import { Line3, Raycaster, Scene, Vector3 } from 'three'
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

    expect(
      resolveLandrushIslandVisiblePalmLayout({
        layout,
        visibleCount: LANDRUSH_ISLAND_AMBIENT_DAY_PALM_INSTANCE_COUNT,
      }),
    ).toEqual(layout.slice(0, LANDRUSH_ISLAND_AMBIENT_DAY_PALM_INSTANCE_COUNT))
    expect(
      resolveLandrushIslandVisiblePalmLayout({
        layout,
        visibleCount: LANDRUSH_ISLAND_AMBIENT_PALM_INSTANCE_COUNT,
      }),
    ).toEqual(layout)
  })

  test('retains the visible layout and collider across equal-count mode changes and rebuilds on real input changes', async () => {
    const clientSource = readFileSync(
      new URL('./landrush-island-client.tsx', import.meta.url),
      'utf8',
    )
    expect(clientSource).toContain(`  const visiblePalmInstanceCount =
    zombieEscapeEnabled && zombieEscapePhase === 'night'
      ? LANDRUSH_ISLAND_AMBIENT_PALM_INSTANCE_COUNT
      : LANDRUSH_ISLAND_AMBIENT_DAY_PALM_INSTANCE_COUNT
  const visiblePalmLayout = useMemo(
    () =>
      resolveLandrushIslandVisiblePalmLayout({
        layout: palmLayout,
        visibleCount: visiblePalmInstanceCount,
      }),
    [palmLayout, visiblePalmInstanceCount],
  )`)
    const actEnvironment = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
    const previousActEnvironment = actEnvironment.IS_REACT_ACT_ENVIRONMENT
    actEnvironment.IS_REACT_ACT_ENVIRONMENT = true
    const canvas = new EventTarget()
    const root = createRoot(canvas)
    let drawCount = 0
    let buildCount = 0
    const worlds = new Set<
      NonNullable<ReturnType<typeof createLandrushIslandPalmTrunkColliderWorld>>
    >()
    const snapshots: Array<{
      layout: readonly LandrushIslandPalmPlacement[]
      world: ReturnType<typeof createLandrushIslandPalmTrunkColliderWorld>
    }> = []
    function PalmColliderProbe({
      layout,
      visibleCount,
    }: {
      layout: readonly LandrushIslandPalmPlacement[]
      visibleCount: number
    }) {
      const visibleLayout = useMemo(
        () => resolveLandrushIslandVisiblePalmLayout({ layout, visibleCount }),
        [layout, visibleCount],
      )
      const world = useMemo(() => {
        buildCount += 1
        const next = createLandrushIslandPalmTrunkColliderWorld({
          groundY: GROUND_Y,
          layout: visibleLayout,
        })
        if (next) worlds.add(next)
        return next
      }, [visibleLayout])
      snapshots.push({ layout: visibleLayout, world })
      return null
    }
    const layout = Array.from(
      { length: LANDRUSH_ISLAND_AMBIENT_PALM_INSTANCE_COUNT + 2 },
      (_, index) => createPlacement(index),
    )
    const render = async (
      nextLayout: readonly LandrushIslandPalmPlacement[],
      visibleCount: number,
    ) => {
      await act(async () => {
        root.render(createElement(PalmColliderProbe, { layout: nextLayout, visibleCount }))
      })
      return snapshots[snapshots.length - 1]!
    }
    try {
      await root.configure({
        dpr: 1,
        frameloop: 'never',
        gl: {
          render() {
            drawCount += 1
          },
          setPixelRatio() {},
          setSize() {},
        },
        scene: new Scene(),
        size: { height: 64, left: 0, top: 0, width: 64 },
      })
      const modes = [
        { enabled: false, phase: 'build' },
        { enabled: true, phase: 'build' },
        { enabled: true, phase: 'night' },
        { enabled: true, phase: 'build' },
        { enabled: false, phase: 'build' },
      ] as const
      let first: (typeof snapshots)[number] | undefined
      for (const mode of modes) {
        const count =
          mode.enabled && mode.phase === 'night'
            ? LANDRUSH_ISLAND_AMBIENT_PALM_INSTANCE_COUNT
            : LANDRUSH_ISLAND_AMBIENT_DAY_PALM_INSTANCE_COUNT
        expect(count).toBe(LANDRUSH_ISLAND_AMBIENT_DAY_PALM_INSTANCE_COUNT)
        const current = await render(layout, count)
        first ??= current
        expect(current.layout).toBe(first.layout)
        expect(current.world).toBe(first.world)
        expect(buildCount).toBe(1)
      }
      expect(first?.world).not.toBeNull()
      const smaller = await render(layout, 3)
      expect(smaller.layout).toEqual(layout.slice(0, 3))
      expect(smaller.layout).not.toBe(first?.layout)
      expect(smaller.world).not.toBe(first?.world)
      expect(smaller.world?.mesh.userData.landrushPalmTrunkColliderCount).toBe(3)
      expect(buildCount).toBe(2)
      const larger = await render(layout, 7)
      expect(larger.layout).toEqual(layout.slice(0, 7))
      expect(larger.world?.mesh.userData.landrushPalmTrunkColliderCount).toBe(7)
      expect(buildCount).toBe(3)
      const replacement = [createPlacement(31), createPlacement(32)]
      const changed = await render(replacement, 7)
      expect(changed.layout).toEqual(replacement)
      expect(changed.world).not.toBe(larger.world)
      expect(changed.world?.mesh.userData.landrushPalmTrunkColliderCount).toBe(2)
      expect(buildCount).toBe(4)
      expect(drawCount).toBe(0)
    } finally {
      let finish!: () => void
      const disposed = new Promise<void>((resolve) => {
        finish = resolve
      })
      await act(async () => {
        unmountComponentAtNode(canvas, finish)
      })
      await disposed
      for (const world of worlds) world.dispose()
      if (previousActEnvironment === undefined) delete actEnvironment.IS_REACT_ACT_ENVIRONMENT
      else actEnvironment.IS_REACT_ACT_ENVIRONMENT = previousActEnvironment
    }
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
