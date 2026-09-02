import { createHash, randomUUID } from 'node:crypto'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { inspectGlb } from './landrush-glb-audit.mjs'
import {
  optimizeZombieEscapeWeaponRuntimeAssets,
  zombieEscapeWeaponSourcePath,
  zombieEscapeWeaponSourceReference,
} from './zombie-escape-weapon-glb-optimizer.mjs'
import {
  optimizeZombieEscapeZombieRuntimeAssets,
  zombieEscapeZombieSourcePath,
  zombieEscapeZombieSourceReference,
} from './zombie-escape-zombie-glb-optimizer.mjs'

const API_BASE = 'https://api.meshy.ai/openapi'
const TARGET_FACE_COUNT = 3_000
const TERMINAL_STATUSES = new Set(['SUCCEEDED', 'FAILED', 'CANCELED'])
const apiKey = process.env.MESHY_API_KEY
const publicDirectory = resolve(import.meta.dirname, '../public')
const publicRoot = resolve(publicDirectory, 'landrush-lab/zombie-escape/assets')
const statePath = resolve(publicRoot, 'meshy-generation.json')
let persistQueue = Promise.resolve()
const concurrency = readNumberArgument('--concurrency', 3)
const force = process.argv.includes('--force')
const dryRun = process.argv.includes('--dry-run')
const migrateOnly = process.argv.includes('--migrate-only')
const selectedKinds = process.argv.includes('--weapons')
  ? new Set(['weapon'])
  : process.argv.includes('--zombies')
    ? new Set(['zombie'])
    : new Set(['weapon', 'zombie'])
const requestedIds = readListArgument('--ids')

if (!apiKey && !dryRun && !migrateOnly) {
  throw new Error('MESHY_API_KEY is required. Keep it in the environment; never commit it.')
}

const assets = [
  {
    id: 'sunflare-pistol',
    kind: 'weapon',
    name: 'Sunflare Pistol',
    heightMeters: 0.24,
    prompt:
      'Single compact cartoony solar-energy sidearm, chunky readable silhouette, short orange ceramic barrel shroud, teal grip, brass power cell, friendly island rescue technology, barrel pointing toward +Z and grip downward along -Y, centered as one watertight game-ready mesh, no hands, no character, no stand, no floating parts, clean bevels, target 3000 faces.',
    texturePrompt:
      'Stylized hand-painted PBR: warm orange ceramic, teal rubber grip, brushed brass accents, dark charcoal seams, subtle edge wear, no baked lighting, no labels, clean readable game asset.',
  },
  {
    id: 'reef-carbine',
    kind: 'weapon',
    name: 'Reef Carbine',
    heightMeters: 0.34,
    prompt:
      'Single cartoony compact energy carbine for a tropical island defender, strong two-handed silhouette, coral-red receiver, aqua barrel fins, dark stock, barrel pointing toward +Z, pistol grip downward along -Y, one watertight game-ready mesh, no hands, no character, no sling, no stand, no detached pieces, clean bevels, target 3000 faces.',
    texturePrompt:
      'Stylized hand-painted PBR: coral red receiver, aqua cooling fins, matte charcoal stock, pale ivory details, restrained scratches, no baked lighting, no text, crisp material separation.',
  },
  {
    id: 'driftwood-scattergun',
    kind: 'weapon',
    name: 'Driftwood Scattergun',
    heightMeters: 0.38,
    prompt:
      'Single chunky cartoony short scattergun assembled from driftwood and marine steel, wide muzzle, readable pump and two-handed grip, barrel pointing toward +Z, grip downward along -Y, one watertight game-ready mesh, no hands, no character, no strap, no stand, no detached shells, clean simplified forms, target 3000 faces.',
    texturePrompt:
      'Stylized hand-painted PBR: honey driftwood stock and pump, desaturated marine steel, turquoise tape wraps, brass fasteners, mild salt wear, no baked lighting, no text.',
  },
  {
    id: 'storm-coil-repeater',
    kind: 'weapon',
    name: 'Storm-Coil Repeater',
    heightMeters: 0.32,
    prompt:
      'Single cartoony rapid-fire storm coil repeater, compact two-handed sci-fi weapon, circular copper coils around a navy receiver, bright cyan energy channel, barrel pointing toward +Z, grip downward along -Y, one watertight game-ready mesh, no hands, no character, no cable, no stand, no floating parts, target 3000 faces.',
    texturePrompt:
      'Stylized hand-painted PBR: navy painted metal, copper coils, cyan emissive channel, matte black grip, subtle rain wear, no baked lighting, no lettering, clean bold color blocks.',
  },
  {
    id: 'tidebreak-launcher',
    kind: 'weapon',
    name: 'Tidebreak Launcher',
    heightMeters: 0.42,
    prompt:
      'Single cartoony shoulder-mounted rescue projectile launcher, broad cylindrical barrel and compact rear brace, white and red coast-guard palette, barrel pointing toward +Z, grip downward along -Y, one watertight game-ready mesh, no hands, no character, no projectile, no strap, no stand, no detached parts, target 3000 faces.',
    texturePrompt:
      'Stylized hand-painted PBR: warm white shell, rescue red bands, navy rubber grips, brushed steel muzzle, tiny amber indicator glow, no baked lighting, no text, minimal wear.',
  },
  {
    id: 'dockworker',
    kind: 'zombie',
    name: 'Dockworker Zombie',
    heightMeters: 1.82,
    prompt:
      'Single full-body cartoony undead dockworker in neutral A-pose, standard biped with clearly separated arms and legs, believable seven-head-tall adult proportions, broad shoulders, work vest fused close to body, boots, face and torso toward +Z, feet flat, symmetrical one watertight game-ready mesh, no props, no base, no gore, no detached clothing, target 3000 faces, suitable for auto-rigging.',
    texturePrompt:
      'Stylized hand-painted PBR: muted sea-green skin, orange work vest, navy trousers, brown boots, tired friendly-undead face, clean color blocks, no blood, no gore, no baked lighting.',
  },
  {
    id: 'lifeguard',
    kind: 'zombie',
    name: 'Lifeguard Zombie',
    heightMeters: 1.76,
    prompt:
      'Single full-body cartoony undead adult human lifeguard in neutral A-pose, ordinary human head with short hair and round ears, realistic anatomy exactly seven-and-a-half heads tall, normal hands, long athletic legs, clearly separated limbs, fitted shirt, shorts and intact sneakers, face and torso toward +Z, feet flat, symmetrical one watertight game-ready mesh, no horns, antlers, animal or fantasy traits, props, base, or gore, target 3000 faces, suitable for auto-rigging.',
    texturePrompt:
      'Stylized hand-painted PBR: sun-faded red shirt, cream shorts, teal-gray skin, white shoes, slightly sunburned cartoon face, no logos, no blood, no baked lighting.',
  },
  {
    id: 'island-gardener',
    kind: 'zombie',
    name: 'Island Gardener Zombie',
    heightMeters: 1.7,
    prompt:
      'Single full-body cartoony undead adult island gardener in neutral A-pose, realistic human anatomy exactly seven-and-a-half heads tall, normal-size head and hands, arms ending at mid-thigh, legs half the body height, clearly separated limbs, fitted overalls, face and torso toward +Z, feet flat, one watertight game-ready mesh, no goggles, hat, tools, props, base, or gore, target 3000 faces, suitable for auto-rigging.',
    texturePrompt:
      'Stylized hand-painted PBR: moss-green overalls, pale yellow shirt, lavender-gray skin, brown work shoes, soil smudges without gore, no baked lighting, crisp readable features.',
  },
  {
    id: 'tourist',
    kind: 'zombie',
    name: 'Tourist Zombie',
    heightMeters: 1.74,
    prompt:
      'Single full-body cartoony undead island tourist in neutral A-pose, standard biped with clearly separated arms and legs, believable seven-head-tall average adult proportions, short-sleeve tropical shirt and shorts fitted close to body, face and torso toward +Z, feet flat, symmetrical one watertight game-ready mesh, no camera, no bag, no hat, no base, no gore, target 3000 faces, suitable for auto-rigging.',
    texturePrompt:
      'Stylized hand-painted PBR: turquoise tropical shirt with simple coral leaf pattern, tan shorts, pale green-gray skin, canvas shoes, no text, no blood, no baked lighting.',
  },
  {
    id: 'marina-mechanic',
    kind: 'zombie',
    name: 'Marina Mechanic Zombie',
    heightMeters: 2.14,
    prompt:
      'Single full-body stylized cartoon Frankenstein-like zombie brute in neutral A-pose, hulking six-head-tall monster proportions, enormous rectangular torso, slab shoulders twice head width, thick neck, massive arms, oversized hands, thick thighs and calves, heavy boots, flat-topped head, clearly separated arms and legs with arms far from torso, patched coveralls fitted close, face and torso toward +Z, feet flat, symmetrical watertight game-ready mesh, no tools, props, base, detached parts, blood, or gore, target 3000 faces, suitable for auto-rigging.',
    runtimeBody: 'dedicated-meshy',
    texturePrompt:
      'Stylized hand-painted PBR: storm-gray green skin, dark navy patched coveralls, muted mustard undershirt, charcoal oversized boots, subtle purple stitched seams and small metal neck fasteners, clean readable color blocks, no blood, no text, no baked lighting.',
  },
  {
    id: 'beach-courier',
    kind: 'zombie',
    name: 'Beach Courier Zombie',
    heightMeters: 1.79,
    prompt:
      'Single full-body cartoony undead beach courier in neutral A-pose, standard biped with clearly separated limbs, believable seven-head-tall lean adult proportions, fitted windbreaker and cargo trousers, face and torso toward +Z, feet flat, symmetrical one watertight game-ready mesh, no backpack, no parcel, no helmet, no base, no gore, target 3000 faces, suitable for auto-rigging.',
    texturePrompt:
      'Stylized hand-painted PBR: bright yellow windbreaker, violet cargo trousers, desaturated mint skin, dark trainers, subtle fabric wear, no blood, no logos, no baked lighting.',
  },
  {
    id: 'boardwalk-chef',
    kind: 'zombie',
    name: 'Boardwalk Chef Zombie',
    heightMeters: 1.88,
    prompt:
      'Single full-body stylized cartoon zombie chef with an obese pear-shaped body in neutral A-pose, enormous spherical belly wider than shoulders and projecting forward and sideways, barrel chest, very thick waist and hips, thick arms and thighs, short sturdy legs, small head, clearly separated arms and legs with arms far from belly, double-breasted jacket and apron fitted close, face and torso toward +Z, feet flat, symmetrical watertight game-ready mesh, no hat, utensil, props, base, detached clothing, blood, or gore, target 3000 faces, suitable for auto-rigging.',
    runtimeBody: 'dedicated-meshy',
    texturePrompt:
      'Stylized hand-painted PBR: cream cook jacket stretched over a large round belly, tomato-red apron, soft blue-gray skin, dark checked trousers, warm brown shoes, broad readable color blocks, harmless fabric wear, no blood, no text, no baked lighting.',
  },
  {
    id: 'island-ranger',
    kind: 'zombie',
    name: 'Island Ranger Zombie',
    heightMeters: 1.83,
    prompt:
      'Single full-body cartoony undead island ranger in neutral A-pose, standard biped with clearly separated limbs, believable seven-head-tall fit adult proportions, short-sleeve uniform and utility trousers fitted close to body, face and torso toward +Z, feet flat, symmetrical one watertight game-ready mesh, no hat, no radio, no weapon, no base, no gore, target 3000 faces, suitable for auto-rigging.',
    texturePrompt:
      'Stylized hand-painted PBR: forest green uniform, sandy utility trousers, muted purple-gray skin, brown trail boots, no badge text, no blood, no baked lighting.',
  },
  {
    id: 'resort-clerk',
    kind: 'zombie',
    name: 'Resort Clerk Zombie',
    heightMeters: 1.72,
    prompt:
      'Single full-body cartoony undead adult resort clerk in neutral A-pose, realistic human anatomy exactly seven-and-a-half heads tall, normal-size head and hands, long legs half the body height, clearly separated limbs, neat fitted vest and rolled-sleeve shirt, face and torso toward +Z, feet flat, symmetrical one watertight game-ready mesh, no bald oversized head, tray, tag, props, base, or gore, target 3000 faces, suitable for auto-rigging.',
    texturePrompt:
      'Stylized hand-painted PBR: plum vest, pale aqua shirt, charcoal trousers, soft sage skin, polished dark shoes, no lettering, no blood, no baked lighting.',
  },
  {
    id: 'old-sailor',
    kind: 'zombie',
    name: 'Old Sailor Zombie',
    heightMeters: 1.73,
    prompt:
      'Single full-body cartoony undead old sailor in neutral A-pose, standard biped with clearly separated limbs, believable seven-head-tall older adult proportions, striped knit shirt and loose trousers kept close to body, face and torso toward +Z, feet flat, symmetrical one watertight game-ready mesh, no hat, no pipe, no rope, no base, no gore, target 3000 faces, suitable for auto-rigging.',
    texturePrompt:
      'Stylized hand-painted PBR: cream and navy striped shirt, weathered red trousers, desaturated teal-gray skin, brown deck shoes, no blood, no text, no baked lighting.',
  },
]

const selectedAssets = assets.filter(
  (asset) => selectedKinds.has(asset.kind) && (!requestedIds || requestedIds.has(asset.id)),
)
if (requestedIds) {
  const unknownIds = [...requestedIds].filter((id) => !assets.some((asset) => asset.id === id))
  if (unknownIds.length > 0) throw new Error(`Unknown asset ids: ${unknownIds.join(', ')}`)
}
if (dryRun) {
  console.log(
    JSON.stringify(
      {
        assets: selectedAssets.map(({ id, kind, name, prompt }) => ({
          id,
          kind,
          name,
          promptCharacters: prompt.length,
        })),
        concurrency,
        estimatedCredits: selectedAssets.reduce(
          (sum, asset) => sum + 5 + 10 + (asset.kind === 'zombie' ? 5 : 0),
          0,
        ),
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
const allowLegacyFingerprintAdoption = (state.schemaVersion ?? 1) < 2
state.targetFaceCount = TARGET_FACE_COUNT
state.textureResolution = '2k'
state.generatedAt = state.generatedAt ?? null
state.assets = state.assets ?? {}
if (allowLegacyFingerprintAdoption) await migrateLegacyState(state)
state.schemaVersion = 2

if (migrateOnly) {
  await persistState(state)
  console.log('Meshy pipeline state migrated without creating or polling tasks.')
  process.exit(0)
}

await runPool(selectedAssets, concurrency, async (asset) => {
  await generateAsset(asset, state)
  await persistState(state)
})

const selectedDedicatedZombieIds = selectedAssets
  .filter(({ kind, runtimeBody }) => kind === 'zombie' && runtimeBody === 'dedicated-meshy')
  .map(({ id }) => id)
if (selectedDedicatedZombieIds.length > 0) {
  await optimizeZombieEscapeZombieRuntimeAssets({
    force,
    ids: selectedDedicatedZombieIds,
    persistState,
    publicDirectory,
    state,
  })
}

const selectedWeaponIds = selectedAssets
  .filter(({ kind }) => kind === 'weapon')
  .map(({ id }) => id)
if (selectedWeaponIds.length > 0) {
  await optimizeZombieEscapeWeaponRuntimeAssets({
    force,
    ids: selectedWeaponIds,
    persistState,
    publicDirectory,
    state,
  })
}

state.generatedAt = new Date().toISOString()
await persistState(state)
console.log(`Meshy pipeline complete: ${selectedAssets.length} assets.`)

async function generateAsset(asset, pipelineState) {
  const record = (pipelineState.assets[asset.id] ??= { id: asset.id })
  const assetFingerprint = assetGenerationFingerprint(asset)
  if (
    force ||
    (!allowLegacyFingerprintAdoption && record.assetFingerprint !== assetFingerprint)
  ) {
    invalidateGenerationRecord(record)
  }
  Object.assign(record, {
    assetFingerprint,
    id: asset.id,
    kind: asset.kind,
    name: asset.name,
    prompt: asset.prompt,
    texturePrompt: asset.texturePrompt,
    targetFaceCount: TARGET_FACE_COUNT,
  })
  const outputDirectory =
    asset.kind === 'weapon'
      ? resolve(publicRoot, 'weapons')
      : resolve(publicRoot, 'zombies', asset.id)
  await mkdir(outputDirectory, { recursive: true })

  console.log(`[${asset.id}] preview`)
  const preview = await ensureTask({
    endpoint: '/v2/text-to-3d',
    payload: createPreviewPayload(asset),
    record,
    taskKey: 'previewTaskId',
  })

  console.log(`[${asset.id}] texture`)
  const refined = await ensureTask({
    endpoint: '/v2/text-to-3d',
    payload: createRefinePayload(asset, preview.id),
    record,
    taskKey: 'refineTaskId',
  })

  if (!refined.model_urls?.glb) {
    throw new Error(`[${asset.id}] refined task did not return a GLB URL.`)
  }

  if (asset.kind === 'weapon') {
    const modelPath = zombieEscapeWeaponSourcePath(asset.id)
    const runtimeModelPath = resolve(publicRoot, 'weapons', `${asset.id}.glb`)
    const previewPath = resolve(publicRoot, 'weapons', 'previews', `${asset.id}.png`)
    await download(refined.model_urls.glb, modelPath, {
      artifactPath: zombieEscapeWeaponSourceReference(modelPath),
      artifactKey: 'model',
      record,
      taskId: refined.id,
    })
    await downloadOptional(refined.alpha_thumbnail_url ?? refined.thumbnail_url, previewPath, {
      artifactKey: 'preview',
      record,
      taskId: refined.id,
    })
    record.outputs = {
      model: publicUrl(runtimeModelPath),
      preview: publicUrl(previewPath),
    }
    record.validation = { model: await inspectGlb(modelPath) }
    console.log(`[${asset.id}] ${record.validation.model.triangleCount} triangles`)
    return
  }

  console.log(`[${asset.id}] rig + basic locomotion`)
  const rigged = await ensureTask({
    endpoint: '/v1/rigging',
    payload: createRigPayload(asset, refined.id),
    record,
    taskKey: 'rigTaskId',
  })
  const result = rigged.result
  const dedicatedRuntime = asset.runtimeBody === 'dedicated-meshy'
  const runtimePaths = {
    rigged: resolve(outputDirectory, 'rigged.glb'),
    walk: resolve(outputDirectory, dedicatedRuntime ? 'walk.anim.glb' : 'walk.glb'),
    run: resolve(outputDirectory, dedicatedRuntime ? 'run.anim.glb' : 'run.glb'),
    preview: resolve(outputDirectory, 'preview.png'),
  }
  const sourcePaths = dedicatedRuntime
    ? {
        rigged: zombieEscapeZombieSourcePath(asset.id, 'rigged'),
        walk: zombieEscapeZombieSourcePath(asset.id, 'walk'),
        run: zombieEscapeZombieSourcePath(asset.id, 'run'),
      }
    : runtimePaths
  const walkUrl = result?.basic_animations?.walking_glb_url
  const runUrl = result?.basic_animations?.running_glb_url
  if (!result?.rigged_character_glb_url || !walkUrl || !runUrl) {
    throw new Error(`[${asset.id}] rigging task did not return rigged, walk, and run GLBs.`)
  }
  await Promise.all([
    download(result.rigged_character_glb_url, sourcePaths.rigged, {
      ...(dedicatedRuntime
        ? { artifactPath: zombieEscapeZombieSourceReference(sourcePaths.rigged) }
        : {}),
      artifactKey: 'rigged',
      record,
      taskId: rigged.id,
    }),
    download(walkUrl, sourcePaths.walk, {
      ...(dedicatedRuntime
        ? { artifactPath: zombieEscapeZombieSourceReference(sourcePaths.walk) }
        : {}),
      artifactKey: 'walk',
      record,
      taskId: rigged.id,
    }),
    download(runUrl, sourcePaths.run, {
      ...(dedicatedRuntime
        ? { artifactPath: zombieEscapeZombieSourceReference(sourcePaths.run) }
        : {}),
      artifactKey: 'run',
      record,
      taskId: rigged.id,
    }),
    downloadOptional(refined.alpha_thumbnail_url ?? refined.thumbnail_url, runtimePaths.preview, {
      artifactKey: 'preview',
      record,
      taskId: refined.id,
    }),
  ])
  record.outputs = Object.fromEntries(
    Object.entries(runtimePaths).map(([key, path]) => [key, publicUrl(path)]),
  )
  const sourceValidation = Object.fromEntries(
    await Promise.all(
      ['rigged', 'walk', 'run'].map(async (key) => [key, await inspectGlb(sourcePaths[key])]),
    ),
  )
  if (dedicatedRuntime) {
    record.sourceValidation = sourceValidation
    record.validation = {}
  } else {
    delete record.sourceValidation
    record.validation = sourceValidation
  }
  console.log(
    `[${asset.id}] ${sourceValidation.rigged.triangleCount} triangles; walk/run present`,
  )
}

async function migrateLegacyState(pipelineState) {
  for (const asset of assets) {
    const record = pipelineState.assets[asset.id]
    if (!record) continue
    Object.assign(record, {
      assetFingerprint: assetGenerationFingerprint(asset),
      id: asset.id,
      kind: asset.kind,
      name: asset.name,
      prompt: asset.prompt,
      targetFaceCount: TARGET_FACE_COUNT,
      texturePrompt: asset.texturePrompt,
    })

    if (record.previewTaskId) {
      record.previewTaskIdFingerprint = fingerprint({
        endpoint: '/v2/text-to-3d',
        payload: createPreviewPayload(asset),
      })
    }
    if (record.refineTaskId && record.previewTaskId) {
      record.refineTaskIdFingerprint = fingerprint({
        endpoint: '/v2/text-to-3d',
        payload: createRefinePayload(asset, record.previewTaskId),
      })
    }
    if (asset.kind === 'zombie' && record.rigTaskId && record.refineTaskId) {
      record.rigTaskIdFingerprint = fingerprint({
        endpoint: '/v1/rigging',
        payload: createRigPayload(asset, record.refineTaskId),
      })
    }

    if (asset.kind === 'weapon') {
      const modelPath = zombieEscapeWeaponSourcePath(asset.id)
      await adoptExistingArtifact(
        record,
        'model',
        modelPath,
        record.refineTaskId,
        zombieEscapeWeaponSourceReference(modelPath),
      )
      await adoptExistingArtifact(
        record,
        'preview',
        resolve(publicRoot, 'weapons', 'previews', `${asset.id}.png`),
        record.refineTaskId,
      )
      continue
    }

    const outputDirectory = resolve(publicRoot, 'zombies', asset.id)
    await Promise.all([
      adoptExistingArtifact(record, 'rigged', resolve(outputDirectory, 'rigged.glb'), record.rigTaskId),
      adoptExistingArtifact(record, 'walk', resolve(outputDirectory, 'walk.glb'), record.rigTaskId),
      adoptExistingArtifact(record, 'run', resolve(outputDirectory, 'run.glb'), record.rigTaskId),
      adoptExistingArtifact(
        record,
        'preview',
        resolve(outputDirectory, 'preview.png'),
        record.refineTaskId,
      ),
    ])
  }
}

async function adoptExistingArtifact(record, artifactKey, path, taskId, artifactPath = publicUrl(path)) {
  if (!taskId) return
  try {
    const body = await readFile(path)
    if (body.byteLength <= 20) return
    record.artifacts ??= {}
    record.artifacts[artifactKey] = {
      byteLength: body.byteLength,
      path: artifactPath,
      sha256: sha256(body),
      ...(artifactPath.startsWith('/') ? {} : { sourcePath: artifactPath }),
      taskId,
    }
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error
  }
}

function assetGenerationFingerprint(asset) {
  return fingerprint({
    heightMeters: asset.heightMeters,
    id: asset.id,
    kind: asset.kind,
    name: asset.name,
    prompt: asset.prompt,
    ...(asset.runtimeBody ? { runtimeBody: asset.runtimeBody } : {}),
    targetFaceCount: TARGET_FACE_COUNT,
    texturePrompt: asset.texturePrompt,
  })
}

function createPreviewPayload(asset) {
  return {
    ai_model: 'meshy-t2',
    alpha_thumbnail: true,
    mode: 'preview',
    model_type: 'smart-topology',
    pose_mode: asset.kind === 'zombie' ? 'a-pose' : '',
    prompt: asset.prompt,
    target_formats: ['glb'],
    target_polycount: TARGET_FACE_COUNT,
    topology: 'triangle',
  }
}

function createRefinePayload(asset, previewTaskId) {
  return {
    enable_pbr: true,
    mode: 'refine',
    preview_task_id: previewTaskId,
    target_formats: ['glb'],
    texture_prompt: asset.texturePrompt,
    texture_resolution: '2k',
  }
}

function createRigPayload(asset, refineTaskId) {
  return {
    height_meters: asset.heightMeters,
    input_task_id: refineTaskId,
  }
}

async function ensureTask({ endpoint, payload, record, taskKey }) {
  const taskFingerprintKey = `${taskKey}Fingerprint`
  const taskFingerprint = fingerprint({ endpoint, payload })
  let id = record[taskKey]
  const canAdoptLegacyTask =
    allowLegacyFingerprintAdoption && id && !record[taskFingerprintKey]

  if (canAdoptLegacyTask) {
    record[taskFingerprintKey] = taskFingerprint
  } else if (record[taskFingerprintKey] !== taskFingerprint) {
    clearTaskRecord(record, taskKey)
    invalidateGeneratedOutputs(record)
    id = null
  }

  if (!id) {
    const created = await requestJson(endpoint, { body: payload, method: 'POST' })
    id = created.result
    if (!id) throw new Error(`Meshy did not return a task id for ${taskKey}.`)
    record[taskKey] = id
    record[taskFingerprintKey] = taskFingerprint
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

async function download(
  url,
  destination,
  { artifactKey, artifactPath = publicUrl(destination), record, taskId },
) {
  const expectedPath = artifactPath
  const artifact = record.artifacts?.[artifactKey]
  if (!force && artifact?.path === expectedPath && artifact.taskId === taskId) {
    try {
      const existing = await readFile(destination)
      if (
        existing.byteLength === artifact.byteLength &&
        sha256(existing) === artifact.sha256
      ) {
        return
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
  const temporaryPath = `${destination}.${process.pid}.${randomUUID()}.tmp`
  await writeFile(temporaryPath, body)
  await rename(temporaryPath, destination)
  record.artifacts ??= {}
  record.artifacts[artifactKey] = {
    byteLength: body.byteLength,
    path: expectedPath,
    sha256: sha256(body),
    ...(expectedPath.startsWith('/') ? {} : { sourcePath: expectedPath }),
    taskId,
  }
}

async function downloadOptional(url, destination, options) {
  if (!url) return
  await download(url, destination, options)
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
  persistQueue = persistQueue.then(async () => {
    const temporaryPath = `${statePath}.${process.pid}.${randomUUID()}.tmp`
    await writeFile(temporaryPath, snapshot)
    await rename(temporaryPath, statePath)
  })
  return persistQueue
}

function invalidateGenerationRecord(record) {
  for (const taskKey of ['previewTaskId', 'refineTaskId', 'rigTaskId']) {
    clearTaskRecord(record, taskKey)
  }
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
  delete record.completedAt
  delete record.outputs
  delete record.runtimeArtifacts
  delete record.sourceValidation
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
          failures.push({ id: item.id, error })
          console.error(`[${item.id}] ${error instanceof Error ? error.message : error}`)
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
