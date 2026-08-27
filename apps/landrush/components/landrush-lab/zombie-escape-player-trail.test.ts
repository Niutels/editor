import { describe, expect, test } from 'bun:test'
import {
  appendZombieEscapePlayerTrailPoint,
  createZombieEscapePlayerTrail,
  createZombieEscapePlayerTrailPoint,
  getZombieEscapePlayerTrailOldestSequence,
  readZombieEscapePlayerTrailPoint,
  recordZombieEscapePlayerTrailPoint,
  resetZombieEscapePlayerTrail,
  setZombieEscapePlayerTrailOutgoingConnector,
} from './zombie-escape-player-trail'

describe('Zombie Escape player trail', () => {
  test('records spaced points and meaningful turns without recording every frame', () => {
    const trail = createZombieEscapePlayerTrail(8)

    expect(
      recordZombieEscapePlayerTrailPoint(trail, {
        layerIndex: 0,
        regionIndex: 2,
        tick: 1,
        x: 0,
        y: 0,
        z: 0,
      }),
    ).toBe(1)
    expect(
      recordZombieEscapePlayerTrailPoint(trail, {
        layerIndex: 0,
        regionIndex: 2,
        tick: 2,
        x: 0.2,
        y: 0,
        z: 0,
      }),
    ).toBe(0)
    expect(
      recordZombieEscapePlayerTrailPoint(trail, {
        layerIndex: 0,
        regionIndex: 2,
        tick: 3,
        x: 0.5,
        y: 0,
        z: 0,
      }),
    ).toBe(2)
    expect(
      recordZombieEscapePlayerTrailPoint(trail, {
        layerIndex: 0,
        regionIndex: 2,
        tick: 4,
        x: 0.7,
        y: 0,
        z: 0.3,
      }),
    ).toBe(3)
    expect(trail.count).toBe(3)
  })

  test('keeps constant-time sequence lookup when the ring wraps', () => {
    const trail = createZombieEscapePlayerTrail(4)
    const point = createZombieEscapePlayerTrailPoint()
    for (let sequence = 1; sequence <= 6; sequence += 1) {
      expect(
        appendZombieEscapePlayerTrailPoint(trail, {
          layerIndex: 0,
          regionIndex: 0,
          tick: sequence,
          x: sequence,
          y: 0,
          z: 0,
        }),
      ).toBe(sequence)
    }

    expect(getZombieEscapePlayerTrailOldestSequence(trail)).toBe(3)
    expect(readZombieEscapePlayerTrailPoint(trail, 2, point)).toBe(false)
    expect(readZombieEscapePlayerTrailPoint(trail, 3, point)).toBe(true)
    expect(point.x).toBe(3)
    expect(readZombieEscapePlayerTrailPoint(trail, 6, point)).toBe(true)
    expect(point.x).toBe(6)
  })

  test('stores an outgoing stair connector on the source point', () => {
    const trail = createZombieEscapePlayerTrail(4)
    const point = createZombieEscapePlayerTrailPoint()
    const sequence = appendZombieEscapePlayerTrailPoint(trail, {
      layerIndex: 0,
      regionIndex: 1,
      tick: 1,
      x: 1,
      y: 0,
      z: 2,
    })

    expect(setZombieEscapePlayerTrailOutgoingConnector(trail, sequence, 7, true)).toBe(true)
    expect(readZombieEscapePlayerTrailPoint(trail, sequence, point)).toBe(true)
    expect(point.connectorIndex).toBe(7)
    expect(point.connectorTargetEnd).toBe(true)
  })

  test('invalidates old followers when the trail resets', () => {
    const trail = createZombieEscapePlayerTrail(4)
    const point = createZombieEscapePlayerTrailPoint()
    const generation = trail.generation
    appendZombieEscapePlayerTrailPoint(trail, {
      layerIndex: 0,
      regionIndex: 0,
      tick: 1,
      x: 0,
      y: 0,
      z: 0,
    })

    resetZombieEscapePlayerTrail(trail)

    expect(trail.generation).not.toBe(generation)
    expect(trail.count).toBe(0)
    expect(readZombieEscapePlayerTrailPoint(trail, 1, point)).toBe(false)
    expect(
      appendZombieEscapePlayerTrailPoint(trail, {
        layerIndex: 1,
        regionIndex: 3,
        tick: 2,
        x: 4,
        y: 3,
        z: 5,
      }),
    ).toBe(1)
  })
})
