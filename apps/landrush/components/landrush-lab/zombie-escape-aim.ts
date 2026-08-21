const ZOMBIE_ESCAPE_AIM_RETICLE_SURFACE_OFFSET = 0.12

export function resolveZombieEscapeAimReticleElevation(playerY: number) {
  return playerY + ZOMBIE_ESCAPE_AIM_RETICLE_SURFACE_OFFSET
}

export function resolveZombieEscapeAimReticleYaw(aimAngle: number) {
  if (!Number.isFinite(aimAngle)) return 0
  return Math.atan2(Math.sin(aimAngle), Math.cos(aimAngle))
}
