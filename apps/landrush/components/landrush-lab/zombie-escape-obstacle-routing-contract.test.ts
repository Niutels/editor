import { describe, expect, test } from 'bun:test'
import {
  type AnyNode,
  BuildingNode,
  DoorNode,
  ItemNode,
  LevelNode,
  SlabNode,
  WallNode,
} from '@pascal-app/core'
import { createLandrushZombieEscapeCollisionWorld } from './landrush-island-ai-navigation-semantics'
import {
  adoptZombieEscapeSparsePublishedRouteAtWaypoint,
  beginZombieEscapeSparseAttachmentSearch,
  beginZombieEscapeSparseFlowSearch,
  classifyZombieEscapeCollisionObjectDelta,
  createZombieEscapeCircleMoveResult,
  createZombieEscapeCollisionHit,
  createZombieEscapeCollisionObjectDeltaResult,
  createZombieEscapeCollisionWorld,
  createZombieEscapeFlowField,
  createZombieEscapeSparseAttachmentSearch,
  createZombieEscapeSparseCommittedNodeRoute,
  createZombieEscapeSparseFlowSearch,
  createZombieEscapeSparseSpawnAnchor,
  deactivateZombieEscapeCollisionObject,
  moveZombieEscapeCircleWithSlide,
  resolveZombieEscapeCollisionHitObjectId,
  resolveZombieEscapeFlowDirection,
  sampleZombieEscapeSparseSpawnAnchor,
  seedZombieEscapeSparseFlowSearchRouteCorridor,
  stepZombieEscapeSparseAttachmentSearch,
  stepZombieEscapeSparseFlowSearch,
  updateZombieEscapeFlowTarget,
  type ZombieEscapeFlowField,
  type ZombieEscapeFlowSample,
  type ZombieEscapeSparseSearchStatus,
} from './zombie-escape-collision-world'
import {
  ZOMBIE_ESCAPE_OBSTACLE_BREACH_DURATION_SECONDS,
  ZOMBIE_ESCAPE_SIMULATION,
} from './zombie-escape-config'

const AGENT_RADIUS = 0.37

describe('Zombie Escape obstacle-routing contract', () => {
  test('preserves the first blocking object after an angled slide finishes on a clear sweep', () => {
    const world = createZombieEscapeCollisionWorld({
      agentRadius: AGENT_RADIUS,
      boundaryPolicy: 'none',
      boxes: [
        {
          breakable: true,
          centerX: 0,
          centerZ: 0,
          halfDepth: 0.5,
          halfWidth: 0.5,
          id: 'table:footprint',
          objectId: 'table',
          rotation: 0,
        },
      ],
      playRadius: 10,
    })
    const hit = createZombieEscapeCollisionHit()
    const move = createZombieEscapeCircleMoveResult()

    moveZombieEscapeCircleWithSlide(world, -2, -1, 4, 0.5, 0.3, hit, move)

    expect(move.collided).toBe(true)
    expect(move.sweepHit.colliderKind).toBe('none')
    expect(resolveZombieEscapeCollisionHitObjectId(world, hit)).toBe('table')
  })

  test('publishes one owned breakable blocker after a sparse search spans many work slices', () => {
    const world = createZombieEscapeCollisionWorld({
      agentRadius: AGENT_RADIUS,
      boundaryPolicy: 'none',
      navigationSupports: [
        {
          boundary: true,
          elevation: 0,
          id: 'surface',
          polygon: [
            { x: -6, z: -6 },
            { x: 6, z: -6 },
            { x: 6, z: 6 },
            { x: -6, z: 6 },
          ],
        },
      ],
      playRadius: 7,
      segments: [
        {
          breakable: true,
          endCap: 'flat',
          endX: 0,
          endZ: 6,
          halfThickness: 0.1,
          id: 'closed-door',
          objectId: 'closed-door',
          startCap: 'flat',
          startX: 0,
          startZ: -6,
        },
      ],
    })
    const field = createZombieEscapeFlowField(world)
    updateZombieEscapeFlowTarget(field, 3, 0, 0)
    const search = createZombieEscapeSparseFlowSearch()
    const sample = createFlowSample()
    beginZombieEscapeSparseFlowSearch(search, field, -3, 0, 3, 0, 0, -1, false, 3)
    const budget = {
      maximumCandidateVisits: 1,
      maximumCollisionPredicates: 1,
      maximumHeapOperations: 1,
      maximumHierarchyNodeVisits: 1,
      maximumSupportPredicates: 1,
    }
    let slices = 0
    let status: ZombieEscapeSparseSearchStatus = 'pending'
    let terminalHit = createZombieEscapeCollisionHit()
    while (status === 'pending' && slices < 1_000) {
      terminalHit = createZombieEscapeCollisionHit()
      status = stepZombieEscapeSparseFlowSearch(search, field, sample, budget, terminalHit)
      slices += 1
    }

    expect(slices).toBeGreaterThan(1)
    expect(status).toBe('found')
    expect(sample.waypointUsesFallback).toBe(true)
    expect(sample.blockingDistance).toBeFinite()
    expect(resolveZombieEscapeCollisionHitObjectId(world, terminalHit)).toBe('closed-door')
    expect(resolveZombieEscapeCollisionHitObjectId(world, search.blockingHit)).toBe('closed-door')
  })

  test('chooses strict or destructible routing by deterministic travel plus two-hit time', () => {
    const world = createWeightedRouteWorld()
    const slow = resolveWeightedRoute(world, 3)
    const fast = resolveWeightedRoute(world, 20)

    expect(ZOMBIE_ESCAPE_OBSTACLE_BREACH_DURATION_SECONDS).toBeCloseTo(
      (ZOMBIE_ESCAPE_SIMULATION.obstacleHitsToBreak -
        1 +
        ZOMBIE_ESCAPE_SIMULATION.zombieObstacleAttackContactPhase) *
        ZOMBIE_ESCAPE_SIMULATION.zombieObstacleAttackCooldownSeconds,
    )
    expect(slow.sample.waypointUsesFallback).toBe(true)
    expect(fast.sample.waypointUsesFallback).toBe(false)
    expect(
      slow.field.graphSparseFlowSearch.attachment.bestAttachmentBreachCount +
        slow.field.graphSparseFlowSearch.attachment.bestRouteBreachCount,
    ).toBe(1)
    expect(routeCosts(slow.field, 3).fallback).toBeLessThan(routeCosts(slow.field, 3).strict)
    expect(routeCosts(fast.field, 20).strict).toBeLessThan(routeCosts(fast.field, 20).fallback)
    expect(resolveWeightedRoute(world, 3).sample).toEqual(slow.sample)
  })

  test('prices every breakable traversal instead of one flat fallback surcharge', () => {
    const world = createTwoBarrierRouteWorld()
    const graph = world.navigationGraph
    const initial = resolveTwoBarrierRoute(world)

    expect(initial.sample.waypointUsesFallback).toBe(true)
    expect(
      initial.field.graphSparseFlowSearch.attachment.bestAttachmentBreachCount +
        initial.field.graphSparseFlowSearch.attachment.bestRouteBreachCount,
    ).toBe(2)

    const removal = createZombieEscapeCollisionObjectDeltaResult()
    expect(classifyZombieEscapeCollisionObjectDelta(world, 'barrier:-1', removal)).toBe('changed')
    expect(deactivateZombieEscapeCollisionObject(world, removal)).toBe('changed')
    expect(world.navigationGraph).toBe(graph)
    const afterRemoval = resolveTwoBarrierRoute(world)
    expect(
      afterRemoval.field.graphSparseFlowSearch.attachment.bestAttachmentBreachCount +
        afterRemoval.field.graphSparseFlowSearch.attachment.bestRouteBreachCount,
    ).toBe(1)
  })

  test('charges a breakable crossed only by the source attachment', () => {
    const world = createAttachmentBarrierWorld()
    const field = createZombieEscapeFlowField(world)
    const sample = createFlowSample()
    updateZombieEscapeFlowTarget(field, 6, 0, 0)
    resolveZombieEscapeFlowDirection(
      field,
      -3,
      0,
      6,
      0,
      sample,
      createZombieEscapeCollisionHit(),
      0,
    )

    const attachmentNode = world.navigationGraph.nodeIds.findIndex(
      (_, node) =>
        world.navigationGraph.x[node]! > 2 && Math.abs(world.navigationGraph.z[node]!) < 3,
    )
    expect(attachmentNode).toBeGreaterThanOrEqual(0)
    const workspace = field.graphReverseFieldBanks
    const bank = workspace.banks[workspace.activeBankIndex]!
    bank.graphSameLayerFallbackCosts.fill(Number.POSITIVE_INFINITY)
    bank.graphSameLayerFallbackDistances.fill(Number.POSITIVE_INFINITY)
    bank.graphSameLayerFallbackBreachCounts.fill(0)
    bank.graphSameLayerFallbackBreachMasks.fill(0)
    bank.graphSameLayerFallbackCosts[attachmentNode] = 0
    bank.graphSameLayerFallbackDistances[attachmentNode] = 0

    const attachment = createZombieEscapeSparseAttachmentSearch()
    expect(
      beginZombieEscapeSparseAttachmentSearch(
        attachment,
        field,
        field.graphSameLayerFallbackDistances,
        0,
        -3,
        0,
        true,
      ),
    ).toBe('pending')
    expect(
      stepZombieEscapeSparseAttachmentSearch(
        attachment,
        field,
        field.graphSameLayerFallbackDistances,
        unlimitedSearchBudget(),
      ),
    ).toBe('found')
    expect(attachment.bestNode).toBe(attachmentNode)
    expect(attachment.bestAttachmentBreachCount).toBe(1)
    expect(attachment.bestRouteBreachCount).toBe(0)
    expect(
      [...attachment.bestAttachmentBreachObjectOrdinals].map(
        (objectOrdinal) => world.objectCatalog.objectIds[objectOrdinal],
      ),
    ).toEqual(['attachment-door'])
  })

  test('selects the lowest total-cost anchor instead of the nearest anchor', () => {
    const world = createAttachmentChoiceWorld()
    const field = createZombieEscapeFlowField(world)
    const sourceX = -1
    const sourceZ = 0
    const nodesByDistance = world.navigationGraph.nodeIds
      .map((_, node) => ({
        distance: Math.hypot(
          world.navigationGraph.x[node]! - sourceX,
          world.navigationGraph.z[node]! - sourceZ,
        ),
        node,
      }))
      .sort((first, second) => first.distance - second.distance || first.node - second.node)
    const near = nodesByDistance[0]!
    const farther = nodesByDistance.find(({ distance }) => distance > near.distance + 0.5)!
    expect(farther).toBeDefined()

    const workspace = field.graphReverseFieldBanks
    const bank = workspace.banks[workspace.activeBankIndex]!
    bank.graphSameLayerDistances.fill(Number.POSITIVE_INFINITY)
    bank.graphSameLayerDistances[near.node] = 10
    bank.graphSameLayerDistances[farther.node] = 0

    const attachment = createZombieEscapeSparseAttachmentSearch()
    expect(
      beginZombieEscapeSparseAttachmentSearch(
        attachment,
        field,
        field.graphSameLayerDistances,
        0,
        sourceX,
        sourceZ,
        false,
      ),
    ).toBe('pending')
    expect(
      stepZombieEscapeSparseAttachmentSearch(
        attachment,
        field,
        field.graphSameLayerDistances,
        unlimitedSearchBudget(),
      ),
    ).toBe('found')
    expect(near.distance + 10).toBeGreaterThan(farther.distance)
    expect(attachment.bestNode).toBe(farther.node)
    expect(attachment.bestCost).toBeCloseTo(farther.distance)
  })

  test('keeps real Pascal doors and furniture as the blocking breakable object', () => {
    const doorFixture = createPascalDoorWorld()
    const furnitureFixture = createPascalFurnitureWorld()

    expect(resolveCompiledBlocker(doorFixture.world)).toBe(doorFixture.objectId)
    expect(resolveCompiledBlocker(furnitureFixture.world)).toBe(furnitureFixture.objectId)
  })

  test('does not admit a centered spawn on a support disconnected from the target layer', () => {
    const world = createZombieEscapeCollisionWorld({
      agentRadius: AGENT_RADIUS,
      boundaryPolicy: 'none',
      navigationSupports: [
        {
          boundary: true,
          elevation: 0,
          id: 'left-ground',
          polygon: [
            { x: -6, z: -3 },
            { x: -1, z: -3 },
            { x: -1, z: 3 },
            { x: -6, z: 3 },
          ],
        },
        {
          boundary: true,
          elevation: 3,
          id: 'right-upper',
          polygon: [
            { x: 1, z: -3 },
            { x: 6, z: -3 },
            { x: 6, z: 3 },
            { x: 1, z: 3 },
          ],
        },
      ],
      playRadius: 7,
    })
    const field = createZombieEscapeFlowField(world)
    const route = createZombieEscapeSparseCommittedNodeRoute()
    const anchor = createZombieEscapeSparseSpawnAnchor()

    expect(world.navigationMode).toBe('sparse')
    for (const adjacency of [
      world.navigationGraph.strictAdjacency,
      world.navigationGraph.fallbackAdjacency,
    ]) {
      for (let node = 0; node < world.navigationGraph.nodeIds.length; node += 1) {
        for (
          let edge = adjacency.nodeOffsets[node]!;
          edge < adjacency.nodeOffsets[node + 1]!;
          edge += 1
        ) {
          expect(world.navigationGraph.layerIndices[adjacency.toNodes[edge]!]).toBe(
            world.navigationGraph.layerIndices[node],
          )
        }
      }
    }
    expect(updateZombieEscapeFlowTarget(field, 4, 0, 3)).toBe(true)
    expect(sampleZombieEscapeSparseSpawnAnchor(field, -4, 0, 0, route, anchor)).toBe(false)
    expect(route.reachable).toBe(false)
    expect(anchor).toMatchObject({ layerIndex: -1, reachable: false, witnessNode: -1 })
  })

  test('requires weighted reattachment before adopting a published fallback breach', () => {
    const world = createZombieEscapeCollisionWorld({
      agentRadius: AGENT_RADIUS,
      boundaryPolicy: 'none',
      circles: [{ id: 'left-static', radius: 0.6, x: -3, z: 0 }],
      navigationSupports: [
        {
          boundary: true,
          elevation: 0,
          id: 'surface',
          polygon: [
            { x: -6, z: -6 },
            { x: 6, z: -6 },
            { x: 6, z: 6 },
            { x: -6, z: 6 },
          ],
        },
      ],
      playRadius: 7,
      segments: [
        {
          breakable: true,
          endCap: 'flat',
          endX: 0,
          endZ: 6,
          halfThickness: 0.1,
          id: 'divider',
          objectId: 'divider',
          startCap: 'flat',
          startX: 0,
          startZ: -6,
        },
      ],
    })
    const field = createZombieEscapeFlowField(world)
    const sample = createFlowSample()
    const committed = createZombieEscapeSparseFlowSearch()

    expect(updateZombieEscapeFlowTarget(field, 3, 0, 0)).toBe(true)
    resolveZombieEscapeFlowDirection(field, -5, 0, 3, 0, sample, undefined, 0)
    const anchor = sample.waypointNode ?? -1
    expect(sample.waypointUsesFallback).toBe(true)
    expect(seedZombieEscapeSparseFlowSearchRouteCorridor(committed, field, anchor, true)).toBe(true)
    const previousGeneration = committed.routeCorridorGeneration

    expect(updateZombieEscapeFlowTarget(field, -1.5, 0, 0)).toBe(true)
    expect(committed.routeCorridorGeneration).toBe(previousGeneration)
    expect(field.graphSameLayerDistances[anchor]).toBe(Number.POSITIVE_INFINITY)
    const activeBank =
      field.graphReverseFieldBanks.banks[field.graphReverseFieldBanks.activeBankIndex]!
    expect(activeBank.graphSameLayerFallbackBreachCounts[anchor]).toBeGreaterThan(0)
    expect(adoptZombieEscapeSparsePublishedRouteAtWaypoint(committed, field, anchor)).toBe(
      'requiresSearch',
    )
    expect(committed.routeCorridorGeneration).toBe(0)
    expect(committed.cachedOriginalNode).toBe(anchor)
  })
})

function createFlowSample(): ZombieEscapeFlowSample {
  return {
    blockingDistance: Number.POSITIVE_INFINITY,
    blockingX: 0,
    blockingZ: 0,
    connectorIndex: -1,
    connectorTargetEnd: false,
    reachable: false,
    waypointNode: -1,
    waypointUsesFallback: false,
    x: 0,
    z: 0,
  }
}

function createWeightedRouteWorld() {
  return createZombieEscapeCollisionWorld({
    agentRadius: AGENT_RADIUS,
    boundaryPolicy: 'none',
    boxes: [
      {
        breakable: true,
        centerX: 0,
        centerZ: 0,
        halfDepth: 3,
        halfWidth: 0.5,
        id: 'cabinet:footprint',
        objectId: 'cabinet',
        rotation: 0,
      },
    ],
    navigationSupports: [
      {
        boundary: true,
        elevation: 0,
        id: 'surface',
        polygon: [
          { x: -8, z: -8 },
          { x: 8, z: -8 },
          { x: 8, z: 8 },
          { x: -8, z: 8 },
        ],
      },
    ],
    playRadius: 9,
  })
}

function createTwoBarrierRouteWorld() {
  return createZombieEscapeCollisionWorld({
    agentRadius: AGENT_RADIUS,
    boundaryPolicy: 'none',
    navigationSupports: [
      {
        boundary: true,
        elevation: 0,
        id: 'corridor',
        polygon: [
          { x: -6, z: -2 },
          { x: 6, z: -2 },
          { x: 6, z: 2 },
          { x: -6, z: 2 },
        ],
      },
    ],
    playRadius: 7,
    segments: [-1, 1].map((x) => ({
      breakable: true,
      endCap: 'flat' as const,
      endX: x,
      endZ: 2,
      halfThickness: 0.1,
      id: `barrier:${String(x)}`,
      objectId: `barrier:${String(x)}`,
      startCap: 'flat' as const,
      startX: x,
      startZ: -2,
    })),
  })
}

function createAttachmentBarrierWorld() {
  return createZombieEscapeCollisionWorld({
    agentRadius: AGENT_RADIUS,
    boundaryPolicy: 'none',
    navigationSupports: [
      {
        boundary: true,
        elevation: 0,
        id: 'surface',
        polygon: [
          { x: -8, z: -8 },
          { x: 8, z: -8 },
          { x: 8, z: 8 },
          { x: -8, z: 8 },
        ],
      },
    ],
    playRadius: 9,
    segments: [
      {
        breakable: true,
        endCap: 'flat',
        endX: 0,
        endZ: 4,
        halfThickness: 0.1,
        id: 'attachment-door',
        objectId: 'attachment-door',
        startCap: 'flat',
        startX: 0,
        startZ: -4,
      },
    ],
  })
}

function createAttachmentChoiceWorld() {
  return createZombieEscapeCollisionWorld({
    agentRadius: AGENT_RADIUS,
    boundaryPolicy: 'none',
    navigationSupports: [
      {
        boundary: true,
        elevation: 0,
        id: 'surface',
        polygon: [
          { x: -8, z: -8 },
          { x: 8, z: -8 },
          { x: 8, z: 8 },
          { x: -8, z: 8 },
        ],
      },
    ],
    playRadius: 9,
  })
}

function unlimitedSearchBudget() {
  return {
    maximumCandidateVisits: Number.POSITIVE_INFINITY,
    maximumCollisionPredicates: Number.POSITIVE_INFINITY,
    maximumHeapOperations: Number.POSITIVE_INFINITY,
    maximumHierarchyNodeVisits: Number.POSITIVE_INFINITY,
    maximumSupportPredicates: Number.POSITIVE_INFINITY,
  }
}

function resolveTwoBarrierRoute(world: ReturnType<typeof createTwoBarrierRouteWorld>) {
  const field = createZombieEscapeFlowField(world)
  const sample = createFlowSample()
  updateZombieEscapeFlowTarget(field, 4, 0, 0)
  resolveZombieEscapeFlowDirection(
    field,
    -4,
    0,
    4,
    0,
    sample,
    createZombieEscapeCollisionHit(),
    0,
    undefined,
    undefined,
    3.2,
  )
  return { field, sample }
}

function resolveWeightedRoute(
  world: ReturnType<typeof createWeightedRouteWorld>,
  speedMetersPerSecond: number,
) {
  const field = createZombieEscapeFlowField(world)
  const sample = createFlowSample()
  updateZombieEscapeFlowTarget(field, 2, -3, 0)
  resolveZombieEscapeFlowDirection(
    field,
    -4,
    2,
    2,
    -3,
    sample,
    createZombieEscapeCollisionHit(),
    0,
    undefined,
    undefined,
    speedMetersPerSecond,
  )
  return { field, sample }
}

function routeCosts(field: ZombieEscapeFlowField, speedMetersPerSecond: number) {
  const search = field.graphSparseFlowSearch
  return {
    fallback:
      (search.attachment.bestAttachmentDistance + search.attachment.bestRouteTravelDistance) /
        speedMetersPerSecond +
      (search.attachment.bestAttachmentBreachCount + search.attachment.bestRouteBreachCount) *
        ZOMBIE_ESCAPE_OBSTACLE_BREACH_DURATION_SECONDS,
    strict: (search.strictAttachmentDistance + search.strictRouteDistance) / speedMetersPerSecond,
  }
}

function createPascalDoorWorld() {
  const building = BuildingNode.parse({})
  const level = LevelNode.parse({ level: 0, parentId: building.id })
  const slab = createPascalSlab(level.id)
  const wall = WallNode.parse({ end: [0, 8], parentId: level.id, start: [0, -8] })
  const door = DoorNode.parse({
    parentId: wall.id,
    position: [8, 0, 0],
    wallId: wall.id,
    width: 1,
  })
  return {
    objectId: door.id,
    world: compilePascalWorld([building, level, slab, wall, door]),
  }
}

function createPascalFurnitureWorld() {
  const building = BuildingNode.parse({})
  const level = LevelNode.parse({ level: 0, parentId: building.id })
  const slab = createPascalSlab(level.id)
  const furniture = ItemNode.parse({
    asset: {
      category: 'furniture',
      dimensions: [1, 1, 16],
      id: 'cabinet-asset',
      name: 'Cabinet',
      src: 'asset://cabinet',
      thumbnail: '',
    },
    parentId: level.id,
    position: [0, 0, 0],
  })
  return {
    objectId: furniture.id,
    world: compilePascalWorld([building, level, slab, furniture]),
  }
}

function createPascalSlab(parentId: string) {
  return SlabNode.parse({
    parentId,
    polygon: [
      [-8, -8],
      [8, -8],
      [8, 8],
      [-8, 8],
    ],
  })
}

function compilePascalWorld(nodes: readonly AnyNode[]) {
  return createLandrushZombieEscapeCollisionWorld({
    agentRadius: AGENT_RADIUS,
    nodes: Object.fromEntries(nodes.map((node) => [node.id, node])) as Record<string, AnyNode>,
    playRadius: 8,
    spawn: { x: 0, z: 0 },
  })
}

function resolveCompiledBlocker(world: ReturnType<typeof compilePascalWorld>) {
  const field = createZombieEscapeFlowField(world)
  const sample = createFlowSample()
  const hit = createZombieEscapeCollisionHit()
  updateZombieEscapeFlowTarget(field, 3, 0, 0)
  resolveZombieEscapeFlowDirection(field, -3, 0, 3, 0, sample, hit, 0)
  expect(sample.blockingDistance).toBeFinite()
  return resolveZombieEscapeCollisionHitObjectId(world, hit)
}
