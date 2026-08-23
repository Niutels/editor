import type { LandrushIslandAmbientNavigationObstacle } from './landrush-island-ambient-navigation'

export {
  type LandrushIslandAmbientPalmSlot,
  resolveLandrushIslandAmbientPalmPosition,
  resolveLandrushIslandAmbientPalmSlots,
} from './landrush-island-palm-layout'

export type LandrushIslandAmbientMotionDebugSettings = {
  enabled: boolean
  timeSeconds: number | null
}

export function parseLandrushIslandAmbientMotionDebugSettings(
  search: string,
): LandrushIslandAmbientMotionDebugSettings {
  const parameters = new URLSearchParams(search)
  const value = parameters.get('ambientMotionTime')
  const time = value === null ? null : Number(value)
  return {
    enabled: parameters.get('ambientMotionDebug') === '1',
    timeSeconds: time !== null && Number.isFinite(time) && time >= 0 ? time : null,
  }
}

export function resolveAdmittedLandrushIslandAmbientNavigationObstacles({
  admitted,
  createSceneObstacles,
  palmObstacles,
}: {
  admitted: boolean
  createSceneObstacles: () => readonly LandrushIslandAmbientNavigationObstacle[]
  palmObstacles: readonly LandrushIslandAmbientNavigationObstacle[]
}): readonly LandrushIslandAmbientNavigationObstacle[] {
  if (!admitted) return []
  return [...createSceneObstacles(), ...palmObstacles]
}

export function resolveLandrushIslandAmbientNpcPalmCollisions<T>(
  palmCollisions: readonly T[],
  dayInstanceCount: number,
): readonly T[] {
  return palmCollisions.slice(0, Math.max(0, Math.trunc(dayInstanceCount)))
}
