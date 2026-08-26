import type { LandrushIslandPlayerSpawnPose } from './landrush-island-player-spawn'

export type LandrushIslandSpawnAuthorityHandoff = 'apply' | 'settle' | 'wait'

export function resolveLandrushIslandSpawnAuthorityHandoff({
  authorityReady,
  authoritySettled,
  replayActive,
  source,
}: {
  authorityReady: boolean
  authoritySettled: boolean
  replayActive: boolean
  source: LandrushIslandPlayerSpawnPose['source']
}): LandrushIslandSpawnAuthorityHandoff {
  if (!authorityReady || authoritySettled) return 'wait'
  return !replayActive && source === 'scene' ? 'apply' : 'settle'
}
