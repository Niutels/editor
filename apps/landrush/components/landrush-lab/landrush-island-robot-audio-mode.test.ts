import { describe, expect, test } from 'bun:test'
import { resolveLandrushIslandRobotAudioMode } from './landrush-island-robot-audio-mode'
import {
  advanceRobotJumpAudioPlaybackState,
  createRobotJumpAudioPlaybackState,
  type RobotJumpAudioCue,
  shouldLoadRobotJumpAudioCue,
} from './robot-footstep-audio'

const zombieJumpAudioCue: RobotJumpAudioCue = {
  files: ['/audios/zombie-jump.mp3'],
  playback: {
    maxVoices: 1,
    minIntervalMs: 0,
    rateRange: [1, 1],
    spatial: true,
    volume: 1,
  },
}

describe('Landrush island robot audio mode', () => {
  test('keeps footsteps active without exposing or incrementing the Zombie jump cue in day mode', () => {
    const jumpSequenceRef = { current: 7 }
    const mode = resolveLandrushIslandRobotAudioMode({
      zombieEscapeActive: false,
      zombieJumpAudioCue,
      zombieJumpSequenceRef: jumpSequenceRef,
    })

    expect(mode).toEqual({
      footstepAudioEnabled: true,
      incrementZombieJumpSequence: false,
      jumpAudioCue: undefined,
      jumpSequenceRef: undefined,
    })
    if (mode.incrementZombieJumpSequence) jumpSequenceRef.current += 1
    expect(jumpSequenceRef.current).toBe(7)
    expect(shouldLoadRobotJumpAudioCue(mode.jumpAudioCue)).toBe(false)

    let playCalls = 0
    expect(
      advanceRobotJumpAudioPlaybackState(createRobotJumpAudioPlaybackState(7), {
        disposition: 'terminal',
        nowSeconds: 1,
        observedSequence: jumpSequenceRef.current,
        play: () => {
          playCalls += 1
          return 'played'
        },
      }),
    ).toBe('none')
    expect(playCalls).toBe(0)
  })

  test('binds and increments the Zombie jump cue only while Zombie mode is active', () => {
    const jumpSequenceRef = { current: 7 }
    const mode = resolveLandrushIslandRobotAudioMode({
      zombieEscapeActive: true,
      zombieJumpAudioCue,
      zombieJumpSequenceRef: jumpSequenceRef,
    })

    expect(mode.footstepAudioEnabled).toBe(true)
    expect(mode.incrementZombieJumpSequence).toBe(true)
    expect(mode.jumpAudioCue).toBe(zombieJumpAudioCue)
    expect(mode.jumpSequenceRef).toBe(jumpSequenceRef)
    if (mode.incrementZombieJumpSequence) jumpSequenceRef.current += 1
    expect(jumpSequenceRef.current).toBe(8)
    expect(shouldLoadRobotJumpAudioCue(mode.jumpAudioCue)).toBe(true)

    const playedSequences: number[] = []
    expect(
      advanceRobotJumpAudioPlaybackState(createRobotJumpAudioPlaybackState(7), {
        disposition: 'play',
        nowSeconds: 1,
        observedSequence: jumpSequenceRef.current,
        play: (sequence) => {
          playedSequences.push(sequence)
          return 'played'
        },
      }),
    ).toBe('played')
    expect(playedSequences).toEqual([8])
  })
})
