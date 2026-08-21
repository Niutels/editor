import {
  type AnyNode,
  DEFAULT_WALL_HEIGHT,
  isCurvedWall,
  isSplineFence,
  sampleFenceCenterline,
  sampleWallCenterline,
} from '@pascal-app/core'
import {
  createZombieEscapeCollisionWorld,
  type ZombieEscapeCollisionCircleSource,
  type ZombieEscapeCollisionSegmentSource,
  type ZombieEscapeCollisionWorld,
} from './zombie-escape-collision-world'

const MINIMUM_SOLID_WALL_RUN_METERS = 0.04
const MINIMUM_CENTERLINE_PIECE_METERS = 0.000_001
const WALL_CENTERLINE_SAMPLE_SEGMENTS = 32
const FENCE_CENTERLINE_SAMPLE_SEGMENTS = 64

type LandrushCollisionNode = Extract<AnyNode, { type: 'fence' | 'wall' }>
type LandrushCollisionWall = Extract<AnyNode, { type: 'wall' }>
type LandrushCollisionDoor = Extract<AnyNode, { type: 'door' }>
type LandrushGroundLevel = Extract<AnyNode, { type: 'level' }>

type LandrushZombieEscapeBuildingTransform = Readonly<{
  cosine: number
  sine: number
  x: number
  y: number
  z: number
}>

type LandrushZombieEscapeCollisionIndex = Readonly<{
  doorsByWallId: ReadonlyMap<string, readonly LandrushCollisionDoor[]>
  transformsByLevelId: Map<string, LandrushZombieEscapeBuildingTransform>
}>

type CenterlinePoint = Readonly<{ x: number; y: number }>

export type LandrushZombieEscapeCollisionWorldInput = {
  agentRadius: number
  circles?: readonly ZombieEscapeCollisionCircleSource[]
  doorPassability?: Readonly<Record<string, boolean>>
  nodes: Record<string, AnyNode>
  playRadius: number
  spawn: Readonly<{ x: number; z: number }>
  verticalOriginY?: number
}

export function createLandrushZombieEscapeCollisionWorld({
  agentRadius,
  circles = [],
  doorPassability = {},
  nodes,
  playRadius,
  spawn,
  verticalOriginY = 0,
}: LandrushZombieEscapeCollisionWorldInput) {
  return createZombieEscapeCollisionWorld({
    agentRadius,
    circles,
    playRadius,
    segments: createLandrushZombieEscapeCollisionSegments(
      nodes,
      spawn,
      doorPassability,
      verticalOriginY,
    ),
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

export function createLandrushZombieEscapeCollisionSemanticsKey(
  nodes: Record<string, AnyNode>,
  doorPassability: Readonly<Record<string, boolean>> = {},
) {
  const collisionNodes: LandrushCollisionNode[] = []
  const collisionWallIds = new Set<string>()
  const childWallIdsByDoorId = new Map<string, string[]>()
  const doorNodes: LandrushCollisionDoor[] = []
  const levelIds = new Set<string>()

  for (const node of Object.values(nodes)) {
    if (node.type === 'door') doorNodes.push(node)
    if (!isGroundFloorCollisionNode(node, nodes)) continue
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
  const buildingIds = new Set<string>()
  for (const levelId of levelIds) {
    const level = nodes[levelId]
    if (level?.type !== 'level') continue
    entries.push(['level', level.id, level.parentId, level.baseElevation])
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

  entries.sort(compareCollisionSemanticEntries)
  return JSON.stringify(entries)
}

function createLandrushZombieEscapeCollisionWorldSignature({
  agentRadius,
  circles = [],
  doorPassability = {},
  nodes,
  playRadius,
  spawn,
  verticalOriginY = 0,
}: LandrushZombieEscapeCollisionWorldInput) {
  const circleSemantics = circles
    .map(({ id, maximumY, minimumY, radius, x, z }) => [
      id,
      x,
      z,
      radius,
      minimumY ?? null,
      maximumY ?? null,
    ])
    .sort(compareCollisionSemanticEntries)
  return JSON.stringify([
    agentRadius,
    playRadius,
    spawn.x,
    spawn.z,
    verticalOriginY,
    circleSemantics,
    createLandrushZombieEscapeCollisionSemanticsKey(nodes, doorPassability),
  ])
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
  const segments: ZombieEscapeCollisionSegmentSource[] = []
  const nodesInStableOrder = Object.values(nodes).sort((first, second) =>
    first.id.localeCompare(second.id),
  )
  const collisionIndex = createCollisionIndex(nodesInStableOrder, nodes)
  for (const node of nodesInStableOrder) {
    if (!isGroundFloorCollisionNode(node, nodes)) continue
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
  const verticalRange = resolveVerticalRange(node, level, buildingTransform, verticalOriginY)
  const halfThickness = Math.max(0.01, (node.thickness ?? (node.type === 'wall' ? 0.18 : 0.12)) / 2)
  const openings =
    node.type === 'wall'
      ? collectDoorOpenings(node, nodes, collisionIndex.doorsByWallId, length, doorPassability)
      : []
  let cursor = 0
  let runIndex = 0
  for (const opening of openings) {
    if (opening.start - cursor >= MINIMUM_SOLID_WALL_RUN_METERS) {
      appendCenterlineRun(
        segments,
        node.id,
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
    endCap,
    endX: transformedEndX - spawn.x,
    endZ: transformedEndZ - spawn.z,
    halfThickness: Math.max(0.01, halfThickness),
    id: `${nodeId}:solid:${String(runIndex)}:${String(centerlineIndex)}`,
    maximumY: verticalRange.maximumY,
    minimumY: verticalRange.minimumY,
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
          sine: Math.sin(building.rotation[1]),
          x: building.position[0],
          y: building.position[1],
          z: building.position[2],
        }
      : { cosine: 1, sine: 0, x: 0, y: 0, z: 0 }
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
    if (door?.type !== 'door') continue
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
  return { doorsByWallId, transformsByLevelId: new Map() }
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
  verticalOriginY: number,
) {
  const originY = Number.isFinite(verticalOriginY) ? verticalOriginY : 0
  const minimumY = buildingTransform.y + level.baseElevation + (node.supportOffset ?? 0) - originY
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
  if (door.openingKind === 'opening') return true
  if (door.segments.every((segment) => segment.type === 'empty')) return true
  if (Object.hasOwn(doorPassability, door.id)) return doorPassability[door.id] === true
  if (door.doorType === 'hinged' || door.doorType === 'double' || door.doorType === 'french') {
    return door.swingAngle >= Math.PI * 0.38
  }
  return door.operationState >= 0.85
}

function isGroundFloorCollisionNode(
  node: AnyNode,
  nodes: Record<string, AnyNode>,
): node is Extract<AnyNode, { type: 'fence' | 'wall' }> {
  if (node.type !== 'wall' && node.type !== 'fence') return false
  if (node.visible === false) return false
  const metadata = node.metadata as { isTransient?: boolean } | undefined
  if (metadata?.isTransient) return false
  const parent = node.parentId ? nodes[node.parentId] : undefined
  return parent?.type === 'level' && parent.level === 0
}
