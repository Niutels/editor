import { describe, expect, test } from 'bun:test'
import { PerspectiveCamera, Vector3 } from 'three'
import {
  advanceRobotJumpAudioPlaybackState,
  createRobotJumpAudioPlaybackState,
  isRobotJumpAudioCueConfigurationValid,
  ROBOT_FOOTSTEP_BASE_VOLUME,
  ROBOT_JUMP_AUDIO_PENDING_TTL_SECONDS,
  type RobotJumpAudioBufferStatus,
  type RobotJumpAudioCue,
  resolveRobotAudioListenerLocalPosition,
  resolveRobotFootstepVolume,
  resolveRobotJumpAudioPlaybackDisposition,
} from './robot-footstep-audio'

describe('robot local footstep mix', () => {
  test('keeps the listener at the player while inheriting camera orientation', () => {
    const camera = new PerspectiveCamera()
    camera.position.set(12, 14, 18)
    camera.lookAt(2, 0, -3)
    camera.updateMatrixWorld(true)
    const playerPosition = new Vector3(2, 0, -3)
    const localPosition = resolveRobotAudioListenerLocalPosition(
      camera,
      playerPosition,
      new Vector3(),
    )

    expect(camera.localToWorld(localPosition.clone()).distanceTo(playerPosition)).toBeLessThan(
      0.000_001,
    )
  })

  test('keeps walking and running steps above an audible floor at default settings', () => {
    const defaultVolumeScale = 0.7 * 0.5

    expect(ROBOT_FOOTSTEP_BASE_VOLUME).toBe(0.24)
    expect(resolveRobotFootstepVolume(defaultVolumeScale, 0, 0.86)).toBeGreaterThan(0.05)
    expect(resolveRobotFootstepVolume(defaultVolumeScale, 1, 0.86)).toBeGreaterThan(0.07)
  })
})

describe('robot jump audio playback lifecycle', () => {
  test('keeps the newest accepted jump pending through load and resume, then plays it once', () => {
    const state = createRobotJumpAudioPlaybackState()
    const playedSequences: number[] = []

    expect(
      advanceRobotJumpAudioPlaybackState(state, {
        disposition: 'retry',
        nowSeconds: 1,
        observedSequence: 1,
        play: () => 'retry',
      }),
    ).toBe('pending')
    expect(state).toEqual({
      acknowledgedSequence: 0,
      pendingSequence: 1,
      pendingSinceSeconds: 1,
      retryablePlayFailureCount: 0,
    })

    expect(
      advanceRobotJumpAudioPlaybackState(state, {
        disposition: 'retry',
        nowSeconds: 1.1,
        observedSequence: 3,
        play: () => 'retry',
      }),
    ).toBe('pending')
    expect(state).toEqual({
      acknowledgedSequence: 0,
      pendingSequence: 3,
      pendingSinceSeconds: 1.1,
      retryablePlayFailureCount: 0,
    })

    expect(
      advanceRobotJumpAudioPlaybackState(state, {
        disposition: 'play',
        nowSeconds: 1.2,
        observedSequence: 3,
        play: (sequence) => {
          playedSequences.push(sequence)
          return 'played'
        },
      }),
    ).toBe('played')
    expect(state).toEqual({
      acknowledgedSequence: 3,
      pendingSequence: null,
      pendingSinceSeconds: null,
      retryablePlayFailureCount: 0,
    })
    expect(playedSequences).toEqual([3])

    expect(
      advanceRobotJumpAudioPlaybackState(state, {
        disposition: 'play',
        nowSeconds: 1.3,
        observedSequence: 3,
        play: (sequence) => {
          playedSequences.push(sequence)
          return 'played'
        },
      }),
    ).toBe('none')
    expect(playedSequences).toEqual([3])
  })

  test('acknowledges deterministic terminal outcomes without replaying them later', () => {
    const terminal = createRobotJumpAudioPlaybackState()
    let playCalls = 0

    expect(
      advanceRobotJumpAudioPlaybackState(terminal, {
        disposition: 'terminal',
        nowSeconds: 1,
        observedSequence: 4,
        play: () => {
          playCalls += 1
          return 'played'
        },
      }),
    ).toBe('terminal')
    expect(terminal).toEqual({
      acknowledgedSequence: 4,
      pendingSequence: null,
      pendingSinceSeconds: null,
      retryablePlayFailureCount: 0,
    })
    expect(playCalls).toBe(0)

    const failedPlay = createRobotJumpAudioPlaybackState()
    expect(
      advanceRobotJumpAudioPlaybackState(failedPlay, {
        disposition: 'play',
        nowSeconds: 1,
        observedSequence: 2,
        play: () => 'terminal',
      }),
    ).toBe('terminal')
    expect(failedPlay).toEqual({
      acknowledgedSequence: 2,
      pendingSequence: null,
      pendingSinceSeconds: null,
      retryablePlayFailureCount: 0,
    })
    expect(
      advanceRobotJumpAudioPlaybackState(failedPlay, {
        disposition: 'play',
        nowSeconds: 1.1,
        observedSequence: 2,
        play: () => 'played',
      }),
    ).toBe('none')
  })

  test('bounds retryable play failures and resets the budget for a newer jump', () => {
    const exhausted = createRobotJumpAudioPlaybackState()
    let playCalls = 0

    for (const [index, expected] of ['pending', 'pending', 'terminal'].entries()) {
      expect(
        advanceRobotJumpAudioPlaybackState(exhausted, {
          disposition: 'play',
          nowSeconds: 1 + index * 0.1,
          observedSequence: 1,
          play: () => {
            playCalls += 1
            return 'retry'
          },
        }),
      ).toBe(expected)
    }
    expect(playCalls).toBe(3)
    expect(exhausted).toEqual({
      acknowledgedSequence: 1,
      pendingSequence: null,
      pendingSinceSeconds: null,
      retryablePlayFailureCount: 0,
    })
    expect(
      advanceRobotJumpAudioPlaybackState(exhausted, {
        disposition: 'play',
        nowSeconds: 1.4,
        observedSequence: 1,
        play: () => {
          playCalls += 1
          return 'played'
        },
      }),
    ).toBe('none')
    expect(playCalls).toBe(3)

    const coalesced = createRobotJumpAudioPlaybackState()
    expect(
      advanceRobotJumpAudioPlaybackState(coalesced, {
        disposition: 'play',
        nowSeconds: 2,
        observedSequence: 2,
        play: () => 'retry',
      }),
    ).toBe('pending')
    expect(coalesced.retryablePlayFailureCount).toBe(1)
    expect(
      advanceRobotJumpAudioPlaybackState(coalesced, {
        disposition: 'play',
        nowSeconds: 2.1,
        observedSequence: 5,
        play: () => 'played',
      }),
    ).toBe('played')
    expect(coalesced).toEqual({
      acknowledgedSequence: 5,
      pendingSequence: null,
      pendingSinceSeconds: null,
      retryablePlayFailureCount: 0,
    })
  })

  test('expires a delayed jump instead of playing it after readiness recovers', () => {
    const state = createRobotJumpAudioPlaybackState()
    let playCalls = 0

    expect(
      advanceRobotJumpAudioPlaybackState(state, {
        disposition: 'retry',
        nowSeconds: 4,
        observedSequence: 1,
        play: () => 'retry',
      }),
    ).toBe('pending')
    expect(
      advanceRobotJumpAudioPlaybackState(state, {
        disposition: 'play',
        nowSeconds: 4 + ROBOT_JUMP_AUDIO_PENDING_TTL_SECONDS,
        observedSequence: 1,
        play: () => {
          playCalls += 1
          return 'played'
        },
      }),
    ).toBe('terminal')
    expect(playCalls).toBe(0)
    expect(state).toEqual({
      acknowledgedSequence: 1,
      pendingSequence: null,
      pendingSinceSeconds: null,
      retryablePlayFailureCount: 0,
    })
  })

  test('retries only transient decode, context, and pool readiness states', () => {
    const ready = {
      audioRunning: true,
      audible: true,
      bufferStatus: 'ready' as RobotJumpAudioBufferStatus,
      enabled: true,
      hasCue: true,
      hasMotion: true,
      hasPool: true,
      intervalElapsed: true,
    }

    expect(resolveRobotJumpAudioPlaybackDisposition(ready)).toBe('play')
    expect(resolveRobotJumpAudioPlaybackDisposition({ ...ready, bufferStatus: 'loading' })).toBe(
      'retry',
    )
    expect(resolveRobotJumpAudioPlaybackDisposition({ ...ready, audioRunning: false })).toBe(
      'retry',
    )
    expect(resolveRobotJumpAudioPlaybackDisposition({ ...ready, hasPool: false })).toBe('retry')

    for (const terminalState of [
      { ...ready, audible: false },
      { ...ready, bufferStatus: 'failed' as const },
      { ...ready, bufferStatus: 'unavailable' as const },
      { ...ready, enabled: false },
      { ...ready, hasCue: false },
      { ...ready, hasMotion: false },
      { ...ready, intervalElapsed: false },
    ]) {
      expect(resolveRobotJumpAudioPlaybackDisposition(terminalState)).toBe('terminal')
    }
  })

  test('rejects invalid cue configuration as terminal before pool playback', () => {
    const cue: RobotJumpAudioCue = {
      files: ['/jump.mp3'],
      playback: {
        maxDistance: 18,
        maxVoices: 2,
        minIntervalMs: 80,
        rateRange: [0.95, 1.05],
        referenceDistance: 3,
        spatial: true,
        volume: 0.5,
      },
    }

    expect(isRobotJumpAudioCueConfigurationValid(cue)).toBe(true)
    expect(
      isRobotJumpAudioCueConfigurationValid({
        ...cue,
        playback: { ...cue.playback, maxVoices: 0 },
      }),
    ).toBe(false)
    expect(
      isRobotJumpAudioCueConfigurationValid({
        ...cue,
        playback: { ...cue.playback, rateRange: [1.1, 0.9] },
      }),
    ).toBe(false)
    expect(
      isRobotJumpAudioCueConfigurationValid({
        ...cue,
        playback: { ...cue.playback, maxDistance: 2, referenceDistance: 3 },
      }),
    ).toBe(false)
  })
})
