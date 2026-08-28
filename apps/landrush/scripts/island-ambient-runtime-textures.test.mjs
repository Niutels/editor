import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import test from 'node:test'

const componentRoot = resolve(import.meta.dirname, '../components/landrush-lab')
const repositoryRoot = resolve(import.meta.dirname, '../../..')
const robotAssetName = 'proto_pascal_robot-ktx2-1112f038.glb'
const robotAssetPublicPath = `/navigation/${robotAssetName}`

test('runtime textured ambient GLBs use the KTX2-aware loader from their first request', async () => {
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
  assert.match(robotSource, /useLandrushRobotGLTF\(\)/u)
  assert.match(robotSource, /configureLandrushRobotKtx2Loader\(loader, renderer\)/u)
  assert.match(robotSource, /configureKtx2Support\(loader, renderer\)/u)
  assert.match(robotSource, /dxtSupported: true/u)
  assert.match(robotSource, /bptcSupported: false/u)
  assert.doesNotMatch(robotSource, /useGLTFKTX2/u)
  assert.doesNotMatch(robotSource, /useGLTF\.preload/u)
  const robotAssetSource = await readFile(
    resolve(
      repositoryRoot,
      'packages/landrush-pascal-plugin/src/landrush-world/landrush-robot-assets.ts',
    ),
    'utf8',
  )
  assert.match(robotAssetSource, new RegExp(escapeRegExp(robotAssetPublicPath), 'u'))
  assert.match(orbotDebugSource, /useGLTFKTX2\(ORBOT_ASSET_PATH\)/u)
  assert.match(orbotDebugSource, new RegExp(escapeRegExp(robotAssetPublicPath), 'u'))
  assert.doesNotMatch(orbotDebugSource, /useGLTF\(ORBOT_ASSET_PATH\)/u)
})

test('player robot uses a fingerprinted full-mip KTX2 while retaining its legacy URL', async () => {
  const navigationRoot = resolve(repositoryRoot, 'apps/landrush/public/navigation')
  const [optimizedBuffer, legacyBuffer] = await Promise.all([
    readFile(resolve(navigationRoot, robotAssetName)),
    readFile(resolve(navigationRoot, 'proto_pascal_robot.glb')),
  ])
  const optimized = readGlb(optimizedBuffer)
  const legacy = readGlb(legacyBuffer)

  assert.ok(optimizedBuffer.byteLength < legacyBuffer.byteLength)
  assert.equal(
    createHash('sha256').update(optimizedBuffer).digest('hex').slice(0, 8),
    robotAssetName.match(/-([a-f0-9]{8})\.glb$/u)?.[1],
  )
  assert.ok(optimized.json.extensionsUsed.includes('KHR_texture_basisu'))
  assert.ok(optimized.json.extensionsRequired.includes('KHR_texture_basisu'))
  assert.ok(!legacy.json.extensionsRequired?.includes('KHR_texture_basisu'))

  const material = optimized.json.materials[0]
  const baseColorTexture = material.pbrMetallicRoughness.baseColorTexture.index
  const emissiveTexture = material.emissiveTexture.index
  assert.equal(baseColorTexture, emissiveTexture)
  const texture = optimized.json.textures[baseColorTexture]
  assert.equal(texture.source, undefined)
  const imageIndex = texture.extensions.KHR_texture_basisu.source
  const image = optimized.json.images[imageIndex]
  assert.equal(image.mimeType, 'image/ktx2')

  const imageView = optimized.json.bufferViews[image.bufferView]
  const imageOffset = imageView.byteOffset ?? 0
  const ktx2 = optimized.binary.subarray(imageOffset, imageOffset + imageView.byteLength)
  assert.deepEqual(
    [...ktx2.subarray(0, 12)],
    [0xab, 0x4b, 0x54, 0x58, 0x20, 0x32, 0x30, 0xbb, 0x0d, 0x0a, 0x1a, 0x0a],
  )
  assert.equal(ktx2.readUInt32LE(20), 1024)
  assert.equal(ktx2.readUInt32LE(24), 1024)
  assert.equal(ktx2.readUInt32LE(40), 11)
  assert.equal(ktx2.readUInt32LE(12), 0)
  assert.equal(ktx2.readUInt32LE(44), 1)
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
