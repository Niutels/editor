import { describe, expect, test } from 'bun:test'
import { createLandrushIslandPerfRunOptions } from './landrush-island-performance-run'

describe('Landrush island performance run options', () => {
  test('accepts supported scenarios and clamps benchmark duration', () => {
    const values = new Map([
      ['perfDirection', 'backward'],
      ['perfDurationMs', '90000'],
      ['perfRun', 'pointer-orbit'],
      ['perfSpeed', 'walk'],
    ])

    const searchParams = { get: (key: string) => values.get(key) ?? null }

    expect(createLandrushIslandPerfRunOptions(searchParams)).toEqual({
      direction: 'backward',
      durationMs: 20_000,
      enabled: true,
      scenario: 'pointer-orbit',
      speed: 'walk',
    })
  })

  test('keeps the benchmark disabled without a supported scenario', () => {
    const values = new Map<string, string>()

    const searchParams = { get: (key: string) => values.get(key) ?? null }

    expect(createLandrushIslandPerfRunOptions(searchParams)).toEqual({
      direction: 'forward',
      durationMs: 9000,
      enabled: false,
      scenario: 'straight',
      speed: 'run',
    })
  })
})
