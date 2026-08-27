import { resolveLandrushSemanticItemCollisionProfile } from '@landrush/runtime'
import {
  type AnyNode,
  computeStairSegmentChainTransforms,
  DEFAULT_WALL_HEIGHT,
  getFloorStackedPosition,
  getLevelElevations,
  isCurvedWall,
  isSplineFence,
  resolveStairTotalRise,
  sampleFenceCenterline,
  sampleWallCenterline,
} from '@pascal-app/core'
import {
  createLandrushZombieEscapeCollisionWorldCompilePayloadIntegrity,
  createLandrushZombieEscapeCollisionWorldsFromCompilePayload,
  type LandrushZombieEscapeCollisionWorldCompilePayload,
  type LandrushZombieEscapeCollisionWorlds,
} from './landrush-zombie-escape-collision-world-compiler'
import {
  createZombieEscapeCollisionWorld,
  ZOMBIE_ESCAPE_COLLISION_OBJECT_SEMANTIC_KIND,
  type ZombieEscapeCollisionBoxSource,
  type ZombieEscapeCollisionCircleSource,
  type ZombieEscapeCollisionObjectSemanticSource,
  type ZombieEscapeCollisionSegmentSource,
  type ZombieEscapeCollisionWorld,
  type ZombieEscapeNavigationConnectorSource,
  type ZombieEscapeNavigationSupportSource,
} from './zombie-escape-collision-world'

export {
  assertLandrushZombieEscapeCollisionWorldCompilePayloadIntegrity,
  createLandrushZombieEscapeCollisionWorldCompilePayloadIntegrity,
  createLandrushZombieEscapeCollisionWorldsFromCompilePayload,
  type LandrushZombieEscapeCollisionWorldCompilePayload,
  type LandrushZombieEscapeCollisionWorlds,
} from './landrush-zombie-escape-collision-world-compiler'

const MINIMUM_SOLID_WALL_RUN_METERS = 0.04
const MINIMUM_CENTERLINE_PIECE_METERS = 0.000_001
const WALL_CENTERLINE_SAMPLE_SEGMENTS = 32
const FENCE_CENTERLINE_SAMPLE_SEGMENTS = 64
const LANDRUSH_ISLAND_DOOR_OPERATION_PASSABLE_AMOUNT = 0.85
const LANDRUSH_ISLAND_DOOR_SWING_PASSABLE_RADIANS = Math.PI * 0.38

type LandrushIslandInteractiveDoorState = Readonly<{
  operationState?: number
  swingAngle?: number
}>

export function createLandrushIslandRuntimeDoorPassabilityKey(
  doors: Readonly<Record<string, LandrushIslandInteractiveDoorState>>,
) {
  return JSON.stringify(
    Object.entries(doors)
      .filter(([, value]) => value.operationState !== undefined || value.swingAngle !== undefined)
      .sort(([firstId], [secondId]) => firstId.localeCompare(secondId))
      .map(([id, value]) => [
        id,
        (value.operationState ?? 0) >= LANDRUSH_ISLAND_DOOR_OPERATION_PASSABLE_AMOUNT ||
          (value.swingAngle ?? 0) >= LANDRUSH_ISLAND_DOOR_SWING_PASSABLE_RADIANS,
      ]),
  )
}

export function resolveLandrushIslandRuntimeDoorPassabilityKey(key: string) {
  return Object.fromEntries(
    JSON.parse(key) as ReadonlyArray<readonly [string, boolean]>,
  ) as Readonly<Record<string, boolean>>
}

export function createLandrushZombieEscapeStableClosedDoorPassability(
  nodes: Record<string, AnyNode>,
) {
  return Object.fromEntries(
    Object.values(nodes)
      .filter(
        (node): node is LandrushCollisionDoor =>
          node.type === 'door' &&
          isSemanticCollisionNodeVisible(node, nodes) &&
          !isLandrushPermanentDoorOpening(node),
      )
      .sort((first, second) => first.id.localeCompare(second.id))
      .map((door) => [door.id, false]),
  ) as Readonly<Record<string, false>>
}

export function resolveLandrushZombieEscapeLiveOperableDoorIds(nodes: Record<string, AnyNode>) {
  return Object.values(nodes)
    .filter(
      (node): node is LandrushCollisionDoor =>
        node.type === 'door' && !isLandrushPermanentDoorOpening(node),
    )
    .map(({ id }) => id)
    .sort((first, second) => first.localeCompare(second))
}

export function resolveLandrushZombieEscapeRuntimePassableDoorIds(
  nodes: Record<string, AnyNode>,
  doorPassability: Readonly<Record<string, boolean>> = {},
) {
  return Object.values(nodes)
    .filter(
      (node): node is LandrushCollisionDoor =>
        node.type === 'door' &&
        isSemanticCollisionNodeVisible(node, nodes) &&
        !isLandrushPermanentDoorOpening(node) &&
        isDoorPassable(node, doorPassability),
    )
    .map(({ id }) => id)
    .sort((first, second) => first.localeCompare(second))
}

type LandrushCollisionNode = Extract<AnyNode, { type: 'fence' | 'wall' }>
type LandrushCollisionWall = Extract<AnyNode, { type: 'wall' }>
type LandrushCollisionDoor = Extract<AnyNode, { type: 'door' }>
type LandrushGroundLevel = Extract<AnyNode, { type: 'level' }>
type LandrushCollisionItem = Extract<AnyNode, { type: 'item' }>
type LandrushCollisionShelf = Extract<AnyNode, { type: 'shelf' }>
type LandrushCollisionColumn = Extract<AnyNode, { type: 'column' }>
type LandrushCollisionElevator = Extract<AnyNode, { type: 'elevator' }>
type LandrushCollisionStair = Extract<AnyNode, { type: 'stair' }>
type LandrushCollisionStairSegment = Extract<AnyNode, { type: 'stair-segment' }>
type LandrushCollisionSlab = Extract<AnyNode, { type: 'slab' }>

type LandrushZombieEscapeBuildingTransform = Readonly<{
  cosine: number
  rotation: number
  sine: number
  x: number
  y: number
  z: number
}>

type LandrushZombieEscapeCollisionIndex = Readonly<{
  doorsByWallId: ReadonlyMap<string, readonly LandrushCollisionDoor[]>
  levelBaseYById: ReadonlyMap<string, number>
  transformsByLevelId: Map<string, LandrushZombieEscapeBuildingTransform>
}>

type CenterlinePoint = Readonly<{ x: number; y: number }>
type LandrushZombieEscapeCollisionScope = 'combat' | 'navigation'

export type LandrushZombieEscapeCollisionWorldInput = {
  agentRadius: number
  circles?: readonly ZombieEscapeCollisionCircleSource[]
  doorPassability?: Readonly<Record<string, boolean>>
  nodes: Record<string, AnyNode>
  playRadius: number
  spawn: Readonly<{ x: number; z: number }>
  surfaceSupport?: LandrushZombieEscapeSurfaceNavigationSupport
  verticalOriginY?: number
}

export type LandrushZombieEscapeSurfaceNavigationSupport = ZombieEscapeNavigationSupportSource &
  Readonly<{
    boundary: true
    elevation: 0
  }>

export type LandrushZombieEscapeCollisionWorldCompilation = Readonly<{
  payload: LandrushZombieEscapeCollisionWorldCompilePayload
  payloadIntegrity: string
  signature: string
}>

export type LandrushIslandAiNavigationSnapshot = Readonly<{
  combatBoxes: readonly ZombieEscapeCollisionBoxSource[]
  navigationBoxes: readonly ZombieEscapeCollisionBoxSource[]
  navigationConnectors: readonly ZombieEscapeNavigationConnectorSource[]
  navigationSupports: readonly ZombieEscapeNavigationSupportSource[]
  objectSemantics: readonly ZombieEscapeCollisionObjectSemanticSource[]
  originX: number
  originZ: number
  segments: readonly ZombieEscapeCollisionSegmentSource[]
  semanticKey: string
  verticalOriginY: number
}>

export function createLandrushIslandAiNavigationSnapshot({
  doorPassability = {},
  nodes,
  spawn,
  surfaceSupport,
  verticalOriginY = 0,
}: Pick<
  LandrushZombieEscapeCollisionWorldInput,
  'doorPassability' | 'nodes' | 'spawn' | 'surfaceSupport' | 'verticalOriginY'
>): LandrushIslandAiNavigationSnapshot {
  const semanticKey = createLandrushZombieEscapeScopedCollisionSemanticsKey(
    nodes,
    doorPassability,
    surfaceSupport,
  )
  return createLandrushIslandAiNavigationSnapshotFromSemanticKey(
    { doorPassability, nodes, spawn, surfaceSupport, verticalOriginY },
    semanticKey,
  )
}

function createLandrushIslandAiNavigationSnapshotFromSemanticKey(
  {
    doorPassability = {},
    nodes,
    spawn,
    surfaceSupport,
    verticalOriginY = 0,
  }: Pick<
    LandrushZombieEscapeCollisionWorldInput,
    'doorPassability' | 'nodes' | 'spawn' | 'surfaceSupport' | 'verticalOriginY'
  >,
  semanticKey: string,
): LandrushIslandAiNavigationSnapshot {
  const authoredNavigationSupports = createLandrushZombieEscapeNavigationSupports(
    nodes,
    spawn,
    verticalOriginY,
  )
  const combatBoxes = createLandrushZombieEscapeCollisionBoxesForScope(
    nodes,
    spawn,
    verticalOriginY,
    'combat',
  )
  const navigationBoxes = createLandrushZombieEscapeCollisionBoxesForScope(
    nodes,
    spawn,
    verticalOriginY,
    'navigation',
  )
  const navigationConnectors = createLandrushZombieEscapeNavigationConnectors(
    nodes,
    spawn,
    verticalOriginY,
  )
  const segments = createLandrushZombieEscapeCollisionSegmentsForScope(
    nodes,
    spawn,
    doorPassability,
    verticalOriginY,
  )
  return {
    combatBoxes,
    navigationBoxes,
    navigationConnectors,
    navigationSupports: surfaceSupport
      ? [surfaceSupport, ...authoredNavigationSupports]
      : authoredNavigationSupports,
    objectSemantics: createLandrushZombieEscapeCollisionObjectSemantics(
      nodes,
      combatBoxes,
      navigationBoxes,
      segments,
      navigationConnectors,
    ),
    originX: spawn.x,
    originZ: spawn.z,
    segments,
    semanticKey,
    verticalOriginY,
  }
}

function createLandrushZombieEscapeCollisionObjectSemantics(
  nodes: Record<string, AnyNode>,
  ...sources: readonly (readonly Readonly<{ id: string; objectId?: string }>[])[]
) {
  const objectIds = new Set<string>()
  for (const source of sources) {
    for (const candidate of source) objectIds.add(candidate.objectId ?? candidate.id)
  }
  return [...objectIds]
    .sort((first, second) => first.localeCompare(second))
    .map((objectId): ZombieEscapeCollisionObjectSemanticSource => {
      const type = nodes[objectId]?.type
      const semanticKind =
        type === 'door'
          ? ZOMBIE_ESCAPE_COLLISION_OBJECT_SEMANTIC_KIND.door
          : type === 'item' || type === 'shelf'
            ? ZOMBIE_ESCAPE_COLLISION_OBJECT_SEMANTIC_KIND.furniture
            : ZOMBIE_ESCAPE_COLLISION_OBJECT_SEMANTIC_KIND.other
      return { objectId, semanticKind }
    })
}

function appendLandrushZombieEscapeCollisionObjectSemantics(
  objectSemantics: readonly ZombieEscapeCollisionObjectSemanticSource[],
  sources: readonly Readonly<{ id: string; objectId?: string }>[],
) {
  const semanticKindsByObjectId = new Map(
    objectSemantics.map(({ objectId, semanticKind }) => [objectId, semanticKind]),
  )
  for (const source of sources) {
    const objectId = source.objectId ?? source.id
    if (!semanticKindsByObjectId.has(objectId)) {
      semanticKindsByObjectId.set(objectId, ZOMBIE_ESCAPE_COLLISION_OBJECT_SEMANTIC_KIND.other)
    }
  }
  return [...semanticKindsByObjectId]
    .sort(([firstId], [secondId]) => firstId.localeCompare(secondId))
    .map(([objectId, semanticKind]) => ({ objectId, semanticKind }))
}

export function createLandrushZombieEscapeCollisionWorldCompilation(
  input: LandrushZombieEscapeCollisionWorldInput,
): LandrushZombieEscapeCollisionWorldCompilation {
  const semanticKey = createLandrushZombieEscapeScopedCollisionSemanticsKey(
    input.nodes,
    input.doorPassability ?? {},
    input.surfaceSupport,
  )
  const signature = createLandrushZombieEscapeCollisionWorldSignatureFromSemanticKey(
    input,
    semanticKey,
  )
  const snapshot = createLandrushIslandAiNavigationSnapshotFromSemanticKey(input, semanticKey)
  const payload = createLandrushZombieEscapeCollisionWorldCompilePayload(input, snapshot)
  return {
    payload,
    payloadIntegrity: createLandrushZombieEscapeCollisionWorldCompilePayloadIntegrity(
      payload,
      signature,
    ),
    signature,
  }
}

function createLandrushZombieEscapeCollisionWorldCompilePayload(
  { agentRadius, circles = [], playRadius }: LandrushZombieEscapeCollisionWorldInput,
  snapshot: LandrushIslandAiNavigationSnapshot,
): LandrushZombieEscapeCollisionWorldCompilePayload {
  return {
    agentRadius,
    circles,
    combatBoxes: snapshot.combatBoxes,
    navigationBoxes: snapshot.navigationBoxes,
    navigationConnectors: snapshot.navigationConnectors,
    navigationSupports: snapshot.navigationSupports,
    objectSemantics: appendLandrushZombieEscapeCollisionObjectSemantics(
      snapshot.objectSemantics,
      circles,
    ),
    playRadius,
    segments: snapshot.segments,
  }
}

export function createLandrushZombieEscapeCollisionWorld({
  agentRadius,
  circles = [],
  doorPassability = {},
  nodes,
  playRadius,
  spawn,
  surfaceSupport,
  verticalOriginY = 0,
}: LandrushZombieEscapeCollisionWorldInput) {
  return createLandrushZombieEscapeScopedCollisionWorld(
    {
      agentRadius,
      circles,
      doorPassability,
      nodes,
      playRadius,
      spawn,
      surfaceSupport,
      verticalOriginY,
    },
    'navigation',
  )
}

export function createLandrushZombieEscapeCombatCollisionWorld(
  input: LandrushZombieEscapeCollisionWorldInput,
) {
  return createLandrushZombieEscapeScopedCollisionWorld(input, 'combat')
}

function createLandrushZombieEscapeScopedCollisionWorld(
  {
    agentRadius,
    circles = [],
    doorPassability = {},
    nodes,
    playRadius,
    spawn,
    surfaceSupport,
    verticalOriginY = 0,
  }: LandrushZombieEscapeCollisionWorldInput,
  scope: LandrushZombieEscapeCollisionScope,
) {
  const snapshot = createLandrushIslandAiNavigationSnapshot({
    doorPassability,
    nodes,
    spawn,
    surfaceSupport,
    verticalOriginY,
  })
  return createLandrushZombieEscapeScopedCollisionWorldFromSnapshot(
    { agentRadius, circles, playRadius },
    snapshot,
    scope,
  )
}

function createLandrushZombieEscapeScopedCollisionWorldFromSnapshot(
  {
    agentRadius,
    circles = [],
    playRadius,
  }: Pick<LandrushZombieEscapeCollisionWorldInput, 'agentRadius' | 'circles' | 'playRadius'>,
  snapshot: LandrushIslandAiNavigationSnapshot,
  scope: LandrushZombieEscapeCollisionScope,
) {
  const hasNavigationBoundarySupport = snapshot.navigationSupports.some(
    (support) => support.boundary === true,
  )
  return createZombieEscapeCollisionWorld({
    agentRadius,
    boundaryPolicy: scope === 'combat' || hasNavigationBoundarySupport ? 'none' : 'solid',
    boxes: scope === 'combat' ? snapshot.combatBoxes : snapshot.navigationBoxes,
    cellSize: scope === 'combat' ? Math.max(1, playRadius * 2) : undefined,
    circles,
    navigationConnectors: scope === 'navigation' ? snapshot.navigationConnectors : [],
    navigationSupports: scope === 'navigation' ? snapshot.navigationSupports : [],
    objectSemantics: appendLandrushZombieEscapeCollisionObjectSemantics(
      snapshot.objectSemantics,
      circles,
    ),
    playRadius,
    segments: snapshot.segments,
  })
}

export function createLandrushZombieEscapeCollisionWorldResolver(
  createWorld: (
    input: LandrushZombieEscapeCollisionWorldInput,
  ) => ZombieEscapeCollisionWorld = createLandrushZombieEscapeCollisionWorld,
) {
  let cachedSignature: string | null = null
  let cachedWorld: ZombieEscapeCollisionWorld | null = null

  return (input: LandrushZombieEscapeCollisionWorldInput) => {
    const signature = createLandrushZombieEscapeCollisionWorldSignature(input)
    if (cachedWorld && signature === cachedSignature) return cachedWorld

    const nextWorld = createWorld(input)
    cachedSignature = signature
    cachedWorld = nextWorld
    return nextWorld
  }
}

export function createLandrushZombieEscapeCollisionWorldsResolver() {
  let cachedSignature: string | null = null
  let cachedWorlds: LandrushZombieEscapeCollisionWorlds | null = null

  return (input: LandrushZombieEscapeCollisionWorldInput) => {
    const semanticKey = createLandrushZombieEscapeScopedCollisionSemanticsKey(
      input.nodes,
      input.doorPassability ?? {},
      input.surfaceSupport,
    )
    const signature = createLandrushZombieEscapeCollisionWorldSignatureFromSemanticKey(
      input,
      semanticKey,
    )
    if (cachedWorlds && signature === cachedSignature) return cachedWorlds
    const snapshot = createLandrushIslandAiNavigationSnapshotFromSemanticKey(input, semanticKey)
    const payload = createLandrushZombieEscapeCollisionWorldCompilePayload(input, snapshot)
    const nextWorlds = createLandrushZombieEscapeCollisionWorldsFromCompilePayload(payload)
    cachedSignature = signature
    cachedWorlds = nextWorlds
    return nextWorlds
  }
}

function createLandrushZombieEscapeScopedCollisionWorldResolver(
  createWorld: (input: LandrushZombieEscapeCollisionWorldInput) => ZombieEscapeCollisionWorld,
) {
  let cachedSignature: string | null = null
  let cachedWorld: ZombieEscapeCollisionWorld | null = null
  return (input: LandrushZombieEscapeCollisionWorldInput) => {
    const signature = createLandrushZombieEscapeCollisionWorldSignature(input)
    if (cachedWorld && signature === cachedSignature) return cachedWorld
    const nextWorld = createWorld(input)
    cachedSignature = signature
    cachedWorld = nextWorld
    return nextWorld
  }
}

export function createLandrushZombieEscapeCollisionSemanticsKey(
  nodes: Record<string, AnyNode>,
  doorPassability: Readonly<Record<string, boolean>> = {},
) {
  return createLandrushZombieEscapeScopedCollisionSemanticsKey(nodes, doorPassability)
}

export function createLandrushZombieEscapeCombatCollisionSemanticsKey(
  nodes: Record<string, AnyNode>,
  doorPassability: Readonly<Record<string, boolean>> = {},
) {
  return createLandrushZombieEscapeScopedCollisionSemanticsKey(nodes, doorPassability)
}

function createLandrushZombieEscapeScopedCollisionSemanticsKey(
  nodes: Record<string, AnyNode>,
  doorPassability: Readonly<Record<string, boolean>>,
  surfaceSupport?: LandrushZombieEscapeSurfaceNavigationSupport,
) {
  const collisionNodes: LandrushCollisionNode[] = []
  const collisionWallIds = new Set<string>()
  const childWallIdsByDoorId = new Map<string, string[]>()
  const doorNodes: LandrushCollisionDoor[] = []
  const levelIds = new Set<string>()
  const itemNodes: LandrushCollisionItem[] = []
  const shelfNodes: LandrushCollisionShelf[] = []
  const columnNodes: LandrushCollisionColumn[] = []
  const elevatorNodes: LandrushCollisionElevator[] = []
  const stairNodes: LandrushCollisionStair[] = []
  const slabNodes: LandrushCollisionSlab[] = []

  for (const node of Object.values(nodes)) {
    if (node.type === 'door' && isSemanticCollisionNodeVisible(node, nodes)) doorNodes.push(node)
    if (isItemCollisionNode(node, nodes)) {
      itemNodes.push(node)
      if (node.parentId) levelIds.add(node.parentId)
    }
    if (isShelfCollisionNode(node, nodes)) {
      shelfNodes.push(node)
      if (node.parentId) levelIds.add(node.parentId)
    }
    if (isColumnCollisionNode(node, nodes)) {
      columnNodes.push(node)
      if (node.parentId) levelIds.add(node.parentId)
    }
    if (isElevatorCollisionNode(node, nodes)) elevatorNodes.push(node)
    if (isStairCollisionNode(node, nodes)) {
      stairNodes.push(node)
      if (node.parentId) levelIds.add(node.parentId)
    }
    if (isSlabNavigationSupportNode(node, nodes)) {
      slabNodes.push(node)
      if (node.parentId) levelIds.add(node.parentId)
    }
    if (!isCollisionNode(node, nodes)) continue
    const levelId = node.parentId
    if (!levelId) continue
    collisionNodes.push(node)
    levelIds.add(levelId)
    if (node.type !== 'wall') continue
    collisionWallIds.add(node.id)
    for (const childId of node.children ?? []) {
      if (nodes[childId]?.type !== 'door') continue
      const wallIds = childWallIdsByDoorId.get(childId)
      if (wallIds) wallIds.push(node.id)
      else childWallIdsByDoorId.set(childId, [node.id])
    }
  }

  const entries: unknown[][] = []
  const levelElevations = getLevelElevations(nodes)
  const buildingIds = new Set<string>()
  for (const levelId of levelIds) {
    const level = nodes[levelId]
    if (level?.type !== 'level') continue
    entries.push([
      'level',
      level.id,
      level.parentId,
      levelElevations.get(level.id)?.baseY ?? level.baseElevation,
      level.visible !== false,
    ])
    if (level.parentId && nodes[level.parentId]?.type === 'building') {
      buildingIds.add(level.parentId)
    }
  }
  for (const buildingId of buildingIds) {
    const building = nodes[buildingId]
    if (building?.type !== 'building') continue
    entries.push([
      'building',
      building.id,
      building.position[0],
      building.position[1],
      building.position[2],
      building.rotation[1],
      building.visible !== false,
    ])
  }
  for (const node of collisionNodes) {
    const level = node.parentId ? nodes[node.parentId] : undefined
    if (level?.type !== 'level') continue
    if (node.type === 'wall') {
      entries.push([
        'wall',
        node.id,
        node.parentId,
        node.start,
        node.end,
        node.curveOffset ?? 0,
        node.thickness ?? 0.18,
        node.height ?? level.height ?? DEFAULT_WALL_HEIGHT,
        node.supportOffset ?? 0,
      ])
      continue
    }
    entries.push([
      'fence',
      node.id,
      node.parentId,
      node.start,
      node.end,
      node.path ?? null,
      node.tangents ?? null,
      node.curveOffset ?? 0,
      node.thickness ?? 0.12,
      node.height,
      node.supportOffset ?? 0,
    ])
  }
  for (const node of itemNodes) {
    const stackedPosition = getFloorStackedPosition({ node, nodes, position: node.position })
    entries.push([
      'item',
      node.id,
      node.parentId,
      node.position,
      node.rotation,
      node.scale,
      node.asset.dimensions,
      node.asset.surface?.height ?? null,
      resolveItemCollisionProfile(node)?.shape ?? null,
      stackedPosition[1],
    ])
  }
  for (const node of shelfNodes) {
    const stackedPosition = getFloorStackedPosition({ node, nodes, position: node.position })
    entries.push([
      'shelf',
      node.id,
      node.parentId,
      node.position,
      node.rotation,
      node.width,
      node.depth,
      node.height,
      node.thickness,
      stackedPosition[1],
    ])
  }
  for (const node of columnNodes) {
    const stackedPosition = getFloorStackedPosition({ node, nodes, position: node.position })
    entries.push([
      'column',
      node.id,
      node.parentId,
      node.position,
      node.rotation,
      node.crossSection,
      node.width,
      node.depth,
      node.radius,
      node.height,
      node.baseWidthScale,
      node.baseDepthScale,
      node.capitalWidthScale,
      node.capitalDepthScale,
      node.supportStyle,
      node.braceBottomSpread,
      node.braceTopSpread,
      stackedPosition[1],
    ])
  }
  for (const node of elevatorNodes) {
    const building = node.parentId ? nodes[node.parentId] : undefined
    entries.push([
      'elevator',
      node.id,
      node.parentId,
      node.position,
      node.rotation,
      node.width,
      node.depth,
      node.shaftWidth ?? null,
      node.shaftDepth ?? null,
      node.cabHeight,
      building?.type === 'building' ? building.position : null,
      building?.type === 'building' ? building.rotation : null,
      Object.values(nodes)
        .filter(
          (candidate): candidate is LandrushGroundLevel =>
            candidate.type === 'level' && candidate.parentId === node.parentId,
        )
        .map((level) => [
          level.id,
          level.visible !== false,
          levelElevations.get(level.id)?.baseY ?? level.baseElevation,
          level.height ?? DEFAULT_WALL_HEIGHT,
        ])
        .sort(compareCollisionSemanticEntries),
    ])
  }
  for (const stair of stairNodes) {
    const level = stair.parentId ? nodes[stair.parentId] : undefined
    const visualPosition = getFloorStackedPosition({
      levelId: level?.type === 'level' ? level.id : null,
      node: stair,
      nodes,
      position: stair.position,
      rotation: stair.rotation,
    })
    entries.push([
      'stair',
      stair.id,
      stair.parentId,
      stair.position,
      stair.rotation,
      stair.stairType,
      stair.width,
      stair.totalRise ?? null,
      stair.stepCount,
      stair.thickness,
      stair.fillToFloor,
      stair.innerRadius,
      stair.sweepAngle,
      stair.showCenterColumn,
      stair.children,
      visualPosition[1],
      resolveStairTotalRise(stair, nodes),
    ])
    for (const childId of stair.children) {
      const segment = nodes[childId]
      if (segment?.type !== 'stair-segment') continue
      entries.push([
        'stair-segment',
        segment.id,
        stair.id,
        segment.visible,
        segment.segmentType,
        segment.width,
        segment.length,
        segment.height,
        segment.stepCount,
        segment.attachmentSide,
        segment.fillToFloor,
        segment.thickness,
      ])
    }
  }
  for (const slab of slabNodes) {
    entries.push([
      'slab-support',
      slab.id,
      slab.parentId,
      slab.polygon,
      slab.holes,
      slab.elevation,
      slab.recessed,
    ])
  }
  for (const node of doorNodes) {
    const attachedWallIds = new Set(childWallIdsByDoorId.get(node.id) ?? [])
    if (node.wallId && collisionWallIds.has(node.wallId)) attachedWallIds.add(node.wallId)
    if (node.parentId && collisionWallIds.has(node.parentId)) attachedWallIds.add(node.parentId)
    if (attachedWallIds.size === 0) continue
    entries.push([
      'door',
      node.id,
      [...attachedWallIds].sort(),
      node.position[0],
      node.width,
      isDoorPassable(node, doorPassability),
    ])
  }
  if (surfaceSupport) {
    entries.push([
      'surface-support',
      surfaceSupport.id,
      surfaceSupport.boundary,
      surfaceSupport.elevation,
      surfaceSupport.polygon.map(({ x, z }) => [x, z]),
      (surfaceSupport.holes ?? []).map((hole) => hole.map(({ x, z }) => [x, z])),
    ])
  }

  entries.sort(compareCollisionSemanticEntries)
  return JSON.stringify(entries)
}

export function createLandrushZombieEscapeCollisionWorldSignature({
  agentRadius,
  circles = [],
  doorPassability = {},
  nodes,
  playRadius,
  spawn,
  surfaceSupport,
  verticalOriginY = 0,
}: LandrushZombieEscapeCollisionWorldInput) {
  return createLandrushZombieEscapeCollisionWorldSignatureFromSemanticKey(
    {
      agentRadius,
      circles,
      doorPassability,
      nodes,
      playRadius,
      spawn,
      surfaceSupport,
      verticalOriginY,
    },
    createLandrushZombieEscapeScopedCollisionSemanticsKey(nodes, doorPassability, surfaceSupport),
  )
}

function createLandrushZombieEscapeCollisionWorldSignatureFromSemanticKey(
  {
    agentRadius,
    circles = [],
    playRadius,
    spawn,
    verticalOriginY = 0,
  }: LandrushZombieEscapeCollisionWorldInput,
  semanticKey: string,
) {
  const circleSemantics = circles
    .map(({ breakable, id, maximumY, minimumY, navigationLayerY, objectId, radius, x, z }) => [
      id,
      objectId ?? id,
      breakable === true,
      x,
      z,
      radius,
      minimumY ?? null,
      maximumY ?? null,
      navigationLayerY ?? 0,
    ])
    .sort(compareCollisionSemanticEntries)
  return JSON.stringify([
    agentRadius,
    playRadius,
    spawn.x,
    spawn.z,
    verticalOriginY,
    circleSemantics,
    semanticKey,
  ])
}

export function createLandrushZombieEscapeCollisionBoxes(
  nodes: Record<string, AnyNode>,
  spawn: Readonly<{ x: number; z: number }>,
  verticalOriginY = 0,
) {
  return createLandrushZombieEscapeCollisionBoxesForScope(
    nodes,
    spawn,
    verticalOriginY,
    'navigation',
  )
}

export function createLandrushZombieEscapeCombatCollisionBoxes(
  nodes: Record<string, AnyNode>,
  spawn: Readonly<{ x: number; z: number }>,
  verticalOriginY = 0,
) {
  return createLandrushZombieEscapeCollisionBoxesForScope(nodes, spawn, verticalOriginY, 'combat')
}

function createLandrushZombieEscapeCollisionBoxesForScope(
  nodes: Record<string, AnyNode>,
  spawn: Readonly<{ x: number; z: number }>,
  verticalOriginY: number,
  scope: LandrushZombieEscapeCollisionScope,
) {
  const boxes: ZombieEscapeCollisionBoxSource[] = []
  const nodesInStableOrder = Object.values(nodes).sort((first, second) =>
    first.id.localeCompare(second.id),
  )
  const collisionIndex = createCollisionIndex(nodesInStableOrder, nodes)
  for (const node of nodesInStableOrder) {
    if (isItemCollisionNode(node, nodes)) {
      appendItemCollisionBox(boxes, node, nodes, collisionIndex, spawn, verticalOriginY)
      continue
    }
    if (isShelfCollisionNode(node, nodes)) {
      appendShelfCollisionBox(boxes, node, nodes, collisionIndex, spawn, verticalOriginY)
      continue
    }
    if (isColumnCollisionNode(node, nodes)) {
      appendColumnCollisionBox(boxes, node, nodes, collisionIndex, spawn, verticalOriginY)
      continue
    }
    if (isElevatorCollisionNode(node, nodes)) {
      appendElevatorCollisionBoxes(boxes, node, nodes, collisionIndex, spawn, verticalOriginY)
      continue
    }
    if (isStairCollisionNode(node, nodes) && scope === 'combat') {
      appendStairCollisionBoxes(boxes, node, nodes, collisionIndex, spawn, verticalOriginY)
    }
  }
  return boxes
}

export function createLandrushZombieEscapeNavigationSupports(
  nodes: Record<string, AnyNode>,
  spawn: Readonly<{ x: number; z: number }>,
  verticalOriginY = 0,
) {
  const supports: ZombieEscapeNavigationSupportSource[] = []
  const nodesInStableOrder = Object.values(nodes).sort((first, second) =>
    first.id.localeCompare(second.id),
  )
  const collisionIndex = createCollisionIndex(nodesInStableOrder, nodes)
  for (const node of nodesInStableOrder) {
    if (!isSlabNavigationSupportNode(node, nodes)) continue
    const level = nodes[node.parentId!]
    if (level?.type !== 'level') continue
    const buildingTransform = resolveBuildingTransform(level, nodes, collisionIndex)
    const transformRing = (ring: readonly (readonly [number, number])[]) =>
      ring.map(([x, z]) => {
        const [worldX, worldZ] = transformLevelPoint(x, z, buildingTransform)
        return { x: worldX - spawn.x, z: worldZ - spawn.z }
      })
    supports.push({
      elevation:
        buildingTransform.y +
        resolveLevelBaseY(level, collisionIndex) +
        node.elevation -
        verticalOriginY,
      holes: node.holes.map(transformRing),
      id: node.id,
      polygon: transformRing(node.polygon),
    })
  }
  return supports
}

export function createLandrushZombieEscapeNavigationConnectors(
  nodes: Record<string, AnyNode>,
  spawn: Readonly<{ x: number; z: number }>,
  verticalOriginY = 0,
) {
  const connectors: ZombieEscapeNavigationConnectorSource[] = []
  const nodesInStableOrder = Object.values(nodes).sort((first, second) =>
    first.id.localeCompare(second.id),
  )
  const collisionIndex = createCollisionIndex(nodesInStableOrder, nodes)
  for (const node of nodesInStableOrder) {
    if (!isStairCollisionNode(node, nodes)) continue
    if (node.stairType === 'straight') {
      appendStraightStairNavigationConnectors(
        connectors,
        node,
        nodes,
        collisionIndex,
        spawn,
        verticalOriginY,
      )
    } else {
      appendArcStairNavigationConnectors(
        connectors,
        node,
        nodes,
        collisionIndex,
        spawn,
        verticalOriginY,
      )
    }
  }
  return connectors
}

function appendArcStairNavigationConnectors(
  connectors: ZombieEscapeNavigationConnectorSource[],
  stair: LandrushCollisionStair,
  nodes: Record<string, AnyNode>,
  collisionIndex: LandrushZombieEscapeCollisionIndex,
  spawn: Readonly<{ x: number; z: number }>,
  verticalOriginY: number,
) {
  const level = stair.parentId ? nodes[stair.parentId] : undefined
  if (level?.type !== 'level') return
  const buildingTransform = resolveBuildingTransform(level, nodes, collisionIndex)
  const visualPosition = getFloorStackedPosition({
    levelId: level.id,
    node: stair,
    nodes,
    position: stair.position,
    rotation: stair.rotation,
  })
  const rootY =
    buildingTransform.y +
    resolveLevelBaseY(level, collisionIndex) +
    visualPosition[1] -
    verticalOriginY
  const isSpiral = stair.stairType === 'spiral'
  const stepCount = Math.max(2, Math.round(stair.stepCount))
  const totalRise = Math.max(0.1, resolveStairTotalRise(stair, nodes))
  const stepHeight = totalRise / stepCount
  const thickness = Math.max(0.02, stair.thickness)
  const innerRadius = Math.max(isSpiral ? 0.05 : 0.2, stair.innerRadius)
  const width = Math.max(0.4, stair.width)
  const centerRadius = innerRadius + width / 2
  const sweepAngle = stair.sweepAngle
  const stepSweep = sweepAngle / stepCount
  const chainLowerY = rootY
  const chainUpperY = rootY + totalRise
  const waypoints: Array<{ id: string; x: number; y: number; z: number }> = []
  const appendWaypoint = (id: string, angle: number, y: number) => {
    const [stairOffsetX, stairOffsetZ] = rotateSceneVector(
      Math.cos(angle) * centerRadius,
      Math.sin(angle) * centerRadius,
      stair.rotation,
    )
    const [worldX, worldZ] = transformLevelPoint(
      visualPosition[0] + stairOffsetX,
      visualPosition[2] + stairOffsetZ,
      buildingTransform,
    )
    waypoints.push({ id, x: worldX - spawn.x, y, z: worldZ - spawn.z })
  }

  appendWaypoint('entry', -sweepAngle / 2, chainLowerY)
  for (let stepIndex = 0; stepIndex < stepCount; stepIndex += 1) {
    const midAngle = -sweepAngle / 2 + stepSweep * (stepIndex + 0.5)
    const authoredStepTopY = isSpiral
      ? rootY + stepHeight * stepIndex + thickness
      : rootY + stepHeight * (stepIndex + 1)
    appendWaypoint(`step:${String(stepIndex)}`, midAngle, Math.min(chainUpperY, authoredStepTopY))
  }
  appendWaypoint('exit', sweepAngle / 2, chainUpperY)

  for (let chainOrder = 0; chainOrder < waypoints.length - 1; chainOrder += 1) {
    const start = waypoints[chainOrder]!
    const end = waypoints[chainOrder + 1]!
    if (Math.hypot(end.x - start.x, end.z - start.z) <= MINIMUM_CENTERLINE_PIECE_METERS) {
      continue
    }
    connectors.push({
      ascendingEnd: true,
      chainId: stair.id,
      chainLowerY,
      chainOrder,
      chainUpperY,
      endX: end.x,
      endY: end.y,
      endZ: end.z,
      halfWidth: width / 2,
      id: `${stair.id}:${start.id}:${end.id}:navigation-connector`,
      objectId: stair.id,
      startX: start.x,
      startY: start.y,
      startZ: start.z,
    })
  }
}

function appendStraightStairNavigationConnectors(
  connectors: ZombieEscapeNavigationConnectorSource[],
  stair: LandrushCollisionStair,
  nodes: Record<string, AnyNode>,
  collisionIndex: LandrushZombieEscapeCollisionIndex,
  spawn: Readonly<{ x: number; z: number }>,
  verticalOriginY: number,
) {
  const level = stair.parentId ? nodes[stair.parentId] : undefined
  if (level?.type !== 'level') return
  const buildingTransform = resolveBuildingTransform(level, nodes, collisionIndex)
  const visualPosition = getFloorStackedPosition({
    levelId: level.id,
    node: stair,
    nodes,
    position: stair.position,
    rotation: stair.rotation,
  })
  const rootY =
    buildingTransform.y +
    resolveLevelBaseY(level, collisionIndex) +
    visualPosition[1] -
    verticalOriginY
  const segments = stair.children
    .map((childId) => nodes[childId])
    .filter(
      (node): node is LandrushCollisionStairSegment =>
        node?.type === 'stair-segment' && node.visible !== false,
    )
  const transforms = computeStairSegmentChainTransforms(segments)
  const chainLowerY = rootY
  const chainUpperY =
    rootY +
    segments.reduce(
      (rise, segment) => rise + (segment.segmentType === 'stair' ? Math.max(0, segment.height) : 0),
      0,
    )
  const segmentConnectors: Array<
    Omit<ZombieEscapeNavigationConnectorSource, 'chainId' | 'chainOrder'>
  > = []
  for (let segmentIndex = 0; segmentIndex < segments.length; segmentIndex += 1) {
    const segment = segments[segmentIndex]!
    const transform = transforms[segmentIndex]!
    const [segmentEndX, segmentEndZ] = rotateSceneVector(
      0,
      Math.max(0.01, segment.length),
      transform.rotation,
    )
    const [stairStartX, stairStartZ] = rotateSceneVector(
      transform.position[0],
      transform.position[2],
      stair.rotation,
    )
    const [stairEndX, stairEndZ] = rotateSceneVector(
      transform.position[0] + segmentEndX,
      transform.position[2] + segmentEndZ,
      stair.rotation,
    )
    const [startX, startZ] = transformLevelPoint(
      visualPosition[0] + stairStartX,
      visualPosition[2] + stairStartZ,
      buildingTransform,
    )
    const [endX, endZ] = transformLevelPoint(
      visualPosition[0] + stairEndX,
      visualPosition[2] + stairEndZ,
      buildingTransform,
    )
    const startY = rootY + transform.position[1]
    const rise = segment.segmentType === 'stair' ? Math.max(0, segment.height) : 0
    segmentConnectors.push({
      ascendingEnd: true,
      chainLowerY,
      chainUpperY,
      endX: endX - spawn.x,
      endY: startY + rise,
      endZ: endZ - spawn.z,
      halfWidth: Math.max(0.01, segment.width) / 2,
      id: `${stair.id}:${segment.id}:navigation-connector`,
      objectId: stair.id,
      startX: startX - spawn.x,
      startY,
      startZ: startZ - spawn.z,
    })
  }
  const orderedConnectors: Array<
    Omit<ZombieEscapeNavigationConnectorSource, 'chainId' | 'chainOrder'>
  > = []
  for (let index = 0; index < segmentConnectors.length; index += 1) {
    const connector = segmentConnectors[index]!
    const previous = segmentConnectors[index - 1]
    const previousSegment = segments[index - 1]
    const segment = segments[index]!
    if (previous && previousSegment) {
      const junctionLength = Math.hypot(
        connector.startX - previous.endX,
        connector.startZ - previous.endZ,
      )
      if (junctionLength > MINIMUM_CENTERLINE_PIECE_METERS) {
        orderedConnectors.push({
          ascendingEnd: true,
          chainLowerY,
          chainUpperY,
          endX: connector.startX,
          endY: connector.startY,
          endZ: connector.startZ,
          halfWidth: Math.min(previous.halfWidth, connector.halfWidth),
          id: `${stair.id}:${previousSegment.id}:${segment.id}:navigation-junction`,
          objectId: stair.id,
          startX: previous.endX,
          startY: previous.endY,
          startZ: previous.endZ,
        })
      }
    }
    orderedConnectors.push(connector)
  }
  for (let chainOrder = 0; chainOrder < orderedConnectors.length; chainOrder += 1) {
    connectors.push({
      ...orderedConnectors[chainOrder]!,
      chainId: stair.id,
      chainOrder,
    })
  }
}

function appendItemCollisionBox(
  boxes: ZombieEscapeCollisionBoxSource[],
  node: LandrushCollisionItem,
  nodes: Record<string, AnyNode>,
  collisionIndex: LandrushZombieEscapeCollisionIndex,
  spawn: Readonly<{ x: number; z: number }>,
  verticalOriginY: number,
) {
  const level = node.parentId ? nodes[node.parentId] : undefined
  if (level?.type !== 'level') return
  const buildingTransform = resolveBuildingTransform(level, nodes, collisionIndex)
  const profile = resolveItemCollisionProfile(node)
  if (!profile) return
  const visualPosition = getFloorStackedPosition({ node, nodes, position: node.position })
  const [centerX, centerZ] = transformLevelPoint(
    node.position[0],
    node.position[2],
    buildingTransform,
  )
  const supportBaseY =
    buildingTransform.y +
    resolveLevelBaseY(level, collisionIndex) +
    visualPosition[1] -
    verticalOriginY
  boxes.push({
    breakable: true,
    centerX: centerX - spawn.x,
    centerZ: centerZ - spawn.z,
    halfDepth: profile.depth / 2,
    halfWidth: profile.width / 2,
    id: `${node.id}:footprint`,
    maximumY: supportBaseY + profile.maximumY,
    minimumY: supportBaseY + profile.minimumY,
    navigationLayerY: supportBaseY,
    objectId: node.id,
    rotation: buildingTransform.rotation + node.rotation[1],
  })
}

function resolveItemCollisionProfile(node: LandrushCollisionItem) {
  return resolveLandrushSemanticItemCollisionProfile({
    attachTo: node.asset.attachTo,
    dimensions: node.asset.dimensions,
    scale: node.scale,
    surfaceHeight: node.asset.surface?.height,
    tags: node.asset.tags,
  })
}

function appendShelfCollisionBox(
  boxes: ZombieEscapeCollisionBoxSource[],
  node: LandrushCollisionShelf,
  nodes: Record<string, AnyNode>,
  collisionIndex: LandrushZombieEscapeCollisionIndex,
  spawn: Readonly<{ x: number; z: number }>,
  verticalOriginY: number,
) {
  const placement = resolveLevelCollisionPlacement(
    node,
    nodes,
    collisionIndex,
    spawn,
    verticalOriginY,
  )
  if (!placement) return
  boxes.push({
    breakable: true,
    centerX: placement.centerX,
    centerZ: placement.centerZ,
    halfDepth: Math.max(0.01, node.depth / 2),
    halfWidth: Math.max(0.01, node.width / 2),
    id: `${node.id}:footprint`,
    maximumY: placement.supportBaseY + Math.max(0.02, node.height + node.thickness),
    minimumY: placement.supportBaseY,
    navigationLayerY: placement.navigationLayerY,
    objectId: node.id,
    rotation: placement.buildingRotation + node.rotation[1],
  })
}

function appendColumnCollisionBox(
  boxes: ZombieEscapeCollisionBoxSource[],
  node: LandrushCollisionColumn,
  nodes: Record<string, AnyNode>,
  collisionIndex: LandrushZombieEscapeCollisionIndex,
  spawn: Readonly<{ x: number; z: number }>,
  verticalOriginY: number,
) {
  const placement = resolveLevelCollisionPlacement(
    node,
    nodes,
    collisionIndex,
    spawn,
    verticalOriginY,
  )
  if (!placement) return
  const shaftWidth = node.crossSection === 'round' ? node.radius * 2 : node.width
  const shaftDepth = node.crossSection === 'round' ? node.radius * 2 : node.depth
  const supportSpread =
    node.supportStyle === 'vertical' ? 0 : Math.max(node.braceBottomSpread, node.braceTopSpread)
  const width = Math.max(
    shaftWidth,
    shaftWidth * node.baseWidthScale,
    shaftWidth * node.capitalWidthScale,
    supportSpread,
  )
  const depth = Math.max(
    shaftDepth,
    shaftDepth * node.baseDepthScale,
    shaftDepth * node.capitalDepthScale,
    supportSpread,
  )
  boxes.push({
    breakable: false,
    centerX: placement.centerX,
    centerZ: placement.centerZ,
    halfDepth: Math.max(0.01, depth / 2),
    halfWidth: Math.max(0.01, width / 2),
    id: `${node.id}:footprint`,
    maximumY: placement.supportBaseY + Math.max(0.02, node.height),
    minimumY: placement.supportBaseY,
    navigationLayerY: placement.navigationLayerY,
    objectId: node.id,
    rotation: placement.buildingRotation + node.rotation,
  })
}

function appendElevatorCollisionBoxes(
  boxes: ZombieEscapeCollisionBoxSource[],
  node: LandrushCollisionElevator,
  nodes: Record<string, AnyNode>,
  collisionIndex: LandrushZombieEscapeCollisionIndex,
  spawn: Readonly<{ x: number; z: number }>,
  verticalOriginY: number,
) {
  const building = node.parentId ? nodes[node.parentId] : undefined
  if (building?.type !== 'building') return
  const [centerOffsetX, centerOffsetZ] = rotateSceneVector(
    node.position[0],
    node.position[2],
    building.rotation[1],
  )
  const levels = Object.values(nodes)
    .filter(
      (candidate): candidate is LandrushGroundLevel =>
        candidate.type === 'level' &&
        candidate.parentId === building.id &&
        isSemanticCollisionNodeVisible(candidate, nodes),
    )
    .sort((first, second) => first.id.localeCompare(second.id))
  const levelRanges: Array<{ height: number; id: string; minimumY: number }> = levels.map(
    (level) => ({
      height: level.height ?? node.cabHeight,
      id: level.id,
      minimumY: building.position[1] + resolveLevelBaseY(level, collisionIndex) - verticalOriginY,
    }),
  )
  if (levelRanges.length === 0) {
    levelRanges.push({
      height: node.cabHeight,
      id: `${node.id}:fallback-level`,
      minimumY: building.position[1] - verticalOriginY,
    })
  }
  for (const level of levelRanges) {
    boxes.push({
      breakable: false,
      centerX: building.position[0] + centerOffsetX - spawn.x,
      centerZ: building.position[2] + centerOffsetZ - spawn.z,
      halfDepth: Math.max(0.01, (node.shaftDepth ?? node.depth) / 2),
      halfWidth: Math.max(0.01, (node.shaftWidth ?? node.width) / 2),
      id: `${node.id}:${level.id}:shaft`,
      maximumY: level.minimumY + Math.max(0.1, level.height),
      minimumY: level.minimumY,
      navigationLayerY: level.minimumY,
      objectId: node.id,
      rotation: building.rotation[1] + node.rotation,
    })
  }
}

function resolveLevelCollisionPlacement(
  node: LandrushCollisionShelf | LandrushCollisionColumn,
  nodes: Record<string, AnyNode>,
  collisionIndex: LandrushZombieEscapeCollisionIndex,
  spawn: Readonly<{ x: number; z: number }>,
  verticalOriginY: number,
) {
  const level = node.parentId ? nodes[node.parentId] : undefined
  if (level?.type !== 'level') return null
  const buildingTransform = resolveBuildingTransform(level, nodes, collisionIndex)
  const visualPosition = getFloorStackedPosition({ node, nodes, position: node.position })
  const [centerX, centerZ] = transformLevelPoint(
    node.position[0],
    node.position[2],
    buildingTransform,
  )
  const levelBaseY = buildingTransform.y + resolveLevelBaseY(level, collisionIndex)
  return {
    buildingRotation: buildingTransform.rotation,
    centerX: centerX - spawn.x,
    centerZ: centerZ - spawn.z,
    navigationLayerY: levelBaseY + visualPosition[1] - verticalOriginY,
    supportBaseY: levelBaseY + visualPosition[1] - verticalOriginY,
  }
}

function appendStairCollisionBoxes(
  boxes: ZombieEscapeCollisionBoxSource[],
  stair: LandrushCollisionStair,
  nodes: Record<string, AnyNode>,
  collisionIndex: LandrushZombieEscapeCollisionIndex,
  spawn: Readonly<{ x: number; z: number }>,
  verticalOriginY: number,
) {
  const level = stair.parentId ? nodes[stair.parentId] : undefined
  if (level?.type !== 'level') return
  const buildingTransform = resolveBuildingTransform(level, nodes, collisionIndex)
  const visualPosition = getFloorStackedPosition({
    levelId: level.id,
    node: stair,
    nodes,
    position: stair.position,
    rotation: stair.rotation,
  })
  const rootY =
    buildingTransform.y +
    resolveLevelBaseY(level, collisionIndex) +
    visualPosition[1] -
    verticalOriginY

  if (stair.stairType !== 'straight') {
    appendArcStairCollisionBoxes(
      boxes,
      stair,
      nodes,
      buildingTransform,
      visualPosition,
      rootY,
      spawn,
    )
    return
  }

  const segments = stair.children
    .map((childId) => nodes[childId])
    .filter(
      (node): node is LandrushCollisionStairSegment =>
        node?.type === 'stair-segment' && node.visible !== false,
    )
  const transforms = computeStairSegmentChainTransforms(segments)
  for (let segmentIndex = 0; segmentIndex < segments.length; segmentIndex += 1) {
    const segment = segments[segmentIndex]!
    const transform = transforms[segmentIndex]!
    const stepCount =
      segment.segmentType === 'stair' ? Math.max(1, Math.round(segment.stepCount)) : 1
    const stepLength = Math.max(0.01, segment.length) / stepCount
    const rise = segment.segmentType === 'stair' ? Math.max(0, segment.height) : 0
    const thickness = Math.max(0.02, segment.thickness)
    for (let stepIndex = 0; stepIndex < stepCount; stepIndex += 1) {
      const [stepOffsetX, stepOffsetZ] = rotateSceneVector(
        0,
        (stepIndex + 0.5) * stepLength,
        transform.rotation,
      )
      const [stairOffsetX, stairOffsetZ] = rotateSceneVector(
        transform.position[0] + stepOffsetX,
        transform.position[2] + stepOffsetZ,
        stair.rotation,
      )
      const [centerX, centerZ] = transformLevelPoint(
        visualPosition[0] + stairOffsetX,
        visualPosition[2] + stairOffsetZ,
        buildingTransform,
      )
      const maximumY = rootY + transform.position[1] + (rise * (stepIndex + 1)) / stepCount
      const minimumY = segment.fillToFloor
        ? Math.min(rootY, maximumY - thickness)
        : maximumY - thickness
      boxes.push({
        breakable: false,
        centerX: centerX - spawn.x,
        centerZ: centerZ - spawn.z,
        halfDepth: stepLength / 2,
        halfWidth: Math.max(0.01, segment.width) / 2,
        id: `${stair.id}:${segment.id}:step:${String(stepIndex)}`,
        maximumY,
        minimumY,
        navigationLayerY: rootY,
        objectId: stair.id,
        rotation: buildingTransform.rotation + stair.rotation + transform.rotation,
      })
    }
  }
}

function appendArcStairCollisionBoxes(
  boxes: ZombieEscapeCollisionBoxSource[],
  stair: LandrushCollisionStair,
  nodes: Record<string, AnyNode>,
  buildingTransform: LandrushZombieEscapeBuildingTransform,
  visualPosition: readonly [number, number, number],
  rootY: number,
  spawn: Readonly<{ x: number; z: number }>,
) {
  const isSpiral = stair.stairType === 'spiral'
  const stepCount = Math.max(2, Math.round(stair.stepCount))
  const totalRise = Math.max(0.1, resolveStairTotalRise(stair, nodes))
  const innerRadius = Math.max(isSpiral ? 0.05 : 0.2, stair.innerRadius)
  const width = Math.max(0.4, stair.width)
  const outerRadius = innerRadius + width
  const centerRadius = (innerRadius + outerRadius) / 2
  const stepSweep = stair.sweepAngle / stepCount
  const thickness = Math.max(0.02, stair.thickness)
  for (let stepIndex = 0; stepIndex < stepCount; stepIndex += 1) {
    const midAngle = -stair.sweepAngle / 2 + stepSweep * (stepIndex + 0.5)
    const [stairOffsetX, stairOffsetZ] = rotateSceneVector(
      Math.cos(midAngle) * centerRadius,
      Math.sin(midAngle) * centerRadius,
      stair.rotation,
    )
    const [centerX, centerZ] = transformLevelPoint(
      visualPosition[0] + stairOffsetX,
      visualPosition[2] + stairOffsetZ,
      buildingTransform,
    )
    const stepTopY = rootY + (totalRise * (stepIndex + 1)) / stepCount
    const minimumY = isSpiral
      ? rootY + (totalRise * stepIndex) / stepCount
      : stair.fillToFloor
        ? rootY
        : stepTopY - thickness
    boxes.push({
      breakable: false,
      centerX: centerX - spawn.x,
      centerZ: centerZ - spawn.z,
      halfDepth: Math.max(0.01, outerRadius * Math.abs(Math.sin(stepSweep / 2))),
      halfWidth: width / 2,
      id: `${stair.id}:arc-step:${String(stepIndex)}`,
      maximumY: isSpiral ? minimumY + thickness : stepTopY,
      minimumY,
      navigationLayerY: rootY,
      objectId: stair.id,
      rotation: buildingTransform.rotation + stair.rotation - midAngle,
    })
  }
}

function transformLevelPoint(
  x: number,
  z: number,
  buildingTransform: LandrushZombieEscapeBuildingTransform,
): readonly [number, number] {
  const [rotatedX, rotatedZ] = rotateSceneVector(x, z, buildingTransform.rotation)
  return [buildingTransform.x + rotatedX, buildingTransform.z + rotatedZ]
}

function rotateSceneVector(x: number, z: number, rotation: number): readonly [number, number] {
  const cosine = Math.cos(rotation)
  const sine = Math.sin(rotation)
  return [cosine * x + sine * z, -sine * x + cosine * z]
}

function compareCollisionSemanticEntries(first: readonly unknown[], second: readonly unknown[]) {
  return JSON.stringify(first).localeCompare(JSON.stringify(second))
}

export function createLandrushZombieEscapeCollisionSegments(
  nodes: Record<string, AnyNode>,
  spawn: Readonly<{ x: number; z: number }>,
  doorPassability: Readonly<Record<string, boolean>> = {},
  verticalOriginY = 0,
) {
  return createLandrushZombieEscapeCollisionSegmentsForScope(
    nodes,
    spawn,
    doorPassability,
    verticalOriginY,
  )
}

export function createLandrushZombieEscapeCombatCollisionSegments(
  nodes: Record<string, AnyNode>,
  spawn: Readonly<{ x: number; z: number }>,
  doorPassability: Readonly<Record<string, boolean>> = {},
  verticalOriginY = 0,
) {
  return createLandrushZombieEscapeCollisionSegmentsForScope(
    nodes,
    spawn,
    doorPassability,
    verticalOriginY,
  )
}

function createLandrushZombieEscapeCollisionSegmentsForScope(
  nodes: Record<string, AnyNode>,
  spawn: Readonly<{ x: number; z: number }>,
  doorPassability: Readonly<Record<string, boolean>>,
  verticalOriginY: number,
) {
  const segments: ZombieEscapeCollisionSegmentSource[] = []
  const nodesInStableOrder = Object.values(nodes).sort((first, second) =>
    first.id.localeCompare(second.id),
  )
  const collisionIndex = createCollisionIndex(nodesInStableOrder, nodes)
  for (const node of nodesInStableOrder) {
    if (!isCollisionNode(node, nodes)) continue
    appendCollisionNodeSegments(
      segments,
      node,
      nodes,
      collisionIndex,
      doorPassability,
      spawn,
      verticalOriginY,
    )
  }
  return segments
}

function appendCollisionNodeSegments(
  segments: ZombieEscapeCollisionSegmentSource[],
  node: LandrushCollisionNode,
  nodes: Record<string, AnyNode>,
  collisionIndex: LandrushZombieEscapeCollisionIndex,
  doorPassability: Readonly<Record<string, boolean>>,
  spawn: Readonly<{ x: number; z: number }>,
  verticalOriginY: number,
) {
  const level = node.parentId ? nodes[node.parentId] : undefined
  if (level?.type !== 'level') return
  const buildingTransform = resolveBuildingTransform(level, nodes, collisionIndex)
  const centerline = resolveCenterline(node)
  const cumulativeDistances = createCumulativeDistances(centerline)
  const length = cumulativeDistances[cumulativeDistances.length - 1] ?? 0
  if (length < MINIMUM_SOLID_WALL_RUN_METERS) return
  const verticalRange = resolveVerticalRange(
    node,
    level,
    buildingTransform,
    collisionIndex,
    verticalOriginY,
  )
  const halfThickness = Math.max(0.01, (node.thickness ?? (node.type === 'wall' ? 0.18 : 0.12)) / 2)
  const openings =
    node.type === 'wall'
      ? collectDoorOpenings(node, nodes, collisionIndex.doorsByWallId, length, doorPassability)
      : []
  const breakable = node.type === 'fence'
  let cursor = 0
  let runIndex = 0
  for (const opening of openings) {
    if (opening.start - cursor >= MINIMUM_SOLID_WALL_RUN_METERS) {
      appendCenterlineRun(
        segments,
        node.id,
        breakable,
        runIndex++,
        centerline,
        cumulativeDistances,
        cursor,
        opening.start,
        halfThickness,
        cursor <= MINIMUM_CENTERLINE_PIECE_METERS ? 'round' : 'flat',
        'flat',
        verticalRange,
        buildingTransform,
        spawn,
      )
    }
    cursor = Math.max(cursor, opening.end)
  }
  if (length - cursor >= MINIMUM_SOLID_WALL_RUN_METERS) {
    appendCenterlineRun(
      segments,
      node.id,
      breakable,
      runIndex,
      centerline,
      cumulativeDistances,
      cursor,
      length,
      halfThickness,
      cursor <= MINIMUM_CENTERLINE_PIECE_METERS ? 'round' : 'flat',
      'round',
      verticalRange,
      buildingTransform,
      spawn,
    )
  }
  for (const opening of openings) {
    if (opening.passable || opening.end - opening.start < MINIMUM_SOLID_WALL_RUN_METERS) continue
    appendCenterlineRun(
      segments,
      opening.doorId,
      true,
      0,
      centerline,
      cumulativeDistances,
      opening.start,
      opening.end,
      halfThickness,
      'flat',
      'flat',
      verticalRange,
      buildingTransform,
      spawn,
    )
  }
}

function appendCenterlineRun(
  segments: ZombieEscapeCollisionSegmentSource[],
  nodeId: string,
  breakable: boolean,
  runIndex: number,
  centerline: readonly CenterlinePoint[],
  cumulativeDistances: Float64Array,
  runStart: number,
  runEnd: number,
  halfThickness: number,
  runStartCap: 'flat' | 'round',
  runEndCap: 'flat' | 'round',
  verticalRange: Readonly<{ maximumY: number; minimumY: number }>,
  buildingTransform: LandrushZombieEscapeBuildingTransform,
  spawn: Readonly<{ x: number; z: number }>,
) {
  for (let centerlineIndex = 0; centerlineIndex < centerline.length - 1; centerlineIndex += 1) {
    const pointStart = centerline[centerlineIndex]!
    const pointEnd = centerline[centerlineIndex + 1]!
    const pieceStartDistance = cumulativeDistances[centerlineIndex]!
    const pieceEndDistance = cumulativeDistances[centerlineIndex + 1]!
    const pieceLength = pieceEndDistance - pieceStartDistance
    if (pieceLength <= MINIMUM_CENTERLINE_PIECE_METERS) continue
    const clippedStartDistance = Math.max(runStart, pieceStartDistance)
    const clippedEndDistance = Math.min(runEnd, pieceEndDistance)
    if (clippedEndDistance - clippedStartDistance <= MINIMUM_CENTERLINE_PIECE_METERS) continue
    const startAmount = (clippedStartDistance - pieceStartDistance) / pieceLength
    const endAmount = (clippedEndDistance - pieceStartDistance) / pieceLength
    appendSolidPiece(
      segments,
      nodeId,
      breakable,
      runIndex,
      centerlineIndex,
      interpolate(pointStart.x, pointEnd.x, startAmount),
      interpolate(pointStart.y, pointEnd.y, startAmount),
      interpolate(pointStart.x, pointEnd.x, endAmount),
      interpolate(pointStart.y, pointEnd.y, endAmount),
      halfThickness,
      clippedStartDistance <= runStart + MINIMUM_CENTERLINE_PIECE_METERS ? runStartCap : 'round',
      clippedEndDistance >= runEnd - MINIMUM_CENTERLINE_PIECE_METERS ? runEndCap : 'round',
      verticalRange,
      buildingTransform,
      spawn,
    )
  }
}

function appendSolidPiece(
  segments: ZombieEscapeCollisionSegmentSource[],
  nodeId: string,
  breakable: boolean,
  runIndex: number,
  centerlineIndex: number,
  startX: number,
  startZ: number,
  endX: number,
  endZ: number,
  halfThickness: number,
  startCap: 'flat' | 'round',
  endCap: 'flat' | 'round',
  verticalRange: Readonly<{ maximumY: number; minimumY: number }>,
  buildingTransform: LandrushZombieEscapeBuildingTransform,
  spawn: Readonly<{ x: number; z: number }>,
) {
  const transformedStartX =
    buildingTransform.x + buildingTransform.cosine * startX + buildingTransform.sine * startZ
  const transformedStartZ =
    buildingTransform.z - buildingTransform.sine * startX + buildingTransform.cosine * startZ
  const transformedEndX =
    buildingTransform.x + buildingTransform.cosine * endX + buildingTransform.sine * endZ
  const transformedEndZ =
    buildingTransform.z - buildingTransform.sine * endX + buildingTransform.cosine * endZ
  segments.push({
    breakable,
    endCap,
    endX: transformedEndX - spawn.x,
    endZ: transformedEndZ - spawn.z,
    halfThickness: Math.max(0.01, halfThickness),
    id: `${nodeId}:solid:${String(runIndex)}:${String(centerlineIndex)}`,
    maximumY: verticalRange.maximumY,
    minimumY: verticalRange.minimumY,
    navigationLayerY: verticalRange.minimumY,
    objectId: nodeId,
    startCap,
    startX: transformedStartX - spawn.x,
    startZ: transformedStartZ - spawn.z,
  })
}

function resolveBuildingTransform(
  level: LandrushGroundLevel,
  nodes: Record<string, AnyNode>,
  collisionIndex: LandrushZombieEscapeCollisionIndex,
): LandrushZombieEscapeBuildingTransform {
  const cached = collisionIndex.transformsByLevelId.get(level.id)
  if (cached) return cached
  const building = level?.type === 'level' && level.parentId ? nodes[level.parentId] : undefined
  const transform =
    building?.type === 'building'
      ? {
          cosine: Math.cos(building.rotation[1]),
          rotation: building.rotation[1],
          sine: Math.sin(building.rotation[1]),
          x: building.position[0],
          y: building.position[1],
          z: building.position[2],
        }
      : { cosine: 1, rotation: 0, sine: 0, x: 0, y: 0, z: 0 }
  collisionIndex.transformsByLevelId.set(level.id, transform)
  return transform
}

function collectDoorOpenings(
  wall: LandrushCollisionWall,
  nodes: Record<string, AnyNode>,
  doorsByWallId: ReadonlyMap<string, readonly LandrushCollisionDoor[]>,
  wallLength: number,
  doorPassability: Readonly<Record<string, boolean>>,
) {
  const doorIds = new Set<string>((doorsByWallId.get(wall.id) ?? []).map(({ id }) => id))
  for (const childId of wall.children ?? []) doorIds.add(childId)

  const openings: Array<{ doorId: string; end: number; passable: boolean; start: number }> = []
  for (const doorId of doorIds) {
    const door = nodes[doorId]
    if (door?.type !== 'door' || !isSemanticCollisionNodeVisible(door, nodes)) continue
    const center = Math.max(0, Math.min(wallLength, door.position[0]))
    const halfWidth = Math.max(0.18, door.width / 2)
    openings.push({
      doorId: door.id,
      end: Math.max(0, Math.min(wallLength, center + halfWidth)),
      passable: isDoorPassable(door, doorPassability),
      start: Math.max(0, Math.min(wallLength, center - halfWidth)),
    })
  }
  return openings.sort(
    (first, second) =>
      first.start - second.start ||
      first.end - second.end ||
      first.doorId.localeCompare(second.doorId),
  )
}

function createCollisionIndex(
  nodesInStableOrder: readonly AnyNode[],
  nodes: Record<string, AnyNode>,
): LandrushZombieEscapeCollisionIndex {
  const doorsByWallId = new Map<string, LandrushCollisionDoor[]>()
  for (const node of nodesInStableOrder) {
    if (node.type !== 'door') continue
    indexDoor(node.wallId, node, doorsByWallId, nodes)
    if (node.parentId !== node.wallId) indexDoor(node.parentId, node, doorsByWallId, nodes)
  }
  return {
    doorsByWallId,
    levelBaseYById: new Map(
      [...getLevelElevations(nodes)].map(([levelId, elevation]) => [levelId, elevation.baseY]),
    ),
    transformsByLevelId: new Map(),
  }
}

function resolveLevelBaseY(
  level: LandrushGroundLevel,
  collisionIndex: LandrushZombieEscapeCollisionIndex,
) {
  return collisionIndex.levelBaseYById.get(level.id) ?? level.baseElevation
}

function indexDoor(
  wallId: string | null | undefined,
  door: LandrushCollisionDoor,
  doorsByWallId: Map<string, LandrushCollisionDoor[]>,
  nodes: Record<string, AnyNode>,
) {
  if (!wallId || nodes[wallId]?.type !== 'wall') return
  const doors = doorsByWallId.get(wallId)
  if (doors) doors.push(door)
  else doorsByWallId.set(wallId, [door])
}

function resolveCenterline(node: LandrushCollisionNode): readonly CenterlinePoint[] {
  if (node.type === 'fence') {
    if (isSplineFence(node) || isCurvedWall(node)) {
      return sampleFenceCenterline(node, FENCE_CENTERLINE_SAMPLE_SEGMENTS)
    }
  } else if (isCurvedWall(node)) {
    return sampleWallCenterline(node, WALL_CENTERLINE_SAMPLE_SEGMENTS)
  }
  return [
    { x: node.start[0], y: node.start[1] },
    { x: node.end[0], y: node.end[1] },
  ]
}

function createCumulativeDistances(centerline: readonly CenterlinePoint[]) {
  const distances = new Float64Array(centerline.length)
  for (let index = 1; index < centerline.length; index += 1) {
    const previous = centerline[index - 1]!
    const point = centerline[index]!
    distances[index] =
      distances[index - 1]! + Math.hypot(point.x - previous.x, point.y - previous.y)
  }
  return distances
}

function resolveVerticalRange(
  node: LandrushCollisionNode,
  level: LandrushGroundLevel,
  buildingTransform: LandrushZombieEscapeBuildingTransform,
  collisionIndex: LandrushZombieEscapeCollisionIndex,
  verticalOriginY: number,
) {
  const originY = Number.isFinite(verticalOriginY) ? verticalOriginY : 0
  const minimumY =
    buildingTransform.y +
    resolveLevelBaseY(level, collisionIndex) +
    (node.supportOffset ?? 0) -
    originY
  const height =
    node.type === 'wall' ? (node.height ?? level.height ?? DEFAULT_WALL_HEIGHT) : node.height
  return { maximumY: minimumY + Math.max(0, height), minimumY }
}

function interpolate(start: number, end: number, amount: number) {
  return start + (end - start) * amount
}

function isDoorPassable(
  door: Extract<AnyNode, { type: 'door' }>,
  doorPassability: Readonly<Record<string, boolean>>,
) {
  if (isLandrushPermanentDoorOpening(door)) return true
  if (Object.hasOwn(doorPassability, door.id)) return doorPassability[door.id] === true
  if (door.doorType === 'hinged' || door.doorType === 'double' || door.doorType === 'french') {
    return door.swingAngle >= LANDRUSH_ISLAND_DOOR_SWING_PASSABLE_RADIANS
  }
  return door.operationState >= LANDRUSH_ISLAND_DOOR_OPERATION_PASSABLE_AMOUNT
}

function isLandrushPermanentDoorOpening(door: LandrushCollisionDoor) {
  return (
    door.openingKind === 'opening' || door.segments.every((segment) => segment.type === 'empty')
  )
}

function isCollisionNode(
  node: AnyNode,
  nodes: Record<string, AnyNode>,
): node is Extract<AnyNode, { type: 'fence' | 'wall' }> {
  if (node.type !== 'wall' && node.type !== 'fence') return false
  if (!isSemanticCollisionNodeVisible(node, nodes)) return false
  const parent = node.parentId ? nodes[node.parentId] : undefined
  return parent?.type === 'level'
}

function isItemCollisionNode(
  node: AnyNode,
  nodes: Record<string, AnyNode>,
): node is LandrushCollisionItem {
  if (node.type !== 'item' || !isSemanticCollisionNodeVisible(node, nodes)) return false
  if (!resolveItemCollisionProfile(node)) return false
  const level = node.parentId ? nodes[node.parentId] : undefined
  return level?.type === 'level'
}

function isShelfCollisionNode(
  node: AnyNode,
  nodes: Record<string, AnyNode>,
): node is LandrushCollisionShelf {
  if (node.type !== 'shelf' || !isSemanticCollisionNodeVisible(node, nodes)) return false
  return node.parentId ? nodes[node.parentId]?.type === 'level' : false
}

function isColumnCollisionNode(
  node: AnyNode,
  nodes: Record<string, AnyNode>,
): node is LandrushCollisionColumn {
  if (node.type !== 'column' || !isSemanticCollisionNodeVisible(node, nodes)) return false
  return node.parentId ? nodes[node.parentId]?.type === 'level' : false
}

function isElevatorCollisionNode(
  node: AnyNode,
  nodes: Record<string, AnyNode>,
): node is LandrushCollisionElevator {
  if (node.type !== 'elevator' || !isSemanticCollisionNodeVisible(node, nodes)) return false
  return node.parentId ? nodes[node.parentId]?.type === 'building' : false
}

function isStairCollisionNode(
  node: AnyNode,
  nodes: Record<string, AnyNode>,
): node is LandrushCollisionStair {
  if (node.type !== 'stair' || !isSemanticCollisionNodeVisible(node, nodes)) return false
  const level = node.parentId ? nodes[node.parentId] : undefined
  return level?.type === 'level'
}

function isSlabNavigationSupportNode(
  node: AnyNode,
  nodes: Record<string, AnyNode>,
): node is LandrushCollisionSlab {
  if (node.type !== 'slab' || !isSemanticCollisionNodeVisible(node, nodes)) return false
  if (node.polygon.length < 3) return false
  return node.parentId ? nodes[node.parentId]?.type === 'level' : false
}

function isSemanticCollisionNodeVisible(node: AnyNode, nodes: Record<string, AnyNode>) {
  const visited = new Set<string>()
  let current: AnyNode | undefined = node
  while (current) {
    if (visited.has(current.id)) return false
    visited.add(current.id)
    if (current.visible === false) return false
    const metadata = current.metadata as { isTransient?: boolean } | undefined
    if (metadata?.isTransient) return false
    if (!current.parentId) return true
    const parent: AnyNode | undefined = nodes[current.parentId]
    if (!parent) return false
    current = parent
  }
  return true
}
