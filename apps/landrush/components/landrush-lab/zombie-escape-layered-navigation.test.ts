import { describe, expect, test } from 'bun:test'
import {
  type AnyNode,
  BuildingNode,
  LevelNode,
  SlabNode,
  StairNode,
  StairSegmentNode,
} from '@pascal-app/core'
import { createLandrushZombieEscapeCollisionWorld } from './landrush-island-ai-navigation-semantics'
import {
  createZombieEscapeCollisionHit,
  createZombieEscapeCollisionWorld,
  createZombieEscapeFlowField,
  createZombieEscapeNavigationMoveResult,
  isZombieEscapeCollisionObjectBreakableAtElevation,
  moveZombieEscapeNavigationAgent,
  resolveZombieEscapeCollisionHitObjectId,
  resolveZombieEscapeFlowDirection,
  resolveZombieEscapeNavigationTargetElevation,
  updateZombieEscapeFlowTarget,
  type ZombieEscapeCollisionWorld,
} from './zombie-escape-collision-world'
import {
  ZOMBIE_ESCAPE_SIMULATION,
  ZOMBIE_ESCAPE_ZOMBIE_MAXIMUM_COLLISION_RADIUS_METERS,
} from './zombie-escape-config'
import { createZombieEscapeControlState } from './zombie-escape-controls'
import {
  createZombieEscapeSimulation,
  setZombieEscapeCollisionWorld,
  setZombieEscapeExternalPlayerPose,
  setZombieEscapeGamePhase,
  spawnZombieEscapeZombie,
  spawnZombieEscapeZombieAtNavigationElevation,
  stepZombieEscapeSimulation,
  ZOMBIE_ESCAPE_ZOMBIE_INTENT,
} from './zombie-escape-simulation'
import { resolveSparseNavigationStrictRegionWitnessNode } from './zombie-escape-sparse-navigation'
import { createZombieEscapeArena } from './zombie-escape-world'
import { ZOMBIE_ESCAPE_ZOMBIE_CATALOG } from './zombie-escape-zombie-catalog'

const AGENT_RADIUS = 0.22
const STEP_METERS = 0.06

describe('Zombie Escape layered navigation', () => {
  test.each([
    { layout: 'straight', segments: createStraightSegments() },
    { layout: 'L', segments: createTurnedSegments('left') },
    { layout: 'U', segments: createUTurnSegments() },
  ])('traverses the authored $layout chain upward and downward', ({ layout, segments }) => {
    const world = createStairChainWorld(layout, segments)
    const connectors = segments.map((segment) =>
      world.navigationConnectors.find(({ id }) =>
        id.endsWith(`:${segment.id}:navigation-connector`),
      ),
    )
    expect(connectors.every(Boolean)).toBe(true)
    expect(connectors.every(({ ascendingEnd }) => ascendingEnd)).toBe(true)
    expect(new Set(connectors.map(({ chainLowerY }) => chainLowerY)).size).toBe(1)
    expect(new Set(connectors.map(({ chainUpperY }) => chainUpperY)).size).toBe(1)

    const first = connectors[0]!
    const last = connectors[connectors.length - 1]!
    const lowerTarget = {
      x: first.startX - first.directionX * 1.5,
      y: first.chainLowerY,
      z: first.startZ - first.directionZ * 1.5,
    }
    const upperTarget = {
      x: last.endX + last.directionX * 1.5,
      y: last.chainUpperY,
      z: last.endZ + last.directionZ * 1.5,
    }

    const ascending = traverseNavigation(world, lowerTarget, upperTarget)
    expect(ascending).toMatchObject({ reached: true })
    expect(ascending.y).toBeCloseTo(upperTarget.y, 5)
    expect([...ascending.connectorIds]).toEqual(
      expect.arrayContaining(world.navigationConnectors.map(({ id }) => id)),
    )
    expect(ascending.rebuildCount).toBe(1)

    const descending = traverseNavigation(world, upperTarget, lowerTarget)
    expect(descending.reached).toBe(true)
    expect(descending.y).toBeCloseTo(lowerTarget.y, 5)
    expect([...descending.connectorIds]).toEqual(
      expect.arrayContaining(world.navigationConnectors.map(({ id }) => id)),
    )
    expect(descending.rebuildCount).toBe(1)
  })

  test.each([
    { direction: 'left', stairType: 'curved' as const, stepCount: 8, sweepAngle: Math.PI / 2 },
    { direction: 'right', stairType: 'curved' as const, stepCount: 8, sweepAngle: -Math.PI / 2 },
    { direction: 'left', stairType: 'spiral' as const, stepCount: 12, sweepAngle: Math.PI * 2 },
    {
      direction: 'right',
      stairType: 'spiral' as const,
      stepCount: 12,
      sweepAngle: -Math.PI * 2,
    },
  ])('traverses authored $direction-turning $stairType step-center connectors upward and downward', ({
    stairType,
    stepCount,
    sweepAngle,
  }) => {
    const world = createArcStairWorld(stairType, stepCount, sweepAngle)
    expect(world.navigationConnectors).toHaveLength(stepCount + 1)
    expect(
      world.boxes
        .filter(({ objectId }) => objectId.includes(`stair_layered_${stairType}`))
        .every(({ id }) => !id.includes(':navigation-blocker:')),
    ).toBe(true)
    expect(
      world.navigationConnectors
        .map(({ chainOrder }) => chainOrder)
        .sort((first, second) => first - second),
    ).toEqual(Array.from({ length: stepCount + 1 }, (_, index) => index))
    const first = world.navigationConnectors.find(({ chainOrder }) => chainOrder === 0)!
    const last = world.navigationConnectors.find(({ chainOrder }) => chainOrder === stepCount)!
    const lowerTarget = {
      x: first.startX - first.directionX * 1.5,
      y: first.chainLowerY,
      z: first.startZ - first.directionZ * 1.5,
    }
    const upperTarget = {
      x: last.endX + last.directionX * 1.5,
      y: last.chainUpperY,
      z: last.endZ + last.directionZ * 1.5,
    }

    const ascending = traverseNavigation(world, lowerTarget, upperTarget)
    expect(ascending.reached).toBe(true)
    expect(ascending.y).toBeCloseTo(upperTarget.y, 5)
    expect([...ascending.connectorIds]).toEqual(
      expect.arrayContaining(world.navigationConnectors.map(({ id }) => id)),
    )

    const descending = traverseNavigation(world, upperTarget, lowerTarget)
    expect(descending.reached).toBe(true)
    expect(descending.y).toBeCloseTo(lowerTarget.y, 5)
    expect([...descending.connectorIds]).toEqual(
      expect.arrayContaining(world.navigationConnectors.map(({ id }) => id)),
    )
  })

  test('isolates same-XZ furniture and paths by floor while routing a ground zombie to stairs', () => {
    const world = createZombieEscapeCollisionWorld({
      agentRadius: AGENT_RADIUS,
      boxes: [
        {
          breakable: true,
          centerX: 0,
          centerZ: 0,
          halfDepth: 0.55,
          halfWidth: 0.55,
          id: 'ground-table:footprint',
          maximumY: 0.8,
          minimumY: 0,
          navigationLayerY: 0,
          objectId: 'ground-table',
          rotation: 0,
        },
        {
          breakable: true,
          centerX: 0,
          centerZ: 0,
          halfDepth: 0.55,
          halfWidth: 0.55,
          id: 'upper-table:footprint',
          maximumY: 3.8,
          minimumY: 3,
          navigationLayerY: 3,
          objectId: 'upper-table',
          rotation: 0,
        },
      ],
      navigationConnectors: [
        {
          ascendingEnd: true,
          chainId: 'floor-stair',
          chainLowerY: 0,
          chainOrder: 0,
          chainUpperY: 3,
          endX: -3,
          endY: 3,
          endZ: 1.5,
          halfWidth: 0.7,
          id: 'floor-stair',
          startX: -3,
          startY: 0,
          startZ: -1.5,
        },
      ],
      navigationSupports: [
        {
          elevation: 3,
          id: 'upper-floor',
          polygon: [
            { x: -7, z: -7 },
            { x: 7, z: -7 },
            { x: 7, z: 7 },
            { x: -7, z: 7 },
          ],
        },
      ],
      playRadius: 8,
    })
    const field = createZombieEscapeFlowField(world)
    const sample = createFlowSample()
    const hit = createZombieEscapeCollisionHit()

    updateZombieEscapeFlowTarget(field, 2, 0, 0)
    resolveZombieEscapeFlowDirection(field, -2, 0, 2, 0, sample, hit, 0)
    expect(resolveZombieEscapeCollisionHitObjectId(world, hit)).toBe('ground-table')

    updateZombieEscapeFlowTarget(field, 2, 0, 3)
    resolveZombieEscapeFlowDirection(field, -2, 0, 2, 0, sample, hit, 3)
    expect(resolveZombieEscapeCollisionHitObjectId(world, hit)).toBe('upper-table')

    resolveZombieEscapeFlowDirection(field, 2, 0, 2, 0, sample, hit, 0)
    expect(sample.reachable).toBe(true)
    expect(sample.x).toBeLessThan(0)
    expect(hit.colliderKind).toBe('none')
    expect(isZombieEscapeCollisionObjectBreakableAtElevation(world, 'ground-table', 0)).toBe(true)
    expect(isZombieEscapeCollisionObjectBreakableAtElevation(world, 'ground-table', 3)).toBe(false)
    expect(isZombieEscapeCollisionObjectBreakableAtElevation(world, 'upper-table', 3)).toBe(true)
  })

  test('breaks the same-floor blocker sealing an upstairs route, then resumes through the stair', () => {
    const arena = createZombieEscapeArena(9_101)
    arena.obstacleCount = 0
    const world = createBlockedStairWorld(arena.playRadius)
    const connector = world.navigationConnectors[0]!
    const state = createZombieEscapeSimulation(arena, 9_102)
    setZombieEscapeCollisionWorld(state, world)
    setZombieEscapeExternalPlayerPose(state, true)
    setZombieEscapeGamePhase(state, 'night')
    state.waveSpawnRemaining = 0
    state.waveState = 'escape'
    state.player.x = connector.endX + 2
    state.player.y = connector.endY
    state.player.z = connector.endZ
    const zombie = spawnZombieEscapeZombie(state, -4, 0)
    state.zombies.attackCooldown[zombie] = 0
    const input = createZombieEscapeControlState()
    let sawFirstHit = false
    let sawFocusedAttack = false
    let heldFocusX: number | null = null
    let heldFocusZ: number | null = null
    let previousHeading = state.zombies.heading[zombie]!
    let previousTurnSign = 0
    let heldTurnReversals = 0
    let reachedUpperFloor = false

    for (let frame = 0; frame < 2_400; frame += 1) {
      const previousX = state.zombies.x[zombie]!
      const previousZ = state.zombies.z[zombie]!
      stepZombieEscapeSimulation(state, input, 1 / 60, arena)
      if (state.obstacleHitCounts.get('ground-table') === 1) sawFirstHit = true
      expect(state.obstacleHitCounts.has('upper-table')).toBe(false)
      expect(state.destroyedObstacleIds.has('upper-table')).toBe(false)

      if (
        state.zombies.intent[zombie] === ZOMBIE_ESCAPE_ZOMBIE_INTENT.attackObstacle &&
        !state.destroyedObstacleIds.has('ground-table')
      ) {
        sawFocusedAttack = true
        expect(state.zombies.attackTargetObjectId[zombie]).toBe('ground-table')
        expect(state.zombies.x[zombie]).toBeCloseTo(previousX, 8)
        expect(state.zombies.z[zombie]).toBeCloseTo(previousZ, 8)
        if (heldFocusX === null) {
          heldFocusX = state.zombies.attackFocusX[zombie]!
          heldFocusZ = state.zombies.attackFocusZ[zombie]!
        } else {
          expect(state.zombies.attackFocusX[zombie]).toBeCloseTo(heldFocusX, 8)
          expect(state.zombies.attackFocusZ[zombie]).toBeCloseTo(heldFocusZ!, 8)
        }
        const turn = normalizeTestAngle(state.zombies.heading[zombie]! - previousHeading)
        const turnSign = Math.abs(turn) > 0.000_001 ? Math.sign(turn) : 0
        if (turnSign !== 0 && previousTurnSign !== 0 && turnSign !== previousTurnSign) {
          heldTurnReversals += 1
        }
        if (turnSign !== 0) previousTurnSign = turnSign
      }
      previousHeading = state.zombies.heading[zombie]!

      if (
        state.destroyedObstacleIds.has('ground-table') &&
        state.zombies.navigationConnector[zombie] === -1 &&
        state.zombies.y[zombie]! > connector.endY - 0.01 &&
        state.zombies.x[zombie]! > connector.endX + 0.5
      ) {
        reachedUpperFloor = true
        break
      }
    }

    expect(ZOMBIE_ESCAPE_SIMULATION.obstacleHitsToBreak).toBe(2)
    expect(sawFirstHit).toBe(true)
    expect(sawFocusedAttack).toBe(true)
    expect(state.destroyedObstacleIds.has('ground-table')).toBe(true)
    expect(state.obstacleRevision).toBe(1)
    expect(heldTurnReversals).toBe(0)
    expect(reachedUpperFloor).toBe(true)
    expect(state.zombies.attackTargetObjectId[zombie]).toBeNull()
  })

  test('reuses one layered field allocation until target or world semantics change', () => {
    const world = createStairChainWorld('allocation', createStraightSegments())
    const field = createZombieEscapeFlowField(world)
    const distances = field.distances
    const fallbackDistances = field.fallbackDistances
    const fallbackQueue = field.fallbackQueue
    const queue = field.queue
    const connectorOffsets = world.navigationConnectorAdjacency.nodeOffsets
    const connectorToNodes = world.navigationConnectorAdjacency.toNodes
    const target = world.navigationConnectors[0]!
    const sample = createFlowSample()

    expect(updateZombieEscapeFlowTarget(field, target.endX, target.endZ, target.endY)).toBe(true)
    expect(
      updateZombieEscapeFlowTarget(field, target.endX + 0.1, target.endZ + 0.1, target.endY),
    ).toBe(false)
    expect(field.distances).toBe(distances)
    expect(field.fallbackDistances).toBe(fallbackDistances)
    expect(field.fallbackQueue).toBe(fallbackQueue)
    expect(field.queue).toBe(queue)
    expect(world.navigationConnectorAdjacency.nodeOffsets).toBe(connectorOffsets)
    expect(world.navigationConnectorAdjacency.toNodes).toBe(connectorToNodes)
    expect(field.rebuildCount).toBe(0)

    resolveZombieEscapeFlowDirection(
      field,
      target.startX - target.directionX,
      target.startZ - target.directionZ,
      target.endX,
      target.endZ,
      sample,
      undefined,
      target.startY,
    )
    expect(sample.reachable).toBe(true)
    expect(field.rebuildCount).toBe(1)
    resolveZombieEscapeFlowDirection(
      field,
      target.startX - target.directionX,
      target.startZ - target.directionZ,
      target.endX,
      target.endZ,
      sample,
      undefined,
      target.startY,
    )
    expect(field.rebuildCount).toBe(1)
  })

  test('caches an unreachable fallback result once per target bucket', () => {
    const world = createZombieEscapeCollisionWorld({
      agentRadius: AGENT_RADIUS,
      boxes: [
        {
          breakable: false,
          centerX: 0,
          centerZ: 0,
          halfDepth: 4,
          halfWidth: 4,
          id: 'sealed-static-room',
          rotation: 0,
        },
      ],
      playRadius: 2,
    })
    const field = createZombieEscapeFlowField(world)
    const sample = createFlowSample()

    expect(updateZombieEscapeFlowTarget(field, 0, 0)).toBe(true)
    resolveZombieEscapeFlowDirection(field, -1, 0, 0, 0, sample)
    resolveZombieEscapeFlowDirection(field, -1, 0, 0, 0, sample)
    expect(updateZombieEscapeFlowTarget(field, 0.1, 0.1)).toBe(false)

    expect(sample.reachable).toBe(false)
    expect(field.fallbackTargetCell).toBe(-1)
    expect(field.fallbackRebuildCount).toBe(1)
    expect(field.rebuildCount).toBe(1)
  })

  test('does not create a floating floor or implicitly change floors by walking off an upper support', () => {
    const world = createZombieEscapeCollisionWorld({
      agentRadius: AGENT_RADIUS,
      navigationSupports: [
        {
          elevation: 3,
          id: 'upper-room',
          polygon: [
            { x: -2, z: -2 },
            { x: 2, z: -2 },
            { x: 2, z: 2 },
            { x: -2, z: 2 },
          ],
        },
      ],
      playRadius: 8,
    })
    const upperLayer = world.navigationLayers.find(({ elevation }) => elevation === 3)!
    const unsupportedColumn = Math.floor((4 - world.gridOriginX) / world.cellSize)
    const unsupportedRow = Math.floor((0 - world.gridOriginZ) / world.cellSize)
    expect(upperLayer.support[unsupportedRow * world.gridWidth + unsupportedColumn]).toBe(0)

    const hit = createZombieEscapeCollisionHit()
    const move = createZombieEscapeNavigationMoveResult()
    moveZombieEscapeNavigationAgent(world, 1.7, 3, 0, 0.8, 0, AGENT_RADIUS, -1, false, hit, move)
    expect(move.collided).toBe(true)
    expect(move.x).toBeLessThanOrEqual(2 - AGENT_RADIUS + 0.002)
    expect(move.y).toBe(3)
  })

  test('pins overlapping sparse ground and upper layers until an explicit connector is requested', () => {
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
        {
          elevation: 3,
          id: 'upper',
          polygon: [
            { x: -2, z: -2 },
            { x: 2, z: -2 },
            { x: 2, z: 2 },
            { x: -2, z: 2 },
          ],
        },
      ],
      playRadius: 8,
    })
    const hit = createZombieEscapeCollisionHit()
    const move = createZombieEscapeNavigationMoveResult()

    moveZombieEscapeNavigationAgent(world, 1.7, 3, 0, 0.8, 0, AGENT_RADIUS, -1, false, hit, move)
    expect(move.collided).toBe(true)
    expect(move.x).toBeLessThanOrEqual(2 - AGENT_RADIUS + 0.002)
    expect(move.y).toBe(3)

    moveZombieEscapeNavigationAgent(world, 1.7, 0, 0, 0.8, 0, AGENT_RADIUS, -1, false, hit, move)
    expect(move.collided).toBe(false)
    expect(move.x).toBeCloseTo(2.5, 5)
    expect(move.y).toBe(0)

    expect(resolveZombieEscapeNavigationTargetElevation(world, 0, 0, 1.5, 0)).toBe(0)
    expect(resolveZombieEscapeNavigationTargetElevation(world, 4, 0, 3, 0)).toBe(0)
  })

  test('retains a smaller zombie on a descending connector from its compiled upper source', () => {
    const upperY = 2.56
    const world = createZombieEscapeCollisionWorld({
      agentRadius: ZOMBIE_ESCAPE_ZOMBIE_MAXIMUM_COLLISION_RADIUS_METERS,
      boundaryPolicy: 'none',
      navigationConnectors: [
        {
          ascendingEnd: true,
          chainId: 'retention-stair',
          chainLowerY: 0,
          chainOrder: 0,
          chainUpperY: upperY,
          endX: 0,
          endY: upperY,
          endZ: 3,
          halfWidth: 0.9,
          id: 'retention-stair:flight',
          startX: 0,
          startY: 0,
          startZ: 0,
        },
      ],
      navigationSupports: [
        {
          boundary: true,
          elevation: 0,
          id: 'retention-ground',
          polygon: [
            { x: -4, z: -3 },
            { x: 4, z: -3 },
            { x: 4, z: 5 },
            { x: -4, z: 5 },
          ],
        },
        {
          elevation: upperY,
          id: 'retention-upper',
          polygon: [
            { x: -4, z: -3 },
            { x: 4, z: -3 },
            { x: 4, z: 5 },
            { x: -4, z: 5 },
          ],
        },
      ],
      playRadius: 8,
    })
    const connector = world.navigationConnectors[0]!
    const upperLayerIndex = world.navigationLayers.findIndex(
      ({ elevation }) => elevation === upperY,
    )
    const graph = world.navigationGraph
    const upperSourceNode = graph.connectorIndices.findIndex(
      (connectorIndex, node) =>
        connectorIndex === 0 &&
        graph.connectorEnds[node] === 0 &&
        graph.layerIndices[node] === upperLayerIndex,
    )
    expect(upperSourceNode).toBeGreaterThanOrEqual(0)

    let x = graph.x[upperSourceNode]!
    let y = upperY
    let z = graph.z[upperSourceNode]!
    const compiledSourceProjection =
      (x - connector.startX) * connector.directionX + (z - connector.startZ) * connector.directionZ
    expect(compiledSourceProjection).toBeCloseTo(connector.length, 10)

    const zombieRadius = 0.3
    const stepMeters = world.cellSize * 0.2
    expect(stepMeters).toBeLessThan(world.cellSize * 0.5)
    const displacementX = -connector.directionX * stepMeters
    const displacementZ = -connector.directionZ * stepMeters
    const hit = createZombieEscapeCollisionHit()
    const move = createZombieEscapeNavigationMoveResult()

    moveZombieEscapeNavigationAgent(
      world,
      x,
      y,
      z,
      displacementX,
      displacementZ,
      world.agentRadius,
      -1,
      false,
      hit,
      move,
      0,
      false,
      zombieRadius,
    )
    expect(move.connectorIndex).toBe(0)
    expect(move.y).toBeLessThan(upperY)
    expect(move.y).toBeGreaterThan(0)
    x = move.x
    y = move.y
    z = move.z

    moveZombieEscapeNavigationAgent(
      world,
      x,
      y,
      z,
      displacementX,
      displacementZ,
      world.agentRadius,
      move.connectorIndex,
      move.connectorTargetEnd,
      hit,
      move,
      -1,
      false,
      zombieRadius,
    )
    expect(move.connectorIndex).toBe(0)
    expect(move.y).toBeLessThanOrEqual(y)
    x = move.x
    y = move.y
    z = move.z

    let descended = false
    let exitedLower = false
    for (let step = 0; step < 128; step += 1) {
      const previousY = y
      moveZombieEscapeNavigationAgent(
        world,
        x,
        y,
        z,
        displacementX,
        displacementZ,
        world.agentRadius,
        move.connectorIndex,
        move.connectorTargetEnd,
        hit,
        move,
        -1,
        false,
        zombieRadius,
      )
      expect(move.y).toBeLessThanOrEqual(previousY + 1e-10)
      descended ||= move.y < previousY - 1e-10
      x = move.x
      y = move.y
      z = move.z
      if (move.connectorIndex < 0) {
        exitedLower = true
        break
      }
    }

    expect(descended).toBe(true)
    expect(exitedLower).toBe(true)
    expect(y).toBeCloseTo(connector.startY, 10)
  })

  test('carries every zombie radius beyond the shared upper-floor support clearance', () => {
    const upperY = 3
    const world = createZombieEscapeCollisionWorld({
      agentRadius: ZOMBIE_ESCAPE_ZOMBIE_MAXIMUM_COLLISION_RADIUS_METERS,
      boundaryPolicy: 'none',
      navigationConnectors: [
        {
          ascendingEnd: true,
          chainId: 'upper-clearance-stair',
          chainLowerY: 0,
          chainOrder: 0,
          chainUpperY: upperY,
          endX: -1,
          endY: upperY,
          endZ: 0,
          halfWidth: 0.6,
          id: 'upper-clearance-stair:flight',
          startX: -3,
          startY: 0,
          startZ: 0,
        },
      ],
      navigationSupports: [
        {
          boundary: true,
          elevation: 0,
          id: 'upper-clearance-ground',
          polygon: [
            { x: -6, z: -3 },
            { x: 6, z: -3 },
            { x: 6, z: 3 },
            { x: -6, z: 3 },
          ],
        },
        {
          elevation: upperY,
          id: 'upper-clearance-floor',
          polygon: [
            { x: -1, z: -2 },
            { x: 4, z: -2 },
            { x: 4, z: 2 },
            { x: -1, z: 2 },
          ],
        },
      ],
      playRadius: 8,
    })
    const hit = createZombieEscapeCollisionHit()
    const move = createZombieEscapeNavigationMoveResult()

    for (const zombie of ZOMBIE_ESCAPE_ZOMBIE_CATALOG) {
      let connectorIndex = 0
      let connectorTargetEnd = true
      let x = -3
      let y = 0
      let z = 0
      for (let step = 0; step < 128 && x < 0; step += 1) {
        moveZombieEscapeNavigationAgent(
          world,
          x,
          y,
          z,
          0.05,
          0,
          world.agentRadius,
          connectorIndex,
          connectorTargetEnd,
          hit,
          move,
          -1,
          false,
          zombie.capsule.radiusMeters,
        )
        x = move.x
        y = move.y
        z = move.z
        connectorIndex = move.connectorIndex
        connectorTargetEnd = move.connectorTargetEnd
      }

      expect(x, zombie.id).toBeGreaterThanOrEqual(0)
      expect(y, zombie.id).toBe(upperY)
      expect(connectorIndex, zombie.id).toBe(-1)
    }
  })

  test('preserves authored-ground admission through the legacy spawn API', () => {
    const world = createSparseSpawnAdmissionWorld(true)
    const state = createReadySparseSpawnAdmissionState(world)
    const graph = state.collisionWorld.navigationGraph
    const layerIndex = state.collisionWorld.navigationLayers.findIndex(
      ({ elevation }) => elevation === 0,
    )
    const expectedWitness = resolveSparseNavigationStrictRegionWitnessNode(
      graph.targetRegionIndex,
      layerIndex,
      3,
      1,
    )

    const slot = spawnZombieEscapeZombie(state, 3, 1, 97)

    expect(slot).toBe(0)
    expect(expectedWitness).toBeGreaterThanOrEqual(0)
    expect(state.zombies.pool.activeCount).toBe(1)
    expect(state.zombies.health[slot]).toBe(97)
    expect(state.zombies.y[slot]).toBe(0)
    expect(state.navigationSparseSpawnAnchorScratch).toMatchObject({
      elevation: 0,
      generation: state.navigationTargetCommittedRouteGeneration,
      layerIndex,
      reachable: true,
      witnessNode: expectedWitness,
    })
    expect(state.zombies.navigationWaypointNode[slot]).toBe(expectedWitness)
    expect(state.zombies.navigationIntentCommittedRouteGeneration[slot]).toBe(
      state.navigationTargetCommittedRouteGeneration,
    )
  })

  test('admits an upper-layer zombie with a current certified sparse anchor', () => {
    const world = createSparseSpawnAdmissionWorld(true)
    const state = createReadySparseSpawnAdmissionState(world)
    const graph = state.collisionWorld.navigationGraph
    const layerIndex = state.collisionWorld.navigationLayers.findIndex(
      ({ elevation }) => elevation === 3,
    )
    const expectedWitness = resolveSparseNavigationStrictRegionWitnessNode(
      graph.targetRegionIndex,
      layerIndex,
      1,
      1,
    )

    const slot = spawnZombieEscapeZombieAtNavigationElevation(state, 1, 1, 3, 103)

    expect(slot).toBe(0)
    expect(expectedWitness).toBeGreaterThanOrEqual(0)
    expect(state.zombies.pool.activeCount).toBe(1)
    expect(state.zombies.health[slot]).toBe(103)
    expect(state.zombies.y[slot]).toBe(3)
    expect(state.zombies.navigationSourceCertifiedY[slot]).toBe(3)
    expect(state.navigationSparseSpawnAnchorScratch).toMatchObject({
      elevation: 3,
      generation: state.navigationTargetCommittedRouteGeneration,
      layerIndex,
      reachable: true,
      witnessNode: expectedWitness,
    })
    expect(graph.layerIndices[expectedWitness]).toBe(layerIndex)
    expect(state.zombies.navigationWaypointNode[slot]).toBe(expectedWitness)
    expect(state.zombies.navigationIntentCommittedRouteGeneration[slot]).toBe(
      state.navigationTargetCommittedRouteGeneration,
    )
    expect(state.zombies.navigationIntentTargetRevision[slot]).toBe(
      state.navigationTargetRequestedRevision,
    )
  })

  test('rejects invalid, unsupported, and unreachable elevations without pool mutation', () => {
    const connectedState = createReadySparseSpawnAdmissionState(
      createSparseSpawnAdmissionWorld(true),
    )
    const connectedPoolBefore = inspectZombiePoolAdmissionState(connectedState)

    expect(spawnZombieEscapeZombieAtNavigationElevation(connectedState, 1, 1, NaN)).toBe(-1)
    expect(spawnZombieEscapeZombieAtNavigationElevation(connectedState, 1, 1, 1.5)).toBe(-1)
    expect(inspectZombiePoolAdmissionState(connectedState)).toEqual(connectedPoolBefore)

    const disconnectedState = createReadySparseSpawnAdmissionState(
      createSparseSpawnAdmissionWorld(false),
    )
    const disconnectedPoolBefore = inspectZombiePoolAdmissionState(disconnectedState)

    expect(spawnZombieEscapeZombieAtNavigationElevation(disconnectedState, 1, 1, 3)).toBe(-1)
    expect(inspectZombiePoolAdmissionState(disconnectedState)).toEqual(disconnectedPoolBefore)
  })

  test('reaches the parcel-11 player coordinate on its pinned floor and changes floor only by stair', () => {
    const player = { x: 22.61534685, z: 18.6765284 }
    const upperY = 2.56
    const world = createZombieEscapeCollisionWorld({
      agentRadius: AGENT_RADIUS,
      boundaryPolicy: 'none',
      navigationConnectors: [
        {
          ascendingEnd: true,
          chainId: 'parcel-11-stair',
          chainLowerY: 0,
          chainOrder: 0,
          chainUpperY: upperY,
          endX: 19,
          endY: upperY,
          endZ: player.z,
          halfWidth: 0.7,
          id: 'parcel-11-stair:flight',
          startX: 17,
          startY: 0,
          startZ: player.z,
        },
      ],
      navigationSupports: [
        {
          boundary: true,
          elevation: 0,
          id: 'parcel-11-ground',
          polygon: [
            { x: 14, z: 10 },
            { x: 30, z: 10 },
            { x: 30, z: 26 },
            { x: 14, z: 26 },
          ],
        },
        {
          elevation: upperY,
          id: 'parcel-11-upper',
          polygon: [
            { x: 18, z: 14 },
            { x: 27, z: 14 },
            { x: 27, z: 23 },
            { x: 18, z: 23 },
          ],
        },
      ],
      playRadius: 32,
    })
    const start = { x: 15, y: 0, z: player.z }

    const ground = traverseNavigation(world, start, { ...player, y: 0 })
    expect(ground.reached).toBe(true)
    expect(ground.y).toBe(0)
    expect(ground.connectorIds.size).toBe(0)

    const upper = traverseNavigation(world, start, { ...player, y: upperY })
    expect(upper.reached).toBe(true)
    expect(upper.y).toBeCloseTo(upperY, 5)
    expect(upper.connectorIds).toContain('parcel-11-stair:flight')
  })
})

function createSparseSpawnAdmissionWorld(connectUpper: boolean) {
  return createZombieEscapeCollisionWorld({
    agentRadius: ZOMBIE_ESCAPE_ZOMBIE_MAXIMUM_COLLISION_RADIUS_METERS,
    boundaryPolicy: 'none',
    navigationConnectors: connectUpper
      ? [
          {
            ascendingEnd: true,
            chainId: 'spawn-admission-stair',
            chainLowerY: 0,
            chainOrder: 0,
            chainUpperY: 3,
            endX: -1,
            endY: 3,
            endZ: 0,
            halfWidth: 0.7,
            id: 'spawn-admission-stair:flight',
            startX: -3,
            startY: 0,
            startZ: 0,
          },
        ]
      : [],
    navigationSupports: [
      {
        boundary: true,
        elevation: 0,
        id: 'spawn-admission-ground',
        polygon: [
          { x: -6, z: -6 },
          { x: 6, z: -6 },
          { x: 6, z: 6 },
          { x: -6, z: 6 },
        ],
      },
      {
        elevation: 3,
        id: 'spawn-admission-upper',
        polygon: [
          { x: -2, z: -2 },
          { x: 2, z: -2 },
          { x: 2, z: 2 },
          { x: -2, z: 2 },
        ],
      },
    ],
    playRadius: 8,
  })
}

function createReadySparseSpawnAdmissionState(world: ZombieEscapeCollisionWorld) {
  const arena = createZombieEscapeArena(0x51ca_1e5)
  arena.obstacleCount = 0
  const state = createZombieEscapeSimulation(arena, 0x51ca_1e5, [], {
    requireSparseNavigation: true,
  })
  setZombieEscapeExternalPlayerPose(state, true)
  setZombieEscapeCollisionWorld(state, world)
  setZombieEscapeGamePhase(state, 'night')
  state.waveSpawnRemaining = 0
  state.replacementSpawnRemaining = 0
  state.waveState = 'escape'
  state.player.x = 4
  state.player.y = 0
  state.player.z = 0
  const input = createZombieEscapeControlState()
  for (let tick = 0; tick < 4_096; tick += 1) {
    stepZombieEscapeSimulation(state, input, ZOMBIE_ESCAPE_SIMULATION.fixedDeltaSeconds, arena)
    if (
      state.navigationGoalInitialized &&
      state.navigationGoalResolvedTick === state.navigationIntentTick &&
      state.navigationField.graphSparseTargetUpdate.status === 'ready' &&
      state.navigationTargetCommittedRouteGeneration > 0
    ) {
      return state
    }
  }
  throw new Error('sparse spawn admission target did not publish')
}

function inspectZombiePoolAdmissionState(state: ReturnType<typeof createZombieEscapeSimulation>) {
  return {
    active: Array.from(state.zombies.pool.active),
    activeCount: state.zombies.pool.activeCount,
    cursor: state.zombies.pool.cursor,
    generation: Array.from(state.zombies.pool.generation),
    nextGeneration: state.zombies.pool.nextGeneration,
    nextZombieSpawnOrdinal: state.nextZombieSpawnOrdinal,
  }
}

function createBlockedStairWorld(playRadius: number) {
  return createZombieEscapeCollisionWorld({
    agentRadius: ZOMBIE_ESCAPE_ZOMBIE_MAXIMUM_COLLISION_RADIUS_METERS,
    boxes: [
      {
        breakable: true,
        centerX: -0.5,
        centerZ: 0,
        halfDepth: 0.95,
        halfWidth: 0.35,
        id: 'ground-table:footprint',
        maximumY: 0.8,
        minimumY: 0,
        navigationLayerY: 0,
        objectId: 'ground-table',
        rotation: 0,
      },
      {
        breakable: true,
        centerX: -0.5,
        centerZ: 0,
        halfDepth: 0.95,
        halfWidth: 0.35,
        id: 'upper-table:footprint',
        maximumY: 3.8,
        minimumY: 3,
        navigationLayerY: 3,
        objectId: 'upper-table',
        rotation: 0,
      },
    ],
    navigationConnectors: [
      {
        ascendingEnd: true,
        chainId: 'blocked-stair',
        chainLowerY: 0,
        chainOrder: 0,
        chainUpperY: 3,
        endX: 5,
        endY: 3,
        endZ: 0,
        halfWidth: 0.7,
        id: 'blocked-stair:flight',
        startX: 2,
        startY: 0,
        startZ: 0,
      },
    ],
    navigationSupports: [
      {
        elevation: 3,
        id: 'blocked-upper-floor',
        polygon: [
          { x: -playRadius, z: -3 },
          { x: playRadius, z: -3 },
          { x: playRadius, z: 3 },
          { x: -playRadius, z: 3 },
        ],
      },
    ],
    playRadius,
    segments: [
      {
        breakable: false,
        endX: 2.1,
        endZ: -1,
        halfThickness: 0.08,
        id: 'corridor:north',
        navigationLayerY: 0,
        startX: -7,
        startZ: -1,
      },
      {
        breakable: false,
        endX: 2.1,
        endZ: 1,
        halfThickness: 0.08,
        id: 'corridor:south',
        navigationLayerY: 0,
        startX: -7,
        startZ: 1,
      },
      {
        breakable: false,
        endX: -7,
        endZ: 1,
        halfThickness: 0.08,
        id: 'corridor:back',
        navigationLayerY: 0,
        startX: -7,
        startZ: -1,
      },
    ],
  })
}

function normalizeTestAngle(angle: number) {
  const fullTurn = Math.PI * 2
  return ((((angle + Math.PI) % fullTurn) + fullTurn) % fullTurn) - Math.PI
}

function createStraightSegments() {
  return [
    StairSegmentNode.parse({
      height: 2,
      id: 'sseg_layered_straight_0',
      length: 3,
      stepCount: 8,
      width: 1.4,
    }),
  ]
}

function createTurnedSegments(turnSide: 'left' | 'right') {
  return [
    StairSegmentNode.parse({
      height: 1,
      id: `sseg_layered_l_0_${turnSide}`,
      length: 2,
      stepCount: 5,
      width: 1.4,
    }),
    StairSegmentNode.parse({
      attachmentSide: turnSide,
      height: 0,
      id: `sseg_layered_l_1_${turnSide}`,
      length: 1.4,
      segmentType: 'landing',
      width: 1.4,
    }),
    StairSegmentNode.parse({
      attachmentSide: turnSide,
      height: 1,
      id: `sseg_layered_l_2_${turnSide}`,
      length: 2,
      stepCount: 5,
      width: 1.4,
    }),
  ]
}

function createUTurnSegments() {
  return [
    StairSegmentNode.parse({
      height: 1,
      id: 'sseg_layered_u_0',
      length: 2,
      stepCount: 5,
      width: 1.4,
    }),
    StairSegmentNode.parse({
      attachmentSide: 'left',
      height: 0,
      id: 'sseg_layered_u_1',
      length: 1.4,
      segmentType: 'landing',
      width: 1.4,
    }),
    StairSegmentNode.parse({
      attachmentSide: 'left',
      height: 0,
      id: 'sseg_layered_u_2',
      length: 1.4,
      segmentType: 'landing',
      width: 1.4,
    }),
    StairSegmentNode.parse({
      attachmentSide: 'left',
      height: 1,
      id: 'sseg_layered_u_3',
      length: 2,
      stepCount: 5,
      width: 1.4,
    }),
  ]
}

function createStairChainWorld(
  layout: string,
  segments: readonly ReturnType<typeof StairSegmentNode.parse>[],
) {
  const building = BuildingNode.parse({ id: `building_layered_${layout}` })
  const level = LevelNode.parse({
    id: `level_layered_${layout}`,
    level: 0,
    parentId: building.id,
  })
  const stair = StairNode.parse({
    children: segments.map(({ id }) => id),
    id: `stair_layered_${layout}`,
    parentId: level.id,
    stairType: 'straight',
  })
  const upperFloor = SlabNode.parse({
    elevation: segments.reduce(
      (rise, segment) => rise + (segment.segmentType === 'stair' ? segment.height : 0),
      0,
    ),
    id: `slab_layered_${layout}_upper`,
    parentId: level.id,
    polygon: [
      [-10, -10],
      [10, -10],
      [10, 10],
      [-10, 10],
    ],
  })
  const nodes = Object.fromEntries(
    [building, level, stair, upperFloor, ...segments].map((node) => [node.id, node]),
  ) as Record<string, AnyNode>
  return createLandrushZombieEscapeCollisionWorld({
    agentRadius: AGENT_RADIUS,
    nodes,
    playRadius: 12,
    spawn: { x: 0, z: 0 },
  })
}

function createArcStairWorld(
  stairType: 'curved' | 'spiral',
  stepCount: number,
  sweepAngle: number,
) {
  const building = BuildingNode.parse({ id: `building_layered_${stairType}` })
  const level = LevelNode.parse({
    id: `level_layered_${stairType}`,
    level: 0,
    parentId: building.id,
  })
  const stair = StairNode.parse({
    id: `stair_layered_${stairType}`,
    innerRadius: stairType === 'spiral' ? 0.55 : 1.1,
    parentId: level.id,
    stairType,
    stepCount,
    sweepAngle,
    totalRise: 2.4,
    width: 1.4,
  })
  const upperFloor = SlabNode.parse({
    elevation: 2.4,
    id: `slab_layered_${stairType}_upper`,
    parentId: level.id,
    polygon: [
      [-10, -10],
      [10, -10],
      [10, 10],
      [-10, 10],
    ],
  })
  const nodes = Object.fromEntries(
    [building, level, stair, upperFloor].map((node) => [node.id, node]),
  ) as Record<string, AnyNode>
  return createLandrushZombieEscapeCollisionWorld({
    agentRadius: AGENT_RADIUS,
    nodes,
    playRadius: 12,
    spawn: { x: 0, z: 0 },
  })
}

function traverseNavigation(
  world: ZombieEscapeCollisionWorld,
  start: Readonly<{ x: number; y: number; z: number }>,
  target: Readonly<{ x: number; y: number; z: number }>,
) {
  const field = createZombieEscapeFlowField(world)
  const sample = createFlowSample()
  const hit = createZombieEscapeCollisionHit()
  const move = createZombieEscapeNavigationMoveResult()
  const connectorIds = new Set<string>()
  let connectorIndex = -1
  let connectorTargetEnd = false
  let x = start.x
  let y = start.y
  let z = start.z
  updateZombieEscapeFlowTarget(field, target.x, target.z, target.y)

  for (let step = 0; step < 4_000; step += 1) {
    if (Math.hypot(target.x - x, target.z - z) < 0.45 && Math.abs(target.y - y) < 0.05) {
      return { connectorIds, reached: true, rebuildCount: field.rebuildCount, x, y, z }
    }
    const connector = world.navigationConnectors[connectorIndex]
    if (connector) {
      const directionAmount = connectorTargetEnd ? 1 : -1
      sample.reachable = true
      sample.x = connector.directionX * directionAmount
      sample.z = connector.directionZ * directionAmount
      connectorIds.add(connector.id)
    } else {
      resolveZombieEscapeFlowDirection(field, x, z, target.x, target.z, sample, hit, y)
    }
    if (!sample.reachable) break
    moveZombieEscapeNavigationAgent(
      world,
      x,
      y,
      z,
      sample.x * STEP_METERS,
      sample.z * STEP_METERS,
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
  }
  return { connectorIds, reached: false, rebuildCount: field.rebuildCount, x, y, z }
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
