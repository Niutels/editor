import { execFile } from 'node:child_process'
import { createHash, randomUUID } from 'node:crypto'
import { copyFile, mkdir, readFile, rename, rm } from 'node:fs/promises'
import { dirname, relative, resolve } from 'node:path'
import { promisify } from 'node:util'
import {
  PINNED_KTX_SOFTWARE,
  pinnedKtxEnvironment,
  preparePinnedKtxSoftware,
  windowsPathToWsl,
} from './island-ambient-ktx-toolchain.mjs'
import { inspectGlb } from './landrush-glb-audit.mjs'

const execFileAsync = promisify(execFile)
const APP_ROOT = resolve(import.meta.dirname, '..')
const OPTIMIZER_WORKER_ROOT = resolve(import.meta.dirname, 'island-ambient-optimizer-worker')

export const ISLAND_AMBIENT_PRISTINE_SOURCE_DIRECTORY = resolve(
  APP_ROOT,
  'assets/island-ambient-meshy-source',
)

const SOURCE_DIRECTORY_BY_KIND = Object.freeze({
  boat: 'boats',
  fish: 'fish',
  npc: 'npcs',
  palm: 'palms',
})

export const ISLAND_AMBIENT_TEXTURE_OPTIMIZER = Object.freeze({
  etc1s: Object.freeze({ compression: 5, quality: 255 }),
  gltfTransformVersion: '4.4.2',
  ktxSoftware: Object.freeze({
    archiveSha256: PINNED_KTX_SOFTWARE.archiveSha256,
    archiveUrl: PINNED_KTX_SOFTWARE.archiveUrl,
    executableSha256: PINNED_KTX_SOFTWARE.executable.sha256,
    librarySha256: PINNED_KTX_SOFTWARE.library.sha256,
    version: PINNED_KTX_SOFTWARE.version,
  }),
  maxRuntimeCompressedTextureBytes: 96 * 1024 * 1024,
  maxRuntimeUncompressedRgbaMipBytes: 256 * 1024 * 1024,
  resolutionByKind: Object.freeze({ boat: 512, fish: 512, npc: 768, palm: 512 }),
  schemaVersion: 1,
  sharpVersion: '0.34.5',
  uastc: Object.freeze({ level: 4, rdo: false, zstd: 18 }),
})

const OPTIMIZER_FINGERPRINT = sha256(
  Buffer.from(JSON.stringify(ISLAND_AMBIENT_TEXTURE_OPTIMIZER)),
)
let verifiedToolchainPromise
let optimizerWorkerDependenciesPromise
let wslNodeRuntimePromise

export function islandAmbientRuntimeResolution(kind) {
  const resolution = ISLAND_AMBIENT_TEXTURE_OPTIMIZER.resolutionByKind[kind]
  if (!resolution) throw new Error(`Unknown island ambient kind: ${kind}.`)
  return resolution
}

export function islandAmbientOptimizerFingerprint() {
  return OPTIMIZER_FINGERPRINT
}

export function islandAmbientPristineSourcePath(
  asset,
  artifactKey,
  sourceDirectory = ISLAND_AMBIENT_PRISTINE_SOURCE_DIRECTORY,
) {
  const kindDirectory = SOURCE_DIRECTORY_BY_KIND[asset.kind]
  if (!kindDirectory) throw new Error(`${asset.id}: unknown island ambient kind ${asset.kind}.`)
  return resolve(sourceDirectory, kindDirectory, asset.id, `${artifactKey}.glb`)
}

export function islandAmbientPristineSourceReference(sourcePath) {
  const reference = relative(APP_ROOT, sourcePath).replaceAll('\\', '/')
  if (reference === '..' || reference.startsWith('../')) {
    throw new Error(`Island ambient pristine source must remain inside ${APP_ROOT}: ${sourcePath}`)
  }
  return reference
}

export async function optimizeIslandAmbientRuntimeAssets({
  assets,
  concurrency = 2,
  force = false,
  persistState,
  publicDirectory,
  sourceDirectory = ISLAND_AMBIENT_PRISTINE_SOURCE_DIRECTORY,
  state,
}) {
  await verifyPinnedTextureToolchain()
  if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > 4) {
    throw new Error('Island ambient optimizer concurrency must be an integer from 1 to 4.')
  }
  const summaries = Array(assets.length)
  const jobs = []
  let stateChanged = false
  for (let assetIndex = 0; assetIndex < assets.length; assetIndex += 1) {
    const asset = assets[assetIndex]
    const record = state.assets?.[asset.id]
    if (!record) throw new Error(`${asset.id}: missing Meshy generation record.`)
    const artifactKey = asset.kind === 'npc' ? 'rigged' : 'model'
    const sourceArtifact = record.artifacts?.[artifactKey]
    const publicPath = record.outputs?.[artifactKey]
    if (!(sourceArtifact && publicPath)) {
      throw new Error(`${asset.id}: missing ${artifactKey} source provenance or output path.`)
    }
    const outputPath = resolve(publicDirectory, publicPath.replace(/^\/+/, ''))
    const sourcePath = islandAmbientPristineSourcePath(asset, artifactKey, sourceDirectory)
    await ensurePristineSource({
      id: asset.id,
      outputPath,
      sourceArtifact,
      sourcePath,
    })
    const sourceReference = islandAmbientPristineSourceReference(sourcePath)
    if (sourceArtifact.sourcePath !== sourceReference) {
      sourceArtifact.sourcePath = sourceReference
      stateChanged = true
    }
    const current = await inspectOptionalGlb(outputPath)
    const cached = record.runtimeArtifacts?.[artifactKey]
    if (
      !force &&
      cached?.optimizerFingerprint === OPTIMIZER_FINGERPRINT &&
      cached?.sourceSha256 === sourceArtifact.sha256 &&
      cached?.taskId === sourceArtifact.taskId &&
      cached?.runtimeSha256 === current?.contentHash
    ) {
      summaries[assetIndex] = {
        id: asset.id,
        kind: asset.kind,
        outputPath: publicPath,
        resolution: cached.resolution,
        runtimeByteLength: current.byteLength,
        skipped: true,
      }
      continue
    }

    const resolution = islandAmbientRuntimeResolution(asset.kind)
    jobs.push({
      artifactKey,
      asset,
      assetIndex,
      outputPath,
      publicPath,
      resolution,
      sourceArtifact,
      sourcePath,
      sourceReference,
    })
  }

  const optimizedJobs = await runPool(jobs, concurrency, async (job) => ({
    ...job,
    optimized: await optimizeIslandAmbientGlb(job),
  }))
  for (const job of optimizedJobs.sort((a, b) => a.assetIndex - b.assetIndex)) {
    const { artifactKey, asset, assetIndex, optimized, publicPath, resolution, sourceArtifact, sourceReference } = job
    const record = state.assets[asset.id]
    record.runtimeArtifacts ??= {}
    record.runtimeArtifacts[artifactKey] = {
      optimizerFingerprint: OPTIMIZER_FINGERPRINT,
      path: publicPath,
      resolution,
      runtimeByteLength: optimized.byteLength,
      runtimeSha256: optimized.contentHash,
      sourceByteLength: sourceArtifact.byteLength,
      sourcePath: sourceReference,
      sourceSha256: sourceArtifact.sha256,
      taskId: sourceArtifact.taskId,
      textureCount: optimized.imageCount,
    }
    stateChanged = true
    summaries[assetIndex] = {
      id: asset.id,
      kind: asset.kind,
      outputPath: publicPath,
      resolution,
      runtimeByteLength: optimized.byteLength,
      skipped: false,
    }
  }
  if (stateChanged) await persistState?.(state)
  return summaries
}

export async function optimizeIslandAmbientGlb({ outputPath, resolution, sourcePath = outputPath }) {
  const toolchain = await verifyPinnedTextureToolchain()
  await runOptimizerWorker({ outputPath, resolution, sourcePath, toolchain })
  return inspectGlb(outputPath)
}

export async function verifyPinnedTextureToolchain() {
  verifiedToolchainPromise ??= verifyPinnedTextureToolchainOnce()
  return verifiedToolchainPromise
}

async function verifyPinnedTextureToolchainOnce() {
  const ktxSoftware = await preparePinnedKtxSoftware()
  return {
    ...ktxSoftware,
    ktxSoftwareVersion: ktxSoftware.version,
  }
}

async function ensurePristineSource({ id, outputPath, sourceArtifact, sourcePath }) {
  const existing = await inspectOptionalGlb(sourcePath)
  if (existing) {
    assertSourceMatches(id, existing, sourceArtifact)
    return
  }

  const publicOutput = await inspectOptionalGlb(outputPath)
  if (!publicOutput || publicOutput.contentHash !== sourceArtifact.sha256) {
    throw new Error(
      `${id}: pristine Meshy source is missing at ${sourcePath}. Regenerate or reacquire task ${sourceArtifact.taskId}; optimized runtime output is never used as an encoder input.`,
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
}

function assertSourceMatches(id, inspection, sourceArtifact) {
  if (
    inspection.byteLength !== sourceArtifact.byteLength ||
    inspection.contentHash !== sourceArtifact.sha256
  ) {
    throw new Error(`${id}: pristine Meshy source does not match recorded task provenance.`)
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

async function runOptimizerWorker({ outputPath, resolution, sourcePath, toolchain }) {
  const runtime = await ensureOptimizerWorkerDependencies()
  const workerPath = resolve(OPTIMIZER_WORKER_ROOT, 'optimize.mjs')
  const windows = process.platform === 'win32'
  const command = windows ? 'wsl.exe' : process.execPath
  const arguments_ = windows
    ? [
        '--exec',
        'env',
        ...Object.entries(pinnedKtxEnvironmentForWsl(toolchain)).map(
          ([name, value]) => `${name}=${value}`,
        ),
        runtime.nodeExecutable,
        windowsPathToWsl(workerPath),
        '--source',
        windowsPathToWsl(sourcePath),
        '--output',
        windowsPathToWsl(outputPath),
        '--resolution',
        String(resolution),
      ]
    : [
        workerPath,
        '--source',
        sourcePath,
        '--output',
        outputPath,
        '--resolution',
        String(resolution),
      ]
  try {
    await execFileAsync(command, arguments_, {
      env: windows ? process.env : pinnedKtxEnvironment(toolchain),
      maxBuffer: 64 * 1024 * 1024,
      windowsHide: true,
    })
  } catch (error) {
    throw new Error(
      `Pinned KTX worker failed for ${outputPath}: ${error?.stderr?.trim?.() || error?.message || error}`,
      { cause: error },
    )
  }
}

async function ensureOptimizerWorkerDependencies() {
  optimizerWorkerDependenciesPromise ??= installOptimizerWorkerDependencies()
  return optimizerWorkerDependenciesPromise
}

async function installOptimizerWorkerDependencies() {
  if (process.platform !== 'win32') {
    try {
      await execFileAsync(
        'npm',
        ['ci', '--include=optional', '--no-audit', '--no-fund', '--prefix', OPTIMIZER_WORKER_ROOT],
        { windowsHide: true },
      )
    } catch (error) {
      throw new Error('Could not install the lock-pinned island ambient optimizer worker.', {
        cause: error,
      })
    }
    return { nodeExecutable: process.execPath }
  }

  const runtime = await resolveWslNodeRuntime()
  try {
    await execFileAsync(
      'wsl.exe',
      [
        '--exec',
        runtime.nodeExecutable,
        runtime.npmCliPath,
        'ci',
        '--include=optional',
        '--no-audit',
        '--no-fund',
        '--prefix',
        windowsPathToWsl(OPTIMIZER_WORKER_ROOT),
      ],
      { maxBuffer: 64 * 1024 * 1024, windowsHide: true },
    )
  } catch (error) {
    throw new Error('Could not install the lock-pinned Linux optimizer worker in WSL.', {
      cause: error,
    })
  }
  return runtime
}

async function resolveWslNodeRuntime() {
  wslNodeRuntimePromise ??= execFileAsync(
    'wsl.exe',
    [
      '--exec',
      'bash',
      '-lc',
      'command -v node && node --version && readlink -f "$(command -v npm)"',
    ],
    { windowsHide: true },
  ).then(({ stdout }) => {
    const [nodeExecutable, version, npmCliPath] = stdout.trim().split(/\r?\n/u)
    const majorVersion = Number.parseInt(version?.match(/^v(\d+)/u)?.[1] ?? '', 10)
    if (
      !(
        nodeExecutable?.startsWith('/') &&
        npmCliPath?.startsWith('/') &&
        majorVersion >= 20
      )
    ) {
      throw new Error(
        `Windows ambient optimization requires Node.js 20+ inside WSL; received ${version ?? 'none'}.`,
      )
    }
    return { nodeExecutable, npmCliPath }
  })
  return wslNodeRuntimePromise
}

function pinnedKtxEnvironmentForWsl(toolchain) {
  return {
    LD_LIBRARY_PATH: toolchain.wslLibraryDirectory,
    PATH: `${windowsPathToWsl(toolchain.binDirectory)}:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin`,
  }
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
    throw new AggregateError(failures, `${failures.length} island ambient texture jobs failed.`)
  }
  return results
}

export async function fileSha256(path) {
  return sha256(await readFile(path))
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex')
}
