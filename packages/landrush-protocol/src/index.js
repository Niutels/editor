export const LEGACY_PARCEL_BUILD_SCHEMA_VERSION = 1
export const PARCEL_BUILD_SCHEMA_VERSION = 2
export const PARCEL_WRITER_SESSION_CLOSE_CODE = 4009
export const MAX_PARCEL_WRITER_SESSION_ID_LENGTH = 120
export const DEFAULT_MULTIPLAYER_ROOM_ID = 'landrush-lab-world-multiplayer'
export const MAX_MULTIPLAYER_ROOM_ID_LENGTH = 80
export const MAX_MULTIPLAYER_COMBAT_SHOTS = 64
export const MULTIPLAYER_ZOMBIE_ESCAPE_NIGHT_DURATION_MS = 180_000
export const DEFAULT_PROFILE_MONEY = 200
export const MAX_PROFILE_MONEY = 1_000_000_000
export const MAX_PROFILE_MONEY_OPERATION_ID_LENGTH = 120
export const PARCEL_BUILD_FIXED_NODE_PRICE = 10
export const PARCEL_BUILD_ITEM_PRICE = 50
export const PARCEL_BUILD_PRICE_EPSILON = 1e-6
export const PARCEL_BUILD_WALL_PRICE_PER_METER = 10
export const ZOMBIE_ESCAPE_KILL_REWARD = 10

const FIXED_PRICE_PARCEL_BUILD_NODE_TYPES = new Set([
  'block',
  'box-vent',
  'ceiling',
  'chimney',
  'column',
  'cupola',
  'door',
  'dormer',
  'downspout',
  'duct-fitting',
  'duct-segment',
  'duct-terminal',
  'elevator',
  'eyebrow-vent',
  'gutter',
  'hvac-equipment',
  'lean-to-extension',
  'lineset',
  'liquid-line',
  'pipe-fitting',
  'pipe-segment',
  'pipe-trap',
  'ridge-vent',
  'roof',
  'roof-segment',
  'shelf',
  'skylight',
  'slab',
  'solar-panel',
  'spawn',
  'stair',
  'stair-segment',
  'structural-grid',
  'turbine-vent',
  'window',
])
const MANAGED_LEAN_TO_ROLE_BY_NODE_TYPE = new Map([
  ['column', 'post'],
  ['downspout', 'downspout'],
  ['gutter', 'gutter'],
  ['roof', 'roof'],
  ['roof-segment', 'roof-segment'],
])
const DEFAULT_LEAN_TO_POST_COUNT = 3
const DEFAULT_LEAN_TO_POST_SPACING = 3
const DEFAULT_LEAN_TO_SPAN = 4
const LEFT_LEAN_TO_CORNER_POST_INDEX = -1001
const RIGHT_LEAN_TO_CORNER_POST_INDEX = -1002
const MAX_PROFILE_ID_LENGTH = 120
const MAX_ZOMBIE_ESCAPE_SESSION_ID_LENGTH = 80

export function isParcelBuildSchemaVersion(value) {
  return value === PARCEL_BUILD_SCHEMA_VERSION
}

export function isSupportedParcelBuildSchemaVersion(value) {
  return value === LEGACY_PARCEL_BUILD_SCHEMA_VERSION || isParcelBuildSchemaVersion(value)
}

export function isParcelWriterEpoch(value) {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0
}

export function sanitizeParcelWriterSessionId(value) {
  const normalized = typeof value === 'string' ? value.trim() : ''
  return normalized.slice(0, MAX_PARCEL_WRITER_SESSION_ID_LENGTH).replace(/[^a-zA-Z0-9._:-]/g, '-')
}

export function normalizeParcelBuildRevision(value, fallback = 0) {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : fallback
}

export function isParcelBuildFixedPriceNodeType(value) {
  return (
    typeof value === 'string' && FIXED_PRICE_PARCEL_BUILD_NODE_TYPES.has(value.trim().toLowerCase())
  )
}

export function isZombieEscapeFirstHouseReady(nodes) {
  const nodesById = new Map(nodes.map((node) => [node?.id, node]))
  const wallsByGroup = new Map()
  const hostedDoorWallIds = new Set()

  for (const node of nodes) {
    if (!isVisibleCommittedParcelBuildNode(node, nodesById)) continue
    const type = parcelBuildNodeType(node)
    if (type === 'wall') {
      const groupId = zombieEscapeHouseWallGroupId(node, nodesById)
      if (!groupId || !isFiniteZombieEscapeHouseWall(node)) continue
      const walls = wallsByGroup.get(groupId)
      if (walls) walls.push(node)
      else wallsByGroup.set(groupId, [node])
      continue
    }
    if (type !== 'door' || node.openingKind === 'opening') continue
    for (const wallId of [node.wallId, node.parentId]) {
      if (typeof wallId === 'string' && wallId.length > 0) hostedDoorWallIds.add(wallId)
    }
  }

  for (const walls of wallsByGroup.values()) {
    const doorWalls = walls.filter((wall) => hostedDoorWallIds.has(wall.id))
    if (doorWalls.length === 0) continue
    if (doorWalls.some((doorWall) => wallBelongsToClosedHouseRoom(doorWall, walls))) return true
  }
  return false
}

function isVisibleCommittedParcelBuildNode(node, nodesById) {
  if (!node || typeof node !== 'object' || node.visible === false) return false
  const visitedIds = new Set()
  let current = node
  while (current && typeof current === 'object') {
    const metadata = parcelBuildNodeMetadata(current)
    if (metadata.isNew === true || metadata.isTransient === true) return false
    const parentId = current.parentId
    if (typeof parentId !== 'string' || parentId.length === 0 || visitedIds.has(parentId)) break
    visitedIds.add(parentId)
    current = nodesById.get(parentId)
  }
  return true
}

function zombieEscapeHouseWallGroupId(wall, nodesById) {
  if (typeof wall.parentId !== 'string' || wall.parentId.length === 0) return ''
  return `${zombieEscapeHouseParcelId(wall, nodesById)}:${wall.parentId}`
}

function zombieEscapeHouseParcelId(node, nodesById) {
  const visitedIds = new Set()
  let current = node
  while (current && typeof current === 'object') {
    const parcelId = parcelBuildNodeMetadata(current).landrushParcelId
    if (typeof parcelId === 'string' && parcelId.length > 0) return parcelId
    const parentId = current.parentId
    if (typeof parentId !== 'string' || parentId.length === 0 || visitedIds.has(parentId)) break
    visitedIds.add(parentId)
    current = nodesById.get(parentId)
  }
  return ''
}

function isFiniteZombieEscapeHouseWall(wall) {
  return (
    Array.isArray(wall.start) &&
    Array.isArray(wall.end) &&
    wall.start.length >= 2 &&
    wall.end.length >= 2 &&
    wall.start.slice(0, 2).every(Number.isFinite) &&
    wall.end.slice(0, 2).every(Number.isFinite) &&
    zombieEscapeHousePointKey(wall.start) !== zombieEscapeHousePointKey(wall.end)
  )
}

function wallBelongsToClosedHouseRoom(doorWall, walls) {
  const startKey = zombieEscapeHousePointKey(doorWall.start)
  const endKey = zombieEscapeHousePointKey(doorWall.end)
  const pointsByKey = new Map()
  const edgesByPointKey = new Map()

  for (const wall of walls) {
    const wallStartKey = zombieEscapeHousePointKey(wall.start)
    const wallEndKey = zombieEscapeHousePointKey(wall.end)
    pointsByKey.set(wallStartKey, wall.start)
    pointsByKey.set(wallEndKey, wall.end)
    for (const [pointKey, otherKey] of [
      [wallStartKey, wallEndKey],
      [wallEndKey, wallStartKey],
    ]) {
      const edges = edgesByPointKey.get(pointKey)
      const edge = { otherKey, wallId: wall.id }
      if (edges) edges.push(edge)
      else edgesByPointKey.set(pointKey, [edge])
    }
  }

  return hasNonDegenerateHouseReturnPath({
    currentKey: startKey,
    doorWallId: doorWall.id,
    edgesByPointKey,
    pathKeys: [startKey],
    pointsByKey,
    targetKey: endKey,
    visitedKeys: new Set([startKey]),
  })
}

function hasNonDegenerateHouseReturnPath({
  currentKey,
  doorWallId,
  edgesByPointKey,
  pathKeys,
  pointsByKey,
  targetKey,
  visitedKeys,
}) {
  for (const edge of edgesByPointKey.get(currentKey) ?? []) {
    if (edge.wallId === doorWallId) continue
    const nextPathKeys = [...pathKeys, edge.otherKey]
    if (edge.otherKey === targetKey) {
      if (nextPathKeys.length < 4) continue
      const points = nextPathKeys.map((key) => pointsByKey.get(key))
      if (Math.abs(zombieEscapeHousePolygonArea(points)) > 0.0001) return true
      continue
    }
    if (visitedKeys.has(edge.otherKey)) continue
    const nextVisitedKeys = new Set(visitedKeys)
    nextVisitedKeys.add(edge.otherKey)
    if (
      hasNonDegenerateHouseReturnPath({
        currentKey: edge.otherKey,
        doorWallId,
        edgesByPointKey,
        pathKeys: nextPathKeys,
        pointsByKey,
        targetKey,
        visitedKeys: nextVisitedKeys,
      })
    ) {
      return true
    }
  }
  return false
}

function zombieEscapeHousePointKey(point) {
  return `${Math.round(point[0] * 10_000)}:${Math.round(point[1] * 10_000)}`
}

function zombieEscapeHousePolygonArea(points) {
  let twiceArea = 0
  for (let index = 0; index < points.length; index += 1) {
    const current = points[index]
    const next = points[(index + 1) % points.length]
    if (!current || !next) return 0
    twiceArea += current[0] * next[1] - next[0] * current[1]
  }
  return twiceArea / 2
}

export function calculateParcelBuildPriceDelta(previousNodes, nextNodes) {
  const previousById = new Map(previousNodes.map((node) => [node.id, node]))
  const nextById = new Map(nextNodes.map((node) => [node.id, node]))
  for (const node of nextNodes) {
    const previous = previousById.get(node.id)
    const previousType = parcelBuildNodeType(previous)
    const nextType = parcelBuildNodeType(node)
    if (previous && previousType !== nextType) {
      return {
        code: 'unpriced-build-node',
        message: `Build node ${node.id} cannot change type from ${previous.type} to ${node.type}`,
        ok: false,
      }
    }
  }

  const previousWallValue = parcelBuildWallSnapshotValue(previousNodes, true)
  if (!previousWallValue.ok) return previousWallValue
  const nextWallValue = parcelBuildWallSnapshotValue(nextNodes, false)
  if (!nextWallValue.ok) return nextWallValue
  let cost = Math.max(0, nextWallValue.cost - previousWallValue.cost)

  for (const node of nextNodes) {
    const previous = previousById.get(node.id)
    const nextType = parcelBuildNodeType(node)
    if (nextType === 'wall') continue
    const nextContribution = parcelBuildNodePrice(node, nextById)
    if (!nextContribution.ok) return nextContribution
    const previousContribution = previous
      ? parcelBuildNodePrice(previous, previousById)
      : { cost: 0, ok: true }
    if (!previousContribution.ok) {
      return {
        code: 'unpriced-build-node',
        message: `Existing build node ${node.id} has no canonical price`,
        ok: false,
      }
    }
    cost += Math.max(0, nextContribution.cost - previousContribution.cost)
    if (!Number.isSafeInteger(cost) || cost > MAX_PROFILE_MONEY) {
      return {
        code: 'build-price-limit',
        message: 'Build price exceeds the supported profile-money limit',
        ok: false,
      }
    }
  }
  return { cost, ok: true }
}

function parcelBuildNodePrice(node, nodesById) {
  const type = parcelBuildNodeType(node)
  if (isDerivedManagedLeanToNode(node, nodesById)) return { cost: 0, ok: true }
  if (type === 'item' || type === 'cabinet') {
    return { cost: PARCEL_BUILD_ITEM_PRICE, ok: true }
  }
  if (type === 'cabinet-module' && isDerivedCabinetModule(node, nodesById)) {
    return { cost: 0, ok: true }
  }
  if (type === 'fence' || type === 'site' || type === 'building' || type === 'level') {
    return { cost: 0, ok: true }
  }
  if (
    (type === 'slab' || type === 'ceiling') &&
    node.autoFromWalls === true &&
    parcelBuildNodeType(nodesById.get(node.parentId)) === 'level'
  ) {
    return { cost: 0, ok: true }
  }
  if (
    (type === 'roof-segment' &&
      !hasManagedLeanToClaim(node) &&
      parcelBuildNodeType(nodesById.get(node.parentId)) === 'roof') ||
    (type === 'stair-segment' && parcelBuildNodeType(nodesById.get(node.parentId)) === 'stair')
  ) {
    return { cost: 0, ok: true }
  }
  if (isParcelBuildFixedPriceNodeType(type)) {
    return { cost: PARCEL_BUILD_FIXED_NODE_PRICE, ok: true }
  }
  return {
    code: 'unpriced-build-node',
    message: `Build node type ${node.type} has no canonical price`,
    ok: false,
  }
}

function parcelBuildNodeType(node) {
  return typeof node?.type === 'string' ? node.type.trim().toLowerCase() : ''
}

function isDerivedCabinetModule(node, nodesById) {
  const visitedNodeIds = new Set([node.id])
  let parentId = node.parentId
  while (typeof parentId === 'string' && parentId.length > 0) {
    if (visitedNodeIds.has(parentId)) return false
    visitedNodeIds.add(parentId)
    const parent = nodesById.get(parentId)
    const parentType = parcelBuildNodeType(parent)
    if (parentType === 'cabinet') return true
    if (parentType !== 'cabinet-module') return false
    parentId = parent.parentId
  }
  return false
}

function isDerivedManagedLeanToNode(node, nodesById) {
  const type = parcelBuildNodeType(node)
  const expectedRole = MANAGED_LEAN_TO_ROLE_BY_NODE_TYPE.get(type)
  if (!expectedRole) return false
  const metadata = parcelBuildNodeMetadata(node)
  const leanToId = metadata.managedByLeanTo
  if (
    typeof leanToId !== 'string' ||
    leanToId.length === 0 ||
    metadata.leanToRole !== expectedRole
  ) {
    return false
  }

  const leanTo = nodesById.get(leanToId)
  if (parcelBuildNodeType(leanTo) !== 'lean-to-extension') return false
  const hostWall = nodesById.get(leanTo.parentId)
  if (parcelBuildNodeType(hostWall) !== 'wall' || !hasReciprocalChild(hostWall, leanTo)) {
    return false
  }

  if (type === 'column') {
    if (!hasReciprocalChild(leanTo, node)) return false
    const postIndex = metadata.leanToPostIndex
    const postSide = metadata.leanToPostSide
    if (!isAllowedManagedLeanToPostIdentity(leanTo, postIndex, postSide)) {
      return false
    }
    return (
      countManagedLeanToChildren(leanTo, nodesById, leanTo.id, 'column', 'post', (child) => {
        const childMetadata = parcelBuildNodeMetadata(child)
        return (
          childMetadata.leanToPostIndex === postIndex && childMetadata.leanToPostSide === postSide
        )
      }) === 1
    )
  }

  const roof =
    type === 'roof'
      ? node
      : type === 'roof-segment'
        ? nodesById.get(node.parentId)
        : nodesById.get(nodesById.get(node.parentId)?.parentId)
  if (
    parcelBuildNodeType(roof) !== 'roof' ||
    !hasManagedLeanToIdentity(roof, leanTo.id, 'roof') ||
    !hasReciprocalChild(leanTo, roof) ||
    countManagedLeanToChildren(leanTo, nodesById, leanTo.id, 'roof', 'roof') !== 1
  ) {
    return false
  }
  if (type === 'roof') return true

  const segment = type === 'roof-segment' ? node : nodesById.get(node.parentId)
  if (
    parcelBuildNodeType(segment) !== 'roof-segment' ||
    !hasManagedLeanToIdentity(segment, leanTo.id, 'roof-segment') ||
    !hasReciprocalChild(roof, segment) ||
    countManagedLeanToChildren(roof, nodesById, leanTo.id, 'roof-segment', 'roof-segment') !== 1
  ) {
    return false
  }
  if (type === 'roof-segment') return true

  return (
    hasReciprocalChild(segment, node) &&
    countManagedLeanToChildren(segment, nodesById, leanTo.id, type, expectedRole) === 1
  )
}

function isAllowedManagedLeanToPostIdentity(leanTo, postIndex, postSide) {
  if (!Number.isSafeInteger(postIndex) || (postSide !== 'low' && postSide !== 'high')) {
    return false
  }
  if (postIndex === LEFT_LEAN_TO_CORNER_POST_INDEX) {
    return postSide === 'low' && hasOwnedLeanToCornerPost(leanTo, 'left')
  }
  if (postIndex === RIGHT_LEAN_TO_CORNER_POST_INDEX) {
    return postSide === 'low' && hasOwnedLeanToCornerPost(leanTo, 'right')
  }
  if (postIndex < 0) return false
  if (postSide === 'high' && leanTo.highSideMode !== 'independent-high-beam') return false

  const layout = resolveLeanToPostLayout(leanTo)
  if (!layout || postIndex >= layout.count) return false
  if (postSide === 'high') return true
  const first = -layout.span / 2 + layout.inset
  const last = layout.span / 2 - layout.inset
  const x = first + ((last - first) * postIndex) / (layout.count - 1)
  const leftJoint = readValidLeanToCornerJoint(leanTo, 'left')
  if (
    leftJoint?.gutterMitre < 0 &&
    x <= -layout.span / 2 - leftJoint.beamExtension + PARCEL_BUILD_PRICE_EPSILON
  ) {
    return false
  }
  const rightJoint = readValidLeanToCornerJoint(leanTo, 'right')
  return !(
    rightJoint?.gutterMitre < 0 &&
    x >= layout.span / 2 + rightJoint.beamExtension - PARCEL_BUILD_PRICE_EPSILON
  )
}

function resolveLeanToPostLayout(leanTo) {
  const span = boundedLeanToNumber(leanTo.span, DEFAULT_LEAN_TO_SPAN, 0.5, 100)
  const requestedInset = boundedLeanToNumber(leanTo.postInset, 0, 0, 3)
  if (span === null || requestedInset === null) return null
  const mode = leanTo.postLayoutMode ?? 'target-spacing'
  let count
  if (mode === 'target-spacing') {
    const spacing = boundedLeanToNumber(leanTo.postSpacing, DEFAULT_LEAN_TO_POST_SPACING, 0.3, 10)
    if (spacing === null) return null
    const usable = Math.max(0.1, span - 2 * Math.max(0, requestedInset))
    count = Math.max(2, Math.min(20, Math.ceil(usable / spacing) + 1))
  } else if (mode === 'count') {
    const requestedCount = leanTo.postCount ?? DEFAULT_LEAN_TO_POST_COUNT
    if (!Number.isSafeInteger(requestedCount)) return null
    count = Math.max(2, Math.min(20, requestedCount))
  } else {
    return null
  }
  const inset = Math.min(requestedInset, Math.max(0, span / 2 - 0.05))
  return { count, inset, span }
}

function boundedLeanToNumber(value, fallback, minimum, maximum) {
  const resolved = value === undefined ? fallback : value
  return typeof resolved === 'number' && Number.isFinite(resolved)
    ? Math.max(minimum, Math.min(maximum, resolved))
    : null
}

function hasOwnedLeanToCornerPost(leanTo, side) {
  return readValidLeanToCornerJoint(leanTo, side)?.sharedPostOwner === true
}

function readValidLeanToCornerJoint(leanTo, side) {
  if (leanTo.autoMiterCorners === false) return null
  const cornerJoints = parcelBuildNodeMetadata(leanTo).leanToCornerJoints
  if (!cornerJoints || typeof cornerJoints !== 'object' || Array.isArray(cornerJoints)) return null
  const joint = cornerJoints[side]
  if (!joint || typeof joint !== 'object' || Array.isArray(joint)) return null
  if (
    typeof joint.beamExtension !== 'number' ||
    !Number.isFinite(joint.beamExtension) ||
    typeof joint.gutterMitre !== 'number' ||
    !Number.isFinite(joint.gutterMitre) ||
    typeof joint.sharedPostOwner !== 'boolean' ||
    !isLeanToCornerSeam(joint.seam)
  ) {
    return null
  }
  return joint
}

function isLeanToCornerSeam(value) {
  return (
    value === null ||
    (Array.isArray(value) &&
      value.length === 2 &&
      value.every(
        (point) =>
          Array.isArray(point) &&
          point.length === 2 &&
          point.every(
            (coordinate) => typeof coordinate === 'number' && Number.isFinite(coordinate),
          ),
      ))
  )
}

function countManagedLeanToChildren(parent, nodesById, leanToId, type, role, matches = () => true) {
  if (!Array.isArray(parent.children)) return 0
  let count = 0
  for (const childId of parent.children) {
    const child = nodesById.get(childId)
    if (
      child?.parentId === parent.id &&
      parcelBuildNodeType(child) === type &&
      hasManagedLeanToIdentity(child, leanToId, role) &&
      matches(child)
    ) {
      count += 1
    }
  }
  return count
}

function hasReciprocalChild(parent, child) {
  return (
    child?.parentId === parent?.id &&
    Array.isArray(parent?.children) &&
    parent.children.filter((childId) => childId === child.id).length === 1
  )
}

function hasManagedLeanToClaim(node) {
  const metadata = parcelBuildNodeMetadata(node)
  return metadata.managedByLeanTo !== undefined || metadata.leanToRole !== undefined
}

function hasManagedLeanToIdentity(node, leanToId, role) {
  const metadata = parcelBuildNodeMetadata(node)
  return metadata.managedByLeanTo === leanToId && metadata.leanToRole === role
}

function parcelBuildNodeMetadata(node) {
  return node?.metadata && typeof node.metadata === 'object' && !Array.isArray(node.metadata)
    ? node.metadata
    : {}
}

function parcelBuildWallSnapshotValue(nodes, previous) {
  let totalLength = 0
  for (const node of nodes) {
    if (parcelBuildNodeType(node) !== 'wall') continue
    const length = canonicalWallLength(node)
    if (length === null) {
      return previous
        ? {
            code: 'unpriced-build-node',
            message: `Existing build node ${node.id} has no canonical price`,
            ok: false,
          }
        : {
            code: 'unpriced-build-node',
            message: `Wall ${node.id} has invalid pricing geometry`,
            ok: false,
          }
    }
    totalLength += length
  }
  const cost = Math.ceil(
    totalLength * PARCEL_BUILD_WALL_PRICE_PER_METER - PARCEL_BUILD_PRICE_EPSILON,
  )
  return Number.isSafeInteger(cost) && cost <= MAX_PROFILE_MONEY
    ? { cost: Math.max(0, cost), ok: true }
    : {
        code: 'build-price-limit',
        message: 'Build price exceeds the supported profile-money limit',
        ok: false,
      }
}

function canonicalWallLength(node) {
  const start = finitePlanPoint(node.start)
  const end = finitePlanPoint(node.end)
  if (!(start && end)) return null
  const chordLength = Math.hypot(end[0] - start[0], end[1] - start[1])
  if (!Number.isFinite(chordLength) || chordLength <= PARCEL_BUILD_PRICE_EPSILON) return null
  if (node.curveOffset === undefined || node.curveOffset === null) return chordLength
  if (typeof node.curveOffset !== 'number' || !Number.isFinite(node.curveOffset)) return null
  const maximumOffset = chordLength / 2
  if (Math.abs(node.curveOffset) > maximumOffset + PARCEL_BUILD_PRICE_EPSILON) return null
  const offset = Math.max(-maximumOffset, Math.min(maximumOffset, node.curveOffset))
  const straightSnapOffset = Math.min(0.03, Math.max(0.005, chordLength * 0.005))
  if (Math.abs(offset) <= straightSnapOffset) return chordLength
  const sagitta = Math.abs(offset)
  const radius = (chordLength * chordLength) / (8 * sagitta) + sagitta / 2
  const halfAngle = Math.asin(Math.min(1, chordLength / (2 * radius)))
  const arcLength = radius * halfAngle * 2
  return Number.isFinite(arcLength) ? arcLength : null
}

function finitePlanPoint(value) {
  return Array.isArray(value) &&
    value.length === 2 &&
    typeof value[0] === 'number' &&
    Number.isFinite(value[0]) &&
    typeof value[1] === 'number' &&
    Number.isFinite(value[1])
    ? value
    : null
}

export function sanitizeMultiplayerRoomId(value) {
  const normalized = typeof value === 'string' ? value.trim() : ''
  return (normalized || DEFAULT_MULTIPLAYER_ROOM_ID)
    .slice(0, MAX_MULTIPLAYER_ROOM_ID_LENGTH)
    .replace(/[^a-zA-Z0-9_-]/g, '-')
}

export function sanitizeProfileMoneyOperationId(value) {
  const normalized = typeof value === 'string' ? value.trim() : ''
  return normalized
    .slice(0, MAX_PROFILE_MONEY_OPERATION_ID_LENGTH)
    .replace(/[^a-zA-Z0-9._:-]/g, '-')
}

export function isProfileWalletSnapshot(value) {
  if (!value || typeof value !== 'object') return false
  return (
    typeof value.profileId === 'string' &&
    value.profileId.length > 0 &&
    value.profileId.length <= MAX_PROFILE_ID_LENGTH &&
    isProfileMoney(value.balance) &&
    isNonnegativeSafeInteger(value.revision) &&
    isNonnegativeSafeInteger(value.updatedAt)
  )
}

export function sanitizeProfileWalletSnapshot(value) {
  if (!isProfileWalletSnapshot(value)) return undefined
  return {
    balance: value.balance,
    profileId: value.profileId,
    revision: value.revision,
    updatedAt: value.updatedAt,
  }
}

export function isProfileMoneyOperation(value) {
  if (!value || typeof value !== 'object') return false
  if (
    !isNonnegativeSafeInteger(value.baseRevision) ||
    !isCanonicalProfileMoneyOperationId(value.operationId)
  ) {
    return false
  }
  if (value.kind === 'zombie-kill-reward') return true
  return value.kind === 'weapon-purchase' && isPositiveProfileMoney(value.cost)
}

export function sanitizeProfileMoneyOperation(value) {
  if (!isProfileMoneyOperation(value)) return undefined
  if (value.kind === 'zombie-kill-reward') {
    return {
      baseRevision: value.baseRevision,
      kind: value.kind,
      operationId: value.operationId,
    }
  }
  return {
    baseRevision: value.baseRevision,
    cost: value.cost,
    kind: value.kind,
    operationId: value.operationId,
  }
}

export function isApplyProfileMoneyOperationMessage(value) {
  if (!value || typeof value !== 'object') return false
  return (
    value.type === 'apply-profile-money-operation' &&
    isProfileMoneyOperation(value.operation) &&
    isParcelWriterEpoch(value.writerEpoch) &&
    typeof value.writerSessionId === 'string' &&
    value.writerSessionId.length > 0 &&
    value.writerSessionId === sanitizeParcelWriterSessionId(value.writerSessionId)
  )
}

export function isReportZombieEscapeDeathMessage(value) {
  if (!value || typeof value !== 'object') return false
  return (
    value.type === 'report-zombie-escape-death' &&
    typeof value.sessionId === 'string' &&
    value.sessionId.length > 0 &&
    value.sessionId.length <= MAX_ZOMBIE_ESCAPE_SESSION_ID_LENGTH &&
    Number.isSafeInteger(value.night) &&
    value.night > 0
  )
}

export function isSpatialVoiceSignalPayload(value) {
  if (!value || typeof value !== 'object') return false
  if (value.type === 'disconnect' || value.type === 'ready') return true
  if (value.type === 'ice-candidate') {
    return Boolean(value.candidate) && typeof value.candidate === 'object'
  }
  return (
    value.type === 'description' &&
    (value.description?.type === 'offer' || value.description?.type === 'answer') &&
    typeof value.description.sdp === 'string' &&
    value.description.sdp.length <= 120_000
  )
}

export function isMultiplayerPlayerPose(value) {
  return value === 'crouching' || value === 'falling'
}

export function isMultiplayerZombieEscapeStateSnapshot(value) {
  if (!value || typeof value !== 'object') return false
  return (
    typeof value.sessionId === 'string' &&
    value.sessionId.length > 0 &&
    value.sessionId.length <= MAX_ZOMBIE_ESCAPE_SESSION_ID_LENGTH &&
    Number.isSafeInteger(value.revision) &&
    value.revision >= 0 &&
    (value.phase === 'build' || value.phase === 'night') &&
    Number.isSafeInteger(value.night) &&
    value.night >= 0 &&
    (value.phase !== 'night' || value.night > 0) &&
    (value.phase === 'build'
      ? value.phaseEndsAt === null
      : Number.isSafeInteger(value.phaseEndsAt) && value.phaseEndsAt >= 0)
  )
}

function isCanonicalProfileMoneyOperationId(value) {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    value === sanitizeProfileMoneyOperationId(value)
  )
}

function isNonnegativeSafeInteger(value) {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
}

function isProfileMoney(value) {
  return isNonnegativeSafeInteger(value) && value <= MAX_PROFILE_MONEY
}

function isPositiveProfileMoney(value) {
  return isProfileMoney(value) && value > 0
}

export function sanitizeMultiplayerZombieEscapeStateSnapshot(value) {
  if (!isMultiplayerZombieEscapeStateSnapshot(value)) return undefined
  return {
    night: value.night,
    phase: value.phase,
    phaseEndsAt: value.phaseEndsAt,
    revision: value.revision,
    sessionId: value.sessionId,
  }
}

export function isMultiplayerPlayerCombatSnapshot(value) {
  if (!value || typeof value !== 'object') return false
  return (
    Number.isFinite(value.aimAngle) &&
    Number.isSafeInteger(value.ammo) &&
    value.ammo >= 0 &&
    isCombatWeaponIndex(value.weaponIndex) &&
    Number.isInteger(value.shotSequence) &&
    value.shotSequence >= 0 &&
    value.shotSequence <= 0xffff_ffff &&
    ['active', 'idle', 'recovery', 'windup'].includes(value.meleePhase) &&
    Number.isFinite(value.meleeProgress) &&
    value.meleeProgress >= 0 &&
    value.meleeProgress <= 1 &&
    Array.isArray(value.shots) &&
    value.shots.length <= MAX_MULTIPLAYER_COMBAT_SHOTS &&
    value.shots.every(isCombatShotSnapshot)
  )
}

export function sanitizeMultiplayerPlayerCombatSnapshot(value) {
  if (!isMultiplayerPlayerCombatSnapshot(value)) return undefined
  return {
    aimAngle: value.aimAngle,
    ammo: value.ammo,
    meleePhase: value.meleePhase,
    meleeProgress: value.meleeProgress,
    shotSequence: value.shotSequence,
    shots: value.shots.map((shot) => ({
      id: shot.id,
      impactAge: shot.impactAge,
      position: [...shot.position],
      previousPosition: [...shot.previousPosition],
      weaponIndex: shot.weaponIndex,
    })),
    weaponIndex: value.weaponIndex,
  }
}

function isCombatWeaponIndex(value) {
  return Number.isInteger(value) && value >= 0 && value < 5
}

function isCombatPoint(value) {
  return Array.isArray(value) && value.length === 3 && value.every(Number.isFinite)
}

function isCombatShotSnapshot(value) {
  return (
    value !== null &&
    typeof value === 'object' &&
    Number.isSafeInteger(value.id) &&
    value.id > 0 &&
    isCombatWeaponIndex(value.weaponIndex) &&
    isCombatPoint(value.position) &&
    isCombatPoint(value.previousPosition) &&
    (value.impactAge === null ||
      (Number.isFinite(value.impactAge) && value.impactAge >= 0 && value.impactAge <= 1))
  )
}
