import { type Intersection, Matrix3, type Mesh, Raycaster, Vector3 } from 'three'

export const ZOMBIE_ESCAPE_GROUND_SHADOW = Object.freeze({
  aspectRatio: 0.72,
  baseOpacity: 0.34,
  baseRadius: 0.5,
  maximumAltitude: 2.8,
  minimumOpacityScale: 0.08,
  minimumRadiusScale: 0.46,
  surfaceOffset: 0.025,
  textureResolution: 64,
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

export function createZombieEscapeGroundShadowAlphaMapData(
  resolution = ZOMBIE_ESCAPE_GROUND_SHADOW.textureResolution,
) {
  const size = Math.max(4, Math.round(Number.isFinite(resolution) ? resolution : 4))
  const data = new Uint8Array(size * size * 4)
  for (let y = 0; y < size; y += 1) {
    const normalizedY = ((y + 0.5) / size) * 2 - 1
    for (let x = 0; x < size; x += 1) {
      const normalizedX = ((x + 0.5) / size) * 2 - 1
      const distance = Math.min(1, Math.hypot(normalizedX, normalizedY))
      const edge = 1 - smoothstep(0.16, 1, distance)
      const core = 1 - smoothstep(0, 0.7, distance)
      const alpha = Math.round(255 * Math.min(1, edge * 0.72 + core * 0.28))
      const offset = (y * size + x) * 4
      data[offset] = alpha
      data[offset + 1] = alpha
      data[offset + 2] = alpha
      data[offset + 3] = 255
    }
  }
  return { data, size }
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

function smoothstep(minimum: number, maximum: number, value: number) {
  const normalized = Math.max(0, Math.min(1, (value - minimum) / (maximum - minimum)))
  return normalized * normalized * (3 - normalized * 2)
}
