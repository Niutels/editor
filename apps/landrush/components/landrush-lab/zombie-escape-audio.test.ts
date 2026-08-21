import { describe, expect, test } from 'bun:test'
import {
  resolveZombieEscapeAudioSpatialMix,
  type ZombieEscapeAudioSpatialMix,
} from './zombie-escape-audio'

describe('Zombie Escape spatial audio mix', () => {
  test('pans in camera-right space and fades smoothly to the bounded distance', () => {
    const output: ZombieEscapeAudioSpatialMix = { gain: 0, pan: 0 }

    expect(resolveZombieEscapeAudioSpatialMix(4, 0, 0, 1, 0, 0, 4, 20, output)).toBe(output)
    expect(output).toEqual({ gain: 1, pan: 1 })

    resolveZombieEscapeAudioSpatialMix(-12, 0, 0, 1, 0, 0, 4, 20, output)
    expect(output.pan).toBe(-1)
    expect(output.gain).toBeCloseTo(0.5, 6)

    resolveZombieEscapeAudioSpatialMix(20, 0, 0, 1, 0, 0, 4, 20, output)
    expect(output).toEqual({ gain: 0, pan: 0 })
  })
})
