import {
  createZombieEscapeBloodEventSeed,
  type ZombieEscapeBloodEvent,
} from './zombie-escape-blood-effects'
import type { ZombieShootingDebugSequenceEvent } from './zombie-shooting-debug-sequence'

export const ZOMBIE_SHOOTING_DEBUG_IMPACT_POSITION = Object.freeze({
  x: 0,
  y: 1.24,
  z: -5.42,
})

export const ZOMBIE_SHOOTING_DEBUG_SHOOTER_POSITION = Object.freeze({
  x: 0,
  y: 1.2,
  z: 1.25,
})

const directionLength = Math.hypot(
  ZOMBIE_SHOOTING_DEBUG_IMPACT_POSITION.x - ZOMBIE_SHOOTING_DEBUG_SHOOTER_POSITION.x,
  ZOMBIE_SHOOTING_DEBUG_IMPACT_POSITION.y - ZOMBIE_SHOOTING_DEBUG_SHOOTER_POSITION.y,
  ZOMBIE_SHOOTING_DEBUG_IMPACT_POSITION.z - ZOMBIE_SHOOTING_DEBUG_SHOOTER_POSITION.z,
)
const directionX =
  (ZOMBIE_SHOOTING_DEBUG_IMPACT_POSITION.x - ZOMBIE_SHOOTING_DEBUG_SHOOTER_POSITION.x) /
  directionLength
const directionY =
  (ZOMBIE_SHOOTING_DEBUG_IMPACT_POSITION.y - ZOMBIE_SHOOTING_DEBUG_SHOOTER_POSITION.y) /
  directionLength
const directionZ =
  (ZOMBIE_SHOOTING_DEBUG_IMPACT_POSITION.z - ZOMBIE_SHOOTING_DEBUG_SHOOTER_POSITION.z) /
  directionLength

export type ZombieShootingDebugViewMode = 'diagnostic' | 'final' | 'no-post'

export function writeZombieShootingDebugBloodEvent(
  event: ZombieShootingDebugSequenceEvent,
  output: ZombieEscapeBloodEvent,
) {
  if (event.kind !== 'impact') return false
  output.directionX = directionX
  output.directionY = directionY
  output.directionZ = directionZ
  output.normalX = -directionX
  output.normalY = -directionY
  output.normalZ = -directionZ
  output.originX = ZOMBIE_SHOOTING_DEBUG_IMPACT_POSITION.x
  output.originY = ZOMBIE_SHOOTING_DEBUG_IMPACT_POSITION.y
  output.originZ = ZOMBIE_SHOOTING_DEBUG_IMPACT_POSITION.z
  output.seed = createZombieEscapeBloodEventSeed(
    Math.round(event.timeSeconds * 1_000),
    event.weaponIndex,
    1,
  )
  output.spawnElapsedSeconds = event.timeSeconds
  output.targetGeneration = 1
  output.targetSlot = 0
  return true
}

export function shouldRenderZombieShootingDebugContactMarker(
  viewMode: ZombieShootingDebugViewMode,
) {
  return viewMode === 'diagnostic'
}
