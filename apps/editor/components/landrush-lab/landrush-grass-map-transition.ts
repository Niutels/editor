export const LANDRUSH_GRASS_MAP_FADE_START_PROGRESS = 0
export const LANDRUSH_GRASS_MAP_FADE_END_PROGRESS = 0.3

type LandrushGrassMapViewMode = 'build' | 'map' | 'player'

type LandrushGrassMapTransition = {
  from: LandrushGrassMapViewMode
  to: LandrushGrassMapViewMode
}

export function resolveLandrushGrassMapExposure(
  viewMode: LandrushGrassMapViewMode,
  transition: LandrushGrassMapTransition | null,
  progress: number,
) {
  if (!transition) return viewMode === 'map' ? 1 : 0

  const amount = clamp01(progress)
  if (transition.to === 'map') return amount
  if (transition.from === 'map') return 1 - amount
  return viewMode === 'map' ? 1 : 0
}

export function resolveLandrushGrassMapVisibility(mapExposure: number) {
  const fadeProgress = clamp01(
    (mapExposure - LANDRUSH_GRASS_MAP_FADE_START_PROGRESS) /
      (LANDRUSH_GRASS_MAP_FADE_END_PROGRESS - LANDRUSH_GRASS_MAP_FADE_START_PROGRESS),
  )
  const easedFade = fadeProgress * fadeProgress * (3 - 2 * fadeProgress)
  return 1 - easedFade
}

function clamp01(value: number) {
  return Math.max(0, Math.min(1, value))
}
