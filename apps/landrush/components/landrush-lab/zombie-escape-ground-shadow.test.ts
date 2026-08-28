import { describe, expect, test } from 'bun:test'
import { BoxGeometry, type BufferGeometry, Mesh, MeshBasicMaterial } from 'three'
import { acceleratedRaycast, computeBoundsTree, disposeBoundsTree } from 'three-mesh-bvh'
import {
  createZombieEscapeGroundShadowProjector,
  projectZombieEscapeGroundShadowSupportY,
  resolveZombieEscapeGroundShadowEnvelope,
  resolveZombieEscapeGroundShadowMovementRotation,
  resolveZombieEscapeGroundShadowRenderSupportY,
  ZOMBIE_ESCAPE_GROUND_SHADOW,
  type ZombieEscapeGroundShadowEnvelope,
} from './zombie-escape-ground-shadow'

function sample(playerY: number, supportY: number) {
  const output: ZombieEscapeGroundShadowEnvelope = { altitude: 0, opacity: 0, radius: 0, y: 0 }
  return { ...resolveZombieEscapeGroundShadowEnvelope(playerY, supportY, output) }
}

function createColliderBox({
  centerY,
  height,
  size = 10,
  x = 0,
  z = 0,
}: {
  centerY: number
  height: number
  size?: number
  x?: number
  z?: number
}) {
  const geometry = new BoxGeometry(size, height, size) as BufferGeometry & {
    computeBoundsTree?: typeof computeBoundsTree
    disposeBoundsTree?: typeof disposeBoundsTree
  }
  ;(geometry as any).computeBoundsTree = computeBoundsTree
  ;(geometry as any).disposeBoundsTree = disposeBoundsTree
  geometry.computeBoundsTree?.()
  const mesh = new Mesh(geometry, new MeshBasicMaterial())
  mesh.position.set(x, centerY, z)
  mesh.raycast = acceleratedRaycast
  mesh.userData.excludeFloatHit = false
  mesh.updateMatrixWorld(true)
  return mesh
}

function project(colliderMeshes: Mesh[], { x, y, z }: { x: number; y: number; z: number }) {
  return projectZombieEscapeGroundShadowSupportY(
    colliderMeshes,
    x,
    y,
    z,
    8,
    createZombieEscapeGroundShadowProjector(1.2),
  )
}

describe('Zombie Escape ground shadow', () => {
  test('stays on the current support plane instead of global ground', () => {
    const shadow = sample(4.5, 3)

    expect(shadow.altitude).toBe(1.5)
    expect(shadow.y).toBeCloseTo(3 + ZOMBIE_ESCAPE_GROUND_SHADOW.surfaceOffset, 8)
  })

  test('shrinks and fades monotonically as jump altitude increases', () => {
    const grounded = sample(2, 2)
    const midair = sample(3, 2)
    const high = sample(5, 2)

    expect(grounded.radius).toBeGreaterThan(midair.radius)
    expect(midair.radius).toBeGreaterThan(high.radius)
    expect(grounded.opacity).toBeGreaterThan(midair.opacity)
    expect(midair.opacity).toBeGreaterThan(high.opacity)
  })

  test('uses the authored jump height to drive an exact bounded size envelope', () => {
    const grounded = sample(2, 2)
    const apex = sample(3.1875, 2)
    const beyondMaximum = sample(12, 2)

    expect(grounded.radius).toBe(ZOMBIE_ESCAPE_GROUND_SHADOW.baseRadius)
    expect(apex.radius).toBeGreaterThan(
      ZOMBIE_ESCAPE_GROUND_SHADOW.baseRadius * ZOMBIE_ESCAPE_GROUND_SHADOW.minimumRadiusScale,
    )
    expect(apex.radius).toBeLessThan(ZOMBIE_ESCAPE_GROUND_SHADOW.baseRadius)
    expect(beyondMaximum.radius).toBeCloseTo(
      ZOMBIE_ESCAPE_GROUND_SHADOW.baseRadius * ZOMBIE_ESCAPE_GROUND_SHADOW.minimumRadiusScale,
      8,
    )
  })

  test('authors a compact near-round footprint around the character', () => {
    expect(ZOMBIE_ESCAPE_GROUND_SHADOW.aspectRatio).toBeGreaterThanOrEqual(0.84)
    expect(ZOMBIE_ESCAPE_GROUND_SHADOW.aspectRatio).toBeLessThan(1)
    expect(ZOMBIE_ESCAPE_GROUND_SHADOW.baseRadius * 2).toBeLessThanOrEqual(0.56)
    expect(
      ZOMBIE_ESCAPE_GROUND_SHADOW.baseRadius * ZOMBIE_ESCAPE_GROUND_SHADOW.aspectRatio * 2,
    ).toBeLessThanOrEqual(0.49)
    expect(ZOMBIE_ESCAPE_GROUND_SHADOW.baseOpacity).toBeGreaterThan(0.5)
  })

  test('keeps most of the shadow visible through the jump envelope', () => {
    const grounded = sample(2, 2)
    const maximumHeight = sample(2 + ZOMBIE_ESCAPE_GROUND_SHADOW.maximumAltitude, 2)

    expect(maximumHeight.opacity / grounded.opacity).toBeGreaterThanOrEqual(0.6)
    expect(maximumHeight.radius / grounded.radius).toBeGreaterThanOrEqual(0.6)
  })

  test('turns the ellipse long axis toward movement with frame-rate-independent response', () => {
    const oneStep = resolveZombieEscapeGroundShadowMovementRotation({
      currentRotation: 0,
      deltaSeconds: 1 / 30,
      deltaX: 0,
      deltaZ: 0.1,
    })
    const firstHalfStep = resolveZombieEscapeGroundShadowMovementRotation({
      currentRotation: 0,
      deltaSeconds: 1 / 60,
      deltaX: 0,
      deltaZ: 0.05,
    })
    const twoHalfSteps = resolveZombieEscapeGroundShadowMovementRotation({
      currentRotation: firstHalfStep,
      deltaSeconds: 1 / 60,
      deltaX: 0,
      deltaZ: 0.05,
    })

    expect(oneStep).toBeLessThan(0)
    expect(oneStep).toBeGreaterThan(-Math.PI / 2)
    expect(twoHalfSteps).toBeCloseTo(oneStep, 10)
  })

  test('does not spin for stationary frames, teleports, or equivalent half turns', () => {
    const currentRotation = 0.37
    expect(
      resolveZombieEscapeGroundShadowMovementRotation({
        currentRotation,
        deltaSeconds: 1 / 60,
        deltaX: 0,
        deltaZ: 0,
      }),
    ).toBe(currentRotation)
    expect(
      resolveZombieEscapeGroundShadowMovementRotation({
        currentRotation,
        deltaSeconds: 1 / 60,
        deltaX: 10,
        deltaZ: 0,
      }),
    ).toBe(currentRotation)
    expect(
      resolveZombieEscapeGroundShadowMovementRotation({
        currentRotation: 0,
        deltaSeconds: 1 / 60,
        deltaX: -0.1,
        deltaZ: 0,
      }),
    ).toBeCloseTo(0, 10)
  })

  test('keeps the last valid support plane while the player is airborne', () => {
    expect(
      resolveZombieEscapeGroundShadowRenderSupportY({
        lastSupportY: 2,
        playerY: 2.8,
        projectedSupportY: 0,
        projectedVisible: false,
      }),
    ).toBe(2)
    expect(
      resolveZombieEscapeGroundShadowRenderSupportY({
        lastSupportY: 2,
        playerY: 2,
        projectedSupportY: 0,
        projectedVisible: false,
      }),
    ).toBeNull()
    expect(
      resolveZombieEscapeGroundShadowRenderSupportY({
        lastSupportY: 2,
        playerY: 1.9,
        projectedSupportY: 0,
        projectedVisible: false,
      }),
    ).toBeNull()
  })

  test('clamps below-support and invalid player values to a finite grounded envelope', () => {
    expect(sample(1, 2)).toEqual(sample(2, 2))
    expect(sample(Number.NaN, 2)).toEqual(sample(2, 2))
    expect(Object.values(sample(2, Number.NaN)).every(Number.isFinite)).toBe(true)
  })

  test('moves immediately from a furniture top to the ground after leaving its footprint', () => {
    const ground = createColliderBox({ centerY: -0.05, height: 0.1 })
    const table = createColliderBox({ centerY: 0.4, height: 0.8, size: 1.6 })

    expect(project([ground, table], { x: 0, y: 1.4, z: 0 })).toBeCloseTo(0.8, 6)
    expect(project([ground, table], { x: 1.2, y: 1.4, z: 0 })).toBeCloseTo(0, 6)
  })

  test('uses the nearest walkable surface below the player and ignores an overhead slab', () => {
    const ground = createColliderBox({ centerY: -0.05, height: 0.1 })
    const floor = createColliderBox({ centerY: 2.95, height: 0.1, size: 5 })
    const overhead = createColliderBox({ centerY: 5.05, height: 0.1, size: 5 })

    expect(project([ground, floor, overhead], { x: 0, y: 4, z: 0 })).toBeCloseTo(3, 6)
  })

  test('rejects hidden and float-excluded colliders', () => {
    const ground = createColliderBox({ centerY: -0.05, height: 0.1 })
    const hidden = createColliderBox({ centerY: 1.45, height: 0.1, size: 2 })
    const excluded = createColliderBox({ centerY: 0.75, height: 0.1, size: 2 })
    hidden.visible = false
    excluded.userData.excludeFloatHit = true

    expect(project([ground, hidden, excluded], { x: 0, y: 2, z: 0 })).toBeCloseTo(0, 6)
  })

  test('returns null instead of retaining a stale support when no collider is below', () => {
    const projector = createZombieEscapeGroundShadowProjector(1.2)
    const table = createColliderBox({ centerY: 0.4, height: 0.8, size: 1.6 })
    const query = (x: number) =>
      projectZombieEscapeGroundShadowSupportY([table], x, 1.4, 0, 4, projector)

    expect(query(0)).toBeCloseTo(0.8, 6)
    expect(query(2)).toBeNull()
  })
})
