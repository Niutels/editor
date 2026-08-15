import { describe, expect, test } from 'bun:test'
import { Group, Mesh } from 'three'
import {
  LANDRUSH_ISLAND_FLOOR_FADE_OPACITY_USER_DATA_KEY,
  readLandrushIslandFloorFadeOpacity,
} from './landrush-floor-fade-opacity'

describe('readLandrushIslandFloorFadeOpacity', () => {
  test('returns the mesh opacity when it is prepared directly', () => {
    const mesh = new Mesh()
    mesh.userData[LANDRUSH_ISLAND_FLOOR_FADE_OPACITY_USER_DATA_KEY] = 0.35

    expect(readLandrushIslandFloorFadeOpacity(mesh)).toBe(0.35)
  })

  test('inherits opacity for door visuals rebuilt below a prepared door root', () => {
    const doorRoot = new Mesh()
    doorRoot.userData[LANDRUSH_ISLAND_FLOOR_FADE_OPACITY_USER_DATA_KEY] = 0.42
    const rebuiltDoorLeaf = new Mesh()
    doorRoot.add(rebuiltDoorLeaf)

    expect(readLandrushIslandFloorFadeOpacity(rebuiltDoorLeaf)).toBe(0.42)
  })

  test('uses the nearest prepared ancestor', () => {
    const level = new Group()
    level.userData[LANDRUSH_ISLAND_FLOOR_FADE_OPACITY_USER_DATA_KEY] = 0.2
    const doorRoot = new Mesh()
    doorRoot.userData[LANDRUSH_ISLAND_FLOOR_FADE_OPACITY_USER_DATA_KEY] = 0.65
    const doorLeaf = new Mesh()
    level.add(doorRoot)
    doorRoot.add(doorLeaf)

    expect(readLandrushIslandFloorFadeOpacity(doorLeaf)).toBe(0.65)
  })

  test('defaults to fully opaque outside a prepared floor', () => {
    expect(readLandrushIslandFloorFadeOpacity(new Mesh())).toBe(1)
    expect(readLandrushIslandFloorFadeOpacity(undefined)).toBe(1)
  })
})
