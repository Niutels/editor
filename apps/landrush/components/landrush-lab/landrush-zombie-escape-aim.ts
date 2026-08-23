export function resolveLandrushZombieEscapeAimPlaneElevation(
  playerWorldY: number,
  fallbackGroundY: number,
) {
  if (Number.isFinite(playerWorldY)) return playerWorldY
  return Number.isFinite(fallbackGroundY) ? fallbackGroundY : 0
}
