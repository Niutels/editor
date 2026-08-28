import {
  AttachedBindMode,
  type BufferAttribute,
  type BufferGeometry,
  DetachedBindMode,
  Float32BufferAttribute,
  type Group,
  InterleavedBuffer,
  InterleavedBufferAttribute,
  type Material,
  Matrix4,
  Mesh,
  type Skeleton,
  type SkinnedMesh,
  StreamDrawUsage,
} from 'three'

type LandrushRobotCpuSkinningMesh = Readonly<{
  bindMatrix: Matrix4
  bindMatrixInverse: Matrix4
  boneMatrix: Matrix4
  combinedBoneMatrices: Float32Array
  combinedMatrix: Matrix4
  dynamicVertexBuffer: InterleavedBuffer
  geometry: BufferGeometry
  normal: Float32Array
  outputNormal: InterleavedBufferAttribute
  outputPosition: InterleavedBufferAttribute
  position: Float32Array
  replacement: Mesh
  skeleton: Skeleton
  skinIndex: Uint32Array
  skinWeight: Float32Array
  source: SkinnedMesh
}>

export type LandrushRobotCpuSkinning = Readonly<{
  dispose: () => void
  meshes: readonly Mesh[]
  update: () => void
}>

export function createLandrushRobotCpuSkinning(root: Group): LandrushRobotCpuSkinning {
  const sources: SkinnedMesh[] = []
  root.traverse((child) => {
    if ((child as SkinnedMesh).isSkinnedMesh === true) sources.push(child as SkinnedMesh)
  })

  const prepared: LandrushRobotCpuSkinningMesh[] = []
  try {
    for (const source of sources) prepared.push(prepareCpuSkinningMesh(source))
  } catch (error) {
    for (const mesh of prepared) mesh.geometry.dispose()
    throw error
  }

  for (const mesh of prepared) replaceSkinnedMesh(mesh.source, mesh.replacement)
  const skeletons = Array.from(new Set(prepared.map((mesh) => mesh.skeleton)))

  let disposed = false
  const update = () => {
    if (disposed) return
    root.updateWorldMatrix(true, true)

    for (const skeleton of skeletons) skeleton.update()
    for (const mesh of prepared) updateCpuSkinningMesh(mesh)
  }
  const dispose = () => {
    if (disposed) return
    disposed = true
    for (const mesh of prepared) mesh.geometry.dispose()
  }

  update()
  return {
    dispose,
    meshes: prepared.map((mesh) => mesh.replacement),
    update,
  }
}

function prepareCpuSkinningMesh(source: SkinnedMesh): LandrushRobotCpuSkinningMesh {
  validateCpuSkinningSource(source)

  const sourceGeometry = source.geometry
  const sourcePosition = sourceGeometry.getAttribute('position')
  const sourceNormal = sourceGeometry.getAttribute('normal')
  const sourceSkinIndex = sourceGeometry.getAttribute('skinIndex')
  const sourceSkinWeight = sourceGeometry.getAttribute('skinWeight')
  const position = readFloatAttribute(sourcePosition, 3)
  const normal = readFloatAttribute(sourceNormal, 3)
  const skinIndex = readSkinIndices(sourceSkinIndex, source.skeleton, sourcePosition.count)
  const skinWeight = readSkinWeights(sourceSkinWeight, sourcePosition.count)
  const geometry = sourceGeometry.clone()
  for (const [name, attribute] of Object.entries(sourceGeometry.attributes)) {
    if (name === 'normal' || name === 'position' || name === 'skinIndex' || name === 'skinWeight') {
      continue
    }
    geometry.setAttribute(name, cloneStaticAttribute(attribute))
  }
  const { dynamicVertexBuffer, outputNormal, outputPosition } = createDynamicVertexAttributes(
    position,
    normal,
    sourcePosition.name,
    sourceNormal.name,
  )
  geometry.setAttribute('position', outputPosition)
  geometry.setAttribute('normal', outputNormal)
  geometry.deleteAttribute('skinIndex')
  geometry.deleteAttribute('skinWeight')
  geometry.boundingBox = null
  geometry.boundingSphere = null

  const replacement = new Mesh<BufferGeometry, Material | Material[]>(geometry, source.material)
  replacement.copy(source, false)
  replacement.geometry = geometry
  replacement.material = source.material
  replacement.userData = source.userData
  replacement.uuid = source.uuid
  replacement.count = source.count
  replacement.customDepthMaterial = source.customDepthMaterial
  replacement.customDistanceMaterial = source.customDistanceMaterial
  replacement.onBeforeRender = source.onBeforeRender
  replacement.onAfterRender = source.onAfterRender
  replacement.onBeforeShadow = source.onBeforeShadow
  replacement.onAfterShadow = source.onAfterShadow

  return {
    bindMatrix: source.bindMatrix.clone(),
    bindMatrixInverse: source.bindMatrixInverse.clone(),
    boneMatrix: new Matrix4(),
    combinedBoneMatrices: new Float32Array(source.skeleton.bones.length * 16),
    combinedMatrix: new Matrix4(),
    dynamicVertexBuffer,
    geometry,
    normal,
    outputNormal,
    outputPosition,
    position,
    replacement,
    skeleton: source.skeleton,
    skinIndex,
    skinWeight,
    source,
  }
}

function validateCpuSkinningSource(source: SkinnedMesh) {
  if (!source.parent) {
    throw new Error(
      `Landrush robot CPU skinning requires a parent for ${source.name || source.uuid}`,
    )
  }
  if (source.bindMode !== AttachedBindMode && source.bindMode !== DetachedBindMode) {
    throw new Error(`Landrush robot CPU skinning does not support bind mode ${source.bindMode}`)
  }
  if (source.static) {
    throw new Error('Landrush robot CPU skinning cannot replace a static SkinnedMesh')
  }
  if (
    source.morphTargetInfluences !== undefined ||
    Object.values(source.geometry.morphAttributes).some((attributes) => attributes.length > 0)
  ) {
    throw new Error('Landrush robot CPU skinning does not support morph targets')
  }

  const position = requireAttribute(source.geometry, 'position', 3)
  const skinIndex = requireAttribute(source.geometry, 'skinIndex', 4)
  const skinWeight = requireAttribute(source.geometry, 'skinWeight', 4)
  const normal = requireAttribute(source.geometry, 'normal', 3)
  const tangent = source.geometry.getAttribute('tangent')
  if (skinIndex.count !== position.count || skinWeight.count !== position.count) {
    throw new Error('Landrush robot CPU skinning attributes must have matching vertex counts')
  }
  if (normal.count !== position.count) {
    throw new Error('Landrush robot CPU skinning requires one three-component normal per vertex')
  }
  if (tangent) {
    throw new Error('Landrush robot CPU skinning does not support tangent attributes')
  }
}

function requireAttribute(geometry: BufferGeometry, name: string, itemSize: number) {
  const attribute = geometry.getAttribute(name)
  if (!attribute || attribute.itemSize !== itemSize) {
    throw new Error(
      `Landrush robot CPU skinning requires a ${itemSize}-component ${name} attribute`,
    )
  }
  return attribute
}

function readFloatAttribute(
  attribute: BufferAttribute | InterleavedBufferAttribute,
  itemSize: 3 | 4,
) {
  const values = new Float32Array(attribute.count * itemSize)
  for (let index = 0; index < attribute.count; index += 1) {
    const offset = index * itemSize
    values[offset] = attribute.getX(index)
    values[offset + 1] = attribute.getY(index)
    values[offset + 2] = attribute.getZ(index)
    if (itemSize === 4) values[offset + 3] = attribute.getW(index)
  }
  return values
}

function readSkinIndices(
  attribute: BufferAttribute | InterleavedBufferAttribute,
  skeleton: Skeleton,
  vertexCount: number,
) {
  const values = new Uint32Array(vertexCount * 4)
  for (let index = 0; index < vertexCount; index += 1) {
    const offset = index * 4
    values[offset] = readSkinIndex(attribute.getX(index), skeleton)
    values[offset + 1] = readSkinIndex(attribute.getY(index), skeleton)
    values[offset + 2] = readSkinIndex(attribute.getZ(index), skeleton)
    values[offset + 3] = readSkinIndex(attribute.getW(index), skeleton)
  }
  return values
}

function readSkinIndex(value: number, skeleton: Skeleton) {
  if (!Number.isInteger(value) || value < 0 || value >= skeleton.bones.length) {
    throw new Error(`Landrush robot CPU skinning received invalid bone index ${value}`)
  }
  return value
}

function readSkinWeights(
  attribute: BufferAttribute | InterleavedBufferAttribute,
  vertexCount: number,
) {
  const values = new Float32Array(vertexCount * 4)
  for (let index = 0; index < vertexCount; index += 1) {
    const offset = index * 4
    values[offset] = readSkinWeight(attribute.getX(index))
    values[offset + 1] = readSkinWeight(attribute.getY(index))
    values[offset + 2] = readSkinWeight(attribute.getZ(index))
    values[offset + 3] = readSkinWeight(attribute.getW(index))
  }
  return values
}

function readSkinWeight(value: number) {
  if (!Number.isFinite(value)) {
    throw new Error(`Landrush robot CPU skinning received invalid bone weight ${value}`)
  }
  return value
}

function cloneStaticAttribute(attribute: BufferAttribute | InterleavedBufferAttribute) {
  const values = new Float32Array(attribute.count * attribute.itemSize)
  for (let index = 0; index < attribute.count; index += 1) {
    const offset = index * attribute.itemSize
    for (let component = 0; component < attribute.itemSize; component += 1) {
      values[offset + component] = attribute.getComponent(index, component)
    }
  }
  const clone = new Float32BufferAttribute(values, attribute.itemSize)
  clone.name = attribute.name
  return clone
}

function createDynamicVertexAttributes(
  position: Float32Array,
  normal: Float32Array,
  positionName: string,
  normalName: string,
) {
  const vertexCount = position.length / 3
  const dynamicVertexBuffer = new InterleavedBuffer(new Float32Array(vertexCount * 6), 6)
  dynamicVertexBuffer.setUsage(StreamDrawUsage)
  const outputPosition = new InterleavedBufferAttribute(dynamicVertexBuffer, 3, 0)
  const outputNormal = new InterleavedBufferAttribute(dynamicVertexBuffer, 3, 3)
  outputPosition.name = positionName
  outputNormal.name = normalName
  return { dynamicVertexBuffer, outputNormal, outputPosition }
}

function replaceSkinnedMesh(source: SkinnedMesh, replacement: Mesh) {
  const parent = source.parent
  if (!parent) throw new Error('Landrush robot CPU skinning source lost its parent')
  const childIndex = parent.children.indexOf(source)
  if (childIndex < 0) throw new Error('Landrush robot CPU skinning source is not in its parent')

  for (const child of [...source.children]) {
    source.remove(child)
    replacement.add(child)
  }
  parent.children[childIndex] = replacement
  replacement.parent = parent
  source.parent = null
}

function updateCpuSkinningMesh(mesh: LandrushRobotCpuSkinningMesh) {
  if (mesh.source.bindMode === AttachedBindMode) {
    mesh.bindMatrixInverse.copy(mesh.replacement.matrixWorld).invert()
  } else {
    mesh.bindMatrixInverse.copy(mesh.bindMatrix).invert()
  }

  const boneMatrices = mesh.skeleton.boneMatrices
  if (!boneMatrices) throw new Error('Landrush robot CPU skinning skeleton has no matrix palette')
  for (let boneIndex = 0; boneIndex < mesh.skeleton.bones.length; boneIndex += 1) {
    const boneOffset = boneIndex * 16
    mesh.boneMatrix.fromArray(boneMatrices, boneOffset)
    mesh.combinedMatrix
      .multiplyMatrices(mesh.bindMatrixInverse, mesh.boneMatrix)
      .multiply(mesh.bindMatrix)
      .toArray(mesh.combinedBoneMatrices, boneOffset)
  }
  const output = mesh.dynamicVertexBuffer.array as Float32Array

  for (let index = 0; index < mesh.outputPosition.count; index += 1) {
    const vertexOffset = index * 3
    const outputOffset = index * 6
    const skinOffset = index * 4
    applyCpuSkinTransform(
      mesh.position,
      vertexOffset,
      1,
      mesh.skinIndex,
      mesh.skinWeight,
      skinOffset,
      mesh.combinedBoneMatrices,
      output,
      outputOffset,
    )
    applyCpuSkinTransform(
      mesh.normal,
      vertexOffset,
      0,
      mesh.skinIndex,
      mesh.skinWeight,
      skinOffset,
      mesh.combinedBoneMatrices,
      output,
      outputOffset + 3,
      true,
    )
  }

  mesh.dynamicVertexBuffer.needsUpdate = true
  mesh.geometry.boundingBox = null
  mesh.geometry.boundingSphere = null
}

function applyCpuSkinTransform(
  source: Float32Array,
  sourceOffset: number,
  sourceW: 0 | 1,
  skinIndex: Uint32Array,
  skinWeight: Float32Array,
  skinOffset: number,
  combinedBoneMatrices: Float32Array,
  output: Float32Array,
  outputOffset: number,
  normalize = false,
) {
  const sourceX = source[sourceOffset]!
  const sourceY = source[sourceOffset + 1]!
  const sourceZ = source[sourceOffset + 2]!

  let skinnedX = 0
  let skinnedY = 0
  let skinnedZ = 0
  for (let influence = 0; influence < 4; influence += 1) {
    const weight = skinWeight[skinOffset + influence]!
    if (weight === 0) continue
    const boneOffset = skinIndex[skinOffset + influence]! * 16
    skinnedX +=
      (combinedBoneMatrices[boneOffset]! * sourceX +
        combinedBoneMatrices[boneOffset + 4]! * sourceY +
        combinedBoneMatrices[boneOffset + 8]! * sourceZ +
        combinedBoneMatrices[boneOffset + 12]! * sourceW) *
      weight
    skinnedY +=
      (combinedBoneMatrices[boneOffset + 1]! * sourceX +
        combinedBoneMatrices[boneOffset + 5]! * sourceY +
        combinedBoneMatrices[boneOffset + 9]! * sourceZ +
        combinedBoneMatrices[boneOffset + 13]! * sourceW) *
      weight
    skinnedZ +=
      (combinedBoneMatrices[boneOffset + 2]! * sourceX +
        combinedBoneMatrices[boneOffset + 6]! * sourceY +
        combinedBoneMatrices[boneOffset + 10]! * sourceZ +
        combinedBoneMatrices[boneOffset + 14]! * sourceW) *
      weight
  }

  if (normalize) {
    const length = Math.hypot(skinnedX, skinnedY, skinnedZ)
    if (length > 0) {
      skinnedX /= length
      skinnedY /= length
      skinnedZ /= length
    }
  }
  output[outputOffset] = skinnedX
  output[outputOffset + 1] = skinnedY
  output[outputOffset + 2] = skinnedZ
}
