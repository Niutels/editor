import { describe, expect, test } from 'bun:test'
import { BoxGeometry, PerspectiveCamera } from 'three'
import {
  buildFirstPersonColliderWorld,
  deriveFirstPersonSpawn,
  FIRST_PERSON_SPAWN_EYE_HEIGHT,
} from './first-person-collider-world'

describe('Landrush first-person collider world', () => {
  test('returns no world when the host supplies no collision geometry', () => {
    expect(buildFirstPersonColliderWorld([])).toBeNull()
  })

  test('compiles host geometry into a raycastable BVH and derives a ground spawn', () => {
    const world = buildFirstPersonColliderWorld([new BoxGeometry(2, 2, 2).toNonIndexed()])
    expect(world).not.toBeNull()
    if (!world) return

    expect(world.bounds?.min.toArray()).toEqual([-1, -1, -1])
    expect(world.bounds?.max.toArray()).toEqual([1, 1, 1])

    const camera = new PerspectiveCamera()
    camera.position.set(0, 5, 0)
    camera.lookAt(0, 5, -1)
    camera.updateMatrixWorld(true)
    const spawn = deriveFirstPersonSpawn(camera, world)

    expect(spawn.position[0]).toBeCloseTo(0)
    expect(spawn.position[1]).toBeCloseTo(1 + FIRST_PERSON_SPAWN_EYE_HEIGHT)
    expect(spawn.position[2]).toBeCloseTo(0)
    expect(spawn.yaw).toBeCloseTo(0)

    world.dispose()
  })
})
