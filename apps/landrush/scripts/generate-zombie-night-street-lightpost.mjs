import { createHash, randomUUID } from 'node:crypto'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { inspectGlb } from './landrush-glb-audit.mjs'

const API_BASE = 'https://api.meshy.ai/openapi'
const TARGET_FACE_COUNT = 3_000
const TERMINAL_STATUSES = new Set(['SUCCEEDED', 'FAILED', 'CANCELED'])
const apiKey = process.env.MESHY_API_KEY
const force = process.argv.includes('--force')
const sourceDirectory = resolve(
  import.meta.dirname,
  '../assets/zombie-escape-meshy-source/props/street-lightpost',
)
const modelPath = resolve(sourceDirectory, 'model.glb')
const previewPath = resolve(sourceDirectory, 'preview.png')
const statePath = resolve(sourceDirectory, 'meshy-generation.json')
const prompt =
  'Single freestanding low-poly tropical street lightpost for a stylized third-person game, upright along +Y with the center of its flat base at the world origin. Tall dark metal pole, one strong overhanging cantilever arm extending toward +Z, wide shallow downward-facing lamp shade at the arm end, and a visible glass lens aimed straight down. Clean readable silhouette, sturdy square base, no environment, no road, no ground plane, no cables, no text, no people, no extra props, no floating parts, one watertight game-ready object, target 3000 triangles.'
const texturePrompt =
  'Stylized hand-painted PBR: dark charcoal painted metal, subtle warm brass fasteners and restrained tropical salt weathering, warm amber glass lens, crisp material separation, no baked lighting, no labels, no text, no environment.'
const generationFingerprint = fingerprint({
  prompt,
  targetFaceCount: TARGET_FACE_COUNT,
  texturePrompt,
  textureResolution: '2k',
})

if (!apiKey) {
  throw new Error('MESHY_API_KEY is required. Keep it in the environment; never commit it.')
}

await mkdir(sourceDirectory, { recursive: true })
const state = await readState()
if (force || state.generationFingerprint !== generationFingerprint) {
  for (const key of [
    'previewTaskId',
    'previewTaskIdFingerprint',
    'previewTaskIdCredits',
    'previewTaskIdStatus',
    'refineTaskId',
    'refineTaskIdFingerprint',
    'refineTaskIdCredits',
    'refineTaskIdStatus',
    'artifacts',
    'completedAt',
    'sourceInspection',
  ]) {
    delete state[key]
  }
}
Object.assign(state, {
  aiModel: 'meshy-t2',
  generationFingerprint,
  id: 'street-lightpost',
  modelType: 'smart-topology',
  prompt,
  targetFaceCount: TARGET_FACE_COUNT,
  texturePrompt,
  textureResolution: '2k',
  topology: 'triangle',
})
await persistState(state)

console.log('[street-lightpost] Meshy preview')
const preview = await ensureTask({
  endpoint: '/v2/text-to-3d',
  payload: {
    ai_model: 'meshy-t2',
    alpha_thumbnail: true,
    mode: 'preview',
    model_type: 'smart-topology',
    pose_mode: '',
    prompt,
    target_formats: ['glb'],
    target_polycount: TARGET_FACE_COUNT,
    topology: 'triangle',
  },
  state,
  taskKey: 'previewTaskId',
})

console.log('[street-lightpost] Meshy PBR texture')
const refined = await ensureTask({
  endpoint: '/v2/text-to-3d',
  payload: {
    enable_pbr: true,
    mode: 'refine',
    preview_task_id: preview.id,
    target_formats: ['glb'],
    texture_prompt: texturePrompt,
    texture_resolution: '2k',
  },
  state,
  taskKey: 'refineTaskId',
})

if (!refined.model_urls?.glb) {
  throw new Error('Meshy refine task did not return a GLB URL.')
}
await download(refined.model_urls.glb, modelPath, 'model', refined.id)
await downloadOptional(
  refined.alpha_thumbnail_url ?? refined.thumbnail_url,
  previewPath,
  'preview',
  refined.id,
)
state.sourceInspection = await inspectGlb(modelPath)
state.completedAt = new Date().toISOString()
await persistState(state)
console.log(
  `[street-lightpost] source saved: ${state.sourceInspection.triangleCount} triangles, ${state.sourceInspection.imageCount} images`,
)

async function ensureTask({ endpoint, payload, state: taskState, taskKey }) {
  const taskFingerprintKey = `${taskKey}Fingerprint`
  const taskFingerprint = fingerprint({ endpoint, payload })
  let id = taskState[taskKey]
  if (taskState[taskFingerprintKey] !== taskFingerprint) {
    id = null
    delete taskState[taskKey]
    delete taskState[`${taskKey}Credits`]
    delete taskState[`${taskKey}Status`]
    taskState[taskFingerprintKey] = taskFingerprint
  }
  if (!id) {
    const created = await requestJson(endpoint, { body: payload, method: 'POST' })
    id = created.result
    if (!id) throw new Error(`Meshy did not return a task id for ${taskKey}.`)
    taskState[taskKey] = id
    await persistState(taskState)
  }
  const task = await waitForTask(endpoint, id)
  taskState[`${taskKey}Status`] = task.status
  taskState[`${taskKey}Credits`] = task.consumed_credits ?? null
  await persistState(taskState)
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
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 6_000))
  }
}

async function requestJson(path, options = {}) {
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const response = await fetch(`${API_BASE}${path}`, {
      body: options.body ? JSON.stringify(options.body) : undefined,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      },
      method: options.method ?? 'GET',
    })
    if (response.ok) return response.json()
    const message = await response.text()
    if ((response.status === 429 || response.status >= 500) && attempt < 5) {
      await new Promise((resolveDelay) => setTimeout(resolveDelay, 2_000 * 2 ** attempt))
      continue
    }
    throw new Error(`Meshy ${response.status} ${path}: ${message}`)
  }
  throw new Error(`Meshy request retries exhausted for ${path}.`)
}

async function download(url, destination, artifactKey, taskId) {
  const artifact = state.artifacts?.[artifactKey]
  if (!force && artifact?.taskId === taskId) {
    try {
      const existing = await readFile(destination)
      if (existing.byteLength === artifact.byteLength && sha256(existing) === artifact.sha256) {
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
  state.artifacts ??= {}
  state.artifacts[artifactKey] = {
    byteLength: body.byteLength,
    path: `assets/zombie-escape-meshy-source/props/street-lightpost/${destination === modelPath ? 'model.glb' : 'preview.png'}`,
    sha256: sha256(body),
    taskId,
  }
}

async function downloadOptional(url, destination, artifactKey, taskId) {
  if (url) await download(url, destination, artifactKey, taskId)
}

async function readState() {
  try {
    return JSON.parse(await readFile(statePath, 'utf8'))
  } catch (error) {
    if (error?.code === 'ENOENT') return { schemaVersion: 1 }
    throw error
  }
}

async function persistState(value) {
  const temporaryPath = `${statePath}.${process.pid}.${randomUUID()}.tmp`
  await writeFile(temporaryPath, `${JSON.stringify(value, null, 2)}\n`)
  await rename(temporaryPath, statePath)
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
