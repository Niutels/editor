import { Box3, BoxGeometry, Group, Mesh, MeshBasicMaterial, Vector3 } from 'three'
import { describe, expect, test } from 'vitest'
import {
  appendLandrushRevealOwnedMeshes,
  isLandrushRevealObjectOwnedByRoot,
  isLandrushRevealObjectWithinRoots,
  setLandrushRevealOwnedMeshesBounds,
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

  test('uses precise vertex bounds for a composite mesh with a collapsed fast bounding box', () => {
    const roofRoot = new Group()
    roofRoot.position.set(-24, 6, -11)
    const roofGeometry = new BoxGeometry(10, 4, 8)
    roofGeometry.boundingBox = new Box3(new Vector3(), new Vector3())
    const roofMesh = new Mesh(roofGeometry, new MeshBasicMaterial())
    roofRoot.add(roofMesh)
    roofRoot.updateWorldMatrix(true, true)
    const registeredNodeRoots = new Set([roofRoot])

    const fastBounds = setLandrushRevealOwnedMeshesBounds(roofRoot, registeredNodeRoots, new Box3())
    const preciseBounds = setLandrushRevealOwnedMeshesBounds(
      roofRoot,
      registeredNodeRoots,
      new Box3(),
      { precise: true },
    )

    expect(fastBounds.min.toArray()).toEqual([-24, 6, -11])
    expect(fastBounds.max.toArray()).toEqual([-24, 6, -11])
    expect(preciseBounds.min.toArray()).toEqual([-29, 4, -15])
    expect(preciseBounds.max.toArray()).toEqual([-19, 8, -7])
  })

  test('lets a composite roof own geometry below its registered segment root', () => {
    const roofRoot = new Group()
    const segmentRoot = new Group()
    const roofMesh = createMesh()
    roofRoot.add(segmentRoot)
    segmentRoot.add(roofMesh)
    const registeredNodeRoots = new Set([roofRoot, segmentRoot])
    const regularMeshes = new Set<Mesh>()
    const compositeMeshes = new Set<Mesh>()

    appendLandrushRevealOwnedMeshes(roofRoot, registeredNodeRoots, regularMeshes, 1, () => {})
    appendLandrushRevealOwnedMeshes(
      roofRoot,
      registeredNodeRoots,
      compositeMeshes,
      1,
      () => {},
      true,
    )
    const compositeBounds = setLandrushRevealOwnedMeshesBounds(
      roofRoot,
      registeredNodeRoots,
      new Box3(),
      { includeNestedRegisteredRoots: true, precise: true },
    )

    expect(regularMeshes).toEqual(new Set())
    expect(compositeMeshes).toEqual(new Set([roofMesh]))
    expect(compositeBounds.min.toArray()).toEqual([-0.5, -0.5, -0.5])
    expect(compositeBounds.max.toArray()).toEqual([0.5, 0.5, 0.5])
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
