import { scenarioDurationMs } from '../scenario-utils.mjs'

const POLL_MS = 250
const REQUIRED_CONSECUTIVE_SAMPLES = 4
const DETAILED_PRESENTATION_CAPACITY = 16
const MAXIMUM_AUTHORED_BATCH_COUNT = 10
const AUTHORED_BAKED_FRAME_COUNT = 49
const AUTHORED_TEXTURE_FETCHES_PER_VERTEX = 2

let preparedState = null

function resolveCount(args = {}) {
  const parsed = Number(args['zombie-count'] ?? 16)
  if (!Number.isInteger(parsed) || parsed < 0 || parsed > 100) {
    throw new Error(`invalid zombie count: ${String(args['zombie-count'])}`)
  }
  return parsed
}

function resolvePresentation(args = {}) {
  const presentation = args.presentation ?? 'exact'
  if (presentation !== 'exact' && presentation !== 'authored-instanced') {
    throw new Error(`invalid zombie presentation: ${String(presentation)}`)
  }
  return presentation
}

async function readState(page, bridge) {
  const scale = await page.evaluate(() => window.__LANDRUSH_ZOMBIE_RENDER_SCALE__ ?? null)
  const { beacon } = await bridge.beacon()
  return {
    bridgeFrame: beacon?.frameIdx ?? null,
    scale,
  }
}

function stateIssues(sample, expectedCount, expectedPresentation, previousFrame = null) {
  const scale = sample?.scale
  const issues = []
  if (!scale) return ['render-scale state is unavailable']
  const expectedDetailedRootCount =
    expectedPresentation === 'authored-instanced'
      ? Math.min(expectedCount, DETAILED_PRESENTATION_CAPACITY)
      : expectedCount
  const expectedAuthoredInstancedActiveCount = expectedCount - expectedDetailedRootCount
  const expectedActiveMixerCount = expectedDetailedRootCount
  const expectedAuthoredVariantCount = new Set(
    Array.from(
      { length: expectedAuthoredInstancedActiveCount },
      (_, index) => (expectedDetailedRootCount + index) % MAXIMUM_AUTHORED_BATCH_COUNT,
    ),
  ).size
  if (scale.requestedCount !== expectedCount) {
    issues.push(`requested count=${String(scale.requestedCount)}`)
  }
  if (scale.presentation !== expectedPresentation) {
    issues.push(`presentation=${String(scale.presentation)}`)
  }
  if (scale.detailedRootCount !== expectedDetailedRootCount) {
    issues.push(`detailed roots=${String(scale.detailedRootCount)}`)
  }
  if (scale.activeMixerCount !== expectedActiveMixerCount) {
    issues.push(`active mixers=${String(scale.activeMixerCount)}`)
  }
  if (
    scale.authoredAnimationMode !==
    (expectedAuthoredInstancedActiveCount > 0 ? 'baked-vertex' : 'none')
  ) {
    issues.push(`authored animation=${String(scale.authoredAnimationMode)}`)
  }
  if (scale.authoredComputeDispatchCount !== 0) {
    issues.push(`authored compute dispatches=${String(scale.authoredComputeDispatchCount)}`)
  }
  if (scale.authoredRuntimeGeometryUploadCount !== 0) {
    issues.push(
      `authored runtime geometry uploads=${String(scale.authoredRuntimeGeometryUploadCount)}`,
    )
  }
  if (scale.authoredRuntimeMixerCount !== 0) {
    issues.push(`authored runtime mixers=${String(scale.authoredRuntimeMixerCount)}`)
  }
  if (
    scale.authoredMaterialMode !==
    (expectedAuthoredInstancedActiveCount > 0 ? 'authored-texture-grade' : 'none')
  ) {
    issues.push(`authored material=${String(scale.authoredMaterialMode)}`)
  }
  if (
    scale.authoredBakedFrameCount !==
    (expectedAuthoredInstancedActiveCount > 0 ? AUTHORED_BAKED_FRAME_COUNT : 0)
  ) {
    issues.push(`authored baked frames=${String(scale.authoredBakedFrameCount)}`)
  }
  if (
    scale.authoredTextureFetchesPerVertex !==
    (expectedAuthoredInstancedActiveCount > 0 ? AUTHORED_TEXTURE_FETCHES_PER_VERTEX : 0)
  ) {
    issues.push(
      `authored texture fetches=${String(scale.authoredTextureFetchesPerVertex)}`,
    )
  }
  if (
    expectedAuthoredInstancedActiveCount > 0
      ? !(scale.authoredBakedTextureBytes > 0 && scale.authoredBakedTextureCount > 0)
      : scale.authoredBakedTextureBytes !== 0 || scale.authoredBakedTextureCount !== 0
  ) {
    issues.push(
      `authored baked textures=${String(scale.authoredBakedTextureCount)}/${String(scale.authoredBakedTextureBytes)} bytes`,
    )
  }
  if (
    scale.authoredBakedTextureFormat !==
    (expectedAuthoredInstancedActiveCount > 0 ? 'rgba16float' : 'none')
  ) {
    issues.push(`authored baked texture format=${String(scale.authoredBakedTextureFormat)}`)
  }
  if (scale.authoredSpatialBoundsValidCount !== expectedAuthoredVariantCount) {
    issues.push(`authored bounded variants=${String(scale.authoredSpatialBoundsValidCount)}`)
  }
  if (scale.authoredInstancedActiveCount !== expectedAuthoredInstancedActiveCount) {
    issues.push(`authored instanced active=${String(scale.authoredInstancedActiveCount)}`)
  }
  if (
    expectedAuthoredInstancedActiveCount === 0
      ? scale.authoredInstancedBatchCount !== 0
      : !(
          scale.authoredInstancedBatchCount > 0 &&
          scale.authoredInstancedBatchCount <= MAXIMUM_AUTHORED_BATCH_COUNT
        )
  ) {
    issues.push(`authored batches=${String(scale.authoredInstancedBatchCount)}`)
  }
  if (scale.variantCount !== Math.min(expectedCount, 10)) {
    issues.push(`active variants=${String(scale.variantCount)}`)
  }
  if (scale.fallbackCount !== 0) issues.push(`fallbacks=${String(scale.fallbackCount)}`)
  if (scale.unpresentedActiveCount !== 0) {
    issues.push(`unpresented=${String(scale.unpresentedActiveCount)}`)
  }
  if (scale.assetFailureCount !== 0) {
    issues.push(`asset failures=${String(scale.assetFailureCount)}`)
  }
  if (scale.backend !== 'webgpu') issues.push(`backend=${String(scale.backend)}`)
  if (scale.visibility !== 'visible') issues.push(`visibility=${String(scale.visibility)}`)
  if (!scale.ready) issues.push('scene is not ready')
  if (scale.stableFrameCount < 120) {
    issues.push(`stable frames=${String(scale.stableFrameCount)}`)
  }
  if (!(scale.drawCalls > 0)) issues.push(`draw calls=${String(scale.drawCalls)}`)
  if (!(scale.triangleCount > 0)) issues.push(`triangles=${String(scale.triangleCount)}`)
  if (!scale.cameraHash) issues.push('camera hash missing')
  if (typeof scale.layoutHash !== 'string') issues.push('layout hash missing')
  if (!Number.isFinite(sample.bridgeFrame)) {
    issues.push(`bridge frame=${String(sample.bridgeFrame)}`)
  } else if (previousFrame !== null && sample.bridgeFrame <= previousFrame) {
    issues.push(`bridge frame did not advance from ${previousFrame}`)
  }
  return issues
}

async function waitForReady(page, bridge, sleep, expectedCount, expectedPresentation) {
  const startedAt = Date.now()
  let consecutive = 0
  let previousFrame = null
  let last = null
  let lastIssues = []
  while (Date.now() - startedAt < 240_000) {
    last = await readState(page, bridge)
    lastIssues = stateIssues(last, expectedCount, expectedPresentation, previousFrame)
    consecutive = lastIssues.length === 0 ? consecutive + 1 : 0
    previousFrame = last.bridgeFrame
    if (consecutive >= REQUIRED_CONSECUTIVE_SAMPLES) return last
    await sleep(POLL_MS)
  }
  throw new Error(
    `zombie render scale did not become ready (${lastIssues.join('; ') || 'unknown'}; ` +
      `last=${JSON.stringify(last)})`,
  )
}

function continuityIssues(initial, final, expectedCount, expectedPresentation) {
  const issues = stateIssues(final, expectedCount, expectedPresentation)
  if (final.scale?.cameraHash !== initial.scale?.cameraHash) issues.push('camera hash changed')
  if (final.scale?.layoutHash !== initial.scale?.layoutHash) issues.push('layout hash changed')
  if (final.scale?.detailedRootCount !== initial.scale?.detailedRootCount) {
    issues.push('detailed root count changed')
  }
  if (final.scale?.activeMixerCount !== initial.scale?.activeMixerCount) {
    issues.push('active mixer count changed')
  }
  if (
    final.scale?.authoredInstancedActiveCount !== initial.scale?.authoredInstancedActiveCount
  ) {
    issues.push('authored active count changed')
  }
  if (final.scale?.authoredInstancedBatchCount !== initial.scale?.authoredInstancedBatchCount) {
    issues.push('authored batch count changed')
  }
  if (
    final.scale?.authoredSpatialBoundsValidCount !==
    initial.scale?.authoredSpatialBoundsValidCount
  ) {
    issues.push('authored spatial bounds count changed')
  }
  if (final.scale?.authoredBakedTextureBytes !== initial.scale?.authoredBakedTextureBytes) {
    issues.push('authored baked texture bytes changed')
  }
  if (final.scale?.authoredBakedTextureCount !== initial.scale?.authoredBakedTextureCount) {
    issues.push('authored baked texture count changed')
  }
  if (final.scale?.authoredBakedTextureFormat !== initial.scale?.authoredBakedTextureFormat) {
    issues.push('authored baked texture format changed')
  }
  if (final.scale?.authoredMaterialMode !== initial.scale?.authoredMaterialMode) {
    issues.push('authored material mode changed')
  }
  if (final.bridgeFrame <= initial.bridgeFrame) issues.push('bridge stopped advancing')
  return issues
}

export default {
  name: 'landrush-zombie-render-scale',
  lifecycle: {
    captureInitialCheckpoint: false,
    prepareAfterWarmup: true,
    settleBeforeMeasurement: false,
    watchdog: false,
    warmupSeconds: 20,
  },
  urlParams: ({ args = {} } = {}) => {
    const presentation = resolvePresentation(args)
    return [
      `zombieCount=${resolveCount(args)}`,
      presentation === 'exact' ? null : `presentation=${presentation}`,
    ]
      .filter(Boolean)
      .join('&')
  },
  async prepare({ args, bridge, page, recordEvidence, sleep }) {
    const expectedCount = resolveCount(args)
    const expectedPresentation = resolvePresentation(args)
    preparedState = await waitForReady(
      page,
      bridge,
      sleep,
      expectedCount,
      expectedPresentation,
    )
    recordEvidence('zombieRenderScalePrepared', preparedState.scale)
  },
  async execute({ args, bridge, mark, minutes, page, recordEvidence, sleep, trace }) {
    const expectedCount = resolveCount(args)
    const expectedPresentation = resolvePresentation(args)
    const initial =
      preparedState ??
      (await waitForReady(page, bridge, sleep, expectedCount, expectedPresentation))
    trace.write({ kind: 'validation', name: 'zombie-render-scale-initial', state: initial })
    await mark('zombie-render-scale-start')
    await sleep(scenarioDurationMs(minutes))
    await mark('zombie-render-scale-end')
    const final = await readState(page, bridge)
    const issues = continuityIssues(initial, final, expectedCount, expectedPresentation)
    recordEvidence('zombieRenderScaleFinal', final.scale)
    trace.write({ issues, kind: 'validation', name: 'zombie-render-scale-final', state: final })
    if (issues.length > 0) {
      throw new Error(`invalid zombie render scale measurement: ${issues.join('; ')}`)
    }
  },
}
