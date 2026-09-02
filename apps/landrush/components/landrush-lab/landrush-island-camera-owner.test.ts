import { describe, expect, test } from 'bun:test'
import {
  isLandrushIslandRobotScreenRevealCameraOwner,
  type LandrushIslandCameraOwner,
  resolveLandrushIslandCameraOwner,
} from './landrush-island-camera-owner'

const CAMERA_OWNERS: readonly LandrushIslandCameraOwner[] = ['build', 'map', 'player', 'zombie']

describe('Landrush island camera ownership', () => {
  test.each([
    'build',
    'map',
    'player',
  ] as const)('assigns exactly one owner for %s view', (viewMode) => {
    const owner = resolveLandrushIslandCameraOwner({
      viewMode,
      zombieEscapeNightActive: false,
    })

    expect(owner).toBe(viewMode)
    expect(CAMERA_OWNERS.filter((candidate) => candidate === owner)).toEqual([viewMode])
  })

  test.each([
    'build',
    'map',
    'player',
  ] as const)('gives the zombie handoff ownership before %s presentation settles', (viewMode) => {
    expect(resolveLandrushIslandCameraOwner({ viewMode, zombieEscapeNightActive: true })).toBe(
      'zombie',
    )
  })

  test.each([
    ['player', true],
    ['zombie', true],
    ['build', false],
    ['map', false],
  ] as const)('applies robot screen reveal policy to %s ownership', (owner, expected) => {
    expect(isLandrushIslandRobotScreenRevealCameraOwner(owner)).toBe(expected)
  })
})
