import type { ZombieEscapeInputMode } from './zombie-escape-config'

export type ZombieEscapeControlState = {
  aimStrength: number
  aimX: number
  aimZ: number
  cameraPressed: boolean
  debugPressed: boolean
  fire: boolean
  inputMode: ZombieEscapeInputMode
  interactPressed: boolean
  moveStrength: number
  moveX: number
  moveZ: number
  pausePressed: boolean
  qualityPressed: boolean
  resetPressed: boolean
  run: boolean
}

export function createZombieEscapeControlState(): ZombieEscapeControlState {
  return {
    aimStrength: 0,
    aimX: 0,
    aimZ: -1,
    cameraPressed: false,
    debugPressed: false,
    fire: false,
    inputMode: 'keyboard',
    interactPressed: false,
    moveStrength: 0,
    moveX: 0,
    moveZ: 0,
    pausePressed: false,
    qualityPressed: false,
    resetPressed: false,
    run: false,
  }
}
