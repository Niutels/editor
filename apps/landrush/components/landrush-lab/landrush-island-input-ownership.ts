import type { ZombieEscapeGamePhase } from '@landrush/zombie-gameplay/zombie-escape-simulation'

export type LandrushIslandInterfaceInputOwner = 'day-interface' | 'zombie-night'

export type LandrushIslandDayInterfaceState = {
  buildControlsActive: boolean
  buildSyncConflictVisible: boolean
  commandsEnabled: boolean
  mapLabelsInteractive: boolean
  mapPresentationVisible: boolean
}

export type LandrushIslandGamepadButtonState = {
  circle: boolean
  cross: boolean
  dpadDown: boolean
  dpadLeft: boolean
  dpadRight: boolean
  dpadUp: boolean
  leftShoulder: boolean
  square: boolean
  triangle: boolean
}

const LANDRUSH_ISLAND_GAMEPAD_BUTTONS = [
  'circle',
  'cross',
  'dpadDown',
  'dpadLeft',
  'dpadRight',
  'dpadUp',
  'leftShoulder',
  'square',
  'triangle',
] as const satisfies readonly (keyof LandrushIslandGamepadButtonState)[]

export function createLandrushIslandGamepadButtonState(): LandrushIslandGamepadButtonState {
  return {
    circle: false,
    cross: false,
    dpadDown: false,
    dpadLeft: false,
    dpadRight: false,
    dpadUp: false,
    leftShoulder: false,
    square: false,
    triangle: false,
  }
}

export function resolveLandrushIslandInterfaceInputOwner({
  zombieEscapeEnabled,
  zombieEscapePhase,
}: {
  zombieEscapeEnabled: boolean
  zombieEscapePhase: ZombieEscapeGamePhase
}): LandrushIslandInterfaceInputOwner {
  return zombieEscapeEnabled && zombieEscapePhase === 'night' ? 'zombie-night' : 'day-interface'
}

export function resolveLandrushIslandDayInterfaceState({
  buildControlsRequested,
  buildSyncConflictPresent,
  mapLabelsRequested,
  mapPresentationRequested,
  owner,
}: {
  buildControlsRequested: boolean
  buildSyncConflictPresent: boolean
  mapLabelsRequested: boolean
  mapPresentationRequested: boolean
  owner: LandrushIslandInterfaceInputOwner
}): LandrushIslandDayInterfaceState {
  const commandsEnabled = owner === 'day-interface'
  return {
    buildControlsActive: commandsEnabled && buildControlsRequested,
    buildSyncConflictVisible: commandsEnabled && buildSyncConflictPresent,
    commandsEnabled,
    mapLabelsInteractive: commandsEnabled && mapLabelsRequested,
    mapPresentationVisible: commandsEnabled && mapPresentationRequested,
  }
}

export function advanceLandrushIslandDayGamepadButtonState({
  current,
  owner,
  previous,
}: {
  current: LandrushIslandGamepadButtonState
  owner: LandrushIslandInterfaceInputOwner
  previous: LandrushIslandGamepadButtonState
}) {
  const pressed = createLandrushIslandGamepadButtonState()
  if (owner === 'day-interface') {
    for (const button of LANDRUSH_ISLAND_GAMEPAD_BUTTONS) {
      pressed[button] = current[button] && !previous[button]
    }
  }

  return { next: current, pressed }
}
