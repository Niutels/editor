import { BoxGeometry, Group, Mesh, MeshBasicMaterial } from 'three'
import { describe, expect, test } from 'vitest'
import {
  isLandrushRevealObjectOwnedByRoot,
  isLandrushRevealObjectWithinRoots,
} from './robot-reveal-mesh-ownership'

function createMesh() {
  return new Mesh(new BoxGeometry(1, 1, 1), new MeshBasicMaterial())
}

describe('robot reveal mesh ownership', () => {
  test('stops a parent occluder at a nested registered node', () => {
    const wallRoot = new Group()
    const wallMesh = createMesh()
    const gateRoot = new Group()
    const gateMesh = createMesh()
    wallRoot.add(wallMesh, gateRoot)
    gateRoot.add(gateMesh)
    const registeredNodeRoots = new Set([wallRoot, gateRoot])

    expect(isLandrushRevealObjectOwnedByRoot(wallMesh, wallRoot, registeredNodeRoots)).toBe(true)
    expect(isLandrushRevealObjectOwnedByRoot(gateMesh, wallRoot, registeredNodeRoots)).toBe(false)
    expect(isLandrushRevealObjectOwnedByRoot(gateMesh, gateRoot, registeredNodeRoots)).toBe(true)
  })

  test('recognizes meshes inside a transient placement root', () => {
    const transientGateRoot = new Group()
    const gateMesh = createMesh()
    transientGateRoot.add(gateMesh)

    expect(isLandrushRevealObjectWithinRoots(gateMesh, new Set([transientGateRoot]))).toBe(true)
    expect(isLandrushRevealObjectWithinRoots(createMesh(), new Set([transientGateRoot]))).toBe(
      false,
    )
  })
})
