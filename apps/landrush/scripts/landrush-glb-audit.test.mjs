import assert from 'node:assert/strict'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { inspectGlb } from './landrush-glb-audit.mjs'

test('inspects embedded Basis KTX2 dimensions, mip chain, and extension precedence', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'landrush-glb-audit-'))
  const path = join(directory, 'basis.glb')
  try {
    await writeFile(path, createTextureFixtureGlb())
    const inspection = await inspectGlb(path)
    assert.deepEqual(inspection.extensionsRequired, ['KHR_texture_basisu'])
    assert.equal(inspection.images[1].mimeType, 'image/ktx2')
    assert.equal(inspection.images[1].width, 512)
    assert.equal(inspection.images[1].height, 512)
    assert.equal(inspection.images[1].levelCount, 10)
    assert.equal(inspection.images[1].hasFullMipChain, true)
    assert.equal(inspection.images[1].basisMode, 'etc1s')
    assert.equal(inspection.images[1].uncompressedRgbaMipByteLength, 1_398_100)
    assert.deepEqual(inspection.materials[0].textureSlots.baseColor, {
      basisMode: 'etc1s',
      fallbackImageIndex: 0,
      fallbackMimeType: 'image/png',
      hasRasterFallback: true,
      hasFullMipChain: true,
      height: 512,
      imageIndex: 1,
      ktx2ExtensionSource: true,
      levelCount: 10,
      mimeType: 'image/ktx2',
      supercompressionScheme: 1,
      sourceImageIndex: 0,
      texCoord: 0,
      textureIndex: 0,
      uncompressedRgbaMipByteLength: 1_398_100,
      width: 512,
    })
  } finally {
    await rm(directory, { force: true, recursive: true })
  }
})

test('reports an extension-only KTX2 texture without a raster fallback', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'landrush-glb-audit-'))
  const path = join(directory, 'basis-only.glb')
  try {
    await writeFile(path, createTextureFixtureGlb({ includeFallback: false }))
    const slot = (await inspectGlb(path)).materials[0].textureSlots.baseColor
    assert.equal(slot.ktx2ExtensionSource, true)
    assert.equal(slot.sourceImageIndex, null)
    assert.equal(slot.fallbackImageIndex, null)
    assert.equal(slot.fallbackMimeType, null)
    assert.equal(slot.hasRasterFallback, false)
  } finally {
    await rm(directory, { force: true, recursive: true })
  }
})

test('reports an incomplete UASTC mip chain', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'landrush-glb-audit-'))
  const path = join(directory, 'uastc.glb')
  try {
    await writeFile(path, createTextureFixtureGlb({ levelCount: 1, supercompressionScheme: 2 }))
    const inspection = await inspectGlb(path)
    assert.equal(inspection.images[1].basisMode, 'uastc')
    assert.equal(inspection.images[1].hasFullMipChain, false)
    assert.equal(inspection.images[1].uncompressedRgbaMipByteLength, 1_048_576)
  } finally {
    await rm(directory, { force: true, recursive: true })
  }
})

test('skin semantic compatibility ignores exporter-scale noise without weakening exact hashes', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'landrush-glb-audit-'))
  const noisyPath = join(directory, 'noisy-skin.glb')
  const canonicalPath = join(directory, 'canonical-skin.glb')
  try {
    await writeFile(noisyPath, createSkinFixtureGlb([0.999_997, 1.000_003, 1]))
    await writeFile(canonicalPath, createSkinFixtureGlb())
    const noisy = await inspectGlb(noisyPath)
    const canonical = await inspectGlb(canonicalPath)
    assert.notEqual(noisy.skinCompatibilityHash, canonical.skinCompatibilityHash)
    assert.equal(noisy.skinSemanticCompatibilityHash, canonical.skinSemanticCompatibilityHash)
  } finally {
    await rm(directory, { force: true, recursive: true })
  }
})

function createTextureFixtureGlb({
  includeFallback = true,
  levelCount = 10,
  supercompressionScheme = 1,
} = {}) {
  const png = Buffer.alloc(24)
  png.writeUInt32BE(0x89504e47, 0)
  png.writeUInt32BE(0x0d0a1a0a, 4)
  png.writeUInt32BE(1, 16)
  png.writeUInt32BE(1, 20)
  const ktx2 = Buffer.alloc(80)
  Buffer.from([0xab, 0x4b, 0x54, 0x58, 0x20, 0x32, 0x30, 0xbb, 0x0d, 0x0a, 0x1a, 0x0a]).copy(
    ktx2,
  )
  ktx2.writeUInt32LE(1, 16)
  ktx2.writeUInt32LE(512, 20)
  ktx2.writeUInt32LE(512, 24)
  ktx2.writeUInt32LE(1, 36)
  ktx2.writeUInt32LE(levelCount, 40)
  ktx2.writeUInt32LE(supercompressionScheme, 44)
  const binary = Buffer.concat([png, ktx2])
  const json = {
    asset: { version: '2.0' },
    bufferViews: [
      { buffer: 0, byteLength: png.byteLength, byteOffset: 0 },
      { buffer: 0, byteLength: ktx2.byteLength, byteOffset: png.byteLength },
    ],
    buffers: [{ byteLength: binary.byteLength }],
    extensionsRequired: ['KHR_texture_basisu'],
    extensionsUsed: ['KHR_texture_basisu'],
    images: [
      { bufferView: 0, mimeType: 'image/png' },
      { bufferView: 1, mimeType: 'image/ktx2' },
    ],
    materials: [
      {
        pbrMetallicRoughness: { baseColorTexture: { index: 0 } },
      },
    ],
    textures: [
      {
        extensions: { KHR_texture_basisu: { source: 1 } },
        ...(includeFallback ? { source: 0 } : {}),
      },
    ],
  }
  return createGlb(json, binary)
}

function createSkinFixtureGlb(scale) {
  const inverseBindMatrix = Buffer.alloc(64)
  for (const index of [0, 5, 10, 15]) inverseBindMatrix.writeFloatLE(1, index * 4)
  const indices = Buffer.from([0, 0, 1, 0, 2, 0, 0, 0])
  const positions = Buffer.alloc(36)
  positions.writeFloatLE(1, 12)
  positions.writeFloatLE(1, 28)
  const joints = Buffer.alloc(12)
  const weights = Buffer.alloc(48)
  for (let index = 0; index < 3; index += 1) weights.writeFloatLE(1, index * 16)
  const binary = Buffer.concat([inverseBindMatrix, indices, positions, joints, weights])
  const json = {
    accessors: [
      { bufferView: 0, componentType: 5126, count: 1, type: 'MAT4' },
      { bufferView: 1, componentType: 5123, count: 3, type: 'SCALAR' },
      { bufferView: 2, componentType: 5126, count: 3, type: 'VEC3' },
      { bufferView: 3, componentType: 5121, count: 3, type: 'VEC4' },
      { bufferView: 4, componentType: 5126, count: 3, type: 'VEC4' },
    ],
    asset: { version: '2.0' },
    bufferViews: [
      { buffer: 0, byteLength: 64, byteOffset: 0 },
      { buffer: 0, byteLength: 6, byteOffset: 64 },
      { buffer: 0, byteLength: 36, byteOffset: 72 },
      { buffer: 0, byteLength: 12, byteOffset: 108 },
      { buffer: 0, byteLength: 48, byteOffset: 120 },
    ],
    buffers: [{ byteLength: binary.byteLength }],
    meshes: [
      {
        name: 'mesh',
        primitives: [
          {
            attributes: { JOINTS_0: 3, POSITION: 2, WEIGHTS_0: 4 },
            indices: 1,
          },
        ],
      },
    ],
    nodes: [
      { name: 'joint', ...(scale ? { scale } : {}) },
      { mesh: 0, name: 'mesh', skin: 0 },
    ],
    skins: [{ inverseBindMatrices: 0, joints: [0], skeleton: 0 }],
  }
  return createGlb(json, binary)
}

function createGlb(json, binary) {
  const jsonBytes = Buffer.from(JSON.stringify(json))
  const jsonPadding = Buffer.alloc((4 - (jsonBytes.byteLength % 4)) % 4, 0x20)
  const binaryPadding = Buffer.alloc((4 - (binary.byteLength % 4)) % 4)
  const jsonChunk = Buffer.concat([jsonBytes, jsonPadding])
  const binaryChunk = Buffer.concat([binary, binaryPadding])
  const file = Buffer.alloc(12 + 8 + jsonChunk.byteLength + 8 + binaryChunk.byteLength)
  file.writeUInt32LE(0x46546c67, 0)
  file.writeUInt32LE(2, 4)
  file.writeUInt32LE(file.byteLength, 8)
  file.writeUInt32LE(jsonChunk.byteLength, 12)
  file.writeUInt32LE(0x4e4f534a, 16)
  jsonChunk.copy(file, 20)
  const binaryHeader = 20 + jsonChunk.byteLength
  file.writeUInt32LE(binaryChunk.byteLength, binaryHeader)
  file.writeUInt32LE(0x004e4942, binaryHeader + 4)
  binaryChunk.copy(file, binaryHeader + 8)
  return file
}
