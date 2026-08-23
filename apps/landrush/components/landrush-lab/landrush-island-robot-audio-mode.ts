import type { RobotJumpAudioCue } from './robot-footstep-audio'

export type LandrushIslandRobotAudioMode = {
  footstepAudioEnabled: true
  incrementZombieJumpSequence: boolean
  jumpAudioCue: RobotJumpAudioCue | undefined
  jumpSequenceRef: { readonly current: number } | undefined
}

export function resolveLandrushIslandRobotAudioMode({
  zombieEscapeActive,
  zombieJumpAudioCue,
  zombieJumpSequenceRef,
}: {
  zombieEscapeActive: boolean
  zombieJumpAudioCue: RobotJumpAudioCue
  zombieJumpSequenceRef: { readonly current: number }
}): LandrushIslandRobotAudioMode {
  return {
    footstepAudioEnabled: true,
    incrementZombieJumpSequence: zombieEscapeActive,
    jumpAudioCue: zombieEscapeActive ? zombieJumpAudioCue : undefined,
    jumpSequenceRef: zombieEscapeActive ? zombieJumpSequenceRef : undefined,
  }
}
