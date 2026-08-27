import { createHash, randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { copyFile, mkdir, mkdtemp, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { dirname, relative, resolve } from 'node:path'
import { NodeIO } from '@gltf-transform/core'
import { ALL_EXTENSIONS } from '@gltf-transform/extensions'
import sharp from 'sharp'
import { inspectGlb } from './landrush-glb-audit.mjs'

const APP_ROOT = resolve(import.meta.dirname, '..')
const DEFAULT_PUBLIC_DIRECTORY = resolve(APP_ROOT, 'public')
const DEFAULT_STATE_PATH = resolve(
  DEFAULT_PUBLIC_DIRECTORY,
  'landrush-lab/zombie-escape/assets/meshy-generation.json',
)
const require = createRequire(import.meta.url)
const GLTF_TRANSFORM_CORE_VERSION = installedPackageVersion('@gltf-transform/core')
const GLTF_TRANSFORM_EXTENSIONS_VERSION = installedPackageVersion(
  '@gltf-transform/extensions',
)

export const ZOMBIE_ESCAPE_WEAPON_IDS = Object.freeze([
  'sunflare-pistol',
  'reef-carbine',
  'driftwood-scattergun',
  'storm-coil-repeater',
  'tidebreak-launcher',
])

export const ZOMBIE_ESCAPE_WEAPON_SOURCE_DIRECTORY = resolve(
  APP_ROOT,
  'assets/zombie-escape-meshy-source/weapons',
)

export const ZOMBIE_ESCAPE_WEAPON_TEXTURE_OPTIMIZER = Object.freeze({
  chromaSubsampling: '4:4:4',
  format: 'jpeg',
  gltfTransformCoreVersion: '4.4.2',
  gltfTransformExtensionsVersion: '4.4.2',
  maxRuntimeBytes: 5 * 1024 * 1024,
  mozjpegVersion: '0826579',
  quality: 90,
  resizeFilter: 'lanczos3',
  resolution: 512,
  schemaVersion: 1,
  sharpVersion: '0.34.5',
  vipsVersion: '8.17.3',
})

const OPTIMIZER_FINGERPRINT = sha256(
  Buffer.from(JSON.stringify(ZOMBIE_ESCAPE_WEAPON_TEXTURE_OPTIMIZER)),
)

export function zombieEscapeWeaponOptimizerFingerprint() {
  return OPTIMIZER_FINGERPRINT
}

export function zombieEscapeWeaponSourcePath(
  id,
  sourceDirectory = ZOMBIE_ESCAPE_WEAPON_SOURCE_DIRECTORY,
) {
  assertWeaponId(id)
  return resolve(sourceDirectory, id, 'model.glb')
}

export function zombieEscapeWeaponSourceReference(sourcePath) {
  const reference = relative(APP_ROOT, sourcePath).replaceAll('\\', '/')
  if (reference === '..' || reference.startsWith('../')) {
    throw new Error(`Zombie Escape weapon source must remain inside ${APP_ROOT}: ${sourcePath}`)
  }
  return reference
}

export async function optimizeZombieEscapeWeaponRuntimeAssets({
  concurrency = 2,
  force = false,
  ids = ZOMBIE_ESCAPE_WEAPON_IDS,
  maxRuntimeBytes = ZOMBIE_ESCAPE_WEAPON_TEXTURE_OPTIMIZER.maxRuntimeBytes,
  persistState,
  publicDirectory = DEFAULT_PUBLIC_DIRECTORY,
  sourceDirectory = ZOMBIE_ESCAPE_WEAPON_SOURCE_DIRECTORY,
  state,
} = {}) {
  assertToolVersions()
  if (!state?.assets) throw new Error('Zombie Escape weapon optimizer requires asset state.')
  if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > 4) {
    throw new Error('Zombie Escape weapon optimizer concurrency must be an integer from 1 to 4.')
  }
  if (!Number.isInteger(maxRuntimeBytes) || maxRuntimeBytes < 1) {
    throw new Error('Zombie Escape weapon runtime budget must be a positive integer.')
  }
  const selectedIds = [...ids]
  for (const id of selectedIds) assertWeaponId(id)
  if (new Set(selectedIds).size !== selectedIds.length) {
    throw new Error('Zombie Escape weapon optimizer ids must be unique.')
  }

  const jobs = []
  const summaries = Array(selectedIds.length)
  const sourceUpdates = []
  const stagingDirectory = await mkdtemp(
    resolve(tmpdir(), 'landrush-zombie-weapon-optimizer-'),
  )
  try {
    for (let index = 0; index < selectedIds.length; index += 1) {
      const id = selectedIds[index]
      const record = state.assets[id]
      const sourceArtifact = record?.artifacts?.model
      const publicPath = record?.outputs?.model
      if (!(record && sourceArtifact && publicPath)) {
        throw new Error(`${id}: missing model source provenance or runtime output path.`)
      }

      const outputPath = resolvePublicPath(publicDirectory, publicPath)
      const sourcePath = zombieEscapeWeaponSourcePath(id, sourceDirectory)
      const sourceReference = zombieEscapeWeaponSourceReference(sourcePath)
      const source = await ensurePristineSource({
        id,
        outputPath,
        sourceArtifact,
        sourcePath,
      })
      if (
        sourceArtifact.path !== sourceReference ||
        sourceArtifact.sourcePath !== sourceReference
      ) {
        sourceUpdates.push({ id, sourceReference })
      }

      const current = await inspectOptionalGlb(outputPath)
      const cached = record.runtimeArtifacts?.model
      const cacheProvenanceMatches =
        !force &&
        cached?.optimizerFingerprint === OPTIMIZER_FINGERPRINT &&
        cached?.sourceSha256 === source.contentHash &&
        cached?.runtimeSha256 === current?.contentHash &&
        typeof cached?.semanticHash === 'string'
      let cachedSemanticMatches = false
      if (cacheProvenanceMatches) {
        const currentSemantic = await inspectZombieEscapeWeaponSemanticContract(outputPath)
        cachedSemanticMatches = cached.semanticHash === currentSemantic.semanticHash
      }
      if (cacheProvenanceMatches && cachedSemanticMatches) {
        summaries[index] = createSummary(id, publicPath, current, true)
        continue
      }
      jobs.push({
        id,
        index,
        outputPath,
        publicPath,
        source,
        sourcePath,
        sourceReference,
        stagedPath: resolve(stagingDirectory, 'outputs', `${id}.glb`),
      })
    }

    const results = await runPool(jobs, concurrency, async (job) => ({
      ...job,
      runtime: await optimizeZombieEscapeWeaponGlb({
        outputPath: job.stagedPath,
        sourcePath: job.sourcePath,
      }),
    }))
    const stagedById = new Map(results.map((result) => [result.id, result]))
    const runtimeBytes = await measureCompleteWeaponPayload({
      publicDirectory,
      stagedById,
      state,
    })
    if (runtimeBytes > maxRuntimeBytes) {
      throw new Error(
        `Zombie Escape weapon runtime payload is ${runtimeBytes} bytes; budget is ${maxRuntimeBytes}.`,
      )
    }

    const originalState = structuredClone(state)
    const promotion = await promoteStagedResults(results, stagingDirectory)
    try {
      for (const { id, sourceReference } of sourceUpdates) {
        const sourceArtifact = state.assets[id].artifacts.model
        sourceArtifact.path = sourceReference
        sourceArtifact.sourcePath = sourceReference
      }
      for (const result of results.sort((a, b) => a.index - b.index)) {
        const { id, index, publicPath, runtime, source, sourceReference } = result
        const record = state.assets[id]
        record.runtimeArtifacts ??= {}
        record.runtimeArtifacts.model = {
          chromaSubsampling: ZOMBIE_ESCAPE_WEAPON_TEXTURE_OPTIMIZER.chromaSubsampling,
          format: ZOMBIE_ESCAPE_WEAPON_TEXTURE_OPTIMIZER.format,
          optimizerFingerprint: OPTIMIZER_FINGERPRINT,
          path: publicPath,
          quality: ZOMBIE_ESCAPE_WEAPON_TEXTURE_OPTIMIZER.quality,
          resolution: ZOMBIE_ESCAPE_WEAPON_TEXTURE_OPTIMIZER.resolution,
          runtimeByteLength: runtime.byteLength,
          runtimeSha256: runtime.contentHash,
          semanticHash: runtime.semanticHash,
          sourceByteLength: source.byteLength,
          sourcePath: sourceReference,
          sourceSha256: source.contentHash,
          taskId: record.refineTaskId,
          textureCount: runtime.imageCount,
        }
        summaries[index] = createSummary(id, publicPath, runtime, false)
      }
      if (sourceUpdates.length > 0 || results.length > 0) await persistState?.(state)
    } catch (error) {
      restoreObject(state, originalState)
      await promotion.rollback()
      throw error
    }
    return summaries
  } finally {
    await rm(stagingDirectory, { force: true, recursive: true })
  }
}

export async function optimizeZombieEscapeWeaponGlb({ outputPath, sourcePath }) {
  assertToolVersions()
  await mkdir(dirname(outputPath), { recursive: true })
  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS)
  const document = await io.read(sourcePath)
  await Promise.all(
    document
      .getRoot()
      .listTextures()
      .map(async (texture) => {
        const image = texture.getImage()
        if (!image || texture.getMimeType() !== 'image/jpeg') {
          throw new Error(`${sourcePath}: weapon optimizer accepts embedded JPEG sources only.`)
        }
        const resized = await sharp(image, { limitInputPixels: true })
          .resize(
            ZOMBIE_ESCAPE_WEAPON_TEXTURE_OPTIMIZER.resolution,
            ZOMBIE_ESCAPE_WEAPON_TEXTURE_OPTIMIZER.resolution,
            {
              fit: 'inside',
              kernel: ZOMBIE_ESCAPE_WEAPON_TEXTURE_OPTIMIZER.resizeFilter,
              withoutEnlargement: true,
            },
          )
          .jpeg({
            chromaSubsampling: ZOMBIE_ESCAPE_WEAPON_TEXTURE_OPTIMIZER.chromaSubsampling,
            quality: ZOMBIE_ESCAPE_WEAPON_TEXTURE_OPTIMIZER.quality,
          })
          .toBuffer()
        const metadata = await sharp(resized).metadata()
        if (
          metadata.chromaSubsampling !==
          ZOMBIE_ESCAPE_WEAPON_TEXTURE_OPTIMIZER.chromaSubsampling
        ) {
          throw new Error(`${sourcePath}: JPEG encoder did not preserve 4:4:4 chroma.`)
        }
        texture.setImage(resized).setMimeType('image/jpeg')
      }),
  )

  const source = await inspectGlb(sourcePath)
  const temporaryPath = `${outputPath}.${process.pid}.${randomUUID()}.tmp.glb`
  try {
    await io.write(temporaryPath, document)
    const runtime = await inspectGlb(temporaryPath)
    validateRuntime(source, runtime, outputPath)
    const [sourceSemantic, runtimeSemantic] = await Promise.all([
      inspectZombieEscapeWeaponSemanticContract(sourcePath),
      inspectZombieEscapeWeaponSemanticContract(temporaryPath),
    ])
    if (sourceSemantic.semanticHash !== runtimeSemantic.semanticHash) {
      throw new Error(`${outputPath}: texture optimization changed the weapon semantic contract.`)
    }
    runtime.semanticHash = runtimeSemantic.semanticHash
    await rename(temporaryPath, outputPath)
    return runtime
  } finally {
    await rm(temporaryPath, { force: true })
  }
}

export async function inspectZombieEscapeWeaponSemanticContract(path) {
  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS)
  const document = await io.read(path)
  const root = document.getRoot()
  const textures = root.listTextures()
  const textureIndexes = new Map(textures.map((texture, index) => [texture, index]))
  const materials = root.listMaterials()
  const materialIndexes = new Map(materials.map((material, index) => [material, index]))
  const meshes = root.listMeshes()
  const meshIndexes = new Map(meshes.map((mesh, index) => [mesh, index]))
  const nodes = root.listNodes()
  const nodeIndexes = new Map(nodes.map((node, index) => [node, index]))
  const contract = {
    bounds: computePositionBounds(meshes),
    materials: materials.map((material) => ({
      alphaCutoff: material.getAlphaCutoff(),
      alphaMode: material.getAlphaMode(),
      baseColorFactor: material.getBaseColorFactor(),
      doubleSided: material.getDoubleSided(),
      emissiveFactor: material.getEmissiveFactor(),
      metallicFactor: material.getMetallicFactor(),
      name: material.getName(),
      normalScale: material.getNormalScale(),
      occlusionStrength: material.getOcclusionStrength(),
      roughnessFactor: material.getRoughnessFactor(),
      slots: {
        baseColor: textureSlotContract(
          material.getBaseColorTexture(),
          material.getBaseColorTextureInfo(),
          textureIndexes,
        ),
        emissive: textureSlotContract(
          material.getEmissiveTexture(),
          material.getEmissiveTextureInfo(),
          textureIndexes,
        ),
        metallicRoughness: textureSlotContract(
          material.getMetallicRoughnessTexture(),
          material.getMetallicRoughnessTextureInfo(),
          textureIndexes,
        ),
        normal: textureSlotContract(
          material.getNormalTexture(),
          material.getNormalTextureInfo(),
          textureIndexes,
        ),
        occlusion: textureSlotContract(
          material.getOcclusionTexture(),
          material.getOcclusionTextureInfo(),
          textureIndexes,
        ),
      },
    })),
    meshes: meshes.map((mesh) => ({
      name: mesh.getName(),
      primitives: mesh.listPrimitives().map((primitive) => ({
        attributes: Object.fromEntries(
          primitive
            .listSemantics()
            .sort()
            .map((semantic) => [semantic, accessorContract(primitive.getAttribute(semantic))]),
        ),
        indices: accessorContract(primitive.getIndices()),
        material: materialIndexes.get(primitive.getMaterial()) ?? null,
        mode: primitive.getMode(),
        targets: primitive.listTargets().map((target) =>
          Object.fromEntries(
            target
              .listSemantics()
              .sort()
              .map((semantic) => [semantic, accessorContract(target.getAttribute(semantic))]),
          ),
        ),
      })),
    })),
    nodes: nodes.map((node) => ({
      children: node.listChildren().map((child) => nodeIndexes.get(child)),
      mesh: meshIndexes.get(node.getMesh()) ?? null,
      name: node.getName(),
      rotation: node.getRotation(),
      scale: node.getScale(),
      translation: node.getTranslation(),
    })),
    scenes: root.listScenes().map((scene) => ({
      children: scene.listChildren().map((node) => nodeIndexes.get(node)),
      name: scene.getName(),
    })),
    textureCount: textures.length,
  }
  return {
    ...contract,
    semanticHash: sha256(Buffer.from(stableSerialize(contract))),
  }
}

function accessorContract(accessor) {
  if (!accessor) return null
  const array = accessor.getArray()
  if (!array) throw new Error('Weapon accessor has no dense array data.')
  return {
    arrayHash: sha256(Buffer.from(array.buffer, array.byteOffset, array.byteLength)),
    componentType: accessor.getComponentType(),
    count: accessor.getCount(),
    normalized: accessor.getNormalized(),
    type: accessor.getType(),
  }
}

function computePositionBounds(meshes) {
  const min = [Infinity, Infinity, Infinity]
  const max = [-Infinity, -Infinity, -Infinity]
  let positionCount = 0
  for (const mesh of meshes) {
    for (const primitive of mesh.listPrimitives()) {
      const positions = primitive.getAttribute('POSITION')?.getArray()
      if (!positions) continue
      positionCount += positions.length / 3
      for (let index = 0; index < positions.length; index += 3) {
        for (let component = 0; component < 3; component += 1) {
          min[component] = Math.min(min[component], positions[index + component])
          max[component] = Math.max(max[component], positions[index + component])
        }
      }
    }
  }
  if (positionCount === 0) return null
  return { max, min, positionCount }
}

function textureSlotContract(texture, info, textureIndexes) {
  if (!(texture && info)) return null
  return {
    magFilter: info.getMagFilter(),
    minFilter: info.getMinFilter(),
    texCoord: info.getTexCoord(),
    texture: textureIndexes.get(texture),
    wrapS: info.getWrapS(),
    wrapT: info.getWrapT(),
  }
}

async function ensurePristineSource({ id, outputPath, sourceArtifact, sourcePath }) {
  const existing = await inspectOptionalGlb(sourcePath)
  if (existing) {
    assertSourceMatches(id, existing, sourceArtifact)
    return existing
  }

  const publicOutput = await inspectOptionalGlb(outputPath)
  if (!publicOutput || publicOutput.contentHash !== sourceArtifact.sha256) {
    throw new Error(
      `${id}: pristine Meshy source is missing at ${sourcePath}; the optimized runtime output is never accepted as encoder input.`,
    )
  }
  assertSourceMatches(id, publicOutput, sourceArtifact)
  await mkdir(dirname(sourcePath), { recursive: true })
  const temporaryPath = `${sourcePath}.${process.pid}.${randomUUID()}.tmp.glb`
  try {
    await copyFile(outputPath, temporaryPath)
    assertSourceMatches(id, await inspectGlb(temporaryPath), sourceArtifact)
    await rename(temporaryPath, sourcePath)
  } finally {
    await rm(temporaryPath, { force: true })
  }
  return inspectGlb(sourcePath)
}

function validateRuntime(source, runtime, outputPath) {
  for (const field of [
    'animationCount',
    'materialCount',
    'meshCount',
    'primitiveCount',
    'skinCount',
    'triangleCount',
  ]) {
    if (runtime[field] !== source[field]) {
      throw new Error(`${outputPath}: texture optimization changed ${field}.`)
    }
  }
  if (runtime.imageCount !== source.imageCount || runtime.imageCount === 0) {
    throw new Error(`${outputPath}: texture optimization changed the image count.`)
  }
  const invalidImages = runtime.images.filter(
    ({ embedded, height, mimeType, width }) =>
      !embedded ||
      mimeType !== 'image/jpeg' ||
      height !== ZOMBIE_ESCAPE_WEAPON_TEXTURE_OPTIMIZER.resolution ||
      width !== ZOMBIE_ESCAPE_WEAPON_TEXTURE_OPTIMIZER.resolution,
  )
  if (invalidImages.length > 0) {
    throw new Error(
      `${outputPath}: optimizer did not produce embedded ${ZOMBIE_ESCAPE_WEAPON_TEXTURE_OPTIMIZER.resolution}px JPEG textures.`,
    )
  }
}

function assertSourceMatches(id, inspection, sourceArtifact) {
  if (
    inspection.byteLength !== sourceArtifact.byteLength ||
    inspection.contentHash !== sourceArtifact.sha256
  ) {
    throw new Error(`${id}: pristine Meshy source does not match recorded task provenance.`)
  }
}

function assertToolVersions() {
  const versions = [
    [
      'gltf-transform core',
      GLTF_TRANSFORM_CORE_VERSION,
      ZOMBIE_ESCAPE_WEAPON_TEXTURE_OPTIMIZER.gltfTransformCoreVersion,
    ],
    [
      'gltf-transform extensions',
      GLTF_TRANSFORM_EXTENSIONS_VERSION,
      ZOMBIE_ESCAPE_WEAPON_TEXTURE_OPTIMIZER.gltfTransformExtensionsVersion,
    ],
    ['sharp', sharp.versions.sharp, ZOMBIE_ESCAPE_WEAPON_TEXTURE_OPTIMIZER.sharpVersion],
    ['libvips', sharp.versions.vips, ZOMBIE_ESCAPE_WEAPON_TEXTURE_OPTIMIZER.vipsVersion],
    ['mozjpeg', sharp.versions.mozjpeg, ZOMBIE_ESCAPE_WEAPON_TEXTURE_OPTIMIZER.mozjpegVersion],
  ]
  for (const [label, actual, expected] of versions) {
    if (actual !== expected) {
      throw new Error(`Weapon optimizer requires ${label} ${expected}; received ${actual}.`)
    }
  }
}

function assertWeaponId(id) {
  if (!ZOMBIE_ESCAPE_WEAPON_IDS.includes(id)) {
    throw new Error(`Unknown Zombie Escape weapon id: ${id}.`)
  }
}

function createSummary(id, outputPath, runtime, skipped) {
  return {
    id,
    outputPath,
    resolution: ZOMBIE_ESCAPE_WEAPON_TEXTURE_OPTIMIZER.resolution,
    runtimeByteLength: runtime.byteLength,
    skipped,
  }
}

async function inspectOptionalGlb(path) {
  try {
    return await inspectGlb(path)
  } catch (error) {
    if (error?.code === 'ENOENT') return null
    throw error
  }
}

function resolvePublicPath(publicDirectory, publicPath) {
  const path = resolve(publicDirectory, publicPath.replace(/^\/+/, ''))
  const fromRoot = relative(publicDirectory, path)
  if (fromRoot === '..' || fromRoot.startsWith('../') || fromRoot.startsWith('..\\')) {
    throw new Error(`Weapon output escapes the public directory: ${publicPath}`)
  }
  return path
}

async function measureCompleteWeaponPayload({ publicDirectory, stagedById, state }) {
  let total = 0
  for (const id of ZOMBIE_ESCAPE_WEAPON_IDS) {
    const staged = stagedById.get(id)
    if (staged) {
      total += staged.runtime.byteLength
      continue
    }
    const publicPath = state.assets[id]?.outputs?.model
    if (!publicPath) throw new Error(`${id}: missing runtime output path for payload budget.`)
    const runtime = await inspectOptionalGlb(resolvePublicPath(publicDirectory, publicPath))
    if (!runtime) throw new Error(`${id}: runtime output is missing for payload budget.`)
    total += runtime.byteLength
  }
  return total
}

async function promoteStagedResults(results, stagingDirectory) {
  const entries = []
  const backupDirectory = resolve(stagingDirectory, 'backups')
  await mkdir(backupDirectory, { recursive: true })
  for (const result of [...results].sort((a, b) => a.index - b.index)) {
    const backupPath = resolve(backupDirectory, `${result.id}.glb`)
    let hadExisting = true
    try {
      await copyFile(result.outputPath, backupPath)
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error
      hadExisting = false
    }
    entries.push({ ...result, backupPath, hadExisting, promoted: false })
  }

  const rollback = async () => {
    const failures = []
    for (const entry of [...entries].reverse()) {
      if (!entry.promoted) continue
      try {
        if (entry.hadExisting) {
          const restorePath = `${entry.outputPath}.${process.pid}.${randomUUID()}.restore.glb`
          try {
            await copyFile(entry.backupPath, restorePath)
            await rename(restorePath, entry.outputPath)
          } finally {
            await rm(restorePath, { force: true })
          }
        } else {
          await rm(entry.outputPath, { force: true })
        }
        entry.promoted = false
      } catch (error) {
        failures.push(error)
      }
    }
    if (failures.length > 0) {
      throw new AggregateError(failures, 'Weapon runtime rollback failed.')
    }
  }

  try {
    for (const entry of entries) {
      await mkdir(dirname(entry.outputPath), { recursive: true })
      const publishPath = `${entry.outputPath}.${process.pid}.${randomUUID()}.publish.glb`
      try {
        await copyFile(entry.stagedPath, publishPath)
        await rename(publishPath, entry.outputPath)
        entry.promoted = true
      } finally {
        await rm(publishPath, { force: true })
      }
    }
  } catch (error) {
    try {
      await rollback()
    } catch (rollbackError) {
      throw new AggregateError(
        [error, rollbackError],
        'Weapon runtime publish and rollback both failed.',
      )
    }
    throw error
  }
  return { rollback }
}

function restoreObject(target, source) {
  for (const key of Object.keys(target)) delete target[key]
  Object.assign(target, source)
}

async function runPool(items, limit, worker) {
  const results = Array(items.length)
  let nextIndex = 0
  const failures = []
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      for (;;) {
        const index = nextIndex
        nextIndex += 1
        if (index >= items.length) return
        try {
          results[index] = await worker(items[index])
        } catch (error) {
          failures.push(error)
        }
      }
    }),
  )
  if (failures.length > 0) {
    throw new AggregateError(failures, `${failures.length} weapon texture jobs failed.`)
  }
  return results
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex')
}

function stableSerialize(value) {
  if (Array.isArray(value)) return `[${value.map(stableSerialize).join(',')}]`
  if (value && typeof value === 'object') {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableSerialize(value[key])}`)
      .join(',')}}`
  }
  return JSON.stringify(value)
}

function installedPackageVersion(packageName) {
  const entryPath = require.resolve(packageName)
  const packagePath = resolve(dirname(entryPath), '../package.json')
  return JSON.parse(readFileSync(packagePath, 'utf8')).version
}

async function readState(path) {
  return JSON.parse(await readFile(path, 'utf8'))
}

async function writeState(path, state) {
  const temporaryPath = `${path}.${process.pid}.${randomUUID()}.tmp`
  try {
    await writeFile(temporaryPath, `${JSON.stringify(state, null, 2)}\n`)
    await rename(temporaryPath, path)
  } finally {
    await rm(temporaryPath, { force: true })
  }
}

const isMain = process.argv[1] && resolve(process.argv[1]) === import.meta.filename
if (isMain) {
  const state = await readState(DEFAULT_STATE_PATH)
  const summaries = await optimizeZombieEscapeWeaponRuntimeAssets({
    force: process.argv.includes('--force'),
    persistState: (nextState) => writeState(DEFAULT_STATE_PATH, nextState),
    state,
  })
  console.log(JSON.stringify(summaries, null, 2))
}
