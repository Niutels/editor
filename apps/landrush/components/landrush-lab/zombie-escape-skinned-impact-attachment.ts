import { type Intersection, type Mesh, type Object3D, Raycaster, Triangle, Vector3 } from 'three'

type ZombieEscapeImpactVisualBinding = {
  generation: number
  meshes: Mesh[]
  root: Object3D
  slot: number
}

export type ZombieEscapeSkinnedImpactAttachment = {
  barycentric: Vector3
  binding: ZombieEscapeImpactVisualBinding | null
  faceA: number
  faceB: number
  faceC: number
  mesh: Mesh | null
  normalSign: number
  shotGeneration: number
  targetGeneration: number
  targetSlot: number
}

export type ZombieEscapeImpactVisualRegistry = {
  bindings: Map<number, ZombieEscapeImpactVisualBinding>
  scratch: {
    edgeA: Vector3
    edgeB: Vector3
    faceNormal: Vector3
    intersections: Intersection[]
    rayDirection: Vector3
    raycaster: Raycaster
    vertexA: Vector3
    vertexB: Vector3
    vertexC: Vector3
  }
}

export function createZombieEscapeImpactVisualRegistry(): ZombieEscapeImpactVisualRegistry {
  return {
    bindings: new Map(),
    scratch: {
      edgeA: new Vector3(),
      edgeB: new Vector3(),
      faceNormal: new Vector3(),
      intersections: [],
      rayDirection: new Vector3(),
      raycaster: new Raycaster(),
      vertexA: new Vector3(),
      vertexB: new Vector3(),
      vertexC: new Vector3(),
    },
  }
}

export function createZombieEscapeSkinnedImpactAttachment(): ZombieEscapeSkinnedImpactAttachment {
  return {
    barycentric: new Vector3(),
    binding: null,
    faceA: -1,
    faceB: -1,
    faceC: -1,
    mesh: null,
    normalSign: 1,
    shotGeneration: 0,
    targetGeneration: 0,
    targetSlot: -1,
  }
}

export function registerZombieEscapeImpactVisual(
  registry: ZombieEscapeImpactVisualRegistry,
  slot: number,
  generation: number,
  root: Object3D,
) {
  const meshes: Mesh[] = []
  root.traverse((object) => {
    const mesh = object as Mesh
    if (mesh.isMesh && mesh.geometry.getAttribute('position')) meshes.push(mesh)
  })
  const binding = { generation, meshes, root, slot } satisfies ZombieEscapeImpactVisualBinding
  registry.bindings.set(slot, binding)
  return () => {
    if (registry.bindings.get(slot) === binding) registry.bindings.delete(slot)
  }
}

export function captureZombieEscapeSkinnedImpact(
  registry: ZombieEscapeImpactVisualRegistry,
  targetSlot: number,
  targetGeneration: number,
  shotGeneration: number,
  worldRayStart: Vector3,
  worldRayEnd: Vector3,
  referenceWorldNormal: Vector3,
  output: ZombieEscapeSkinnedImpactAttachment,
) {
  const { scratch } = registry
  resetZombieEscapeSkinnedImpactAttachment(output, shotGeneration, targetSlot, targetGeneration)
  const binding = registry.bindings.get(targetSlot)
  if (!(binding && binding.generation === targetGeneration && binding.meshes.length > 0)) {
    return false
  }

  binding.root.updateWorldMatrix(true, true)
  scratch.rayDirection.copy(worldRayEnd).sub(worldRayStart)
  const rayLength = scratch.rayDirection.length()
  if (rayLength <= 0.000_001) return false
  scratch.rayDirection.multiplyScalar(1 / rayLength)
  scratch.raycaster.near = 0
  scratch.raycaster.far = rayLength
  scratch.raycaster.set(worldRayStart, scratch.rayDirection)
  scratch.intersections.length = 0
  scratch.raycaster.intersectObjects(binding.meshes, false, scratch.intersections)

  for (const intersection of scratch.intersections) {
    const face = intersection.face
    const mesh = intersection.object as Mesh
    if (!(face && binding.meshes.includes(mesh))) continue
    readZombieEscapeWorldVertex(mesh, face.a, scratch.vertexA)
    readZombieEscapeWorldVertex(mesh, face.b, scratch.vertexB)
    readZombieEscapeWorldVertex(mesh, face.c, scratch.vertexC)
    if (
      !Triangle.getBarycoord(
        intersection.point,
        scratch.vertexA,
        scratch.vertexB,
        scratch.vertexC,
        output.barycentric,
      )
    ) {
      continue
    }
    scratch.edgeA.subVectors(scratch.vertexB, scratch.vertexA)
    scratch.edgeB.subVectors(scratch.vertexC, scratch.vertexA)
    scratch.faceNormal.crossVectors(scratch.edgeA, scratch.edgeB)
    if (scratch.faceNormal.lengthSq() <= 0.000_000_1) continue
    scratch.faceNormal.normalize()
    output.binding = binding
    output.faceA = face.a
    output.faceB = face.b
    output.faceC = face.c
    output.mesh = mesh
    output.normalSign = scratch.faceNormal.dot(referenceWorldNormal) < 0 ? -1 : 1
    return true
  }
  return false
}

export function resolveZombieEscapeSkinnedImpact(
  registry: ZombieEscapeImpactVisualRegistry,
  attachment: ZombieEscapeSkinnedImpactAttachment,
  outputWorldPoint: Vector3,
  outputWorldNormal: Vector3,
) {
  const { scratch } = registry
  const { binding, mesh } = attachment
  if (!(binding && mesh)) return false
  const currentBinding = registry.bindings.get(attachment.targetSlot)
  if (
    currentBinding !== binding ||
    binding.generation !== attachment.targetGeneration ||
    !binding.meshes.includes(mesh)
  ) {
    return false
  }

  binding.root.updateWorldMatrix(true, true)
  readZombieEscapeWorldVertex(mesh, attachment.faceA, scratch.vertexA)
  readZombieEscapeWorldVertex(mesh, attachment.faceB, scratch.vertexB)
  readZombieEscapeWorldVertex(mesh, attachment.faceC, scratch.vertexC)
  outputWorldPoint
    .set(0, 0, 0)
    .addScaledVector(scratch.vertexA, attachment.barycentric.x)
    .addScaledVector(scratch.vertexB, attachment.barycentric.y)
    .addScaledVector(scratch.vertexC, attachment.barycentric.z)
  scratch.edgeA.subVectors(scratch.vertexB, scratch.vertexA)
  scratch.edgeB.subVectors(scratch.vertexC, scratch.vertexA)
  outputWorldNormal.crossVectors(scratch.edgeA, scratch.edgeB)
  if (outputWorldNormal.lengthSq() <= 0.000_000_1) return false
  outputWorldNormal.normalize().multiplyScalar(attachment.normalSign)
  return true
}

function resetZombieEscapeSkinnedImpactAttachment(
  output: ZombieEscapeSkinnedImpactAttachment,
  shotGeneration: number,
  targetSlot: number,
  targetGeneration: number,
) {
  output.barycentric.set(0, 0, 0)
  output.binding = null
  output.faceA = -1
  output.faceB = -1
  output.faceC = -1
  output.mesh = null
  output.normalSign = 1
  output.shotGeneration = shotGeneration
  output.targetGeneration = targetGeneration
  output.targetSlot = targetSlot
}

function readZombieEscapeWorldVertex(mesh: Mesh, index: number, output: Vector3) {
  mesh.getVertexPosition(index, output)
  return output.applyMatrix4(mesh.matrixWorld)
}
