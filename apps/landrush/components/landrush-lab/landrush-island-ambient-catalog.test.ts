import { describe, expect, test } from 'bun:test'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import {
  LANDRUSH_ISLAND_AMBIENT_BOATS,
  LANDRUSH_ISLAND_AMBIENT_DAY_PALM_INSTANCE_COUNT,
  LANDRUSH_ISLAND_AMBIENT_FISH,
  LANDRUSH_ISLAND_AMBIENT_FISH_INSTANCE_COUNT,
  LANDRUSH_ISLAND_AMBIENT_NPCS,
  LANDRUSH_ISLAND_AMBIENT_PALM_DIMENSION_SCALE,
  LANDRUSH_ISLAND_AMBIENT_PALM_INSTANCE_COUNT,
  LANDRUSH_ISLAND_AMBIENT_PALMS,
} from './landrush-island-ambient-catalog'

describe('Landrush island ambient Meshy catalog', () => {
  test('contains the requested non-zombie asset set', () => {
    expect(LANDRUSH_ISLAND_AMBIENT_BOATS).toHaveLength(3)
    expect(LANDRUSH_ISLAND_AMBIENT_PALMS).toHaveLength(3)
    expect(LANDRUSH_ISLAND_AMBIENT_PALM_DIMENSION_SCALE).toBe(1.3)
    const baseDimensions = [
      { heightMeters: 9, id: 'classic-coconut-palm', trunkRadiusMeters: 0.24 },
      { heightMeters: 5, id: 'short-fan-palm', trunkRadiusMeters: 0.28 },
      { heightMeters: 7.5, id: 'twin-trunk-date-palm', trunkRadiusMeters: 0.38 },
    ]
    for (let index = 0; index < baseDimensions.length; index += 1) {
      const base = baseDimensions[index]!
      const palm = LANDRUSH_ISLAND_AMBIENT_PALMS[index]!
      expect(palm.id).toBe(base.id)
      expect(palm.heightMeters).toBeCloseTo(
        base.heightMeters * LANDRUSH_ISLAND_AMBIENT_PALM_DIMENSION_SCALE,
        12,
      )
      expect(palm.trunkRadiusMeters).toBeCloseTo(
        base.trunkRadiusMeters * LANDRUSH_ISLAND_AMBIENT_PALM_DIMENSION_SCALE,
        12,
      )
    }
    expect(LANDRUSH_ISLAND_AMBIENT_FISH).toHaveLength(10)
    expect(LANDRUSH_ISLAND_AMBIENT_FISH_INSTANCE_COUNT).toBe(200)
    expect(LANDRUSH_ISLAND_AMBIENT_FISH_INSTANCE_COUNT).toBeGreaterThanOrEqual(50)
    expect(LANDRUSH_ISLAND_AMBIENT_NPCS).toHaveLength(10)
    expect(LANDRUSH_ISLAND_AMBIENT_DAY_PALM_INSTANCE_COUNT).toBe(4)
    expect(LANDRUSH_ISLAND_AMBIENT_PALM_INSTANCE_COUNT).toBe(24)
    expect(
      [
        ...LANDRUSH_ISLAND_AMBIENT_BOATS,
        ...LANDRUSH_ISLAND_AMBIENT_PALMS,
        ...LANDRUSH_ISLAND_AMBIENT_FISH,
        ...LANDRUSH_ISLAND_AMBIENT_NPCS,
      ].every((entry) => !entry.id.includes('zombie')),
    ).toBe(true)
  })

  test('assigns idle, walk, and run clips to every NPC', () => {
    for (const npc of LANDRUSH_ISLAND_AMBIENT_NPCS) {
      expect(npc.glb.idle).toEndWith('/idle.anim.glb')
      expect(npc.glb.walk).toEndWith('/walk.anim.glb')
      expect(npc.glb.run).toEndWith('/run.anim.glb')
    }
  })

  test('defines explicit forward, speed, depth, and shoreline envelopes for every fish', () => {
    const expectedForwardAxes = {
      'caribbean-reef-shark': '+z',
      'giant-manta-ray': '+z',
      'hammerhead-shark': '+z',
      'large-barracuda': '-x',
      'large-grouper': '-x',
      'medium-lionfish': '+z',
      'medium-parrotfish': '-x',
      'small-clownfish': '-x',
      'small-yellow-tang': '+x',
      'tiny-blue-green-chromis': '+z',
    } as const
    const correctionYaw = { '+x': -Math.PI / 2, '+z': 0, '-x': Math.PI / 2, '-z': Math.PI }
    for (const fish of LANDRUSH_ISLAND_AMBIENT_FISH) {
      expect(fish.modelForwardAxis).toBe(expectedForwardAxes[fish.id])
      expect(fish.modelForwardYaw).toBeCloseTo(correctionYaw[fish.modelForwardAxis], 12)
      expect(fish.cruiseSpeedMetersPerSecond).toBeGreaterThan(0)
      expect(fish.depthMaxMeters).toBeGreaterThan(fish.depthMinMeters)
      expect(fish.shoreDistanceMaxMeters).toBeGreaterThan(fish.shoreDistanceMinMeters)
    }
  })

  test('keeps every catalog URL backed by a checked-in public asset', () => {
    const modelPaths = [
      ...LANDRUSH_ISLAND_AMBIENT_BOATS.map((boat) => boat.modelPath),
      ...LANDRUSH_ISLAND_AMBIENT_PALMS.map((palm) => palm.modelPath),
      ...LANDRUSH_ISLAND_AMBIENT_FISH.map((fish) => fish.modelPath),
      ...LANDRUSH_ISLAND_AMBIENT_NPCS.flatMap((npc) => Object.values(npc.glb)),
    ]

    for (const modelPath of modelPaths) {
      expect(existsSync(join(import.meta.dir, '../../public', modelPath.replace(/^\/+/, '')))).toBe(
        true,
      )
    }
  })
})
