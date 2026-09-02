import { describe, expect, test } from 'bun:test'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { LANDRUSH_ISLAND_AMBIENT_NPCS } from './landrush-island-ambient-catalog'
import {
  getZombieEscapeZombieCollisionRadiusMeters,
  ZOMBIE_ESCAPE_SIMULATION,
  ZOMBIE_ESCAPE_ZOMBIE_MAXIMUM_COLLISION_RADIUS_METERS,
} from './zombie-escape-config'
import {
  ZOMBIE_ESCAPE_BRUTE_ZOMBIE_VARIANT,
  ZOMBIE_ESCAPE_HEAVY_ZOMBIE_VARIANT,
  ZOMBIE_ESCAPE_STANDARD_ZOMBIE_VARIANTS,
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
    expect(
      ZOMBIE_ESCAPE_ZOMBIE_CATALOG.reduce(
        (counts, zombie) => {
          counts[zombie.bodyClass] += 1
          return counts
        },
        { brute: 0, heavy: 0, standard: 0 },
      ),
    ).toEqual({ brute: 1, heavy: 1, standard: 8 })
    expect(
      ZOMBIE_ESCAPE_ZOMBIE_CATALOG.filter(
        ({ runtimeBody }) => runtimeBody === 'dedicated-meshy',
      ).map(({ id }) => id),
    ).toEqual(['marina-mechanic', 'boardwalk-chef'])
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

  test('assigns boss health, timing, respawn, and breadcrumb behavior by body class', () => {
    expect(ZOMBIE_ESCAPE_ZOMBIE_CATALOG[ZOMBIE_ESCAPE_HEAVY_ZOMBIE_VARIANT]!.gameplay).toEqual({
      healthMultiplier: 5,
      nightSpawnProgress: 0.5,
      persistentPlayerTrail: true,
      respawnsDuringNight: true,
    })
    expect(ZOMBIE_ESCAPE_ZOMBIE_CATALOG[ZOMBIE_ESCAPE_BRUTE_ZOMBIE_VARIANT]!.gameplay).toEqual({
      healthMultiplier: 10,
      nightSpawnProgress: 2 / 3,
      persistentPlayerTrail: true,
      respawnsDuringNight: false,
    })
    for (const variant of ZOMBIE_ESCAPE_STANDARD_ZOMBIE_VARIANTS) {
      expect(ZOMBIE_ESCAPE_ZOMBIE_CATALOG[variant]!.gameplay).toEqual({
        healthMultiplier: 1,
        nightSpawnProgress: null,
        persistentPlayerTrail: false,
        respawnsDuringNight: false,
      })
    }
  })

  test('uses plausible adult biped capsules and locomotion speeds', () => {
    const heightRangeByBodyClass = {
      brute: { maximum: 2.2, minimum: 2.1 },
      heavy: { maximum: 1.95, minimum: 1.85 },
      standard: { maximum: 1.9, minimum: 1.65 },
    }
    for (const zombie of ZOMBIE_ESCAPE_ZOMBIE_CATALOG) {
      const capsuleHeight = zombie.capsule.segmentLengthMeters + zombie.capsule.radiusMeters * 2
      const heightRange = heightRangeByBodyClass[zombie.bodyClass]
      expect(zombie.characterHeightMeters).toBeGreaterThanOrEqual(heightRange.minimum)
      expect(zombie.characterHeightMeters).toBeLessThanOrEqual(heightRange.maximum)
      expect(capsuleHeight).toBeCloseTo(zombie.characterHeightMeters, 1)
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

  test('uses the exact ambient source bijection and optimized animation-only runtime bodies', () => {
    const paths = new Set<string>()
    for (const zombie of ZOMBIE_ESCAPE_ZOMBIE_CATALOG) {
      const sourceNpc = LANDRUSH_ISLAND_AMBIENT_NPCS.find((npc) => npc.id === zombie.sourceNpcId)
      expect(sourceNpc).toBeDefined()
      if (zombie.runtimeBody === 'ambient-npc') {
        expect(zombie.bodyClass).toBe('standard')
        expect(zombie.glb.riggedBase.path).toBe(sourceNpc!.glb.rigged)
        expect(zombie.glb.walk.path).toBe(sourceNpc!.glb.walk)
        expect(zombie.glb.run.path).toBe(sourceNpc!.glb.run)
      } else {
        const directory = `/landrush-lab/zombie-escape/assets/zombies/${zombie.id}`
        expect(zombie.bodyClass).not.toBe('standard')
        expect(zombie.glb.riggedBase.path).toBe(`${directory}/rigged.glb`)
        expect(zombie.glb.walk.path).toBe(`${directory}/walk.anim.glb`)
        expect(zombie.glb.run.path).toBe(`${directory}/run.anim.glb`)
      }
      expect(zombie.glb.walk.path).toEndWith('/walk.anim.glb')
      expect(zombie.glb.run.path).toEndWith('/run.anim.glb')
      paths.add(zombie.glb.riggedBase.path)
      paths.add(zombie.glb.walk.path)
      paths.add(zombie.glb.run.path)
      expect(zombie.glb.riggedBase).toMatchObject({
        expectedClipCount: 1,
        expectedClipName: 'Armature|clip0|baselayer',
      })
      expect(zombie.glb.walk.expectedClipName).toBe('Armature|walking_man|baselayer')
      expect(zombie.glb.run.expectedClipName).toBe('Armature|running|baselayer')
      for (const path of [zombie.glb.riggedBase.path, zombie.glb.walk.path, zombie.glb.run.path]) {
        expect(existsSync(join(import.meta.dir, '../../public', path.replace(/^\/+/, '')))).toBe(
          true,
        )
      }
    }
    expect(paths.size).toBe(30)
    const sourceNpcIds = ZOMBIE_ESCAPE_ZOMBIE_CATALOG.map((zombie) => zombie.sourceNpcId)
    expect(new Set(sourceNpcIds).size).toBe(LANDRUSH_ISLAND_AMBIENT_NPCS.length)
    expect(new Set(sourceNpcIds)).toEqual(new Set(LANDRUSH_ISLAND_AMBIENT_NPCS.map(({ id }) => id)))
  })
})
