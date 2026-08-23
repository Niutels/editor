import { createHash, randomUUID } from 'node:crypto'
import { copyFile, mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path'
import {
  ISLAND_AMBIENT_PRISTINE_SOURCE_DIRECTORY,
  ISLAND_AMBIENT_TEXTURE_OPTIMIZER,
  islandAmbientPristineSourcePath,
  islandAmbientPristineSourceReference,
  optimizeIslandAmbientRuntimeAssets,
} from './island-ambient-glb-optimizer.mjs'
import { writeAnimationOnlyGlb } from './landrush-glb-animation-extract.mjs'
import { inspectGlb } from './landrush-glb-audit.mjs'

const API_BASE = 'https://api.meshy.ai/openapi'
const TARGET_FACE_COUNT = 3_000
const IDLE_ACTION_ID = 0
const TERMINAL_STATUSES = new Set(['SUCCEEDED', 'FAILED', 'CANCELED'])
const apiKey = process.env.MESHY_API_KEY
const sourceRoot = resolve(import.meta.dirname, '../../../output/imagegen/meshy-island-assets')
const publicDirectory = resolve(import.meta.dirname, '../public')
const publicRoot = resolve(publicDirectory, 'landrush-lab/island-ambient-assets')
const pristineSourceDirectory = ISLAND_AMBIENT_PRISTINE_SOURCE_DIRECTORY
const statePath = resolve(publicRoot, 'meshy-generation.json')
const manifestPath = resolve(publicRoot, 'asset-manifest.json')
const outputDirectoryByKind = Object.freeze({
  boat: 'boats',
  fish: 'fish',
  npc: 'npcs',
  palm: 'palms',
})
let persistQueue = Promise.resolve()
const concurrency = readNumberArgument('--concurrency', 3)
const textureConcurrency = readNumberArgument('--texture-concurrency', 2)
const force = process.argv.includes('--force')
const dryRun = process.argv.includes('--dry-run')
const selectedKinds = selectKinds()
const requestedIds = readListArgument('--ids')

const assets = [
  {
    id: 'tropical-fishing-skiff',
    kind: 'boat',
    name: 'Tropical Fishing Skiff',
    sourceFile: 'boat_01_tropical_fishing_skiff.png',
    targetSizeMeters: 4.5,
  },
  {
    id: 'island-rescue-speedboat',
    kind: 'boat',
    name: 'Island Rescue Speedboat',
    sourceFile: 'boat_02_rescue_speedboat.png',
    targetSizeMeters: 6,
  },
  {
    id: 'harbor-workboat',
    kind: 'boat',
    name: 'Harbor Workboat',
    sourceFile: 'boat_03_harbor_workboat.png',
    targetSizeMeters: 7,
  },
  {
    id: 'classic-coconut-palm',
    kind: 'palm',
    name: 'Classic Coconut Palm',
    sourceFile: 'palm_01_classic_coconut.png',
    targetSizeMeters: 7.5,
  },
  {
    id: 'windblown-coastal-palm',
    kind: 'palm',
    name: 'Windblown Coastal Palm',
    sourceFile: 'palm_02_windblown_coastal.png',
    targetSizeMeters: 6.5,
  },
  {
    id: 'short-fan-palm',
    kind: 'palm',
    name: 'Short Fan Palm',
    sourceFile: 'palm_03_short_fan_palm.png',
    targetSizeMeters: 3.5,
  },
  {
    id: 'twin-trunk-date-palm',
    kind: 'palm',
    name: 'Twin-Trunk Date Palm',
    sourceFile: 'palm_04_twin_trunk_date_palm.png',
    targetSizeMeters: 5.5,
  },
  {
    id: 'tiny-blue-green-chromis',
    kind: 'fish',
    name: 'Tiny Blue-Green Chromis',
    sourceFile: 'fish_01_tiny_blue_green_chromis.png',
    targetSizeMeters: 0.09,
  },
  {
    id: 'small-clownfish',
    kind: 'fish',
    name: 'Small Clownfish',
    sourceFile: 'fish_02_small_clownfish.png',
    targetSizeMeters: 0.12,
  },
  {
    id: 'small-yellow-tang',
    kind: 'fish',
    name: 'Small Yellow Tang',
    sourceFile: 'fish_03_small_yellow_tang.png',
    targetSizeMeters: 0.2,
  },
  {
    id: 'medium-lionfish',
    kind: 'fish',
    name: 'Medium Lionfish',
    sourceFile: 'fish_04_medium_lionfish.png',
    targetSizeMeters: 0.38,
  },
  {
    id: 'medium-parrotfish',
    kind: 'fish',
    name: 'Medium Parrotfish',
    sourceFile: 'fish_05_medium_parrotfish.png',
    targetSizeMeters: 0.55,
  },
  {
    id: 'large-grouper',
    kind: 'fish',
    name: 'Large Grouper',
    sourceFile: 'fish_06_large_grouper.png',
    targetSizeMeters: 1.4,
  },
  {
    id: 'large-barracuda',
    kind: 'fish',
    name: 'Large Barracuda',
    sourceFile: 'fish_07_large_barracuda.png',
    targetSizeMeters: 1.8,
  },
  {
    id: 'giant-manta-ray',
    kind: 'fish',
    name: 'Giant Manta Ray',
    sourceFile: 'fish_08_giant_manta_ray.png',
    targetSizeMeters: 4.5,
  },
  {
    id: 'caribbean-reef-shark',
    kind: 'fish',
    name: 'Caribbean Reef Shark',
    sourceFile: 'fish_09_caribbean_reef_shark.png',
    targetSizeMeters: 2.4,
  },
  {
    id: 'hammerhead-shark',
    kind: 'fish',
    name: 'Hammerhead Shark',
    sourceFile: 'fish_10_hammerhead_shark.png',
    targetSizeMeters: 3.4,
  },
  {
    id: 'island-groundskeeper',
    kind: 'npc',
    name: 'Island Groundskeeper',
    sourceFile: 'npc_01_island_groundskeeper.png',
    heightMeters: 1.72,
  },
  {
    id: 'local-fisher',
    kind: 'npc',
    name: 'Local Fisher',
    sourceFile: 'npc_02_local_fisher.png',
    heightMeters: 1.78,
  },
  {
    id: 'dock-worker',
    kind: 'npc',
    name: 'Dock Worker',
    sourceFile: 'npc_03_dock_worker.png',
    heightMeters: 1.83,
  },
  {
    id: 'lifeguard',
    kind: 'npc',
    name: 'Lifeguard',
    sourceFile: 'npc_04_lifeguard.png',
    heightMeters: 1.76,
  },
  {
    id: 'backpacker-tourist',
    kind: 'npc',
    name: 'Backpacker Tourist',
    sourceFile: 'npc_05_backpacker_tourist.png',
    heightMeters: 1.7,
  },
  {
    id: 'market-food-vendor',
    kind: 'npc',
    name: 'Market Food Vendor',
    sourceFile: 'npc_06_market_food_vendor.png',
    heightMeters: 1.68,
  },
  {
    id: 'marine-biologist',
    kind: 'npc',
    name: 'Marine Biologist',
    sourceFile: 'npc_07_marine_biologist.png',
    heightMeters: 1.74,
  },
  {
    id: 'building-technician',
    kind: 'npc',
    name: 'Building Technician',
    sourceFile: 'npc_08_building_technician.png',
    heightMeters: 1.8,
  },
  {
    id: 'retired-holidaymaker',
    kind: 'npc',
    name: 'Retired Holidaymaker',
    sourceFile: 'npc_09_retired_holidaymaker.png',
    heightMeters: 1.69,
  },
  {
    id: 'resort-concierge',
    kind: 'npc',
    name: 'Resort Concierge',
    sourceFile: 'npc_10_resort_concierge.png',
    heightMeters: 1.75,
  },
]

const selectedAssets = assets.filter(
  (asset) => selectedKinds.has(asset.kind) && (!requestedIds || requestedIds.has(asset.id)),
)

if (requestedIds) {
  const unknownIds = [...requestedIds].filter((id) => !assets.some((asset) => asset.id === id))
  if (unknownIds.length > 0) throw new Error(`Unknown asset ids: ${unknownIds.join(', ')}`)
}
if (!apiKey && !dryRun) {
  throw new Error('MESHY_API_KEY is required. Keep it in the environment; never commit it.')
}

const sourceInspections = await Promise.all(selectedAssets.map(inspectSource))
if (dryRun) {
  console.log(
    JSON.stringify(
      {
        assets: sourceInspections.map(({ asset, byteLength, sha256 }) => ({
          id: asset.id,
          kind: asset.kind,
          name: asset.name,
          sourceFile: asset.sourceFile,
          byteLength,
          sha256,
        })),
        concurrency,
        estimatedCredits: selectedAssets.reduce(
          (sum, asset) => sum + 15 + (asset.kind === 'npc' ? 5 + 3 : 0),
          0,
        ),
        excludedZombieSourceCount: 10,
        targetFaceCount: TARGET_FACE_COUNT,
      },
      null,
      2,
    ),
  )
  process.exit(0)
}

await mkdir(publicRoot, { recursive: true })
const state = await readState()
state.schemaVersion = 1
state.targetFaceCount = TARGET_FACE_COUNT
state.textureResolution = '2k'
state.assets ??= {}

await runPool(sourceInspections, concurrency, async (source) => {
  await generateAsset(source, state)
  await persistState(state)
})

await optimizeIslandAmbientRuntimeAssets({
  assets: selectedAssets,
  concurrency: textureConcurrency,
  force,
  persistState,
  publicDirectory,
  sourceDirectory: pristineSourceDirectory,
  state,
})
state.runtimeTextureOptimization = ISLAND_AMBIENT_TEXTURE_OPTIMIZER
state.generatedAt = new Date().toISOString()
await persistState(state)
await persistManifest(state)
console.log(`Meshy island ambient pipeline complete: ${selectedAssets.length} assets.`)

async function inspectSource(asset) {
  if (asset.sourceFile.includes('_zombie')) {
    throw new Error(`Zombie source images are excluded: ${asset.sourceFile}`)
  }
  const canonicalPath = resolve(
    dirname(islandAmbientPristineSourcePath(asset, 'model', pristineSourceDirectory)),
    'source.png',
  )
  let path = canonicalPath
  let body
  try {
    body = await readFile(canonicalPath)
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error
    path = resolve(sourceRoot, asset.sourceFile)
    body = await readFile(path)
  }
  if (
    body.byteLength < 24 ||
    body.readUInt32BE(0) !== 0x89504e47 ||
    body.readUInt32BE(4) !== 0x0d0a1a0a
  ) {
    throw new Error(`${path} is not a valid PNG source image.`)
  }
  return { asset, body, byteLength: body.byteLength, path, sha256: sha256(body) }
}

async function generateAsset(source, pipelineState) {
  const { asset } = source
  const record = (pipelineState.assets[asset.id] ??= { id: asset.id })
  const assetFingerprint = fingerprint({
    ...asset,
    sourceSha256: source.sha256,
    targetFaceCount: TARGET_FACE_COUNT,
  })
  if (force || record.assetFingerprint !== assetFingerprint) invalidateGenerationRecord(record)
  Object.assign(record, {
    assetFingerprint,
    id: asset.id,
    kind: asset.kind,
    name: asset.name,
    sourceByteLength: source.byteLength,
    sourceFile: asset.sourceFile,
    sourceSha256: source.sha256,
    targetFaceCount: TARGET_FACE_COUNT,
    targetSizeMeters: asset.targetSizeMeters ?? asset.heightMeters,
  })

  const outputRoot = outputDirectoryByKind[asset.kind]
  if (!outputRoot) throw new Error(`Unknown asset kind: ${asset.kind}`)
  const outputDirectory = resolve(publicRoot, outputRoot, asset.id)
  await mkdir(outputDirectory, { recursive: true })
  const previewPath = resolve(
    dirname(islandAmbientPristineSourcePath(asset, 'model', pristineSourceDirectory)),
    'source.png',
  )
  await atomicWrite(previewPath, source.body)
  record.sourcePath = islandAmbientPristineSourceReference(previewPath)

  console.log(`[${asset.id}] image-to-3d`)
  const generated = await ensureTask({
    endpoint: '/v1/image-to-3d',
    payload: createImageTo3dPayload(asset, source.body),
    payloadFingerprint: createImageTo3dFingerprint(asset, source.sha256),
    record,
    taskKey: 'imageTaskId',
  })
  if (!generated.model_urls?.glb) {
    throw new Error(`[${asset.id}] image-to-3d task did not return a GLB URL.`)
  }

  const modelPath = resolve(outputDirectory, 'model.glb')
  const modelSourcePath = islandAmbientPristineSourcePath(
    asset,
    'model',
    pristineSourceDirectory,
  )
  await download(generated.model_urls.glb, modelSourcePath, {
    artifactKey: 'model',
    record,
    taskId: generated.id,
  })
  const modelInspection = await inspectGeneratedOutput(modelSourcePath)
  record.outputs = asset.kind === 'npc' ? {} : { model: publicUrl(modelPath) }
  record.validation = { model: modelInspection }

  if (asset.kind !== 'npc') {
    console.log(`[${asset.id}] ${record.validation.model.triangleCount} triangles`)
    return
  }

  console.log(`[${asset.id}] rig + walk + run`)
  const rigged = await ensureTask({
    endpoint: '/v1/rigging',
    payload: { height_meters: asset.heightMeters, input_task_id: generated.id },
    record,
    taskKey: 'rigTaskId',
  })
  const rigResult = rigged.result
  const runtimePaths = {
    rigged: resolve(outputDirectory, 'rigged.glb'),
  }
  const sourcePaths = {
    idle: islandAmbientPristineSourcePath(asset, 'idle', pristineSourceDirectory),
    rigged: islandAmbientPristineSourcePath(asset, 'rigged', pristineSourceDirectory),
    run: islandAmbientPristineSourcePath(asset, 'run', pristineSourceDirectory),
    walk: islandAmbientPristineSourcePath(asset, 'walk', pristineSourceDirectory),
  }
  const walkUrl = rigResult?.basic_animations?.walking_glb_url
  const runUrl = rigResult?.basic_animations?.running_glb_url
  if (!rigResult?.rigged_character_glb_url || !walkUrl || !runUrl) {
    throw new Error(`[${asset.id}] rigging task did not return rigged, walk, and run GLBs.`)
  }

  console.log(`[${asset.id}] idle animation`)
  const idle = await ensureTask({
    endpoint: '/v1/animations',
    payload: { action_id: IDLE_ACTION_ID, rig_task_id: rigged.id },
    record,
    taskKey: 'idleTaskId',
  })
  const idleUrl = idle.result?.animation_glb_url
  if (!idleUrl) throw new Error(`[${asset.id}] idle animation task did not return a GLB URL.`)

  await Promise.all([
    download(rigResult.rigged_character_glb_url, sourcePaths.rigged, {
      artifactKey: 'rigged',
      record,
      taskId: rigged.id,
    }),
    download(walkUrl, sourcePaths.walk, {
      artifactKey: 'walk',
      record,
      taskId: rigged.id,
    }),
    download(runUrl, sourcePaths.run, {
      artifactKey: 'run',
      record,
      taskId: rigged.id,
    }),
    download(idleUrl, sourcePaths.idle, {
      artifactKey: 'idle',
      record,
      taskId: idle.id,
    }),
  ])
  const animationPaths = {
    idleAnimation: resolve(outputDirectory, 'idle.anim.glb'),
    runAnimation: resolve(outputDirectory, 'run.anim.glb'),
    walkAnimation: resolve(outputDirectory, 'walk.anim.glb'),
  }
  await Promise.all([
    writeAnimationOnlyGlb(sourcePaths.idle, animationPaths.idleAnimation),
    writeAnimationOnlyGlb(sourcePaths.run, animationPaths.runAnimation),
    writeAnimationOnlyGlb(sourcePaths.walk, animationPaths.walkAnimation),
  ])
  record.outputs = {
    rigged: publicUrl(runtimePaths.rigged),
    ...Object.fromEntries(
      Object.entries(animationPaths).map(([key, path]) => [key, publicUrl(path)]),
    ),
  }
  record.validation = {
    model: modelInspection,
    ...Object.fromEntries(
      await Promise.all(
        Object.entries(sourcePaths).map(async ([key, path]) => [key, await inspectGeneratedOutput(path)]),
      ),
    ),
    ...Object.fromEntries(
      await Promise.all(
        Object.entries(animationPaths).map(async ([key, path]) => [key, await inspectGlb(path)]),
      ),
    ),
  }
  console.log(
    `[${asset.id}] ${record.validation.rigged.triangleCount} triangles; idle/walk/run present`,
  )
}

function createImageTo3dPayload(asset, sourceBody) {
  return {
    ai_model: 'meshy-t2',
    enable_pbr: true,
    image_url: `data:image/png;base64,${sourceBody.toString('base64')}`,
    model_type: 'smart-topology',
    pose_mode: asset.kind === 'npc' ? 'a-pose' : '',
    should_texture: true,
    target_formats: ['glb'],
    target_polycount: TARGET_FACE_COUNT,
    texture_resolution: '2k',
  }
}

function createImageTo3dFingerprint(asset, sourceSha256) {
  return {
    ai_model: 'meshy-t2',
    enable_pbr: true,
    imageSha256: sourceSha256,
    model_type: 'smart-topology',
    pose_mode: asset.kind === 'npc' ? 'a-pose' : '',
    should_texture: true,
    target_formats: ['glb'],
    target_polycount: TARGET_FACE_COUNT,
    texture_resolution: '2k',
  }
}

async function ensureTask({ endpoint, payload, payloadFingerprint = payload, record, taskKey }) {
  const fingerprintKey = `${taskKey}Fingerprint`
  const taskFingerprint = fingerprint({ endpoint, payload: payloadFingerprint })
  let id = record[taskKey]
  if (record[fingerprintKey] !== taskFingerprint) {
    clearTaskRecord(record, taskKey)
    invalidateGeneratedOutputs(record)
    id = null
  }
  if (!id) {
    const created = await requestJson(endpoint, { body: payload, method: 'POST' })
    id = created.result
    if (!id) throw new Error(`Meshy did not return a task id for ${taskKey}.`)
    record[taskKey] = id
    record[fingerprintKey] = taskFingerprint
    invalidateGeneratedOutputs(record)
    await persistState(state)
  }
  const task = await waitForTask(endpoint, id)
  record[`${taskKey}Status`] = task.status
  record[`${taskKey}Credits`] = task.consumed_credits ?? null
  if (task.status !== 'SUCCEEDED') {
    throw new Error(`Meshy task ${id} ${task.status}: ${task.task_error?.message ?? 'unknown error'}`)
  }
  return task
}

async function waitForTask(endpoint, id) {
  let lastProgress = -1
  for (;;) {
    const task = await requestJson(`${endpoint}/${id}`)
    if (task.progress !== lastProgress) {
      lastProgress = task.progress
      console.log(`  ${id.slice(0, 8)} ${task.status} ${task.progress ?? 0}%`)
    }
    if (TERMINAL_STATUSES.has(task.status)) return task
    await delay(6_000)
  }
}

async function requestJson(path, options = {}) {
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const response = await fetch(`${API_BASE}${path}`, {
      method: options.method ?? 'GET',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      },
      body: options.body ? JSON.stringify(options.body) : undefined,
    })
    if (response.ok) return response.json()
    const message = await response.text()
    if ((response.status === 429 || response.status >= 500) && attempt < 5) {
      await delay(2_000 * 2 ** attempt)
      continue
    }
    throw new Error(`Meshy ${response.status} ${path}: ${message}`)
  }
  throw new Error(`Meshy request retries exhausted for ${path}.`)
}

async function download(url, destination, { artifactKey, record, taskId }) {
  const expectedPath = artifactReference(destination)
  const artifact = record.artifacts?.[artifactKey]
  if (!force && artifact?.path === expectedPath && artifact.taskId === taskId) {
    try {
      const existing = await readFile(destination)
      const existingHash = sha256(existing)
      if (existing.byteLength === artifact.byteLength && existingHash === artifact.sha256) {
        return { current: true }
      }
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error
    }
  }
  const response = await fetch(url)
  if (!response.ok) throw new Error(`Download failed (${response.status}) for ${destination}.`)
  const body = Buffer.from(await response.arrayBuffer())
  if (body.byteLength <= 20) throw new Error(`Download was empty for ${destination}.`)
  await mkdir(dirname(destination), { recursive: true })
  await atomicWrite(destination, body)
  record.artifacts ??= {}
  record.artifacts[artifactKey] = {
    byteLength: body.byteLength,
    path: expectedPath,
    sha256: sha256(body),
    ...(isPristineSourcePath(destination) ? { sourcePath: expectedPath } : {}),
    taskId,
  }
  if (record.runtimeArtifacts) delete record.runtimeArtifacts[artifactKey]
  return { current: false }
}

async function inspectGeneratedOutput(path) {
  return inspectGlb(path)
}

async function readState() {
  try {
    return JSON.parse(await readFile(statePath, 'utf8'))
  } catch (error) {
    if (error?.code === 'ENOENT') return { assets: {} }
    throw new Error(`Could not read Meshy pipeline state at ${statePath}.`, { cause: error })
  }
}

async function persistState(value) {
  const snapshot = `${JSON.stringify(value, null, 2)}\n`
  persistQueue = persistQueue.then(() => atomicWrite(statePath, snapshot))
  return persistQueue
}

async function persistManifest(pipelineState) {
  const manifest = {
    generatedAt: pipelineState.generatedAt,
    targetFaceCount: TARGET_FACE_COUNT,
    textureResolution: '2k',
    runtimeTextures: ISLAND_AMBIENT_TEXTURE_OPTIMIZER,
    assets: assets.map((asset) => {
      const record = pipelineState.assets[asset.id]
      return {
        id: asset.id,
        kind: asset.kind,
        name: asset.name,
        outputs: record?.outputs ?? null,
        sourceFile: asset.sourceFile,
        targetSizeMeters: asset.targetSizeMeters ?? asset.heightMeters,
        triangleCount: record?.validation?.rigged?.triangleCount ?? record?.validation?.model?.triangleCount ?? null,
      }
    }),
  }
  await atomicWrite(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`)
}

function invalidateGenerationRecord(record) {
  for (const taskKey of ['imageTaskId', 'rigTaskId', 'idleTaskId']) clearTaskRecord(record, taskKey)
  invalidateGeneratedOutputs(record)
}

function clearTaskRecord(record, taskKey) {
  delete record[taskKey]
  delete record[`${taskKey}Credits`]
  delete record[`${taskKey}Fingerprint`]
  delete record[`${taskKey}Status`]
}

function invalidateGeneratedOutputs(record) {
  delete record.artifacts
  delete record.outputs
  delete record.runtimeArtifacts
  delete record.validation
}

function fingerprint(value) {
  return sha256(stableSerialize(value))
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

async function atomicWrite(destination, value) {
  await mkdir(dirname(destination), { recursive: true })
  const temporaryPath = `${destination}.${process.pid}.${randomUUID()}.tmp`
  await writeFile(temporaryPath, value)
  try {
    await rename(temporaryPath, destination)
  } catch (error) {
    if (!['EEXIST', 'ENOTEMPTY', 'EPERM'].includes(error?.code)) throw error
    await copyFile(temporaryPath, destination)
    await rm(temporaryPath)
  }
}

async function runPool(items, limit, worker) {
  const queue = [...items]
  const failures = []
  await Promise.all(
    Array.from({ length: Math.min(limit, queue.length) }, async () => {
      for (;;) {
        const item = queue.shift()
        if (!item) return
        try {
          await worker(item)
        } catch (error) {
          failures.push({ id: item.asset.id, error })
          console.error(`[${item.asset.id}] ${error instanceof Error ? error.message : error}`)
        }
      }
    }),
  )
  if (failures.length > 0) {
    throw new AggregateError(
      failures.map(({ error }) => error),
      `${failures.length} Meshy asset pipelines failed: ${failures.map(({ id }) => id).join(', ')}`,
    )
  }
}

function publicUrl(path) {
  return `/${path.slice(resolve(import.meta.dirname, '../public').length + 1).replaceAll('\\', '/')}`
}

function artifactReference(path) {
  if (isPristineSourcePath(path)) {
    return islandAmbientPristineSourceReference(path)
  }
  return publicUrl(path)
}

function isPristineSourcePath(path) {
  const fromRoot = relative(pristineSourceDirectory, path)
  return fromRoot !== '..' && !fromRoot.startsWith(`..${sep}`) && !isAbsolute(fromRoot)
}

function selectKinds() {
  const flags = [
    ['--boats', 'boat'],
    ['--palms', 'palm'],
    ['--fish', 'fish'],
    ['--npcs', 'npc'],
  ].filter(([flag]) => process.argv.includes(flag))
  return flags.length > 0
    ? new Set(flags.map(([, kind]) => kind))
    : new Set(['boat', 'palm', 'fish', 'npc'])
}

function readNumberArgument(name, fallback) {
  const prefix = `${name}=`
  const argument = process.argv.find((value) => value.startsWith(prefix))
  if (!argument) return fallback
  const parsed = Number(argument.slice(prefix.length))
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 10) {
    throw new Error(`${name} must be an integer from 1 to 10.`)
  }
  return parsed
}

function readListArgument(name) {
  const prefix = `${name}=`
  const argument = process.argv.find((value) => value.startsWith(prefix))
  if (!argument) return null
  const values = argument
    .slice(prefix.length)
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean)
  if (values.length === 0) throw new Error(`${name} must contain at least one id.`)
  return new Set(values)
}

function delay(milliseconds) {
  return new Promise((resolveDelay) => setTimeout(resolveDelay, milliseconds))
}
