// @ts-expect-error — bun:test is provided by the Bun runtime; viewer does not
// depend on @types/bun so the import type is unresolved at compile time.
import { describe, expect, test } from 'bun:test'
import { WallNode } from '@pascal-app/core'
import { Mesh, MeshBasicMaterial, Vector3 } from 'three/webgpu'
import {
  applyWallCutoutMaterial,
  getWallHideState,
  readWallCutoutMaterialAssignment,
  releaseWallCutoutMaterialPresentation,
  retainWallCutoutMaterialPresentation,
} from './wall-cutout'

const wall = (frontSide: string, backSide: string) =>
  WallNode.parse({ start: [0, 0], end: [4, 0], frontSide, backSide })

/** Faces +Z, so `getWorldDirection` returns (0, 0, 1). */
const facingPositiveZ = () => new Mesh()

const towardsPositiveZ = new Vector3(0, 0, 1)
const towardsNegativeZ = new Vector3(0, 0, -1)

describe('getWallHideState', () => {
  test("'up' always shows the wall, even when both sides are interior", () => {
    expect(
      getWallHideState(wall('interior', 'interior'), facingPositiveZ(), 'up', towardsPositiveZ),
    ).toBe(false)
  })

  test("'down' always hides the wall, even when both sides are exterior", () => {
    expect(
      getWallHideState(wall('exterior', 'exterior'), facingPositiveZ(), 'down', towardsPositiveZ),
    ).toBe(true)
  })

  test("'cutaway' hides the near exterior face and keeps the far one", () => {
    const exteriorFront = wall('exterior', 'interior')
    expect(getWallHideState(exteriorFront, facingPositiveZ(), 'cutaway', towardsNegativeZ)).toBe(
      true,
    )
    expect(getWallHideState(exteriorFront, facingPositiveZ(), 'cutaway', towardsPositiveZ)).toBe(
      false,
    )
  })

  test("'cutaway' keeps walls that are exterior on both sides visible from either direction", () => {
    const both = wall('exterior', 'exterior')
    expect(getWallHideState(both, facingPositiveZ(), 'cutaway', towardsNegativeZ)).toBe(false)
    expect(getWallHideState(both, facingPositiveZ(), 'cutaway', towardsPositiveZ)).toBe(false)
  })

  test("'cutaway' hides walls that are interior on both sides", () => {
    expect(
      getWallHideState(
        wall('interior', 'interior'),
        facingPositiveZ(),
        'cutaway',
        towardsPositiveZ,
      ),
    ).toBe(true)
  })
})

describe('applyWallCutoutMaterial', () => {
  test('claims an existing presentation assignment without overwriting it', () => {
    const mesh = new Mesh()
    const presentationMaterial = new MeshBasicMaterial()
    const wallMaterial = new MeshBasicMaterial()
    mesh.material = presentationMaterial

    const ownership = applyWallCutoutMaterial(
      undefined,
      mesh,
      wallMaterial,
      'visible:normal:1',
      false,
    )

    expect(mesh.material).toBe(presentationMaterial)
    expect(ownership.key).toBe('visible:normal:1')
    expect(readWallCutoutMaterialAssignment(mesh)).toBe(wallMaterial)

    presentationMaterial.dispose()
    wallMaterial.dispose()
  })

  test('does not overwrite a presentation material when the owned wall assignment is unchanged', () => {
    const mesh = new Mesh()
    const wallMaterials = [new MeshBasicMaterial(), new MeshBasicMaterial()]
    const presentationMaterial = new MeshBasicMaterial()
    const changedWallMaterial = new MeshBasicMaterial()

    let ownership = applyWallCutoutMaterial(undefined, mesh, wallMaterials, 'visible:normal:1')
    mesh.material = presentationMaterial
    ownership = applyWallCutoutMaterial(ownership, mesh, [...wallMaterials], 'visible:normal:1')
    expect(mesh.material).toBe(presentationMaterial)

    ownership = applyWallCutoutMaterial(
      ownership,
      mesh,
      changedWallMaterial,
      'visible:normal:2',
      false,
    )
    expect(mesh.material).toBe(presentationMaterial)
    expect(ownership.key).toBe('visible:normal:2')
    expect(readWallCutoutMaterialAssignment(mesh)).toBe(changedWallMaterial)

    for (const material of [...wallMaterials, presentationMaterial, changedWallMaterial]) {
      material.dispose()
    }
  })

  test('applies a semantic change while the wall still owns the mesh assignment', () => {
    const mesh = new Mesh()
    const first = new MeshBasicMaterial()
    const second = new MeshBasicMaterial()

    let ownership = applyWallCutoutMaterial(undefined, mesh, first, 'visible:normal:1')
    ownership = applyWallCutoutMaterial(ownership, mesh, second, 'invisible:normal:1')

    expect(mesh.material).toBe(second)
    expect(ownership.key).toBe('invisible:normal:1')
    expect(readWallCutoutMaterialAssignment(mesh)).toBe(second)

    first.dispose()
    second.dispose()
  })

  test('publishes semantic changes without assigning while presentation leases are retained', () => {
    const mesh = new Mesh()
    const first = new MeshBasicMaterial()
    const second = new MeshBasicMaterial()
    const third = new MeshBasicMaterial()

    let ownership = applyWallCutoutMaterial(undefined, mesh, first, 'visible:normal:1')
    retainWallCutoutMaterialPresentation(mesh)
    retainWallCutoutMaterialPresentation(mesh)
    ownership = applyWallCutoutMaterial(ownership, mesh, second, 'invisible:normal:1')
    expect(mesh.material).toBe(first)
    expect(readWallCutoutMaterialAssignment(mesh)).toBe(second)

    releaseWallCutoutMaterialPresentation(mesh)
    ownership = applyWallCutoutMaterial(ownership, mesh, third, 'visible:normal:2')
    expect(mesh.material).toBe(first)
    expect(readWallCutoutMaterialAssignment(mesh)).toBe(third)

    releaseWallCutoutMaterialPresentation(mesh)
    applyWallCutoutMaterial(ownership, mesh, second, 'invisible:normal:2')
    expect(mesh.material).toBe(second)

    first.dispose()
    second.dispose()
    third.dispose()
  })
})
