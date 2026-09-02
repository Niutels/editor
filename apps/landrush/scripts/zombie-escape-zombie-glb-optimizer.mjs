import { createHash, randomUUID } from 'node:crypto'
import { mkdir, readFile, rename, rm } from 'node:fs/promises'
import { dirname, isAbsolute, relative, resolve } from 'node:path'
import {
  islandAmbientOptimizerFingerprint,
  optimizeIslandAmbientGlb,
} from './island-ambient-glb-optimizer.mjs'
import { writeAnimationOnlyGlb } from './landrush-glb-animation-extract.mjs'
import { inspectGlb } from './landrush-glb-audit.mjs'

const APP_ROOT = resolve(import.meta.dirname, '..')
const SOURCE_ROOT = resolve(APP_ROOT, 'assets/zombie-escape-meshy-source/zombies')
const PUBLIC_ASSET_PREFIX = '/landrush-lab/zombie-escape/assets/zombies'
const SOURCE_OUTPUTS = Object.freeze(['rigged', 'run', 'walk'])
const RUNTIME_PATH_SUFFIX = Object.freeze({
  rigged: 'rigged.glb',
  run: 'run.anim.glb',
  walk: 'walk.anim.glb',
})

export const ZOMBIE_ESCAPE_DEDICATED_ZOMBIE_RUNTIME_IDS = Object.freeze([
  'boardwalk-chef',
  'marina-mechanic',
])

export const ZOMBIE_ESCAPE_ZOMBIE_RUNTIME_TEXTURE_RESOLUTION = 768

const DEDICATED_ID_SET = new Set(ZOMBIE_ESCAPE_DEDICATED_ZOMBIE_RUNTIME_IDS)
const RUNTIME_OPTIMIZER_FINGERPRINTS = Object.freeze(
  Object.fromEntries(
    SOURCE_OUTPUTS.map((output) => [
      output,
      sha256(
        Buffer.from(
          JSON.stringify({
            animationExtractor:
              output === 'rigged' ? null : 'landrush-glb-animation-extract-v1',
            islandAmbientOptimizer:
              output === 'rigged' ? islandAmbientOptimizerFingerprint() : null,
            output,
            resolution:
              output === 'rigged'
                ? ZOMBIE_ESCAPE_ZOMBIE_RUNTIME_TEXTURE_RESOLUTION
                : null,
            schemaVersion: 1,
          }),
        ),
      ),
    ]),
  ),
)

export function zombieEscapeZombieSourcePath(id, output) {
  assertDedicatedId(id)
  assertSourceOutput(output)
  return resolveContainedPath(SOURCE_ROOT, id, `${output}.glb`)
}

export function zombieEscapeZombieSourceReference(path) {
  const resolvedPath = resolve(path)
  const sourceRelativePath = relative(SOURCE_ROOT, resolvedPath)
  if (escapesRoot(sourceRelativePath)) {
    throw new Error(`Zombie Escape zombie source must remain inside ${SOURCE_ROOT}: ${path}`)
  }
  const segments = sourceRelativePath.split(/[\\/]/u)
  if (segments.length !== 2) {
    throw new Error(`Zombie Escape zombie source has an invalid path: ${path}`)
  }
  const [id, fileName] = segments
  const output = fileName?.replace(/\.glb$/u, '')
  assertDedicatedId(id)
  assertSourceOutput(output)
  if (fileName !== `${output}.glb`) {
    throw new Error(`Zombie Escape zombie source has an invalid filename: ${path}`)
  }
  return relative(APP_ROOT, resolvedPath).replaceAll('\\', '/')
}

export function zombieEscapeZombieRuntimeOptimizerFingerprint(output) {
  assertSourceOutput(output)
  return RUNTIME_OPTIMIZER_FINGERPRINTS[output]
}

export async function optimizeZombieEscapeZombieRuntimeAssets({
  ids,
  force = false,
  persistState,
  publicDirectory,
  state,
}) {
  const selectedIds = validateSelectedIds(ids)
  if (typeof persistState !== 'function') {
    throw new Error('Zombie Escape zombie optimization requires a state persistence callback.')
  }
  if (!(state && typeof state === 'object' && state.assets && typeof state.assets === 'object')) {
    throw new Error('Zombie Escape zombie optimization requires Meshy pipeline state.')
  }
  const resolvedPublicDirectory = resolve(publicDirectory)
  const summaries = []

  for (const id of selectedIds) {
    const record = state.assets[id]
    if (!record) throw new Error(`${id}: missing Meshy generation record.`)
    if (record.kind !== 'zombie') throw new Error(`${id}: Meshy generation record is not a zombie.`)
    if (typeof record.rigTaskId !== 'string' || record.rigTaskId.length === 0) {
      throw new Error(`${id}: missing successful Meshy rigging task provenance.`)
    }

    const source = {}
    for (const output of SOURCE_OUTPUTS) {
      source[output] = await inspectVerifiedSource({ id, output, record })
    }

    const runtimePaths = createRuntimePaths(resolvedPublicDirectory, id)
    await mkdir(dirname(runtimePaths.rigged.local), { recursive: true })
    const runtimeInspections = {}
    const staleOutputs = []
    for (const output of SOURCE_OUTPUTS) {
      const current = await inspectOptionalGlb(runtimePaths[output].local)
      if (
        !force &&
        current &&
        isRuntimeCacheCurrent({
          current,
          output,
          record,
          runtimePath: runtimePaths[output].public,
          source: source[output],
        })
      ) {
        runtimeInspections[output] = current
      } else {
        staleOutputs.push(output)
      }
    }

    const stagedPaths = new Map()
    try {
      for (const output of staleOutputs) {
        const stagedPath = temporaryGlbPath(runtimePaths[output].local)
        stagedPaths.set(output, stagedPath)
        if (output === 'rigged') {
          runtimeInspections.rigged = await optimizeIslandAmbientGlb({
            outputPath: stagedPath,
            resolution: ZOMBIE_ESCAPE_ZOMBIE_RUNTIME_TEXTURE_RESOLUTION,
            sourcePath: source.rigged.path,
          })
        } else {
          await writeAnimationOnlyGlb(source[output].path, stagedPath)
          runtimeInspections[output] = await inspectGlb(stagedPath)
        }
      }

      for (const output of staleOutputs) {
        await rename(stagedPaths.get(output), runtimePaths[output].local)
        stagedPaths.delete(output)
      }
    } finally {
      await Promise.all([...stagedPaths.values()].map((path) => rm(path, { force: true })))
    }

    const preview = record.outputs?.preview
    if (typeof preview !== 'string' || preview.length === 0) {
      throw new Error(`${id}: generated preview output is missing.`)
    }
    record.outputs = {
      preview,
      rigged: runtimePaths.rigged.public,
      run: runtimePaths.run.public,
      walk: runtimePaths.walk.public,
    }
    record.validation = {
      rigged: runtimeInspections.rigged,
      run: runtimeInspections.run,
      walk: runtimeInspections.walk,
    }
    record.runtimeArtifacts ??= {}
    for (const output of SOURCE_OUTPUTS) {
      record.runtimeArtifacts[output] = createRuntimeArtifact({
        output,
        runtime: runtimeInspections[output],
        runtimePath: runtimePaths[output].public,
        source: source[output],
        taskId: record.rigTaskId,
      })
    }

    await persistState(state)
    await Promise.all([
      rm(resolveContainedPath(runtimePaths.root, 'run.glb'), { force: true }),
      rm(resolveContainedPath(runtimePaths.root, 'walk.glb'), { force: true }),
    ])
    summaries.push({
      id,
      outputs: Object.fromEntries(
        SOURCE_OUTPUTS.map((output) => [output, runtimePaths[output].public]),
      ),
      skipped: staleOutputs.length === 0,
    })
  }

  return summaries
}

async function inspectVerifiedSource({ id, output, record }) {
  const path = zombieEscapeZombieSourcePath(id, output)
  const reference = zombieEscapeZombieSourceReference(path)
  const artifact = record.artifacts?.[output]
  if (!artifact) throw new Error(`${id}/${output}: missing pristine Meshy artifact provenance.`)
  if (artifact.path !== reference && artifact.sourcePath !== reference) {
    throw new Error(`${id}/${output}: pristine Meshy source path does not match provenance.`)
  }
  if (artifact.taskId !== record.rigTaskId) {
    throw new Error(`${id}/${output}: pristine Meshy source task does not match rigging provenance.`)
  }
  const inspection = await inspectGlb(path)
  if (
    inspection.byteLength !== artifact.byteLength ||
    inspection.contentHash !== artifact.sha256
  ) {
    throw new Error(`${id}/${output}: pristine Meshy source does not match recorded provenance.`)
  }
  return {
    artifact,
    inspection,
    path,
    reference,
  }
}

function createRuntimePaths(publicDirectory, id) {
  const root = resolveContainedPath(
    publicDirectory,
    'landrush-lab',
    'zombie-escape',
    'assets',
    'zombies',
    id,
  )
  return {
    rigged: {
      local: resolveContainedPath(root, RUNTIME_PATH_SUFFIX.rigged),
      public: `${PUBLIC_ASSET_PREFIX}/${id}/${RUNTIME_PATH_SUFFIX.rigged}`,
    },
    root,
    run: {
      local: resolveContainedPath(root, RUNTIME_PATH_SUFFIX.run),
      public: `${PUBLIC_ASSET_PREFIX}/${id}/${RUNTIME_PATH_SUFFIX.run}`,
    },
    walk: {
      local: resolveContainedPath(root, RUNTIME_PATH_SUFFIX.walk),
      public: `${PUBLIC_ASSET_PREFIX}/${id}/${RUNTIME_PATH_SUFFIX.walk}`,
    },
  }
}

function isRuntimeCacheCurrent({ current, output, record, runtimePath, source }) {
  const cached = record.runtimeArtifacts?.[output]
  return (
    cached?.optimizerFingerprint === zombieEscapeZombieRuntimeOptimizerFingerprint(output) &&
    cached.path === runtimePath &&
    cached.runtimeByteLength === current.byteLength &&
    cached.runtimeSha256 === current.contentHash &&
    cached.sourceByteLength === source.inspection.byteLength &&
    cached.sourcePath === source.reference &&
    cached.sourceSha256 === source.inspection.contentHash &&
    cached.taskId === source.artifact.taskId &&
    (output !== 'rigged' ||
      cached.resolution === ZOMBIE_ESCAPE_ZOMBIE_RUNTIME_TEXTURE_RESOLUTION) &&
    record.outputs?.[output] === runtimePath &&
    record.validation?.[output]?.byteLength === current.byteLength &&
    record.validation?.[output]?.contentHash === current.contentHash
  )
}

function createRuntimeArtifact({ output, runtime, runtimePath, source, taskId }) {
  return {
    optimizerFingerprint: zombieEscapeZombieRuntimeOptimizerFingerprint(output),
    path: runtimePath,
    ...(output === 'rigged'
      ? { resolution: ZOMBIE_ESCAPE_ZOMBIE_RUNTIME_TEXTURE_RESOLUTION }
      : {}),
    runtimeByteLength: runtime.byteLength,
    runtimeSha256: runtime.contentHash,
    sourceByteLength: source.inspection.byteLength,
    sourcePath: source.reference,
    sourceSha256: source.inspection.contentHash,
    taskId,
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

function validateSelectedIds(ids) {
  if (!Array.isArray(ids)) throw new Error('Zombie Escape zombie optimizer ids must be an array.')
  const selectedIds = [...ids]
  if (new Set(selectedIds).size !== selectedIds.length) {
    throw new Error('Zombie Escape zombie optimizer ids must not contain duplicates.')
  }
  for (const id of selectedIds) assertDedicatedId(id)
  return selectedIds
}

function assertDedicatedId(id) {
  if (!DEDICATED_ID_SET.has(id)) {
    throw new Error(`Unknown dedicated Zombie Escape zombie id: ${String(id)}.`)
  }
}

function assertSourceOutput(output) {
  if (!SOURCE_OUTPUTS.includes(output)) {
    throw new Error(`Unknown Zombie Escape zombie GLB output: ${String(output)}.`)
  }
}

function resolveContainedPath(root, ...segments) {
  const path = resolve(root, ...segments)
  const fromRoot = relative(root, path)
  if (escapesRoot(fromRoot)) throw new Error(`Resolved path escapes ${root}: ${path}`)
  return path
}

function escapesRoot(path) {
  return path === '..' || path.startsWith(`..${process.platform === 'win32' ? '\\' : '/'}`) || isAbsolute(path)
}

function temporaryGlbPath(path) {
  return `${path}.${process.pid}.${randomUUID()}.tmp.glb`
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex')
}
