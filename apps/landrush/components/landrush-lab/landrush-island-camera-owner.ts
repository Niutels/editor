export type LandrushIslandViewMode = 'build' | 'map' | 'player'

export type LandrushIslandCameraOwner = LandrushIslandViewMode | 'zombie'

export function isLandrushIslandRobotScreenRevealCameraOwner(owner: LandrushIslandCameraOwner) {
  return owner === 'player' || owner === 'zombie'
}

export function resolveLandrushIslandCameraOwner({
  viewMode,
  zombieEscapeNightActive,
}: {
  viewMode: LandrushIslandViewMode
  zombieEscapeNightActive: boolean
}): LandrushIslandCameraOwner {
  return zombieEscapeNightActive ? 'zombie' : viewMode
}
