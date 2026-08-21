export type LandrushIslandViewMode = 'build' | 'map' | 'player'

export type LandrushIslandCameraOwner = LandrushIslandViewMode | 'zombie'

export function resolveLandrushIslandCameraOwner({
  viewMode,
  zombieEscapeNightActive,
}: {
  viewMode: LandrushIslandViewMode
  zombieEscapeNightActive: boolean
}): LandrushIslandCameraOwner {
  return zombieEscapeNightActive ? 'zombie' : viewMode
}
