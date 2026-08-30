import { type Box3, type Camera, type Matrix4, type Object3D, Plane, Vector3 } from 'three'

export type LandrushRobotRevealOwnerObservation = {
  enterIntersects: boolean
  exitIntersects: boolean
  ownerId: string
}

export type LandrushRobotRevealOwnerState = {
  exitMissStartedAtMs: number | null
  lastEvaluatedAtMs: number
  lastObservationGeneration: number
}

export type LandrushRobotRevealAperture = {
  boundaryFar: Vector3[]
  boundaryNear: Vector3[]
  cameraForward: Vector3
  cameraPosition: Vector3
  centerPoint: Vector3
  farDepth: number
  halfSize: Vector3
  nearDepth: number
  planes: Plane[]
  supportPoint: Vector3
  worldCenter: Vector3
}

export function createLandrushRobotRevealAperture(segmentCount: number) {
  const count = Math.max(3, Math.floor(segmentCount))
  return {
    boundaryFar: Array.from({ length: count }, () => new Vector3()),
    boundaryNear: Array.from({ length: count }, () => new Vector3()),
    cameraForward: new Vector3(),
    cameraPosition: new Vector3(),
    centerPoint: new Vector3(),
    farDepth: 0,
    halfSize: new Vector3(),
    nearDepth: 0,
    planes: Array.from({ length: count }, () => new Plane()),
    supportPoint: new Vector3(),
    worldCenter: new Vector3(),
  } satisfies LandrushRobotRevealAperture
}

export function shouldUpdateLandrushRobotRevealClippingPlanes({
  camera,
  lastCamera,
  lastProjectionMatrix,
  lastWorldMatrix,
  maskChanged,
}: {
  camera: Camera
  lastCamera: Camera | null
  lastProjectionMatrix: Matrix4
  lastWorldMatrix: Matrix4
  maskChanged: boolean
}) {
  if (maskChanged || lastCamera !== camera) return true

  const projectionElements = camera.projectionMatrix.elements
  const lastProjectionElements = lastProjectionMatrix.elements
  const worldElements = camera.matrixWorld.elements
  const lastWorldElements = lastWorldMatrix.elements
  for (let index = 0; index < 16; index += 1) {
    if (
      Math.abs((projectionElements[index] ?? 0) - (lastProjectionElements[index] ?? 0)) >
        0.000_001 ||
      Math.abs((worldElements[index] ?? 0) - (lastWorldElements[index] ?? 0)) > 0.000_001
    ) {
      return true
    }
  }
  return false
}

export function updateLandrushRobotRevealAperture({
  aperture,
  camera,
  centerX,
  centerY,
  farDepth,
  height,
  ndcZ,
  radiusPx,
  width,
}: {
  aperture: LandrushRobotRevealAperture
  camera: Camera
  centerX: number
  centerY: number
  farDepth: number
  height: number
  ndcZ: number
  radiusPx: number
  width: number
}) {
  camera.updateWorldMatrix(true, false)
  aperture.cameraPosition.setFromMatrixPosition(camera.matrixWorld)
  camera.getWorldDirection(aperture.cameraForward).normalize()
  const cameraNear = (camera as Camera & { near?: number }).near
  aperture.nearDepth = Math.max(0, cameraNear ?? 0)
  aperture.farDepth = Math.max(aperture.nearDepth, farDepth)
  const centerNdcX = (centerX / width) * 2 - 1
  const centerNdcY = -(centerY / height) * 2 + 1
  const radiusNdcX = (radiusPx / width) * 2
  const radiusNdcY = (radiusPx / height) * 2
  aperture.centerPoint.set(centerNdcX, centerNdcY, ndcZ).unproject(camera)

  for (let index = 0; index < aperture.planes.length; index += 1) {
    const angle = (index / aperture.planes.length) * Math.PI * 2
    const ndcX = centerNdcX + Math.cos(angle) * radiusNdcX
    const ndcY = centerNdcY + Math.sin(angle) * radiusNdcY
    aperture.boundaryNear[index]?.set(ndcX, ndcY, -1).unproject(camera)
    aperture.boundaryFar[index]?.set(ndcX, ndcY, ndcZ).unproject(camera)
  }

  for (let index = 0; index < aperture.planes.length; index += 1) {
    const nextIndex = (index + 1) % aperture.planes.length
    const nearPoint = aperture.boundaryNear[index]
    const farPoint = aperture.boundaryFar[index]
    const nextFarPoint = aperture.boundaryFar[nextIndex]
    const plane = aperture.planes[index]
    if (!(nearPoint && farPoint && nextFarPoint && plane)) continue
    plane.setFromCoplanarPoints(nearPoint, farPoint, nextFarPoint)
    if (plane.distanceToPoint(aperture.centerPoint) > 0) plane.negate()
  }
  return aperture
}

export function landrushRobotRevealApertureIntersectsBox(
  aperture: LandrushRobotRevealAperture,
  bounds: Box3,
) {
  if (bounds.isEmpty()) return false
  bounds.getCenter(aperture.worldCenter)
  bounds.getSize(aperture.halfSize).multiplyScalar(0.5)
  const centerDepth = aperture.worldCenter.sub(aperture.cameraPosition).dot(aperture.cameraForward)
  const depthExtent =
    Math.abs(aperture.cameraForward.x) * aperture.halfSize.x +
    Math.abs(aperture.cameraForward.y) * aperture.halfSize.y +
    Math.abs(aperture.cameraForward.z) * aperture.halfSize.z
  if (
    centerDepth + depthExtent < aperture.nearDepth ||
    centerDepth - depthExtent > aperture.farDepth
  ) {
    return false
  }

  for (const plane of aperture.planes) {
    aperture.supportPoint.set(
      plane.normal.x >= 0 ? bounds.min.x : bounds.max.x,
      plane.normal.y >= 0 ? bounds.min.y : bounds.max.y,
      plane.normal.z >= 0 ? bounds.min.z : bounds.max.z,
    )
    if (plane.distanceToPoint(aperture.supportPoint) > 0) return false
  }
  return true
}

export function classifyLandrushRobotRevealOwnerBounds({
  boundsByOwnerId,
  enterAperture,
  exitAperture,
  target,
}: {
  boundsByOwnerId: ReadonlyMap<string, { bounds: Box3 }>
  enterAperture: LandrushRobotRevealAperture
  exitAperture: LandrushRobotRevealAperture
  target: LandrushRobotRevealOwnerObservation[]
}) {
  let index = 0
  for (const [ownerId, { bounds }] of boundsByOwnerId) {
    const enterIntersects = landrushRobotRevealApertureIntersectsBox(enterAperture, bounds)
    const exitIntersects =
      enterIntersects || landrushRobotRevealApertureIntersectsBox(exitAperture, bounds)
    const observation = target[index]
    if (observation) {
      observation.enterIntersects = enterIntersects
      observation.exitIntersects = exitIntersects
      observation.ownerId = ownerId
    } else {
      target[index] = { enterIntersects, exitIntersects, ownerId }
    }
    index += 1
  }
  target.length = index
  return target
}

export function isLandrushRobotRevealOwnerRootLive({
  ownerId,
  ownerRoot,
  resolveSemanticRoot,
  scene,
}: {
  ownerId: string
  ownerRoot: Object3D
  resolveSemanticRoot: (nodeId: string) => Object3D | undefined
  scene: Object3D
}) {
  if (ownerId.startsWith('node:')) {
    return resolveSemanticRoot(ownerId.slice('node:'.length)) === ownerRoot
  }

  let object: Object3D | null = ownerRoot
  while (object) {
    if (object === scene) return true
    object = object.parent
  }
  return false
}

export function reconcileLandrushRobotRevealOwnerStates({
  exitGraceMs,
  liveOwnerIds,
  nowMs,
  observationByOwnerId,
  observationGeneration,
  observations,
  states,
  target,
}: {
  exitGraceMs: number
  liveOwnerIds: ReadonlySet<string>
  nowMs: number
  observationByOwnerId: Map<string, LandrushRobotRevealOwnerObservation>
  observationGeneration: number
  observations: readonly LandrushRobotRevealOwnerObservation[]
  states: Map<string, LandrushRobotRevealOwnerState>
  target: Set<string>
}) {
  observationByOwnerId.clear()
  for (const observation of observations) {
    observationByOwnerId.set(observation.ownerId, observation)
  }
  const graceMs = Math.max(0, exitGraceMs)

  for (const [ownerId, state] of states) {
    if (!liveOwnerIds.has(ownerId)) {
      states.delete(ownerId)
      continue
    }
    if (observationGeneration <= state.lastObservationGeneration) continue

    const observation = observationByOwnerId.get(ownerId)
    const evaluatedAtMs = Math.max(state.lastEvaluatedAtMs, nowMs)
    state.lastEvaluatedAtMs = evaluatedAtMs
    state.lastObservationGeneration = observationGeneration
    if (observation?.exitIntersects) {
      state.exitMissStartedAtMs = null
      continue
    }
    state.exitMissStartedAtMs ??= evaluatedAtMs
    if (evaluatedAtMs - state.exitMissStartedAtMs >= graceMs) states.delete(ownerId)
  }

  for (const observation of observations) {
    if (
      states.has(observation.ownerId) ||
      !liveOwnerIds.has(observation.ownerId) ||
      !observation.enterIntersects
    ) {
      continue
    }
    states.set(observation.ownerId, {
      exitMissStartedAtMs: null,
      lastEvaluatedAtMs: Math.max(0, nowMs),
      lastObservationGeneration: observationGeneration,
    })
  }

  target.clear()
  for (const ownerId of states.keys()) target.add(ownerId)
  return target
}
