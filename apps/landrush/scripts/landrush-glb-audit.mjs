import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'

const COMPONENT_BYTE_LENGTHS = {
  5120: 1,
  5121: 1,
  5122: 2,
  5123: 2,
  5125: 4,
  5126: 4,
}
const TYPE_COMPONENT_COUNTS = {
  MAT2: 4,
  MAT3: 9,
  MAT4: 16,
  SCALAR: 1,
  VEC2: 2,
  VEC3: 3,
  VEC4: 4,
}
const KTX2_IDENTIFIER = Buffer.from([
  0xab, 0x4b, 0x54, 0x58, 0x20, 0x32, 0x30, 0xbb, 0x0d, 0x0a, 0x1a, 0x0a,
])

export async function inspectGlb(path) {
  const file = await readFile(path)
  const { binaryChunk, json, version } = parseGlb(file, path)
  const images = (json.images ?? []).map((image, index) =>
    inspectImage(json, binaryChunk, image, index, path),
  )
  const materials = (json.materials ?? []).map((material, index) => ({
    index,
    name: material.name?.trim() || null,
    textureSlots: {
      baseColor: inspectTextureSlot(
        json,
        images,
        material.pbrMetallicRoughness?.baseColorTexture,
        path,
      ),
      emissive: inspectTextureSlot(json, images, material.emissiveTexture, path),
      metallicRoughness: inspectTextureSlot(
        json,
        images,
        material.pbrMetallicRoughness?.metallicRoughnessTexture,
        path,
      ),
      normal: inspectTextureSlot(json, images, material.normalTexture, path),
      occlusion: inspectTextureSlot(json, images, material.occlusionTexture, path),
    },
  }))

  let nonTrianglePrimitiveCount = 0
  let primitiveCount = 0
  let primitiveWithoutMaterialCount = 0
  let skinnedPrimitiveCount = 0
  let triangleCount = 0
  let trianglePrimitiveCount = 0
  for (const mesh of json.meshes ?? []) {
    for (const primitive of mesh.primitives ?? []) {
      primitiveCount += 1
      if (primitive.material === undefined) primitiveWithoutMaterialCount += 1
      if (
        primitive.attributes?.JOINTS_0 !== undefined &&
        primitive.attributes?.WEIGHTS_0 !== undefined
      ) {
        skinnedPrimitiveCount += 1
      }
      const mode = primitive.mode ?? 4
      if (mode !== 4) {
        nonTrianglePrimitiveCount += 1
        continue
      }
      trianglePrimitiveCount += 1
      const elementCount =
        primitive.indices !== undefined
          ? getAccessor(json, primitive.indices, path).count
          : getAccessor(json, primitive.attributes?.POSITION, path).count
      if (elementCount % 3 !== 0) {
        throw new Error(`${path} has a triangle primitive whose element count is not divisible by 3.`)
      }
      triangleCount += elementCount / 3
    }
  }

  const skinInspection = inspectSkinCompatibility(json, binaryChunk, path)
  const jointNodeIndices = new Set((json.skins ?? []).flatMap(({ joints }) => joints ?? []))
  const animations = (json.animations ?? []).map((animation, index) =>
    inspectAnimation(json, animation, index, jointNodeIndices, path),
  )

  return {
    animationCount: animations.length,
    animationNames: animations.map(({ name }) => name),
    animations,
    assetVersion: json.asset?.version ?? null,
    byteLength: file.byteLength,
    contentHash: hashBytes(file),
    extensionsRequired: [...(json.extensionsRequired ?? [])].sort(),
    extensionsUsed: [...(json.extensionsUsed ?? [])].sort(),
    glbVersion: version,
    imageCount: images.length,
    images,
    materialCount: materials.length,
    materials,
    meshCount: json.meshes?.length ?? 0,
    nonTrianglePrimitiveCount,
    primitiveCount,
    primitiveWithoutMaterialCount,
    skinCompatibilityHash: skinInspection.hash,
    skinSemanticCompatibilityHash: skinInspection.semanticHash,
    skinCount: json.skins?.length ?? 0,
    skinJointCounts: skinInspection.jointCounts,
    skinnedMeshNodeCount: skinInspection.skinnedMeshNodeCount,
    skinnedPrimitiveCount,
    textureCount: json.textures?.length ?? 0,
    triangleCount,
    trianglePrimitiveCount,
  }
}

function inspectAnimation(json, animation, animationIndex, jointNodeIndices, path) {
  const channels = animation.channels ?? []
  const samplers = animation.samplers ?? []
  const samplerTargets = Array.from({ length: samplers.length }, () => [])
  const targetKeys = new Set()
  let jointChannelCount = 0

  for (const channel of channels) {
    if (!Number.isInteger(channel.sampler) || !samplers[channel.sampler]) {
      throw new Error(`${path} animation ${animationIndex} references a missing sampler.`)
    }
    const targetNode = channel.target?.node
    const targetPath = channel.target?.path
    if (!['rotation', 'scale', 'translation', 'weights'].includes(targetPath)) {
      throw new Error(`${path} animation ${animationIndex} has an invalid target path.`)
    }
    nodeName(json, targetNode, path)
    const targetKey = `${targetNode}:${targetPath}`
    if (targetKeys.has(targetKey)) {
      throw new Error(`${path} animation ${animationIndex} targets ${targetKey} more than once.`)
    }
    targetKeys.add(targetKey)
    samplerTargets[channel.sampler].push(targetPath)
    if (jointNodeIndices.has(targetNode)) jointChannelCount += 1
  }

  for (let samplerIndex = 0; samplerIndex < samplers.length; samplerIndex += 1) {
    const sampler = samplers[samplerIndex]
    const targets = samplerTargets[samplerIndex]
    if (targets.length === 0) {
      throw new Error(`${path} animation ${animationIndex} has an unused sampler.`)
    }
    const interpolation = sampler.interpolation ?? 'LINEAR'
    if (!['CUBICSPLINE', 'LINEAR', 'STEP'].includes(interpolation)) {
      throw new Error(`${path} animation ${animationIndex} has invalid interpolation.`)
    }
    const input = getAccessor(json, sampler.input, path)
    const output = getAccessor(json, sampler.output, path)
    if (input.componentType !== 5126 || input.type !== 'SCALAR' || input.count < 1) {
      throw new Error(`${path} animation ${animationIndex} has an invalid time accessor.`)
    }
    if (output.componentType !== 5126) {
      throw new Error(`${path} animation ${animationIndex} has a non-float output accessor.`)
    }
    for (const target of targets) {
      const expectedType = target === 'rotation' ? 'VEC4' : target === 'weights' ? null : 'VEC3'
      if (expectedType && output.type !== expectedType) {
        throw new Error(`${path} animation ${animationIndex} has an invalid ${target} accessor.`)
      }
      if (target !== 'weights') {
        const expectedCount = input.count * (interpolation === 'CUBICSPLINE' ? 3 : 1)
        if (output.count !== expectedCount) {
          throw new Error(`${path} animation ${animationIndex} has mismatched keyframe counts.`)
        }
      }
    }
  }

  return {
    channelCount: channels.length,
    jointChannelCount,
    name: animation.name?.trim() || `animation-${animationIndex}`,
    samplerCount: samplers.length,
    targetNodeNames: [
      ...new Set(channels.map((channel) => nodeName(json, channel.target.node, path))),
    ].sort(),
    targetPaths: [...new Set(channels.map((channel) => channel.target.path))].sort(),
  }
}

function parseGlb(file, path) {
  if (file.byteLength < 12) throw new Error(`${path} is too short to be a GLB file.`)
  if (file.readUInt32LE(0) !== 0x46546c67) throw new Error(`${path} is not a GLB file.`)
  const version = file.readUInt32LE(4)
  if (version !== 2) throw new Error(`${path} uses unsupported GLB version ${version}.`)
  const declaredLength = file.readUInt32LE(8)
  if (declaredLength !== file.byteLength) {
    throw new Error(
      `${path} declares ${declaredLength} bytes but contains ${file.byteLength} bytes.`,
    )
  }

  let binaryChunk = null
  let json = null
  let offset = 12
  while (offset < file.length) {
    if (offset + 8 > file.length) throw new Error(`${path} has a truncated GLB chunk header.`)
    const chunkLength = file.readUInt32LE(offset)
    const chunkType = file.readUInt32LE(offset + 4)
    const chunkEnd = offset + 8 + chunkLength
    if (chunkEnd > file.length) throw new Error(`${path} has a truncated GLB chunk.`)
    const chunk = file.subarray(offset + 8, chunkEnd)
    if (chunkType === 0x4e4f534a) {
      if (json) throw new Error(`${path} has more than one JSON chunk.`)
      json = JSON.parse(chunk.toString('utf8').replace(/\u0000+$/u, ''))
    } else if (chunkType === 0x004e4942) {
      if (binaryChunk) throw new Error(`${path} has more than one binary chunk.`)
      binaryChunk = chunk
    }
    offset = chunkEnd
  }
  if (!json) throw new Error(`${path} has no JSON chunk.`)
  if (json.asset?.version !== '2.0') throw new Error(`${path} is not a glTF 2.0 asset.`)
  return { binaryChunk, json, version }
}

function inspectImage(json, binaryChunk, image, index, path) {
  const data = imageData(json, binaryChunk, image, path)
  const detected = data ? detectImage(data) : null
  return {
    basisMode: detected?.basisMode ?? null,
    byteLength: data?.byteLength ?? null,
    embedded: Boolean(data),
    hasFullMipChain: detected?.hasFullMipChain ?? null,
    height: detected?.height ?? null,
    index,
    levelCount: detected?.levelCount ?? null,
    mimeType: image.mimeType ?? detected?.mimeType ?? null,
    name: image.name?.trim() || null,
    supercompressionScheme: detected?.supercompressionScheme ?? null,
    uncompressedRgbaMipByteLength: detected?.uncompressedRgbaMipByteLength ?? null,
    vkFormat: detected?.vkFormat ?? null,
    width: detected?.width ?? null,
  }
}

function imageData(json, binaryChunk, image, path) {
  if (image.bufferView !== undefined) {
    return bufferViewBytes(json, binaryChunk, image.bufferView, path)
  }
  if (typeof image.uri !== 'string' || !image.uri.startsWith('data:')) return null
  const comma = image.uri.indexOf(',')
  if (comma < 0) throw new Error(`${path} contains an invalid image data URI.`)
  const header = image.uri.slice(0, comma)
  const payload = image.uri.slice(comma + 1)
  return header.endsWith(';base64')
    ? Buffer.from(payload, 'base64')
    : Buffer.from(decodeURIComponent(payload))
}

function detectImage(data) {
  const ktx2 = ktx2Metadata(data)
  if (ktx2) return ktx2
  if (
    data.byteLength >= 24 &&
    data.readUInt32BE(0) === 0x89504e47 &&
    data.readUInt32BE(4) === 0x0d0a1a0a
  ) {
    return {
      height: data.readUInt32BE(20),
      mimeType: 'image/png',
      width: data.readUInt32BE(16),
    }
  }
  const jpeg = jpegDimensions(data)
  if (jpeg) return { ...jpeg, mimeType: 'image/jpeg' }
  const webp = webpDimensions(data)
  if (webp) return { ...webp, mimeType: 'image/webp' }
  return null
}

function ktx2Metadata(data) {
  if (data.byteLength < 80 || !data.subarray(0, KTX2_IDENTIFIER.length).equals(KTX2_IDENTIFIER)) {
    return null
  }
  const vkFormat = data.readUInt32LE(12)
  const width = data.readUInt32LE(20)
  const height = data.readUInt32LE(24)
  const levelCount = data.readUInt32LE(40)
  const supercompressionScheme = data.readUInt32LE(44)
  if (width < 1 || height < 1 || levelCount < 1) return null
  const fullMipLevelCount = Math.floor(Math.log2(Math.max(width, height))) + 1
  return {
    basisMode:
      vkFormat !== 0
        ? null
        : supercompressionScheme === 1
          ? 'etc1s'
          : supercompressionScheme === 2
            ? 'uastc'
            : 'uastc-uncompressed',
    hasFullMipChain: levelCount === fullMipLevelCount,
    height,
    levelCount,
    mimeType: 'image/ktx2',
    supercompressionScheme,
    uncompressedRgbaMipByteLength: rgbaMipByteLength(width, height, levelCount),
    vkFormat,
    width,
  }
}

function rgbaMipByteLength(width, height, levelCount) {
  let byteLength = 0
  for (let level = 0; level < levelCount; level += 1) {
    byteLength += Math.max(1, width >> level) * Math.max(1, height >> level) * 4
  }
  return byteLength
}

function jpegDimensions(data) {
  if (data.byteLength < 4 || data[0] !== 0xff || data[1] !== 0xd8) return null
  let offset = 2
  while (offset + 3 < data.byteLength) {
    if (data[offset] !== 0xff) {
      offset += 1
      continue
    }
    while (data[offset] === 0xff) offset += 1
    const marker = data[offset]
    offset += 1
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue
    if (marker === 0xd9 || marker === 0xda || offset + 2 > data.byteLength) break
    const segmentLength = data.readUInt16BE(offset)
    if (segmentLength < 2 || offset + segmentLength > data.byteLength) break
    if (
      [0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(
        marker,
      )
    ) {
      if (segmentLength < 7) return null
      return { height: data.readUInt16BE(offset + 3), width: data.readUInt16BE(offset + 5) }
    }
    offset += segmentLength
  }
  return null
}

function webpDimensions(data) {
  if (
    data.byteLength < 30 ||
    data.toString('ascii', 0, 4) !== 'RIFF' ||
    data.toString('ascii', 8, 12) !== 'WEBP'
  ) {
    return null
  }
  const chunkType = data.toString('ascii', 12, 16)
  if (chunkType === 'VP8X') {
    return {
      height: 1 + data.readUIntLE(27, 3),
      width: 1 + data.readUIntLE(24, 3),
    }
  }
  if (chunkType === 'VP8 ' && data.toString('hex', 23, 26) === '9d012a') {
    return {
      height: data.readUInt16LE(28) & 0x3fff,
      width: data.readUInt16LE(26) & 0x3fff,
    }
  }
  if (chunkType === 'VP8L' && data[20] === 0x2f) {
    return {
      height: 1 + (((data[24] & 0x0f) << 10) | (data[23] << 2) | (data[22] >> 6)),
      width: 1 + (((data[22] & 0x3f) << 8) | data[21]),
    }
  }
  return null
}

function inspectTextureSlot(json, images, slot, path) {
  if (!slot) return null
  const textureIndex = slot.index
  const texture = json.textures?.[textureIndex]
  if (!texture) throw new Error(`${path} references missing texture ${textureIndex}.`)
  const basisImageIndex = texture.extensions?.KHR_texture_basisu?.source
  const sourceImageIndex = texture.source
  const imageIndex = basisImageIndex ?? sourceImageIndex
  if (!Number.isInteger(imageIndex) || !images[imageIndex]) {
    throw new Error(`${path} texture ${textureIndex} does not reference a valid image.`)
  }
  const image = images[imageIndex]
  const sourceImage = Number.isInteger(sourceImageIndex) ? images[sourceImageIndex] : null
  if (Number.isInteger(sourceImageIndex) && !sourceImage) {
    throw new Error(`${path} texture ${textureIndex} has an invalid fallback source image.`)
  }
  return {
    basisMode: image.basisMode,
    fallbackImageIndex:
      Number.isInteger(basisImageIndex) && Number.isInteger(sourceImageIndex)
        ? sourceImageIndex
        : null,
    fallbackMimeType:
      Number.isInteger(basisImageIndex) && Number.isInteger(sourceImageIndex)
        ? sourceImage.mimeType
        : null,
    hasRasterFallback:
      Number.isInteger(basisImageIndex) &&
      Number.isInteger(sourceImageIndex) &&
      ['image/jpeg', 'image/png', 'image/webp'].includes(sourceImage.mimeType),
    hasFullMipChain: image.hasFullMipChain,
    height: image.height,
    imageIndex,
    ktx2ExtensionSource: Number.isInteger(basisImageIndex),
    levelCount: image.levelCount,
    mimeType: image.mimeType,
    supercompressionScheme: image.supercompressionScheme,
    sourceImageIndex: Number.isInteger(sourceImageIndex) ? sourceImageIndex : null,
    texCoord: slot.texCoord ?? 0,
    textureIndex,
    uncompressedRgbaMipByteLength: image.uncompressedRgbaMipByteLength,
    width: image.width,
  }
}

function inspectSkinCompatibility(json, binaryChunk, path) {
  const skins = json.skins ?? []
  const nodes = json.nodes ?? []
  const parentByNode = Array(nodes.length).fill(null)
  for (let parent = 0; parent < nodes.length; parent += 1) {
    for (const child of nodes[parent]?.children ?? []) {
      if (parentByNode[child] !== null && parentByNode[child] !== parent) {
        throw new Error(`${path} node ${child} has more than one parent.`)
      }
      parentByNode[child] = parent
    }
  }

  const skinSignatures = skins.map((skin, skinIndex) => {
    const jointPosition = new Map(skin.joints.map((nodeIndex, index) => [nodeIndex, index]))
    return {
      inverseBindMatrices: accessorSignature(
        json,
        binaryChunk,
        skin.inverseBindMatrices,
        path,
        true,
      ),
      joints: skin.joints.map((nodeIndex) => {
        const node = nodes[nodeIndex]
        if (!node) throw new Error(`${path} skin ${skinIndex} references missing node ${nodeIndex}.`)
        const parentNode = parentByNode[nodeIndex]
        return {
          matrix: node.matrix ?? null,
          name: node.name?.trim() || null,
          parentJoint: jointPosition.get(parentNode) ?? null,
          parentName: parentNode === null ? null : nodes[parentNode]?.name?.trim() || null,
          rotation: node.rotation ?? null,
          scale: node.scale ?? null,
          translation: node.translation ?? null,
        }
      }),
      skeletonJoint: jointPosition.get(skin.skeleton) ?? null,
    }
  })

  const bindings = []
  for (let nodeIndex = 0; nodeIndex < nodes.length; nodeIndex += 1) {
    const node = nodes[nodeIndex]
    if (node?.mesh === undefined || node.skin === undefined) continue
    const mesh = json.meshes?.[node.mesh]
    const skin = skins[node.skin]
    if (!mesh || !skin) throw new Error(`${path} has an invalid skinned mesh node.`)
    bindings.push({
      meshName: mesh.name?.trim() || null,
      nodeName: node.name?.trim() || null,
      primitives: (mesh.primitives ?? []).map((primitive) => ({
        indices: accessorSignature(json, binaryChunk, primitive.indices, path, true),
        joints: accessorSignature(
          json,
          binaryChunk,
          primitive.attributes?.JOINTS_0,
          path,
          true,
        ),
        mode: primitive.mode ?? 4,
        position: accessorSignature(
          json,
          binaryChunk,
          primitive.attributes?.POSITION,
          path,
          true,
        ),
        weights: accessorSignature(
          json,
          binaryChunk,
          primitive.attributes?.WEIGHTS_0,
          path,
          true,
        ),
      })),
      skin: node.skin,
    })
  }

  const signature = { bindings, skins: skinSignatures }
  return {
    hash: skins.length > 0 ? hashBytes(Buffer.from(JSON.stringify(signature))) : null,
    jointCounts: skins.map(({ joints }) => joints.length),
    semanticHash:
      skins.length > 0
        ? hashBytes(Buffer.from(JSON.stringify(canonicalizeSkinSignature(signature))))
        : null,
    skinnedMeshNodeCount: bindings.length,
  }
}

function canonicalizeSkinSignature(signature) {
  return {
    ...signature,
    skins: signature.skins.map((skin) => ({
      ...skin,
      joints: skin.joints.map((joint) => ({
        ...joint,
        matrix: canonicalizeTransform(joint.matrix),
        rotation: canonicalizeTransform(joint.rotation ?? [0, 0, 0, 1]),
        scale: canonicalizeScale(joint.scale ?? [1, 1, 1]),
        translation: canonicalizeTransform(joint.translation ?? [0, 0, 0]),
      })),
    })),
  }
}

function canonicalizeScale(values) {
  return values.map((value) => (Math.abs(value - 1) < 1e-5 ? 1 : value))
}

function canonicalizeTransform(values) {
  if (!values) return values
  return values.map((value) => {
    if (Math.abs(value) < 1e-6) return 0
    if (Math.abs(value - 1) < 1e-6) return 1
    if (Math.abs(value + 1) < 1e-6) return -1
    return value
  })
}

function accessorSignature(json, binaryChunk, accessorIndex, path, includeDataHash) {
  if (accessorIndex === undefined) return null
  const accessor = getAccessor(json, accessorIndex, path)
  return {
    componentType: accessor.componentType,
    count: accessor.count,
    dataHash: includeDataHash
      ? hashAccessorData(json, binaryChunk, accessorIndex, path)
      : undefined,
    normalized: accessor.normalized ?? false,
    type: accessor.type,
  }
}

function hashAccessorData(json, binaryChunk, accessorIndex, path) {
  const accessor = getAccessor(json, accessorIndex, path)
  if (accessor.sparse) {
    throw new Error(`${path} uses a sparse accessor where dense skin compatibility is required.`)
  }
  if (accessor.bufferView === undefined) {
    throw new Error(`${path} accessor ${accessorIndex} has no buffer view.`)
  }
  const view = json.bufferViews?.[accessor.bufferView]
  if (!view) throw new Error(`${path} accessor ${accessorIndex} references a missing buffer view.`)
  const componentBytes = COMPONENT_BYTE_LENGTHS[accessor.componentType]
  const componentCount = TYPE_COMPONENT_COUNTS[accessor.type]
  if (!componentBytes || !componentCount) {
    throw new Error(`${path} accessor ${accessorIndex} has an unsupported representation.`)
  }
  const elementBytes = componentBytes * componentCount
  const stride = view.byteStride ?? elementBytes
  if (stride < elementBytes) throw new Error(`${path} accessor ${accessorIndex} has an invalid stride.`)
  const viewData = bufferViewBytes(json, binaryChunk, accessor.bufferView, path)
  const start = accessor.byteOffset ?? 0
  const finalByte = start + Math.max(0, accessor.count - 1) * stride + elementBytes
  if (finalByte > viewData.byteLength) {
    throw new Error(`${path} accessor ${accessorIndex} exceeds its buffer view.`)
  }
  const hash = createHash('sha256')
  for (let index = 0; index < accessor.count; index += 1) {
    const offset = start + index * stride
    hash.update(viewData.subarray(offset, offset + elementBytes))
  }
  return hash.digest('hex')
}

function bufferViewBytes(json, binaryChunk, bufferViewIndex, path) {
  const view = json.bufferViews?.[bufferViewIndex]
  if (!view) throw new Error(`${path} references missing buffer view ${bufferViewIndex}.`)
  if (view.buffer !== 0 || !binaryChunk) {
    throw new Error(`${path} buffer view ${bufferViewIndex} is not embedded in the GLB binary chunk.`)
  }
  const start = view.byteOffset ?? 0
  const end = start + view.byteLength
  if (start < 0 || end > binaryChunk.byteLength) {
    throw new Error(`${path} buffer view ${bufferViewIndex} exceeds the binary chunk.`)
  }
  return binaryChunk.subarray(start, end)
}

function getAccessor(json, accessorIndex, path) {
  if (!Number.isInteger(accessorIndex) || !json.accessors?.[accessorIndex]) {
    throw new Error(`${path} references missing accessor ${accessorIndex}.`)
  }
  return json.accessors[accessorIndex]
}

function nodeName(json, nodeIndex, path) {
  if (!Number.isInteger(nodeIndex) || !json.nodes?.[nodeIndex]) {
    throw new Error(`${path} animation references missing node ${nodeIndex}.`)
  }
  return json.nodes[nodeIndex].name?.trim() || `node-${nodeIndex}`
}

function hashBytes(value) {
  return createHash('sha256').update(value).digest('hex')
}
