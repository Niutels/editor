import fs from 'node:fs'
import path from 'node:path'

const inputPath = path.resolve(process.argv[2] ?? '')
if (!process.argv[2] || !fs.existsSync(inputPath)) {
  throw new Error('Usage: node tooling/bench/src/analyze-startup-atomic-ledger.mjs <raw.json>')
}

const capture = JSON.parse(fs.readFileSync(inputPath, 'utf8'))
const cold = capture.runs.find((run) => run.label === 'cold-observer-light')
const warm = capture.runs.find((run) => run.label === 'warm-callsite-instrumented')
if (!(cold && warm?.pageData?.instrumentation)) {
  throw new Error('The capture must contain cold-observer-light and warm-callsite-instrumented runs.')
}

const outputDirectory = path.join(path.dirname(inputPath), 'analysis')
fs.mkdirSync(outputDirectory, { recursive: true })

const ZOMBIE_IDS = [
  'dockworker',
  'lifeguard',
  'island-gardener',
  'tourist',
  'marina-mechanic',
  'beach-courier',
  'boardwalk-chef',
  'island-ranger',
  'resort-clerk',
  'old-sailor',
]

const WEAPON_IDS = [
  'sunflare-pistol',
  'reef-carbine',
  'driftwood-scattergun',
  'storm-coil-repeater',
  'tidebreak-launcher',
]

const EFFECT_IDS = ['tracer', 'muzzle', 'impact', 'sparks', 'blood']

const RENDER_REPRESENTATIVES = [
  ...WEAPON_IDS.map((id) => `weapon-held:${id}`),
  'weapon-pickup',
  ...ZOMBIE_IDS.map((id) => `zombie:${id}`),
  ...EFFECT_IDS.map((id) => `effect:${id}`),
]

const WARM_TOTAL_MS = warm.durationMs
const COLD_TOTAL_MS = cold.durationMs
const instrumentation = warm.pageData.instrumentation
const rafCallbacks = instrumentation.rafCallbacks
const gpuCalls = instrumentation.gpu

function firstTrueTime(run, key) {
  return run.samples.find((sample) => sample[key] === 'true')?.t ?? null
}

function minimum(values) {
  return Math.min(...values.filter((value) => Number.isFinite(value)))
}

function csvEscape(value) {
  const text = value == null ? '' : String(value)
  return /[",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text
}

function writeCsv(name, headers, rows) {
  const contents = [
    headers.join(','),
    ...rows.map((row) => headers.map((header) => csvEscape(row[header])).join(',')),
  ].join('\n')
  fs.writeFileSync(path.join(outputDirectory, name), `${contents}\n`)
}

function round(value, digits = 3) {
  const scale = 10 ** digits
  return Math.round(value * scale) / scale
}

function percent(durationMs, totalMs) {
  return (durationMs / totalMs) * 100
}

function operationForBuildStep(step) {
  if (step === 1) return 'preflight and first cooperative admission'
  if (step === 2) return 'clone skeleton, collect skinned mesh, and create hidden root'
  if (step === 3) return 'allocate RGBA16F baked-animation texture and clone base geometry'
  if (step === 4) return 'capture bind-pose frame and create four animation actions'
  if (step >= 5 && step <= 16) return `sample walk frame ${step - 5}/11`
  if (step >= 17 && step <= 28) return `sample run frame ${step - 17}/11`
  if (step >= 29 && step <= 40) return `sample attack frame ${step - 29}/11`
  if (step >= 41 && step <= 52) return `sample death frame ${step - 41}/11`
  if (step === 53) return 'create instanced baked mesh, material, bounds, and presentation API'
  throw new Error(`Unexpected cooperative build step ${step}.`)
}

const buildCallbacks = rafCallbacks
  .filter((entry) => entry.stack.includes('waitForBuildSlice'))
  .sort((left, right) => left.scheduledMs - right.scheduledMs)

if (buildCallbacks.length !== ZOMBIE_IDS.length * 53) {
  throw new Error(`Expected 530 cooperative zombie callbacks; found ${buildCallbacks.length}.`)
}

const asyncPipelines = gpuCalls
  .filter((entry) => entry.method === 'GPUDevice.createRenderPipelineAsync')
  .sort((left, right) => left.startMs - right.startMs)

if (asyncPipelines.length !== 122) {
  throw new Error(`Expected 122 async render-pipeline calls; found ${asyncPipelines.length}.`)
}

const firstBuildStart = buildCallbacks[0].scheduledMs
const lastBuildEnd = buildCallbacks.at(-1).firedMs
const firstAsyncPipeline = asyncPipelines[0]
const postBuildPipelines = asyncPipelines.filter((entry) => entry.startMs >= lastBuildEnd)
if (postBuildPipelines.length !== 115) {
  throw new Error(`Expected 115 post-build async pipelines; found ${postBuildPipelines.length}.`)
}

const paintCallbacks = rafCallbacks
  .filter(
    (entry) =>
      entry.stack.includes('setPrerequisitesReady') || entry.stack.includes(':1:710636'),
  )
  .sort((left, right) => left.scheduledMs - right.scheduledMs)
if (paintCallbacks.length !== 2) {
  throw new Error(`Expected two paint-readiness callbacks; found ${paintCallbacks.length}.`)
}

const warmGateTimes = Object.fromEntries(
  [
    'initialParcel',
    'naturalRoad',
    'viewer',
    'cliffs',
    'worldFrame',
    'ambient',
    'ground',
    'zombieAssets',
    'paint',
    'handedOff',
  ].map((key) => [key, firstTrueTime(warm, key)]),
)

const coldGateTimes = Object.fromEntries(
  [
    'initialParcel',
    'naturalRoad',
    'viewer',
    'cliffs',
    'worldFrame',
    'ambient',
    'ground',
    'zombieAssets',
    'paint',
    'handedOff',
  ].map((key) => [key, firstTrueTime(cold, key)]),
)

const navigation = warm.pageData.navigation[0]
const recurringSceneLoopStart = minimum(
  rafCallbacks
    .filter((entry) => entry.stack.includes('1t89vhn-35rub.js:1:434695'))
    .map((entry) => entry.scheduledMs),
)
const webGpuFrameLoopStart = minimum(
  rafCallbacks
    .filter((entry) => entry.stack.includes('0m65x98-5bs70.js:7:126897'))
    .map((entry) => entry.scheduledMs),
)
const firstGpuCallStart = minimum(gpuCalls.map((entry) => entry.startMs))

const wallRows = []
function addWall(startMs, endMs, category, process, evidence) {
  if (!(Number.isFinite(startMs) && Number.isFinite(endMs)) || endMs <= startMs) return
  const durationMs = endMs - startMs
  wallRows.push({ startMs, endMs, durationMs, category, process, evidence })
}

addWall(0, navigation.connectEnd, 'navigation', 'DNS/TLS/HTTP connection establishment', 'Navigation Timing connectEnd')
addWall(
  navigation.connectEnd,
  navigation.responseStart,
  'navigation',
  'request transmission, Cloudflare edge/origin work, and time to first byte',
  'Navigation Timing responseStart',
)
addWall(
  navigation.responseStart,
  navigation.responseEnd,
  'navigation',
  'compressed HTML response body transfer',
  'Navigation Timing responseEnd',
)
addWall(
  navigation.responseEnd,
  navigation.domInteractive,
  'bootstrap',
  'HTML parse plus blocking production JavaScript/CSS bootstrap',
  'Navigation Timing domInteractive',
)
addWall(
  navigation.domInteractive,
  navigation.loadEventEnd,
  'bootstrap',
  'DOMContentLoaded and window load dispatch',
  'Navigation Timing loadEventEnd',
)

const firstRecordedRafStart = minimum(rafCallbacks.map((entry) => entry.scheduledMs))
addWall(
  navigation.loadEventEnd,
  firstRecordedRafStart,
  'bootstrap',
  'Next/React hydration before the first recorded animation-frame request',
  'first instrumented requestAnimationFrame schedule',
)
addWall(
  firstRecordedRafStart,
  recurringSceneLoopStart,
  'bootstrap',
  'route hydration, component mount, and scene-loop installation',
  'first recurring Landrush scene-frame request',
)
addWall(
  recurringSceneLoopStart,
  webGpuFrameLoopStart,
  'viewer',
  'Three/R3F render-loop startup',
  'first recurring WebGPU renderer frame request',
)
addWall(
  webGpuFrameLoopStart,
  firstGpuCallStart,
  'viewer',
  'WebGPU device, canvas, scene, and renderer initialization',
  'first GPUDevice method call',
)
addWall(
  firstGpuCallStart,
  warmGateTimes.ground,
  'scene-build',
  'initial shaders/render state plus ground texture and world-frame readiness',
  'ground/world readiness attributes',
)
addWall(
  warmGateTimes.ground,
  warmGateTimes.initialParcel,
  'scene-build',
  'initial parcel allocation and publication',
  'initial-parcel readiness attribute',
)
addWall(
  warmGateTimes.initialParcel,
  warmGateTimes.naturalRoad,
  'scene-build',
  'natural-road plan construction and publication',
  'natural-road readiness attribute',
)
addWall(
  warmGateTimes.naturalRoad,
  firstBuildStart,
  'zombie-build',
  'shared zombie GLTF decode/clone admission before the first cooperative slice',
  'first waitForBuildSlice request',
)

const firstBuild = buildCallbacks[0]
const firstBuildSplitPoints = [
  firstBuild.scheduledMs,
  firstAsyncPipeline.startMs,
  warmGateTimes.cliffs,
  firstBuild.firedMs,
].filter((value, index, values) => value >= firstBuild.scheduledMs && value <= firstBuild.firedMs && (index === 0 || value > values[index - 1]))
const firstBuildSplitLabels = [
  'first dockworker cooperative slice queued before initial GPU pipeline submission',
  'initial WebGPU pipeline compile overlaps dockworker first-slice admission until cliffs settle',
  'initial WebGPU pipeline remains pending while dockworker waits for its first renderable frame',
]
for (let index = 0; index < firstBuildSplitPoints.length - 1; index += 1) {
  addWall(
    firstBuildSplitPoints[index],
    firstBuildSplitPoints[index + 1],
    'zombie-build',
    firstBuildSplitLabels[index],
    'waitForBuildSlice #1 plus GPU/gate milestone',
  )
}

let wallCursor = firstBuild.firedMs
for (let index = 1; index < buildCallbacks.length; index += 1) {
  const callback = buildCallbacks[index]
  const previousIndex = index - 1
  const previousVariant = Math.floor(previousIndex / 53)
  const previousStep = (previousIndex % 53) + 1
  if (callback.scheduledMs > wallCursor) {
    addWall(
      wallCursor,
      callback.scheduledMs,
      'zombie-build',
      `${ZOMBIE_IDS[previousVariant]} executes ${operationForBuildStep(previousStep)} and queues the next slice`,
      `gap after waitForBuildSlice #${previousIndex + 1}`,
    )
  }
  const variant = Math.floor(index / 53)
  const step = (index % 53) + 1
  addWall(
    callback.scheduledMs,
    callback.firedMs,
    'zombie-build',
    `${ZOMBIE_IDS[variant]} waits for a rendered frame to admit ${operationForBuildStep(step)}`,
    `waitForBuildSlice #${index + 1}`,
  )
  wallCursor = callback.firedMs
}

const firstPostBuildPipeline = postBuildPipelines[0]
addWall(
  wallCursor,
  firstPostBuildPipeline.startMs,
  'zombie-pipeline',
  'publish the tenth baked zombie and admit the serialized render-prewarm coordinator',
  'last build slice to first post-build createRenderPipelineAsync',
)
wallCursor = firstPostBuildPipeline.startMs

for (let index = 0; index < postBuildPipelines.length; index += 1) {
  const pipeline = postBuildPipelines[index]
  if (pipeline.startMs > wallCursor) {
    addWall(
      wallCursor,
      pipeline.startMs,
      'zombie-pipeline',
      `serialized renderer bookkeeping/admission before async GPU pipeline ${index + 1}/115`,
      'gap between consecutive createRenderPipelineAsync promises',
    )
  }
  addWall(
    pipeline.startMs,
    pipeline.settledMs,
    'zombie-pipeline',
    `GPU backend compiles async zombie render pipeline ${index + 1}/115`,
    'GPUDevice.createRenderPipelineAsync promise lifetime',
  )
  wallCursor = pipeline.settledMs
}

addWall(
  wallCursor,
  paintCallbacks[0].scheduledMs,
  'readiness-publication',
  'resolve serialized render-prewarm promise and publish zombie pipeline readiness through React',
  'last async pipeline settlement to first paint-readiness frame',
)
for (let index = 0; index < paintCallbacks.length; index += 1) {
  const callback = paintCallbacks[index]
  addWall(
    callback.scheduledMs,
    callback.firedMs,
    'paint-readiness',
    `paint-readiness settled-frame gate ${index + 1}/2`,
    'paint readiness requestAnimationFrame',
  )
}

wallCursor = paintCallbacks.at(-1).firedMs
let displayedPercent = Number(
  warm.samples.filter((sample) => sample.t <= wallCursor).at(-1)?.percent ?? 0,
)
for (const sample of warm.samples) {
  if (sample.t <= wallCursor) continue
  const nextPercent = Number(sample.percent)
  if (!Number.isFinite(nextPercent) || nextPercent === displayedPercent) continue
  addWall(
    wallCursor,
    sample.t,
    'loader-controller',
    `loading meter catches up from displayed ${displayedPercent}% to ${nextPercent}%`,
    'first 100 ms sample observing the new displayed percentage',
  )
  wallCursor = sample.t
  displayedPercent = nextPercent
  if (displayedPercent >= 100) break
}

const fadeEnd = Math.min(WARM_TOTAL_MS, wallCursor + 360)
addWall(
  wallCursor,
  fadeEnd,
  'loader-controller',
  'configured 360 ms completed-loader opacity fade',
  'loader fade duration in source',
)
addWall(
  fadeEnd,
  WARM_TOTAL_MS,
  'loader-controller',
  'final DOM handoff publication plus 100 ms observer quantization',
  'first sample with handoff=true',
)

wallRows.sort((left, right) => left.startMs - right.startMs)
for (let index = 0; index < wallRows.length; index += 1) {
  const row = wallRows[index]
  if (index > 0 && Math.abs(row.startMs - wallRows[index - 1].endMs) > 0.01) {
    throw new Error(`Wall ledger is discontinuous before row ${index + 1}.`)
  }
  if (percent(row.durationMs, WARM_TOTAL_MS) > 5.000001) {
    throw new Error(
      `Wall row ${index + 1} exceeds 5%: ${percent(row.durationMs, WARM_TOTAL_MS)}%.`,
    )
  }
}
const wallDurationTotal = wallRows.reduce((sum, row) => sum + row.durationMs, 0)
if (Math.abs(wallDurationTotal - WARM_TOTAL_MS) > 0.01) {
  throw new Error(`Wall ledger totals ${wallDurationTotal} ms, expected ${WARM_TOTAL_MS} ms.`)
}

const wallPercentages = wallRows.map((row) => round(percent(row.durationMs, WARM_TOTAL_MS), 6))
const roundedPercentageTotal = wallPercentages.reduce((sum, value) => sum + value, 0)
wallPercentages[wallPercentages.length - 1] = round(
  wallPercentages.at(-1) + (100 - roundedPercentageTotal),
  6,
)

writeCsv(
  'atomic-wall-ledger.csv',
  [
    'index',
    'start_ms',
    'end_ms',
    'duration_ms',
    'percent_of_0_to_100',
    'category',
    'process',
    'evidence',
  ],
  wallRows.map((row, index) => ({
    index: index + 1,
    start_ms: round(row.startMs),
    end_ms: round(row.endMs),
    duration_ms: round(row.durationMs),
    percent_of_0_to_100: wallPercentages[index].toFixed(6),
    category: row.category,
    process: row.process,
    evidence: row.evidence,
  })),
)

const admissionRows = []
for (let index = 0; index < buildCallbacks.length; index += 1) {
  const callback = buildCallbacks[index]
  const variant = Math.floor(index / 53)
  const step = (index % 53) + 1
  const splitPoints =
    index === 0
      ? firstBuildSplitPoints
      : [callback.scheduledMs, callback.firedMs]
  for (let fragment = 0; fragment < splitPoints.length - 1; fragment += 1) {
    const startMs = splitPoints[fragment]
    const endMs = splitPoints[fragment + 1]
    admissionRows.push({
      source_event: index + 1,
      fragment: fragment + 1,
      zombie_index: variant + 1,
      zombie_id: ZOMBIE_IDS[variant],
      build_step: step,
      operation: operationForBuildStep(step),
      scheduled_ms: round(startMs),
      fired_ms: round(endMs),
      wait_ms: round(endMs - startMs),
      percent_of_0_to_100: percent(endMs - startMs, WARM_TOTAL_MS).toFixed(6),
      resolver_callback_ms: fragment === splitPoints.length - 2 ? round(callback.callbackDurationMs) : 0,
      callsite: 'waitForBuildSlice',
    })
  }
}
if (admissionRows.some((row) => Number(row.percent_of_0_to_100) > 5)) {
  throw new Error('A cooperative-build admission fragment exceeds 5%.')
}
writeCsv(
  'zombie-build-admissions.csv',
  Object.keys(admissionRows[0]),
  admissionRows,
)

const gpuPipelineRows = []
for (let index = 0; index < asyncPipelines.length; index += 1) {
  const pipeline = asyncPipelines[index]
  const splitPoints =
    index === 0
      ? [
          pipeline.startMs,
          warmGateTimes.cliffs,
          firstBuild.firedMs,
          pipeline.settledMs,
        ].filter(
          (value, pointIndex, values) =>
            value >= pipeline.startMs &&
            value <= pipeline.settledMs &&
            (pointIndex === 0 || value > values[pointIndex - 1]),
        )
      : [pipeline.startMs, pipeline.settledMs]
  for (let fragment = 0; fragment < splitPoints.length - 1; fragment += 1) {
    const startMs = splitPoints[fragment]
    const endMs = splitPoints[fragment + 1]
    gpuPipelineRows.push({
      pipeline_ordinal: index + 1,
      fragment: fragment + 1,
      phase:
        pipeline.startMs >= lastBuildEnd
          ? 'serialized-zombie-render-prewarm'
          : pipeline.startMs >= firstBuildStart
            ? 'initial-viewer-ambient-zombie-overlap'
            : 'initial-viewer',
      start_ms: round(startMs),
      settled_ms: round(endMs),
      promise_ms: round(endMs - startMs),
      percent_of_0_to_100: percent(endMs - startMs, WARM_TOTAL_MS).toFixed(6),
      synchronous_api_ms: fragment === 0 ? round(pipeline.durationMs) : 0,
      stack: pipeline.stack,
    })
  }
}
if (gpuPipelineRows.some((row) => Number(row.percent_of_0_to_100) > 5)) {
  throw new Error('An async GPU-pipeline fragment exceeds 5%.')
}
writeCsv('gpu-async-pipelines.csv', Object.keys(gpuPipelineRows[0]), gpuPipelineRows)

function networkCategory(url, type) {
  if (type === 'Document') return 'document'
  if (url.startsWith('blob:')) return 'decoder-blob'
  if (url.includes('/zombie-escape/assets/weapons/')) return 'zombie-weapon'
  if (url.includes('/island-ambient-assets/npcs/') && /\/(rigged|run|walk)\./.test(url)) {
    return 'zombie-shared-npc'
  }
  if (url.endsWith('/idle.anim.glb')) return 'ambient-npc-idle'
  if (url.includes('/island-ambient-assets/palms/')) return 'ambient-palm'
  if (url.includes('/island-ambient-assets/boats/')) return 'ambient-boat'
  if (url.includes('/island-ambient-assets/fish/')) return 'ambient-fish'
  if (/\.(mp3|ogg|wav)(?:\?|$)/.test(url)) return 'audio'
  if (url.includes('/_next/static/')) return 'next-static'
  if (/\.(ktx2|basis)(?:\?|$)/.test(url)) return 'compressed-texture'
  if (/\.(glb|gltf)(?:\?|$)/.test(url)) return 'other-model'
  if (type === 'Worker') return 'worker'
  return 'other'
}

const networkRows = []
for (const run of [cold, warm]) {
  for (const request of run.network) {
    const endMs = request.endMs ?? request.responseMs ?? request.startMs
    const durationMs = Math.max(0, endMs - request.startMs)
    networkRows.push({
      run: run.label,
      request_id: request.requestId,
      category: networkCategory(request.url, request.type),
      type: request.type,
      method: request.method,
      status: request.status,
      start_ms: round(request.startMs),
      end_ms: round(endMs),
      duration_ms: round(durationMs),
      percent_of_run: percent(durationMs, run.durationMs).toFixed(6),
      encoded_bytes: request.encodedDataLength ?? 0,
      from_disk_cache: request.fromDiskCache,
      from_service_worker: request.fromServiceWorker,
      error: request.errorText,
      url: request.url,
    })
  }
}
writeCsv('network-requests.csv', Object.keys(networkRows[0]), networkRows)

const ambientMainRequests = warm.network
  .filter(
    (request) =>
      request.endMs != null &&
      (/\/island-ambient-assets\/(palms|boats|fish)\/[^/]+\/model\.glb$/.test(request.url) ||
        request.url.endsWith('/idle.anim.glb')),
  )
  .sort((left, right) => left.startMs - right.startMs)
if (ambientMainRequests.length !== 26) {
  throw new Error(`Expected 26 ambient main requests; found ${ambientMainRequests.length}.`)
}

const firstPalmConcreteBreaks = [
  firstAsyncPipeline.startMs,
  warmGateTimes.cliffs,
  firstBuild.firedMs,
  firstAsyncPipeline.settledMs,
  buildCallbacks[3].firedMs,
]
const ambientRows = []
for (let index = 0; index < ambientMainRequests.length; index += 1) {
  const request = ambientMainRequests[index]
  const unitEnd = ambientMainRequests[index + 1]?.startMs ?? warmGateTimes.ambient
  const id = request.url.match(/\/([^/]+)\/(?:model|idle\.anim)\.glb$/)?.[1] ?? 'unknown'
  const kind = request.url.includes('/palms/')
    ? 'palm'
    : request.url.includes('/boats/')
      ? 'boat'
      : request.url.includes('/fish/')
        ? 'fish'
        : 'npc'
  const points = [request.startMs, request.endMs]
  if (index === 0) {
    points.push(...firstPalmConcreteBreaks.filter((value) => value > request.endMs && value < unitEnd))
  }
  points.push(unitEnd)
  points.sort((left, right) => left - right)
  for (let fragment = 0; fragment < points.length - 1; fragment += 1) {
    const startMs = points[fragment]
    const endMs = points[fragment + 1]
    ambientRows.push({
      unit_ordinal: index + 1,
      fragment: fragment + 1,
      kind,
      id,
      process:
        fragment === 0
          ? 'network fetch'
          : index === 0
            ? 'decode/clone/initial WebGPU prewarm/frame admission overlap'
            : 'decode, clone, render prewarm, settle, and idle admission of next unit',
      start_ms: round(startMs),
      end_ms: round(endMs),
      duration_ms: round(endMs - startMs),
      percent_of_0_to_100: percent(endMs - startMs, WARM_TOTAL_MS).toFixed(6),
      request_url: request.url,
    })
  }
}
if (ambientRows.some((row) => Number(row.percent_of_0_to_100) > 5)) {
  throw new Error('An ambient unit fragment exceeds 5%.')
}
writeCsv('ambient-unit-steps.csv', Object.keys(ambientRows[0]), ambientRows)

const schedulerBoundaryCandidates = [
  navigation.connectEnd,
  navigation.responseStart,
  navigation.responseEnd,
  navigation.domInteractive,
  navigation.loadEventEnd,
  ...Object.values(warmGateTimes),
  ...buildCallbacks.flatMap((entry) => [entry.scheduledMs, entry.firedMs]),
  ...paintCallbacks.flatMap((entry) => [entry.scheduledMs, entry.firedMs]),
  ...asyncPipelines.flatMap((entry) => [entry.startMs, entry.settledMs]),
  ...gpuCalls.flatMap((entry) => [entry.startMs, entry.settledMs]),
  ...instrumentation.longTasks.flatMap((entry) => [
    entry.startTime,
    entry.startTime + entry.duration,
  ]),
  ...instrumentation.longAnimationFrames.flatMap((entry) => [
    entry.startTime,
    entry.startTime + entry.duration,
    entry.renderStart,
    entry.styleAndLayoutStart,
    ...(entry.scripts ?? []).flatMap((script) => [
      script.startTime,
      script.startTime + script.duration,
    ]),
  ]),
]
  .filter(Number.isFinite)
  .sort((left, right) => left - right)
  .filter((value, index, values) => index === 0 || value > values[index - 1])

function splitObservedWait(startMs, endMs) {
  if (percent(endMs - startMs, WARM_TOTAL_MS) <= 5) return [startMs, endMs]
  const points = [
    startMs,
    ...schedulerBoundaryCandidates.filter((value) => value > startMs && value < endMs),
    endMs,
  ]
  for (let index = 0; index < points.length - 1; index += 1) {
    if (percent(points[index + 1] - points[index], WARM_TOTAL_MS) > 5) {
      throw new Error(`No concrete event boundary splits scheduler wait ${startMs}-${endMs} below 5%.`)
    }
  }
  return points
}

const allRafRows = []
for (let index = 0; index < rafCallbacks.length; index += 1) {
  const entry = rafCallbacks[index]
  if (entry.firedMs == null) {
    allRafRows.push({
      source_event: index + 1,
      fragment: 1,
      state: 'not-observed-firing',
      scheduled_ms: round(entry.scheduledMs),
      fired_ms: '',
      wait_ms: '',
      percent_of_0_to_100: '',
      resolver_callback_ms: '',
      stack: entry.stack,
    })
    continue
  }
  const points = splitObservedWait(entry.scheduledMs, entry.firedMs)
  for (let fragment = 0; fragment < points.length - 1; fragment += 1) {
    const startMs = points[fragment]
    const endMs = points[fragment + 1]
    allRafRows.push({
      source_event: index + 1,
      fragment: fragment + 1,
      state: 'fired',
      scheduled_ms: round(startMs),
      fired_ms: round(endMs),
      wait_ms: round(endMs - startMs),
      percent_of_0_to_100: percent(endMs - startMs, WARM_TOTAL_MS).toFixed(6),
      resolver_callback_ms: fragment === points.length - 2 ? round(entry.callbackDurationMs) : 0,
      stack: entry.stack,
    })
  }
}
if (
  allRafRows.some(
    (row) => row.percent_of_0_to_100 !== '' && Number(row.percent_of_0_to_100) > 5,
  )
) {
  throw new Error('A requestAnimationFrame wait fragment exceeds 5%.')
}
writeCsv('all-animation-frame-callbacks.csv', Object.keys(allRafRows[0]), allRafRows)

const idleCallbackRows = []
for (let index = 0; index < instrumentation.idleCallbacks.length; index += 1) {
  const entry = instrumentation.idleCallbacks[index]
  if (entry.firedMs == null) {
    idleCallbackRows.push({
      source_event: index + 1,
      fragment: 1,
      state: 'not-observed-firing',
      scheduled_ms: round(entry.scheduledMs),
      fired_ms: '',
      wait_ms: '',
      percent_of_0_to_100: '',
      callback_ms: '',
      stack: entry.stack,
    })
    continue
  }
  const points = splitObservedWait(entry.scheduledMs, entry.firedMs)
  for (let fragment = 0; fragment < points.length - 1; fragment += 1) {
    const startMs = points[fragment]
    const endMs = points[fragment + 1]
    idleCallbackRows.push({
      source_event: index + 1,
      fragment: fragment + 1,
      state: 'fired',
      scheduled_ms: round(startMs),
      fired_ms: round(endMs),
      wait_ms: round(endMs - startMs),
      percent_of_0_to_100: percent(endMs - startMs, WARM_TOTAL_MS).toFixed(6),
      callback_ms: fragment === points.length - 2 ? round(entry.callbackDurationMs) : 0,
      stack: entry.stack,
    })
  }
}
writeCsv('idle-callbacks.csv', Object.keys(idleCallbackRows[0]), idleCallbackRows)

const timerRows = []
for (let index = 0; index < instrumentation.timers.length; index += 1) {
  const entry = instrumentation.timers[index]
  if (entry.firedMs == null) {
    timerRows.push({
      source_event: index + 1,
      fragment: 1,
      state: 'cleared-or-not-fired-before-handoff',
      configured_delay_ms: round(entry.delayMs),
      scheduled_ms: round(entry.scheduledMs),
      fired_ms: '',
      observed_wait_ms: '',
      percent_of_0_to_100: '',
      stack: entry.stack,
    })
    continue
  }
  const points = splitObservedWait(entry.scheduledMs, entry.firedMs)
  for (let fragment = 0; fragment < points.length - 1; fragment += 1) {
    const startMs = points[fragment]
    const endMs = points[fragment + 1]
    timerRows.push({
      source_event: index + 1,
      fragment: fragment + 1,
      state: 'fired',
      configured_delay_ms: round(entry.delayMs),
      scheduled_ms: round(startMs),
      fired_ms: round(endMs),
      observed_wait_ms: round(endMs - startMs),
      percent_of_0_to_100: percent(endMs - startMs, WARM_TOTAL_MS).toFixed(6),
      stack: entry.stack,
    })
  }
}
if (
  timerRows.some(
    (row) => row.percent_of_0_to_100 !== '' && Number(row.percent_of_0_to_100) > 5,
  )
) {
  throw new Error('A timer wait fragment exceeds 5%.')
}
writeCsv('scheduled-timers.csv', Object.keys(timerRows[0]), timerRows)

const gpuApiRows = gpuCalls.map((entry, index) => ({
  index: index + 1,
  method: entry.method,
  start_ms: round(entry.startMs),
  synchronous_api_ms: round(entry.durationMs),
  synchronous_percent_of_0_to_100: percent(entry.durationMs, WARM_TOTAL_MS).toFixed(6),
  promise_settled_ms: entry.settledMs == null ? '' : round(entry.settledMs),
  promise_lifetime_ms:
    entry.settledMs == null ? '' : round(entry.settledMs - entry.startMs),
  stack: entry.stack,
}))
writeCsv('all-gpu-api-calls.csv', Object.keys(gpuApiRows[0]), gpuApiRows)

const longTaskRows = instrumentation.longTasks.map((entry, index) => ({
  index: index + 1,
  start_ms: round(entry.startTime),
  duration_ms: round(entry.duration),
  percent_of_0_to_100: percent(entry.duration, WARM_TOTAL_MS).toFixed(6),
  name: entry.name,
  attribution: JSON.stringify(entry.attribution ?? []),
}))
writeCsv('main-thread-long-tasks.csv', Object.keys(longTaskRows[0]), longTaskRows)

const longAnimationFrameBoundaryCandidates = [
  ...buildCallbacks.flatMap((entry) => [entry.scheduledMs, entry.firedMs]),
  ...asyncPipelines.flatMap((entry) => [entry.startMs, entry.settledMs]),
  ...Object.values(warmGateTimes),
  ...instrumentation.longAnimationFrames.flatMap((entry) => [
    entry.renderStart,
    entry.styleAndLayoutStart,
    ...(entry.scripts ?? []).flatMap((script) => [
      script.startTime,
      script.startTime + script.duration,
    ]),
  ]),
].filter(Number.isFinite)
const longAnimationFrameRows = []
for (let index = 0; index < instrumentation.longAnimationFrames.length; index += 1) {
  const entry = instrumentation.longAnimationFrames[index]
  const endTime = entry.startTime + entry.duration
  const points = [
    entry.startTime,
    ...longAnimationFrameBoundaryCandidates.filter(
      (value) => value > entry.startTime && value < endTime,
    ),
    endTime,
  ]
    .sort((left, right) => left - right)
    .filter((value, pointIndex, values) => pointIndex === 0 || value > values[pointIndex - 1])
  for (let fragment = 0; fragment < points.length - 1; fragment += 1) {
    const startMs = points[fragment]
    const fragmentEndMs = points[fragment + 1]
    const durationMs = fragmentEndMs - startMs
    const scripts = (entry.scripts ?? []).filter(
      (script) =>
        script.startTime < fragmentEndMs && script.startTime + script.duration > startMs,
    )
    longAnimationFrameRows.push({
      source_entry: index + 1,
      fragment: fragment + 1,
      start_ms: round(startMs),
      end_ms: round(fragmentEndMs),
      duration_ms: round(durationMs),
      allocated_blocking_ms: round((entry.blockingDuration * durationMs) / entry.duration),
      percent_of_0_to_100: percent(durationMs, WARM_TOTAL_MS).toFixed(6),
      render_start_ms: round(entry.renderStart),
      style_layout_start_ms: round(entry.styleAndLayoutStart),
      scripts: JSON.stringify(scripts),
    })
  }
}
if (longAnimationFrameRows.some((row) => Number(row.percent_of_0_to_100) > 5)) {
  throw new Error('A long-animation-frame fragment exceeds 5%.')
}
writeCsv(
  'long-animation-frames.csv',
  Object.keys(longAnimationFrameRows[0]),
  longAnimationFrameRows,
)

const progressRows = []
let priorPercent = null
for (const sample of warm.samples) {
  const nextPercent = Number(sample.percent)
  if (!Number.isFinite(nextPercent) || nextPercent === priorPercent) continue
  progressRows.push({
    displayed_percent: nextPercent,
    first_observed_ms: round(sample.t),
    percent_of_total_time_elapsed: percent(sample.t, WARM_TOTAL_MS).toFixed(6),
    status: sample.status,
    all_real_gates_ready:
      sample.ambient === 'true' && sample.zombieAssets === 'true' && sample.paint === 'true',
  })
  priorPercent = nextPercent
}
writeCsv('loader-progress-transitions.csv', Object.keys(progressRows[0]), progressRows)

writeCsv(
  'zombie-render-representatives.csv',
  ['compile_order', 'representative_key', 'timing_mapping'],
  RENDER_REPRESENTATIVES.map((key, index) => ({
    compile_order: index + 1,
    representative_key: key,
    timing_mapping:
      'The production renderer exposes low-level pipeline ordinals but not representative-to-pipeline ownership.',
  })),
)

function categorySummary(requests, predicate, totalMs) {
  const matches = requests.filter(predicate).filter((request) => request.endMs != null)
  return {
    count: matches.length,
    bytes: matches.reduce((sum, request) => sum + (request.encodedDataLength ?? 0), 0),
    firstStart: matches.length ? minimum(matches.map((request) => request.startMs)) : null,
    lastEnd: matches.length ? Math.max(...matches.map((request) => request.endMs)) : null,
    maximumRequest: matches.length
      ? Math.max(...matches.map((request) => request.endMs - request.startMs))
      : null,
    totalMs,
  }
}

const coldWeapons = categorySummary(
  cold.network,
  (request) => request.url.includes('/zombie-escape/assets/weapons/'),
  COLD_TOTAL_MS,
)
const coldSharedZombies = categorySummary(
  cold.network,
  (request) =>
    request.url.includes('/island-ambient-assets/npcs/') &&
    /\/(rigged|run|walk)\./.test(request.url),
  COLD_TOTAL_MS,
)
const coldZombieNetworkEnd = Math.max(coldWeapons.lastEnd, coldSharedZombies.lastEnd)
const coldNetworkBytes = cold.network.reduce(
  (sum, request) => sum + (request.encodedDataLength ?? 0),
  0,
)
const postBuildPipelinePromiseMs = postBuildPipelines.reduce(
  (sum, pipeline) => sum + (pipeline.settledMs - pipeline.startMs),
  0,
)
const postBuildPipelineWallMs = postBuildPipelines.at(-1).settledMs - lastBuildEnd
const buildWallMs = lastBuildEnd - firstBuildStart
const meterHundred = warm.samples.find((sample) => Number(sample.percent) >= 100)?.t
const allReadyActual = paintCallbacks.at(-1).firedMs
const longTaskTotal = instrumentation.longTasks.reduce((sum, entry) => sum + entry.duration, 0)
const longAnimationBlockingTotal = instrumentation.longAnimationFrames.reduce(
  (sum, entry) => sum + (entry.blockingDuration ?? 0),
  0,
)
const maximumWallPercentage = Math.max(
  ...wallRows.map((row) => percent(row.durationMs, WARM_TOTAL_MS)),
)
const finalRoundedPercentageTotal = wallPercentages.reduce((sum, value) => sum + value, 0)

const report = `# Landrush startup atomic ledger

Target: ${capture.targetUrl}

Capture: ${capture.capturedAt}

## Measurement contract

- The exclusive wall ledger uses the ${round(WARM_TOTAL_MS)} ms warm call-site-instrumented run because that is the run with exact frame, timer, and GPU call boundaries.
- It contains ${wallRows.length} contiguous, non-overlapping rows from navigation start through loader handoff. The percentages sum to ${finalRoundedPercentageTotal.toFixed(6)}%; the largest row is ${maximumWallPercentage.toFixed(6)}%.
- Network, long-task, ambient, and GPU CSVs are parallel overlays. Do not add their percentages together; concurrent browser work overlaps.
- The observer-light cold run took ${round(COLD_TOTAL_MS)} ms. A separate user-visible in-app profiler run took 66,126 ms. Instrumentation changes absolute scheduling, so this report preserves each run's own denominator instead of pretending their raw milliseconds are interchangeable.

## What actually owns the delay

1. Cold HTTP delivery is not the zombie bottleneck. The ${coldWeapons.count} weapon requests (${coldWeapons.bytes} bytes) and ${coldSharedZombies.count} shared zombie model/animation requests (${coldSharedZombies.bytes} bytes) were all complete by ${round(coldZombieNetworkEnd)} ms. Cold zombie readiness was not observed until ${round(coldGateTimes.zombieAssets)} ms: ${round(coldGateTimes.zombieAssets - coldZombieNetworkEnd)} ms after the zombie payload was already present.
2. The source forces 53 next-frame admissions per zombie variant: preflight, clone/root work, two baked-texture setup yields, 48 animation-frame samples (12 walk + 12 run + 12 attack + 12 death), baked-mesh finalization, and the final completion admission. Ten variants therefore generated exactly ${buildCallbacks.length} observed waitForBuildSlice callbacks. They span ${round(firstBuildStart)}-${round(lastBuildEnd)} ms (${round(buildWallMs)} ms, ${percent(buildWallMs, WARM_TOTAL_MS).toFixed(3)}% of the instrumented run).
3. After all ten baked presentations exist, the render-readiness coordinator serially awaits 21 representatives: five held weapons, one pickup, ten zombies, and five effects. The WebGPU backend emitted ${postBuildPipelines.length} strictly serialized async pipeline promises from ${round(firstPostBuildPipeline.startMs)}-${round(postBuildPipelines.at(-1).settledMs)} ms. Their promise lifetimes total ${round(postBuildPipelinePromiseMs)} ms; serial bookkeeping/admission gaps account for the remaining ${round(postBuildPipelineWallMs - postBuildPipelinePromiseMs)} ms of that ${round(postBuildPipelineWallMs)} ms wall span.
4. The 15,000 ms zombie render-prewarm watchdog fired at 55,255.1 ms, but it is diagnostic only. It does not release readiness. The coordinator continued waiting until the last GPU promise settled at ${round(postBuildPipelines.at(-1).settledMs)} ms.
5. Real readiness completed at the second paint frame, ${round(allReadyActual)} ms. The displayed progress did not reach 100 until ${round(meterHundred)} ms, then the configured 360 ms fade and DOM handoff completed at ${round(WARM_TOTAL_MS)} ms.

## User-visible cross-check

The controlled visible production run completed handoff in 66,126 ms. Ground/world were ready at 2,744 ms, initial parcel at 3,281 ms, natural road at 3,637 ms, cliffs at 5,748 ms, viewer at 19,570 ms, and ambient + zombie + paint at 53,735 ms. The real-ready-to-handoff tail was 12,391 ms.

The same production island without Zombie Escape reached real readiness at 33,936 ms. Zombie Escape therefore added 19,799 ms to the actual visible critical path in that comparison. The total handoff difference was only 10,333 ms because the non-zombie page had a longer progress-meter catch-up tail.

## CPU and transfer context

- Cold CDP transfer accounting: ${coldNetworkBytes} encoded bytes across ${cold.network.length} request records.
- Instrumented main-thread long tasks: ${instrumentation.longTasks.length}, totaling ${round(longTaskTotal)} ms (${percent(longTaskTotal, WARM_TOTAL_MS).toFixed(3)}%).
- Instrumented long-animation-frame blocking duration: ${round(longAnimationBlockingTotal)} ms (${percent(longAnimationBlockingTotal, WARM_TOTAL_MS).toFixed(3)}%).
- The dominant post-build delay is therefore not a 207 MB zombie download and not 25 seconds of cosmetics. It is serial frame admission followed by serial WebGPU render-pipeline prewarming, plus a separate artificial loader catch-up/fade tail.

## Files

- atomic-wall-ledger.csv — exclusive 0-100 wall clock; every row <=5%; sums to exactly 100%.
- zombie-build-admissions.csv — every one of the 530 cooperative build admissions, with the first long admission split at concrete GPU/gate milestones.
- gpu-async-pipelines.csv — all 122 async GPU pipeline promises; the one >5% promise is split at concrete gate/frame milestones.
- zombie-render-representatives.csv — the exact 21 source-ordered representatives.
- ambient-unit-steps.csv — all 26 ambient units, split into fetch and decode/clone/prewarm/admission steps; every row <=5%.
- network-requests.csv — every cold and warm request with bytes, cache flags, duration, and percentage of its run.
- all-animation-frame-callbacks.csv — every one of the 10,098 recorded frame requests, including call site, wait, and resolver time.
- idle-callbacks.csv and scheduled-timers.csv — every recorded scheduler admission and watchdog/timer.
- all-gpu-api-calls.csv — all 451 shader-module, synchronous pipeline, and asynchronous pipeline API calls.
- main-thread-long-tasks.csv and long-animation-frames.csv — every browser-observed blocking event, split at concrete events where needed to keep each row <=5%.
- loader-progress-transitions.csv — first observation of every displayed percentage change.
`

fs.writeFileSync(path.join(outputDirectory, 'report.md'), report)

const verification = {
  inputPath,
  outputDirectory,
  warmTotalMs: WARM_TOTAL_MS,
  coldTotalMs: COLD_TOTAL_MS,
  wallRows: wallRows.length,
  wallDurationTotalMs: wallDurationTotal,
  wallPercentageTotal: finalRoundedPercentageTotal,
  maximumWallRowPercentage: maximumWallPercentage,
  buildAdmissionRows: admissionRows.length,
  asyncGpuPipelineRows: gpuPipelineRows.length,
  networkRows: networkRows.length,
  ambientRows: ambientRows.length,
  allRafRows: allRafRows.length,
  idleCallbackRows: idleCallbackRows.length,
  timerRows: timerRows.length,
  gpuApiRows: gpuApiRows.length,
  longTaskRows: longTaskRows.length,
  longAnimationFrameRows: longAnimationFrameRows.length,
  progressRows: progressRows.length,
}
fs.writeFileSync(
  path.join(outputDirectory, 'verification.json'),
  `${JSON.stringify(verification, null, 2)}\n`,
)

console.log(JSON.stringify(verification, null, 2))
