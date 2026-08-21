import { describe, expect, test } from 'bun:test'
import {
  advanceLandrushIslandDayGamepadButtonState,
  createLandrushIslandGamepadButtonState,
  resolveLandrushIslandDayInterfaceState,
  resolveLandrushIslandInterfaceInputOwner,
} from './landrush-island-input-ownership'

describe('Landrush island input ownership', () => {
  test('gives the whole night phase to the zombie interface', () => {
    expect(
      resolveLandrushIslandInterfaceInputOwner({
        zombieEscapeEnabled: true,
        zombieEscapePhase: 'night',
      }),
    ).toBe('zombie-night')
    expect(
      resolveLandrushIslandInterfaceInputOwner({
        zombieEscapeEnabled: true,
        zombieEscapePhase: 'build',
      }),
    ).toBe('day-interface')
    expect(
      resolveLandrushIslandInterfaceInputOwner({
        zombieEscapeEnabled: false,
        zombieEscapePhase: 'night',
      }),
    ).toBe('day-interface')
  })

  test('tracks held buttons while day commands are suppressed', () => {
    let previous = createLandrushIslandGamepadButtonState()
    const heldSquare = { ...previous, square: true }

    const nightFrame = advanceLandrushIslandDayGamepadButtonState({
      current: heldSquare,
      owner: 'zombie-night',
      previous,
    })
    expect(nightFrame.pressed.square).toBe(false)
    previous = nightFrame.next

    const handoffFrame = advanceLandrushIslandDayGamepadButtonState({
      current: heldSquare,
      owner: 'day-interface',
      previous,
    })
    expect(handoffFrame.pressed.square).toBe(false)
    previous = handoffFrame.next

    const releaseFrame = advanceLandrushIslandDayGamepadButtonState({
      current: createLandrushIslandGamepadButtonState(),
      owner: 'day-interface',
      previous,
    })
    previous = releaseFrame.next

    const freshPressFrame = advanceLandrushIslandDayGamepadButtonState({
      current: heldSquare,
      owner: 'day-interface',
      previous,
    })
    expect(freshPressFrame.pressed.square).toBe(true)
  })

  test('synchronously fences every day interface surface during zombie night', () => {
    expect(
      resolveLandrushIslandDayInterfaceState({
        buildControlsRequested: true,
        buildSyncConflictPresent: true,
        mapLabelsRequested: true,
        mapPresentationRequested: true,
        owner: 'zombie-night',
      }),
    ).toEqual({
      buildControlsActive: false,
      buildSyncConflictVisible: false,
      commandsEnabled: false,
      mapLabelsInteractive: false,
      mapPresentationVisible: false,
    })
  })

  test('keeps requested day interface surfaces active for their day owner', () => {
    expect(
      resolveLandrushIslandDayInterfaceState({
        buildControlsRequested: true,
        buildSyncConflictPresent: true,
        mapLabelsRequested: true,
        mapPresentationRequested: true,
        owner: 'day-interface',
      }),
    ).toEqual({
      buildControlsActive: true,
      buildSyncConflictVisible: true,
      commandsEnabled: true,
      mapLabelsInteractive: true,
      mapPresentationVisible: true,
    })
  })

  test('preserves the normal day map exit fade without leaving its labels interactive', () => {
    expect(
      resolveLandrushIslandDayInterfaceState({
        buildControlsRequested: false,
        buildSyncConflictPresent: false,
        mapLabelsRequested: false,
        mapPresentationRequested: true,
        owner: 'day-interface',
      }),
    ).toMatchObject({
      mapLabelsInteractive: false,
      mapPresentationVisible: true,
    })
  })
})
