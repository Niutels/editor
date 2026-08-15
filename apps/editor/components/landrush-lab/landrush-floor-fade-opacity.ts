import type { Object3D } from 'three'

export const LANDRUSH_ISLAND_FLOOR_FADE_OPACITY_USER_DATA_KEY = 'landrushFloorFadeOpacity'

export function readLandrushIslandFloorFadeOpacity(object: Object3D | null | undefined) {
  let current = object
  while (current) {
    const value = current.userData?.[LANDRUSH_ISLAND_FLOOR_FADE_OPACITY_USER_DATA_KEY]
    if (typeof value === 'number') return value
    current = current.parent
  }
  return 1
}
