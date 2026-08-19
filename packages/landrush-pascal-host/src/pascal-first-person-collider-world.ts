import { buildFirstPersonColliderWorld, type FirstPersonColliderWorld } from '@landrush/runtime'
import {
  type AnyNode,
  type AnyNodeId,
  type DoorNode,
  type FenceNode,
  getFenceCenterlineFrameAt,
  getFenceCenterlineLength,
  getGarageVisibleOpeningRatio,
  isOperationDoorType,
  nodeRegistry,
  type StairNode,
  type StairSegmentNode,
  sceneRegistry,
  useInteractive,
  useScene,
} from '@pascal-app/core'
import * as THREE from 'three'

const SKIPPED_MESH_NAMES = new Set(['cutout', 'collision-mesh'])
const COLLIDER_NODE_CATEGORIES = new Set(['structure', 'furnish'])
const DEDICATED_COLLIDER_NODE_TYPES = new Set<AnyNode['type']>(['elevator', 'stair-segment'])
const DOOR_LEAF_COLLIDER_DEPTH = 0.06
const OPERATION_DOOR_COLLIDER_OPEN_THRESHOLD = 0.85
const LEVEL_FALLBACK_FLOOR_THICKNESS = 0.08
const LEVEL_FALLBACK_FLOOR_PADDING = 2
const LEVEL_FALLBACK_FLOOR_MIN_SIZE = 30
const SITE_GROUND_COLLIDER_MIN_SIZE = 2000
const FENCE_COLLIDER_MAX_SEGMENT_LENGTH = 0.75

type LevelNode = Extract<AnyNode, { type: 'level' }>
type SiteNode = Extract<AnyNode, { type: 'site' }>
type SceneNodes = ReturnType<typeof useScene.getState>['nodes']
type StairSegmentTransform = {
  position: [number, number, number]
  rotation: number
}

function rotatePlanVector(x: number, z: number, rotation: number): [number, number] {
  const cosine = Math.cos(rotation)
  const sine = Math.sin(rotation)
  return [x * cosine - z * sine, x * sine + z * cosine]
}

function computeFloorplanStairSegmentTransforms(
  segments: StairSegmentNode[],
): StairSegmentTransform[] {
  const transforms: StairSegmentTransform[] = []
  let currentX = 0
  let currentY = 0
  let currentZ = 0
  let currentRotation = 0

  for (let index = 0; index < segments.length; index += 1) {
    const segment = segments[index]!
    if (index > 0) {
      const previousSegment = segments[index - 1]!
      let attachX = 0
      const attachY = previousSegment.height
      let attachZ = previousSegment.length
      let rotationDelta = 0

      if (segment.attachmentSide === 'left') {
        attachX = previousSegment.width / 2
        attachZ = previousSegment.length / 2
        rotationDelta = Math.PI / 2
      } else if (segment.attachmentSide === 'right') {
        attachX = -previousSegment.width / 2
        attachZ = previousSegment.length / 2
        rotationDelta = -Math.PI / 2
      }

      const [rotatedAttachX, rotatedAttachZ] = rotatePlanVector(attachX, attachZ, currentRotation)
      currentX += rotatedAttachX
      currentY += attachY
      currentZ += rotatedAttachZ
      currentRotation += rotationDelta
    }

    transforms.push({
      position: [currentX, currentY, currentZ],
      rotation: currentRotation,
    })
  }

  return transforms
}

function computeSceneBoundsXZ(nodes: AnyNode[] | SceneNodes) {
  const values = Array.isArray(nodes) ? nodes : Object.values(nodes)
  let minX = Number.POSITIVE_INFINITY
  let minZ = Number.POSITIVE_INFINITY
  let maxX = Number.NEGATIVE_INFINITY
  let maxZ = Number.NEGATIVE_INFINITY

  const include = (x: unknown, z: unknown) => {
    if (!(typeof x === 'number' && typeof z === 'number')) return
    if (!(Number.isFinite(x) && Number.isFinite(z))) return
    minX = Math.min(minX, x)
    minZ = Math.min(minZ, z)
    maxX = Math.max(maxX, x)
    maxZ = Math.max(maxZ, z)
  }

  for (const node of values) {
    const record = node as unknown as Record<string, unknown>
    for (const key of ['start', 'end'] as const) {
      const point = record[key]
      if (Array.isArray(point)) include(point[0], point[1])
    }
    const position = record.position
    if (Array.isArray(position)) include(position[0], position[2])
    const polygon = record.polygon
    const points = Array.isArray(polygon)
      ? polygon
      : polygon && typeof polygon === 'object'
        ? (polygon as { points?: unknown }).points
        : null
    if (Array.isArray(points)) {
      for (const point of points) {
        if (Array.isArray(point)) include(point[0], point[1])
      }
    }
  }

  if (!Number.isFinite(minX)) return null
  return {
    center: [(minX + maxX) / 2, (minZ + maxZ) / 2] as [number, number],
    size: [maxX - minX, maxZ - minZ] as [number, number],
  }
}

function isMesh(object: THREE.Object3D): object is THREE.Mesh {
  return 'isMesh' in object && (object as THREE.Mesh).isMesh
}

// Renderer-effective visibility: an invisible ancestor hides the whole
// subtree at render time even when the object's own flag is true. The
// collider world must match what's rendered — the roof keeps stale,
// UNCUT per-segment CSG inside its hidden `segments-wrapper` (full-edit
// exit hides the wrapper without stripping geometry), and cloning those
// meshes would block the walkthrough player at openings the visible
// merged shell has cut through.
function isEffectivelyVisible(object: THREE.Object3D) {
  let current: THREE.Object3D | null = object
  while (current) {
    if (!current.visible) return false
    current = current.parent
  }
  return true
}

function isColliderMaterialVisible(material: THREE.Material | THREE.Material[]) {
  return Array.isArray(material) ? material.some((entry) => entry.visible) : material.visible
}

function isGenericColliderNode(node: AnyNode) {
  if (node.visible === false) return false
  if (DEDICATED_COLLIDER_NODE_TYPES.has(node.type)) return false
  const def = nodeRegistry.get(node.type)
  // Ceilings are a transparent mount surface for fixtures (lights, fans), not a
  // walkable or blocking structure — the walkthrough player must pass through
  // them rather than be held up as if standing on a floor slab.
  if (def?.surfaceRole === 'ceiling') return false
  return COLLIDER_NODE_CATEGORIES.has(def?.category ?? '')
}

function createBoxColliderGeometry(width: number, height: number, depth: number) {
  const sourceGeometry = new THREE.BoxGeometry(width, height, depth).toNonIndexed()
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', sourceGeometry.getAttribute('position').clone())
  geometry.setAttribute('normal', sourceGeometry.getAttribute('normal').clone())
  sourceGeometry.dispose()
  return geometry
}

function getVisibleLevelChildren(level: LevelNode, nodes: SceneNodes) {
  return level.children
    .map((childId) => nodes[childId as AnyNodeId])
    .filter((child): child is AnyNode => Boolean(child && child.visible !== false))
}

function createLevelFallbackFloorGeometry(level: LevelNode, nodes: SceneNodes) {
  if (level.visible === false) return null

  const children = getVisibleLevelChildren(level, nodes)
  if (children.some((child) => child.type === 'slab')) return null

  const levelObject = sceneRegistry.nodes.get(level.id)
  if (!levelObject?.visible) return null

  const bounds = computeSceneBoundsXZ(children)
  const [centerX, centerZ] = bounds?.center ?? [0, 0]
  const [boundsWidth, boundsDepth] = bounds?.size ?? [0, 0]
  const width = Math.max(
    boundsWidth + LEVEL_FALLBACK_FLOOR_PADDING * 2,
    LEVEL_FALLBACK_FLOOR_MIN_SIZE,
  )
  const depth = Math.max(
    boundsDepth + LEVEL_FALLBACK_FLOOR_PADDING * 2,
    LEVEL_FALLBACK_FLOOR_MIN_SIZE,
  )

  const geometry = createBoxColliderGeometry(width, LEVEL_FALLBACK_FLOOR_THICKNESS, depth)

  levelObject.updateWorldMatrix(true, false)
  geometry.applyMatrix4(
    new THREE.Matrix4().makeTranslation(centerX, -LEVEL_FALLBACK_FLOOR_THICKNESS / 2, centerZ),
  )
  geometry.applyMatrix4(levelObject.matrixWorld)
  return geometry
}

function collectLevelFallbackFloorGeometries(nodes: SceneNodes) {
  const geometries: THREE.BufferGeometry[] = []

  for (const levelId of sceneRegistry.byType.level!) {
    const node = nodes[levelId as AnyNodeId]
    if (node?.type !== 'level') continue

    const geometry = createLevelFallbackFloorGeometry(node, nodes)
    if (geometry) geometries.push(geometry)
  }

  return geometries
}

// The visible ground is the site node's ground mesh, but `site` is a `site`
// category node and therefore excluded from the generic collider sweep. Without
// a dedicated collider, a spawn on the bare ground (no slab, or not parented to
// a level that triggers the per-level fallback) has no floor to stand on and the
// walkthrough player falls through. Derive a thin ground slab from node data (not
// the rendered mesh) so it exists regardless of geometry-mount timing. The slab
// is effectively unbounded (not sized to the site polygon): the ground plane must
// keep holding the player up even after they step past the site boundary,
// otherwise they fall below the ground plane into the void.
function createSiteGroundColliderGeometry(site: SiteNode, nodes: SceneNodes) {
  if (site.visible === false) return null

  const siteObject = sceneRegistry.nodes.get(site.id)
  if (!siteObject?.visible) return null

  const bounds = computeSceneBoundsXZ(nodes)
  const [centerX, centerZ] = bounds?.center ?? [0, 0]
  const [boundsWidth, boundsDepth] = bounds?.size ?? [0, 0]
  const width = Math.max(
    boundsWidth + LEVEL_FALLBACK_FLOOR_PADDING * 2,
    SITE_GROUND_COLLIDER_MIN_SIZE,
  )
  const depth = Math.max(
    boundsDepth + LEVEL_FALLBACK_FLOOR_PADDING * 2,
    SITE_GROUND_COLLIDER_MIN_SIZE,
  )

  const geometry = createBoxColliderGeometry(width, LEVEL_FALLBACK_FLOOR_THICKNESS, depth)

  siteObject.updateWorldMatrix(true, false)
  geometry.applyMatrix4(
    new THREE.Matrix4().makeTranslation(centerX, -LEVEL_FALLBACK_FLOOR_THICKNESS / 2, centerZ),
  )
  geometry.applyMatrix4(siteObject.matrixWorld)
  return geometry
}

function collectSiteGroundColliderGeometries(nodes: SceneNodes) {
  const geometries: THREE.BufferGeometry[] = []

  for (const siteId of sceneRegistry.byType.site ?? []) {
    const node = nodes[siteId as AnyNodeId]
    if (node?.type !== 'site') continue

    const geometry = createSiteGroundColliderGeometry(node, nodes)
    if (geometry) geometries.push(geometry)
  }

  return geometries
}

// Decode any attribute (interleaved, quantized/normalized integer, Float64…) into a
// plain, non-normalized Float32Array BufferAttribute. mergeGeometries() requires every
// merged geometry to share the same typed-array constructor for matching attributes, so
// imported item GLBs using KHR_mesh_quantization or interleaved buffers must be coerced
// to Float32 to match wall/slab geometry.
function toFloat32Attribute(source: THREE.BufferAttribute | THREE.InterleavedBufferAttribute) {
  const itemSize = source.itemSize
  const array = new Float32Array(source.count * itemSize)
  for (let i = 0; i < source.count; i++) {
    const offset = i * itemSize
    array[offset] = source.getX(i)
    if (itemSize > 1) array[offset + 1] = source.getY(i)
    if (itemSize > 2) array[offset + 2] = source.getZ(i)
    if (itemSize > 3) array[offset + 3] = source.getW(i)
  }
  return new THREE.BufferAttribute(array, itemSize)
}

function cloneWorldGeometry(mesh: THREE.Mesh) {
  const sourceGeometry = mesh.geometry
  const position = sourceGeometry.getAttribute('position')
  if (!position || position.count < 3) return null

  const workingGeometry = sourceGeometry.index
    ? sourceGeometry.toNonIndexed()
    : sourceGeometry.clone()
  const cleanGeometry = new THREE.BufferGeometry()
  cleanGeometry.setAttribute(
    'position',
    toFloat32Attribute(workingGeometry.getAttribute('position')),
  )

  const normal = workingGeometry.getAttribute('normal')
  if (normal) {
    cleanGeometry.setAttribute('normal', toFloat32Attribute(normal))
  } else {
    cleanGeometry.computeVertexNormals()
  }

  cleanGeometry.applyMatrix4(mesh.matrixWorld)
  workingGeometry.dispose()

  const worldPosition = cleanGeometry.getAttribute('position')
  if (!worldPosition || worldPosition.count < 3) {
    cleanGeometry.dispose()
    return null
  }

  return cleanGeometry
}

function shouldSkipColliderNode(node: AnyNode) {
  if (node.type === 'window') {
    return node.openingKind === 'opening'
  }

  if (node.type !== 'door') return false

  if (!node.segments.length) return true

  if (node.openingKind === 'opening') return true

  return node.segments.every((segment: { type: string }) => segment.type === 'empty')
}

function createDoorLeafColliderGeometry(root: THREE.Object3D, node: DoorNode) {
  const hasLeafContent = node.segments.some((segment) => segment.type !== 'empty')
  if (!hasLeafContent) return null

  const leafW = node.width - 2 * node.frameThickness
  const leafH = node.height - node.frameThickness
  if (leafW <= 0 || leafH <= 0) return null

  const leafCenterY = -node.frameThickness / 2
  const runtimeDoorState = useInteractive.getState().doors[node.id]
  const operationState = runtimeDoorState?.operationState ?? node.operationState
  const swingAngle = runtimeDoorState?.swingAngle ?? node.swingAngle

  root.updateWorldMatrix(true, false)

  if (node.doorType === 'garage-sectional' || node.doorType === 'garage-rollup') {
    const openAmount = getGarageVisibleOpeningRatio(node.doorType, operationState)
    const visibleHeight = leafH * (1 - openAmount)
    if (visibleHeight <= 0.12) return null

    const geometry = createBoxColliderGeometry(leafW, visibleHeight, DOOR_LEAF_COLLIDER_DEPTH)
    const visibleCenterY = leafCenterY - leafH / 2 + visibleHeight / 2
    geometry.applyMatrix4(
      root.matrixWorld.clone().multiply(new THREE.Matrix4().makeTranslation(0, visibleCenterY, 0)),
    )
    return geometry
  }

  if (
    isOperationDoorType(node.doorType) &&
    (operationState ?? 0) >= OPERATION_DOOR_COLLIDER_OPEN_THRESHOLD
  ) {
    return null
  }

  const hingeX = node.hingesSide === 'right' ? leafW / 2 : -leafW / 2
  const swingDirectionSign = node.swingDirection === 'inward' ? 1 : -1
  const hingeDirectionSign = node.hingesSide === 'right' ? 1 : -1
  const clampedSwingAngle = Math.max(0, Math.min(Math.PI / 2, swingAngle ?? 0))
  const leafSwingRotation = clampedSwingAngle * swingDirectionSign * hingeDirectionSign

  const geometry = createBoxColliderGeometry(leafW, leafH, DOOR_LEAF_COLLIDER_DEPTH)
  const matrix = root.matrixWorld
    .clone()
    .multiply(new THREE.Matrix4().makeTranslation(hingeX, 0, 0))
    .multiply(new THREE.Matrix4().makeRotationY(leafSwingRotation))
    .multiply(new THREE.Matrix4().makeTranslation(-hingeX, leafCenterY, 0))

  geometry.applyMatrix4(matrix)
  return geometry
}

function createStraightStairRampColliderGeometry(
  segment: StairSegmentNode,
  absoluteHeight: number,
) {
  const width = Math.max(0.01, segment.width)
  const length = Math.max(0.01, segment.length)
  const height = segment.segmentType === 'stair' ? Math.max(0, segment.height) : 0
  const shape = new THREE.Shape()
  shape.moveTo(0, 0)
  shape.lineTo(length, height)

  if (segment.fillToFloor) {
    const fillDepth = Math.max(absoluteHeight, segment.thickness, LEVEL_FALLBACK_FLOOR_THICKNESS)
    shape.lineTo(length, -fillDepth)
    shape.lineTo(0, -fillDepth)
  } else {
    const slopeAngle = Math.atan2(height, length)
    const verticalThickness = segment.thickness / Math.max(0.01, Math.cos(slopeAngle))
    shape.lineTo(length, height - verticalThickness)
    shape.lineTo(0, -verticalThickness)
  }
  shape.closePath()

  const sourceGeometry = new THREE.ExtrudeGeometry(shape, {
    bevelEnabled: false,
    depth: width,
    steps: 1,
  })
  sourceGeometry.applyMatrix4(
    new THREE.Matrix4().makeRotationY(-Math.PI / 2).setPosition(width / 2, 0, 0),
  )
  sourceGeometry.computeVertexNormals()

  const workingGeometry = sourceGeometry.index ? sourceGeometry.toNonIndexed() : sourceGeometry
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', toFloat32Attribute(workingGeometry.getAttribute('position')))
  geometry.setAttribute('normal', toFloat32Attribute(workingGeometry.getAttribute('normal')))
  if (workingGeometry !== sourceGeometry) sourceGeometry.dispose()
  workingGeometry.dispose()
  return geometry
}

function createFenceBarrierColliderGeometries(root: THREE.Object3D, fence: FenceNode) {
  const length = Math.max(0.01, getFenceCenterlineLength(fence))
  const segmentCount = Math.max(1, Math.ceil(length / FENCE_COLLIDER_MAX_SEGMENT_LENGTH))
  const height = Math.max(0.08, fence.height)
  const thickness = Math.max(0.03, fence.thickness)
  const geometries: THREE.BufferGeometry[] = []

  root.updateWorldMatrix(true, false)
  for (let index = 0; index < segmentCount; index += 1) {
    const start = getFenceCenterlineFrameAt(fence, index / segmentCount).point
    const end = getFenceCenterlineFrameAt(fence, (index + 1) / segmentCount).point
    const dx = end.x - start.x
    const dz = end.y - start.y
    const segmentLength = Math.hypot(dx, dz)
    if (segmentLength <= 0.0001) continue

    const geometry = createBoxColliderGeometry(segmentLength + thickness, height, thickness)
    geometry.applyMatrix4(
      new THREE.Matrix4()
        .makeRotationY(-Math.atan2(dz, dx))
        .setPosition((start.x + end.x) / 2, height / 2, (start.y + end.y) / 2),
    )
    geometry.applyMatrix4(root.matrixWorld)
    geometries.push(geometry)
  }

  return geometries
}

function collectStraightStairColliderGeometries(
  root: THREE.Object3D,
  stair: StairNode,
  nodes: SceneNodes,
  visitedMeshes: WeakSet<THREE.Object3D>,
  registeredObjectIds: Map<THREE.Object3D, string>,
  registeredColliderNodeIds: Set<string>,
) {
  if (stair.stairType !== 'straight') return null

  const segments = (stair.children ?? [])
    .map((childId) => nodes[childId as AnyNodeId])
    .filter((node): node is StairSegmentNode => node?.type === 'stair-segment')
  if (segments.length === 0) return null

  root.updateMatrixWorld(true)
  const transforms = computeFloorplanStairSegmentTransforms(segments)
  const geometries: THREE.BufferGeometry[] = []
  for (let index = 0; index < segments.length; index += 1) {
    const segment = segments[index]
    const transform = transforms[index]
    if (!segment || !transform || segment.visible === false) continue

    const geometry = createStraightStairRampColliderGeometry(segment, transform.position[1])
    geometry.applyMatrix4(
      new THREE.Matrix4()
        .makeRotationY(transform.rotation)
        .setPosition(transform.position[0], transform.position[1], transform.position[2]),
    )
    geometry.applyMatrix4(root.matrixWorld)
    geometries.push(geometry)
  }
  if (geometries.length === 0) return null

  const railingRoot = root.getObjectByName('stair-railing')
  if (railingRoot && isEffectivelyVisible(railingRoot)) {
    geometries.push(
      ...collectColliderGeometriesFromNode(
        railingRoot,
        stair.id,
        visitedMeshes,
        registeredObjectIds,
        registeredColliderNodeIds,
      ),
    )
  }
  return geometries
}

function buildRegisteredColliderNodeIds(nodes: SceneNodes) {
  const nodeIds = new Set<string>()

  for (const nodeId of sceneRegistry.nodes.keys()) {
    const node = nodes[nodeId as AnyNodeId]
    if (!node || !isGenericColliderNode(node)) continue
    if (shouldSkipColliderNode(node)) continue
    nodeIds.add(nodeId)
  }

  return nodeIds
}

function collectColliderGeometriesFromNode(
  root: THREE.Object3D,
  rootNodeId: string,
  visitedMeshes: WeakSet<THREE.Object3D>,
  registeredObjectIds: Map<THREE.Object3D, string>,
  registeredColliderNodeIds: Set<string>,
): THREE.BufferGeometry[] {
  const geometries: THREE.BufferGeometry[] = []

  const visit = (object: THREE.Object3D) => {
    if (visitedMeshes.has(object)) return
    visitedMeshes.add(object)

    // Prune hidden subtrees — children of an invisible group never render,
    // so they must not collide either (see isEffectivelyVisible).
    if (!object.visible) return

    if (
      isMesh(object) &&
      isColliderMaterialVisible(object.material) &&
      !SKIPPED_MESH_NAMES.has(object.name)
    ) {
      const geometry = cloneWorldGeometry(object)
      if (geometry) {
        geometries.push(geometry)
      }
    }

    for (const child of object.children) {
      const childNodeId = registeredObjectIds.get(child)
      if (childNodeId && childNodeId !== rootNodeId && registeredColliderNodeIds.has(childNodeId)) {
        continue
      }

      visit(child)
    }
  }

  visit(root)

  return geometries
}

export function buildFirstPersonColliderWorldFromRegistry(): FirstPersonColliderWorld | null {
  const nodes = useScene.getState().nodes
  const geometries: THREE.BufferGeometry[] = []
  const visitedMeshes = new WeakSet<THREE.Object3D>()
  const registeredColliderNodeIds = buildRegisteredColliderNodeIds(nodes)
  const registeredObjectIds = new Map<THREE.Object3D, string>()

  for (const [nodeId, object] of sceneRegistry.nodes) {
    registeredObjectIds.set(object, nodeId)
  }

  for (const nodeId of registeredColliderNodeIds) {
    const node = nodes[nodeId as AnyNodeId]
    if (!node) continue
    const root = sceneRegistry.nodes.get(nodeId)
    if (!root) continue

    // Registered objects can sit inside a hidden wrapper (roof segments
    // under `segments-wrapper`) — the per-node traversal starts AT the
    // object, so the ancestor chain must be checked here.
    if (!isEffectivelyVisible(root)) continue

    if (node.type === 'door') {
      const doorGeometry = createDoorLeafColliderGeometry(root, node)
      if (doorGeometry) {
        geometries.push(doorGeometry)
      }
      continue
    }

    if (node.type === 'fence') {
      geometries.push(...createFenceBarrierColliderGeometries(root, node))
      continue
    }

    if (node.type === 'stair') {
      const stairGeometries = collectStraightStairColliderGeometries(
        root,
        node,
        nodes,
        visitedMeshes,
        registeredObjectIds,
        registeredColliderNodeIds,
      )
      if (stairGeometries) {
        geometries.push(...stairGeometries)
        continue
      }
    }

    root.updateMatrixWorld(true)
    geometries.push(
      ...collectColliderGeometriesFromNode(
        root,
        nodeId,
        visitedMeshes,
        registeredObjectIds,
        registeredColliderNodeIds,
      ),
    )
  }

  geometries.push(...collectLevelFallbackFloorGeometries(nodes))
  geometries.push(...collectSiteGroundColliderGeometries(nodes))

  return buildFirstPersonColliderWorld(geometries)
}
