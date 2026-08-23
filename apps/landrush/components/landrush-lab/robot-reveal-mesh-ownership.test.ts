import { BoxGeometry, Group, Mesh, MeshBasicMaterial } from 'three'
import { describe, expect, test } from 'vitest'
import {
  appendLandrushRevealOwnedMeshes,
  isLandrushRevealObjectOwnedByRoot,
  isLandrushRevealObjectWithinRoots,
} from './robot-reveal-mesh-ownership'

function createMesh() {
  return new Mesh(new BoxGeometry(1, 1, 1), new MeshBasicMaterial())
}

describe('robot reveal mesh ownership', () => {
  test('appends owned meshes into the caller target without replacing it', () => {
    const wallRoot = new Group()
    const wallMesh = createMesh()
    const gateRoot = new Group()
    const gateMesh = createMesh()
    wallRoot.add(wallMesh, gateRoot)
    gateRoot.add(gateMesh)
    const registeredNodeRoots = new Set([wallRoot, gateRoot])
    const target = new Set<Mesh>()
    const amounts = new Map<Mesh, number>()
    const applyAmount = (mesh: Mesh, amount: number) => amounts.set(mesh, amount)

    const firstResult = appendLandrushRevealOwnedMeshes(
      wallRoot,
      registeredNodeRoots,
      target,
      0.4,
      applyAmount,
    )
    expect(firstResult).toBe(target)
    expect([...firstResult]).toEqual([wallMesh])
    expect(amounts.get(wallMesh)).toBe(0.4)
    expect(amounts.has(gateMesh)).toBe(false)

    const secondResult = appendLandrushRevealOwnedMeshes(
      gateRoot,
      registeredNodeRoots,
      target,
      0.8,
      applyAmount,
    )
    expect(secondResult).toBe(firstResult)
    expect([...secondResult]).toEqual([wallMesh, gateMesh])
    expect(amounts.get(gateMesh)).toBe(0.8)
  })

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
