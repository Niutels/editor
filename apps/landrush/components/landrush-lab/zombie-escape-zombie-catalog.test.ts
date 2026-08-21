import { describe, expect, test } from 'bun:test'
import {
  getZombieEscapeZombieCollisionRadiusMeters,
  ZOMBIE_ESCAPE_SIMULATION,
  ZOMBIE_ESCAPE_ZOMBIE_MAXIMUM_COLLISION_RADIUS_METERS,
} from './zombie-escape-config'
import {
  ZOMBIE_ESCAPE_ZOMBIE_CATALOG,
  ZOMBIE_ESCAPE_ZOMBIE_MAXIMUM_CAPSULE_RADIUS_METERS,
  ZOMBIE_ESCAPE_ZOMBIE_MAXIMUM_TRIANGLE_COUNT,
  ZOMBIE_ESCAPE_ZOMBIE_MINIMUM_TRIANGLE_COUNT,
  ZOMBIE_ESCAPE_ZOMBIE_TARGET_TRIANGLE_COUNT,
} from './zombie-escape-zombie-catalog'

describe('Zombie Escape generated zombie catalog', () => {
  test('contains ten stable, distinct island identities', () => {
    expect(ZOMBIE_ESCAPE_ZOMBIE_CATALOG).toHaveLength(10)
    expect(new Set(ZOMBIE_ESCAPE_ZOMBIE_CATALOG.map(({ id }) => id)).size).toBe(10)
    expect(new Set(ZOMBIE_ESCAPE_ZOMBIE_CATALOG.map(({ seed }) => seed)).size).toBe(10)
    expect(new Set(ZOMBIE_ESCAPE_ZOMBIE_CATALOG.map(({ silhouette }) => silhouette)).size).toBe(10)
  })

  test('matches the textured 3k Meshy rigging contract', () => {
    for (const zombie of ZOMBIE_ESCAPE_ZOMBIE_CATALOG) {
      expect(zombie.meshy).toMatchObject({
        aiModel: 'meshy-t2',
        forwardAxis: '+Z',
        modelType: 'smart-topology',
        outputFormat: 'glb',
        poseMode: 'a-pose',
        targetPolycount: 3000,
        textured: true,
        textureResolution: '2k',
        topology: 'triangle',
      })
      expect(zombie.meshy.prompt.toLowerCase()).toContain('clearly separated')
      expect(zombie.meshy.prompt.toLowerCase()).toContain('toward +z')
      expect(zombie.meshy.prompt.toLowerCase()).toContain('auto-rigging')
      expect(zombie.meshy.prompt.length).toBeLessThanOrEqual(600)
      expect(zombie.meshy.texturePrompt.length).toBeLessThanOrEqual(600)
      expect(zombie.triangleBudget).toEqual({
        maximum: ZOMBIE_ESCAPE_ZOMBIE_MAXIMUM_TRIANGLE_COUNT,
        minimum: ZOMBIE_ESCAPE_ZOMBIE_MINIMUM_TRIANGLE_COUNT,
        target: ZOMBIE_ESCAPE_ZOMBIE_TARGET_TRIANGLE_COUNT,
      })
    }
  })

  test('uses plausible adult biped capsules and locomotion speeds', () => {
    for (const zombie of ZOMBIE_ESCAPE_ZOMBIE_CATALOG) {
      const capsuleHeight = zombie.capsule.segmentLengthMeters + zombie.capsule.radiusMeters * 2
      expect(zombie.characterHeightMeters).toBeGreaterThanOrEqual(1.65)
      expect(zombie.characterHeightMeters).toBeLessThanOrEqual(1.9)
      expect(capsuleHeight).toBeGreaterThanOrEqual(zombie.characterHeightMeters * 0.92)
      expect(capsuleHeight).toBeLessThanOrEqual(zombie.characterHeightMeters * 1.02)
      expect(zombie.movement.walkMetersPerSecond).toBeGreaterThanOrEqual(1)
      expect(zombie.movement.runMetersPerSecond).toBeGreaterThan(
        zombie.movement.walkMetersPerSecond,
      )
      expect(zombie.movement.runMetersPerSecond).toBeLessThanOrEqual(4)
    }
  })

  test('uses the catalog maximum for shared navigation and exact radii for movement sweeps', () => {
    expect(ZOMBIE_ESCAPE_ZOMBIE_MAXIMUM_CAPSULE_RADIUS_METERS).toBe(0.37)
    expect(ZOMBIE_ESCAPE_ZOMBIE_MAXIMUM_COLLISION_RADIUS_METERS).toBe(
      ZOMBIE_ESCAPE_ZOMBIE_MAXIMUM_CAPSULE_RADIUS_METERS,
    )
    expect(ZOMBIE_ESCAPE_SIMULATION.zombieNavigationRadius).toBe(
      ZOMBIE_ESCAPE_ZOMBIE_MAXIMUM_COLLISION_RADIUS_METERS,
    )
    for (const [index, zombie] of ZOMBIE_ESCAPE_ZOMBIE_CATALOG.entries()) {
      expect(getZombieEscapeZombieCollisionRadiusMeters(index)).toBe(zombie.capsule.radiusMeters)
      expect(zombie.capsule.radiusMeters).toBeLessThanOrEqual(
        ZOMBIE_ESCAPE_ZOMBIE_MAXIMUM_COLLISION_RADIUS_METERS,
      )
    }
  })

  test('declares rigged, walking, and running GLBs for every generated id', () => {
    const paths = new Set<string>()
    for (const zombie of ZOMBIE_ESCAPE_ZOMBIE_CATALOG) {
      const directory = `/landrush-lab/zombie-escape/assets/zombies/${zombie.id}`
      expect(zombie.glb.riggedBase.path).toBe(`${directory}/rigged.glb`)
      expect(zombie.glb.walk.path).toBe(`${directory}/walk.glb`)
      expect(zombie.glb.run.path).toBe(`${directory}/run.glb`)
      paths.add(zombie.glb.riggedBase.path)
      paths.add(zombie.glb.walk.path)
      paths.add(zombie.glb.run.path)
      expect(zombie.glb.riggedBase).toMatchObject({
        expectedClipCount: 1,
        expectedClipName: 'Armature|clip0|baselayer',
      })
      expect(zombie.glb.walk.expectedClipName).toBe('Armature|walking_man|baselayer')
      expect(zombie.glb.run.expectedClipName).toBe('Armature|running|baselayer')
    }
    expect(paths.size).toBe(30)
  })
})
