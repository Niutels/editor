import { describe, expect, test } from 'bun:test'
import { createLandrushZombieEscapeCollisionWorldsResolver } from './landrush-island-ai-navigation-semantics'
import {
  LANDRUSH_ISLAND_AMBIENT_DAY_PALM_INSTANCE_COUNT,
  LANDRUSH_ISLAND_AMBIENT_PALM_INSTANCE_COUNT,
  LANDRUSH_ISLAND_AMBIENT_PALMS,
} from './landrush-island-ambient-catalog'
import {
  createLandrushIslandPalmCollisionCircles,
  createLandrushIslandPalmLayout,
  resolveLandrushIslandAmbientPalmPosition,
  resolveLandrushIslandAmbientPalmSlots,
} from './landrush-island-palm-layout'
import {
  createZombieEscapeCircleMoveResult,
  createZombieEscapeCollisionHit,
  createZombieEscapeCollisionWorld,
  moveZombieEscapeCircleWithSlide,
  resolveZombieEscapeCollisionHitObjectId,
  sweepZombieEscapeProjectileAgainstWorld,
} from './zombie-escape-collision-world'

const AGENT_RADIUS_METERS = 0.37
const CENTER = { x: 2, z: -1 }
const SHORELINE = Array.from({ length: 64 }, (_, index) => {
  const angle = (index / 64) * Math.PI * 2
  return { x: CENTER.x + Math.cos(angle) * 12, z: CENTER.z + Math.sin(angle) * 9 }
})

describe('Landrush island canonical palm layout', () => {
  test('allocates the same 24 stable placements used by ambient render slots', () => {
    const layout = createLandrushIslandPalmLayout({ center: CENTER, shoreline: SHORELINE })
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
    const layout = createLandrushIslandPalmLayout({ center: CENTER, shoreline: SHORELINE })
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
      layout: createLandrushIslandPalmLayout({ center: CENTER, shoreline: SHORELINE }),
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
      layout: createLandrushIslandPalmLayout({ center: CENTER, shoreline: SHORELINE }),
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
})
