const DEFAULT_FRAME_BUDGET_NUMERATOR_US = 1_000_000
const DEFAULT_FRAME_BUDGET_DENOMINATOR = 60
const DEFAULT_OWN_FILL_THRESHOLD_US = 2_000
const FLOAT_RECONCILIATION_TOLERANCE_US = 0.000_1
const RESIDUAL_SERIES_ID = 'other-each-leq-2ms'
const RESIDUAL_SERIES_LABEL = 'other — each contributor ≤2ms'

export const SLOW_FRAME_HEADERS = Object.freeze([
  'capture_variant',
  'capture_role',
  'source_ledger',
  'primary_exact_attribution',
  'frame_idx',
  'render_frame_idx',
  'start_offset_us',
  'end_offset_us',
  'total_us',
  'frame_ms',
  'raw_duration_ms',
  'boundary_crossing',
  'plot_start_offset_us',
  'plot_end_offset_us',
  'ledger_total_us',
  'budget_us_numerator',
  'budget_us_denominator',
  'over_budget_us_numerator',
  'over_budget_us',
  'over_budget_ms',
  'clipped',
  'renderer_main_active_us',
  'renderer_main_idle_or_untraced_us',
  'gpu_busy_us',
  'gpu_complete',
  'contributor_count',
  'own_fill_contributor_count',
])

export const SLOW_FRAME_CONTRIBUTOR_HEADERS = Object.freeze([
  'capture_variant',
  'source_ledger',
  'frame_idx',
  'start_offset_us',
  'end_offset_us',
  'frame_ms',
  'raw_duration_ms',
  'boundary_crossing',
  'plot_start_offset_us',
  'plot_end_offset_us',
  'over_budget_us_numerator',
  'over_budget_us',
  'contributor_rank',
  'category',
  'label',
  'duration_us',
  'duration_ms',
  'frame_percent',
  'post_budget_us_numerator',
  'post_budget_us',
  'post_budget_ms',
  'post_budget_percent',
  'own_color_fill',
  'chart_series_id',
  'chart_bucket_id',
  'source_leaf_count',
  'trace_names',
  'trace_categories',
  'details_json',
])

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

function finiteNumber(value) {
  return typeof value === 'number' && Number.isFinite(value)
}

function assertNonnegativeNumber(value, label) {
  assert(finiteNumber(value) && value >= 0, `${label} must be a nonnegative finite number`)
}

function assertInteger(value, label) {
  assert(Number.isSafeInteger(value), `${label} must be a safe integer`)
}

function assertClose(
  actual,
  expected,
  label,
  tolerance = FLOAT_RECONCILIATION_TOLERANCE_US,
) {
  assert(
    Math.abs(actual - expected) <= tolerance,
    `${label} differs by ${Math.abs(actual - expected)}`,
  )
}

function stableDetail(value) {
  if (!value || typeof value !== 'object') return null
  return JSON.stringify(value)
}

function contributorKey(category, label) {
  return `${category}\u0000${label}`
}

function compareContributors(left, right) {
  return (
    right.durationUs - left.durationUs ||
    left.category.localeCompare(right.category) ||
    left.label.localeCompare(right.label)
  )
}

function compareFrames(left, right) {
  return (
    left.startOffsetUs - right.startOffsetUs ||
    left.endOffsetUs - right.endOffsetUs ||
    left.frameIdx - right.frameIdx
  )
}

function decimal(value, digits = 6) {
  if (!finiteNumber(value)) return null
  return Number(value.toFixed(digits))
}

export function isStrictFrameBudgetMiss(
  totalUs,
  {
    denominator = DEFAULT_FRAME_BUDGET_DENOMINATOR,
    numeratorUs = DEFAULT_FRAME_BUDGET_NUMERATOR_US,
  } = {},
) {
  assertNonnegativeNumber(totalUs, 'frame duration')
  assertInteger(denominator, 'frame-budget denominator')
  assertInteger(numeratorUs, 'frame-budget numerator')
  assert(denominator > 0, 'frame-budget denominator must be positive')
  assert(numeratorUs > 0, 'frame-budget numerator must be positive')
  if (Number.isSafeInteger(totalUs)) return totalUs * denominator > numeratorUs
  return totalUs > numeratorUs / denominator
}

export function isStrictFrameBudgetMissMs(
  durationMs,
  {
    denominator = DEFAULT_FRAME_BUDGET_DENOMINATOR,
    numeratorUs = DEFAULT_FRAME_BUDGET_NUMERATOR_US,
  } = {},
) {
  assertNonnegativeNumber(durationMs, 'raw frame duration')
  assertInteger(denominator, 'frame-budget denominator')
  assertInteger(numeratorUs, 'frame-budget numerator')
  assert(denominator > 0, 'frame-budget denominator must be positive')
  assert(numeratorUs > 0, 'frame-budget numerator must be positive')
  return durationMs > numeratorUs / (1_000 * denominator)
}

export function buildRawFrameTimeline(
  frames,
  switchPageTMs,
  { windowEndMs = 15_000, windowStartMs = -2_000 } = {},
) {
  assert(Array.isArray(frames), 'raw frame source must be an array')
  assert(finiteNumber(switchPageTMs), 'raw frame switch point must be finite')
  assert(finiteNumber(windowStartMs), 'raw frame window start must be finite')
  assert(finiteNumber(windowEndMs), 'raw frame window end must be finite')
  assert(windowEndMs > windowStartMs, 'raw frame window must be nonempty')
  const ordered = [...frames]
    .filter((frame) => Number.isSafeInteger(frame?.frameIdx) && finiteNumber(frame?.wallT))
    .sort((left, right) => left.wallT - right.wallT || left.frameIdx - right.frameIdx)
  const continuityIssues = []
  const timelineFrames = []
  for (let index = 1; index < ordered.length; index += 1) {
    const startFrame = ordered[index - 1]
    const endFrame = ordered[index]
    if (endFrame.frameIdx !== startFrame.frameIdx + 1) {
      continuityIssues.push(`frame ${startFrame.frameIdx} -> ${endFrame.frameIdx}`)
    }
    const rawStartOffsetMs = startFrame.wallT - switchPageTMs
    const rawEndOffsetMs = endFrame.wallT - switchPageTMs
    if (!(rawEndOffsetMs > rawStartOffsetMs)) continue
    const plotStartOffsetMs = Math.max(windowStartMs, rawStartOffsetMs)
    const plotEndOffsetMs = Math.min(windowEndMs, rawEndOffsetMs)
    if (!(plotEndOffsetMs > plotStartOffsetMs)) continue
    timelineFrames.push({
      boundaryCrossing:
        rawStartOffsetMs < windowStartMs || rawEndOffsetMs > windowEndMs,
      frameIdx: endFrame.frameIdx,
      ledgerEndOffsetUs: Math.round(rawEndOffsetMs * 1_000),
      ledgerStartOffsetUs: Math.round(rawStartOffsetMs * 1_000),
      plotEndOffsetMs,
      plotEndOffsetUs: plotEndOffsetMs * 1_000,
      plotStartOffsetMs,
      plotStartOffsetUs: plotStartOffsetMs * 1_000,
      rawDurationMs: rawEndOffsetMs - rawStartOffsetMs,
      rawEndOffsetMs,
      rawEndOffsetUs: rawEndOffsetMs * 1_000,
      rawStartOffsetMs,
      rawStartOffsetUs: rawStartOffsetMs * 1_000,
    })
  }
  assert(timelineFrames.length > 0, 'no complete raw frame overlaps the requested window')
  assert(
    timelineFrames[0].plotStartOffsetMs === windowStartMs,
    'raw frame timeline does not reach the requested window start',
  )
  assert(
    timelineFrames.at(-1).plotEndOffsetMs === windowEndMs,
    'raw frame timeline does not reach the requested window end',
  )
  for (let index = 1; index < timelineFrames.length; index += 1) {
    assert(
      timelineFrames[index - 1].plotEndOffsetMs ===
        timelineFrames[index].plotStartOffsetMs,
      `raw frame timeline has a gap before frame ${timelineFrames[index].frameIdx}`,
    )
  }
  return {
    continuityIssues,
    frameMembership: `every complete captured frame interval with positive overlap of [${windowStartMs}ms,${windowEndMs}ms)`,
    frames: timelineFrames,
    fullFrameLedgerWindow: {
      endOffsetUs: timelineFrames.at(-1).ledgerEndOffsetUs,
      startOffsetUs: timelineFrames[0].ledgerStartOffsetUs,
    },
    window: { endOffsetMs: windowEndMs, startOffsetMs: windowStartMs },
  }
}

function budgetFields(rawDurationMs, budget) {
  const overBudgetUs = Math.max(
    0,
    rawDurationMs * 1_000 - budget.numeratorUs / budget.denominator,
  )
  return {
    overBudgetUs,
    overBudgetUsNumerator: overBudgetUs * budget.denominator,
    strictBudgetMiss: isStrictFrameBudgetMissMs(rawDurationMs, budget),
  }
}

function validateContinuity(ledger, variant) {
  assert(ledger && typeof ledger === 'object', `${variant} ledger is missing`)
  const issues = ledger.invariants?.frameContinuityIssues
  assert(Array.isArray(issues), `${variant} ledger has no frame-continuity invariant`)
  assert(
    issues.length === 0,
    `${variant} frame continuity is invalid: ${issues.join('; ')}`,
  )
  assert(
    ledger.invariants?.exactWindowCoverage === true,
    `${variant} ledger does not have exact window coverage`,
  )
}

function validateWindow(ledger, expected, variant) {
  const window = ledger.window
  assert(
    Number.isSafeInteger(window?.startOffsetUs) && Number.isSafeInteger(window?.endOffsetUs),
    `${variant} ledger has an invalid window`,
  )
  assert(window.endOffsetUs > window.startOffsetUs, `${variant} ledger window is empty`)
  if (!expected) return { ...window }
  assert(
    window.startOffsetUs === expected.startOffsetUs &&
      window.endOffsetUs === expected.endOffsetUs,
    `${variant} ledger window does not match the trace window`,
  )
  return expected
}

function validateWallFrame(frame, variant, totalField = 'totalUs', frameField = 'frameIdx') {
  assertInteger(frame?.startOffsetUs, `${variant} frame start`)
  assertInteger(frame?.endOffsetUs, `${variant} frame end`)
  assert(frame.endOffsetUs > frame.startOffsetUs, `${variant} frame has an empty interval`)
  assertInteger(frame?.[totalField], `${variant} frame duration`)
  assert(
    frame[totalField] === frame.endOffsetUs - frame.startOffsetUs,
    `${variant} frame ${String(frame?.[frameField])} duration does not match its interval`,
  )
  assertInteger(frame?.[frameField], `${variant} frame index`)
}

function fallbackTiming(frame, logicalWindow) {
  const rawStartOffsetMs = frame.startOffsetUs / 1_000
  const rawEndOffsetMs = frame.endOffsetUs / 1_000
  const plotStartOffsetMs = Math.max(logicalWindow.startOffsetUs / 1_000, rawStartOffsetMs)
  const plotEndOffsetMs = Math.min(logicalWindow.endOffsetUs / 1_000, rawEndOffsetMs)
  return {
    boundaryCrossing:
      rawStartOffsetMs < logicalWindow.startOffsetUs / 1_000 ||
      rawEndOffsetMs > logicalWindow.endOffsetUs / 1_000,
    frameIdx: frame.frameIdx,
    ledgerEndOffsetUs: frame.endOffsetUs,
    ledgerStartOffsetUs: frame.startOffsetUs,
    plotEndOffsetMs,
    plotEndOffsetUs: plotEndOffsetMs * 1_000,
    plotStartOffsetMs,
    plotStartOffsetUs: plotStartOffsetMs * 1_000,
    rawDurationMs: (frame.endOffsetUs - frame.startOffsetUs) / 1_000,
    rawEndOffsetMs,
    rawEndOffsetUs: frame.endOffsetUs,
    rawStartOffsetMs,
    rawStartOffsetUs: frame.startOffsetUs,
  }
}

function validateFrameTimeline(timeline, ledger, variant, logicalWindow, frameField = 'frameIdx') {
  const frames =
    timeline?.frames ??
    ledger.frames.map((frame) =>
      fallbackTiming({ ...frame, frameIdx: frame[frameField] }, logicalWindow),
    )
  assert(frames.length > 0, `${variant} raw frame timeline is empty`)
  const ledgerByFrameIdx = new Map(ledger.frames.map((frame) => [frame[frameField], frame]))
  const timingByFrameIdx = new Map()
  for (const timing of frames) {
    assertInteger(timing?.frameIdx, `${variant} raw frame index`)
    assertNonnegativeNumber(timing?.rawDurationMs, `${variant} raw frame duration`)
    assert(timing.rawDurationMs > 0, `${variant} raw frame duration must be positive`)
    assert(
      finiteNumber(timing.rawStartOffsetMs) && finiteNumber(timing.rawEndOffsetMs),
      `${variant} raw frame endpoints must be finite`,
    )
    assert(
      timing.rawEndOffsetMs > timing.rawStartOffsetMs,
      `${variant} raw frame ${timing.frameIdx} is empty`,
    )
    assertClose(
      timing.rawEndOffsetMs - timing.rawStartOffsetMs,
      timing.rawDurationMs,
      `${variant} raw frame ${timing.frameIdx} duration`,
      0.000_000_1,
    )
    assert(
      finiteNumber(timing.plotStartOffsetMs) &&
        finiteNumber(timing.plotEndOffsetMs) &&
        timing.plotEndOffsetMs > timing.plotStartOffsetMs,
      `${variant} raw frame ${timing.frameIdx} has invalid plot overlap`,
    )
    assert(
      timing.plotStartOffsetMs >= logicalWindow.startOffsetUs / 1_000 &&
        timing.plotEndOffsetMs <= logicalWindow.endOffsetUs / 1_000,
      `${variant} raw frame ${timing.frameIdx} plot overlap leaves the logical window`,
    )
    assert(ledgerByFrameIdx.has(timing.frameIdx), `${variant} raw frame has no ledger frame`)
    assert(!timingByFrameIdx.has(timing.frameIdx), `${variant} raw frame index is duplicated`)
    timingByFrameIdx.set(timing.frameIdx, timing)
  }
  return { frames, timingByFrameIdx }
}

function validatePrimaryCoverage(frames, window) {
  assert(frames.length > 0, 'trace ledger contains no frames')
  assert(
    frames[0].plotStartOffsetUs === window.startOffsetUs,
    'trace frames do not start at the requested window boundary',
  )
  assert(
    frames.at(-1).plotEndOffsetUs === window.endOffsetUs,
    'trace frames do not end at the requested window boundary',
  )
  for (let index = 1; index < frames.length; index += 1) {
    assert(
      frames[index - 1].plotEndOffsetUs === frames[index].plotStartOffsetUs,
      `trace wall coverage has a gap before frame ${frames[index].frameIdx}`,
    )
  }
}

function validatedThreadLeaves(frame, thread, label) {
  assertInteger(thread?.activeUs, `${label} active wall time`)
  assertInteger(thread?.idleOrUntracedUs, `${label} idle-or-untraced wall time`)
  assert(
    thread.activeUs + thread.idleOrUntracedUs === frame.totalUs,
    `${label} frame ${frame.frameIdx} wall time does not reconcile`,
  )
  const leaves = [...(thread.leaves ?? [])].sort(
    (left, right) =>
      left.startOffsetUs - right.startOffsetUs ||
      left.endOffsetUs - right.endOffsetUs ||
      String(left.category).localeCompare(String(right.category)) ||
      String(left.label).localeCompare(String(right.label)),
  )
  let activeUs = 0
  let cursor = frame.startOffsetUs
  for (const leaf of leaves) {
    assertInteger(leaf?.startOffsetUs, `${label} frame ${frame.frameIdx} leaf start`)
    assertInteger(leaf?.endOffsetUs, `${label} frame ${frame.frameIdx} leaf end`)
    assertInteger(leaf?.durationUs, `${label} frame ${frame.frameIdx} leaf duration`)
    assert(
      leaf.startOffsetUs === cursor,
      `${label} frame ${frame.frameIdx} leaves overlap or have a gap at ${cursor}us`,
    )
    assert(
      leaf.endOffsetUs > leaf.startOffsetUs &&
        leaf.durationUs === leaf.endOffsetUs - leaf.startOffsetUs,
      `${label} frame ${frame.frameIdx} has an invalid leaf interval`,
    )
    cursor = leaf.endOffsetUs
    if (leaf.category !== 'idle-or-untraced') activeUs += leaf.durationUs
  }
  assert(cursor === frame.endOffsetUs, `${label} frame ${frame.frameIdx} leaf coverage is incomplete`)
  assert(activeUs === thread.activeUs, `${label} frame ${frame.frameIdx} active time is inconsistent`)
  return leaves
}

function overlapDurationUs(leftLeaves, rightLeaves) {
  let leftIndex = 0
  let rightIndex = 0
  let durationUs = 0
  while (leftIndex < leftLeaves.length && rightIndex < rightLeaves.length) {
    const left = leftLeaves[leftIndex]
    const right = rightLeaves[rightIndex]
    durationUs += Math.max(
      0,
      Math.min(left.endOffsetUs, right.endOffsetUs) -
        Math.max(left.startOffsetUs, right.startOffsetUs),
    )
    if (left.endOffsetUs <= right.endOffsetUs) leftIndex += 1
    if (right.endOffsetUs <= left.endOffsetUs) rightIndex += 1
  }
  return durationUs
}

function gpuProcessTrackFrame(frame, rendererMain, gpuMain, timing) {
  const rendererLeaves = validatedThreadLeaves(frame, rendererMain, 'renderer main')
  const gpuLeaves = validatedThreadLeaves(frame, gpuMain, 'GPU-process main')
  const activeWhileRendererMainIdleOrUntracedUs = overlapDurationUs(
    rendererLeaves.filter((leaf) => leaf.category === 'idle-or-untraced'),
    gpuLeaves.filter((leaf) => leaf.category !== 'idle-or-untraced'),
  )
  assert(
    activeWhileRendererMainIdleOrUntracedUs <= gpuMain.activeUs &&
      activeWhileRendererMainIdleOrUntracedUs <= rendererMain.idleOrUntracedUs,
    `GPU-process frame ${frame.frameIdx} overlap exceeds a source partition`,
  )
  const rawScale = (timing.rawDurationMs * 1_000) / frame.totalUs
  return {
    activeUs: gpuMain.activeUs * rawScale,
    activeWhileRendererMainIdleOrUntracedUs:
      activeWhileRendererMainIdleOrUntracedUs * rawScale,
    boundaryCrossing: timing.boundaryCrossing === true,
    endOffsetUs: timing.rawEndOffsetUs,
    frameIdx: frame.frameIdx,
    idleOrUntracedUs: gpuMain.idleOrUntracedUs * rawScale,
    ledgerTotalUs: frame.totalUs,
    plotEndOffsetUs: timing.plotEndOffsetUs,
    plotStartOffsetUs: timing.plotStartOffsetUs,
    rawDurationMs: timing.rawDurationMs,
    startOffsetUs: timing.rawStartOffsetUs,
    totalUs: timing.rawDurationMs * 1_000,
  }
}

function parallelOwnerDescriptor(thread, leaf) {
  if (leaf.category === 'idle-or-untraced') return null
  const identity = `${thread.processName} ${thread.threadName} ${leaf.category} ${leaf.label}`
  if (/Present|Swap|FrameSink|BeginFrame|SubmitFrame|WaitFor.*Frame|Display::/iu.test(identity)) {
    return {
      category: 'presentation-wait-wall',
      label: `presentation owner · ${thread.processName}/${thread.threadName}: ${leaf.label}`,
      priority: 400,
    }
  }
  if (thread.processName === 'GPU Process' || leaf.category === 'gpu-process-cpu') {
    return {
      category: 'gpu-process-wall',
      label: `GPU-process owner · ${thread.threadName}: ${leaf.label}`,
      priority: 350,
    }
  }
  if (/Compositor|Viz|Raster|Surface|LayerTree|Tile/iu.test(identity)) {
    return {
      category: 'compositor-wall',
      label: `compositor owner · ${thread.processName}/${thread.threadName}: ${leaf.label}`,
      priority: 300,
    }
  }
  return {
    category: 'other-traced-chrome-wall',
    label: `other traced owner · ${thread.processName}/${thread.threadName}: ${leaf.label}`,
    priority: 100,
  }
}

function rendererWallOwnershipPartition(frame, rendererMain) {
  const rendererLeaves = validatedThreadLeaves(frame, rendererMain, 'renderer main')
  const candidates = []
  for (const thread of frame.threads) {
    if (thread.key === rendererMain.key) continue
    const leaves = validatedThreadLeaves(
      frame,
      thread,
      `${thread.processName}/${thread.threadName}`,
    )
    for (const leaf of leaves) {
      const owner = parallelOwnerDescriptor(thread, leaf)
      if (!owner) continue
      candidates.push({
        ...owner,
        detail: {
          ownerProcess: thread.processName,
          ownerThread: thread.threadName,
          sourceDetail: leaf.detail ?? null,
        },
        endOffsetUs: leaf.endOffsetUs,
        sourceDurationUs: leaf.sourceDurationUs ?? leaf.durationUs,
        startOffsetUs: leaf.startOffsetUs,
        traceCategory: leaf.traceCategory ?? '',
        traceName: leaf.traceName ?? null,
      })
    }
  }
  const result = []
  const append = (leaf) => {
    result.push({
      ...leaf,
      durationUs: leaf.endOffsetUs - leaf.startOffsetUs,
    })
  }
  for (const rendererLeaf of rendererLeaves) {
    if (rendererLeaf.category !== 'idle-or-untraced') {
      append(rendererLeaf)
      continue
    }
    const overlaps = candidates.filter(
      (candidate) =>
        candidate.endOffsetUs > rendererLeaf.startOffsetUs &&
        candidate.startOffsetUs < rendererLeaf.endOffsetUs,
    )
    const points = new Set([rendererLeaf.startOffsetUs, rendererLeaf.endOffsetUs])
    for (const candidate of overlaps) {
      points.add(Math.max(rendererLeaf.startOffsetUs, candidate.startOffsetUs))
      points.add(Math.min(rendererLeaf.endOffsetUs, candidate.endOffsetUs))
    }
    const orderedPoints = [...points].sort((left, right) => left - right)
    for (let index = 1; index < orderedPoints.length; index += 1) {
      const startOffsetUs = orderedPoints[index - 1]
      const endOffsetUs = orderedPoints[index]
      if (endOffsetUs <= startOffsetUs) continue
      const owners = overlaps
        .filter(
          (candidate) =>
            candidate.startOffsetUs <= startOffsetUs && candidate.endOffsetUs >= endOffsetUs,
        )
        .sort(
          (left, right) =>
            right.priority - left.priority ||
            left.sourceDurationUs - right.sourceDurationUs ||
            left.label.localeCompare(right.label),
        )
      const owner = owners[0]
      append(
        owner
          ? { ...owner, endOffsetUs, startOffsetUs }
          : {
              category: 'irreducible-unowned-wall',
              detail: null,
              endOffsetUs,
              label: 'irreducible wall time · no synchronous trace owner',
              sourceDurationUs: endOffsetUs - startOffsetUs,
              startOffsetUs,
              traceCategory: '',
              traceName: null,
            },
      )
    }
  }
  assert(
    result.reduce((sum, leaf) => sum + leaf.durationUs, 0) === frame.totalUs,
    `trace frame ${frame.frameIdx} ownership partition does not reconcile`,
  )
  return result
}

function aggregateTraceFrame(frame, mainThread, timing, budget, ownFillThresholdUs) {
  const orderedLeaves = rendererWallOwnershipPartition(frame, mainThread).sort(
    (left, right) =>
      left.startOffsetUs - right.startOffsetUs ||
      left.endOffsetUs - right.endOffsetUs ||
      String(left.category).localeCompare(String(right.category)) ||
      String(left.label).localeCompare(String(right.label)),
  )
  const totals = new Map()
  const rawTotalUs = timing.rawDurationMs * 1_000
  const rawScale = rawTotalUs / frame.totalUs
  const rawFrameStartUs = timing.rawStartOffsetMs * 1_000
  const rawFrameEndUs = timing.rawEndOffsetMs * 1_000
  const postBudgetStartUs = rawFrameStartUs + budget.numeratorUs / budget.denominator
  let cursor = frame.startOffsetUs
  for (const leaf of orderedLeaves) {
    assertInteger(leaf?.startOffsetUs, `trace frame ${frame.frameIdx} leaf start`)
    assertInteger(leaf?.endOffsetUs, `trace frame ${frame.frameIdx} leaf end`)
    assertInteger(leaf?.durationUs, `trace frame ${frame.frameIdx} leaf duration`)
    assert(
      leaf.startOffsetUs === cursor,
      `trace frame ${frame.frameIdx} leaves overlap or have a gap at ${cursor}us`,
    )
    assert(
      leaf.endOffsetUs > leaf.startOffsetUs &&
        leaf.durationUs === leaf.endOffsetUs - leaf.startOffsetUs,
      `trace frame ${frame.frameIdx} has an invalid leaf interval`,
    )
    assert(
      leaf.startOffsetUs >= frame.startOffsetUs && leaf.endOffsetUs <= frame.endOffsetUs,
      `trace frame ${frame.frameIdx} has a leaf outside the frame`,
    )
    cursor = leaf.endOffsetUs
    const category = String(leaf.category ?? 'unknown')
    const label = String(leaf.label ?? 'unknown')
    const key = contributorKey(category, label)
    let contributor = totals.get(key)
    if (!contributor) {
      contributor = {
        category,
        detailValues: new Set(),
        durationUs: 0,
        key,
        label,
        postBudgetUsNumerator: 0,
        sourceLeafCount: 0,
        traceCategories: new Set(),
        traceNames: new Set(),
      }
      totals.set(key, contributor)
    }
    const rawLeafStartUs =
      rawFrameStartUs + (leaf.startOffsetUs - frame.startOffsetUs) * rawScale
    const rawLeafEndUs =
      rawFrameStartUs + (leaf.endOffsetUs - frame.startOffsetUs) * rawScale
    const durationUs = rawLeafEndUs - rawLeafStartUs
    const postBudgetUs = Math.max(
      0,
      Math.min(rawFrameEndUs, rawLeafEndUs) - Math.max(postBudgetStartUs, rawLeafStartUs),
    )
    contributor.durationUs += durationUs
    contributor.postBudgetUsNumerator += postBudgetUs * budget.denominator
    contributor.sourceLeafCount += 1
    if (leaf.traceName != null) contributor.traceNames.add(String(leaf.traceName))
    if (leaf.traceCategory != null && String(leaf.traceCategory).length > 0) {
      contributor.traceCategories.add(String(leaf.traceCategory))
    }
    const detail = stableDetail(leaf.detail)
    if (detail) contributor.detailValues.add(detail)
  }
  assert(cursor === frame.endOffsetUs, `trace frame ${frame.frameIdx} leaf coverage is incomplete`)
  const budgetState = budgetFields(timing.rawDurationMs, budget)
  const contributors = [...totals.values()]
    .map((contributor) => ({
      category: contributor.category,
      details: [...contributor.detailValues].map((value) => JSON.parse(value)),
      durationPercentOfFrame: (contributor.durationUs / rawTotalUs) * 100,
      durationUs: contributor.durationUs,
      key: contributor.key,
      label: contributor.label,
      ownColorFill: contributor.durationUs > ownFillThresholdUs,
      postBudgetPercent:
        budgetState.overBudgetUsNumerator > 0
          ? (contributor.postBudgetUsNumerator / budgetState.overBudgetUsNumerator) * 100
          : null,
      postBudgetUs: contributor.postBudgetUsNumerator / budget.denominator,
      postBudgetUsNumerator: contributor.postBudgetUsNumerator,
      sourceLeafCount: contributor.sourceLeafCount,
      traceCategories: [...contributor.traceCategories].sort(),
      traceNames: [...contributor.traceNames].sort(),
    }))
    .sort(compareContributors)
  assertClose(
    contributors.reduce((sum, contributor) => sum + contributor.durationUs, 0),
    rawTotalUs,
    `trace frame ${frame.frameIdx} contributors`,
  )
  assertClose(
    contributors.reduce(
      (sum, contributor) => sum + contributor.postBudgetUsNumerator,
      0,
    ),
    budgetState.overBudgetUsNumerator,
    `trace frame ${frame.frameIdx} post-budget contributors`,
  )
  const irreducibleUnownedUs = contributors
    .filter((contributor) => contributor.category === 'irreducible-unowned-wall')
    .reduce((sum, contributor) => sum + contributor.durationUs, 0)
  return {
    ...budgetState,
    boundaryCrossing: timing.boundaryCrossing === true,
    clipped: timing.boundaryCrossing === true,
    contributors,
    endOffsetUs: timing.rawEndOffsetUs,
    frameIdx: frame.frameIdx,
    irreducibleUnownedUs,
    ledgerEndOffsetUs: frame.endOffsetUs,
    ledgerStartOffsetUs: frame.startOffsetUs,
    ledgerTotalUs: frame.totalUs,
    plotEndOffsetUs: timing.plotEndOffsetUs,
    plotStartOffsetUs: timing.plotStartOffsetUs,
    rawDurationMs: timing.rawDurationMs,
    rendererMainActiveUs: mainThread.activeUs * rawScale,
    rendererMainIdleOrUntracedUs: mainThread.idleOrUntracedUs * rawScale,
    startOffsetUs: timing.rawStartOffsetUs,
    totalUs: rawTotalUs,
  }
}

function buildSeries(primaryFrames, ownFillThresholdUs) {
  const own = new Map()
  let residualDurationUs = 0
  let residualPostBudgetUsNumerator = 0
  const residualKeys = new Set()
  for (const frame of primaryFrames) {
    for (const contributor of frame.contributors) {
      if (!contributor.ownColorFill) {
        residualDurationUs += contributor.durationUs
        residualPostBudgetUsNumerator += contributor.postBudgetUsNumerator
        residualKeys.add(contributor.key)
        continue
      }
      let series = own.get(contributor.key)
      if (!series) {
        series = {
          category: contributor.category,
          displayedDurationUs: 0,
          displayedPostBudgetUsNumerator: 0,
          key: contributor.key,
          label: contributor.label,
          sourceDurationUs: 0,
        }
        own.set(contributor.key, series)
      }
      series.displayedDurationUs += contributor.durationUs
      series.displayedPostBudgetUsNumerator += contributor.postBudgetUsNumerator
    }
  }
  for (const frame of primaryFrames) {
    for (const contributor of frame.contributors) {
      const series = own.get(contributor.key)
      if (series) series.sourceDurationUs += contributor.durationUs
    }
  }
  const values = [...own.values()]
  if (residualDurationUs > 0) {
    values.push({
      category: 'residual',
      constituentKeyCount: residualKeys.size,
      displayedDurationUs: residualDurationUs,
      displayedPostBudgetUsNumerator: residualPostBudgetUsNumerator,
      id: RESIDUAL_SERIES_ID,
      key: RESIDUAL_SERIES_ID,
      label: RESIDUAL_SERIES_LABEL,
      sourceDurationUs: residualDurationUs,
    })
  }
  values.sort(
    (left, right) =>
      left.displayedDurationUs - right.displayedDurationUs ||
      left.category.localeCompare(right.category) ||
      left.label.localeCompare(right.label),
  )
  let nextId = 1
  return values.map((series, stackOrder) => ({
    category: series.category,
    ...(series.constituentKeyCount === undefined
      ? {}
      : { constituentKeyCount: series.constituentKeyCount }),
    displayedDurationUs: series.displayedDurationUs,
    displayedPostBudgetUsNumerator: series.displayedPostBudgetUsNumerator,
    id:
      series.id ??
      `responsibility-${String(nextId++).padStart(3, '0')}`,
    key: series.key,
    label: series.label,
    ownFillThresholdUs,
    sourceDurationUs: series.sourceDurationUs,
    stackOrder,
  }))
}

function chartFrame(frame, series, budget) {
  const byKey = new Map(series.map((entry) => [entry.key, entry]))
  const residualSeries = series.find((entry) => entry.id === RESIDUAL_SERIES_ID)
  const buckets = []
  let residualDurationUs = 0
  let residualPostBudgetUsNumerator = 0
  let residualConstituentCount = 0
  for (const contributor of frame.contributors) {
    if (!contributor.ownColorFill) {
      residualDurationUs += contributor.durationUs
      residualPostBudgetUsNumerator += contributor.postBudgetUsNumerator
      residualConstituentCount += 1
      continue
    }
    const ownSeries = byKey.get(contributor.key)
    assert(ownSeries, `trace contributor ${contributor.label} has no chart series`)
    buckets.push({
      category: contributor.category,
      durationPercentOfFrame: contributor.durationPercentOfFrame,
      durationUs: contributor.durationUs,
      label: contributor.label,
      postBudgetUs: contributor.postBudgetUs,
      postBudgetUsNumerator: contributor.postBudgetUsNumerator,
      seriesId: ownSeries.id,
      stackOrder: ownSeries.stackOrder,
    })
  }
  if (residualDurationUs > 0) {
    assert(residualSeries, 'trace frame has residual work but no residual series')
    buckets.push({
      category: 'residual',
      constituentCount: residualConstituentCount,
      durationPercentOfFrame: (residualDurationUs / frame.totalUs) * 100,
      durationUs: residualDurationUs,
      label: RESIDUAL_SERIES_LABEL,
      postBudgetUs: residualPostBudgetUsNumerator / budget.denominator,
      postBudgetUsNumerator: residualPostBudgetUsNumerator,
      seriesId: residualSeries.id,
      stackOrder: residualSeries.stackOrder,
    })
  }
  buckets.sort((left, right) => left.stackOrder - right.stackOrder)
  assertClose(
    buckets.reduce((sum, bucket) => sum + bucket.durationUs, 0),
    frame.totalUs,
    `trace frame ${frame.frameIdx} chart buckets`,
  )
  assertClose(
    buckets.reduce((sum, bucket) => sum + bucket.postBudgetUsNumerator, 0),
    frame.overBudgetUsNumerator,
    `trace frame ${frame.frameIdx} chart post-budget buckets`,
  )
  return {
    boundaryCrossing: frame.boundaryCrossing,
    chartBuckets: buckets,
    clipped: frame.clipped,
    contributorCount: frame.contributors.length,
    endOffsetUs: frame.endOffsetUs,
    frameIdx: frame.frameIdx,
    irreducibleUnownedUs: frame.irreducibleUnownedUs,
    ledgerEndOffsetUs: frame.ledgerEndOffsetUs,
    ledgerStartOffsetUs: frame.ledgerStartOffsetUs,
    ledgerTotalUs: frame.ledgerTotalUs,
    overBudgetUs: frame.overBudgetUs,
    overBudgetUsNumerator: frame.overBudgetUsNumerator,
    ownFillContributorCount: frame.contributors.filter((contributor) => contributor.ownColorFill)
      .length,
    rendererMainActiveUs: frame.rendererMainActiveUs,
    rendererMainIdleOrUntracedUs: frame.rendererMainIdleOrUntracedUs,
    plotEndOffsetUs: frame.plotEndOffsetUs,
    plotStartOffsetUs: frame.plotStartOffsetUs,
    rawDurationMs: frame.rawDurationMs,
    startOffsetUs: frame.startOffsetUs,
    strictBudgetMiss: frame.strictBudgetMiss,
    totalUs: frame.totalUs,
  }
}

function diagnosticSlowFrames(ledger, variant, budget, timelineState) {
  const totalField = variant === 'gpu' ? 'wallIntervalUs' : 'totalUs'
  const frameField = variant === 'gpu' ? 'benchEndFrameIdx' : 'frameIdx'
  return (ledger.frames ?? [])
    .map((frame) => {
      validateWallFrame(frame, variant, totalField, frameField)
      const timing = timelineState.timingByFrameIdx.get(frame[frameField])
      assert(timing, `${variant} ledger frame ${frame[frameField]} has no raw timing`)
      const budgetState = budgetFields(timing.rawDurationMs, budget)
      return {
        ...budgetState,
        boundaryCrossing: timing.boundaryCrossing === true,
        clipped: timing.boundaryCrossing === true,
        endOffsetUs: timing.rawEndOffsetUs,
        frameIdx: frame[frameField],
        ...(variant === 'gpu'
          ? {
              gpuBusyUs: frame.gpuBusyUs,
              gpuComplete: frame.complete === true,
              renderFrameIdx: frame.benchRenderFrameIdx,
            }
          : {}),
        ledgerTotalUs: frame[totalField],
        plotEndOffsetUs: timing.plotEndOffsetUs,
        plotStartOffsetUs: timing.plotStartOffsetUs,
        rawDurationMs: timing.rawDurationMs,
        startOffsetUs: timing.rawStartOffsetUs,
        totalUs: timing.rawDurationMs * 1_000,
      }
    })
    .filter((frame) => frame.strictBudgetMiss)
    .sort(compareFrames)
}

function diagnosticDescriptor({ budget, ledger, role, sourceLedger, timelineState, variant }) {
  const slowFrames = diagnosticSlowFrames(ledger, variant, budget, timelineState)
  return {
    additiveToPrimary: false,
    captureVariant: variant,
    frameCount: timelineState.frames.length,
    role,
    slowFrameCount: slowFrames.length,
    slowFrames,
    sourceLedger,
    sourceSchema: ledger.schema,
  }
}

export function buildZombieFrameResponsibility({
  baselineLedger,
  frameTimelines = {},
  frameBudgetDenominator = DEFAULT_FRAME_BUDGET_DENOMINATOR,
  frameBudgetNumeratorUs = DEFAULT_FRAME_BUDGET_NUMERATOR_US,
  gpuLedger,
  logicalWindow = baselineLedger?.window,
  ownFillThresholdUs = DEFAULT_OWN_FILL_THRESHOLD_US,
  scopedLedger,
  traceLedger,
  v8Ledger,
}) {
  const budget = {
    denominator: frameBudgetDenominator,
    numeratorUs: frameBudgetNumeratorUs,
  }
  isStrictFrameBudgetMiss(0, budget)
  isStrictFrameBudgetMissMs(0, budget)
  assertInteger(ownFillThresholdUs, 'own-fill threshold')
  assert(ownFillThresholdUs >= 0, 'own-fill threshold must be nonnegative')
  const ledgers = [
    ['baseline', baselineLedger],
    ['trace', traceLedger],
    ['v8', v8Ledger],
    ['scoped', scopedLedger],
    ['gpu', gpuLedger],
  ]
  assert(logicalWindow, 'logical frame window is missing')
  const window = { ...logicalWindow }
  for (const [variant, ledger] of ledgers) validateContinuity(ledger, variant)
  for (const [variant, ledger] of ledgers.filter(([variant]) => variant !== 'trace')) {
    validateWindow(ledger, window, variant)
  }
  assert(
    traceLedger.window.startOffsetUs <= window.startOffsetUs &&
      traceLedger.window.endOffsetUs >= window.endOffsetUs,
    'trace ledger does not cover the logical window and its boundary frames',
  )
  const timelineStates = {
    baseline: validateFrameTimeline(
      frameTimelines.baseline,
      baselineLedger,
      'baseline',
      window,
    ),
    gpu: validateFrameTimeline(frameTimelines.gpu, gpuLedger, 'gpu', window, 'benchEndFrameIdx'),
    scoped: validateFrameTimeline(frameTimelines.scoped, scopedLedger, 'scoped', window),
    trace: validateFrameTimeline(frameTimelines.trace, traceLedger, 'trace', window),
    v8: validateFrameTimeline(frameTimelines.v8, v8Ledger, 'v8', window),
  }
  assert(typeof traceLedger.mainThreadKey === 'string', 'trace ledger has no renderer-main key')
  const traceLedgerByFrameIdx = new Map(traceLedger.frames.map((frame) => [frame.frameIdx, frame]))
  const traceFrames = timelineStates.trace.frames.map((timing) => {
    const frame = traceLedgerByFrameIdx.get(timing.frameIdx)
    assert(frame, `trace raw frame ${timing.frameIdx} has no full ledger frame`)
    return frame
  })
  for (const frame of traceFrames) validateWallFrame(frame, 'trace')
  validatePrimaryCoverage(timelineStates.trace.frames, window)
  const traceFrameThreads = traceFrames.map((frame) => {
    const rendererMatches = frame.threads.filter(
      (thread) => thread.key === traceLedger.mainThreadKey,
    )
    assert(
      rendererMatches.length === 1,
      `trace frame ${frame.frameIdx} has ${rendererMatches.length} renderer-main rows`,
    )
    const gpuMatches = frame.threads.filter(
      (thread) => thread.processName === 'GPU Process' && thread.threadName === 'CrGpuMain',
    )
    assert(
      gpuMatches.length === 1,
      `trace frame ${frame.frameIdx} has ${gpuMatches.length} GPU-process CrGpuMain rows`,
    )
    return {
      frame,
      gpuMain: gpuMatches[0],
      rendererMain: rendererMatches[0],
      timing: timelineStates.trace.timingByFrameIdx.get(frame.frameIdx),
    }
  })
  const gpuProcessMainThreadKeys = new Set(
    traceFrameThreads.map(({ gpuMain }) => gpuMain.key),
  )
  assert(
    gpuProcessMainThreadKeys.size === 1,
    'trace ledger changes GPU-process CrGpuMain thread key inside the window',
  )
  const gpuProcessMainThreadKey = [...gpuProcessMainThreadKeys][0]
  const aggregatedFrames = traceFrameThreads.map(({ frame, rendererMain, timing }) =>
    aggregateTraceFrame(frame, rendererMain, timing, budget, ownFillThresholdUs),
  )
  const gpuProcessTrackFrames = traceFrameThreads.map(
    ({ frame, gpuMain, rendererMain, timing }) =>
      gpuProcessTrackFrame(frame, rendererMain, gpuMain, timing),
  )
  const series = buildSeries(aggregatedFrames, ownFillThresholdUs)
  const frames = aggregatedFrames.map((frame) => chartFrame(frame, series, budget))
  const slowFrames = aggregatedFrames
    .filter((frame) => frame.strictBudgetMiss)
    .map((frame) => {
      const chart = frames.find((candidate) => candidate.frameIdx === frame.frameIdx)
      assert(chart, `trace slow frame ${frame.frameIdx} has no chart frame`)
      const seriesByKey = new Map(series.map((entry) => [entry.key, entry]))
      const contributors = frame.contributors.map((contributor, index) => ({
        category: contributor.category,
        chartBucketId: contributor.ownColorFill
          ? seriesByKey.get(contributor.key)?.id
          : RESIDUAL_SERIES_ID,
        chartSeriesId: contributor.ownColorFill
          ? seriesByKey.get(contributor.key)?.id
          : null,
        details: contributor.details,
        durationPercentOfFrame: contributor.durationPercentOfFrame,
        durationUs: contributor.durationUs,
        label: contributor.label,
        ownColorFill: contributor.ownColorFill,
        postBudgetPercent: contributor.postBudgetPercent,
        postBudgetUs: contributor.postBudgetUs,
        postBudgetUsNumerator: contributor.postBudgetUsNumerator,
        rank: index + 1,
        sourceLeafCount: contributor.sourceLeafCount,
        traceCategories: contributor.traceCategories,
        traceNames: contributor.traceNames,
      }))
      assert(
        contributors.every(
          (contributor) =>
            contributor.chartBucketId === RESIDUAL_SERIES_ID ||
            typeof contributor.chartBucketId === 'string',
        ),
        `trace slow frame ${frame.frameIdx} has an unmapped contributor`,
      )
      return { ...chart, contributors }
    })
  const diagnostics = {
    baseline: diagnosticDescriptor({
      budget,
      ledger: baselineLedger,
      role: 'observer-light wall timing from a separate cold capture',
      sourceLedger: 'atomic-baseline-wall.json',
      timelineState: timelineStates.baseline,
      variant: 'baseline',
    }),
    gpu: diagnosticDescriptor({
      budget,
      ledger: gpuLedger,
      role: 'timestamped GPU busy time from a separate cold capture; never CPU wall time',
      sourceLedger: 'atomic-webgpu-passes.json',
      timelineState: timelineStates.gpu,
      variant: 'gpu',
    }),
    scoped: diagnosticDescriptor({
      budget,
      ledger: scopedLedger,
      role:
        'duration-only scoped application buckets from a separate cold capture, proportionally normalized to each bench wall interval; normalized responsibility only, not measured compute or exact per-frame timing',
      sourceLedger: 'atomic-scoped-app-systems.json',
      timelineState: timelineStates.scoped,
      variant: 'scoped',
    }),
    v8: diagnosticDescriptor({
      budget,
      ledger: v8Ledger,
      role: 'statistical V8 sampling from a separate cold capture',
      sourceLedger: 'atomic-v8-samples.json',
      timelineState: timelineStates.v8,
      variant: 'v8',
    }),
  }
  return {
    diagnostics,
    invariants: {
      allContinuityIssueCounts: Object.fromEntries(
        ledgers.map(([variant, ledger]) => [
          variant,
          ledger.invariants.frameContinuityIssues.length,
        ]),
      ),
      chartFrameReconciliation: true,
      contributorFrameReconciliation: true,
      postBudgetTailReconciliation: true,
      primaryFrameCount: frames.length,
      primarySlowFrameCount: slowFrames.length,
      gpuProcessTrackFrameCount: gpuProcessTrackFrames.length,
    },
    parallelTracks: [
      {
        activeUs: gpuProcessTrackFrames.reduce((sum, frame) => sum + frame.activeUs, 0),
        activeWhileRendererMainIdleOrUntracedUs: gpuProcessTrackFrames.reduce(
          (sum, frame) => sum + frame.activeWhileRendererMainIdleOrUntracedUs,
          0,
        ),
        additiveToPrimary: false,
        captureVariant: 'trace',
        frames: gpuProcessTrackFrames,
        id: 'gpu-process-cr-gpu-main',
        key: gpuProcessMainThreadKey,
        label: 'GPU-process CrGpuMain traced active wall occupancy',
        processName: 'GPU Process',
        role:
          'parallel Chrome GPU-process main-thread wall occupancy; shown separately and never added to the renderer-main 100% stack',
        sourceLedger: 'atomic-chrome-thread-wall-full-frames.json',
        sourceSchema: traceLedger.schema,
        threadName: 'CrGpuMain',
      },
    ],
    primary: {
      additiveBasis:
        'one exact trace-capture wall partition: renderer-main work plus named overlapping Chrome owners during renderer gaps, with only ownerless wall left irreducible',
      captureVariant: 'trace',
      frameMembership: frameTimelines.trace?.frameMembership ?? 'ledger frames overlapping window',
      frames,
      mainThreadKey: traceLedger.mainThreadKey,
      series: series.map(({ key, ...entry }) => entry),
      seriesOrdering: 'ascending aggregate displayed duration; largest series is topmost',
      slowFrameCount: slowFrames.length,
      slowFrames,
      sourceLedger: 'atomic-chrome-thread-wall-full-frames.json',
      sourceSchema: traceLedger.schema,
    },
    rules: {
      coloredFill: `aggregate category+label duration strictly greater than ${ownFillThresholdUs}us`,
      frameBudgetUs: frameBudgetNumeratorUs / frameBudgetDenominator,
      frameBudgetUsDenominator: frameBudgetDenominator,
      frameBudgetUsNumerator: frameBudgetNumeratorUs,
      ownFillThresholdUs,
      residualLabel: RESIDUAL_SERIES_LABEL,
      strictFrameMiss: 'rawDurationMs * frameBudgetUsDenominator > frameBudgetUsNumerator / 1000',
    },
    schema: 'landrush-zombie-frame-responsibility/v2',
    unit: 'microseconds',
    window,
  }
}

function diagnosticRows(bundle) {
  const order = ['baseline', 'v8', 'scoped', 'gpu']
  return order.flatMap((variant) => {
    const diagnostic = bundle.diagnostics[variant]
    return diagnostic.slowFrames.map((frame) => ({
      boundary_crossing: frame.boundaryCrossing,
      capture_role: diagnostic.role,
      capture_variant: variant,
      clipped: frame.clipped,
      contributor_count: null,
      end_offset_us: frame.endOffsetUs,
      frame_idx: frame.frameIdx,
      frame_ms: decimal(frame.totalUs / 1_000),
      gpu_busy_us: frame.gpuBusyUs ?? null,
      gpu_complete: frame.gpuComplete ?? null,
      ledger_total_us: frame.ledgerTotalUs,
      over_budget_ms: decimal(frame.overBudgetUs / 1_000),
      over_budget_us: decimal(frame.overBudgetUs),
      over_budget_us_numerator: frame.overBudgetUsNumerator,
      own_fill_contributor_count: null,
      primary_exact_attribution: false,
      plot_end_offset_us: frame.plotEndOffsetUs,
      plot_start_offset_us: frame.plotStartOffsetUs,
      raw_duration_ms: frame.rawDurationMs,
      render_frame_idx: frame.renderFrameIdx ?? null,
      renderer_main_active_us: null,
      renderer_main_idle_or_untraced_us: null,
      source_ledger: diagnostic.sourceLedger,
      start_offset_us: frame.startOffsetUs,
      total_us: frame.totalUs,
    }))
  })
}

export function slowFrameRows(bundle) {
  const budgetNumerator = bundle.rules.frameBudgetUsNumerator
  const budgetDenominator = bundle.rules.frameBudgetUsDenominator
  const primaryRows = bundle.primary.slowFrames.map((frame) => ({
    boundary_crossing: frame.boundaryCrossing,
    capture_role: bundle.primary.additiveBasis,
    capture_variant: bundle.primary.captureVariant,
    clipped: frame.clipped,
    contributor_count: frame.contributorCount,
    end_offset_us: frame.endOffsetUs,
    frame_idx: frame.frameIdx,
    frame_ms: decimal(frame.totalUs / 1_000),
    gpu_busy_us: null,
    gpu_complete: null,
    ledger_total_us: frame.ledgerTotalUs,
    over_budget_ms: decimal(frame.overBudgetUs / 1_000),
    over_budget_us: decimal(frame.overBudgetUs),
    over_budget_us_numerator: frame.overBudgetUsNumerator,
    own_fill_contributor_count: frame.ownFillContributorCount,
    primary_exact_attribution: true,
    plot_end_offset_us: frame.plotEndOffsetUs,
    plot_start_offset_us: frame.plotStartOffsetUs,
    raw_duration_ms: frame.rawDurationMs,
    render_frame_idx: null,
    renderer_main_active_us: frame.rendererMainActiveUs,
    renderer_main_idle_or_untraced_us: frame.rendererMainIdleOrUntracedUs,
    source_ledger: bundle.primary.sourceLedger,
    start_offset_us: frame.startOffsetUs,
    total_us: frame.totalUs,
  }))
  return [...diagnosticRows(bundle), ...primaryRows]
    .map((row) => ({
      ...row,
      budget_us_denominator: budgetDenominator,
      budget_us_numerator: budgetNumerator,
    }))
    .sort(
      (left, right) =>
        left.start_offset_us - right.start_offset_us ||
        left.capture_variant.localeCompare(right.capture_variant) ||
        left.frame_idx - right.frame_idx,
    )
}

export function slowFrameContributorRows(bundle) {
  return bundle.primary.slowFrames.flatMap((frame) =>
    frame.contributors.map((contributor) => ({
      boundary_crossing: frame.boundaryCrossing,
      capture_variant: bundle.primary.captureVariant,
      category: contributor.category,
      chart_bucket_id: contributor.chartBucketId,
      chart_series_id: contributor.chartSeriesId,
      contributor_rank: contributor.rank,
      details_json: JSON.stringify(contributor.details),
      duration_ms: decimal(contributor.durationUs / 1_000),
      duration_us: contributor.durationUs,
      end_offset_us: frame.endOffsetUs,
      frame_idx: frame.frameIdx,
      frame_ms: decimal(frame.totalUs / 1_000),
      frame_percent: decimal(contributor.durationPercentOfFrame),
      label: contributor.label,
      over_budget_us: decimal(frame.overBudgetUs),
      over_budget_us_numerator: frame.overBudgetUsNumerator,
      own_color_fill: contributor.ownColorFill,
      plot_end_offset_us: frame.plotEndOffsetUs,
      plot_start_offset_us: frame.plotStartOffsetUs,
      post_budget_ms: decimal(contributor.postBudgetUs / 1_000),
      post_budget_percent: decimal(contributor.postBudgetPercent),
      post_budget_us: decimal(contributor.postBudgetUs),
      post_budget_us_numerator: contributor.postBudgetUsNumerator,
      raw_duration_ms: frame.rawDurationMs,
      source_leaf_count: contributor.sourceLeafCount,
      source_ledger: bundle.primary.sourceLedger,
      start_offset_us: frame.startOffsetUs,
      trace_categories: contributor.traceCategories.join('; '),
      trace_names: contributor.traceNames.join('; '),
    })),
  )
}

function csvEscape(value) {
  const text = value == null ? '' : String(value)
  return /[",\n\r]/u.test(text) ? `"${text.replaceAll('"', '""')}"` : text
}

export function rowsToCsv(rows, headers) {
  assert(Array.isArray(rows), 'CSV rows must be an array')
  assert(Array.isArray(headers) && headers.length > 0, 'CSV headers must be a nonempty array')
  return `${[
    headers.join(','),
    ...rows.map((row) => headers.map((header) => csvEscape(row[header])).join(',')),
  ].join('\n')}\n`
}

export function serializeSlowFramesCsv(bundle) {
  return rowsToCsv(slowFrameRows(bundle), SLOW_FRAME_HEADERS)
}

export function serializeSlowFrameContributorsCsv(bundle) {
  return rowsToCsv(
    slowFrameContributorRows(bundle),
    SLOW_FRAME_CONTRIBUTOR_HEADERS,
  )
}

export const ZOMBIE_FRAME_RESPONSIBILITY_DEFAULTS = Object.freeze({
  frameBudgetDenominator: DEFAULT_FRAME_BUDGET_DENOMINATOR,
  frameBudgetNumeratorUs: DEFAULT_FRAME_BUDGET_NUMERATOR_US,
  ownFillThresholdUs: DEFAULT_OWN_FILL_THRESHOLD_US,
})
