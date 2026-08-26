import { describe, expect, test } from 'bun:test'
import {
  acknowledgeZombieEscapeFlowFieldCollisionMaskRemoval,
  adoptZombieEscapeSparsePublishedRouteAtWaypoint,
  beginZombieEscapeNavigationVisibilitySearch,
  beginZombieEscapeSparseAttachmentSearch,
  beginZombieEscapeSparseFlowSearch,
  beginZombieEscapeSparseReachableSpawnSearch,
  beginZombieEscapeSparseTargetUpdate,
  classifyZombieEscapeCollisionObjectDelta,
  clearZombieEscapeSparseFlowSearchRouteCorridor,
  createZombieEscapeCircleMoveResult,
  createZombieEscapeCollisionHit,
  createZombieEscapeCollisionObjectDeltaResult,
  createZombieEscapeCollisionWorld,
  createZombieEscapeCollisionWorldActiveView,
  createZombieEscapeCollisionWorldWithoutObjects,
  createZombieEscapeFlowField,
  createZombieEscapeNavigationMoveResult,
  createZombieEscapeNavigationVisibilitySearch,
  createZombieEscapeReachableSpawn,
  createZombieEscapeSparseAttachmentSearch,
  createZombieEscapeSparseCommittedNodeRoute,
  createZombieEscapeSparseFlowSearch,
  createZombieEscapeSparseReachableSpawnSearch,
  createZombieEscapeSparseSpawnAnchor,
  deactivateZombieEscapeCollisionObject,
  findFirstActiveZombieEscapeBreakableObjectId,
  followZombieEscapeCachedSparseWaypoint,
  getZombieEscapeSparseCommittedRouteContentHash,
  getZombieEscapeSparseCommittedRouteGeneration,
  getZombieEscapeSparseFlowSearchRouteGeneration,
  getZombieEscapeSparseRequestedTargetRevision,
  inspectZombieEscapeSparseAttachmentHeapLeases,
  inspectZombieEscapeSparseReverseFieldBanks,
  isZombieEscapeCollisionHitBreakable,
  isZombieEscapeCollisionObjectBreakable,
  moveZombieEscapeCircleWithSlide,
  moveZombieEscapeNavigationAgent,
  resetZombieEscapeSparseFlowSearch,
  resetZombieEscapeSparseReachableSpawnSearch,
  resolveZombieEscapeCollisionHitObjectId,
  resolveZombieEscapeCollisionHitObjectOrdinal,
  resolveZombieEscapeCollisionObjectIdByOrdinal,
  resolveZombieEscapeFlowDirection,
  resolveZombieEscapeNavigationTargetElevation,
  resolveZombieEscapeReachableSpawn,
  sampleZombieEscapeSparseCommittedNodeRoute,
  sampleZombieEscapeSparseSpawnAnchor,
  seedZombieEscapeSparseFlowSearchRouteCorridor,
  setZombieEscapeFlowFieldWorld,
  stepZombieEscapeNavigationVisibilitySearch,
  stepZombieEscapeSparseAttachmentSearch,
  stepZombieEscapeSparseFlowSearch,
  stepZombieEscapeSparseReachableSpawnSearch,
  stepZombieEscapeSparseTargetUpdate,
  sweepZombieEscapeCircleAgainstWorldInVerticalRange,
  sweepZombieEscapeProjectileAgainstWorld,
  updateZombieEscapeFlowTarget,
  type ZombieEscapeCollisionWorld,
  type ZombieEscapeFlowField,
  zombieEscapeCollisionObjectOrdinalIsActive,
  zombieEscapeSegmentIsClear,
  zombieEscapeSegmentIsClearInVerticalRange,
  zombieEscapeSparseFlowSearchCanBegin,
  zombieEscapeSparseFlowSearchCanProgress,
  zombieEscapeSparseReachableSpawnSearchCanProgress,
} from './zombie-escape-collision-world'
import {
  ZOMBIE_ESCAPE_OBSTACLE_BREACH_DURATION_SECONDS,
  ZOMBIE_ESCAPE_SIMULATION,
} from './zombie-escape-config'
import {
  resolveSparseNavigationStrictRegionWitnessNode,
  sparseNavigationTargetRegionContainsPoint,
} from './zombie-escape-sparse-navigation'
import { createZombieEscapeSparseObstacleFootprintUnions } from './zombie-escape-sparse-obstacle-footprints'

const AGENT_RADIUS = 0.22

function resolveExactFallbackAttachmentNode(
  world: ZombieEscapeCollisionWorld,
  openWorld: ZombieEscapeCollisionWorld,
  field: ZombieEscapeFlowField,
  sourceX: number,
  sourceZ: number,
  breakableObjectId: string,
) {
  const workspace = field.graphReverseFieldBanks
  const bank = workspace.banks[workspace.activeBankIndex]!
  const objectOrdinal = world.objectCatalog.objectIds.indexOf(breakableObjectId)
  const breachObjectIndex = world.navigationGraph.breachObjectOrdinals.indexOf(objectOrdinal)
  const breachActionDistance =
    ZOMBIE_ESCAPE_SIMULATION.zombieNavigationRoutePlanningSpeedMetersPerSecond *
    ZOMBIE_ESCAPE_OBSTACLE_BREACH_DURATION_SECONDS
  let bestAttachmentDistance = Number.POSITIVE_INFINITY
  let bestBreachCount = Number.POSITIVE_INFINITY
  let bestCost = Number.POSITIVE_INFINITY
  let bestNode = -1
  let bestTravelDistance = Number.POSITIVE_INFINITY
  for (let node = 0; node < world.navigationGraph.nodeIds.length; node += 1) {
    if (world.navigationGraph.layerIndices[node] !== 0) continue
    const routeCost = bank.graphSameLayerFallbackCosts[node]!
    const routeTravelDistance = bank.graphSameLayerFallbackDistances[node]!
    if (!Number.isFinite(routeCost) || !Number.isFinite(routeTravelDistance)) continue
    const nodeX = world.navigationGraph.x[node]!
    const nodeZ = world.navigationGraph.z[node]!
    if (!zombieEscapeSegmentIsClear(openWorld, sourceX, sourceZ, nodeX, nodeZ, world.agentRadius)) {
      continue
    }
    const attachmentDistance = Math.hypot(nodeX - sourceX, nodeZ - sourceZ)
    const attachmentCrossesBreakable = !zombieEscapeSegmentIsClear(
      world,
      sourceX,
      sourceZ,
      nodeX,
      nodeZ,
      world.agentRadius,
    )
    const routeIncludesBreakable =
      breachObjectIndex >= 0 &&
      (bank.graphSameLayerFallbackBreachMasks[
        node * bank.breachObjectWordCount + (breachObjectIndex >>> 5)
      ]! &
        (1 << (breachObjectIndex & 31))) !==
        0
    const attachmentBreachCount = attachmentCrossesBreakable && !routeIncludesBreakable ? 1 : 0
    const breachCount = bank.graphSameLayerFallbackBreachCounts[node]! + attachmentBreachCount
    const travelDistance = attachmentDistance + routeTravelDistance
    const cost = attachmentDistance + routeCost + attachmentBreachCount * breachActionDistance
    if (
      cost > bestCost + 1e-9 ||
      (Math.abs(cost - bestCost) <= 1e-9 &&
        (breachCount > bestBreachCount ||
          (breachCount === bestBreachCount &&
            (travelDistance > bestTravelDistance + 1e-9 ||
              (Math.abs(travelDistance - bestTravelDistance) <= 1e-9 &&
                (attachmentDistance > bestAttachmentDistance + 1e-9 ||
                  (Math.abs(attachmentDistance - bestAttachmentDistance) <= 1e-9 &&
                    bestNode >= 0 &&
                    node >= bestNode)))))))
    ) {
      continue
    }
    bestAttachmentDistance = attachmentDistance
    bestBreachCount = breachCount
    bestCost = cost
    bestNode = node
    bestTravelDistance = travelDistance
  }
  return bestNode
}

describe('Zombie Escape collision world', () => {
  test.each([
    Math.PI / 5,
    -Math.PI / 5,
  ])('matches the rotated-box collision axis in sparse footprint geometry at %p radians', (rotation) => {
    const world = createZombieEscapeCollisionWorld({
      agentRadius: AGENT_RADIUS,
      boundaryPolicy: 'none',
      boxes: [
        {
          centerX: 1.25,
          centerZ: -0.75,
          halfDepth: 0.35,
          halfWidth: 1.1,
          id: 'asymmetric-box',
          rotation,
        },
      ],
      playRadius: 8,
    })
    const box = world.boxes[0]!
    const worldAxisX = box.cosine
    const worldAxisZ = -box.sine
    const [layer] = createZombieEscapeSparseObstacleFootprintUnions({
      agentRadius: AGENT_RADIUS,
      arcToleranceMeters: 0.008,
      boxes: [
        {
          breakable: false,
          centerX: box.centerX,
          centerZ: box.centerZ,
          halfDepth: box.halfDepth,
          halfWidth: box.halfWidth,
          maximumY: box.maximumY,
          minimumY: box.minimumY,
          worldAxisX,
          worldAxisZ,
        },
      ],
      circles: [],
      layerElevations: [0],
      segments: [],
    })
    const support = layer!.components[0]!.outer.reduce(
      (maximum, point) => Math.max(maximum, point.x * worldAxisX + point.z * worldAxisZ),
      Number.NEGATIVE_INFINITY,
    )
    const exactSupport =
      box.centerX * worldAxisX + box.centerZ * worldAxisZ + box.halfWidth + AGENT_RADIUS
    expect(support).toBeGreaterThanOrEqual(exactSupport - 1e-9)
    expect(support).toBeLessThanOrEqual(exactSupport + 0.008 + 1e-9)
    for (const offset of [-0.002, 0.002]) {
      const distance = box.halfWidth + AGENT_RADIUS + offset
      const x = box.centerX + worldAxisX * distance
      const z = box.centerZ + worldAxisZ * distance
      expect(zombieEscapeSegmentIsClear(world, x, z, x, z, AGENT_RADIUS)).toBe(offset > 0)
    }
  })

  test.each([
    { minimumY: 1.799_499, shouldBlock: true },
    { minimumY: 1.799_5, shouldBlock: false },
  ])('matches sparse-footprint and navigation vertical authority at minimumY=$minimumY', ({
    minimumY,
    shouldBlock,
  }) => {
    const world = createZombieEscapeCollisionWorld({
      agentRadius: AGENT_RADIUS,
      boundaryPolicy: 'none',
      boxes: [
        {
          centerX: 0,
          centerZ: 0,
          halfDepth: 0.5,
          halfWidth: 0.5,
          id: 'vertical-threshold-box',
          maximumY: 4,
          minimumY,
          rotation: 0,
        },
      ],
      navigationSupports: [
        {
          boundary: true,
          elevation: 0,
          id: 'surface',
          polygon: [
            { x: -4, z: -4 },
            { x: 4, z: -4 },
            { x: 4, z: 4 },
            { x: -4, z: 4 },
          ],
        },
      ],
      playRadius: 5,
    })
    const box = world.boxes[0]!
    const [layer] = createZombieEscapeSparseObstacleFootprintUnions({
      agentRadius: AGENT_RADIUS,
      arcToleranceMeters: 0.008,
      boxes: [
        {
          breakable: false,
          centerX: box.centerX,
          centerZ: box.centerZ,
          halfDepth: box.halfDepth,
          halfWidth: box.halfWidth,
          maximumY: box.maximumY,
          minimumY: box.minimumY,
          worldAxisX: box.cosine,
          worldAxisZ: -box.sine,
        },
      ],
      circles: [],
      layerElevations: [0],
      segments: [],
    })
    expect(layer!.components.length > 0).toBe(shouldBlock)

    const hit = createZombieEscapeCollisionHit()
    const move = createZombieEscapeNavigationMoveResult()
    moveZombieEscapeNavigationAgent(world, -2, 0, 0, 4, 0, AGENT_RADIUS, -1, false, hit, move)
    expect(move.collided).toBe(shouldBlock)
  })

  test('builds a stable authority revision independent of source ordering', () => {
    const first = createZombieEscapeCollisionWorld({
      agentRadius: AGENT_RADIUS,
      boxes: [
        {
          breakable: true,
          centerX: 1,
          centerZ: -2,
          halfDepth: 0.4,
          halfWidth: 0.8,
          id: 'box:b',
          rotation: Math.PI / 5,
        },
        {
          centerX: -1,
          centerZ: -2,
          halfDepth: 0.3,
          halfWidth: 0.5,
          id: 'box:a',
          rotation: -Math.PI / 7,
        },
      ],
      circles: [
        { id: 'b', radius: 0.5, x: 2, z: 1 },
        { id: 'a', radius: 0.7, x: -2, z: 1 },
      ],
      playRadius: 8,
      segments: [
        { endX: 0, endZ: 3, halfThickness: 0.09, id: 'wall:b', startX: 0, startZ: 0.45 },
        {
          endX: 0,
          endZ: -0.45,
          halfThickness: 0.09,
          id: 'wall:a',
          startX: 0,
          startZ: -3,
        },
      ],
    })
    const second = createZombieEscapeCollisionWorld({
      agentRadius: AGENT_RADIUS,
      boxes: [...first.boxes].reverse(),
      circles: [...first.circles].reverse(),
      playRadius: 8,
      segments: [...first.segments].reverse(),
    })

    expect(second.revision).toBe(first.revision)
    expect(second.semanticKey).toBe(first.semanticKey)
    expect(second.navigationLayers).toEqual(first.navigationLayers)
    expect(second.broadphase.cellOffsets).toEqual(first.broadphase.cellOffsets)
    expect(second.broadphase.colliderIndices).toEqual(first.broadphase.colliderIndices)
    const field = createZombieEscapeFlowField(first)
    expect(setZombieEscapeFlowFieldWorld(field, second)).toBe(true)
    expect(field.world).toBe(second)
  })

  test('keeps navigation boundary-solid while open combat sweeps use only real colliders', () => {
    const source = {
      agentRadius: AGENT_RADIUS,
      boxes: [
        {
          breakable: true,
          centerX: 8,
          centerZ: 0,
          halfDepth: 0.5,
          halfWidth: 0.5,
          id: 'outside-furniture',
          maximumY: 1,
          minimumY: 0,
          rotation: 0,
        },
      ],
      playRadius: 2,
    } as const
    const navigation = createZombieEscapeCollisionWorld(source)
    const combat = createZombieEscapeCollisionWorld({ ...source, boundaryPolicy: 'none' })
    const hit = createZombieEscapeCollisionHit()
    const candidate = createZombieEscapeCollisionHit()

    expect(navigation.boundaryPolicy).toBe('solid')
    expect(combat.boundaryPolicy).toBe('none')
    expect(combat.semanticKey).not.toBe(navigation.semanticKey)
    expect(combat.revision).not.toBe(navigation.revision)

    sweepZombieEscapeProjectileAgainstWorld(navigation, 5, 0.5, 3, 1, 0, 0, 0.04, hit, candidate)
    expect(hit).toMatchObject({ colliderKind: 'boundary', time: 0 })

    sweepZombieEscapeProjectileAgainstWorld(combat, 5, 0.5, 3, 1, 0, 0, 0.04, hit, candidate)
    expect(hit.colliderKind).toBe('none')
    expect(zombieEscapeSegmentIsClearInVerticalRange(combat, 5, 3, 6, 3, 0.04, 0.4, 0.6)).toBe(true)

    sweepZombieEscapeProjectileAgainstWorld(combat, 6, 0.5, 0.53, 4, 0, 0, 0.04, hit, candidate)
    expect(hit.colliderKind).toBe('box')
    expect(hit.time).toBeGreaterThan(0)

    const afterBreak = createZombieEscapeCollisionWorldWithoutObjects(
      combat,
      new Set(['outside-furniture']),
    )
    const move = createZombieEscapeCircleMoveResult()
    moveZombieEscapeCircleWithSlide(afterBreak, 5, 3, 1, 0, AGENT_RADIUS, hit, move)
    expect(afterBreak.boundaryPolicy).toBe('none')
    expect(afterBreak.broadphase).toMatchObject({ gridHeight: 1, gridWidth: 1 })
    expect(move).toEqual({ collided: false, x: 6, z: 3 })
  })

  test('derives a rectangular open broadphase from every normalized collider primitive', () => {
    const world = createZombieEscapeCollisionWorld({
      agentRadius: AGENT_RADIUS,
      boundaryPolicy: 'none',
      boxes: [
        {
          centerX: -50,
          centerZ: 0,
          halfDepth: 0.5,
          halfWidth: 0.5,
          id: 'west-box',
          rotation: 0,
        },
      ],
      broadphaseCellSize: 2,
      circles: [{ id: 'center-circle', radius: 0.5, x: 0, z: 0 }],
      playRadius: 2,
      segments: [
        {
          endX: 51,
          endZ: 0,
          halfThickness: 0.1,
          id: 'east-segment',
          startX: 49,
          startZ: 0,
        },
      ],
    })

    expect(world.broadphase.gridOriginX).toBeLessThanOrEqual(-50.5)
    expect(
      world.broadphase.gridOriginX + world.broadphase.gridWidth * world.broadphase.cellSize,
    ).toBeGreaterThanOrEqual(51.1)
    expect(world.broadphase.gridWidth).toBeGreaterThan(world.broadphase.gridHeight * 20)
    expect(world.broadphase.gridWidth * world.broadphase.gridHeight).toBeLessThan(120)
    expect(new Set(world.broadphase.colliderIndices)).toEqual(new Set([0, 1, 2]))
  })

  test('traverses grid corners and grid lines as a direction-independent supercover', () => {
    const world = createZombieEscapeCollisionWorld({
      agentRadius: AGENT_RADIUS,
      boundaryPolicy: 'none',
      broadphaseCellSize: 1,
      circles: [
        { id: 'minimum-anchor', radius: 0, x: 0.5, z: 0.5 },
        { id: 'maximum-anchor', radius: 0, x: 5.5, z: 5.5 },
      ],
      playRadius: 1,
    })
    const sweep = (startX: number, startZ: number, endX: number, endZ: number) => {
      zombieEscapeSegmentIsClear(world, startX, startZ, endX, endZ, 0)
      return currentBroadphaseVisitedCells(world)
    }
    const diagonalCells = [0]
    for (let index = 1; index < 6; index += 1) {
      diagonalCells.push(index * 6 + index - 1, (index - 1) * 6 + index, index * 6 + index)
    }
    diagonalCells.sort((first, second) => first - second)
    const horizontalBoundaryCells = [2, 3].flatMap((row) =>
      Array.from({ length: 6 }, (_, column) => row * 6 + column),
    )

    expect(world.broadphase).toMatchObject({ gridHeight: 6, gridWidth: 6 })
    expect(sweep(0.5, 0.5, 5.5, 5.5)).toEqual(diagonalCells)
    expect(sweep(5.5, 5.5, 0.5, 0.5)).toEqual(diagonalCells)
    expect(sweep(0.5, 3, 5.5, 3)).toEqual(horizontalBoundaryCells)
    expect(sweep(5.5, 3, 0.5, 3)).toEqual(horizontalBoundaryCells)
  })

  test('matches an exhaustive broadphase for diagonal, corner, radius, and reverse sweeps', () => {
    const world = createZombieEscapeCollisionWorld({
      agentRadius: AGENT_RADIUS,
      boundaryPolicy: 'none',
      boxes: [
        {
          centerX: 5.5,
          centerZ: 5.25,
          halfDepth: 0.3,
          halfWidth: 0.6,
          id: 'rotated-box',
          rotation: Math.PI / 7,
        },
      ],
      broadphaseCellSize: 1,
      circles: [
        { id: 'minimum-anchor', radius: 0, x: 0.25, z: 0.25 },
        { id: 'corner-point', radius: 0, x: 2, z: 2 },
        { id: 'radius-neighbor', radius: 0, x: 4.5, z: 3.9 },
        { id: 'maximum-anchor', radius: 0, x: 7.75, z: 7.75 },
      ],
      playRadius: 1,
      segments: [
        {
          endX: 3,
          endZ: 3.3,
          halfThickness: 0.01,
          id: 'diagonal-thin-blocker',
          startX: 3,
          startZ: 2.7,
        },
      ],
    })
    const exhaustiveWorld = createExhaustiveBroadphaseWorld(world)
    const sweeps = [
      { displacementX: 7, displacementZ: 7, radius: 0.03, startX: 0.5, startZ: 0.5 },
      { displacementX: 3, displacementZ: 3, radius: 0, startX: 0.5, startZ: 0.5 },
      { displacementX: 7, displacementZ: 0, radius: 0.2, startX: 0.5, startZ: 4.05 },
      { displacementX: -7, displacementZ: -7, radius: 0.03, startX: 7.5, startZ: 7.5 },
    ]

    for (const sweep of sweeps) {
      const actual = createZombieEscapeCollisionHit()
      const expected = createZombieEscapeCollisionHit()
      sweepZombieEscapeCircleAgainstWorldInVerticalRange(
        world,
        sweep.startX,
        sweep.startZ,
        sweep.displacementX,
        sweep.displacementZ,
        sweep.radius,
        Number.NEGATIVE_INFINITY,
        Number.POSITIVE_INFINITY,
        actual,
      )
      sweepZombieEscapeCircleAgainstWorldInVerticalRange(
        exhaustiveWorld,
        sweep.startX,
        sweep.startZ,
        sweep.displacementX,
        sweep.displacementZ,
        sweep.radius,
        Number.NEGATIVE_INFINITY,
        Number.POSITIVE_INFINITY,
        expected,
      )
      expect(actual).toEqual(expected)
    }
  })

  test('bounds a long diagonal broadphase sweep by crossed cells instead of swept AABB area', () => {
    const side = 48
    const world = createZombieEscapeCollisionWorld({
      agentRadius: AGENT_RADIUS,
      boundaryPolicy: 'none',
      broadphaseCellSize: 1,
      circles: Array.from({ length: side * side }, (_, cell) => ({
        id: `cell:${String(cell).padStart(4, '0')}`,
        radius: 0,
        x: (cell % side) + 0.5,
        z: Math.floor(cell / side) + 0.5,
      })),
      playRadius: 1,
    })

    zombieEscapeSegmentIsClear(world, 0.5, 0.5, side - 0.5, side - 0.5, 0)

    const epoch = world.broadphase.visitEpoch[0]!
    const visitedCells = currentBroadphaseVisitedCells(world)
    const visitedColliders = world.broadphase.visitStamps.reduce(
      (count, stamp) => count + Number(stamp === epoch),
      0,
    )
    expect(visitedCells).toHaveLength(side * 3 - 2)
    expect(visitedColliders).toBe(visitedCells.length)
    expect(visitedCells.length).toBeLessThan(side * side * 0.1)
  })

  test('keeps a standard door aperture walkable and shares one reverse field', () => {
    const world = createDoorWorld()
    const field = createZombieEscapeFlowField(world)
    const sample = createFlowSample()

    expect(zombieEscapeSegmentIsClear(world, -3, 0, 3, 0, AGENT_RADIUS)).toBe(true)
    expect(updateZombieEscapeFlowTarget(field, 3, 0)).toBe(true)
    for (let zombie = 0; zombie < 64; zombie += 1) {
      updateZombieEscapeFlowTarget(field, 3.1, 0.1)
      resolveZombieEscapeFlowDirection(field, -3, zombie * 0.001, 3, 0, sample)
      expect(sample.reachable).toBe(true)
    }
    expect(updateZombieEscapeFlowTarget(field, 3.6, 0)).toBe(true)
    resolveZombieEscapeFlowDirection(field, -3, 0, 3.6, 0, sample)
    expect(sample.reachable).toBe(true)
    expect(updateZombieEscapeFlowTarget(field, -3, 0)).toBe(true)
    resolveZombieEscapeFlowDirection(field, -3, 0, -3, 0, sample)
    expect(sample).toMatchObject({ reachable: true, x: 0, z: 0 })
    expect(field.rebuildCount).toBe(0)
    expect(
      world.navigationLayers.reduce((cells, layer) => cells + layer.occupancy.length, 0),
    ).toBeLessThanOrEqual(230_400)
  })

  test('routes around a solid wall without ever crossing its swept collision volume', () => {
    const world = createZombieEscapeCollisionWorld({
      agentRadius: AGENT_RADIUS,
      playRadius: 8,
      segments: [{ endX: 0, endZ: 3, halfThickness: 0.09, id: 'wall', startX: 0, startZ: -3 }],
    })
    const field = createZombieEscapeFlowField(world)
    const sample = createFlowSample()
    const hit = createZombieEscapeCollisionHit()
    const move = createZombieEscapeCircleMoveResult()
    let x = -3
    let z = 0
    let maximumDetour = 0
    updateZombieEscapeFlowTarget(field, 3, 0)

    for (let step = 0; step < 900 && x < 2.7; step += 1) {
      updateZombieEscapeFlowTarget(field, 3.1, 0.1)
      resolveZombieEscapeFlowDirection(field, x, z, 3, 0, sample)
      expect(sample.reachable).toBe(true)
      moveZombieEscapeCircleWithSlide(
        world,
        x,
        z,
        sample.x * 0.08,
        sample.z * 0.08,
        AGENT_RADIUS,
        hit,
        move,
      )
      x = move.x
      z = move.z
      const closestWallZ = Math.max(-3, Math.min(3, z))
      expect(Math.hypot(x, z - closestWallZ)).toBeGreaterThanOrEqual(0.308)
    }

    expect(x).toBeGreaterThan(2.7)
    expect(field.rebuildCount).toBe(1)
    expect(updateZombieEscapeFlowTarget(field, 3.6, 0)).toBe(true)
    resolveZombieEscapeFlowDirection(field, -3, 0, 3.6, 0, sample)
    expect(field.rebuildCount).toBe(2)
  })

  test('a sealed barrier has no through-wall fallback intent', () => {
    const world = createZombieEscapeCollisionWorld({
      agentRadius: AGENT_RADIUS,
      playRadius: 5,
      segments: [{ endX: 0, endZ: 5, halfThickness: 0.09, id: 'wall', startX: 0, startZ: -5 }],
    })
    const field = createZombieEscapeFlowField(world)
    const sample = createFlowSample()
    sample.reachable = true
    sample.x = 1
    updateZombieEscapeFlowTarget(field, 2, 0)

    resolveZombieEscapeFlowDirection(field, -2, 0, 2, 0, sample)

    expect(sample).toMatchObject({ reachable: false, x: 0, z: 0 })
  })

  test('retains object ownership across collider pieces and removes one excluded object atomically', () => {
    const world = createZombieEscapeCollisionWorld({
      agentRadius: AGENT_RADIUS,
      playRadius: 8,
      segments: [
        {
          endX: 0,
          endZ: 0,
          halfThickness: 0.09,
          id: 'wall-a:piece-0',
          objectId: 'wall-a',
          startX: 0,
          startZ: -3,
        },
        {
          endX: 0,
          endZ: 3,
          halfThickness: 0.09,
          id: 'wall-a:piece-1',
          objectId: 'wall-a',
          startX: 0,
          startZ: 0,
        },
        {
          endX: 2,
          endZ: 3,
          halfThickness: 0.09,
          id: 'wall-b:piece-0',
          objectId: 'wall-b',
          startX: 0,
          startZ: 3,
        },
      ],
    })
    const hit = createZombieEscapeCollisionHit()

    expect(zombieEscapeSegmentIsClear(world, -2, -1, 2, -1, AGENT_RADIUS, hit)).toBe(false)
    expect(resolveZombieEscapeCollisionHitObjectId(world, hit)).toBe('wall-a')

    const filtered = createZombieEscapeCollisionWorldWithoutObjects(world, new Set(['wall-a']))
    expect(filtered.segments.map(({ objectId }) => objectId)).toEqual(['wall-b'])
    expect(zombieEscapeSegmentIsClear(filtered, -2, -1, 2, -1, AGENT_RADIUS)).toBe(true)
    expect(filtered.semanticKey).not.toBe(world.semanticKey)
  })

  test('swept slide cannot tunnel through a thin wall at a large displacement', () => {
    const world = createZombieEscapeCollisionWorld({
      agentRadius: AGENT_RADIUS,
      playRadius: 8,
      segments: [{ endX: 0, endZ: 3, halfThickness: 0.04, id: 'thin-wall', startX: 0, startZ: -3 }],
    })
    const hit = createZombieEscapeCollisionHit()
    const move = createZombieEscapeCircleMoveResult()

    moveZombieEscapeCircleWithSlide(world, -2, 0, 4, 1, AGENT_RADIUS, hit, move)

    expect(move.collided).toBe(true)
    expect(move.x).toBeLessThan(-0.25)
    expect(move.z).toBeGreaterThan(0)
  })

  test('keeps authored stair sides solid while connector portals open only at supported landings', () => {
    const world = createZombieEscapeCollisionWorld({
      agentRadius: AGENT_RADIUS,
      navigationConnectors: [
        {
          ascendingEnd: true,
          chainId: 'stair-flight',
          chainLowerY: 0,
          chainOrder: 0,
          chainUpperY: 2.5,
          endX: 0,
          endY: 2.5,
          endZ: 1.5,
          halfWidth: 0.5,
          id: 'stair-flight',
          startX: 0,
          startY: 0,
          startZ: -1.5,
        },
      ],
      navigationSupports: [
        {
          elevation: 2.5,
          id: 'upper-landing',
          polygon: [
            { x: -6, z: -6 },
            { x: 6, z: -6 },
            { x: 6, z: 6 },
            { x: -6, z: 6 },
          ],
        },
      ],
      playRadius: 8,
      segments: [
        {
          endX: -0.5,
          endZ: 1.5,
          halfThickness: 0.04,
          id: 'stair-side-left',
          maximumY: 3,
          minimumY: 0,
          startX: -0.5,
          startZ: -1.5,
        },
        {
          endX: 0.5,
          endZ: 1.5,
          halfThickness: 0.04,
          id: 'stair-side-right',
          maximumY: 3,
          minimumY: 0,
          startX: 0.5,
          startZ: -1.5,
        },
      ],
    })
    const hit = createZombieEscapeCollisionHit()
    const result = createZombieEscapeNavigationMoveResult()

    moveZombieEscapeNavigationAgent(world, -2, 0, 0, 4, 0, AGENT_RADIUS, -1, false, hit, result)

    expect(world.navigationConnectors).toHaveLength(1)
    expect(resolveZombieEscapeNavigationTargetElevation(world, 0, 0, 1.2, 0)).toBe(0)
    expect(resolveZombieEscapeNavigationTargetElevation(world, 0, 0, 2.45, 0)).toBe(2.5)
    expect(resolveZombieEscapeNavigationTargetElevation(world, 0, 0, 1.2, 2.5)).toBe(0)
    expect(resolveZombieEscapeNavigationTargetElevation(world, 0, 0, 0.05, 2.5)).toBe(0)
    expect(result.collided).toBe(true)
    expect(result.connectorIndex).toBe(-1)
    expect(result.x).toBeLessThan(-0.5 - AGENT_RADIUS)
    expect(result.y).toBe(0)
    const withoutConnector = createZombieEscapeCollisionWorldWithoutObjects(
      world,
      new Set(['stair-flight']),
    )
    expect(withoutConnector.navigationConnectors).toHaveLength(0)
    expect(withoutConnector.boxes).toHaveLength(0)

    const field = createZombieEscapeFlowField(world)
    const sample = createFlowSample()
    updateZombieEscapeFlowTarget(field, 0, 4, 2.5)
    resolveZombieEscapeFlowDirection(field, 0, -2.5, 0, 4, sample, hit)
    expect(sample.reachable).toBe(true)
    expect(sample.z).toBeGreaterThan(0)
  })

  test('uses exact oriented furniture boxes for navigation, corner sweeps, and vertical shots', () => {
    const world = createZombieEscapeCollisionWorld({
      agentRadius: AGENT_RADIUS,
      boxes: [
        {
          breakable: true,
          centerX: 0,
          centerZ: 0,
          halfDepth: 0.5,
          halfWidth: 1,
          id: 'table:footprint',
          maximumY: 0.8,
          minimumY: 0,
          objectId: 'table',
          rotation: Math.PI / 4,
        },
      ],
      playRadius: 8,
    })
    const hit = createZombieEscapeCollisionHit()

    expect(zombieEscapeSegmentIsClear(world, -3, 0, 3, 0, AGENT_RADIUS, hit)).toBe(false)
    expect(hit.colliderKind).toBe('box')
    expect(resolveZombieEscapeCollisionHitObjectId(world, hit)).toBe('table')
    expect(isZombieEscapeCollisionHitBreakable(world, hit)).toBe(true)
    expect(isZombieEscapeCollisionObjectBreakable(world, 'table')).toBe(true)

    sweepZombieEscapeCircleAgainstWorldInVerticalRange(world, -2, -2, 4, 4, 0.1, 0.5, 0.5, hit)
    expect(hit.colliderKind).toBe('box')
    expect(hit.time).toBeGreaterThan(0)
    expect(hit.time).toBeLessThan(1)
    expect(Math.hypot(hit.normalX, hit.normalZ)).toBeCloseTo(1, 5)

    expect(zombieEscapeSegmentIsClearInVerticalRange(world, -3, 0, 3, 0, 0.035, 0.7, 0.7)).toBe(
      false,
    )
    expect(zombieEscapeSegmentIsClearInVerticalRange(world, -3, 0, 3, 0, 0.035, 0.9, 0.9)).toBe(
      true,
    )
  })

  test('keys breakability and removes every primitive owned by one furniture object', () => {
    const unbreakable = createZombieEscapeCollisionWorld({
      agentRadius: AGENT_RADIUS,
      boxes: [
        {
          centerX: 0,
          centerZ: 0,
          halfDepth: 0.5,
          halfWidth: 1,
          id: 'cabinet:footprint',
          objectId: 'cabinet',
          rotation: 0,
        },
      ],
      playRadius: 8,
    })
    const breakable = createZombieEscapeCollisionWorld({
      agentRadius: AGENT_RADIUS,
      boxes: [{ ...unbreakable.boxes[0]!, breakable: true }],
      playRadius: 8,
    })

    expect(breakable.semanticKey).not.toBe(unbreakable.semanticKey)
    expect(isZombieEscapeCollisionObjectBreakable(unbreakable, 'cabinet')).toBe(false)
    expect(isZombieEscapeCollisionObjectBreakable(breakable, 'cabinet')).toBe(true)
    const filtered = createZombieEscapeCollisionWorldWithoutObjects(breakable, new Set(['cabinet']))
    expect(filtered.boxes).toHaveLength(0)
    expect(filtered.breakableObjectIds.size).toBe(0)
  })

  test('keeps a 0.9 meter doorway traversable for the maximum catalog radius', () => {
    const rounded = createDoorWorld(0.37, 'round')
    const flat = createDoorWorld(0.37, 'flat')

    expect(zombieEscapeSegmentIsClear(rounded, -3, 0, 3, 0, 0.37)).toBe(false)
    expect(zombieEscapeSegmentIsClear(flat, -3, 0, 3, 0, 0.37)).toBe(true)

    const field = createZombieEscapeFlowField(flat)
    const sample = createFlowSample()
    updateZombieEscapeFlowTarget(field, 3, 0)
    resolveZombieEscapeFlowDirection(field, -3, 0, 3, 0, sample)
    expect(sample.reachable).toBe(true)
  })

  test('filters line of sight by collider height and keys vertical semantics exactly', () => {
    const lowWall = createZombieEscapeCollisionWorld({
      agentRadius: AGENT_RADIUS,
      playRadius: 8,
      segments: [
        {
          endX: 0,
          endZ: 3,
          halfThickness: 0.09,
          id: 'low-wall',
          maximumY: 1,
          minimumY: 0,
          startX: 0,
          startZ: -3,
        },
      ],
    })
    const tallWall = createZombieEscapeCollisionWorld({
      agentRadius: AGENT_RADIUS,
      playRadius: 8,
      segments: [{ ...lowWall.segments[0]!, maximumY: 2 }],
    })

    expect(zombieEscapeSegmentIsClearInVerticalRange(lowWall, -2, 0, 2, 0, 0.04, 0.4, 0.8)).toBe(
      false,
    )
    expect(zombieEscapeSegmentIsClearInVerticalRange(lowWall, -2, 0, 2, 0, 0.04, 1.2, 1.8)).toBe(
      true,
    )
    expect(tallWall.semanticKey).not.toBe(lowWall.semanticKey)
    expect(tallWall.revision).not.toBe(lowWall.revision)
  })

  test('intersects projectile footprint and height intervals for every collider primitive', () => {
    const worlds = [
      [
        'box',
        createZombieEscapeCollisionWorld({
          agentRadius: AGENT_RADIUS,
          boxes: [
            {
              centerX: 0,
              centerZ: 0,
              halfDepth: 0.5,
              halfWidth: 0.5,
              id: 'low-box',
              maximumY: 0.8,
              minimumY: 0,
              rotation: 0,
            },
          ],
          playRadius: 8,
        }),
      ],
      [
        'circle',
        createZombieEscapeCollisionWorld({
          agentRadius: AGENT_RADIUS,
          circles: [{ id: 'low-circle', maximumY: 0.8, minimumY: 0, radius: 0.5, x: 0, z: 0 }],
          playRadius: 8,
        }),
      ],
      [
        'segment',
        createZombieEscapeCollisionWorld({
          agentRadius: AGENT_RADIUS,
          playRadius: 8,
          segments: [
            {
              endCap: 'flat',
              endX: 0.5,
              endZ: 0,
              halfThickness: 0.5,
              id: 'low-segment',
              maximumY: 0.8,
              minimumY: 0,
              startCap: 'flat',
              startX: -0.5,
              startZ: 0,
            },
          ],
        }),
      ],
    ] as const

    for (const [kind, world] of worlds) {
      const hit = createZombieEscapeCollisionHit()
      const candidate = createZombieEscapeCollisionHit()

      sweepZombieEscapeProjectileAgainstWorld(
        world,
        0,
        0.9,
        0.7,
        0,
        0,
        -0.375,
        0.035,
        hit,
        candidate,
      )
      expect(hit.colliderKind).toBe('none')

      sweepZombieEscapeProjectileAgainstWorld(
        world,
        0,
        0.7,
        0.7,
        0,
        0,
        -0.375,
        0.035,
        hit,
        candidate,
      )
      expect(hit.colliderKind).toBe(kind)
      expect(hit.normalY).toBe(0)

      sweepZombieEscapeProjectileAgainstWorld(
        world,
        0,
        0.7,
        0.7,
        0,
        0.5,
        -0.375,
        0.035,
        hit,
        candidate,
      )
      expect(hit.colliderKind).toBe('none')

      sweepZombieEscapeProjectileAgainstWorld(world, 0, 1, 0, 0, -1, 0, 0.035, hit, candidate)
      expect(hit.colliderKind).toBe(kind)
      expect(hit.time).toBeCloseTo(0.165, 6)
      expect(hit.normalX).toBe(0)
      expect(hit.normalY).toBe(1)
      expect(hit.normalZ).toBe(0)
    }
  })

  test('keeps a projectile spawned inside a real solid blocked at the point of origin', () => {
    const world = createZombieEscapeCollisionWorld({
      agentRadius: AGENT_RADIUS,
      boxes: [
        {
          centerX: 0,
          centerZ: 0,
          halfDepth: 0.5,
          halfWidth: 1,
          id: 'semantic-furniture',
          maximumY: 1,
          minimumY: 0,
          rotation: Math.PI / 6,
        },
      ],
      playRadius: 8,
    })
    const hit = createZombieEscapeCollisionHit()
    const candidate = createZombieEscapeCollisionHit()

    sweepZombieEscapeProjectileAgainstWorld(world, 0, 0.5, 0, 3, 0, 0, 0.035, hit, candidate)
    expect(hit.colliderKind).toBe('box')
    expect(hit.time).toBe(0)

    sweepZombieEscapeProjectileAgainstWorld(world, -3, 0.5, 0, 6, 0, 0, 0.035, hit, candidate)
    expect(hit.colliderKind).toBe('box')
    expect(hit.time).toBeGreaterThan(0)

    sweepZombieEscapeProjectileAgainstWorld(world, 0, 2, 0, 0, -3, 0, 0.035, hit, candidate)
    expect(hit.colliderKind).toBe('box')
    expect(hit.normalY).toBe(1)
  })

  test('chooses a deterministic spawn from the target-reachable BFS component', () => {
    const world = createZombieEscapeCollisionWorld({
      agentRadius: 0.37,
      playRadius: 8,
      segments: [
        { endX: 2, endZ: -2, halfThickness: 0.1, id: 'north', startX: -2, startZ: -2 },
        { endX: 2, endZ: 2, halfThickness: 0.1, id: 'east', startX: 2, startZ: -2 },
        { endX: -2, endZ: 2, halfThickness: 0.1, id: 'south', startX: 2, startZ: 2 },
        { endX: -2, endZ: -2, halfThickness: 0.1, id: 'west', startX: -2, startZ: 2 },
      ],
    })
    const field = createZombieEscapeFlowField(world)
    const first = createZombieEscapeReachableSpawn()
    const second = createZombieEscapeReachableSpawn()

    expect(resolveZombieEscapeReachableSpawn(field, 4, 0, 0, 0, 1, first)).toBe(true)
    expect(resolveZombieEscapeReachableSpawn(field, 4, 0, 0, 0, 1, second)).toBe(true)
    expect(second).toEqual(first)
    expect(first.reachable).toBe(true)
    expect(first.x).toBeLessThan(2)
    expect(first.x).toBeGreaterThan(0)

    const sample = createFlowSample()
    resolveZombieEscapeFlowDirection(field, first.x, first.z, 0, 0, sample)
    expect(sample.reachable).toBe(true)
  })

  test('routes across a large explicit island around a distant wall without area rasterization', () => {
    const createSparseWorld = (halfWidth: number) =>
      createZombieEscapeCollisionWorld({
        agentRadius: AGENT_RADIUS,
        boundaryPolicy: 'none',
        navigationSupports: [
          {
            boundary: true,
            elevation: 0,
            id: 'island-surface',
            polygon: [
              { x: -halfWidth, z: -30 },
              { x: halfWidth, z: -30 },
              { x: halfWidth, z: 30 },
              { x: -halfWidth, z: 30 },
            ],
          },
        ],
        playRadius: 10,
        segments: [
          {
            endX: 0,
            endZ: 5,
            halfThickness: 0.1,
            id: 'distant-wall',
            startX: 0,
            startZ: -5,
          },
        ],
      })
    const world = createSparseWorld(60)
    const widerWorld = createSparseWorld(120)
    expect(world.navigationMode).toBe('sparse')
    expect(world.gridWidth).toBe(1)
    expect(world.navigationGraph.nodeIds).toHaveLength(widerWorld.navigationGraph.nodeIds.length)
    expect(world.navigationGraph.nodeIds.length).toBeLessThan(64)
    expect(world.navigationGraph.strictAdjacency.toNodes.length).toBeLessThan(
      world.navigationGraph.nodeIds.length * 34,
    )

    const field = createZombieEscapeFlowField(world)
    const sample = createFlowSample()
    const hit = createZombieEscapeCollisionHit()
    const move = createZombieEscapeNavigationMoveResult()
    let x = -50
    let z = 0
    updateZombieEscapeFlowTarget(field, 50, 0, 0)
    let maximumDetour = 0
    for (let step = 0; step < 1_000 && x < 49.5; step += 1) {
      resolveZombieEscapeFlowDirection(field, x, z, 50, 0, sample, hit, 0)
      expect(sample.reachable).toBe(true)
      moveZombieEscapeNavigationAgent(
        world,
        x,
        0,
        z,
        sample.x * 0.2,
        sample.z * 0.2,
        AGENT_RADIUS,
        -1,
        false,
        hit,
        move,
        sample.connectorIndex,
        sample.connectorTargetEnd,
      )
      x = move.x
      z = move.z
      maximumDetour = Math.max(maximumDetour, Math.abs(z))
      if (Math.abs(x) <= 0.1 + AGENT_RADIUS) expect(Math.abs(z)).toBeGreaterThan(5)
    }
    expect(x).toBeGreaterThanOrEqual(49.5)
    expect(maximumDetour).toBeGreaterThan(5)
  })

  test('keeps one sparse reverse field while the live target moves inside its visible topology region', () => {
    const world = createZombieEscapeCollisionWorld({
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
      segments: [{ endX: 0, endZ: 5, halfThickness: 0.1, id: 'wall', startX: 0, startZ: -5 }],
    })
    const field = createZombieEscapeFlowField(world)
    const sample = createFlowSample()
    const hit = createZombieEscapeCollisionHit()
    const move = createZombieEscapeNavigationMoveResult()

    expect(updateZombieEscapeFlowTarget(field, 3, 0, 0)).toBe(true)
    resolveZombieEscapeFlowDirection(field, -3, 0, 3, 0, sample, hit, 0)
    expect(sample.reachable).toBe(true)
    expect(field.rebuildCount).toBe(1)

    const targetX = 4.2
    const targetZ = 1.2
    for (let step = 1; step <= 120; step += 1) {
      const amount = step / 120
      expect(
        updateZombieEscapeFlowTarget(field, 3 + (targetX - 3) * amount, targetZ * amount, 0),
      ).toBe(false)
    }
    let x = -3
    let z = 0
    for (let step = 0; step < 1_000 && Math.hypot(targetX - x, targetZ - z) >= 0.3; step += 1) {
      resolveZombieEscapeFlowDirection(field, x, z, targetX, targetZ, sample, hit, 0)
      expect(sample.reachable).toBe(true)
      moveZombieEscapeNavigationAgent(
        world,
        x,
        0,
        z,
        sample.x * 0.08,
        sample.z * 0.08,
        AGENT_RADIUS,
        -1,
        false,
        hit,
        move,
        sample.connectorIndex,
        sample.connectorTargetEnd,
      )
      x = move.x
      z = move.z
    }

    expect(Math.hypot(targetX - x, targetZ - z)).toBeLessThan(0.3)
    expect(field.rebuildCount).toBe(1)
    expect(field.fallbackRebuildCount).toBe(1)

    expect(updateZombieEscapeFlowTarget(field, -3, 0, 0)).toBe(true)
    resolveZombieEscapeFlowDirection(field, 3, 0, -3, 0, sample, hit, 0)
    expect(sample.reachable).toBe(true)
    expect(field.rebuildCount).toBe(2)
    expect(field.fallbackRebuildCount).toBe(2)
  })

  test('keeps strict and breakable sparse fields stable within a portal region and rebuilds on layer change', () => {
    const surface = [
      { x: -6, z: -6 },
      { x: 6, z: -6 },
      { x: 6, z: 6 },
      { x: -6, z: 6 },
    ]
    const world = createZombieEscapeCollisionWorld({
      agentRadius: AGENT_RADIUS,
      boundaryPolicy: 'none',
      navigationSupports: [
        {
          boundary: true,
          elevation: 0,
          id: 'ground-surface',
          polygon: surface,
        },
        { boundary: true, elevation: 3, id: 'upper-surface', polygon: surface },
      ],
      playRadius: 7,
      segments: [
        {
          breakable: true,
          endCap: 'flat',
          endX: 0,
          endZ: 6,
          halfThickness: 0.1,
          id: 'breakable-divider',
          objectId: 'breakable-divider',
          startCap: 'flat',
          startX: 0,
          startZ: -6,
        },
      ],
    })
    const field = createZombieEscapeFlowField(world)
    const sample = createFlowSample()

    expect(updateZombieEscapeFlowTarget(field, 3, 0, 0)).toBe(true)
    resolveZombieEscapeFlowDirection(field, -3, 0, 3, 0, sample, undefined, 0)
    expect(sample.reachable).toBe(true)
    expect(sample.waypointUsesFallback).toBe(true)
    expect(field.rebuildCount).toBe(1)
    expect(field.fallbackRebuildCount).toBe(1)

    expect(updateZombieEscapeFlowTarget(field, 4, 1, 0)).toBe(false)
    resolveZombieEscapeFlowDirection(field, -3, 0, 4, 1, sample, undefined, 0)
    expect(sample.reachable).toBe(true)
    expect(field.rebuildCount).toBe(1)
    expect(field.fallbackRebuildCount).toBe(1)

    expect(updateZombieEscapeFlowTarget(field, -3, 0, 3)).toBe(true)
    resolveZombieEscapeFlowDirection(field, 3, 0, -3, 0, sample, undefined, 3)
    expect(sample.reachable).toBe(true)
    expect(sample.waypointUsesFallback).toBe(true)
    expect(field.rebuildCount).toBe(2)
    expect(field.fallbackRebuildCount).toBe(2)
  })

  test('anchors both sides of a breakable divider and invalidates strict routing when crossing it', () => {
    const surface = [
      { x: -6, z: -6 },
      { x: 6, z: -6 },
      { x: 6, z: 6 },
      { x: -6, z: 6 },
    ]
    const world = createZombieEscapeCollisionWorld({
      agentRadius: AGENT_RADIUS,
      boundaryPolicy: 'none',
      circles: [{ id: 'left-static', radius: 0.6, x: -3, z: 0 }],
      navigationSupports: [{ boundary: true, elevation: 0, id: 'surface', polygon: surface }],
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
    const hit = createZombieEscapeCollisionHit()

    expect(updateZombieEscapeFlowTarget(field, 3, 0, 0)).toBe(true)
    resolveZombieEscapeFlowDirection(field, -5, 0, 3, 0, sample, hit, 0)
    expect(field.graphStrictTargetNodeCount).toBeGreaterThan(0)
    expect(field.graphFallbackTargetNodeCount).toBeGreaterThan(0)
    expect(
      world.navigationGraph.nodeIds.filter((id) => id.startsWith('0:anchor:strict:')),
    ).toHaveLength(2)
    expect(world.navigationGraph.nodeIds.some((id) => id.startsWith('0:anchor:fallback:'))).toBe(
      true,
    )
    expect(field.graphSparseTargetUpdate).toMatchObject({
      selectedFallbackAnchorCount: 1,
      selectedStrictAnchorCount: 1,
      totalTargetAnchorVisibilityTests: 0,
    })
    expect(field.rebuildCount).toBe(1)
    expect(field.fallbackRebuildCount).toBe(1)

    expect(updateZombieEscapeFlowTarget(field, -1.5, 0, 0)).toBe(true)
    resolveZombieEscapeFlowDirection(field, -5, 0, -1.5, 0, sample, hit, 0)
    expect(field.graphStrictTargetNodeCount).toBeGreaterThan(0)
    expect(field.rebuildCount).toBe(2)
    expect(field.fallbackRebuildCount).toBe(2)
    expect(sample.reachable).toBe(true)
    expect(sample.waypointUsesFallback).toBe(false)
  })

  test('reuses a strict blocked-target certificate while the player moves over breakable furniture', () => {
    const world = createZombieEscapeCollisionWorld({
      agentRadius: AGENT_RADIUS,
      boundaryPolicy: 'none',
      boxes: [
        {
          breakable: true,
          centerX: 0,
          centerZ: 0,
          halfDepth: 1,
          halfWidth: 1,
          id: 'table',
          objectId: 'table',
          rotation: 0,
        },
      ],
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
    })
    const field = createZombieEscapeFlowField(world)
    const sample = createFlowSample()
    const hit = createZombieEscapeCollisionHit()

    expect(updateZombieEscapeFlowTarget(field, -0.4, 0, 0)).toBe(true)
    resolveZombieEscapeFlowDirection(field, -4, 0, -0.4, 0, sample, hit, 0)
    expect(field.graphStrictTargetNodeCount).toBe(0)
    expect(field.graphFallbackTargetNodeCount).toBeGreaterThan(0)
    expect(field.graphSparseTargetUpdate).toMatchObject({
      selectedFallbackAnchorCount: 1,
      selectedStrictAnchorCount: 0,
      totalTargetAnchorVisibilityTests: 0,
    })
    expect(field.rebuildCount).toBe(1)
    expect(field.fallbackRebuildCount).toBe(1)

    for (let step = 1; step <= 20; step += 1) {
      const targetX = -0.4 + step * 0.04
      expect(updateZombieEscapeFlowTarget(field, targetX, 0, 0)).toBe(false)
      resolveZombieEscapeFlowDirection(field, -4, 0, targetX, 0, sample, hit, 0)
    }
    expect(field.rebuildCount).toBe(1)
    expect(field.fallbackRebuildCount).toBe(1)

    expect(updateZombieEscapeFlowTarget(field, 2, 0, 0)).toBe(true)
    resolveZombieEscapeFlowDirection(field, -4, 0, 2, 0, sample, hit, 0)
    expect(field.graphStrictTargetNodeCount).toBeGreaterThan(0)
    expect(field.rebuildCount).toBe(2)
    expect(field.fallbackRebuildCount).toBe(2)
  })

  test('anchors a sealed component with no obstacle corner node and reuses both empty-route results', () => {
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
          endCap: 'flat',
          endX: 0,
          endZ: 6,
          halfThickness: 0.1,
          id: 'static-divider',
          startCap: 'flat',
          startX: 0,
          startZ: -6,
        },
      ],
    })
    const field = createZombieEscapeFlowField(world)
    const sample = createFlowSample()

    expect(updateZombieEscapeFlowTarget(field, 3, 0, 0)).toBe(true)
    resolveZombieEscapeFlowDirection(field, -5, 0, 3, 0, sample, undefined, 0)
    expect(sample.reachable).toBe(false)
    expect(field.graphStrictTargetNodeCount).toBeGreaterThan(0)
    expect(field.graphFallbackTargetNodeCount).toBeGreaterThan(0)
    expect(field.graphSparseTargetUpdate).toMatchObject({
      completedAnchorSelectionCount: 2,
      selectedFallbackAnchorCount: 1,
      selectedStrictAnchorCount: 1,
      totalTargetAnchorVisibilityTests: 0,
    })
    expect(field.rebuildCount).toBe(1)
    expect(field.fallbackRebuildCount).toBe(1)

    expect(updateZombieEscapeFlowTarget(field, 4, 1, 0)).toBe(false)
    resolveZombieEscapeFlowDirection(field, -5, 0, 4, 1, sample, undefined, 0)
    expect(sample.reachable).toBe(false)
    expect(field.rebuildCount).toBe(1)
    expect(field.fallbackRebuildCount).toBe(1)
  })

  test('gives every lobe of a non-star-shaped free-space component a visible triangle witness', () => {
    const world = createZombieEscapeCollisionWorld({
      agentRadius: AGENT_RADIUS,
      boundaryPolicy: 'none',
      navigationSupports: [
        {
          boundary: true,
          elevation: 0,
          id: 'l-shaped-surface',
          polygon: [
            { x: -6, z: -6 },
            { x: 6, z: -6 },
            { x: 6, z: -2 },
            { x: -2, z: -2 },
            { x: -2, z: 6 },
            { x: -6, z: 6 },
          ],
        },
      ],
      playRadius: 7,
    })
    expect(world.navigationGraph.nodeIds.some((id) => id.startsWith('0:witness:'))).toBe(true)

    for (const target of [
      { sourceX: -4, sourceZ: 4, x: 4, z: -4 },
      { sourceX: 4, sourceZ: -4, x: -4, z: 4 },
    ]) {
      const field = createZombieEscapeFlowField(world)
      const sample = createFlowSample()
      expect(updateZombieEscapeFlowTarget(field, target.x, target.z, 0)).toBe(true)
      resolveZombieEscapeFlowDirection(
        field,
        target.sourceX,
        target.sourceZ,
        target.x,
        target.z,
        sample,
        undefined,
        0,
      )
      expect(field.graphStrictTargetNodeCount).toBeGreaterThan(0)
      expect(sample.reachable).toBe(true)
      expect(sample.waypointUsesFallback).toBe(false)
    }
  })

  test('selects deterministic target anchors independently of target-region ordering', () => {
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
    })
    const targetRegions = world.navigationGraph.targetRegionIndex
    const reversedWorld = {
      ...world,
      navigationGraph: {
        ...world.navigationGraph,
        targetRegionIndex: {
          fallbacks: targetRegions.fallbacks.slice().reverse(),
          firstXs: targetRegions.firstXs.slice().reverse(),
          firstZs: targetRegions.firstZs.slice().reverse(),
          layerIndices: targetRegions.layerIndices.slice().reverse(),
          secondXs: targetRegions.secondXs.slice().reverse(),
          secondZs: targetRegions.secondZs.slice().reverse(),
          thirdXs: targetRegions.thirdXs.slice().reverse(),
          thirdZs: targetRegions.thirdZs.slice().reverse(),
          witnessNodes: targetRegions.witnessNodes.slice().reverse(),
        },
      },
    }
    const field = createZombieEscapeFlowField(world)
    const reversedField = createZombieEscapeFlowField(reversedWorld)

    updateZombieEscapeFlowTarget(field, 0, 0, 0)
    updateZombieEscapeFlowTarget(reversedField, 0, 0, 0)

    expect(field.graphStrictTargetNodes.slice(0, field.graphStrictTargetNodeCount)).toEqual(
      reversedField.graphStrictTargetNodes.slice(0, reversedField.graphStrictTargetNodeCount),
    )
    expect(field.graphFallbackTargetNodes.slice(0, field.graphFallbackTargetNodeCount)).toEqual(
      reversedField.graphFallbackTargetNodes.slice(0, reversedField.graphFallbackTargetNodeCount),
    )
    expect(getZombieEscapeSparseCommittedRouteContentHash(field)).toBe(
      getZombieEscapeSparseCommittedRouteContentHash(reversedField),
    )
  })

  test('fails closed when a supported target has no compiled target-region anchor', () => {
    const baseWorld = createResumableSparseFlowWorld()
    const emptyTargetRegionIndex = {
      fallbacks: new Uint8Array(0),
      firstXs: new Float64Array(0),
      firstZs: new Float64Array(0),
      layerIndices: new Int16Array(0),
      secondXs: new Float64Array(0),
      secondZs: new Float64Array(0),
      thirdXs: new Float64Array(0),
      thirdZs: new Float64Array(0),
      witnessNodes: new Int32Array(0),
    }
    const world = {
      ...baseWorld,
      navigationGraph: {
        ...baseWorld.navigationGraph,
        targetRegionIndex: emptyTargetRegionIndex,
      },
    }
    const field = createZombieEscapeFlowField(world)
    const sample = createFlowSample()

    expect(updateZombieEscapeFlowTarget(field, 3, 0, 0)).toBe(true)
    resolveZombieEscapeFlowDirection(field, -3, 0, 3, 0, sample, undefined, 0)

    expect(sample.reachable).toBe(false)
    expect(field.graphSparseTargetUpdate).toMatchObject({
      completedAnchorSelectionCount: 2,
      selectedFallbackAnchorCount: 0,
      selectedStrictAnchorCount: 0,
      status: 'ready',
      totalMissingAnchorSelectionCount: 2,
      totalTargetAnchorVisibilityTests: 0,
    })
  })

  test('locates strict spawn regions in bounded layer buckets with deterministic shared-edge ownership', () => {
    const world = createZombieEscapeCollisionWorld({
      agentRadius: AGENT_RADIUS,
      boundaryPolicy: 'none',
      navigationSupports: [0, 3].map((elevation) => ({
        boundary: true as const,
        elevation,
        id: `surface-${String(elevation)}`,
        polygon: [
          { x: -6, z: -6 },
          { x: 6, z: -6 },
          { x: 6, z: 6 },
          { x: -6, z: 6 },
        ],
      })),
      playRadius: 7,
    })
    const index = world.navigationGraph.targetRegionIndex
    expect(index.bucketOffsets).toBeInstanceOf(Uint32Array)
    expect(index.bucketRegionIndices).toBeInstanceOf(Uint32Array)
    expect(index.maximumBucketRegionCount).toBeGreaterThan(0)

    let sharedX = Number.NaN
    let sharedZ = Number.NaN
    for (
      let first = 0;
      first < index.witnessNodes.length && !Number.isFinite(sharedX);
      first += 1
    ) {
      if (index.fallbacks[first] !== 0 || index.layerIndices[first] !== 0) continue
      const firstVertices = [
        [index.firstXs[first]!, index.firstZs[first]!],
        [index.secondXs[first]!, index.secondZs[first]!],
        [index.thirdXs[first]!, index.thirdZs[first]!],
      ] as const
      for (let second = first + 1; second < index.witnessNodes.length; second += 1) {
        if (index.fallbacks[second] !== 0 || index.layerIndices[second] !== 0) continue
        const secondVertices = [
          [index.firstXs[second]!, index.firstZs[second]!],
          [index.secondXs[second]!, index.secondZs[second]!],
          [index.thirdXs[second]!, index.thirdZs[second]!],
        ] as const
        const shared = firstVertices.filter(([x, z]) =>
          secondVertices.some(([otherX, otherZ]) => x === otherX && z === otherZ),
        )
        if (shared.length !== 2) continue
        sharedX = (shared[0]![0] + shared[1]![0]) * 0.5
        sharedZ = (shared[0]![1] + shared[1]![1]) * 0.5
        break
      }
    }
    expect(Number.isFinite(sharedX)).toBe(true)
    const containingWitnesses: number[] = []
    for (let region = 0; region < index.witnessNodes.length; region += 1) {
      if (
        index.fallbacks[region] === 0 &&
        index.layerIndices[region] === 0 &&
        sparseNavigationTargetRegionContainsPoint(index, region, sharedX, sharedZ)
      ) {
        containingWitnesses.push(index.witnessNodes[region]!)
      }
    }
    expect(containingWitnesses.length).toBeGreaterThanOrEqual(2)
    const expectedWitness = Math.min(...containingWitnesses)
    expect(resolveSparseNavigationStrictRegionWitnessNode(index, 0, sharedX, sharedZ)).toBe(
      expectedWitness,
    )
    expect(resolveSparseNavigationStrictRegionWitnessNode(index, 0, sharedX, sharedZ)).toBe(
      expectedWitness,
    )
    const upperWitness = resolveSparseNavigationStrictRegionWitnessNode(index, 1, sharedX, sharedZ)
    expect(upperWitness).toBeGreaterThanOrEqual(0)
    expect(world.navigationGraph.layerIndices[upperWitness]).toBe(1)
    expect(upperWitness).not.toBe(expectedWitness)
    expect(resolveSparseNavigationStrictRegionWitnessNode(index, 2, sharedX, sharedZ)).toBe(-1)
  })

  test('certifies only strict free-space spawns while retaining a committed fallback route witness', () => {
    const world = createZombieEscapeCollisionWorld({
      agentRadius: AGENT_RADIUS,
      boundaryPolicy: 'none',
      navigationSupports: [
        {
          boundary: true,
          elevation: 0,
          id: 'ground',
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
          endX: 0,
          endZ: 8,
          halfThickness: 0.1,
          id: 'breakable-divider',
          startX: 0,
          startZ: -8,
        },
      ],
    })
    const field = createZombieEscapeFlowField(world)
    const route = createZombieEscapeSparseCommittedNodeRoute()
    const anchor = createZombieEscapeSparseSpawnAnchor()
    expect(updateZombieEscapeFlowTarget(field, 3, 0, 0)).toBe(true)
    const generation = getZombieEscapeSparseCommittedRouteGeneration(field)

    expect(
      resolveSparseNavigationStrictRegionWitnessNode(
        world.navigationGraph.targetRegionIndex,
        0,
        0,
        0,
      ),
    ).toBe(-1)
    expect(sampleZombieEscapeSparseSpawnAnchor(field, 0, 0, 0, route, anchor)).toBe(false)
    expect(sampleZombieEscapeSparseSpawnAnchor(field, -3, 0, 0, route, anchor)).toBe(true)
    expect(anchor).toMatchObject({
      elevation: 0,
      generation,
      layerIndex: 0,
      reachable: true,
      usesFallback: true,
      x: -3,
      z: 0,
    })
    expect(anchor.witnessNode).toBeGreaterThanOrEqual(0)
    expect(world.navigationGraph.layerIndices[anchor.witnessNode]).toBe(0)
  })

  test('rejects an authored-ground certificate when only an upper navigation floor exists', () => {
    const world = createZombieEscapeCollisionWorld({
      agentRadius: AGENT_RADIUS,
      boundaryPolicy: 'none',
      navigationSupports: [
        {
          boundary: true,
          elevation: 3,
          id: 'upper-only',
          polygon: [
            { x: -4, z: -4 },
            { x: 4, z: -4 },
            { x: 4, z: 4 },
            { x: -4, z: 4 },
          ],
        },
      ],
      playRadius: 5,
    })
    const field = createZombieEscapeFlowField(world)
    const route = createZombieEscapeSparseCommittedNodeRoute()
    const anchor = createZombieEscapeSparseSpawnAnchor()
    expect(updateZombieEscapeFlowTarget(field, 2, 0, 3)).toBe(true)

    expect(sampleZombieEscapeSparseSpawnAnchor(field, -2, 0, 0, route, anchor)).toBe(false)
    expect(sampleZombieEscapeSparseSpawnAnchor(field, -2, 0, 3, route, anchor)).toBe(true)
    expect(anchor).toMatchObject({
      elevation: 3,
      layerIndex: world.navigationLayers.findIndex(({ elevation }) => elevation === 3),
      reachable: true,
    })
  })

  test('filters authored witness links through exact concave, hole, and breakable visibility', () => {
    const world = createZombieEscapeCollisionWorld({
      agentRadius: 0.35,
      boundaryPolicy: 'none',
      boxes: [
        {
          centerX: 4,
          centerZ: -1,
          halfDepth: 1.4,
          halfWidth: 0.7,
          id: 'solid-box',
          rotation: 0.4,
        },
        {
          breakable: true,
          centerX: -0.2,
          centerZ: -3,
          halfDepth: 0.7,
          halfWidth: 1.5,
          id: 'breakable-box',
          objectId: 'breakable-box',
          rotation: -0.3,
        },
      ],
      circles: [
        { id: 'solid-circle', radius: 1.1, x: -5, z: 4 },
        {
          breakable: true,
          id: 'breakable-circle',
          objectId: 'breakable-circle',
          radius: 0.8,
          x: 6,
          z: 4,
        },
      ],
      navigationSupports: [
        {
          boundary: true,
          elevation: 0,
          holes: [
            [
              { x: -7, z: -3 },
              { x: -4, z: -3 },
              { x: -4, z: 0 },
              { x: -7, z: 0 },
            ],
          ],
          id: 'concave-holed-support',
          polygon: [
            { x: -10, z: -8 },
            { x: 10, z: -8 },
            { x: 10, z: 8 },
            { x: 2, z: 8 },
            { x: 2, z: 2 },
            { x: -2, z: 2 },
            { x: -2, z: 8 },
            { x: -10, z: 8 },
          ],
        },
      ],
      playRadius: 12,
      segments: [
        {
          endCap: 'round',
          endX: -3,
          endZ: 4,
          halfThickness: 0.1,
          id: 'solid-segment',
          startCap: 'round',
          startX: -8,
          startZ: 4,
        },
        {
          breakable: true,
          endCap: 'flat',
          endX: 8,
          endZ: 1,
          halfThickness: 0.1,
          id: 'breakable-segment',
          objectId: 'breakable-segment',
          startCap: 'flat',
          startX: 3,
          startZ: 1,
        },
      ],
    })
    const graph = world.navigationGraph
    const first = graph.nodeIds.indexOf('0:witness:strict:0:0:166')
    const second = graph.nodeIds.indexOf('0:witness:strict:0:0:168')
    expect(first).toBeGreaterThanOrEqual(0)
    expect(second).toBeGreaterThanOrEqual(0)
    const leakedEdgeKey = `${String(Math.min(first, second))}:${String(Math.max(first, second))}`

    expect(exactZombieEscapeNavigationVisibilityStatus(world, first, second, false)).toBe('blocked')
    expect(exactZombieEscapeNavigationVisibilityStatus(world, first, second, true)).toBe('blocked')
    expect(sparseEdgeKeys(graph.strictAdjacency).has(leakedEdgeKey)).toBe(false)
    expect(sparseEdgeKeys(graph.fallbackAdjacency).has(leakedEdgeKey)).toBe(false)
    expect(sparseAuthoredAdjacencyVisibilityFailures(world, graph.strictAdjacency, false)).toEqual(
      [],
    )
    expect(sparseAuthoredAdjacencyVisibilityFailures(world, graph.fallbackAdjacency, true)).toEqual(
      [],
    )

    const strictField = createZombieEscapeFlowField(world)
    const strictSample = createFlowSample()
    updateZombieEscapeFlowTarget(strictField, 9, 7, 0)
    resolveZombieEscapeFlowDirection(strictField, -9, -7, 9, 7, strictSample, undefined, 0)
    expect(strictSample).toMatchObject({ reachable: true, waypointUsesFallback: false })

    const fallbackField = createZombieEscapeFlowField(world)
    const fallbackSample = createFlowSample()
    updateZombieEscapeFlowTarget(fallbackField, -0.2, -3, 0)
    resolveZombieEscapeFlowDirection(fallbackField, -9, -7, -0.2, -3, fallbackSample, undefined, 0)
    expect(fallbackSample).toMatchObject({ reachable: true, waypointUsesFallback: true })
    expect(fallbackField.graphStrictTargetNodeCount).toBe(0)
    expect(fallbackField.graphFallbackTargetNodeCount).toBe(1)
  })

  test('uses exact disk and capsule support at concave corners, holes, and tangencies', () => {
    const holedWorld = createZombieEscapeCollisionWorld({
      agentRadius: 0.5,
      boundaryPolicy: 'none',
      navigationSupports: [
        {
          boundary: true,
          elevation: 0,
          holes: [
            [
              { x: -1, z: -1 },
              { x: 1, z: -1 },
              { x: 1, z: 1 },
              { x: -1, z: 1 },
            ],
          ],
          id: 'holed-surface',
          polygon: [
            { x: -5, z: -5 },
            { x: 5, z: -5 },
            { x: 5, z: 5 },
            { x: -5, z: 5 },
          ],
        },
      ],
      playRadius: 2,
    })
    const resolve = (
      world: ReturnType<typeof createZombieEscapeCollisionWorld>,
      sourceX: number,
      sourceZ: number,
      targetX: number,
      targetZ: number,
    ) => {
      const field = createZombieEscapeFlowField(world)
      const sample = createFlowSample()
      updateZombieEscapeFlowTarget(field, targetX, targetZ, 0)
      resolveZombieEscapeFlowDirection(
        field,
        sourceX,
        sourceZ,
        targetX,
        targetZ,
        sample,
        undefined,
        0,
      )
      return sample
    }

    expect(resolve(holedWorld, 0, -4.5, 2, -4.5).reachable).toBe(true)
    expect(resolve(holedWorld, 0, -1.5, 2, -1.5).reachable).toBe(true)
    expect(resolve(holedWorld, 0, -1.4, 2, -1.4).reachable).toBe(false)

    const concaveWorld = createZombieEscapeCollisionWorld({
      agentRadius: 0.5,
      boundaryPolicy: 'none',
      navigationSupports: [
        {
          boundary: true,
          elevation: 0,
          id: 'concave-surface',
          polygon: [
            { x: -5, z: -5 },
            { x: 5, z: -5 },
            { x: 5, z: 5 },
            { x: 0.1, z: 0 },
            { x: 0, z: 5 },
            { x: -5, z: 5 },
          ],
        },
      ],
      playRadius: 2,
    })
    expect(resolve(concaveWorld, 0.1, -0.2, -2, -2).reachable).toBe(false)
  })

  test('unions same-elevation supports and clamps the complete movement prefix before a hole', () => {
    const seamWorld = createZombieEscapeCollisionWorld({
      agentRadius: AGENT_RADIUS,
      boundaryPolicy: 'none',
      navigationSupports: [
        {
          boundary: true,
          elevation: 0,
          id: 'left',
          polygon: [
            { x: -4, z: -2 },
            { x: 0.2, z: -2 },
            { x: 0.2, z: 2 },
            { x: -4, z: 2 },
          ],
        },
        {
          elevation: 0,
          id: 'right',
          polygon: [
            { x: -0.2, z: -2 },
            { x: 4, z: -2 },
            { x: 4, z: 2 },
            { x: -0.2, z: 2 },
          ],
        },
      ],
      playRadius: 2,
    })
    const hit = createZombieEscapeCollisionHit()
    const move = createZombieEscapeNavigationMoveResult()
    moveZombieEscapeNavigationAgent(seamWorld, -1, 0, 0, 2, 0, AGENT_RADIUS, -1, false, hit, move)
    expect(seamWorld.navigationSupports).toHaveLength(1)
    expect(move).toMatchObject({ collided: false, x: 1, y: 0, z: 0 })

    const holeWorld = createZombieEscapeCollisionWorld({
      agentRadius: 0.25,
      boundaryPolicy: 'none',
      navigationSupports: [
        {
          boundary: true,
          elevation: 0,
          holes: [
            [
              { x: -3, z: -1 },
              { x: -2, z: -1 },
              { x: -2, z: 1 },
              { x: -3, z: 1 },
            ],
          ],
          id: 'holed',
          polygon: [
            { x: -5, z: -5 },
            { x: 5, z: -5 },
            { x: 5, z: 5 },
            { x: -5, z: 5 },
          ],
        },
      ],
      playRadius: 2,
    })
    moveZombieEscapeNavigationAgent(holeWorld, -4, 0, 0, 8, 0, 0.25, -1, false, hit, move)
    expect(move.collided).toBe(true)
    expect(move.x).toBeLessThanOrEqual(-3.25 + 0.002)
    expect(move.y).toBe(0)
  })

  test('keeps strict sparse edges in fallback and structurally shares the graph after furniture breaks', () => {
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
          id: 'table',
          objectId: 'table',
          rotation: 0,
        },
      ],
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
      playRadius: 2,
      segments: [{ endX: 0, endZ: 4, halfThickness: 0.08, id: 'wall', startX: 0, startZ: 1 }],
    })
    const strictEdges = sparseEdgeKeys(world.navigationGraph.strictAdjacency)
    const fallbackEdges = sparseEdgeKeys(world.navigationGraph.fallbackAdjacency)
    expect([...strictEdges].every((edge) => fallbackEdges.has(edge))).toBe(true)

    const withoutTable = createZombieEscapeCollisionWorldWithoutObjects(world, new Set(['table']))
    expect(withoutTable.navigationGraph).toBe(world.navigationGraph)
    expect(withoutTable.navigationSupports).toBe(world.navigationSupports)
    expect(withoutTable.broadphase).not.toBe(world.broadphase)
    expect(withoutTable.boxes).toHaveLength(0)

    const withoutStaticWall = createZombieEscapeCollisionWorldWithoutObjects(
      world,
      new Set(['wall']),
    )
    expect(withoutStaticWall.navigationGraph).not.toBe(world.navigationGraph)
    expect(withoutStaticWall.segments).toHaveLength(0)
  })

  test('reuses sparse flow storage while rebuilding furniture-dependent routes against the new world', () => {
    const world = createZombieEscapeCollisionWorld({
      agentRadius: AGENT_RADIUS,
      boundaryPolicy: 'none',
      boxes: [
        {
          breakable: true,
          centerX: 3,
          centerZ: 0,
          halfDepth: 0.6,
          halfWidth: 0.6,
          id: 'target-table',
          objectId: 'target-table',
          rotation: 0,
        },
      ],
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
          endX: 0,
          endZ: 3,
          halfThickness: 0.1,
          id: 'static-wall',
          startX: 0,
          startZ: -3,
        },
      ],
    })
    const field = createZombieEscapeFlowField(world)
    const blockedSample = createFlowSample()
    updateZombieEscapeFlowTarget(field, 3, 0, 0)
    resolveZombieEscapeFlowDirection(field, -3, 0, 3, 0, blockedSample, undefined, 0)
    expect(blockedSample).toMatchObject({ reachable: true, waypointUsesFallback: true })
    expect(field.graphStrictTargetNodeCount).toBe(0)
    expect(field.graphFallbackTargetNodeCount).toBeGreaterThan(0)
    expect(field.graphSameLayerFallbackNextNodes.some((node) => node >= 0)).toBe(true)

    const storage = new Map<string, ArrayBufferView>()
    for (const [key, value] of Object.entries(field)) {
      if (ArrayBuffer.isView(value)) storage.set(key, value)
    }
    const collisionScratch = field.graphCollisionHit
    const previousRebuildCount = field.rebuildCount
    const previousFallbackRebuildCount = field.fallbackRebuildCount
    const withoutTable = createZombieEscapeCollisionWorldWithoutObjects(
      world,
      new Set(['target-table']),
    )
    expect(withoutTable.navigationGraph).toBe(world.navigationGraph)
    expect(withoutTable.navigationConnectors).toBe(world.navigationConnectors)

    expect(setZombieEscapeFlowFieldWorld(field, withoutTable)).toBe(true)
    expect(field.world).toBe(withoutTable)
    expect(field.world.broadphase).toBe(withoutTable.broadphase)
    expect(field.graphCollisionHit).toBe(collisionScratch)
    for (const [key, value] of storage) {
      const current = field[key as keyof typeof field]
      expect(current).toBe(value)
      if (ArrayBuffer.isView(current)) expect(current.buffer).toBe(value.buffer)
    }
    expect(field).toMatchObject({
      fallbackReachableCount: 0,
      fallbackTargetCell: -2,
      graphFallbackTargetNodeCount: 0,
      graphStrictTargetNodeCount: 0,
      reachableCount: 0,
      targetCell: -2,
      targetInitialized: false,
      targetLayerIndex: -1,
    })
    expect(field.graphFallbackTargetNodeMarks.every((mark) => mark === 0)).toBe(true)
    expect(field.graphStrictTargetNodeMarks.every((mark) => mark === 0)).toBe(true)
    expect(field.graphFallbackNextNodes.every((node) => node === -1)).toBe(true)
    expect(field.graphStrictNextNodes.every((node) => node === -1)).toBe(true)

    const freshField = createZombieEscapeFlowField(withoutTable)
    for (const key of storage.keys()) {
      expect(field[key as keyof typeof field]).toEqual(freshField[key as keyof typeof freshField])
    }
    const reusedSample = createFlowSample()
    const freshSample = createFlowSample()
    updateZombieEscapeFlowTarget(field, 3, 0, 0)
    updateZombieEscapeFlowTarget(freshField, 3, 0, 0)
    resolveZombieEscapeFlowDirection(field, -3, 0, 3, 0, reusedSample, undefined, 0)
    resolveZombieEscapeFlowDirection(freshField, -3, 0, 3, 0, freshSample, undefined, 0)

    expect(reusedSample).toEqual(freshSample)
    expect(reusedSample).toMatchObject({ reachable: true, waypointUsesFallback: true })
    expect(field.graphStrictTargetNodeCount).toBe(0)
    expect(field.graphFallbackTargetNodeCount).toBeGreaterThan(0)
    expect(field.rebuildCount - previousRebuildCount).toBe(freshField.rebuildCount)
    expect(field.fallbackRebuildCount - previousFallbackRebuildCount).toBe(
      freshField.fallbackRebuildCount,
    )
    for (const key of storage.keys()) {
      expect(field[key as keyof typeof field]).toEqual(freshField[key as keyof typeof freshField])
    }
    expect(setZombieEscapeFlowFieldWorld(field, withoutTable)).toBe(false)
  })

  test('keeps a farther strict-clear edge when a nearer fallback edge shares its sector', () => {
    const world = createZombieEscapeCollisionWorld({
      agentRadius: AGENT_RADIUS,
      boundaryPolicy: 'none',
      boxes: [
        {
          breakable: true,
          centerX: 1,
          centerZ: 0,
          halfDepth: 0.1,
          halfWidth: 0.1,
          id: 'near-breakable',
          objectId: 'near-breakable',
          rotation: 0,
        },
      ],
      circles: [
        { id: 'near-static', radius: 0.5, x: 2.5, z: 0 },
        { id: 'far-static', radius: 0.5, x: 6, z: 5.8 },
      ],
      navigationSupports: [
        {
          boundary: true,
          elevation: 0,
          id: 'surface',
          polygon: [
            { x: -10, z: -10 },
            { x: 10, z: -10 },
            { x: 10, z: 10 },
            { x: -10, z: 10 },
          ],
        },
      ],
      playRadius: 11,
    })
    const graph = world.navigationGraph
    const centerNode = graph.nodeIds.findIndex((id) => id.endsWith(':center'))
    expect(centerNode).toBeGreaterThanOrEqual(0)
    const neighborsInEastSector = (
      adjacency: typeof graph.strictAdjacency,
    ): ReadonlyArray<Readonly<{ distance: number; node: number }>> => {
      const neighbors: Array<{ distance: number; node: number }> = []
      for (
        let edge = adjacency.nodeOffsets[centerNode]!;
        edge < adjacency.nodeOffsets[centerNode + 1]!;
        edge += 1
      ) {
        const node = adjacency.toNodes[edge]!
        const offsetX = graph.x[node]! - graph.x[centerNode]!
        const offsetZ = graph.z[node]! - graph.z[centerNode]!
        const angle = Math.atan2(offsetZ, offsetX)
        if (angle < 0 || angle >= Math.PI / 4) continue
        neighbors.push({ distance: Math.hypot(offsetX, offsetZ), node })
      }
      return neighbors
    }
    const strictNeighbors = neighborsInEastSector(graph.strictAdjacency)
    const fallbackNeighbors = neighborsInEastSector(graph.fallbackAdjacency)
    expect(fallbackNeighbors.some(({ distance }) => distance < 2)).toBe(true)
    expect(strictNeighbors.some(({ distance }) => distance > 7)).toBe(true)
  })

  test('unions a partial hole fill exactly and canonicalizes reversed support input', () => {
    const supports = [
      {
        boundary: true as const,
        elevation: 0,
        holes: [
          [
            { x: -2, z: -2 },
            { x: 2, z: -2 },
            { x: 2, z: 2 },
            { x: -2, z: 2 },
          ],
        ],
        id: 'surface-with-hole',
        polygon: [
          { x: -5, z: -5 },
          { x: 5, z: -5 },
          { x: 5, z: 5 },
          { x: -5, z: 5 },
        ],
      },
      {
        elevation: 0,
        id: 'partial-fill',
        polygon: [
          { x: -2, z: -2 },
          { x: 0, z: -2 },
          { x: 0, z: 2 },
          { x: -2, z: 2 },
        ],
      },
    ]
    const create = (navigationSupports: typeof supports) =>
      createZombieEscapeCollisionWorld({
        agentRadius: AGENT_RADIUS,
        boundaryPolicy: 'none',
        navigationSupports,
        playRadius: 2,
      })
    const first = create(supports)
    const reversed = create([...supports].reverse())
    expect(reversed.semanticKey).toBe(first.semanticKey)
    expect(reversed.revision).toBe(first.revision)
    expect(reversed.navigationGraph.nodeIds).toEqual(first.navigationGraph.nodeIds)
    expect(reversed.navigationGraph.strictAdjacency).toEqual(first.navigationGraph.strictAdjacency)

    const hit = createZombieEscapeCollisionHit()
    const move = createZombieEscapeNavigationMoveResult()
    moveZombieEscapeNavigationAgent(first, -1, 0, -3, 0, 6, AGENT_RADIUS, -1, false, hit, move)
    expect(move).toMatchObject({ collided: false, x: -1, y: 0, z: 3 })

    moveZombieEscapeNavigationAgent(first, 1, 0, -3, 0, 6, AGENT_RADIUS, -1, false, hit, move)
    expect(move.collided).toBe(true)
    expect(move.z).toBeLessThanOrEqual(-2 - AGENT_RADIUS + 0.002)
  })

  test('routes past clustered occluders without a fixed neighbor cutoff', () => {
    const world = createZombieEscapeCollisionWorld({
      agentRadius: AGENT_RADIUS,
      boundaryPolicy: 'none',
      circles: [-3, 0, 3].map((z, index) => ({
        id: `palm-decoy-${String(index)}`,
        radius: 0.35,
        x: 0.8,
        z,
      })),
      navigationSupports: [
        {
          boundary: true,
          elevation: 0,
          id: 'surface',
          polygon: [
            { x: -16, z: -14 },
            { x: 16, z: -14 },
            { x: 16, z: 14 },
            { x: -16, z: 14 },
          ],
        },
      ],
      playRadius: 2,
      segments: [{ endX: 0, endZ: 10, halfThickness: 0.1, id: 'wall', startX: 0, startZ: -10 }],
    })
    const field = createZombieEscapeFlowField(world)
    const sample = createFlowSample()
    const hit = createZombieEscapeCollisionHit()
    const move = createZombieEscapeNavigationMoveResult()
    let x = -3
    let z = 0
    let maximumDetour = 0
    updateZombieEscapeFlowTarget(field, 3, 0, 0)
    for (let step = 0; step < 1_500 && x < 2.7; step += 1) {
      resolveZombieEscapeFlowDirection(field, x, z, 3, 0, sample, hit, 0)
      expect(sample.reachable).toBe(true)
      moveZombieEscapeNavigationAgent(
        world,
        x,
        0,
        z,
        sample.x * 0.08,
        sample.z * 0.08,
        AGENT_RADIUS,
        -1,
        false,
        hit,
        move,
        sample.connectorIndex,
        sample.connectorTargetEnd,
      )
      x = move.x
      z = move.z
      maximumDetour = Math.max(maximumDetour, Math.abs(z))
    }
    expect(x).toBeGreaterThanOrEqual(2.7)
    expect(maximumDetour).toBeGreaterThan(9.5)
  })

  test('keeps identical sparse obstacle rings and edges isolated by floor', () => {
    const polygon = [
      { x: -6, z: -6 },
      { x: 6, z: -6 },
      { x: 6, z: 6 },
      { x: -6, z: 6 },
    ]
    const world = createZombieEscapeCollisionWorld({
      agentRadius: AGENT_RADIUS,
      boundaryPolicy: 'none',
      circles: [{ id: 'column', radius: 0.8, x: 0, z: 0 }],
      navigationSupports: [
        { boundary: true, elevation: 0, id: 'ground', polygon },
        { boundary: true, elevation: 3, id: 'upper', polygon },
      ],
      playRadius: 8,
    })
    const unionLayerIds = new Set(
      world.navigationGraph.nodeIds.flatMap((id) => {
        const match = /^2:union:(\d+):/.exec(id)
        return match ? [Number(match[1])] : []
      }),
    )
    expect(unionLayerIds).toEqual(new Set([0, 1]))
    for (
      let node = 0;
      node < world.navigationGraph.strictAdjacency.nodeOffsets.length - 1;
      node += 1
    ) {
      for (
        let edge = world.navigationGraph.strictAdjacency.nodeOffsets[node]!;
        edge < world.navigationGraph.strictAdjacency.nodeOffsets[node + 1]!;
        edge += 1
      ) {
        const neighbor = world.navigationGraph.strictAdjacency.toNodes[edge]!
        expect(world.navigationGraph.layerIndices[neighbor]).toBe(
          world.navigationGraph.layerIndices[node],
        )
      }
    }
  })

  test('labels same-floor components independently when connectors join them through another floor', () => {
    const square = (minimumX: number, maximumX: number) => [
      { x: minimumX, z: -2 },
      { x: maximumX, z: -2 },
      { x: maximumX, z: 2 },
      { x: minimumX, z: 2 },
    ]
    const world = createZombieEscapeCollisionWorld({
      agentRadius: AGENT_RADIUS,
      boundaryPolicy: 'none',
      navigationConnectors: [
        {
          ascendingEnd: true,
          chainId: 'left-stair',
          chainLowerY: 0,
          chainOrder: 0,
          chainUpperY: 3,
          endX: -2,
          endY: 3,
          endZ: 0,
          halfWidth: 0.6,
          id: 'left-stair',
          startX: -4,
          startY: 0,
          startZ: 0,
        },
        {
          ascendingEnd: true,
          chainId: 'right-stair',
          chainLowerY: 0,
          chainOrder: 0,
          chainUpperY: 3,
          endX: 2,
          endY: 3,
          endZ: 0,
          halfWidth: 0.6,
          id: 'right-stair',
          startX: 4,
          startY: 0,
          startZ: 0,
        },
      ],
      navigationSupports: [
        { boundary: true, elevation: 0, id: 'ground-left', polygon: square(-6, -1) },
        { boundary: true, elevation: 0, id: 'ground-right', polygon: square(1, 6) },
        { boundary: true, elevation: 3, id: 'upper-bridge', polygon: square(-6, 6) },
      ],
      playRadius: 8,
    })
    const groundNodes: number[] = []
    for (let node = 0; node < world.navigationGraph.layerIndices.length; node += 1) {
      if (world.navigationGraph.layerIndices[node] === 0) groundNodes.push(node)
    }
    expect(groundNodes.length).toBeGreaterThan(1)
    expect(
      new Set(groundNodes.map((node) => world.navigationGraph.strictComponentIndices[node])).size,
    ).toBe(1)
    expect(
      new Set(
        groundNodes.map((node) => world.navigationGraph.strictSameLayerComponentIndices[node]),
      ).size,
    ).toBe(2)
  })

  test('routes the deterministic rotated-box free-space regression without graph fragmentation', () => {
    const random = (() => {
      let state = 2
      return () => {
        state = (Math.imul(state, 1_664_525) + 1_013_904_223) >>> 0
        return state / 4_294_967_296
      }
    })()
    const boxCount = 8 + Math.floor(random() * 17)
    const boxes = Array.from({ length: boxCount }, (_, index) => ({
      centerX: -8 + random() * 16,
      centerZ: -8 + random() * 16,
      halfWidth: 0.25 + random() * 1.1,
      halfDepth: 0.25 + random() * 1.1,
      id: `b${String(index)}`,
      maximumY: 3,
      minimumY: -1,
      objectId: `b${String(index)}`,
      rotation: random() * Math.PI,
    }))
    let source = { x: 0, z: 0 }
    let target = { x: 0, z: 0 }
    for (let pair = 0; pair <= 13; pair += 1) {
      source = { x: -8.8 + random() * 17.6, z: -8.8 + random() * 17.6 }
      target = { x: -8.8 + random() * 17.6, z: -8.8 + random() * 17.6 }
    }
    expect(source.x).toBeCloseTo(5.185199044644833, 12)
    expect(source.z).toBeCloseTo(-1.6054162379354242, 12)
    expect(target.x).toBeCloseTo(-8.108653139322996, 12)
    expect(target.z).toBeCloseTo(1.088064711913466, 12)

    const support = {
      elevation: 0,
      id: 'surface',
      polygon: [
        { x: -10, z: -10 },
        { x: 10, z: -10 },
        { x: 10, z: 10 },
        { x: -10, z: 10 },
      ],
    }
    const sparse = createZombieEscapeCollisionWorld({
      agentRadius: 0.48,
      boundaryPolicy: 'none',
      boxes,
      cellSize: 0.2,
      navigationSupports: [{ ...support, boundary: true }],
      playRadius: 11,
    })
    const dense = createZombieEscapeCollisionWorld({
      agentRadius: 0.48,
      boundaryPolicy: 'none',
      boxes,
      cellSize: 0.2,
      navigationSupports: [support],
      playRadius: 11,
    })
    expect(sparseNavigationComponentSizes(sparse.navigationGraph.strictAdjacency)).toEqual([
      sparse.navigationGraph.nodeIds.length,
    ])

    const pathLengths: number[] = []
    for (const world of [dense, sparse]) {
      const field = createZombieEscapeFlowField(world)
      const sample = createFlowSample()
      const hit = createZombieEscapeCollisionHit()
      const move = createZombieEscapeNavigationMoveResult()
      let x = source.x
      let z = source.z
      let pathLength = 0
      updateZombieEscapeFlowTarget(field, target.x, target.z, 0)
      for (let step = 0; step < 2_000 && Math.hypot(target.x - x, target.z - z) >= 0.3; step += 1) {
        resolveZombieEscapeFlowDirection(field, x, z, target.x, target.z, sample, hit, 0)
        expect(sample.reachable).toBe(true)
        moveZombieEscapeNavigationAgent(
          world,
          x,
          0,
          z,
          sample.x * 0.08,
          sample.z * 0.08,
          0.48,
          -1,
          false,
          hit,
          move,
          sample.connectorIndex,
          sample.connectorTargetEnd,
        )
        pathLength += Math.hypot(move.x - x, move.z - z)
        x = move.x
        z = move.z
      }
      expect(Math.hypot(target.x - x, target.z - z)).toBeLessThan(0.3)
      pathLengths.push(pathLength)
    }
    expect(pathLengths[1]!).toBeLessThanOrEqual(pathLengths[0]! * 1.35 + 0.5)
  })

  test('resumes the exact strict-to-fallback attachment search within every work slice', () => {
    const world = createResumableSparseFlowWorld()
    const expectedField = createZombieEscapeFlowField(world)
    const expected = createFlowSample()
    updateZombieEscapeFlowTarget(expectedField, 3, 0, 0)
    resolveZombieEscapeFlowDirection(expectedField, -3, 0, 3, 0, expected, undefined, 0)
    expect(expected).toMatchObject({ reachable: true, waypointUsesFallback: true })

    const field = createZombieEscapeFlowField(world)
    const output = createFlowSample()
    const search = createZombieEscapeSparseFlowSearch()
    updateZombieEscapeFlowTarget(field, 3, 0, 0)
    expect(beginZombieEscapeSparseFlowSearch(search, field, -3, 0, 3, 0, 0)).toBe('pending')
    expect(
      stepZombieEscapeSparseFlowSearch(search, field, output, {
        maximumCandidateVisits: 0,
        maximumCollisionPredicates: 0,
        maximumHeapOperations: 0,
        maximumHierarchyNodeVisits: 0,
        maximumSupportPredicates: 0,
      }),
    ).toBe('pending')
    expect(search).toMatchObject({
      lastStepCandidateVisits: 0,
      lastStepCollisionPredicates: 0,
      lastStepHierarchyNodeVisits: 0,
      lastStepSupportPredicates: 0,
      lastStepTargetBuilds: 0,
    })

    const budget = {
      maximumCandidateVisits: 1,
      maximumCollisionPredicates: 1,
      maximumHeapOperations: 1,
      maximumHierarchyNodeVisits: 1,
      maximumSupportPredicates: 1,
    }
    const targetBudget = {
      ...budget,
      maximumGraphEdgeVisits: 1,
      maximumHeapOperations: 1,
    }
    let candidateVisits = 0
    let collisionPredicates = 0
    let attachmentHierarchyNodeVisits = 0
    let hierarchyNodeVisits = 0
    let heapOperations = 0
    let status = search.status
    let steps = 0
    let supportPredicates = 0
    let targetBuilds = 0
    while (status === 'pending' && steps < 10_000) {
      status = stepZombieEscapeSparseFlowSearch(search, field, output, budget)
      expect(search.lastStepCandidateVisits).toBeLessThanOrEqual(1)
      expect(search.lastStepAttachmentHierarchyNodeVisits).toBeLessThanOrEqual(1)
      expect(search.lastStepCollisionPredicates).toBeLessThanOrEqual(1)
      expect(search.lastStepHeapOperations).toBeLessThanOrEqual(1)
      expect(search.lastStepHierarchyNodeVisits).toBeLessThanOrEqual(1)
      expect(search.lastStepSupportPredicates).toBeLessThanOrEqual(1)
      candidateVisits += search.lastStepCandidateVisits
      attachmentHierarchyNodeVisits += search.lastStepAttachmentHierarchyNodeVisits
      collisionPredicates += search.lastStepCollisionPredicates
      hierarchyNodeVisits += search.lastStepHierarchyNodeVisits
      heapOperations += search.lastStepHeapOperations
      supportPredicates += search.lastStepSupportPredicates
      targetBuilds += search.lastStepTargetBuilds
      if (status === 'pending') {
        stepZombieEscapeSparseTargetUpdate(field, targetBudget)
        expect(field.graphSparseTargetUpdate.lastStepCandidateVisits).toBeLessThanOrEqual(1)
        expect(field.graphSparseTargetUpdate.lastStepCollisionPredicates).toBeLessThanOrEqual(1)
        expect(field.graphSparseTargetUpdate.lastStepGraphEdgeVisits).toBeLessThanOrEqual(1)
        expect(field.graphSparseTargetUpdate.lastStepHeapOperations).toBeLessThanOrEqual(1)
        expect(field.graphSparseTargetUpdate.lastStepSupportPredicates).toBeLessThanOrEqual(1)
      }
      steps += 1
    }

    expect(status).toBe('found')
    expect(steps).toBeGreaterThan(4)
    expect(output.reachable).toBe(true)
    expect(output.waypointNode).toBe(expected.waypointNode)
    expect(output.waypointUsesFallback).toBe(expected.waypointUsesFallback)
    expect(output.x).toBeCloseTo(expected.x, 12)
    expect(output.z).toBeCloseTo(expected.z, 12)
    expect(search.totalCandidateVisits).toBe(candidateVisits)
    expect(search.totalAttachmentHierarchyNodeVisits).toBe(attachmentHierarchyNodeVisits)
    expect(search.totalAttachmentHierarchyNodeVisits).toBeLessThanOrEqual(
      search.totalHierarchyNodeVisits,
    )
    expect(search.totalCollisionPredicates).toBe(collisionPredicates)
    expect(search.totalHierarchyNodeVisits).toBe(hierarchyNodeVisits)
    expect(search.totalHeapOperations).toBe(heapOperations)
    expect(search.totalSupportPredicates).toBe(supportPredicates)
    expect(search.totalTargetBuilds).toBe(targetBuilds)
    expect(search.totalTargetBuilds).toBe(0)
    expect(field.graphSparseTargetUpdate.status).toBe('ready')
    expect(field.graphAttachmentFullSearchCount).toBe(2)

    const openWorld = createZombieEscapeCollisionWorldWithoutObjects(
      world,
      new Set(['breakable-divider']),
    )
    const exhaustiveNode = resolveExactFallbackAttachmentNode(
      world,
      openWorld,
      field,
      -3,
      0,
      'breakable-divider',
    )
    expect(search.cachedOriginalNode).toBe(exhaustiveNode)
    expect(search.attachment.bestNode).toBe(exhaustiveNode)
    const steeringNode = output.waypointNode ?? -1
    const steeringX = world.navigationGraph.x[steeringNode]!
    const steeringZ = world.navigationGraph.z[steeringNode]!
    const steeringDistance = Math.hypot(steeringX + 3, steeringZ)
    expect(search.cachedVisibleNode).toBe(steeringNode)
    expect(search.waypointNode).toBe(steeringNode)
    expect(output.x).toBeCloseTo((steeringX + 3) / steeringDistance, 12)
    expect(output.z).toBeCloseTo(steeringZ / steeringDistance, 12)

    const stableSearch = structuredClone(search)
    const routeNextNode = field.graphSameLayerFallbackNextNodes[steeringNode]!
    const followedWaypointNode = routeNextNode >= 0 ? routeNextNode : steeringNode
    const followedWaypointX = world.navigationGraph.x[followedWaypointNode]!
    const followedWaypointZ = world.navigationGraph.z[followedWaypointNode]!
    const followedWaypointDistance = Math.hypot(followedWaypointX + 3, followedWaypointZ)
    const zeroBudget = {
      maximumCandidateVisits: 0,
      maximumCollisionPredicates: 0,
      maximumHeapOperations: 0,
      maximumHierarchyNodeVisits: 0,
      maximumSupportPredicates: 0,
    }
    for (let follow = 0; follow < 3; follow += 1) {
      expect(
        followZombieEscapeCachedSparseWaypoint(field, -3, 0, 0, output, search, zeroBudget),
      ).toBe('followed')
      expect(search).toEqual(stableSearch)
      expect(output.waypointNode).toBe(followedWaypointNode)
      expect(output.x).toBeCloseTo((followedWaypointX + 3) / followedWaypointDistance, 12)
      expect(output.z).toBeCloseTo(followedWaypointZ / followedWaypointDistance, 12)
    }

    const cachedExpectedField = createZombieEscapeFlowField(world)
    const cachedExpected = createFlowSample()
    cachedExpected.waypointNode = search.waypointNode
    cachedExpected.waypointUsesFallback = true
    updateZombieEscapeFlowTarget(cachedExpectedField, 3, 0, 0)
    const cachedX = world.navigationGraph.x[search.waypointNode]!
    const cachedZ = world.navigationGraph.z[search.waypointNode]!
    resolveZombieEscapeFlowDirection(
      cachedExpectedField,
      cachedX,
      cachedZ,
      3,
      0,
      cachedExpected,
      undefined,
      0,
      search.waypointNode,
      true,
    )
    const cachedSearch = createZombieEscapeSparseFlowSearch()
    const cachedOutput = createFlowSample()
    const fullSearchesBeforeCache = field.graphAttachmentFullSearchCount
    beginZombieEscapeSparseFlowSearch(
      cachedSearch,
      field,
      cachedX,
      cachedZ,
      3,
      0,
      0,
      search.waypointNode,
      true,
    )
    let cachedSteps = 0
    while (
      stepZombieEscapeSparseFlowSearch(cachedSearch, field, cachedOutput, budget) === 'pending' &&
      cachedSteps < 10_000
    ) {
      expect(cachedSearch.lastStepCandidateVisits).toBeLessThanOrEqual(1)
      expect(cachedSearch.lastStepCollisionPredicates).toBeLessThanOrEqual(1)
      expect(cachedSearch.lastStepHierarchyNodeVisits).toBeLessThanOrEqual(1)
      expect(cachedSearch.lastStepSupportPredicates).toBeLessThanOrEqual(1)
      cachedSteps += 1
    }
    expect(cachedSearch.status).toBe('found')
    expect(cachedSearch.totalHierarchyNodeVisits).toBeGreaterThan(0)
    expect(cachedSearch.totalTargetBuilds).toBe(0)
    expect(field.graphAttachmentFullSearchCount).toBe(fullSearchesBeforeCache)
    expect(cachedOutput.waypointNode).toBe(cachedExpected.waypointNode)
    expect(cachedOutput.waypointUsesFallback).toBe(cachedExpected.waypointUsesFallback)
    expect(cachedOutput.x).toBeCloseTo(cachedExpected.x, 12)
    expect(cachedOutput.z).toBeCloseTo(cachedExpected.z, 12)
  })

  test('keeps zero-budget search state pure and classifies a newer committed route generation', () => {
    const world = createResumableSparseFlowWorld()
    const field = createZombieEscapeFlowField(world)
    const readyOutput = createFlowSample()
    updateZombieEscapeFlowTarget(field, 3, 0, 0)
    resolveZombieEscapeFlowDirection(field, -3, 0, 3, 0, readyOutput, undefined, 0)

    const search = createZombieEscapeSparseFlowSearch()
    const output = createFlowSample()
    const unitBudget = {
      maximumCandidateVisits: 1,
      maximumCollisionPredicates: 1,
      maximumHeapOperations: 1,
      maximumHierarchyNodeVisits: 1,
      maximumSupportPredicates: 1,
    }
    beginZombieEscapeSparseFlowSearch(search, field, -3, 0, 3, 0, 0)
    for (let step = 0; step < 1_000 && search.attachment.totalHeapOperations === 0; step += 1) {
      stepZombieEscapeSparseFlowSearch(search, field, output, unitBudget)
    }
    expect(search.status).toBe('pending')
    expect(search.attachment.totalHeapOperations).toBeGreaterThan(0)
    const midHeapSearch = structuredClone(search)
    const midHeapOutput = structuredClone(output)
    expect(
      stepZombieEscapeSparseFlowSearch(search, field, output, {
        maximumCandidateVisits: 0,
        maximumCollisionPredicates: 0,
        maximumHeapOperations: 0,
        maximumHierarchyNodeVisits: 0,
        maximumSupportPredicates: 0,
      }),
    ).toBe('pending')
    expect(search).toEqual(midHeapSearch)
    expect(output).toEqual(midHeapOutput)

    const routeRevision = field.routeRevision
    const searchRouteGeneration = getZombieEscapeSparseFlowSearchRouteGeneration(search)
    const routeGeneration = getZombieEscapeSparseCommittedRouteGeneration(field)
    expect(searchRouteGeneration).toBe(routeGeneration)
    beginZombieEscapeSparseTargetUpdate(field, -3, 0, 0)
    const targetBudget = {
      ...unitBudget,
      maximumGraphEdgeVisits: 1,
    }
    for (
      let step = 0;
      step < 10_000 && getZombieEscapeSparseCommittedRouteGeneration(field) === routeGeneration;
      step += 1
    ) {
      stepZombieEscapeSparseTargetUpdate(field, targetBudget)
    }
    expect(field.routeRevision).toBe(routeRevision)
    expect(getZombieEscapeSparseCommittedRouteGeneration(field)).toBeGreaterThan(routeGeneration)
    const publishedSearch = structuredClone(search)
    const publishedOutput = structuredClone(output)
    expect(
      stepZombieEscapeSparseFlowSearch(search, field, output, {
        maximumCandidateVisits: 0,
        maximumCollisionPredicates: 0,
        maximumHeapOperations: 0,
        maximumHierarchyNodeVisits: 0,
        maximumSupportPredicates: 0,
      }),
    ).toBe('pending')
    expect(search).toEqual(publishedSearch)
    expect(output).toEqual(publishedOutput)
    expect(stepZombieEscapeSparseFlowSearch(search, field, output, unitBudget)).toBe(
      'routePublished',
    )
    expect(getZombieEscapeSparseFlowSearchRouteGeneration(search)).toBe(searchRouteGeneration)
    expect(output).toEqual(midHeapOutput)
  })

  test('keeps exact mirrored attachment anchors separate from public string-pulled steering', () => {
    const world = createResumableSparseFlowWorld()
    const field = createZombieEscapeFlowField(world)
    const openWorld = createZombieEscapeCollisionWorldWithoutObjects(
      world,
      new Set(['breakable-divider']),
    )
    updateZombieEscapeFlowTarget(field, 3, 0, 0)

    for (const [sourceX, sourceZ] of [
      [-3, -4],
      [-3, 0],
      [-3, 4],
    ]) {
      const output = createFlowSample()
      resolveZombieEscapeFlowDirection(field, sourceX, sourceZ, 3, 0, output, undefined, 0)
      const oracleNode = resolveExactFallbackAttachmentNode(
        world,
        openWorld,
        field,
        sourceX,
        sourceZ,
        'breakable-divider',
      )
      const search = field.graphSparseFlowSearch
      expect(search.cachedOriginalNode).toBe(oracleNode)
      expect(search.attachment.bestNode).toBe(oracleNode)
      const steeringNode = output.waypointNode ?? -1
      const steeringX = world.navigationGraph.x[steeringNode]!
      const steeringZ = world.navigationGraph.z[steeringNode]!
      const steeringDistance = Math.hypot(steeringX - sourceX, steeringZ - sourceZ)
      expect(output).toMatchObject({ reachable: true, waypointUsesFallback: true })
      expect(search.cachedVisibleNode).toBe(steeringNode)
      expect(search.waypointNode).toBe(steeringNode)
      expect(output.x).toBeCloseTo((steeringX - sourceX) / steeringDistance, 12)
      expect(output.z).toBeCloseTo((steeringZ - sourceZ) / steeringDistance, 12)
    }
  })

  test('adopts a newly published descending route at the exact public waypoint in constant work', () => {
    const stableWorld = createRouteCorridorForkWorld()
    const stableField = createZombieEscapeFlowField(stableWorld)
    const stableOutput = createFlowSample()
    updateZombieEscapeFlowTarget(stableField, 2, -4, 0)
    resolveZombieEscapeFlowDirection(stableField, -8, -8, 2, -4, stableOutput, undefined, 0)
    const stableSearch = createZombieEscapeSparseFlowSearch()
    expect(
      seedZombieEscapeSparseFlowSearchRouteCorridor(
        stableSearch,
        stableField,
        stableOutput.waypointNode ?? -1,
        stableOutput.waypointUsesFallback,
      ),
    ).toBe(true)
    const stableGeneration = stableSearch.routeCorridorGeneration
    const stableAnchor = stableOutput.waypointNode ?? -1
    expect(stableSearch.cachedOriginalNode).toBe(stableAnchor)
    expect(stableSearch.routeCorridorUsesFallback).toBe(false)

    publishForcedSparseTarget(stableField, -2, -4)
    expect(getZombieEscapeSparseCommittedRouteGeneration(stableField)).toBe(stableGeneration + 1)
    expect(
      adoptZombieEscapeSparsePublishedRouteAtWaypoint(stableSearch, stableField, stableAnchor),
    ).toBe('adopted')
    expect(stableSearch.routeCorridorGeneration).toBe(
      getZombieEscapeSparseCommittedRouteGeneration(stableField),
    )
    expect(stableSearch.cachedOriginalNextNode).toBe(
      stableField.graphSameLayerNextNodes[stableAnchor],
    )
    expect(stableSearch.lastRouteCorridorSuccessorVisits).toBe(1)
    expect(stableSearch.maximumRouteCorridorSuccessorVisits).toBe(1)
    expect(stableSearch.totalRouteCorridorSuccessorVisits).toBe(1)

    const crossLayerWorld = createRouteCorridorCrossLayerWorld()
    const crossLayerField = createZombieEscapeFlowField(crossLayerWorld)
    const crossLayerOutput = createFlowSample()
    updateZombieEscapeFlowTarget(crossLayerField, 0, 5, 2.5)
    resolveZombieEscapeFlowDirection(crossLayerField, -6, -5, 0, 5, crossLayerOutput, undefined, 0)
    const crossLayerSearch = createZombieEscapeSparseFlowSearch()
    const crossLayerAnchor = crossLayerOutput.waypointNode ?? -1
    expect(
      seedZombieEscapeSparseFlowSearchRouteCorridor(
        crossLayerSearch,
        crossLayerField,
        crossLayerAnchor,
        crossLayerOutput.waypointUsesFallback,
      ),
    ).toBe(true)
    expect(crossLayerSearch.routeCorridorSourceLayerIndex).toBe(0)
    expect(crossLayerSearch.routeCorridorTargetLayerIndex).toBe(1)
    publishForcedSparseTarget(crossLayerField, 2, -5, 0)
    expect(
      adoptZombieEscapeSparsePublishedRouteAtWaypoint(
        crossLayerSearch,
        crossLayerField,
        crossLayerAnchor,
      ),
    ).toBe('adopted')
    expect(crossLayerSearch.lastRouteCorridorSuccessorVisits).toBe(1)
  })

  test('rejects a publication handoff when the public waypoint is not the certified anchor', () => {
    const world = createRouteCorridorForkWorld()
    const field = createZombieEscapeFlowField(world)
    const output = createFlowSample()
    updateZombieEscapeFlowTarget(field, 2, -4, 0)
    resolveZombieEscapeFlowDirection(field, -8, -8, 2, -4, output, undefined, 0)
    const search = createZombieEscapeSparseFlowSearch()
    expect(
      seedZombieEscapeSparseFlowSearchRouteCorridor(
        search,
        field,
        output.waypointNode ?? -1,
        output.waypointUsesFallback,
      ),
    ).toBe(true)
    const anchor = search.cachedOriginalNode
    const mismatchedWaypoint = anchor === 0 ? 1 : 0

    publishForcedSparseTarget(field, -2, -4)
    expect(adoptZombieEscapeSparsePublishedRouteAtWaypoint(search, field, mismatchedWaypoint)).toBe(
      'invalid',
    )
    expect(search.cachedOriginalNode).toBe(anchor)
    expect(search.routeCorridorGeneration).toBe(0)
    expect(search.lastRouteCorridorSuccessorVisits).toBe(0)
  })

  test('adopts a changed first successor without a radial or Euclidean-direction gate', () => {
    const world = createRouteCorridorSideSwitchWorld()
    const field = createZombieEscapeFlowField(world)
    const output = createFlowSample()
    updateZombieEscapeFlowTarget(field, 4, -5, 0)
    resolveZombieEscapeFlowDirection(field, -4, 0, 4, -5, output, undefined, 0)
    const search = createZombieEscapeSparseFlowSearch()
    const anchor = output.waypointNode ?? -1
    expect(
      seedZombieEscapeSparseFlowSearchRouteCorridor(
        search,
        field,
        anchor,
        output.waypointUsesFallback,
      ),
    ).toBe(true)
    const retainedFirstSuccessor = search.cachedOriginalNextNode

    let activeFirstSuccessor = retainedFirstSuccessor
    for (const [targetX, targetZ] of [
      [4, 5],
      [-4, 5],
      [-4, -5],
      [0, 6],
      [0, -6],
    ] as const) {
      publishForcedSparseTarget(field, targetX, targetZ)
      activeFirstSuccessor = field.graphSameLayerNextNodes[anchor]!
      if (activeFirstSuccessor !== retainedFirstSuccessor) break
    }
    expect(activeFirstSuccessor).not.toBe(retainedFirstSuccessor)
    expect(adoptZombieEscapeSparsePublishedRouteAtWaypoint(search, field, anchor)).toBe('adopted')
    expect(search.cachedOriginalNextNode).toBe(activeFirstSuccessor)
    expect(search.routeCorridorGeneration).toBe(
      getZombieEscapeSparseCommittedRouteGeneration(field),
    )
    expect(search.lastRouteCorridorSuccessorVisits).toBe(1)
  })

  test('adopts the fallback route at a certified reachable waypoint', () => {
    const world = createResumableSparseFlowWorld()
    const field = createZombieEscapeFlowField(world)
    const output = createFlowSample()
    updateZombieEscapeFlowTarget(field, 3, 0, 0)
    resolveZombieEscapeFlowDirection(field, -3, 0, 3, 0, output, undefined, 0)
    const search = createZombieEscapeSparseFlowSearch()
    const anchor = output.waypointNode ?? -1
    expect(output).toMatchObject({ reachable: true, waypointUsesFallback: true })
    expect(
      seedZombieEscapeSparseFlowSearchRouteCorridor(
        search,
        field,
        anchor,
        output.waypointUsesFallback,
      ),
    ).toBe(true)
    expect(adoptZombieEscapeSparsePublishedRouteAtWaypoint(search, field, anchor)).toBe('adopted')
    expect(search.routeCorridorUsesFallback).toBe(true)
    expect(search.lastRouteCorridorSuccessorVisits).toBe(1)
  })

  test('clears a corridor certificate without erasing its last public anchor', () => {
    const world = createRouteCorridorSideSwitchWorld()
    const field = createZombieEscapeFlowField(world)
    const spawnSearch = createZombieEscapeSparseFlowSearch()
    updateZombieEscapeFlowTarget(field, 4, -5, 0)
    resolveZombieEscapeFlowDirection(field, -4, 0, 4, -5, createFlowSample(), undefined, 0)
    const anchor = field.graphSparseFlowSearch.cachedOriginalNode
    expect(seedZombieEscapeSparseFlowSearchRouteCorridor(spawnSearch, field, anchor, false)).toBe(
      true,
    )
    clearZombieEscapeSparseFlowSearchRouteCorridor(spawnSearch)
    expect(spawnSearch.cachedOriginalNode).toBe(anchor)
    expect(adoptZombieEscapeSparsePublishedRouteAtWaypoint(spawnSearch, field, anchor)).toBe(
      'invalid',
    )
    expect(spawnSearch.lastRouteCorridorSuccessorVisits).toBe(0)
  })

  test('fails closed on malformed and unreachable active successors', () => {
    const world = createRouteCorridorForkWorld()
    const field = createZombieEscapeFlowField(world)
    const output = createFlowSample()
    updateZombieEscapeFlowTarget(field, 2, -4, 0)
    resolveZombieEscapeFlowDirection(field, -8, -8, 2, -4, output, undefined, 0)
    const search = createZombieEscapeSparseFlowSearch()
    expect(
      seedZombieEscapeSparseFlowSearchRouteCorridor(
        search,
        field,
        output.waypointNode ?? -1,
        output.waypointUsesFallback,
      ),
    ).toBe(true)
    const anchorNode = search.cachedOriginalNode
    field.graphSameLayerNextNodes[anchorNode] = anchorNode

    expect(
      adoptZombieEscapeSparsePublishedRouteAtWaypoint(search, field, output.waypointNode ?? -1),
    ).toBe('invalid')
    expect(search.routeCorridorGeneration).toBe(0)
    expect(search.lastRouteCorridorSuccessorVisits).toBe(1)
    expect(search.maximumRouteCorridorSuccessorVisits).toBe(1)
    expect(search.totalRouteCorridorSuccessorVisits).toBe(1)

    const unreachableField = createZombieEscapeFlowField(createRouteCorridorForkWorld())
    const unreachableOutput = createFlowSample()
    updateZombieEscapeFlowTarget(unreachableField, 2, -4, 0)
    resolveZombieEscapeFlowDirection(
      unreachableField,
      -8,
      -8,
      2,
      -4,
      unreachableOutput,
      undefined,
      0,
    )
    const unreachableSearch = createZombieEscapeSparseFlowSearch()
    expect(
      seedZombieEscapeSparseFlowSearchRouteCorridor(
        unreachableSearch,
        unreachableField,
        unreachableOutput.waypointNode ?? -1,
        unreachableOutput.waypointUsesFallback,
      ),
    ).toBe(true)
    const unreachableAnchor = unreachableSearch.cachedOriginalNode
    unreachableField.graphSameLayerDistances[unreachableAnchor] = Number.POSITIVE_INFINITY
    unreachableField.graphSameLayerFallbackDistances[unreachableAnchor] = Number.POSITIVE_INFINITY
    expect(
      adoptZombieEscapeSparsePublishedRouteAtWaypoint(
        unreachableSearch,
        unreachableField,
        unreachableAnchor,
      ),
    ).toBe('unreachable')
    expect(unreachableSearch.routeCorridorGeneration).toBe(0)
    expect(unreachableSearch.lastRouteCorridorSuccessorVisits).toBe(1)
  })

  test('exposes sparse-flow service eligibility across shared target waits and invalidation', () => {
    const world = createResumableSparseFlowWorld()
    const field = createZombieEscapeFlowField(world)
    const output = createFlowSample()
    const strictWait = createZombieEscapeSparseFlowSearch()
    const fallbackWait = createZombieEscapeSparseFlowSearch()
    expect(zombieEscapeSparseFlowSearchCanProgress(strictWait, field)).toBe(false)

    beginZombieEscapeSparseFlowSearch(strictWait, field, -3, 0, 3, 0, 0)
    beginZombieEscapeSparseFlowSearch(fallbackWait, field, -3, 0, 3, 0, 0)
    expect(zombieEscapeSparseFlowSearchCanProgress(strictWait, field)).toBe(true)
    strictWait.phase = 'wait-strict-target'
    fallbackWait.phase = 'wait-fallback-target'
    expect(zombieEscapeSparseFlowSearchCanProgress(strictWait, field)).toBe(false)
    expect(zombieEscapeSparseFlowSearchCanProgress(fallbackWait, field)).toBe(false)

    updateZombieEscapeFlowTarget(field, 3, 0, 0)
    resolveZombieEscapeFlowDirection(field, -3, 0, 3, 0, output, undefined, 0)
    expect(output).toMatchObject({ reachable: true, waypointUsesFallback: true })
    expect(zombieEscapeSparseFlowSearchCanProgress(strictWait, field)).toBe(true)
    expect(zombieEscapeSparseFlowSearchCanProgress(fallbackWait, field)).toBe(true)

    const agentBudget = {
      maximumCandidateVisits: 32,
      maximumCollisionPredicates: 8,
      maximumHeapOperations: 32,
      maximumHierarchyNodeVisits: 32,
      maximumSupportPredicates: 16,
    }
    setZombieEscapeFlowFieldWorld(
      field,
      createZombieEscapeCollisionWorldWithoutObjects(world, new Set(['breakable-divider'])),
    )
    expect(zombieEscapeSparseFlowSearchCanProgress(strictWait, field)).toBe(true)
    expect(zombieEscapeSparseFlowSearchCanProgress(fallbackWait, field)).toBe(true)
    expect(stepZombieEscapeSparseFlowSearch(strictWait, field, output, agentBudget)).toBe(
      'invalidated',
    )
    expect(stepZombieEscapeSparseFlowSearch(fallbackWait, field, output, agentBudget)).toBe(
      'invalidated',
    )
    expect(zombieEscapeSparseFlowSearchCanProgress(strictWait, field)).toBe(false)
    expect(zombieEscapeSparseFlowSearchCanProgress(fallbackWait, field)).toBe(false)
  })

  test('bounds attachment heaps to eight retryable agent leases plus two durable field leases', () => {
    const field = createZombieEscapeFlowField(createResumableSparseFlowWorld())
    updateZombieEscapeFlowTarget(field, 0, 0, 0)
    const searches = Array.from({ length: 9 }, () => createZombieEscapeSparseFlowSearch())
    const output = createFlowSample()
    const maximumHierarchyNodeCount = Math.max(
      ...field.world.navigationAttachmentAcceleration.layers.map(
        (hierarchy) => hierarchy.nodeItemCounts.length,
      ),
    )
    const budget = {
      maximumCandidateVisits: Number.POSITIVE_INFINITY,
      maximumCollisionPredicates: Number.POSITIVE_INFINITY,
      maximumHeapOperations: Number.POSITIVE_INFINITY,
      maximumHierarchyNodeVisits: Number.POSITIVE_INFINITY,
      maximumSupportPredicates: Number.POSITIVE_INFINITY,
    }
    const zeroBudget = {
      maximumCandidateVisits: 0,
      maximumCollisionPredicates: 0,
      maximumHeapOperations: 0,
      maximumHierarchyNodeVisits: 0,
      maximumSupportPredicates: 0,
    }

    for (let index = 0; index < 8; index += 1) {
      expect(zombieEscapeSparseFlowSearchCanBegin(searches[index]!, field)).toBe(true)
      expect(beginZombieEscapeSparseFlowSearch(searches[index]!, field, 0, 0, 0, 0, 0)).toBe(
        'pending',
      )
    }
    expect(inspectZombieEscapeSparseAttachmentHeapLeases(field)).toEqual({
      activeAgentLeases: 8,
      availableAgentLeases: 0,
      leaseInvariantViolationCount: 0,
      maximumActiveAgentLeases: 8,
      maximumHierarchyNodeCount,
      singletonReserved: true,
      spawnReserved: true,
    })

    const ninth = searches[8]!
    expect(zombieEscapeSparseFlowSearchCanBegin(ninth, field)).toBe(false)
    expect(beginZombieEscapeSparseFlowSearch(ninth, field, 0, 0, 0, 0, 0)).toBe('pending')
    expect(ninth.phase).toBe('wait-lease')
    const waitingSearch = structuredClone(ninth)
    const waitingOutput = structuredClone(output)
    expect(stepZombieEscapeSparseFlowSearch(ninth, field, output, zeroBudget)).toBe('pending')
    expect(ninth).toEqual(waitingSearch)
    expect(output).toEqual(waitingOutput)

    resetZombieEscapeSparseFlowSearch(searches[0]!)
    expect(inspectZombieEscapeSparseAttachmentHeapLeases(field).availableAgentLeases).toBe(1)
    expect(stepZombieEscapeSparseFlowSearch(ninth, field, output, budget)).toBe('found')
    expect(output.reachable).toBe(true)
    expect(inspectZombieEscapeSparseAttachmentHeapLeases(field).activeAgentLeases).toBe(7)

    for (let index = 1; index < 8; index += 1) {
      resetZombieEscapeSparseFlowSearch(searches[index]!)
    }
    for (let repetition = 0; repetition < 4; repetition += 1) {
      beginZombieEscapeSparseFlowSearch(field.graphSparseFlowSearch, field, 0, 0, 0, 0, 0)
      resetZombieEscapeSparseFlowSearch(field.graphSparseFlowSearch)
      resetZombieEscapeSparseReachableSpawnSearch(field.graphSparseReachableSpawnSearch)
    }
    expect(inspectZombieEscapeSparseAttachmentHeapLeases(field)).toEqual({
      activeAgentLeases: 0,
      availableAgentLeases: 8,
      leaseInvariantViolationCount: 0,
      maximumActiveAgentLeases: 8,
      maximumHierarchyNodeCount,
      singletonReserved: true,
      spawnReserved: true,
    })
  })

  test('serves strict and fallback readers from one committed four-variant snapshot', () => {
    const field = createZombieEscapeFlowField(createResumableSparseFlowWorld())
    updateZombieEscapeFlowTarget(field, 3, 0, 0)
    const searches = Array.from({ length: 8 }, () => createZombieEscapeSparseFlowSearch())
    const output = createFlowSample()
    const budget = {
      maximumCandidateVisits: Number.POSITIVE_INFINITY,
      maximumCollisionPredicates: Number.POSITIVE_INFINITY,
      maximumHeapOperations: Number.POSITIVE_INFINITY,
      maximumHierarchyNodeVisits: Number.POSITIVE_INFINITY,
      maximumSupportPredicates: Number.POSITIVE_INFINITY,
    }
    const generation = getZombieEscapeSparseCommittedRouteGeneration(field)
    for (const search of searches) {
      expect(beginZombieEscapeSparseFlowSearch(search, field, -3, 0, 3, 0, 0)).toBe('pending')
      expect(stepZombieEscapeSparseFlowSearch(search, field, output, budget)).toBe('found')
      expect(search.totalTargetBuilds).toBe(0)
      expect(output).toMatchObject({ reachable: true, waypointUsesFallback: true })
      expect(getZombieEscapeSparseFlowSearchRouteGeneration(search)).toBe(generation)
    }
    expect(inspectZombieEscapeSparseAttachmentHeapLeases(field)).toMatchObject({
      activeAgentLeases: 0,
      availableAgentLeases: 8,
      leaseInvariantViolationCount: 0,
      singletonReserved: true,
      spawnReserved: true,
    })
    expect(getZombieEscapeSparseCommittedRouteGeneration(field)).toBe(generation)
  })

  test('reuses one bounded heap arena for 1400 persistent sequential flow searches', () => {
    const world = createResumableSparseFlowWorld()
    const field = createZombieEscapeFlowField(world)
    updateZombieEscapeFlowTarget(field, 0, 0, 0)
    const searches = Array.from({ length: 1_400 }, () => createZombieEscapeSparseFlowSearch())
    const output = createFlowSample()
    const budget = {
      maximumCandidateVisits: Number.POSITIVE_INFINITY,
      maximumCollisionPredicates: Number.POSITIVE_INFINITY,
      maximumHeapOperations: Number.POSITIVE_INFINITY,
      maximumHierarchyNodeVisits: Number.POSITIVE_INFINITY,
      maximumSupportPredicates: Number.POSITIVE_INFINITY,
    }
    for (const search of searches) {
      expect(beginZombieEscapeSparseFlowSearch(search, field, 0, 0, 0, 0, 0)).toBe('pending')
      expect(stepZombieEscapeSparseFlowSearch(search, field, output, budget)).toBe('found')
    }
    const leases = inspectZombieEscapeSparseAttachmentHeapLeases(field)
    expect(leases).toMatchObject({
      activeAgentLeases: 0,
      availableAgentLeases: 8,
      leaseInvariantViolationCount: 0,
      maximumActiveAgentLeases: 1,
      singletonReserved: true,
      spawnReserved: true,
    })

    const componentCount = (indices: Int32Array) => {
      let maximum = -1
      for (const component of indices) maximum = Math.max(maximum, component)
      return maximum + 1
    }
    const graph = world.navigationGraph
    const maximumComponentCount = Math.max(
      componentCount(graph.strictComponentIndices),
      componentCount(graph.strictSameLayerComponentIndices),
      componentCount(graph.fallbackComponentIndices),
      componentCount(graph.fallbackSameLayerComponentIndices),
    )
    expect(field.graphTargetComponentVisitEpoch).toHaveLength(1)
    expect(field.graphTargetComponentVisitStamps).toHaveLength(maximumComponentCount)
    expect(field.graphSparseTargetUpdate.totalTargetAnchorVisibilityTests).toBe(0)
  })

  test('sizes one reusable target-component workspace by disconnected component count', () => {
    const baseWorld = createResumableSparseFlowWorld()
    const nodeCount = 1_400
    const singletonComponents = Int32Array.from({ length: nodeCount }, (_, node) => node)
    const pairedComponents = Int32Array.from({ length: nodeCount }, (_, node) => node >> 1)
    const groupedComponents = Int32Array.from({ length: nodeCount }, (_, node) => node >> 2)
    const emptyAdjacency = {
      breachCounts: new Uint32Array(0),
      breachObjectIndices: new Uint32Array(0),
      breachObjectOffsets: new Uint32Array(1),
      nodeOffsets: new Uint32Array(nodeCount + 1),
      toNodes: new Int32Array(0),
      weights: new Float32Array(0),
    }
    const world = {
      ...baseWorld,
      navigationGraph: {
        ...baseWorld.navigationGraph,
        buckets: new Map(),
        connectorEnds: new Uint8Array(nodeCount),
        connectorIndices: new Int16Array(nodeCount).fill(-1),
        fallbackAdjacency: emptyAdjacency,
        fallbackComponentIndices: pairedComponents,
        fallbackSameLayerComponentIndices: groupedComponents,
        layerIndices: new Int16Array(nodeCount),
        nodeIds: new Array<string>(nodeCount).fill('node'),
        nodeKeys: new Array<string>(nodeCount).fill('node'),
        strictAdjacency: emptyAdjacency,
        strictComponentIndices: singletonComponents,
        strictSameLayerComponentIndices: singletonComponents,
        supportIndices: new Uint32Array(0),
        supportOffsets: new Uint32Array(nodeCount + 1),
        x: new Float64Array(nodeCount),
        z: new Float64Array(nodeCount),
      },
    }
    const field = createZombieEscapeFlowField(world)
    expect(field.graphTargetComponentVisitEpoch).toHaveLength(1)
    expect(field.graphTargetComponentVisitStamps).toHaveLength(1_400)
  })

  test('classifies inactive sparse demands without mutating target lifecycle state', () => {
    const field = createZombieEscapeFlowField(createResumableSparseFlowWorld())
    const search = createZombieEscapeSparseFlowSearch()
    const initialTargetState = structuredClone(field.graphSparseTargetUpdate)
    expect(zombieEscapeSparseFlowSearchCanBegin(search, field)).toBe(true)
    expect(field.graphSparseTargetUpdate).toEqual(initialTargetState)

    beginZombieEscapeSparseTargetUpdate(field, 3, 0, 0)
    const pendingTargetState = structuredClone(field.graphSparseTargetUpdate)
    expect(pendingTargetState.status).toBe('pending')
    expect(zombieEscapeSparseFlowSearchCanBegin(search, field)).toBe(true)
    expect(field.graphSparseTargetUpdate).toEqual(pendingTargetState)

    field.graphSparseTargetUpdate.status = 'invalidated'
    const invalidatedTargetState = structuredClone(field.graphSparseTargetUpdate)
    expect(zombieEscapeSparseFlowSearchCanBegin(search, field)).toBe(true)
    expect(field.graphSparseTargetUpdate).toEqual(invalidatedTargetState)

    field.graphSparseTargetUpdate.status = 'pending'
    field.graphSparseTargetUpdate.worldRevision = 'stale-world'
    const staleTargetState = structuredClone(field.graphSparseTargetUpdate)
    expect(zombieEscapeSparseFlowSearchCanBegin(search, field)).toBe(true)
    expect(field.graphSparseTargetUpdate).toEqual(staleTargetState)

    const denseField = createZombieEscapeFlowField(
      createZombieEscapeCollisionWorld({
        agentRadius: AGENT_RADIUS,
        boundaryPolicy: 'none',
        playRadius: 7,
      }),
    )
    const denseTargetState = structuredClone(denseField.graphSparseTargetUpdate)
    expect(zombieEscapeSparseFlowSearchCanBegin(search, denseField)).toBe(false)
    expect(denseField.graphSparseTargetUpdate).toEqual(denseTargetState)
  })

  test('coalesces one repeated forced target while its original request is pending', () => {
    const field = createZombieEscapeFlowField(createResumableSparseFlowWorld())
    expect(beginZombieEscapeSparseTargetUpdate(field, 3, 0, 0, true)).toBe('pending')
    const requestedRevision = getZombieEscapeSparseRequestedTargetRevision(field)

    for (let repeat = 0; repeat < 120; repeat += 1) {
      expect(beginZombieEscapeSparseTargetUpdate(field, 3, 0, 0, true)).toBe('pending')
      expect(getZombieEscapeSparseRequestedTargetRevision(field)).toBe(requestedRevision)
    }

    expect(beginZombieEscapeSparseTargetUpdate(field, 3.5, 0, 0, true)).toBe('pending')
    expect(getZombieEscapeSparseRequestedTargetRevision(field)).toBe(requestedRevision + 1)
  })

  test('coalesces live target motion while enforcing every shared reverse-field work slice', () => {
    const world = createResumableSparseFlowWorld()
    const field = createZombieEscapeFlowField(world)
    const output = createFlowSample()
    const search = createZombieEscapeSparseFlowSearch()
    const agentBudget = {
      maximumCandidateVisits: 1,
      maximumCollisionPredicates: 1,
      maximumHeapOperations: 1,
      maximumHierarchyNodeVisits: 1,
      maximumSupportPredicates: 1,
    }
    const targetBudget = {
      ...agentBudget,
      maximumGraphEdgeVisits: 1,
      maximumHeapOperations: 1,
    }

    expect(beginZombieEscapeSparseTargetUpdate(field, 3, 0, 0)).toBe('pending')
    expect(
      stepZombieEscapeSparseTargetUpdate(field, {
        maximumCandidateVisits: 0,
        maximumCollisionPredicates: 0,
        maximumGraphEdgeVisits: 0,
        maximumHeapOperations: 0,
        maximumHierarchyNodeVisits: 0,
        maximumSupportPredicates: 0,
      }),
    ).toBe('pending')
    expect(field.graphSparseTargetUpdate).toMatchObject({
      lastStepCandidateVisits: 0,
      lastStepCollisionPredicates: 0,
      lastStepGraphEdgeVisits: 0,
      lastStepHeapOperations: 0,
      lastStepHierarchyNodeVisits: 0,
      lastStepSupportPredicates: 0,
    })
    beginZombieEscapeSparseFlowSearch(search, field, -3, 0, 3, 0, 0)

    let latestTargetX = 3
    for (
      let step = 0;
      step < 30_000 &&
      (field.graphSparseTargetUpdate.completedStrictBuilds < 1 || search.status === 'pending');
      step += 1
    ) {
      if (step < 300) {
        latestTargetX = 3 + (step % 100) * 0.001
        beginZombieEscapeSparseTargetUpdate(field, latestTargetX, 0, 0)
      }
      stepZombieEscapeSparseFlowSearch(search, field, output, agentBudget)
      stepZombieEscapeSparseTargetUpdate(field, targetBudget)
      expect(field.graphSparseTargetUpdate.lastStepCandidateVisits).toBeLessThanOrEqual(1)
      expect(field.graphSparseTargetUpdate.lastStepCollisionPredicates).toBeLessThanOrEqual(1)
      expect(field.graphSparseTargetUpdate.lastStepGraphEdgeVisits).toBeLessThanOrEqual(1)
      expect(field.graphSparseTargetUpdate.lastStepHeapOperations).toBeLessThanOrEqual(1)
      expect(field.graphSparseTargetUpdate.lastStepHierarchyNodeVisits).toBeLessThanOrEqual(1)
      expect(field.graphSparseTargetUpdate.lastStepSupportPredicates).toBeLessThanOrEqual(1)
    }

    expect(field.graphSparseTargetUpdate.completedStrictBuilds).toBe(1)
    expect(field.graphSparseTargetUpdate.restartCount).toBe(0)
    expect(field.targetX).toBe(latestTargetX)
    expect(getZombieEscapeSparseRequestedTargetRevision(field)).toBeGreaterThan(1)
    expect(search.status).toBe('found')
    while (field.graphSparseTargetUpdate.status === 'pending') {
      stepZombieEscapeSparseTargetUpdate(field, targetBudget)
    }
    const invalidationsBeforeMove = field.graphSparseTargetUpdate.routeInvalidationCount
    const generationBeforeMove = getZombieEscapeSparseCommittedRouteGeneration(field)
    beginZombieEscapeSparseTargetUpdate(field, -3, 0, 0)
    let validationSteps = 0
    while (field.graphSparseTargetUpdate.status === 'pending' && validationSteps < 10_000) {
      stepZombieEscapeSparseTargetUpdate(field, targetBudget)
      validationSteps += 1
    }
    expect(field.graphSparseTargetUpdate.status).toBe('ready')
    expect(field.graphSparseTargetUpdate.routeInvalidationCount).toBe(invalidationsBeforeMove + 1)
    expect(getZombieEscapeSparseCommittedRouteGeneration(field)).toBe(generationBeforeMove + 1)
    expect(field.targetCell).toBe(0)
    expect(field.fallbackTargetCell).toBe(0)
  })

  test('keeps the committed four-variant bank immutable until one atomic publication', () => {
    const field = createZombieEscapeFlowField(createResumableSparseFlowWorld())
    const graphNodeCount = field.world.navigationGraph.nodeIds.length
    const initialInspection = inspectZombieEscapeSparseReverseFieldBanks(field)
    const initialHash = getZombieEscapeSparseCommittedRouteContentHash(field)
    const initialStrictDistances = field.graphStrictDistances
    const initialStrictNextNodes = field.graphStrictNextNodes
    const initialFallbackDistances = field.graphFallbackDistances
    const initialFallbackNextNodes = field.graphFallbackNextNodes
    expect(initialInspection).toMatchObject({
      activeBankIndex: 0,
      activeGeneration: 0,
      activeRouteTargetLayerIndex: -1,
      publicationCount: 0,
      readerLeaseCount: 0,
    })
    const breachObjectWordCount = Math.ceil(field.world.navigationGraph.breachObjectCount / 32)
    const bytesPerBankNode =
      4 * Float64Array.BYTES_PER_ELEMENT +
      4 * Int32Array.BYTES_PER_ELEMENT +
      2 * Uint8Array.BYTES_PER_ELEMENT +
      2 * Uint32Array.BYTES_PER_ELEMENT +
      2 * Float64Array.BYTES_PER_ELEMENT +
      2 * Uint32Array.BYTES_PER_ELEMENT +
      2 * breachObjectWordCount * Uint32Array.BYTES_PER_ELEMENT
    expect(initialInspection.allocatedBytes).toBe(graphNodeCount * bytesPerBankNode * 2)
    expect(field.targetCell).toBe(-2)

    beginZombieEscapeSparseTargetUpdate(field, 3, 0, 0)
    const updateBeforeZeroBudget = structuredClone(field.graphSparseTargetUpdate)
    expect(
      stepZombieEscapeSparseTargetUpdate(field, {
        maximumCandidateVisits: 0,
        maximumCollisionPredicates: 0,
        maximumGraphEdgeVisits: 0,
        maximumHeapOperations: 0,
        maximumHierarchyNodeVisits: 0,
        maximumSupportPredicates: 0,
      }),
    ).toBe('pending')
    expect(field.graphSparseTargetUpdate).toEqual(updateBeforeZeroBudget)
    expect(inspectZombieEscapeSparseReverseFieldBanks(field)).toEqual(initialInspection)
    expect(getZombieEscapeSparseCommittedRouteContentHash(field)).toBe(initialHash)

    const unitBudget = {
      maximumCandidateVisits: 1,
      maximumCollisionPredicates: 1,
      maximumGraphEdgeVisits: 1,
      maximumHeapOperations: 1,
      maximumHierarchyNodeVisits: 1,
      maximumSupportPredicates: 1,
    }
    let partialSlices = 0
    for (let slice = 0; slice < 30_000; slice += 1) {
      stepZombieEscapeSparseTargetUpdate(field, unitBudget)
      const inspection = inspectZombieEscapeSparseReverseFieldBanks(field)
      if (inspection.publicationCount !== initialInspection.publicationCount) break
      partialSlices += 1
      expect(inspection.activeBankIndex).toBe(initialInspection.activeBankIndex)
      expect(inspection.activeGeneration).toBe(initialInspection.activeGeneration)
      expect(getZombieEscapeSparseCommittedRouteContentHash(field)).toBe(initialHash)
      expect(field.graphStrictDistances).toBe(initialStrictDistances)
      expect(field.graphStrictNextNodes).toBe(initialStrictNextNodes)
      expect(field.graphFallbackDistances).toBe(initialFallbackDistances)
      expect(field.graphFallbackNextNodes).toBe(initialFallbackNextNodes)
    }

    const published = inspectZombieEscapeSparseReverseFieldBanks(field)
    expect(partialSlices).toBeGreaterThan(1)
    expect(published).toMatchObject({
      activeBankIndex: 1,
      activeGeneration: 1,
      activeRouteTargetLayerIndex: 0,
      activeWorldRevision: field.world.revision,
      allocatedBytes: initialInspection.allocatedBytes,
      leaseInvariantViolationCount: 0,
      publicationCount: 1,
      readerLeaseCount: 0,
    })
    expect(field.graphSparseTargetUpdate.lastStepPublications).toBe(1)
    expect(field.rebuildCount).toBe(1)
    expect(field.fallbackRebuildCount).toBe(1)
    expect(field.targetCell).toBe(0)
    expect(field.fallbackTargetCell).toBe(0)
    expect(field.graphStrictDistances).not.toBe(initialStrictDistances)
    expect(field.graphFallbackDistances).not.toBe(initialFallbackDistances)
    expect(getZombieEscapeSparseCommittedRouteContentHash(field)).not.toBe(initialHash)

    const route = createZombieEscapeSparseCommittedNodeRoute()
    let strictReachable = 0
    let fallbackReachable = 0
    for (let node = 0; node < graphNodeCount; node += 1) {
      if (sampleZombieEscapeSparseCommittedNodeRoute(field, node, false, route)) {
        strictReachable += 1
        expect(route.generation).toBe(published.activeGeneration)
      }
      if (sampleZombieEscapeSparseCommittedNodeRoute(field, node, true, route)) {
        fallbackReachable += 1
        expect(route.generation).toBe(published.activeGeneration)
      }
    }
    expect(strictReachable).toBeGreaterThan(0)
    expect(fallbackReachable).toBeGreaterThanOrEqual(strictReachable)
  })

  test('pins all ten readers across publication and conserves every lease before bank reuse', () => {
    const field = createZombieEscapeFlowField(createResumableSparseFlowWorld())
    updateZombieEscapeFlowTarget(field, 3, 0, 0)
    const firstBank = inspectZombieEscapeSparseReverseFieldBanks(field)
    const output = createFlowSample()
    const spawnOutput = createZombieEscapeReachableSpawn()
    const pinBudget = {
      maximumCandidateVisits: 1,
      maximumCollisionPredicates: 0,
      maximumHeapOperations: 1,
      maximumHierarchyNodeVisits: 0,
      maximumSupportPredicates: 1,
    }
    const targetBudget = {
      maximumCandidateVisits: Number.POSITIVE_INFINITY,
      maximumCollisionPredicates: Number.POSITIVE_INFINITY,
      maximumGraphEdgeVisits: Number.POSITIVE_INFINITY,
      maximumHeapOperations: Number.POSITIVE_INFINITY,
      maximumHierarchyNodeVisits: Number.POSITIVE_INFINITY,
      maximumSupportPredicates: Number.POSITIVE_INFINITY,
    }
    const agentSearches = Array.from({ length: 8 }, () => createZombieEscapeSparseFlowSearch())

    for (let index = 0; index < agentSearches.length; index += 1) {
      const search = agentSearches[index]!
      beginZombieEscapeSparseFlowSearch(search, field, -3, 0, 3, 0, 0)
      for (
        let step = 0;
        step < 100 && inspectZombieEscapeSparseReverseFieldBanks(field).readerLeaseCount <= index;
        step += 1
      ) {
        stepZombieEscapeSparseFlowSearch(search, field, output, pinBudget)
      }
      expect(search.status).toBe('pending')
      expect(inspectZombieEscapeSparseReverseFieldBanks(field).readerLeaseCount).toBe(index + 1)
    }

    beginZombieEscapeSparseFlowSearch(field.graphSparseFlowSearch, field, -3, 0, 3, 0, 0)
    for (
      let step = 0;
      step < 100 && !inspectZombieEscapeSparseReverseFieldBanks(field).singletonPinned;
      step += 1
    ) {
      stepZombieEscapeSparseFlowSearch(field.graphSparseFlowSearch, field, output, pinBudget)
    }
    expect(field.graphSparseFlowSearch.status).toBe('pending')
    expect(inspectZombieEscapeSparseReverseFieldBanks(field).singletonPinned).toBe(true)

    beginZombieEscapeSparseReachableSpawnSearch(
      field.graphSparseReachableSpawnSearch,
      field,
      -3,
      0,
      3,
      0,
      1,
      0,
    )
    for (
      let step = 0;
      step < 100 && !inspectZombieEscapeSparseReverseFieldBanks(field).spawnPinned;
      step += 1
    ) {
      stepZombieEscapeSparseReachableSpawnSearch(
        field.graphSparseReachableSpawnSearch,
        field,
        spawnOutput,
        pinBudget,
      )
    }
    const allPinned = inspectZombieEscapeSparseReverseFieldBanks(field)
    expect(allPinned).toMatchObject({
      availableReaderLeases: 0,
      leaseInvariantViolationCount: 0,
      maximumReaderLeaseCount: 10,
      readerLeaseCount: 10,
      singletonPinned: true,
      spawnPinned: true,
    })
    expect(allPinned.activeBankIndex).toBe(firstBank.activeBankIndex)
    expect(allPinned.bankOneReaderCount + allPinned.bankZeroReaderCount).toBe(10)

    beginZombieEscapeSparseTargetUpdate(field, -3, 0, 0)
    for (
      let step = 0;
      step < 100 &&
      getZombieEscapeSparseCommittedRouteGeneration(field) === firstBank.activeGeneration;
      step += 1
    ) {
      stepZombieEscapeSparseTargetUpdate(field, targetBudget)
    }
    const secondBank = inspectZombieEscapeSparseReverseFieldBanks(field)
    expect(secondBank.activeGeneration).toBe(firstBank.activeGeneration + 1)
    expect(secondBank.activeBankIndex).not.toBe(firstBank.activeBankIndex)
    expect(secondBank.readerLeaseCount).toBe(10)
    expect(
      firstBank.activeBankIndex === 0
        ? secondBank.bankZeroReaderCount
        : secondBank.bankOneReaderCount,
    ).toBe(10)

    beginZombieEscapeSparseTargetUpdate(field, 3, 0, 0)
    for (
      let step = 0;
      step < 100 && field.graphSparseTargetUpdate.phase !== 'wait-staging-bank';
      step += 1
    ) {
      stepZombieEscapeSparseTargetUpdate(field, targetBudget)
    }
    const blocked = inspectZombieEscapeSparseReverseFieldBanks(field)
    expect(field.graphSparseTargetUpdate.phase).toBe('wait-staging-bank')
    expect(blocked.activeBankIndex).toBe(secondBank.activeBankIndex)
    expect(blocked.activeGeneration).toBe(secondBank.activeGeneration)
    expect(blocked.publicationCount).toBe(secondBank.publicationCount)
    expect(blocked.publicationBlockedCount).toBeGreaterThan(0)

    expect(stepZombieEscapeSparseFlowSearch(agentSearches[0]!, field, output, pinBudget)).toBe(
      'routePublished',
    )
    expect(inspectZombieEscapeSparseReverseFieldBanks(field).readerLeaseCount).toBe(9)
    resetZombieEscapeSparseFlowSearch(agentSearches[0]!)
    expect(inspectZombieEscapeSparseReverseFieldBanks(field).readerLeaseCount).toBe(9)
    for (let index = 1; index < agentSearches.length; index += 1) {
      resetZombieEscapeSparseFlowSearch(agentSearches[index]!)
    }
    resetZombieEscapeSparseFlowSearch(field.graphSparseFlowSearch)
    resetZombieEscapeSparseReachableSpawnSearch(field.graphSparseReachableSpawnSearch)
    expect(inspectZombieEscapeSparseReverseFieldBanks(field)).toMatchObject({
      availableReaderLeases: 10,
      leaseInvariantViolationCount: 0,
      maximumReaderLeaseCount: 10,
      readerLeaseCount: 0,
      singletonPinned: false,
      spawnPinned: false,
    })

    const invalidAttachment = createZombieEscapeSparseAttachmentSearch()
    expect(
      beginZombieEscapeSparseAttachmentSearch(
        invalidAttachment,
        field,
        field.graphSameLayerDistances,
        0,
        -3,
        0,
        false,
      ),
    ).toBe('pending')
    expect(inspectZombieEscapeSparseReverseFieldBanks(field).readerLeaseCount).toBe(1)
    expect(
      beginZombieEscapeSparseAttachmentSearch(
        invalidAttachment,
        field,
        field.graphSameLayerDistances,
        -1,
        -3,
        0,
        false,
      ),
    ).toBe('unreachable')
    expect(inspectZombieEscapeSparseReverseFieldBanks(field).readerLeaseCount).toBe(0)
    expect(inspectZombieEscapeSparseAttachmentHeapLeases(field).activeAgentLeases).toBe(0)

    const terminalAttachment = createZombieEscapeSparseAttachmentSearch()
    beginZombieEscapeSparseAttachmentSearch(
      terminalAttachment,
      field,
      field.graphSameLayerDistances,
      0,
      -3,
      0,
      false,
    )
    let terminalStatus = terminalAttachment.status
    for (let step = 0; step < 100 && terminalStatus === 'pending'; step += 1) {
      terminalStatus = stepZombieEscapeSparseAttachmentSearch(
        terminalAttachment,
        field,
        field.graphSameLayerDistances,
        targetBudget,
      )
    }
    expect(['found', 'unreachable']).toContain(terminalStatus)
    expect(inspectZombieEscapeSparseReverseFieldBanks(field).readerLeaseCount).toBe(0)
    expect(
      stepZombieEscapeSparseAttachmentSearch(
        terminalAttachment,
        field,
        field.graphSameLayerDistances,
        targetBudget,
      ),
    ).toBe(terminalStatus)
    expect(inspectZombieEscapeSparseReverseFieldBanks(field).readerLeaseCount).toBe(0)

    for (
      let step = 0;
      step < 100 &&
      getZombieEscapeSparseCommittedRouteGeneration(field) === secondBank.activeGeneration;
      step += 1
    ) {
      stepZombieEscapeSparseTargetUpdate(field, targetBudget)
    }
    const thirdBank = inspectZombieEscapeSparseReverseFieldBanks(field)
    expect(thirdBank.activeGeneration).toBe(secondBank.activeGeneration + 1)
    expect(thirdBank.readerLeaseCount).toBe(0)
    expect(thirdBank.leaseInvariantViolationCount).toBe(0)
    expect(thirdBank.allocatedBytes).toBe(firstBank.allocatedBytes)
  })

  test('hashes logical committed content independently of two-bank publication history', () => {
    const createWorld = () =>
      createZombieEscapeCollisionWorld({
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
          { endX: 0, endZ: 5, halfThickness: 0.1, id: 'vertical', startX: 0, startZ: -6 },
          { endX: 6, endZ: 2, halfThickness: 0.1, id: 'right', startX: 0, startZ: 2 },
          { endX: 0, endZ: -2, halfThickness: 0.1, id: 'left', startX: -6, startZ: -2 },
        ],
      })
    const buildHistory = (targets: ReadonlyArray<readonly [number, number]>) => {
      const field = createZombieEscapeFlowField(createWorld())
      for (const [x, z] of targets) updateZombieEscapeFlowTarget(field, x, z, 0)
      return field
    }
    const fresh = buildHistory([[7, 7]])
    const forward = buildHistory([
      [-4, 0],
      [4, 0],
      [7, 7],
    ])
    const reverse = buildHistory([
      [4, 0],
      [-4, 0],
      [7, 7],
    ])
    expect(getZombieEscapeSparseCommittedRouteContentHash(forward)).toBe(
      getZombieEscapeSparseCommittedRouteContentHash(fresh),
    )
    expect(getZombieEscapeSparseCommittedRouteContentHash(reverse)).toBe(
      getZombieEscapeSparseCommittedRouteContentHash(fresh),
    )
  })

  test('holds reachable spawn behind the requested target publication on disconnected supports', () => {
    const world = createZombieEscapeCollisionWorld({
      agentRadius: AGENT_RADIUS,
      boundaryPolicy: 'none',
      navigationSupports: [
        {
          boundary: true,
          elevation: 0,
          id: 'left',
          polygon: [
            { x: -7, z: -3 },
            { x: -2, z: -3 },
            { x: -2, z: 3 },
            { x: -7, z: 3 },
          ],
        },
        {
          boundary: true,
          elevation: 0,
          id: 'right',
          polygon: [
            { x: 2, z: -3 },
            { x: 7, z: -3 },
            { x: 7, z: 3 },
            { x: 2, z: 3 },
          ],
        },
      ],
      playRadius: 8,
    })
    const field = createZombieEscapeFlowField(world)
    updateZombieEscapeFlowTarget(field, -4, 0, 0)
    const oldGeneration = getZombieEscapeSparseCommittedRouteGeneration(field)
    beginZombieEscapeSparseTargetUpdate(field, 4, 0, 0)
    const search = createZombieEscapeSparseReachableSpawnSearch()
    const output = createZombieEscapeReachableSpawn()
    const outputBefore = { ...output }
    const budget = {
      maximumCandidateVisits: Number.POSITIVE_INFINITY,
      maximumCollisionPredicates: Number.POSITIVE_INFINITY,
      maximumHeapOperations: Number.POSITIVE_INFINITY,
      maximumHierarchyNodeVisits: Number.POSITIVE_INFINITY,
      maximumSupportPredicates: Number.POSITIVE_INFINITY,
    }
    beginZombieEscapeSparseReachableSpawnSearch(search, field, -4, 0, 4, 0, 1, 0)
    expect(stepZombieEscapeSparseReachableSpawnSearch(search, field, output, budget)).toBe(
      'pending',
    )
    expect(search.phase).toBe('wait-target')
    expect(output).toEqual(outputBefore)
    expect(getZombieEscapeSparseCommittedRouteGeneration(field)).toBe(oldGeneration)

    const targetBudget = {
      ...budget,
      maximumGraphEdgeVisits: Number.POSITIVE_INFINITY,
    }
    while (field.graphSparseTargetUpdate.status === 'pending') {
      stepZombieEscapeSparseTargetUpdate(field, targetBudget)
    }
    expect(getZombieEscapeSparseCommittedRouteGeneration(field)).toBe(oldGeneration + 1)
    for (let step = 0; step < 100 && search.status === 'pending'; step += 1) {
      stepZombieEscapeSparseReachableSpawnSearch(search, field, output, budget)
    }
    expect(search.status).toBe('found')
    expect(output.reachable).toBe(true)
    expect(output.x).toBeGreaterThan(2)
  })

  test('steers off-axis to a connector landing and owns forward traversal through the upper target', () => {
    const world = createZombieEscapeCollisionWorld({
      agentRadius: AGENT_RADIUS,
      boundaryPolicy: 'none',
      cellSize: 0.2,
      navigationConnectors: [
        {
          ascendingEnd: true,
          chainId: 'stairs',
          chainLowerY: 0,
          chainOrder: 0,
          chainUpperY: 2.5,
          endX: 0,
          endY: 2.5,
          endZ: 2,
          halfWidth: 1,
          id: 'stairs',
          startX: 0,
          startY: 0,
          startZ: -2,
        },
      ],
      navigationSupports: [
        {
          boundary: true,
          elevation: 0,
          id: 'lower',
          polygon: [
            { x: -8, z: -8 },
            { x: 8, z: -8 },
            { x: 8, z: 0 },
            { x: -8, z: 0 },
          ],
        },
        {
          boundary: true,
          elevation: 2.5,
          id: 'upper',
          polygon: [
            { x: -8, z: 0 },
            { x: 8, z: 0 },
            { x: 8, z: 8 },
            { x: -8, z: 8 },
          ],
        },
      ],
      playRadius: 10,
    })
    const field = createZombieEscapeFlowField(world)
    const sample = createFlowSample()
    const hit = createZombieEscapeCollisionHit()
    const move = createZombieEscapeNavigationMoveResult()
    let x = -6
    let y = 0
    let z = -5
    let connectorIndex = -1
    let connectorTargetEnd = false
    let sawConnector = false
    let sawUpper = false
    updateZombieEscapeFlowTarget(field, 0, 5, 2.5)
    resolveZombieEscapeFlowDirection(field, x, z, 0, 5, sample, hit, y)
    const attachmentSearchCount = field.graphAttachmentFullSearchCount

    for (let tick = 0; tick < 1_200 && Math.hypot(x, z - 5) >= 0.3; tick += 1) {
      resolveZombieEscapeFlowDirection(field, x, z, 0, 5, sample, hit, y)
      moveZombieEscapeNavigationAgent(
        world,
        x,
        y,
        z,
        sample.x * 0.1,
        sample.z * 0.1,
        AGENT_RADIUS,
        connectorIndex,
        connectorTargetEnd,
        hit,
        move,
        sample.connectorIndex,
        sample.connectorTargetEnd,
      )
      x = move.x
      y = move.y
      z = move.z
      connectorIndex = move.connectorIndex
      connectorTargetEnd = move.connectorTargetEnd
      sawConnector ||= connectorIndex >= 0
      sawUpper ||= y > 2.4
    }

    expect(sawConnector).toBe(true)
    expect(sawUpper).toBe(true)
    expect(y).toBeCloseTo(2.5, 8)
    expect(Math.hypot(x, z - 5)).toBeLessThan(0.3)
    expect(field.graphAttachmentFullSearchCount).toBe(attachmentSearchCount)
    expect(field.graphSparseTargetUpdate).toMatchObject({
      selectedFallbackAnchorCount: 1,
      selectedStrictAnchorCount: 1,
      totalTargetAnchorVisibilityTests: 0,
    })
    const lowerFullRouteNode = world.navigationGraph.layerIndices.findIndex(
      (layerIndex, node) =>
        layerIndex === 0 &&
        Number.isFinite(field.graphStrictDistances[node]!) &&
        !Number.isFinite(field.graphSameLayerDistances[node]!),
    )
    expect(lowerFullRouteNode).toBeGreaterThanOrEqual(0)
  })

  test('excludes a reachable-spawn target dependency for 1400 probes and resumes on its ready slice', () => {
    const field = createZombieEscapeFlowField(createResumableSparseFlowWorld())
    const search = createZombieEscapeSparseReachableSpawnSearch()
    const output = createZombieEscapeReachableSpawn()
    const budget = {
      maximumCandidateVisits: 1,
      maximumCollisionPredicates: 1,
      maximumHeapOperations: 1,
      maximumHierarchyNodeVisits: 1,
      maximumSupportPredicates: 1,
    }
    const targetBudget = {
      ...budget,
      maximumGraphEdgeVisits: 1,
      maximumHeapOperations: 1,
    }
    beginZombieEscapeSparseTargetUpdate(field, 3, 0, 0)
    beginZombieEscapeSparseReachableSpawnSearch(search, field, -3, 0, 3, 0, 1, 0)

    expect(stepZombieEscapeSparseReachableSpawnSearch(search, field, output, budget)).toBe(
      'pending',
    )
    expect(search.phase).toBe('wait-target')
    expect(zombieEscapeSparseReachableSpawnSearchCanProgress(search, field)).toBe(false)
    const waitingSearch = structuredClone(search)
    const waitingOutput = { ...output }
    for (let probe = 0; probe < 1_400; probe += 1) {
      expect(zombieEscapeSparseReachableSpawnSearchCanProgress(search, field)).toBe(false)
    }
    expect(search).toEqual(waitingSearch)
    expect(output).toEqual(waitingOutput)

    let targetSlices = 0
    while (field.graphSparseTargetUpdate.status === 'pending' && targetSlices < 30_000) {
      stepZombieEscapeSparseTargetUpdate(field, targetBudget)
      targetSlices += 1
    }
    expect(targetSlices).toBeGreaterThan(0)
    expect(targetSlices).toBeLessThan(30_000)
    expect(field.graphSparseTargetUpdate.status).toBe('ready')
    expect(zombieEscapeSparseReachableSpawnSearchCanProgress(search, field)).toBe(true)

    const status = stepZombieEscapeSparseReachableSpawnSearch(search, field, output, budget)
    const consumedWork =
      search.lastStepCandidateVisits +
      search.lastStepCollisionPredicates +
      search.lastStepHierarchyNodeVisits +
      search.lastStepSupportPredicates
    expect(consumedWork > 0 || status !== 'pending').toBe(true)
  })

  test('terminates a reachable-spawn wait when the target has no navigation layer', () => {
    const field = createZombieEscapeFlowField(createResumableSparseFlowWorld())
    const search = createZombieEscapeSparseReachableSpawnSearch()
    const output = createZombieEscapeReachableSpawn()
    const budget = {
      maximumCandidateVisits: 1,
      maximumCollisionPredicates: 1,
      maximumHeapOperations: 1,
      maximumHierarchyNodeVisits: 1,
      maximumSupportPredicates: 1,
    }
    beginZombieEscapeSparseTargetUpdate(field, 30, 30, 0)
    beginZombieEscapeSparseReachableSpawnSearch(search, field, -3, 0, 30, 30, 1, 0)
    expect(stepZombieEscapeSparseReachableSpawnSearch(search, field, output, budget)).toBe(
      'pending',
    )
    expect(search.phase).toBe('wait-target')
    expect(zombieEscapeSparseReachableSpawnSearchCanProgress(search, field)).toBe(false)

    const targetBudget = {
      ...budget,
      maximumGraphEdgeVisits: 1,
      maximumHeapOperations: 1,
    }
    let targetSlices = 0
    while (field.graphSparseTargetUpdate.status === 'pending' && targetSlices < 30_000) {
      stepZombieEscapeSparseTargetUpdate(field, targetBudget)
      targetSlices += 1
    }
    expect(field.graphSparseTargetUpdate.status).toBe('ready')
    expect(field.targetLayerIndex).toBe(-1)
    expect(zombieEscapeSparseReachableSpawnSearchCanProgress(search, field)).toBe(true)
    expect(stepZombieEscapeSparseReachableSpawnSearch(search, field, output, budget)).toBe(
      'unreachable',
    )
    expect(output).toEqual({ cell: -1, reachable: false, x: 0, z: 0 })
  })

  test('resumes exact reachable-spawn attachment and nearest fallback with stale invalidation', () => {
    const world = createResumableSparseFlowWorld()
    const expectedField = createZombieEscapeFlowField(world)
    const expected = createZombieEscapeReachableSpawn()
    expect(resolveZombieEscapeReachableSpawn(expectedField, -3, 0, 3, 0, 1, expected)).toBe(true)

    const field = createZombieEscapeFlowField(world)
    const output = createZombieEscapeReachableSpawn()
    const search = createZombieEscapeSparseReachableSpawnSearch()
    beginZombieEscapeSparseTargetUpdate(field, 3, 0, 0)
    expect(beginZombieEscapeSparseReachableSpawnSearch(search, field, -3, 0, 3, 0, 1, 0)).toBe(
      'pending',
    )
    const budget = {
      maximumCandidateVisits: 1,
      maximumCollisionPredicates: 1,
      maximumHeapOperations: 1,
      maximumHierarchyNodeVisits: 1,
      maximumSupportPredicates: 1,
    }
    const targetBudget = {
      ...budget,
      maximumGraphEdgeVisits: 1,
      maximumHeapOperations: 1,
    }
    let steps = 0
    let attachmentHierarchyNodeVisits = 0
    while (search.status === 'pending' && steps < 30_000) {
      stepZombieEscapeSparseReachableSpawnSearch(search, field, output, budget)
      if (search.status === 'pending') stepZombieEscapeSparseTargetUpdate(field, targetBudget)
      expect(search.lastStepCandidateVisits).toBeLessThanOrEqual(1)
      expect(search.lastStepAttachmentHierarchyNodeVisits).toBeLessThanOrEqual(1)
      expect(search.lastStepCollisionPredicates).toBeLessThanOrEqual(1)
      expect(search.lastStepHeapOperations).toBeLessThanOrEqual(1)
      expect(search.lastStepHierarchyNodeVisits).toBeLessThanOrEqual(1)
      expect(search.lastStepSupportPredicates).toBeLessThanOrEqual(1)
      attachmentHierarchyNodeVisits += search.lastStepAttachmentHierarchyNodeVisits
      steps += 1
    }
    expect(search.status).toBe('found')
    expect(search.totalAttachmentHierarchyNodeVisits).toBe(attachmentHierarchyNodeVisits)
    expect(search.totalAttachmentHierarchyNodeVisits).toBeLessThanOrEqual(
      search.totalHierarchyNodeVisits,
    )
    expect(output).toEqual(expected)
    expect(structuredClone(search)).toEqual(search)

    const staleSearch = createZombieEscapeSparseReachableSpawnSearch()
    const staleOutput = createZombieEscapeReachableSpawn()
    beginZombieEscapeSparseReachableSpawnSearch(staleSearch, field, -3, 0, 3, 0, 1, 0)
    stepZombieEscapeSparseReachableSpawnSearch(staleSearch, field, staleOutput, {
      maximumCandidateVisits: 0,
      maximumCollisionPredicates: 0,
      maximumHeapOperations: 0,
      maximumHierarchyNodeVisits: 0,
      maximumSupportPredicates: 0,
    })
    const beforeInvalidation = { ...staleOutput }
    const openWorld = createZombieEscapeCollisionWorldWithoutObjects(
      world,
      new Set(['breakable-divider']),
    )
    setZombieEscapeFlowFieldWorld(field, openWorld)
    expect(zombieEscapeSparseReachableSpawnSearchCanProgress(staleSearch, field)).toBe(true)
    expect(
      stepZombieEscapeSparseReachableSpawnSearch(staleSearch, field, staleOutput, budget),
    ).toBe('invalidated')
    expect(staleOutput).toEqual(beforeInvalidation)
  })

  test('matches the exhaustive nearest reachable node outside the spawn exclusion annulus', () => {
    const world = createResumableSparseFlowWorld()
    const field = createZombieEscapeFlowField(world)
    const output = createZombieEscapeReachableSpawn()
    expect(resolveZombieEscapeReachableSpawn(field, 3, 0, 3, 0, 2, output)).toBe(true)

    let oracleDistanceSquared = Number.POSITIVE_INFINITY
    let oracleNode = -1
    for (let node = 0; node < world.navigationGraph.nodeIds.length; node += 1) {
      if (!Number.isFinite(field.graphSameLayerDistances[node]!)) continue
      const targetDistanceSquared =
        (world.navigationGraph.x[node]! - 3) ** 2 + world.navigationGraph.z[node]! ** 2
      if (targetDistanceSquared + 1e-9 < 4) continue
      const distanceSquared = targetDistanceSquared
      if (
        distanceSquared < oracleDistanceSquared - 1e-9 ||
        (Math.abs(distanceSquared - oracleDistanceSquared) <= 1e-9 &&
          (oracleNode < 0 || node < oracleNode))
      ) {
        oracleDistanceSquared = distanceSquared
        oracleNode = node
      }
    }
    expect(output).toEqual({
      cell: oracleNode,
      reachable: true,
      x: world.navigationGraph.x[oracleNode],
      z: world.navigationGraph.z[oracleNode],
    })
  })

  test('advances a cached route to its live terminal target without search work', () => {
    const world = createResumableSparseFlowWorld()
    const field = createZombieEscapeFlowField(world)
    const output = createFlowSample()
    updateZombieEscapeFlowTarget(field, 3, 0, 0)
    resolveZombieEscapeFlowDirection(field, -3, 0, 3, 0, output, undefined, 0)
    expect(output).toMatchObject({ reachable: true, waypointUsesFallback: true })
    expect(updateZombieEscapeFlowTarget(field, 3.2, 0.4, 0)).toBe(false)

    const nextNodes = field.graphSameLayerFallbackNextNodes
    const distances = field.graphSameLayerFallbackDistances
    let route: number[] = []
    for (let startNode = 0; startNode < nextNodes.length; startNode += 1) {
      if (!Number.isFinite(distances[startNode]!)) continue
      const candidate: number[] = []
      const visited = new Set<number>()
      let node = startNode
      while (node >= 0 && !visited.has(node)) {
        visited.add(node)
        candidate.push(node)
        node = nextNodes[node] ?? -1
      }
      if (candidate.length > route.length) route = candidate
    }
    expect(route.length).toBeGreaterThanOrEqual(3)
    expect(nextNodes[route.at(-1)!]).toBe(-1)

    output.waypointNode = route[0]
    output.waypointUsesFallback = true
    output.x = 1
    output.z = 0
    const search = createZombieEscapeSparseFlowSearch()
    search.lastStepCandidateVisits = 101
    search.totalCandidateVisits = 103
    search.attachment.lastStepHierarchyNodeVisits = 107
    search.attachment.totalHierarchyNodeVisits = 109
    const searchBeforeTraversal = structuredClone(search)
    const attachmentSearchCount = field.graphAttachmentFullSearchCount
    const zeroBudget = {
      maximumCandidateVisits: 0,
      maximumCollisionPredicates: 0,
      maximumHeapOperations: 0,
      maximumHierarchyNodeVisits: 0,
      maximumSupportPredicates: 0,
    }

    for (let routeIndex = 0; routeIndex < route.length; routeIndex += 1) {
      const waypointNode = route[routeIndex]!
      const waypointX = world.navigationGraph.x[waypointNode]!
      const waypointZ = world.navigationGraph.z[waypointNode]!
      const successorNode = nextNodes[waypointNode]!
      expect(
        followZombieEscapeCachedSparseWaypoint(
          field,
          waypointX,
          waypointZ,
          0,
          output,
          search,
          zeroBudget,
        ),
      ).toBe('followed')
      expect(search).toEqual(searchBeforeTraversal)
      expect(field.graphAttachmentFullSearchCount).toBe(attachmentSearchCount)

      if (successorNode >= 0) {
        const successorX = world.navigationGraph.x[successorNode]!
        const successorZ = world.navigationGraph.z[successorNode]!
        const successorDistance = Math.hypot(successorX - waypointX, successorZ - waypointZ)
        expect(output).toMatchObject({
          connectorIndex: -1,
          reachable: true,
          waypointNode: successorNode,
          waypointUsesFallback: true,
        })
        expect(output.x).toBeCloseTo((successorX - waypointX) / successorDistance, 12)
        expect(output.z).toBeCloseTo((successorZ - waypointZ) / successorDistance, 12)
        continue
      }

      const targetDistance = Math.hypot(field.targetX - waypointX, field.targetZ - waypointZ)
      expect(output).toMatchObject({
        connectorIndex: -1,
        reachable: true,
        waypointNode,
        waypointUsesFallback: true,
      })
      expect(output.x).toBeCloseTo((field.targetX - waypointX) / targetDistance, 12)
      expect(output.z).toBeCloseTo((field.targetZ - waypointZ) / targetDistance, 12)
    }
  })

  test('adopts a published route from its retained terminal anchor without attachment work', () => {
    const world = createResumableSparseFlowWorld()
    const field = createZombieEscapeFlowField(world)
    const output = createFlowSample()
    const search = createZombieEscapeSparseFlowSearch()
    const zeroBudget = {
      maximumCandidateVisits: 0,
      maximumCollisionPredicates: 0,
      maximumHeapOperations: 0,
      maximumHierarchyNodeVisits: 0,
      maximumSupportPredicates: 0,
    }
    updateZombieEscapeFlowTarget(field, 3, 0, 0)
    resolveZombieEscapeFlowDirection(field, -3, 0, 3, 0, output, undefined, 0)
    expect(output).toMatchObject({ reachable: true, waypointUsesFallback: true })

    const nextNodes = field.graphSameLayerFallbackNextNodes
    let terminalNode = output.waypointNode ?? -1
    for (let step = 0; step < world.navigationGraph.nodeIds.length; step += 1) {
      const nextNode = nextNodes[terminalNode] ?? -1
      if (nextNode < 0) break
      terminalNode = nextNode
    }
    const terminalX = world.navigationGraph.x[terminalNode]!
    const terminalZ = world.navigationGraph.z[terminalNode]!
    output.waypointNode = terminalNode
    output.waypointUsesFallback = true
    output.x = 1
    output.z = 0
    expect(
      followZombieEscapeCachedSparseWaypoint(
        field,
        terminalX,
        terminalZ,
        0,
        output,
        search,
        zeroBudget,
      ),
    ).toBe('followed')
    expect(output).toMatchObject({
      waypointNode: terminalNode,
      waypointUsesFallback: true,
    })

    const generationBefore = getZombieEscapeSparseCommittedRouteGeneration(field)
    const attachmentSearchCount = field.graphAttachmentFullSearchCount
    const searchBefore = structuredClone(search)
    expect(updateZombieEscapeFlowTarget(field, -3, 0, 0)).toBe(true)
    expect(getZombieEscapeSparseCommittedRouteGeneration(field)).toBeGreaterThan(generationBefore)
    expect(Number.isFinite(field.graphSameLayerDistances[terminalNode]!)).toBe(false)
    expect(Number.isFinite(field.graphSameLayerFallbackDistances[terminalNode]!)).toBe(true)

    output.waypointUsesFallback = false
    expect(
      followZombieEscapeCachedSparseWaypoint(
        field,
        terminalX,
        terminalZ,
        0,
        output,
        search,
        zeroBudget,
      ),
    ).toBe('followed')
    expect(output).toMatchObject({
      reachable: true,
      waypointUsesFallback: true,
    })
    const publishedNextNode = field.graphSameLayerFallbackNextNodes[terminalNode]!
    expect(output.waypointNode).toBe(publishedNextNode >= 0 ? publishedNextNode : terminalNode)
    expect(search).toEqual(searchBefore)
    expect(field.graphAttachmentFullSearchCount).toBe(attachmentSearchCount)
  })

  test('upgrades an old fallback anchor to the strict committed variant in constant work', () => {
    const world = createResumableSparseFlowWorld()
    const field = createZombieEscapeFlowField(world)
    const output = createFlowSample()
    const search = createZombieEscapeSparseFlowSearch()
    const zeroBudget = {
      maximumCandidateVisits: 0,
      maximumCollisionPredicates: 0,
      maximumHeapOperations: 0,
      maximumHierarchyNodeVisits: 0,
      maximumSupportPredicates: 0,
    }
    updateZombieEscapeFlowTarget(field, -3, 0, 0)
    const sharedNode = field.graphSameLayerDistances.findIndex(
      (distance, node) =>
        Number.isFinite(distance) && Number.isFinite(field.graphSameLayerFallbackDistances[node]!),
    )
    expect(sharedNode).toBeGreaterThanOrEqual(0)
    output.reachable = true
    output.waypointNode = sharedNode
    output.waypointUsesFallback = true
    output.x = 1
    output.z = 0
    const searchBefore = structuredClone(search)
    const attachmentSearchCount = field.graphAttachmentFullSearchCount

    expect(
      followZombieEscapeCachedSparseWaypoint(
        field,
        world.navigationGraph.x[sharedNode]!,
        world.navigationGraph.z[sharedNode]!,
        0,
        output,
        search,
        zeroBudget,
      ),
    ).toBe('followed')
    expect(output.waypointUsesFallback).toBe(false)
    expect(search).toEqual(searchBefore)
    expect(field.graphAttachmentFullSearchCount).toBe(attachmentSearchCount)
  })

  test('keeps a terminal anchor on the committed target while a newer route is pending', () => {
    const world = createResumableSparseFlowWorld()
    const field = createZombieEscapeFlowField(world)
    const output = createFlowSample()
    updateZombieEscapeFlowTarget(field, 3, 0, 0)
    resolveZombieEscapeFlowDirection(field, -3, 0, 3, 0, output, undefined, 0)

    const nextNodes = field.graphSameLayerFallbackNextNodes
    let terminalNode = output.waypointNode ?? -1
    for (let step = 0; step < world.navigationGraph.nodeIds.length; step += 1) {
      const nextNode = nextNodes[terminalNode] ?? -1
      if (nextNode < 0) break
      terminalNode = nextNode
    }
    const terminalX = world.navigationGraph.x[terminalNode]!
    const terminalZ = world.navigationGraph.z[terminalNode]!
    output.waypointNode = terminalNode
    output.waypointUsesFallback = true
    output.x = 1
    output.z = 0
    const generationBeforeValidatedMove = getZombieEscapeSparseCommittedRouteGeneration(field)
    expect(updateZombieEscapeFlowTarget(field, 3.2, 0.4, 0)).toBe(false)
    expect(getZombieEscapeSparseCommittedRouteGeneration(field)).toBe(generationBeforeValidatedMove)
    const committedTargetX = field.graphSparseTargetUpdate.routeTargetX
    const committedTargetZ = field.graphSparseTargetUpdate.routeTargetZ
    expect([committedTargetX, committedTargetZ]).toEqual([3.2, 0.4])

    expect(beginZombieEscapeSparseTargetUpdate(field, -3, 0, 0)).toBe('pending')
    expect(field.graphSparseTargetUpdate.status).toBe('pending')
    expect(followZombieEscapeCachedSparseWaypoint(field, terminalX, terminalZ, 0, output)).toBe(
      true,
    )
    const committedDistance = Math.hypot(committedTargetX - terminalX, committedTargetZ - terminalZ)
    expect(output.waypointNode).toBe(terminalNode)
    expect(output.x).toBeCloseTo((committedTargetX - terminalX) / committedDistance, 12)
    expect(output.z).toBeCloseTo((committedTargetZ - terminalZ) / committedDistance, 12)
    expect(output.x).toBeGreaterThan(0)

    field.graphSparseTargetUpdate.status = 'invalidated'
    field.graphSparseTargetUpdate.routeTargetX = 30
    field.graphSparseTargetUpdate.routeTargetZ = 40
    expect(followZombieEscapeCachedSparseWaypoint(field, terminalX, terminalZ, 0, output)).toBe(
      true,
    )
    const bankTargetDistance = Math.hypot(3 - terminalX, -terminalZ)
    expect(output.x).toBeCloseTo((3 - terminalX) / bankTargetDistance, 12)
    expect(output.z).toBeCloseTo(-terminalZ / bankTargetDistance, 12)
  })

  test('keeps the published target validated while the coalesced successor is pending', () => {
    const world = createResumableSparseFlowWorld()
    const field = createZombieEscapeFlowField(world)
    const output = createFlowSample()
    const zeroBudget = {
      maximumCandidateVisits: 0,
      maximumCollisionPredicates: 0,
      maximumHeapOperations: 0,
      maximumHierarchyNodeVisits: 0,
      maximumSupportPredicates: 0,
    }
    const unboundedTargetBudget = {
      maximumCandidateVisits: Number.POSITIVE_INFINITY,
      maximumCollisionPredicates: Number.POSITIVE_INFINITY,
      maximumGraphEdgeVisits: Number.POSITIVE_INFINITY,
      maximumHeapOperations: Number.POSITIVE_INFINITY,
      maximumHierarchyNodeVisits: Number.POSITIVE_INFINITY,
      maximumSupportPredicates: Number.POSITIVE_INFINITY,
    }
    updateZombieEscapeFlowTarget(field, 3, 0, 0)
    resolveZombieEscapeFlowDirection(field, -3, 0, 3, 0, output, undefined, 0)
    let terminalNode = output.waypointNode ?? -1
    for (let step = 0; step < world.navigationGraph.nodeIds.length; step += 1) {
      const nextNode = field.graphSameLayerFallbackNextNodes[terminalNode] ?? -1
      if (nextNode < 0) break
      terminalNode = nextNode
    }
    let terminalX = world.navigationGraph.x[terminalNode]!
    let terminalZ = world.navigationGraph.z[terminalNode]!
    output.waypointNode = terminalNode
    output.waypointUsesFallback = true
    output.x = 1
    output.z = 0
    const generationBefore = getZombieEscapeSparseCommittedRouteGeneration(field)

    expect(beginZombieEscapeSparseTargetUpdate(field, -3, 0, 0)).toBe('pending')
    expect(beginZombieEscapeSparseTargetUpdate(field, 3, 4, 0)).toBe('pending')
    expect(stepZombieEscapeSparseTargetUpdate(field, unboundedTargetBudget)).toBe('pending')
    expect(getZombieEscapeSparseCommittedRouteGeneration(field)).toBeGreaterThan(generationBefore)
    expect(field.graphSparseTargetUpdate).toMatchObject({
      requestedTargetX: 3,
      requestedTargetZ: 4,
      routeTargetX: -3,
      routeTargetZ: 0,
      status: 'pending',
    })
    for (let step = 0; step < world.navigationGraph.nodeIds.length; step += 1) {
      const nextNode = field.graphSameLayerFallbackNextNodes[terminalNode] ?? -1
      if (nextNode < 0) break
      terminalNode = nextNode
    }
    terminalX = world.navigationGraph.x[terminalNode]!
    terminalZ = world.navigationGraph.z[terminalNode]!
    expect(field.graphSameLayerFallbackNextNodes[terminalNode]).toBe(-1)

    const overlappingSearch = createZombieEscapeSparseFlowSearch()
    const overlappingOutput = createFlowSample()
    beginZombieEscapeSparseFlowSearch(overlappingSearch, field, terminalX - 1, terminalZ, 3, 4, 0)
    stepZombieEscapeSparseFlowSearch(overlappingSearch, field, overlappingOutput, {
      maximumCandidateVisits: Number.POSITIVE_INFINITY,
      maximumCollisionPredicates: Number.POSITIVE_INFINITY,
      maximumHeapOperations: Number.POSITIVE_INFINITY,
      maximumHierarchyNodeVisits: Number.POSITIVE_INFINITY,
      maximumSupportPredicates: Number.POSITIVE_INFINITY,
    })
    expect(overlappingSearch.targetX).toBe(-3)
    expect(overlappingSearch.targetZ).toBe(0)
    expect(getZombieEscapeSparseFlowSearchRouteGeneration(overlappingSearch)).toBe(
      getZombieEscapeSparseCommittedRouteGeneration(field),
    )

    output.waypointNode = terminalNode
    output.waypointUsesFallback = true
    expect(
      followZombieEscapeCachedSparseWaypoint(
        field,
        terminalX,
        terminalZ,
        0,
        output,
        createZombieEscapeSparseFlowSearch(),
        zeroBudget,
      ),
    ).toBe('followed')
    const publishedDistance = Math.hypot(-3 - terminalX, -terminalZ)
    expect(output.waypointNode).toBe(terminalNode)
    expect(output.x).toBeCloseTo((-3 - terminalX) / publishedDistance, 12)
    expect(output.z).toBeCloseTo(-terminalZ / publishedDistance, 12)
  })

  test('holds a structurally valid anchor through an unreachable publication and resumes it without search work', () => {
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
          endCap: 'flat',
          endX: 0,
          endZ: 6,
          halfThickness: 0.1,
          id: 'solid-divider',
          startCap: 'flat',
          startX: 0,
          startZ: -6,
        },
      ],
    })
    const field = createZombieEscapeFlowField(world)
    const output = createFlowSample()
    const search = createZombieEscapeSparseFlowSearch()
    const zeroBudget = {
      maximumCandidateVisits: 0,
      maximumCollisionPredicates: 0,
      maximumHeapOperations: 0,
      maximumHierarchyNodeVisits: 0,
      maximumSupportPredicates: 0,
    }
    updateZombieEscapeFlowTarget(field, -3, 0, 0)
    const anchorNode = field.graphSameLayerDistances.findIndex(Number.isFinite)
    expect(anchorNode).toBeGreaterThanOrEqual(0)
    const anchorX = world.navigationGraph.x[anchorNode]!
    const anchorZ = world.navigationGraph.z[anchorNode]!
    output.blockingDistance = 3
    output.blockingX = 2
    output.blockingZ = 1
    output.connectorIndex = 7
    output.connectorTargetEnd = true
    output.reachable = true
    output.waypointNode = anchorNode
    output.waypointUsesFallback = true
    output.x = 1
    output.z = 0
    const searchBefore = structuredClone(search)
    const attachmentSearchCount = field.graphAttachmentFullSearchCount

    expect(updateZombieEscapeFlowTarget(field, 0, 0, 0)).toBe(true)
    expect(field.graphSameLayerDistances[anchorNode]).toBe(Number.POSITIVE_INFINITY)
    expect(field.graphSameLayerFallbackDistances[anchorNode]).toBe(Number.POSITIVE_INFINITY)
    expect(
      followZombieEscapeCachedSparseWaypoint(
        field,
        anchorX + 0.5,
        anchorZ,
        0,
        output,
        search,
        zeroBudget,
      ),
    ).toBe('held')
    expect(output).toMatchObject({
      blockingDistance: Number.POSITIVE_INFINITY,
      blockingX: anchorX + 0.5,
      blockingZ: anchorZ,
      connectorIndex: -1,
      connectorTargetEnd: false,
      reachable: false,
      waypointNode: anchorNode,
      waypointUsesFallback: true,
      x: 0,
      z: 0,
    })
    expect(search).toEqual(searchBefore)
    expect(field.graphAttachmentFullSearchCount).toBe(attachmentSearchCount)

    expect(updateZombieEscapeFlowTarget(field, -3, 0, 0)).toBe(true)
    expect(
      followZombieEscapeCachedSparseWaypoint(
        field,
        anchorX + 0.5,
        anchorZ,
        0,
        output,
        search,
        zeroBudget,
      ),
    ).toBe('followed')
    expect(output).toMatchObject({
      reachable: true,
      waypointNode: anchorNode,
      waypointUsesFallback: false,
    })
    expect(search).toEqual(searchBefore)
    expect(field.graphAttachmentFullSearchCount).toBe(attachmentSearchCount)
  })

  test('reacquires a retained waypoint radially before advancing a published route', () => {
    const world = createResumableSparseFlowWorld()
    const field = createZombieEscapeFlowField(world)
    const output = createFlowSample()
    const search = createZombieEscapeSparseFlowSearch()
    const zeroBudget = {
      maximumCandidateVisits: 0,
      maximumCollisionPredicates: 0,
      maximumHeapOperations: 0,
      maximumHierarchyNodeVisits: 0,
      maximumSupportPredicates: 0,
    }
    updateZombieEscapeFlowTarget(field, -3, 0, 0)
    const waypointNode = field.graphSameLayerFallbackNextNodes.findIndex(
      (nextNode, node) =>
        nextNode >= 0 && Number.isFinite(field.graphSameLayerFallbackDistances[node]!),
    )
    const nextNode = field.graphSameLayerFallbackNextNodes[waypointNode]!
    expect(waypointNode).toBeGreaterThanOrEqual(0)
    expect(nextNode).toBeGreaterThanOrEqual(0)
    const waypointX = world.navigationGraph.x[waypointNode]!
    const waypointZ = world.navigationGraph.z[waypointNode]!
    output.reachable = true
    output.waypointNode = waypointNode
    output.waypointUsesFallback = true
    output.x = 1
    output.z = 0

    expect(
      followZombieEscapeCachedSparseWaypoint(
        field,
        waypointX + 0.5,
        waypointZ,
        0,
        output,
        search,
        zeroBudget,
        true,
      ),
    ).toBe('reacquiring')
    expect(output).toMatchObject({
      reachable: true,
      waypointNode,
      waypointUsesFallback: true,
      x: -1,
      z: 0,
    })

    expect(
      followZombieEscapeCachedSparseWaypoint(
        field,
        waypointX,
        waypointZ,
        0,
        output,
        search,
        zeroBudget,
        true,
      ),
    ).toBe('followed')
    expect(output.waypointNode).toBe(nextNode)
  })

  test('rejects malformed cached successors instead of treating them as route-unreachable holds', () => {
    const world = createResumableSparseFlowWorld()
    const field = createZombieEscapeFlowField(world)
    const output = createFlowSample()
    const search = createZombieEscapeSparseFlowSearch()
    const zeroBudget = {
      maximumCandidateVisits: 0,
      maximumCollisionPredicates: 0,
      maximumHeapOperations: 0,
      maximumHierarchyNodeVisits: 0,
      maximumSupportPredicates: 0,
    }
    updateZombieEscapeFlowTarget(field, -3, 0, 0)
    const waypointNode = field.graphSameLayerFallbackNextNodes.findIndex(
      (nextNode, node) =>
        nextNode >= 0 && Number.isFinite(field.graphSameLayerFallbackDistances[node]!),
    )
    const nextNode = field.graphSameLayerFallbackNextNodes[waypointNode]!
    expect(waypointNode).toBeGreaterThanOrEqual(0)
    expect(nextNode).toBeGreaterThanOrEqual(0)
    output.reachable = true
    output.waypointNode = waypointNode
    output.waypointUsesFallback = true
    output.x = 1
    output.z = 0
    const waypointX = world.navigationGraph.x[waypointNode]!
    const waypointZ = world.navigationGraph.z[waypointNode]!
    const originalNextNode = nextNode
    const originalNextDistance = field.graphSameLayerFallbackDistances[nextNode]!

    field.graphSameLayerFallbackNextNodes[waypointNode] = world.navigationGraph.nodeIds.length
    expect(
      followZombieEscapeCachedSparseWaypoint(
        field,
        waypointX,
        waypointZ,
        0,
        output,
        search,
        zeroBudget,
      ),
    ).toBe('refresh')
    field.graphSameLayerFallbackNextNodes[waypointNode] = originalNextNode
    field.graphSameLayerFallbackDistances[nextNode] =
      field.graphSameLayerFallbackDistances[waypointNode]!
    expect(
      followZombieEscapeCachedSparseWaypoint(
        field,
        waypointX,
        waypointZ,
        0,
        output,
        search,
        zeroBudget,
      ),
    ).toBe('refresh')
    field.graphSameLayerFallbackDistances[nextNode] = originalNextDistance
  })

  test('requests recovery for missing, invalid, and layer-displaced cached anchors', () => {
    const world = createResumableSparseFlowWorld()
    const field = createZombieEscapeFlowField(world)
    const readyOutput = createFlowSample()
    updateZombieEscapeFlowTarget(field, 3, 0, 0)
    resolveZombieEscapeFlowDirection(field, -3, 0, 3, 0, readyOutput, undefined, 0)
    const waypointNode = readyOutput.waypointNode ?? -1
    expect(waypointNode).toBeGreaterThanOrEqual(0)
    const waypointX = world.navigationGraph.x[waypointNode]!
    const waypointZ = world.navigationGraph.z[waypointNode]!
    const zeroBudget = {
      maximumCandidateVisits: 0,
      maximumCollisionPredicates: 0,
      maximumHeapOperations: 0,
      maximumHierarchyNodeVisits: 0,
      maximumSupportPredicates: 0,
    }

    for (const invalidWaypointNode of [
      -1,
      0.5,
      Number.NaN,
      world.navigationGraph.nodeIds.length + 1,
    ]) {
      const output = structuredClone(readyOutput)
      output.waypointNode = invalidWaypointNode
      const search = createZombieEscapeSparseFlowSearch()
      const searchBefore = structuredClone(search)
      const outputBefore = structuredClone(output)
      expect(
        followZombieEscapeCachedSparseWaypoint(
          field,
          waypointX,
          waypointZ,
          0,
          output,
          search,
          zeroBudget,
        ),
      ).toBe('refresh')
      expect(search).toEqual(searchBefore)
      expect(output).toEqual(outputBefore)
    }

    const displacedOutput = structuredClone(readyOutput)
    const displacedSearch = createZombieEscapeSparseFlowSearch()
    const displacedSearchBefore = structuredClone(displacedSearch)
    expect(
      followZombieEscapeCachedSparseWaypoint(
        field,
        waypointX,
        waypointZ,
        3,
        displacedOutput,
        displacedSearch,
        {
          maximumCandidateVisits: 1,
          maximumCollisionPredicates: 0,
          maximumHeapOperations: 0,
          maximumHierarchyNodeVisits: 0,
          maximumSupportPredicates: 0,
        },
      ),
    ).toBe('refresh')
    expect(displacedSearch).toEqual(displacedSearchBefore)
  })

  test('shares exact cached direction writes without spending zero-budget search work', () => {
    const world = createResumableSparseFlowWorld()
    const createReadyState = () => {
      const field = createZombieEscapeFlowField(world)
      const output = createFlowSample()
      updateZombieEscapeFlowTarget(field, 3, 0, 0)
      resolveZombieEscapeFlowDirection(field, -3, 0, 3, 0, output, undefined, 0)
      return { field, output }
    }
    const probed = createReadyState()
    const control = createReadyState()
    expect(probed.output).toEqual(control.output)
    const waypointNode = probed.output.waypointNode ?? -1
    expect(waypointNode).toBeGreaterThanOrEqual(0)
    const waypointX = world.navigationGraph.x[waypointNode]!
    const waypointZ = world.navigationGraph.z[waypointNode]!
    const originalDirectionX = probed.output.x
    const originalDirectionZ = probed.output.z
    const probeX = waypointX - originalDirectionX - originalDirectionZ * 0.35
    const probeZ = waypointZ - originalDirectionZ + originalDirectionX * 0.35
    const probedSearch = createZombieEscapeSparseFlowSearch()
    const controlSearch = createZombieEscapeSparseFlowSearch()
    const zeroBudget = {
      maximumCandidateVisits: -1,
      maximumCollisionPredicates: Number.NaN,
      maximumGraphEdgeVisits: 0.75,
      maximumHeapOperations: Number.NEGATIVE_INFINITY,
      maximumHierarchyNodeVisits: 0,
      maximumSupportPredicates: 0.25,
    }
    const oneUnitBudget = {
      maximumCandidateVisits: 1,
      maximumCollisionPredicates: 1,
      maximumHeapOperations: 1,
      maximumHierarchyNodeVisits: 1,
      maximumSupportPredicates: 1,
    }
    const probedInactiveSearch = structuredClone(probedSearch)
    const controlInactiveSearch = structuredClone(controlSearch)
    expect(
      followZombieEscapeCachedSparseWaypoint(
        probed.field,
        probeX,
        probeZ,
        0,
        probed.output,
        probedSearch,
        zeroBudget,
      ),
    ).toBe('followed')
    expect(
      followZombieEscapeCachedSparseWaypoint(
        control.field,
        probeX,
        probeZ,
        0,
        control.output,
        controlSearch,
        oneUnitBudget,
      ),
    ).toBe('followed')
    expect(probedSearch).toEqual(probedInactiveSearch)
    expect(controlSearch).toEqual(controlInactiveSearch)
    expect(probedSearch).toEqual(controlSearch)
    expect(probed.output).toEqual(control.output)
    expect(probed.output.x).not.toBeCloseTo(originalDirectionX, 8)
    expect(probed.output.z).not.toBeCloseTo(originalDirectionZ, 8)

    const firstDirectionX = probed.output.x
    const firstDirectionZ = probed.output.z
    const movedX = waypointX - firstDirectionX * 1.4 - firstDirectionZ * 0.2
    const movedZ = waypointZ - firstDirectionZ * 1.4 + firstDirectionX * 0.2
    const probedSearchBeforeMove = structuredClone(probedSearch)
    const controlSearchBeforeMove = structuredClone(controlSearch)
    expect(
      followZombieEscapeCachedSparseWaypoint(
        probed.field,
        movedX,
        movedZ,
        0,
        probed.output,
        probedSearch,
        zeroBudget,
      ),
    ).toBe('followed')
    expect(
      followZombieEscapeCachedSparseWaypoint(
        control.field,
        movedX,
        movedZ,
        0,
        control.output,
        controlSearch,
        oneUnitBudget,
      ),
    ).toBe('followed')
    expect(probedSearch).toEqual(probedSearchBeforeMove)
    expect(controlSearch).toEqual(controlSearchBeforeMove)
    expect(probed.output).toEqual(control.output)
    expect(probed.output.x).not.toBeCloseTo(firstDirectionX, 8)
    expect(probed.output.z).not.toBeCloseTo(firstDirectionZ, 8)
    const movedDistance = Math.hypot(waypointX - movedX, waypointZ - movedZ)
    expect(probed.output.x).toBeCloseTo((waypointX - movedX) / movedDistance, 12)
    expect(probed.output.z).toBeCloseTo((waypointZ - movedZ) / movedDistance, 12)

    beginZombieEscapeSparseFlowSearch(
      probedSearch,
      probed.field,
      movedX,
      movedZ,
      probed.field.targetX,
      probed.field.targetZ,
      0,
      waypointNode,
      probed.output.waypointUsesFallback === true,
    )
    beginZombieEscapeSparseFlowSearch(
      controlSearch,
      control.field,
      movedX,
      movedZ,
      control.field.targetX,
      control.field.targetZ,
      0,
      waypointNode,
      control.output.waypointUsesFallback === true,
    )
    for (const search of [probedSearch, controlSearch]) {
      search.lastStepCandidateVisits = 101
      search.lastStepAttachmentHierarchyNodeVisits = 102
      search.lastStepCollisionPredicates = 103
      search.lastStepHeapOperations = 105
      search.lastStepHierarchyNodeVisits = 107
      search.lastStepSupportPredicates = 109
      search.lastStepTargetBuilds = 113
      search.attachment.lastStepCandidateVisits = 127
      search.attachment.lastStepAttachmentHierarchyNodeVisits = 128
      search.attachment.lastStepHeapOperations = 129
      search.attachment.visibility.lastStepCollisionPredicates = 131
    }
    const searchBeforeProbe = structuredClone(probedSearch)
    const outputBeforeProbe = structuredClone(probed.output)
    expect(
      followZombieEscapeCachedSparseWaypoint(
        probed.field,
        movedX,
        movedZ,
        0,
        probed.output,
        probedSearch,
        zeroBudget,
      ),
    ).toBe('pending')
    expect(probedSearch).toEqual(searchBeforeProbe)
    expect(probed.output).toEqual(outputBeforeProbe)
    expect(probedSearch).toEqual(controlSearch)
    expect(probed.output).toEqual(control.output)

    let probedStatus = 'pending'
    let controlStatus = 'pending'
    let steps = 0
    while (probedStatus === 'pending' && controlStatus === 'pending' && steps < 10_000) {
      probedStatus = followZombieEscapeCachedSparseWaypoint(
        probed.field,
        movedX,
        movedZ,
        0,
        probed.output,
        probedSearch,
        oneUnitBudget,
      )
      controlStatus = followZombieEscapeCachedSparseWaypoint(
        control.field,
        movedX,
        movedZ,
        0,
        control.output,
        controlSearch,
        oneUnitBudget,
      )
      expect(probedStatus).toBe(controlStatus)
      expect(probedSearch).toEqual(controlSearch)
      expect(probed.output).toEqual(control.output)
      steps += 1
    }
    expect(probedStatus).toBe('followed')
    expect(controlStatus).toBe('followed')
    expect(steps).toBeGreaterThan(1)
  })

  test('retains a valid wall-end anchor until its successor becomes visible', () => {
    const world = createZombieEscapeCollisionWorld({
      agentRadius: 0.37,
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
          endX: 0,
          endZ: 4,
          halfThickness: 0.1,
          id: 'wall',
          startX: 0,
          startZ: -4,
        },
      ],
    })
    const field = createZombieEscapeFlowField(world)
    const output = createFlowSample()
    updateZombieEscapeFlowTarget(field, 3, 0, 0)
    resolveZombieEscapeFlowDirection(field, -0.3245, 4.3625, 3, 0, output, undefined, 0)
    const waypointNode = 30
    const sourceX = -0.20239882171154022
    const sourceZ = 4.413868427276611
    const waypointX = world.navigationGraph.x[waypointNode]!
    const waypointZ = world.navigationGraph.z[waypointNode]!
    const waypointDistance = Math.hypot(waypointX - sourceX, waypointZ - sourceZ)
    output.reachable = true
    output.waypointNode = waypointNode
    output.waypointUsesFallback = false
    output.x = (waypointX - sourceX) / waypointDistance
    output.z = (waypointZ - sourceZ) / waypointDistance
    expect(field.graphSameLayerDistances[waypointNode]).toBeFinite()

    const search = createZombieEscapeSparseFlowSearch()
    const strictBuilds = field.rebuildCount
    const fallbackBuilds = field.fallbackRebuildCount
    const budget = {
      maximumCandidateVisits: 1,
      maximumCollisionPredicates: 1,
      maximumHeapOperations: 1,
      maximumHierarchyNodeVisits: 1,
      maximumSupportPredicates: 1,
    }
    for (let refresh = 0; refresh < 3; refresh += 1) {
      beginZombieEscapeSparseFlowSearch(
        search,
        field,
        sourceX,
        sourceZ,
        field.targetX,
        field.targetZ,
        0,
        waypointNode,
        false,
      )
      const pendingSearch = structuredClone(search)
      const pendingOutput = structuredClone(output)
      expect(
        followZombieEscapeCachedSparseWaypoint(field, sourceX, sourceZ, 0, output, search, {
          maximumCandidateVisits: 0,
          maximumCollisionPredicates: 0,
          maximumHeapOperations: 0,
          maximumHierarchyNodeVisits: 0,
          maximumSupportPredicates: 0,
        }),
      ).toBe('pending')
      expect(search).toEqual(pendingSearch)
      expect(output).toEqual(pendingOutput)
      let status = 'pending'
      let steps = 0
      while (status === 'pending' && steps < 100) {
        status = followZombieEscapeCachedSparseWaypoint(
          field,
          sourceX,
          sourceZ,
          0,
          output,
          search,
          budget,
        )
        expect(search.lastStepCandidateVisits).toBeLessThanOrEqual(1)
        expect(search.lastStepCollisionPredicates).toBeLessThanOrEqual(1)
        expect(search.lastStepHierarchyNodeVisits).toBeLessThanOrEqual(1)
        expect(search.lastStepSupportPredicates).toBeLessThanOrEqual(1)
        steps += 1
      }
      expect(status).toBe('followed')
      expect(output).toMatchObject({
        reachable: true,
        waypointNode,
        waypointUsesFallback: false,
      })
      expect(output.x).toBeCloseTo((waypointX - sourceX) / waypointDistance, 12)
      expect(output.z).toBeCloseTo((waypointZ - sourceZ) / waypointDistance, 12)
    }
    expect(field.rebuildCount).toBe(strictBuilds)
    expect(field.fallbackRebuildCount).toBe(fallbackBuilds)
  })

  test('keeps resumable sparse attachment acceleration cloneable and invalidates stale searches', () => {
    const world = createResumableSparseFlowWorld()
    const clonedWorld = structuredClone(world)
    const originalHierarchy = world.navigationAttachmentAcceleration.layers[0]!
    const clonedHierarchy = clonedWorld.navigationAttachmentAcceleration.layers[0]!
    expect(clonedHierarchy.itemIndices).toBeInstanceOf(Uint32Array)
    expect(clonedHierarchy.nodeMinimumXs).toBeInstanceOf(Float64Array)
    expect([...clonedHierarchy.itemIndices]).toEqual([...originalHierarchy.itemIndices])
    expect([...clonedHierarchy.nodeSkipIndices]).toEqual([...originalHierarchy.nodeSkipIndices])

    const clonedField = createZombieEscapeFlowField(clonedWorld)
    const clonedOutput = createFlowSample()
    const clonedSearch = createZombieEscapeSparseFlowSearch()
    updateZombieEscapeFlowTarget(clonedField, 3, 0, 0)
    beginZombieEscapeSparseFlowSearch(clonedSearch, clonedField, -3, 0, 3, 0, 0)
    const lockedSlice = {
      maximumCandidateVisits: 32,
      maximumCollisionPredicates: 8,
      maximumHeapOperations: 32,
      maximumHierarchyNodeVisits: 32,
      maximumSupportPredicates: 16,
    }
    let clonedSteps = 0
    while (clonedSearch.status === 'pending' && clonedSteps < 1_000) {
      stepZombieEscapeSparseFlowSearch(clonedSearch, clonedField, clonedOutput, lockedSlice)
      expect(clonedSearch.lastStepCandidateVisits).toBeLessThanOrEqual(32)
      expect(clonedSearch.lastStepCollisionPredicates).toBeLessThanOrEqual(8)
      expect(clonedSearch.lastStepHierarchyNodeVisits).toBeLessThanOrEqual(32)
      expect(clonedSearch.lastStepSupportPredicates).toBeLessThanOrEqual(16)
      if (clonedSearch.status === 'pending') {
        stepZombieEscapeSparseTargetUpdate(clonedField, {
          ...lockedSlice,
          maximumGraphEdgeVisits: 64,
          maximumHeapOperations: 32,
        })
      }
      clonedSteps += 1
    }
    expect(clonedSearch.status).toBe('found')

    const staleSearch = createZombieEscapeSparseFlowSearch()
    const staleOutput = createFlowSample()
    beginZombieEscapeSparseFlowSearch(staleSearch, clonedField, -3, 0, 3, 0, 0)
    expect(
      stepZombieEscapeSparseFlowSearch(staleSearch, clonedField, staleOutput, {
        maximumCandidateVisits: 0,
        maximumCollisionPredicates: 0,
        maximumHeapOperations: 0,
        maximumHierarchyNodeVisits: 0,
        maximumSupportPredicates: 0,
      }),
    ).toBe('pending')
    const staleOutputBeforeInvalidation = { ...staleOutput }
    const openWorld = createZombieEscapeCollisionWorldWithoutObjects(
      clonedWorld,
      new Set(['breakable-divider']),
    )
    expect(setZombieEscapeFlowFieldWorld(clonedField, openWorld)).toBe(true)
    expect(
      stepZombieEscapeSparseFlowSearch(staleSearch, clonedField, staleOutput, lockedSlice),
    ).toBe('invalidated')
    expect(staleOutput).toEqual(staleOutputBeforeInvalidation)
  })

  test('applies one classified object-mask byte and resolves collision hits through O(1) ordinals', () => {
    const baseWorld = createZombieEscapeCollisionWorld({
      agentRadius: AGENT_RADIUS,
      boundaryPolicy: 'none',
      boxes: [
        {
          breakable: true,
          centerX: 0,
          centerZ: 0,
          halfDepth: 0.45,
          halfWidth: 0.45,
          id: 'table-piece-a',
          objectId: 'table',
          rotation: 0,
        },
        {
          breakable: true,
          centerX: 0.8,
          centerZ: 0,
          halfDepth: 0.2,
          halfWidth: 0.2,
          id: 'table-piece-b',
          objectId: 'table',
          rotation: 0,
        },
        {
          breakable: true,
          centerX: 3,
          centerZ: 0,
          halfDepth: 0.3,
          halfWidth: 0.3,
          id: 'wardrobe',
          objectId: 'wardrobe',
          rotation: 0,
        },
        {
          breakable: false,
          centerX: 6,
          centerZ: 0,
          halfDepth: 0.3,
          halfWidth: 0.3,
          id: 'structural-wall',
          objectId: 'structural-wall',
          rotation: 0,
        },
      ],
      playRadius: 8,
    })
    const world = createZombieEscapeCollisionWorldActiveView(baseWorld)
    expect(world.navigationGraph).toBe(baseWorld.navigationGraph)
    expect(world.navigationColliderAcceleration).toBe(baseWorld.navigationColliderAcceleration)
    expect(findFirstActiveZombieEscapeBreakableObjectId(world)).toBe('table')

    const hit = createZombieEscapeCollisionHit()
    expect(zombieEscapeSegmentIsClear(world, -2, 0, 2, 0, AGENT_RADIUS, hit)).toBe(false)
    const tableOrdinal = resolveZombieEscapeCollisionHitObjectOrdinal(world, hit)
    expect(tableOrdinal).toBeGreaterThanOrEqual(0)
    expect(resolveZombieEscapeCollisionObjectIdByOrdinal(world, tableOrdinal)).toBe('table')
    expect(zombieEscapeCollisionObjectOrdinalIsActive(world, tableOrdinal)).toBe(true)

    const tableDelta = createZombieEscapeCollisionObjectDeltaResult()
    expect(classifyZombieEscapeCollisionObjectDelta(world, 'table', tableDelta)).toBe('changed')
    expect(tableDelta.objectOrdinal).toBe(tableOrdinal)
    expect(tableDelta.objectLookupComparisons).toBeLessThanOrEqual(2)
    const revisionBefore = world.revision
    expect(deactivateZombieEscapeCollisionObject(world, tableDelta)).toBe('changed')
    expect(tableDelta).toMatchObject({
      allocationCount: 0,
      fullArrayClearCount: 0,
      objectMaskWrites: 1,
      revisionAdvanceCount: 1,
      revisionBefore,
      status: 'changed',
      worldCompileCount: 0,
    })
    expect(tableDelta.revisionAfter).toBe(world.revision)
    expect(world.activationRevision).toBe(1)
    expect(zombieEscapeCollisionObjectOrdinalIsActive(world, tableOrdinal)).toBe(false)
    expect(zombieEscapeSegmentIsClear(world, -2, 0, 2, 0, AGENT_RADIUS, hit)).toBe(true)
    expect(findFirstActiveZombieEscapeBreakableObjectId(world)).toBe('wardrobe')

    const structuralDelta = createZombieEscapeCollisionObjectDeltaResult()
    expect(
      classifyZombieEscapeCollisionObjectDelta(world, 'structural-wall', structuralDelta),
    ).toBe('requires-recompile')
    expect(deactivateZombieEscapeCollisionObject(world, structuralDelta)).toBe('invalidated')
    expect(structuralDelta.objectMaskWrites).toBe(0)

    const unchanged = createZombieEscapeCollisionObjectDeltaResult()
    expect(classifyZombieEscapeCollisionObjectDelta(world, 'table', unchanged)).toBe('unchanged')
    const stale = createZombieEscapeCollisionObjectDeltaResult()
    expect(classifyZombieEscapeCollisionObjectDelta(world, 'wardrobe', stale)).toBe('changed')
    const fresh = createZombieEscapeCollisionObjectDeltaResult()
    expect(classifyZombieEscapeCollisionObjectDelta(world, 'wardrobe', fresh)).toBe('changed')
    expect(deactivateZombieEscapeCollisionObject(world, fresh)).toBe('changed')
    expect(deactivateZombieEscapeCollisionObject(world, stale)).toBe('invalidated')
    expect(stale.objectMaskWrites).toBe(0)
    expect(structuredClone(world).activeObjectMask).toBeInstanceOf(Uint8Array)
  })

  test('preserves committed routes only for preflighted removal-safe mask deltas', () => {
    const world = createZombieEscapeCollisionWorldActiveView(
      createZombieEscapeCollisionWorld({
        agentRadius: AGENT_RADIUS,
        boundaryPolicy: 'none',
        boxes: [
          {
            breakable: true,
            centerX: -1,
            centerZ: 2,
            halfDepth: 0.35,
            halfWidth: 0.35,
            id: 'crate-a',
            objectId: 'crate-a',
            rotation: 0,
          },
          {
            breakable: true,
            centerX: 1,
            centerZ: 2,
            halfDepth: 0.35,
            halfWidth: 0.35,
            id: 'crate-b',
            objectId: 'crate-b',
            rotation: 0,
          },
        ],
        navigationSupports: [
          {
            boundary: true,
            elevation: 0,
            id: 'surface',
            polygon: [
              { x: -5, z: -5 },
              { x: 5, z: -5 },
              { x: 5, z: 5 },
              { x: -5, z: 5 },
            ],
          },
        ],
        playRadius: 6,
      }),
    )
    const field = createZombieEscapeFlowField(world)
    const sample = createFlowSample()
    updateZombieEscapeFlowTarget(field, 3, 0, 0)
    resolveZombieEscapeFlowDirection(field, -3, 0, 3, 0, sample, undefined, 0)
    expect(sample.reachable).toBe(true)
    expect(field.graphSparseTargetUpdate.status).toBe('ready')
    const strictDistances = Array.from(field.graphStrictDistances)
    const strictNextNodes = Array.from(field.graphStrictNextNodes)
    const targetCell = field.targetCell
    const routeInvalidationCount = field.graphSparseTargetUpdate.routeInvalidationCount

    const firstDelta = createZombieEscapeCollisionObjectDeltaResult()
    expect(classifyZombieEscapeCollisionObjectDelta(world, 'crate-a', firstDelta)).toBe('changed')
    expect(deactivateZombieEscapeCollisionObject(world, firstDelta)).toBe('changed')
    expect(acknowledgeZombieEscapeFlowFieldCollisionMaskRemoval(field)).toBe(true)
    expect(field.graphSparseTargetUpdate.worldRevision).toBe(world.revision)
    expect(field.graphSparseTargetUpdate.status).toBe('ready')
    expect(field.graphSparseTargetUpdate.routeInvalidationCount).toBe(routeInvalidationCount)
    expect(field.targetCell).toBe(targetCell)
    expect(Array.from(field.graphStrictDistances)).toEqual(strictDistances)
    expect(Array.from(field.graphStrictNextNodes)).toEqual(strictNextNodes)

    expect(beginZombieEscapeSparseTargetUpdate(field, 3, 0.1, 0)).toBe('pending')
    const pendingWorldRevision = field.graphSparseTargetUpdate.worldRevision
    const secondDelta = createZombieEscapeCollisionObjectDeltaResult()
    expect(classifyZombieEscapeCollisionObjectDelta(world, 'crate-b', secondDelta)).toBe('changed')
    expect(deactivateZombieEscapeCollisionObject(world, secondDelta)).toBe('changed')
    expect(acknowledgeZombieEscapeFlowFieldCollisionMaskRemoval(field)).toBe(false)
    expect(field.graphSparseTargetUpdate.worldRevision).toBe(pendingWorldRevision)
    expect(
      stepZombieEscapeSparseTargetUpdate(field, {
        maximumCandidateVisits: 0,
        maximumCollisionPredicates: 0,
        maximumGraphEdgeVisits: 0,
        maximumHeapOperations: 0,
        maximumHierarchyNodeVisits: 0,
        maximumSupportPredicates: 0,
      }),
    ).toBe('invalidated')

    const connectorWorld = createZombieEscapeCollisionWorld({
      agentRadius: AGENT_RADIUS,
      navigationConnectors: [
        {
          ascendingEnd: true,
          chainId: 'stairs',
          chainLowerY: 0,
          chainOrder: 0,
          chainUpperY: 2.5,
          endX: 0,
          endY: 2.5,
          endZ: 1.5,
          halfWidth: 0.5,
          id: 'stairs',
          objectId: 'stairs',
          startX: 0,
          startY: 0,
          startZ: -1.5,
        },
      ],
      navigationSupports: [
        {
          elevation: 2.5,
          id: 'upper',
          polygon: [
            { x: -4, z: -4 },
            { x: 4, z: -4 },
            { x: 4, z: 4 },
            { x: -4, z: 4 },
          ],
        },
      ],
      playRadius: 5,
    })
    const connectorDelta = createZombieEscapeCollisionObjectDeltaResult()
    expect(classifyZombieEscapeCollisionObjectDelta(connectorWorld, 'stairs', connectorDelta)).toBe(
      'requires-recompile',
    )
  })

  test.each([
    { endX: 6, startX: -6 },
    { endX: -6, startX: 6 },
  ])('matches exact earliest collision in direction $startX->$endX under one-unit inner slices', ({
    endX,
    startX,
  }) => {
    const world = createZombieEscapeCollisionWorld({
      agentRadius: AGENT_RADIUS,
      boundaryPolicy: 'none',
      boxes: [
        {
          centerX: 2.5,
          centerZ: 0,
          halfDepth: 0.5,
          halfWidth: 0.45,
          id: 'box',
          rotation: Math.PI / 9,
        },
      ],
      circles: [
        { id: 'near-circle', radius: 0.4, x: -2, z: 0 },
        { id: 'far-circle', radius: 0.35, x: 4.5, z: 0 },
      ],
      navigationSupports: [
        {
          elevation: 0,
          id: 'surface',
          polygon: [
            { x: -8, z: -3 },
            { x: 8, z: -3 },
            { x: 8, z: 3 },
            { x: -8, z: 3 },
          ],
        },
      ],
      playRadius: 9,
      segments: [
        {
          endX: 0.5,
          endZ: 1,
          halfThickness: 0.12,
          id: 'segment',
          startX: 0.5,
          startZ: -1,
        },
      ],
    })
    const expectedHit = createZombieEscapeCollisionHit()
    expect(zombieEscapeSegmentIsClear(world, startX, 0, endX, 0, AGENT_RADIUS, expectedHit)).toBe(
      false,
    )
    const search = createZombieEscapeNavigationVisibilitySearch()
    beginZombieEscapeNavigationVisibilitySearch(world, search, 0, startX, 0, endX, 0, AGENT_RADIUS)
    expect(
      stepZombieEscapeNavigationVisibilitySearch(world, search, {
        maximumCandidateVisits: 0,
        maximumCollisionPredicates: 0,
        maximumHeapOperations: 0,
        maximumHierarchyNodeVisits: 0,
        maximumSupportPredicates: 0,
      }),
    ).toBe('pending')
    expect(search.lastStepCandidateVisits).toBe(0)
    expect(search.lastStepCollisionPredicates).toBe(0)
    expect(search.lastStepHierarchyNodeVisits).toBe(0)
    expect(search.lastStepSupportPredicates).toBe(0)

    let steps = 0
    while (search.status === 'pending' && steps < 10_000) {
      stepZombieEscapeNavigationVisibilitySearch(world, search, {
        maximumCandidateVisits: 1,
        maximumCollisionPredicates: 1,
        maximumHeapOperations: 1,
        maximumHierarchyNodeVisits: 1,
        maximumSupportPredicates: 1,
      })
      expect(search.lastStepCandidateVisits).toBeLessThanOrEqual(1)
      expect(search.lastStepCollisionPredicates).toBeLessThanOrEqual(1)
      expect(search.lastStepHierarchyNodeVisits).toBeLessThanOrEqual(1)
      expect(search.lastStepSupportPredicates).toBeLessThanOrEqual(1)
      expect(search.lastStepHierarchyNodeVisits).toBe(
        search.lastStepSupportHierarchyNodeVisits +
          search.lastStepSupportRingHierarchyNodeVisits +
          search.lastStepColliderHierarchyNodeVisits,
      )
      expect(search.lastStepCandidateVisits).toBe(
        search.lastStepSupportItemVisits + search.lastStepColliderCandidateVisits,
      )
      expect(search.lastStepSupportPredicates).toBe(
        search.lastStepSupportHoleVisits + search.lastStepSupportRingEdgeVisits,
      )
      steps += 1
    }
    expect(search.status).toBe('blocked')
    expect(search.collisionHit.colliderKind).toBe(expectedHit.colliderKind)
    expect(search.collisionHit.colliderIndex).toBe(expectedHit.colliderIndex)
    expect(search.collisionHit.time).toBeCloseTo(expectedHit.time, 12)
    expect(search.totalSupportRingEdgeVisits).toBeGreaterThan(0)
    expect(search.totalColliderCandidateVisits).toBeGreaterThan(0)
    expect(search.totalColliderHierarchyNodeVisits).toBeGreaterThan(0)
  })

  test('resumes hole support exactly and invalidates visibility on an active-mask revision', () => {
    const world = createZombieEscapeCollisionWorldActiveView(
      createZombieEscapeCollisionWorld({
        agentRadius: AGENT_RADIUS,
        boundaryPolicy: 'none',
        boxes: [
          {
            breakable: true,
            centerX: 5,
            centerZ: 5,
            halfDepth: 0.25,
            halfWidth: 0.25,
            id: 'breakable',
            objectId: 'breakable',
            rotation: 0,
          },
        ],
        navigationSupports: [
          {
            elevation: 0,
            holes: [
              [
                { x: -0.8, z: -0.8 },
                { x: 0.8, z: -0.8 },
                { x: 0.8, z: 0.8 },
                { x: -0.8, z: 0.8 },
              ],
            ],
            id: 'holed-surface',
            polygon: [
              { x: -6, z: -4 },
              { x: 6, z: -4 },
              { x: 6, z: 4 },
              { x: -6, z: 4 },
            ],
          },
        ],
        playRadius: 8,
      }),
    )
    const search = createZombieEscapeNavigationVisibilitySearch()
    beginZombieEscapeNavigationVisibilitySearch(world, search, 0, -3, 0, 3, 0, AGENT_RADIUS)
    let steps = 0
    while (search.status === 'pending' && steps < 10_000) {
      stepZombieEscapeNavigationVisibilitySearch(world, search, {
        maximumCandidateVisits: 1,
        maximumCollisionPredicates: 1,
        maximumHeapOperations: 1,
        maximumHierarchyNodeVisits: 1,
        maximumSupportPredicates: 1,
      })
      steps += 1
    }
    expect(search.status).toBe('blocked')
    expect(search.collisionHit.colliderKind).toBe('none')
    expect(search.totalSupportHoleVisits).toBeGreaterThan(0)

    beginZombieEscapeNavigationVisibilitySearch(world, search, 0, -3, 2, 3, 2, AGENT_RADIUS)
    expect(
      stepZombieEscapeNavigationVisibilitySearch(world, search, {
        maximumCandidateVisits: 1,
        maximumCollisionPredicates: 1,
        maximumHeapOperations: 1,
        maximumHierarchyNodeVisits: 1,
        maximumSupportPredicates: 1,
      }),
    ).toBe('pending')
    const delta = createZombieEscapeCollisionObjectDeltaResult()
    expect(classifyZombieEscapeCollisionObjectDelta(world, 'breakable', delta)).toBe('changed')
    expect(deactivateZombieEscapeCollisionObject(world, delta)).toBe('changed')
    expect(
      stepZombieEscapeNavigationVisibilitySearch(world, search, {
        maximumCandidateVisits: 1,
        maximumCollisionPredicates: 1,
        maximumHeapOperations: 1,
        maximumHierarchyNodeVisits: 1,
        maximumSupportPredicates: 1,
      }),
    ).toBe('invalidated')
  })
})

function sparseEdgeKeys(adjacency: { nodeOffsets: Uint32Array; toNodes: Int32Array }) {
  const keys = new Set<string>()
  for (let from = 0; from < adjacency.nodeOffsets.length - 1; from += 1) {
    for (
      let edge = adjacency.nodeOffsets[from]!;
      edge < adjacency.nodeOffsets[from + 1]!;
      edge += 1
    ) {
      const to = adjacency.toNodes[edge]!
      keys.add(`${String(Math.min(from, to))}:${String(Math.max(from, to))}`)
    }
  }
  return keys
}

function exactZombieEscapeNavigationVisibilityStatus(
  world: ReturnType<typeof createZombieEscapeCollisionWorld>,
  first: number,
  second: number,
  breakablesTraversable: boolean,
) {
  const graph = world.navigationGraph
  const search = createZombieEscapeNavigationVisibilitySearch()
  beginZombieEscapeNavigationVisibilitySearch(
    world,
    search,
    graph.layerIndices[first]!,
    graph.x[first]!,
    graph.z[first]!,
    graph.x[second]!,
    graph.z[second]!,
    world.agentRadius,
    breakablesTraversable,
  )
  return stepZombieEscapeNavigationVisibilitySearch(world, search, {
    maximumCandidateVisits: Number.POSITIVE_INFINITY,
    maximumCollisionPredicates: Number.POSITIVE_INFINITY,
    maximumHeapOperations: Number.POSITIVE_INFINITY,
    maximumHierarchyNodeVisits: Number.POSITIVE_INFINITY,
    maximumSupportPredicates: Number.POSITIVE_INFINITY,
  })
}

function sparseAuthoredAdjacencyVisibilityFailures(
  world: ReturnType<typeof createZombieEscapeCollisionWorld>,
  adjacency: { nodeOffsets: Uint32Array; toNodes: Int32Array },
  breakablesTraversable: boolean,
) {
  const graph = world.navigationGraph
  const failures: string[] = []
  for (let first = 0; first + 1 < adjacency.nodeOffsets.length; first += 1) {
    for (
      let edge = adjacency.nodeOffsets[first]!;
      edge < adjacency.nodeOffsets[first + 1]!;
      edge += 1
    ) {
      const second = adjacency.toNodes[edge]!
      if (first >= second || graph.layerIndices[first] !== graph.layerIndices[second]) continue
      if (
        !graph.nodeIds[first]!.startsWith('0:anchor:') &&
        !graph.nodeIds[first]!.startsWith('0:witness:') &&
        !graph.nodeIds[second]!.startsWith('0:anchor:') &&
        !graph.nodeIds[second]!.startsWith('0:witness:')
      ) {
        continue
      }
      if (
        exactZombieEscapeNavigationVisibilityStatus(world, first, second, breakablesTraversable) !==
        'clear'
      ) {
        failures.push(`${String(first)}:${String(second)}`)
      }
    }
  }
  return failures
}

function currentBroadphaseVisitedCells(world: ReturnType<typeof createZombieEscapeCollisionWorld>) {
  const epoch = world.broadphase.visitEpoch[0]!
  const cells: number[] = []
  for (let cell = 0; cell < world.broadphase.cellVisitStamps.length; cell += 1) {
    if (world.broadphase.cellVisitStamps[cell] === epoch) cells.push(cell)
  }
  return cells
}

function createExhaustiveBroadphaseWorld(
  world: ReturnType<typeof createZombieEscapeCollisionWorld>,
) {
  const colliderCount = world.segments.length + world.circles.length + world.boxes.length
  return {
    ...world,
    broadphase: {
      candidateIndices: new Uint32Array(colliderCount),
      cellOffsets: Uint32Array.of(0, colliderCount),
      cellSize: 200,
      cellVisitStamps: new Uint32Array(1),
      colliderIndices: Uint32Array.from({ length: colliderCount }, (_, index) => index),
      gridHeight: 1,
      gridOriginX: -100,
      gridOriginZ: -100,
      gridWidth: 1,
      visitEpoch: new Uint32Array(1),
      visitStamps: new Uint32Array(colliderCount),
    },
  }
}

function sparseNavigationComponentSizes(adjacency: {
  nodeOffsets: Uint32Array
  toNodes: Int32Array
}) {
  const visited = new Uint8Array(adjacency.nodeOffsets.length - 1)
  const queue = new Int32Array(visited.length)
  const sizes: number[] = []
  for (let start = 0; start < visited.length; start += 1) {
    if (visited[start] !== 0) continue
    let read = 0
    let write = 1
    let size = 0
    queue[0] = start
    visited[start] = 1
    while (read < write) {
      const node = queue[read++]!
      size += 1
      for (
        let edge = adjacency.nodeOffsets[node]!;
        edge < adjacency.nodeOffsets[node + 1]!;
        edge += 1
      ) {
        const next = adjacency.toNodes[edge]!
        if (visited[next] !== 0) continue
        visited[next] = 1
        queue[write++] = next
      }
    }
    sizes.push(size)
  }
  return sizes.sort((first, second) => second - first)
}

function createDoorWorld(agentRadius = AGENT_RADIUS, endCap: 'flat' | 'round' = 'round') {
  return createZombieEscapeCollisionWorld({
    agentRadius,
    playRadius: 8,
    segments: [
      {
        endX: 0,
        endZ: -0.45,
        halfThickness: 0.09,
        id: 'wall:lower',
        endCap,
        startX: 0,
        startCap: endCap,
        startZ: -3,
      },
      {
        endX: 0,
        endZ: 3,
        halfThickness: 0.09,
        id: 'wall:upper',
        endCap,
        startX: 0,
        startCap: endCap,
        startZ: 0.45,
      },
    ],
  })
}

function publishForcedSparseTarget(
  field: ReturnType<typeof createZombieEscapeFlowField>,
  targetX: number,
  targetZ: number,
  targetY = 0,
) {
  beginZombieEscapeSparseTargetUpdate(field, targetX, targetZ, targetY, true)
  const budget = {
    maximumCandidateVisits: Number.POSITIVE_INFINITY,
    maximumCollisionPredicates: Number.POSITIVE_INFINITY,
    maximumGraphEdgeVisits: Number.POSITIVE_INFINITY,
    maximumHeapOperations: Number.POSITIVE_INFINITY,
    maximumHierarchyNodeVisits: Number.POSITIVE_INFINITY,
    maximumSupportPredicates: Number.POSITIVE_INFINITY,
  }
  while (field.graphSparseTargetUpdate.status === 'pending') {
    stepZombieEscapeSparseTargetUpdate(field, budget)
  }
}

function createRouteCorridorForkWorld() {
  return createZombieEscapeCollisionWorld({
    agentRadius: AGENT_RADIUS,
    boundaryPolicy: 'none',
    cellSize: 2,
    navigationSupports: [
      {
        boundary: true,
        elevation: 0,
        id: 'corridor-fork-surface',
        polygon: [
          { x: -10, z: -10 },
          { x: 10, z: -10 },
          { x: 10, z: 10 },
          { x: -10, z: 10 },
        ],
      },
    ],
    playRadius: 11,
    segments: [
      {
        endX: 0,
        endZ: 6,
        halfThickness: 0.1,
        id: 'corridor-fork-wall',
        startX: 0,
        startZ: -6,
      },
    ],
  })
}

function createRouteCorridorCrossLayerWorld() {
  return createZombieEscapeCollisionWorld({
    agentRadius: AGENT_RADIUS,
    boundaryPolicy: 'none',
    cellSize: 0.2,
    navigationConnectors: [
      {
        ascendingEnd: true,
        chainId: 'corridor-stairs',
        chainLowerY: 0,
        chainOrder: 0,
        chainUpperY: 2.5,
        endX: 0,
        endY: 2.5,
        endZ: 2,
        halfWidth: 1,
        id: 'corridor-stairs',
        startX: 0,
        startY: 0,
        startZ: -2,
      },
    ],
    navigationSupports: [
      {
        boundary: true,
        elevation: 0,
        id: 'corridor-lower',
        polygon: [
          { x: -8, z: -8 },
          { x: 8, z: -8 },
          { x: 8, z: 0 },
          { x: -8, z: 0 },
        ],
      },
      {
        boundary: true,
        elevation: 2.5,
        id: 'corridor-upper',
        polygon: [
          { x: -8, z: 0 },
          { x: 8, z: 0 },
          { x: 8, z: 8 },
          { x: -8, z: 8 },
        ],
      },
    ],
    playRadius: 10,
  })
}

function createRouteCorridorSideSwitchWorld() {
  return createZombieEscapeCollisionWorld({
    agentRadius: AGENT_RADIUS,
    boundaryPolicy: 'none',
    cellSize: 2,
    navigationSupports: [
      {
        boundary: true,
        elevation: 0,
        id: 'side-switch-surface',
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
        endX: 0,
        endZ: 4,
        halfThickness: 0.1,
        id: 'side-switch-wall',
        startX: 0,
        startZ: -4,
      },
    ],
  })
}

function createFlowSample() {
  return {
    blockingDistance: Number.POSITIVE_INFINITY,
    blockingX: 0,
    blockingZ: 0,
    connectorIndex: -1,
    connectorTargetEnd: false,
    reachable: false,
    x: 0,
    z: 0,
  }
}

function createResumableSparseFlowWorld() {
  return createZombieEscapeCollisionWorld({
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
        id: 'breakable-divider',
        objectId: 'breakable-divider',
        startCap: 'flat',
        startX: 0,
        startZ: -6,
      },
    ],
  })
}
