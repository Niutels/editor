import { describe, expect, test } from 'bun:test'
import { createLandrushZombieEscapeCollisionWorldsResolver } from '@landrush/pascal-host/zombie-game-navigation'
import {
  LANDRUSH_ISLAND_AMBIENT_DAY_PALM_INSTANCE_COUNT,
  LANDRUSH_ISLAND_AMBIENT_PALM_INSTANCE_COUNT,
  LANDRUSH_ISLAND_AMBIENT_PALMS,
} from '@landrush/zombie-gameplay/landrush-island-ambient-catalog'
import {
  createZombieEscapeCircleMoveResult,
  createZombieEscapeCollisionHit,
  createZombieEscapeCollisionWorld,
  moveZombieEscapeCircleWithSlide,
  resolveZombieEscapeCollisionHitObjectId,
  sweepZombieEscapeProjectileAgainstWorld,
} from '@landrush/zombie-gameplay/zombie-escape-collision-world'
import {
  createLandrushIslandPalmCollisionCircles,
  createLandrushIslandPalmLayout,
  createLandrushIslandPalmPlacementQuery,
  isLandrushIslandPalmDiskPlacementLegal,
  type LandrushIslandPalmPlacement,
  type LandrushIslandPalmRoadClearance,
  resolveLandrushIslandAmbientPalmPosition,
  resolveLandrushIslandAmbientPalmSlots,
} from './landrush-island-palm-layout'

const AGENT_RADIUS_METERS = 0.37
const CENTER = { x: 2, z: -1 }
const EMPTY_ROAD_CLEARANCE: LandrushIslandPalmRoadClearance = []
const SHORELINE = Array.from({ length: 64 }, (_, index) => {
  const angle = (index / 64) * Math.PI * 2
  return { x: CENTER.x + Math.cos(angle) * 12, z: CENTER.z + Math.sin(angle) * 9 }
})

function rectangleRoadClearance(
  minimumX: number,
  minimumZ: number,
  maximumX: number,
  maximumZ: number,
): LandrushIslandPalmRoadClearance {
  return [
    [
      [
        [minimumX, minimumZ],
        [maximumX, minimumZ],
        [maximumX, maximumZ],
        [minimumX, maximumZ],
        [minimumX, minimumZ],
      ],
    ],
  ]
}

const LARGE_SQUARE_SHORELINE = [
  { x: -10, z: -10 },
  { x: 10, z: -10 },
  { x: 10, z: 10 },
  { x: -10, z: 10 },
]

describe('Landrush island canonical palm layout', () => {
  test('allocates the same 24 stable placements used by ambient render slots', () => {
    const layout = createLandrushIslandPalmLayout({
      center: CENTER,
      roadClearance: EMPTY_ROAD_CLEARANCE,
      shoreline: SHORELINE,
    })
    const renderedSlots = LANDRUSH_ISLAND_AMBIENT_PALMS.flatMap((_, catalogIndex) =>
      resolveLandrushIslandAmbientPalmSlots({
        catalogIndex,
        catalogSize: LANDRUSH_ISLAND_AMBIENT_PALMS.length,
        dayInstanceCount: LANDRUSH_ISLAND_AMBIENT_DAY_PALM_INSTANCE_COUNT,
        instanceCount: LANDRUSH_ISLAND_AMBIENT_PALM_INSTANCE_COUNT,
        zombieIslandActive: true,
      }),
    ).sort((first, second) => first.instanceIndex - second.instanceIndex)

    expect(layout).toHaveLength(LANDRUSH_ISLAND_AMBIENT_PALM_INSTANCE_COUNT)
    expect(renderedSlots.map(({ instanceIndex }) => instanceIndex)).toEqual(
      Array.from({ length: LANDRUSH_ISLAND_AMBIENT_PALM_INSTANCE_COUNT }, (_, index) => index),
    )
    for (const placement of layout) {
      const palm = LANDRUSH_ISLAND_AMBIENT_PALMS[placement.catalogIndex]!
      const sizeFactor = 0.9 + (placement.instanceIndex % 5) * 0.035
      expect(placement.catalogIndex).toBe(
        placement.instanceIndex % LANDRUSH_ISLAND_AMBIENT_PALMS.length,
      )
      expect(placement.id).toBe(`palm:${String(placement.instanceIndex)}`)
      expect(placement.position).toEqual(
        resolveLandrushIslandAmbientPalmPosition({
          center: CENTER,
          dayInstanceCount: LANDRUSH_ISLAND_AMBIENT_DAY_PALM_INSTANCE_COUNT,
          instanceCount: LANDRUSH_ISLAND_AMBIENT_PALM_INSTANCE_COUNT,
          instanceIndex: placement.instanceIndex,
          shoreline: SHORELINE,
        }),
      )
      expect(placement.heightMeters).toBeCloseTo(palm.heightMeters * sizeFactor, 8)
      expect(placement.trunkRadiusMeters).toBeCloseTo(palm.trunkRadiusMeters * sizeFactor, 8)
    }
  })

  test('derives one readiness-independent physical trunk circle per rendered placement', () => {
    const layout = createLandrushIslandPalmLayout({
      center: CENTER,
      roadClearance: EMPTY_ROAD_CLEARANCE,
      shoreline: SHORELINE,
    })
    const circles = createLandrushIslandPalmCollisionCircles({ layout, origin: CENTER })

    expect(circles).toHaveLength(LANDRUSH_ISLAND_AMBIENT_PALM_INSTANCE_COUNT)
    for (let index = 0; index < layout.length; index += 1) {
      const placement = layout[index]!
      expect(circles[index]).toEqual({
        breakable: false,
        id: `${placement.id}:trunk`,
        maximumY: placement.heightMeters,
        minimumY: 0,
        navigationLayerY: 0,
        objectId: placement.id,
        radius: placement.trunkRadiusMeters,
        x: placement.position.x - CENTER.x,
        z: placement.position.z - CENTER.z,
      })
    }
  })

  test('sweeps agents and projectiles against the physical trunk with one radius inflation', () => {
    const [circle] = createLandrushIslandPalmCollisionCircles({
      layout: createLandrushIslandPalmLayout({
        center: CENTER,
        roadClearance: EMPTY_ROAD_CLEARANCE,
        shoreline: SHORELINE,
      }),
      origin: CENTER,
    })
    expect(circle).toBeDefined()
    if (!circle) return
    const world = createZombieEscapeCollisionWorld({
      agentRadius: AGENT_RADIUS_METERS,
      boundaryPolicy: 'none',
      circles: [circle],
      playRadius: 30,
    })
    const hit = createZombieEscapeCollisionHit()
    const candidate = createZombieEscapeCollisionHit()
    const move = createZombieEscapeCircleMoveResult()

    moveZombieEscapeCircleWithSlide(
      world,
      circle.x - 3,
      circle.z,
      6,
      0,
      AGENT_RADIUS_METERS,
      hit,
      move,
    )

    expect(move.collided).toBe(true)
    const physicalContactX = circle.x - circle.radius - AGENT_RADIUS_METERS
    expect(move.x).toBeLessThanOrEqual(physicalContactX)
    expect(move.x).toBeGreaterThan(physicalContactX - 0.005)
    expect(resolveZombieEscapeCollisionHitObjectId(world, hit)).toBe(circle.objectId)

    sweepZombieEscapeProjectileAgainstWorld(
      world,
      circle.x - 3,
      1,
      circle.z,
      6,
      0,
      0,
      0.04,
      hit,
      candidate,
    )
    expect(hit.colliderKind).toBe('circle')
    expect(resolveZombieEscapeCollisionHitObjectId(world, hit)).toBe(circle.objectId)
  })

  test('reuses cached worlds across cloned circle arrays and invalidates physical edits', () => {
    const circles = createLandrushIslandPalmCollisionCircles({
      layout: createLandrushIslandPalmLayout({
        center: CENTER,
        roadClearance: EMPTY_ROAD_CLEARANCE,
        shoreline: SHORELINE,
      }),
      origin: CENTER,
    })
    const resolveWorlds = createLandrushZombieEscapeCollisionWorldsResolver()
    const input = {
      agentRadius: AGENT_RADIUS_METERS,
      circles,
      nodes: {},
      playRadius: 30,
      spawn: CENTER,
    }
    const initial = resolveWorlds(input)
    const cloned = resolveWorlds({
      ...input,
      circles: [...circles].reverse().map((circle) => ({ ...circle })),
    })
    const changedCircles = circles.map((circle, index) =>
      index === 0 ? { ...circle, radius: circle.radius + 0.05 } : circle,
    )
    const changed = resolveWorlds({ ...input, circles: changedCircles })

    expect(cloned).toBe(initial)
    expect(initial.navigation.circles).toHaveLength(LANDRUSH_ISLAND_AMBIENT_PALM_INSTANCE_COUNT)
    expect(initial.combat.circles).toHaveLength(LANDRUSH_ISLAND_AMBIENT_PALM_INSTANCE_COUNT)
    expect(changed).not.toBe(initial)
    expect(changed.navigation.semanticKey).not.toBe(initial.navigation.semanticKey)
    expect(changed.combat.semanticKey).not.toBe(initial.combat.semanticKey)
  })

  test('models road MultiPolygon fill and holes with full-disk tangent legality', () => {
    const roadClearance: LandrushIslandPalmRoadClearance = [
      [
        [
          [-2, -2],
          [2, -2],
          [2, 2],
          [-2, 2],
          [-2, -2],
        ],
        [
          [-0.75, -0.75],
          [-0.75, 0.75],
          [0.75, 0.75],
          [0.75, -0.75],
          [-0.75, -0.75],
        ],
      ],
    ]
    const placementQuery = createLandrushIslandPalmPlacementQuery({
      roadClearance,
      shoreline: LARGE_SQUARE_SHORELINE,
    })
    const legal = (position: { x: number; z: number }, trunkRadiusMeters: number) =>
      isLandrushIslandPalmDiskPlacementLegal({
        acceptedPlacements: [],
        placementQuery,
        position,
        trunkRadiusMeters,
      })

    expect(legal({ x: 1.5, z: 0 }, 0.1)).toBe(false)
    expect(legal({ x: 0, z: 0 }, 0.75)).toBe(true)
    expect(legal({ x: 0, z: 0 }, 0.750_1)).toBe(false)
    expect(legal({ x: 3, z: 0 }, 1)).toBe(true)
    expect(legal({ x: 3, z: 0 }, 1.000_1)).toBe(false)
  })

  test('requires the full trunk disk inside the shoreline and permits exact tangency', () => {
    const placementQuery = createLandrushIslandPalmPlacementQuery({
      roadClearance: EMPTY_ROAD_CLEARANCE,
      shoreline: [
        { x: -5, z: -5 },
        { x: 5, z: -5 },
        { x: 5, z: 5 },
        { x: -5, z: 5 },
      ],
    })
    const legal = (position: { x: number; z: number }, trunkRadiusMeters: number) =>
      isLandrushIslandPalmDiskPlacementLegal({
        acceptedPlacements: [],
        placementQuery,
        position,
        trunkRadiusMeters,
      })

    expect(legal({ x: 4, z: 0 }, 1)).toBe(true)
    expect(legal({ x: 4, z: 0 }, 1.000_1)).toBe(false)
    expect(legal({ x: 5.1, z: 0 }, 0)).toBe(false)
  })

  test('prevents accepted trunk disks from overlapping while permitting tangency', () => {
    const placementQuery = createLandrushIslandPalmPlacementQuery({
      roadClearance: EMPTY_ROAD_CLEARANCE,
      shoreline: LARGE_SQUARE_SHORELINE,
    })
    const acceptedPlacements: readonly Pick<
      LandrushIslandPalmPlacement,
      'position' | 'trunkRadiusMeters'
    >[] = [{ position: { x: 0, z: 0 }, trunkRadiusMeters: 1 }]
    const legal = (x: number) =>
      isLandrushIslandPalmDiskPlacementLegal({
        acceptedPlacements,
        placementQuery,
        position: { x, z: 0 },
        trunkRadiusMeters: 1,
      })

    expect(legal(2)).toBe(true)
    expect(legal(1.999_9)).toBe(false)
  })

  test('relocates only an illegal preferred palm with stable identity and deterministic output', () => {
    const baseline = createLandrushIslandPalmLayout({
      center: CENTER,
      instanceCount: LANDRUSH_ISLAND_AMBIENT_DAY_PALM_INSTANCE_COUNT,
      roadClearance: EMPTY_ROAD_CLEARANCE,
      shoreline: SHORELINE,
    })
    const blockedPosition = baseline[0]!.position
    const roadClearance = rectangleRoadClearance(
      blockedPosition.x - 0.05,
      blockedPosition.z - 0.05,
      blockedPosition.x + 0.05,
      blockedPosition.z + 0.05,
    )
    const first = createLandrushIslandPalmLayout({
      center: CENTER,
      instanceCount: LANDRUSH_ISLAND_AMBIENT_DAY_PALM_INSTANCE_COUNT,
      roadClearance,
      shoreline: SHORELINE,
    })
    const second = createLandrushIslandPalmLayout({
      center: CENTER,
      instanceCount: LANDRUSH_ISLAND_AMBIENT_DAY_PALM_INSTANCE_COUNT,
      roadClearance,
      shoreline: SHORELINE,
    })

    expect(first).toEqual(second)
    expect(first.map(({ id }) => id)).toEqual(baseline.map(({ id }) => id))
    expect(first[0]!.position).not.toEqual(baseline[0]!.position)
    for (let index = 1; index < baseline.length; index += 1) {
      expect(first[index]!.position).toEqual(baseline[index]!.position)
    }

    const placementQuery = createLandrushIslandPalmPlacementQuery({
      roadClearance,
      shoreline: SHORELINE,
    })
    const acceptedPlacements: LandrushIslandPalmPlacement[] = []
    for (const placement of first) {
      expect(
        isLandrushIslandPalmDiskPlacementLegal({
          acceptedPlacements,
          placementQuery,
          position: placement.position,
          trunkRadiusMeters: placement.trunkRadiusMeters,
        }),
      ).toBe(true)
      acceptedPlacements.push(placement)
    }
  })

  test('fails explicitly when no bounded relocation candidate is legal', () => {
    expect(() =>
      createLandrushIslandPalmLayout({
        center: { x: 0, z: 0 },
        instanceCount: 1,
        roadClearance: rectangleRoadClearance(-10, -10, 10, 10),
        shoreline: [
          { x: -5, z: -5 },
          { x: 5, z: -5 },
          { x: 5, z: 5 },
          { x: -5, z: 5 },
        ],
      }),
    ).toThrow('Unable to place palm:0')
  })
})
