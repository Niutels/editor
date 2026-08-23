import { createHash } from 'node:crypto'
import { readdir, readFile, stat, writeFile } from 'node:fs/promises'
import { dirname, relative, resolve } from 'node:path'
import {
  ISLAND_AMBIENT_PRISTINE_SOURCE_DIRECTORY,
  ISLAND_AMBIENT_TEXTURE_OPTIMIZER,
  islandAmbientOptimizerFingerprint,
  islandAmbientPristineSourcePath,
  islandAmbientPristineSourceReference,
  islandAmbientRuntimeResolution,
} from './island-ambient-glb-optimizer.mjs'
import { inspectGlb } from './landrush-glb-audit.mjs'

const publicDirectory = resolve(import.meta.dirname, '../public')
const assetRoot = resolve(publicDirectory, 'landrush-lab/island-ambient-assets')
const manifest = JSON.parse(await readFile(resolve(assetRoot, 'asset-manifest.json'), 'utf8'))
const state = JSON.parse(await readFile(resolve(assetRoot, 'meshy-generation.json'), 'utf8'))
const failures = []
const summaries = []
const expectedPublicPaths = new Set()
let runtimeCompressedTextureBytes = 0
let expectedRuntimeTextureCount = 0
let runtimeGlbBytes = 0
let runtimeTextureCount = 0
let runtimeUncompressedRgbaMipBytes = 0

expectEqual('asset count', manifest.assets.length, 27)
expectEqual('boat count', manifest.assets.filter(({ kind }) => kind === 'boat').length, 3)
expectEqual('palm count', manifest.assets.filter(({ kind }) => kind === 'palm').length, 4)
expectEqual('fish count', manifest.assets.filter(({ kind }) => kind === 'fish').length, 10)
expectEqual('NPC count', manifest.assets.filter(({ kind }) => kind === 'npc').length, 10)
await validateBasisTranscoderPayload()

for (const asset of manifest.assets) {
  if (asset.sourceFile.includes('_zombie')) failures.push(`${asset.id}: zombie source was included`)
  const record = state.assets[asset.id]
  if (!record) {
    failures.push(`${asset.id}: missing pipeline state`)
    continue
  }
  expectEqual(`${asset.id}: image task`, record.imageTaskIdStatus, 'SUCCEEDED')
  validateRuntimeOutputContract(asset, record)
  await validateSourceImage(asset, record)

  const upstreamModelSource = await inspectPristineArtifact(asset, record, 'model')
  const upstreamModel = upstreamModelSource.inspection
  if (
    upstreamModel &&
    (upstreamModel.triangleCount < 2_800 || upstreamModel.triangleCount > 3_500)
  ) {
    failures.push(
      `${asset.id}: upstream ${upstreamModel.triangleCount} triangles outside 2800-3500 audit range`,
    )
  }
  if (!upstreamModel || !hasTwoKilopixelPbrMaterial(upstreamModel)) {
    failures.push(`${asset.id}: upstream Meshy model is missing its validated 2K PBR source`)
  }

  const runtimeOutputKey = asset.kind === 'npc' ? 'rigged' : 'model'
  const runtimeSource =
    runtimeOutputKey === 'model'
      ? upstreamModelSource
      : await inspectPristineArtifact(asset, record, runtimeOutputKey)
  expectedRuntimeTextureCount += runtimeSource.inspection?.imageCount ?? 0
  const runtime = await inspectOutput(asset.id, record.outputs?.[runtimeOutputKey])
  const runtimeArtifact = record.runtimeArtifacts?.[runtimeOutputKey]
  const resolution = islandAmbientRuntimeResolution(asset.kind)
  if (runtime) {
    validateRuntimeTextures(asset.id, runtime, resolution)
    runtimeGlbBytes += runtime.byteLength
    runtimeTextureCount += runtime.images.length
    runtimeCompressedTextureBytes += runtime.images.reduce(
      (sum, image) => sum + (image.byteLength ?? 0),
      0,
    )
    runtimeUncompressedRgbaMipBytes += runtime.images.reduce(
      (sum, image) => sum + (image.uncompressedRgbaMipByteLength ?? 0),
      0,
    )
  }
  if (!runtimeArtifact) {
    failures.push(`${asset.id}: missing runtime texture optimization provenance`)
  } else {
    expectEqual(
      `${asset.id}: optimizer fingerprint`,
      runtimeArtifact.optimizerFingerprint,
      islandAmbientOptimizerFingerprint(),
    )
    expectEqual(`${asset.id}: runtime resolution`, runtimeArtifact.resolution, resolution)
    expectEqual(`${asset.id}: runtime hash`, runtimeArtifact.runtimeSha256, runtime?.contentHash)
    expectEqual(
      `${asset.id}: source hash`,
      runtimeArtifact.sourceSha256,
      runtimeSource.artifact?.sha256,
    )
    expectEqual(
      `${asset.id}: runtime source path`,
      runtimeArtifact.sourcePath,
      runtimeSource.reference,
    )
  }

  if (asset.kind !== 'npc') {
    summaries.push({
      id: asset.id,
      kind: asset.kind,
      runtimeBytes: runtime?.byteLength ?? null,
      textureResolution: resolution,
      triangles: runtime?.triangleCount ?? null,
    })
    continue
  }

  expectEqual(`${asset.id}: rig task`, record.rigTaskIdStatus, 'SUCCEEDED')
  expectEqual(`${asset.id}: idle task`, record.idleTaskIdStatus, 'SUCCEEDED')
  const idle = (await inspectPristineArtifact(asset, record, 'idle')).inspection
  const walk = (await inspectPristineArtifact(asset, record, 'walk')).inspection
  const run = (await inspectPristineArtifact(asset, record, 'run')).inspection
  const animated = { idle, rigged: runtime, run, walk }
  const skinHashes = new Set()
  for (const [name, inspection] of Object.entries(animated)) {
    if (!inspection) continue
    expectEqual(`${asset.id}: ${name} skin count`, inspection.skinCount, 1)
    expectEqual(`${asset.id}: ${name} animation count`, inspection.animationCount, 1)
    if (inspection.skinSemanticCompatibilityHash) {
      skinHashes.add(inspection.skinSemanticCompatibilityHash)
    }
  }
  expectEqual(`${asset.id}: compatible animation skins`, skinHashes.size, 1)

  for (const [name, outputKey] of [
    ['idle', 'idleAnimation'],
    ['walk', 'walkAnimation'],
    ['run', 'runAnimation'],
  ]) {
    const inspection = await inspectOutput(asset.id, record.outputs?.[outputKey])
    if (!inspection) continue
    expectEqual(`${asset.id}: ${name} runtime animation count`, inspection.animationCount, 1)
    expectEqual(`${asset.id}: ${name} runtime mesh count`, inspection.meshCount, 0)
    if (inspection.byteLength > 200_000) {
      failures.push(`${asset.id}: ${name} runtime animation exceeds 200KB`)
    }
  }
  summaries.push({
    id: asset.id,
    kind: asset.kind,
    runtimeBytes: runtime?.byteLength ?? null,
    textureResolution: resolution,
    triangles: runtime?.triangleCount ?? upstreamModel?.triangleCount ?? null,
  })
}

expectEqual('runtime texture payload count', runtimeTextureCount, expectedRuntimeTextureCount)
if (
  runtimeCompressedTextureBytes >
  ISLAND_AMBIENT_TEXTURE_OPTIMIZER.maxRuntimeCompressedTextureBytes
) {
  failures.push(
    `runtime compressed texture payload exceeds ${formatMiB(ISLAND_AMBIENT_TEXTURE_OPTIMIZER.maxRuntimeCompressedTextureBytes)} MiB: ${runtimeCompressedTextureBytes} bytes`,
  )
}
if (
  runtimeUncompressedRgbaMipBytes >
  ISLAND_AMBIENT_TEXTURE_OPTIMIZER.maxRuntimeUncompressedRgbaMipBytes
) {
  failures.push(
    `runtime uncompressed RGBA mip budget exceeds 256 MiB: ${runtimeUncompressedRgbaMipBytes} bytes`,
  )
}

const publicBoundary = await validatePublicDeploymentBoundary()
const authoringSourceBytes = await sumTreeBytes(ISLAND_AMBIENT_PRISTINE_SOURCE_DIRECTORY)
const consumedCredits = Object.values(state.assets).reduce(
  (sum, record) =>
    sum +
    (record.imageTaskIdCredits ?? 0) +
    (record.rigTaskIdCredits ?? 0) +
    (record.idleTaskIdCredits ?? 0),
  0,
)
expectEqual('total consumed Meshy credits', consumedCredits, 485)

const audit = {
  assetCount: manifest.assets.length,
  authoringSourceBytes,
  consumedCredits,
  failures,
  generatedAt: new Date().toISOString(),
  publicAssetBytes: publicBoundary.publicAssetBytes,
  publicMetadataBytes: publicBoundary.publicMetadataBytes,
  publicPayloadBytes: publicBoundary.publicPayloadBytes,
  runtimeCompressedTextureBytes,
  runtimeGlbBytes,
  runtimeReachableBytes: publicBoundary.runtimeReachableBytes,
  runtimeTextureCount,
  runtimeUncompressedRgbaMipBytes,
  summaries,
  targetFaceCount: manifest.targetFaceCount,
}
if (!process.argv.includes('--no-write')) {
  await writeFile(resolve(assetRoot, 'asset-audit.json'), `${JSON.stringify(audit, null, 2)}\n`)
}
if (failures.length > 0) throw new Error(`Island ambient asset audit failed:\n- ${failures.join('\n- ')}`)
console.log(
  `Island ambient asset audit passed: ${summaries.length} models, ${runtimeTextureCount} KTX2 payloads, ${formatMiB(publicBoundary.runtimeReachableBytes)} MiB runtime-reachable, ${formatMiB(publicBoundary.publicAssetBytes)} MiB public total, ${formatMiB(runtimeCompressedTextureBytes)} MiB compressed textures, ${formatMiB(runtimeUncompressedRgbaMipBytes)} MiB RGBA fallback mips.`,
)

function validateRuntimeOutputContract(asset, record) {
  const directory = {
    boat: 'boats',
    fish: 'fish',
    npc: 'npcs',
    palm: 'palms',
  }[asset.kind]
  const base = `/landrush-lab/island-ambient-assets/${directory}/${asset.id}`
  const expectedOutputs =
    asset.kind === 'npc'
      ? {
          idleAnimation: `${base}/idle.anim.glb`,
          rigged: `${base}/rigged.glb`,
          runAnimation: `${base}/run.anim.glb`,
          walkAnimation: `${base}/walk.anim.glb`,
        }
      : { model: `${base}/model.glb` }
  expectEqual(
    `${asset.id}: state runtime outputs`,
    JSON.stringify(record.outputs),
    JSON.stringify(expectedOutputs),
  )
  expectEqual(
    `${asset.id}: manifest runtime outputs`,
    JSON.stringify(asset.outputs),
    JSON.stringify(expectedOutputs),
  )
  for (const publicPath of Object.values(expectedOutputs)) expectedPublicPaths.add(publicPath)
}

async function validateSourceImage(asset, record) {
  const sourcePath = resolve(
    dirname(islandAmbientPristineSourcePath(asset, 'model')),
    'source.png',
  )
  const reference = islandAmbientPristineSourceReference(sourcePath)
  expectEqual(`${asset.id}: source image path`, record.sourcePath, reference)
  try {
    const body = await readFile(sourcePath)
    expectEqual(`${asset.id}: source image byte length`, body.byteLength, record.sourceByteLength)
    expectEqual(`${asset.id}: source image hash`, sha256(body), record.sourceSha256)
    if (
      body.byteLength < 24 ||
      body.readUInt32BE(0) !== 0x89504e47 ||
      body.readUInt32BE(4) !== 0x0d0a1a0a
    ) {
      failures.push(`${asset.id}: source image is not a valid PNG`)
    }
  } catch (error) {
    failures.push(`${asset.id}: source image: ${error instanceof Error ? error.message : error}`)
  }
}

async function inspectPristineArtifact(asset, record, artifactKey) {
  const path = islandAmbientPristineSourcePath(asset, artifactKey)
  const reference = islandAmbientPristineSourceReference(path)
  const artifact = record.artifacts?.[artifactKey]
  const inspection = await inspectSource(asset.id, path)
  if (!artifact) {
    failures.push(`${asset.id}: missing ${artifactKey} Meshy source provenance`)
  } else if (inspection) {
    expectEqual(`${asset.id}: ${artifactKey} source hash`, inspection.contentHash, artifact.sha256)
    expectEqual(
      `${asset.id}: ${artifactKey} source byte length`,
      inspection.byteLength,
      artifact.byteLength,
    )
    expectEqual(`${asset.id}: ${artifactKey} artifact path`, artifact.path, reference)
    expectEqual(`${asset.id}: ${artifactKey} source path`, artifact.sourcePath, reference)
  }
  return { artifact, inspection, reference }
}

function validateRuntimeTextures(id, inspection, resolution) {
  if (!inspection.extensionsRequired.includes('KHR_texture_basisu')) {
    failures.push(`${id}: KHR_texture_basisu is not required by the runtime GLB`)
  }
  if (inspection.images.length === 0) failures.push(`${id}: runtime GLB has no textures`)
  if (
    inspection.images.some(({ mimeType }) =>
      ['image/jpeg', 'image/png', 'image/webp'].includes(mimeType),
    )
  ) {
    failures.push(`${id}: runtime GLB retains a raster fallback or unreferenced raster image`)
  }
  for (const image of inspection.images) {
    expectEqual(`${id}: image ${image.index} MIME`, image.mimeType, 'image/ktx2')
    expectEqual(`${id}: image ${image.index} width`, image.width, resolution)
    expectEqual(`${id}: image ${image.index} height`, image.height, resolution)
    expectEqual(`${id}: image ${image.index} full mip chain`, image.hasFullMipChain, true)
  }
  for (const material of inspection.materials) {
    for (const [slotName, slot] of Object.entries(material.textureSlots)) {
      if (!slot) continue
      expectEqual(`${id}: ${slotName} KTX2 extension source`, slot.ktx2ExtensionSource, true)
      expectEqual(`${id}: ${slotName} raster fallback`, slot.hasRasterFallback, false)
      expectEqual(
        `${id}: ${slotName} Basis profile`,
        slot.basisMode,
        slotName === 'normal' ? 'uastc' : 'etc1s',
      )
    }
  }
}

async function inspectOutput(id, publicPath) {
  if (!publicPath) {
    failures.push(`${id}: missing output path`)
    return null
  }
  try {
    return await inspectGlb(resolvePublicPath(publicPath))
  } catch (error) {
    failures.push(`${id}: ${error instanceof Error ? error.message : error}`)
    return null
  }
}

async function inspectSource(id, path) {
  try {
    return await inspectGlb(path)
  } catch (error) {
    failures.push(`${id}: pristine source: ${error instanceof Error ? error.message : error}`)
    return null
  }
}

async function validatePublicDeploymentBoundary() {
  const metadataPaths = new Set(['asset-audit.json', 'asset-manifest.json', 'meshy-generation.json'])
  const expectedRelativePaths = new Set(
    [...expectedPublicPaths].map((publicPath) => publicPath.replace(/^\/+/, '')),
  )
  const files = await walkFiles(assetRoot)
  let publicMetadataBytes = 0
  let publicPayloadBytes = 0
  let runtimeReachableBytes = 0
  for (const file of files) {
    if (metadataPaths.has(file.relativePath)) {
      publicMetadataBytes += file.byteLength
      continue
    }
    publicPayloadBytes += file.byteLength
    const relativeToPublic = relative(publicDirectory, file.path).replaceAll('\\', '/')
    if (!expectedRelativePaths.has(relativeToPublic)) {
      failures.push(`public authoring or unreferenced artifact: ${relativeToPublic}`)
      continue
    }
    runtimeReachableBytes += file.byteLength
  }
  expectEqual('runtime public output count', expectedPublicPaths.size, 57)
  expectEqual('public runtime payload bytes', publicPayloadBytes, runtimeReachableBytes)
  return {
    publicAssetBytes: publicMetadataBytes + publicPayloadBytes,
    publicMetadataBytes,
    publicPayloadBytes,
    runtimeReachableBytes,
  }
}

async function validateBasisTranscoderPayload() {
  const expectedHashes = {
    'basis_transcoder.js': '8478b5b6d6b74e7d3082b89f6417321d8d1dc0307f2b30d4484bb11b441696a1',
    'basis_transcoder.wasm': '6cf17dc889352c42e9acf8897107978d127005fe3386c36a0e3845e27967630a',
  }
  for (const [fileName, expectedHash] of Object.entries(expectedHashes)) {
    try {
      const body = await readFile(resolve(publicDirectory, 'basis', fileName))
      expectEqual(`Landrush /basis/${fileName} SHA-256`, sha256(body), expectedHash)
    } catch (error) {
      failures.push(
        `Landrush /basis/${fileName}: ${error instanceof Error ? error.message : error}`,
      )
    }
  }
}

function resolvePublicPath(publicPath) {
  const path = resolve(publicDirectory, publicPath.replace(/^\/+/, ''))
  const fromRoot = relative(publicDirectory, path)
  if (fromRoot === '..' || fromRoot.startsWith('../') || fromRoot.startsWith('..\\')) {
    throw new Error(`Public asset path escapes the Landrush public root: ${publicPath}`)
  }
  return path
}

async function walkFiles(directory, root = directory) {
  const results = []
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = resolve(directory, entry.name)
    if (entry.isDirectory()) {
      results.push(...(await walkFiles(path, root)))
    } else if (entry.isFile()) {
      results.push({
        byteLength: (await stat(path)).size,
        path,
        relativePath: relative(root, path).replaceAll('\\', '/'),
      })
    }
  }
  return results
}

async function sumTreeBytes(directory) {
  return (await walkFiles(directory)).reduce((sum, file) => sum + file.byteLength, 0)
}

function hasTwoKilopixelPbrMaterial(inspection) {
  return inspection.materials.some(({ textureSlots }) =>
    [textureSlots.baseColor, textureSlots.metallicRoughness, textureSlots.normal].every(
      (slot) => slot?.width === 2048 && slot?.height === 2048,
    ),
  )
}

function expectEqual(label, actual, expected) {
  if (actual !== expected) failures.push(`${label}: expected ${expected}, received ${actual}`)
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex')
}

function formatMiB(bytes) {
  return (bytes / (1024 * 1024)).toFixed(2)
}
