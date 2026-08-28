import { type Intersection, Matrix3, type Mesh, Raycaster, Vector3 } from 'three'

export const ZOMBIE_ESCAPE_GROUND_SHADOW = Object.freeze({
  aspectRatio: 0.86,
  baseOpacity: 0.58,
  baseRadius: 0.28,
  maximumAltitude: 1.8,
  minimumOpacityScale: 0.62,
  minimumRadiusScale: 0.62,
  surfaceOffset: 0.045,
})

const GROUND_SHADOW_RAY_ORIGIN_OFFSET = 0.025
const GROUND_SHADOW_DOWN = new Vector3(0, -1, 0)
const GROUND_SHADOW_UP = new Vector3(0, 1, 0)
const GROUND_SHADOW_ROTATION_RESPONSE = 18
const GROUND_SHADOW_ROTATION_MINIMUM_TRAVEL_SQUARED = 0.000_000_01
const GROUND_SHADOW_ROTATION_MAXIMUM_TRAVEL_SQUARED = 0.75 * 0.75
const GROUND_SHADOW_ROTATION_MAXIMUM_DELTA_SECONDS = 0.05

export type ZombieEscapeGroundShadowProjector = {
  eligibleMeshes: Mesh[]
  hits: Intersection<Mesh>[]
  maximumSlopeRadians: number
  normalMatrix: Matrix3
  raycaster: Raycaster
  worldNormal: Vector3
}

export function createZombieEscapeGroundShadowProjector(
  maximumSlopeRadians: number,
): ZombieEscapeGroundShadowProjector {
  return {
    eligibleMeshes: [],
    hits: [],
    maximumSlopeRadians,
    normalMatrix: new Matrix3(),
    raycaster: new Raycaster(),
    worldNormal: new Vector3(),
  }
}

export function projectZombieEscapeGroundShadowSupportY(
  colliderMeshes: Mesh[],
  playerX: number,
  playerY: number,
  playerZ: number,
  maximumDistance: number,
  projector: ZombieEscapeGroundShadowProjector,
) {
  const { maximumSlopeRadians } = projector
  if (
    !(Number.isFinite(playerX) && Number.isFinite(playerY) && Number.isFinite(playerZ)) ||
    !(Number.isFinite(maximumDistance) && maximumDistance >= 0) ||
    !(Number.isFinite(maximumSlopeRadians) && maximumSlopeRadians > 0)
  ) {
    return null
  }

  const { eligibleMeshes, hits, normalMatrix, raycaster, worldNormal } = projector
  eligibleMeshes.length = 0
  hits.length = 0
  raycaster.near = 0
  raycaster.far = maximumDistance + GROUND_SHADOW_RAY_ORIGIN_OFFSET
  raycaster.set(
    raycaster.ray.origin.set(playerX, playerY + GROUND_SHADOW_RAY_ORIGIN_OFFSET, playerZ),
    GROUND_SHADOW_DOWN,
  )

  for (const mesh of colliderMeshes) {
    if (!(mesh.visible && mesh.geometry.boundsTree) || mesh.userData.excludeFloatHit === true)
      continue
    mesh.updateWorldMatrix(true, false)
    eligibleMeshes.push(mesh)
  }
  raycaster.intersectObjects(eligibleMeshes, false, hits)

  let supportY: number | null = null
  for (const hit of hits) {
    if (!hit.face || hit.point.y > playerY + GROUND_SHADOW_RAY_ORIGIN_OFFSET) continue
    normalMatrix.getNormalMatrix(hit.object.matrixWorld)
    worldNormal.copy(hit.face.normal).applyMatrix3(normalMatrix).normalize()
    if (worldNormal.angleTo(GROUND_SHADOW_UP) >= maximumSlopeRadians) continue
    supportY = hit.point.y
    break
  }
  eligibleMeshes.length = 0
  hits.length = 0
  return supportY
}

export type ZombieEscapeGroundShadowEnvelope = {
  altitude: number
  opacity: number
  radius: number
  y: number
}

export function resolveZombieEscapeGroundShadowRenderSupportY({
  lastSupportY,
  playerY,
  projectedSupportY,
  projectedVisible,
}: {
  lastSupportY: number
  playerY: number
  projectedSupportY: number
  projectedVisible: boolean
}) {
  if (projectedVisible && Number.isFinite(projectedSupportY)) return projectedSupportY
  if (!(Number.isFinite(playerY) && Number.isFinite(lastSupportY))) return null

  const altitude = playerY - lastSupportY
  if (altitude <= 0 || altitude > ZOMBIE_ESCAPE_GROUND_SHADOW.maximumAltitude) return null
  return lastSupportY
}

export function resolveZombieEscapeGroundShadowMovementRotation({
  currentRotation,
  deltaSeconds,
  deltaX,
  deltaZ,
}: {
  currentRotation: number
  deltaSeconds: number
  deltaX: number
  deltaZ: number
}) {
  const resolvedCurrentRotation = Number.isFinite(currentRotation) ? currentRotation : 0
  if (
    !(Number.isFinite(deltaSeconds) && deltaSeconds > 0) ||
    !(Number.isFinite(deltaX) && Number.isFinite(deltaZ))
  ) {
    return resolvedCurrentRotation
  }

  const travelSquared = deltaX * deltaX + deltaZ * deltaZ
  if (
    travelSquared < GROUND_SHADOW_ROTATION_MINIMUM_TRAVEL_SQUARED ||
    travelSquared > GROUND_SHADOW_ROTATION_MAXIMUM_TRAVEL_SQUARED
  ) {
    return resolvedCurrentRotation
  }

  const targetRotation = Math.atan2(-deltaZ, deltaX)
  const doubledDelta = (targetRotation - resolvedCurrentRotation) * 2
  const nearestHalfTurnDelta = Math.atan2(Math.sin(doubledDelta), Math.cos(doubledDelta)) / 2
  const clampedDeltaSeconds = Math.min(deltaSeconds, GROUND_SHADOW_ROTATION_MAXIMUM_DELTA_SECONDS)
  const response = 1 - Math.exp(-GROUND_SHADOW_ROTATION_RESPONSE * clampedDeltaSeconds)
  return resolvedCurrentRotation + nearestHalfTurnDelta * response
}

export function resolveZombieEscapeGroundShadowEnvelope(
  playerY: number,
  supportY: number,
  output: ZombieEscapeGroundShadowEnvelope,
) {
  const resolvedSupportY = Number.isFinite(supportY) ? supportY : 0
  const resolvedPlayerY = Number.isFinite(playerY) ? playerY : resolvedSupportY
  const altitude = Math.max(0, resolvedPlayerY - resolvedSupportY)
  const normalizedAltitude = Math.min(1, altitude / ZOMBIE_ESCAPE_GROUND_SHADOW.maximumAltitude)
  const easedAltitude = normalizedAltitude * normalizedAltitude * (3 - normalizedAltitude * 2)
  const radiusScale = 1 - (1 - ZOMBIE_ESCAPE_GROUND_SHADOW.minimumRadiusScale) * easedAltitude
  const opacityScale = 1 - (1 - ZOMBIE_ESCAPE_GROUND_SHADOW.minimumOpacityScale) * easedAltitude

  output.altitude = altitude
  output.opacity = ZOMBIE_ESCAPE_GROUND_SHADOW.baseOpacity * opacityScale
  output.radius = ZOMBIE_ESCAPE_GROUND_SHADOW.baseRadius * radiusScale
  output.y = resolvedSupportY + ZOMBIE_ESCAPE_GROUND_SHADOW.surfaceOffset
  return output
}
