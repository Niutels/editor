import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import test from 'node:test'
import sharp from 'sharp'

const componentRoot = resolve(import.meta.dirname, '../components/landrush-lab')
const repositoryRoot = resolve(import.meta.dirname, '../../..')
const robotAssetName = 'proto_pascal_robot-jpeg-4fc9f04e.glb'
const robotAssetPublicPath = `/navigation/${robotAssetName}`

test('runtime textured GLBs select their required loader from their first request', async () => {
  const ambientSource = await readFile(resolve(componentRoot, 'landrush-island-ambient-life.tsx'), 'utf8')
  const zombieSource = await readFile(resolve(componentRoot, 'zombie-escape-generated-assets.tsx'), 'utf8')
  const robotSource = await readFile(
    resolve(
      repositoryRoot,
      'packages/landrush-pascal-plugin/src/landrush-world/landrush-robot.tsx',
    ),
    'utf8',
  )
  const orbotDebugSource = await readFile(
    resolve(componentRoot, 'orbot-animation-debug-client.tsx'),
    'utf8',
  )

  for (const call of [
    'useGLTFKTX2(modelPath)',
    'useGLTFKTX2(fish.modelPath)',
    'useGLTFKTX2(boat.modelPath)',
    'useGLTFKTX2(npc.glb.rigged)',
  ]) {
    assert.match(ambientSource, new RegExp(escapeRegExp(call), 'u'))
  }
  assert.doesNotMatch(ambientSource, /useGLTF\((?:modelPath|fish\.modelPath|boat\.modelPath|npc\.glb\.rigged)\)/u)
  assert.match(zombieSource, /useGLTFKTX2\(assetUrls\.riggedBase\)/u)
  assert.doesNotMatch(zombieSource, /useGLTF\(assetUrls\.riggedBase\)/u)
  assert.match(robotSource, /useGLTF\(LANDRUSH_ROBOT_ASSET_PATH\)/u)
  assert.match(robotSource, new RegExp(escapeRegExp(robotAssetPublicPath), 'u'))
  assert.doesNotMatch(robotSource, /useGLTFKTX2/u)
  assert.doesNotMatch(robotSource, /useGLTF\.preload/u)
  assert.match(orbotDebugSource, /useGLTF\(ORBOT_ASSET_PATH\)/u)
  assert.match(orbotDebugSource, new RegExp(escapeRegExp(robotAssetPublicPath), 'u'))
  assert.doesNotMatch(orbotDebugSource, /useGLTFKTX2/u)
})

test('player robot uses a fingerprinted 512px core JPEG while preserving its scene contract', async () => {
  const navigationRoot = resolve(repositoryRoot, 'apps/landrush/public/navigation')
  const [optimizedBuffer, legacyBuffer] = await Promise.all([
    readFile(resolve(navigationRoot, robotAssetName)),
    readFile(resolve(navigationRoot, 'proto_pascal_robot.glb')),
  ])
  const optimized = readGlb(optimizedBuffer)
  const legacy = readGlb(legacyBuffer)

  assert.equal(optimizedBuffer.byteLength, 1_438_964)
  assert.ok(optimizedBuffer.byteLength < legacyBuffer.byteLength)
  assert.equal(
    createHash('sha256').update(optimizedBuffer).digest('hex').slice(0, 8),
    robotAssetName.match(/-([a-f0-9]{8})\.glb$/u)?.[1],
  )
  assert.ok(!optimized.json.extensionsUsed?.includes('KHR_texture_basisu'))
  assert.ok(!optimized.json.extensionsRequired?.includes('KHR_texture_basisu'))

  const material = optimized.json.materials[0]
  const baseColorTexture = material.pbrMetallicRoughness.baseColorTexture.index
  const emissiveTexture = material.emissiveTexture.index
  assert.equal(baseColorTexture, emissiveTexture)
  const texture = optimized.json.textures[baseColorTexture]
  assert.equal(texture.source, 0)
  assert.equal(texture.extensions, undefined)
  const imageIndex = texture.source
  const image = optimized.json.images[imageIndex]
  assert.equal(image.mimeType, 'image/jpeg')

  const imageView = optimized.json.bufferViews[image.bufferView]
  const imageOffset = imageView.byteOffset ?? 0
  const jpeg = optimized.binary.subarray(imageOffset, imageOffset + imageView.byteLength)
  const jpegMetadata = await sharp(jpeg).metadata()
  assert.equal(imageOffset, 1_049_144)
  assert.equal(imageView.byteLength, 106_959)
  assert.equal(
    createHash('sha256').update(jpeg).digest('hex'),
    '922be6582a7ceea427ed093e02c70c5e0060cff31717eae2503bd7bace13b4e8',
  )
  assert.equal(jpegMetadata.format, 'jpeg')
  assert.equal(jpegMetadata.width, 512)
  assert.equal(jpegMetadata.height, 512)
  assert.equal(jpegMetadata.channels, 3)
  assert.equal(jpegMetadata.chromaSubsampling, '4:4:4')
  assert.equal(
    createHash('sha256').update(optimized.binary.subarray(0, imageOffset)).digest('hex'),
    '0e46273aac4ef79c33ede7c477c8883df7dd6a71c719750b7c4b036df510949b',
  )

  const legacyImage = legacy.json.images[0]
  const legacyImageView = legacy.json.bufferViews[legacyImage.bufferView]
  const legacyImageOffset = legacyImageView.byteOffset ?? 0
  assert.deepEqual(
    optimized.binary.subarray(0, imageOffset),
    legacy.binary.subarray(0, legacyImageOffset),
  )
  assert.deepEqual(normalizeRobotJson(optimized.json), normalizeRobotJson(legacy.json))
})

test('zombie debug scenes compose optimized rigs with animation-only clips', async () => {
  const runningSource = await readFile(
    resolve(componentRoot, 'zombie-running-debug-client.tsx'),
    'utf8',
  )
  const shootingSource = await readFile(
    resolve(componentRoot, 'zombie-shooting-debug-client.tsx'),
    'utf8',
  )
  const catalogSource = await readFile(
    resolve(componentRoot, 'zombie-escape-zombie-catalog.ts'),
    'utf8',
  )

  assert.match(runningSource, /useGLTFKTX2\(zombie\.glb\.riggedBase\.path\)/u)
  assert.match(runningSource, /useGLTF\(zombie\.glb\.run\.path\)/u)
  assert.match(shootingSource, /useGLTFKTX2\(ZOMBIE\.glb\.riggedBase\.path\)/u)
  assert.match(shootingSource, /useGLTF\(ZOMBIE\.glb\.run\.path\)/u)
  assert.doesNotMatch(runningSource, /cloneSkeleton\(runGltf\.scene\)/u)
  assert.doesNotMatch(shootingSource, /cloneSkeleton\(runGltf\.scene\)/u)
  assert.doesNotMatch(catalogSource, /runtimePath|`\$\{directory\}\/(?:run|walk)\.glb`/u)
})

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&')
}

function normalizeRobotJson(json) {
  const normalized = structuredClone(json)
  normalized.buffers[0].byteLength = 0
  normalized.bufferViews[normalized.images[0].bufferView].byteLength = 0
  normalized.images[0].mimeType = 'image/runtime'
  return normalized
}

function readGlb(buffer) {
  assert.equal(buffer.readUInt32LE(0), 0x4654_6c67)
  assert.equal(buffer.readUInt32LE(4), 2)
  assert.equal(buffer.readUInt32LE(8), buffer.byteLength)

  const jsonByteLength = buffer.readUInt32LE(12)
  assert.equal(buffer.readUInt32LE(16), 0x4e4f_534a)
  const json = JSON.parse(buffer.toString('utf8', 20, 20 + jsonByteLength).trimEnd())
  const binaryHeaderOffset = 20 + jsonByteLength
  const binaryByteLength = buffer.readUInt32LE(binaryHeaderOffset)
  assert.equal(buffer.readUInt32LE(binaryHeaderOffset + 4), 0x004e_4942)
  const binaryOffset = binaryHeaderOffset + 8
  return {
    binary: buffer.subarray(binaryOffset, binaryOffset + binaryByteLength),
    json,
  }
}
