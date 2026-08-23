import { type Intersection, Matrix3, type Mesh, Raycaster, Vector3 } from 'three'

export const ZOMBIE_ESCAPE_GROUND_SHADOW = Object.freeze({
  baseOpacity: 0.24,
  baseRadius: 0.4,
  maximumAltitude: 2.8,
  minimumOpacityScale: 0.22,
  minimumRadiusScale: 0.58,
  surfaceOffset: 0.018,
})

const GROUND_SHADOW_RAY_ORIGIN_OFFSET = 0.025
const GROUND_SHADOW_DOWN = new Vector3(0, -1, 0)
const GROUND_SHADOW_UP = new Vector3(0, 1, 0)

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
