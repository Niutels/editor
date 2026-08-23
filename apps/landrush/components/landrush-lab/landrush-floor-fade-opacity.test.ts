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

  test('composes nested floor and cover opacity', () => {
    const level = new Group()
    level.userData[LANDRUSH_ISLAND_FLOOR_FADE_OPACITY_USER_DATA_KEY] = 0.2
    const doorRoot = new Mesh()
    doorRoot.userData[LANDRUSH_ISLAND_FLOOR_FADE_OPACITY_USER_DATA_KEY] = 0.65
    const doorLeaf = new Mesh()
    level.add(doorRoot)
    doorRoot.add(doorLeaf)

    expect(readLandrushIslandFloorFadeOpacity(doorLeaf)).toBeCloseTo(0.13, 12)
  })

  test('defaults to fully opaque outside a prepared floor', () => {
    expect(readLandrushIslandFloorFadeOpacity(new Mesh())).toBe(1)
    expect(readLandrushIslandFloorFadeOpacity(undefined)).toBe(1)
  })

  test('clamps finite metadata and ignores invalid scalars', () => {
    const parent = new Group()
    const child = new Mesh()
    parent.add(child)

    parent.userData[LANDRUSH_ISLAND_FLOOR_FADE_OPACITY_USER_DATA_KEY] = 4
    child.userData[LANDRUSH_ISLAND_FLOOR_FADE_OPACITY_USER_DATA_KEY] = -2
    expect(readLandrushIslandFloorFadeOpacity(child)).toBe(0)

    child.userData[LANDRUSH_ISLAND_FLOOR_FADE_OPACITY_USER_DATA_KEY] = Number.NaN
    expect(readLandrushIslandFloorFadeOpacity(child)).toBe(1)
    child.userData[LANDRUSH_ISLAND_FLOOR_FADE_OPACITY_USER_DATA_KEY] = Number.POSITIVE_INFINITY
    expect(readLandrushIslandFloorFadeOpacity(child)).toBe(1)
  })
})
