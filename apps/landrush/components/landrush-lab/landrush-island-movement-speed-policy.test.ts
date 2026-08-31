import { describe, expect, test } from 'bun:test'
import { resolveLandrushIslandMovementSpeedPolicy } from './landrush-island-movement-speed-policy'

describe('Landrush island movement speed policy', () => {
  test('keeps explicit keyboard, gamepad, and click-to-move running physical and presentational', () => {
    expect(
      resolveLandrushIslandMovementSpeedPolicy({
        crouching: false,
        intensity: 1,
        maximumSpeedScale: 1,
        requestedRun: true,
      }),
    ).toEqual({
      controllerRun: true,
      presentationRunRequested: true,
      speedScale: 1,
    })
  })

  test('uses the run-speed ceiling for touch magnitude without presenting touch as a run request', () => {
    expect(
      resolveLandrushIslandMovementSpeedPolicy({
        crouching: false,
        intensity: 0.5,
        maximumSpeedScale: 1,
        requestedRun: false,
        speedEnvelope: 'run',
      }),
    ).toEqual({
      controllerRun: true,
      presentationRunRequested: false,
      speedScale: 0.5,
    })
    expect(
      resolveLandrushIslandMovementSpeedPolicy({
        crouching: false,
        intensity: 1.4,
        maximumSpeedScale: 1,
        requestedRun: false,
        speedEnvelope: 'run',
      }).speedScale,
    ).toBe(1)
  })

  test('keeps ordinary movement under the walk ceiling and lets crouch override every run source', () => {
    expect(
      resolveLandrushIslandMovementSpeedPolicy({
        crouching: false,
        intensity: 0.4,
        maximumSpeedScale: 1,
        requestedRun: false,
      }),
    ).toEqual({
      controllerRun: false,
      presentationRunRequested: false,
      speedScale: 0.4,
    })
    expect(
      resolveLandrushIslandMovementSpeedPolicy({
        crouching: true,
        intensity: 0.75,
        maximumSpeedScale: 1,
        requestedRun: true,
        speedEnvelope: 'run',
      }),
    ).toEqual({
      controllerRun: false,
      presentationRunRequested: false,
      speedScale: 0.75,
    })
  })

  test('halves the physical speed ceiling while preserving run presentation after a hit', () => {
    expect(
      resolveLandrushIslandMovementSpeedPolicy({
        crouching: false,
        intensity: 1,
        maximumSpeedScale: 0.5,
        requestedRun: true,
      }),
    ).toEqual({
      controllerRun: true,
      presentationRunRequested: true,
      speedScale: 0.5,
    })

    expect(
      resolveLandrushIslandMovementSpeedPolicy({
        crouching: false,
        intensity: 0.6,
        maximumSpeedScale: 0.5,
        requestedRun: false,
        speedEnvelope: 'run',
      }).speedScale,
    ).toBe(0.3)
  })
})
