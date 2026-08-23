// Post-run budget evaluation over frames.jsonl + events.jsonl + trace.jsonl.
// Frame cadence is authoritative in observer-light runs. CPU/GPU ledgers are
// scoped diagnostics; requested profilers with incomplete coverage invalidate
// a run instead of silently becoming positive evidence.

import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'

const DEFAULT_FPS_TARGET = 60
const FRAME_BUDGET_TOLERANCE_MS = 0.75
const ROLLING_FPS_WINDOW_MS = 1000
const ROLLING_FPS_MIN_COVERAGE_MS = 900
const ROLLING_FPS_TOLERANCE = 1
const FREEZE_THRESHOLD_MS = 250
const PROFILER_MIN_COVERAGE_RATE = 0.9
const EVIDENCE_LIMIT = 20

const round1 = (value) =>
  value === null || value === undefined ? null : Math.round(value * 10) / 10
const round2 = (value) =>
  value === null || value === undefined ? null : Math.round(value * 100) / 100

function percentile(sortedAsc, percentileValue) {
  if (sortedAsc.length === 0) return null
  const index = Math.min(
    sortedAsc.length - 1,
    Math.ceil((percentileValue / 100) * sortedAsc.length) - 1,
  )
  return sortedAsc[Math.max(0, index)]
}

function stats(values) {
  const sorted = values.filter((value) => Number.isFinite(value)).sort((a, b) => a - b)
  if (sorted.length === 0) {
    return { n: 0, avg: null, min: null, p50: null, p95: null, p99: null, max: null }
  }
  const sum = sorted.reduce((total, value) => total + value, 0)
  return {
    n: sorted.length,
    avg: round2(sum / sorted.length),
    min: round2(sorted[0]),
    p50: round2(percentile(sorted, 50)),
    p95: round2(percentile(sorted, 95)),
    p99: round2(percentile(sorted, 99)),
    max: round2(sorted.at(-1)),
  }
}

function rate(count, total) {
  return total > 0 ? count / total : null
}

function percent(value) {
  return value === null ? null : round2(value * 100)
}

function gate(gateName, status, detail) {
  return {
    gate: gateName,
    status,
    pass: status === 'pass' ? true : status === 'fail' ? false : null,
    detail,
  }
}

function measuredGate(gateName, condition, detail) {
  return gate(gateName, condition ? 'pass' : 'fail', detail)
}

function unmeasuredGate(gateName, detail) {
  return gate(gateName, 'unmeasured', detail)
}

export function readJsonl(filePath) {
  try {
    return readFileSync(filePath, 'utf8')
      .split('\n')
      .filter(Boolean)
      .map((line) => JSON.parse(line))
  } catch {
    return []
  }
}

function compactFrameRanges(entries) {
  const ids = [
    ...new Set(
      entries
        .map((entry) => (typeof entry === 'number' ? entry : entry?.frameIdx))
        .filter(Number.isInteger),
    ),
  ].sort((left, right) => left - right)
  if (ids.length === 0) return []
  const ranges = []
  let start = ids[0]
  let end = start
  for (let index = 1; index < ids.length; index += 1) {
    const frameIdx = ids[index]
    if (frameIdx === end + 1) {
      end = frameIdx
    } else {
      ranges.push(start === end ? String(start) : `${start}-${end}`)
      start = frameIdx
      end = frameIdx
    }
  }
  ranges.push(start === end ? String(start) : `${start}-${end}`)
  return ranges
}

function boundedWorst(entries, valueField, limit = EVIDENCE_LIMIT) {
  return entries
    .slice()
    .sort((left, right) => (right[valueField] ?? 0) - (left[valueField] ?? 0))
    .slice(0, limit)
}

function resolveDisplayTiming(dts, meta) {
  const explicitHz = Number(meta.displayHz)
  if (Number.isFinite(explicitHz) && explicitHz > 0) {
    return {
      authoritative: true,
      hz: explicitHz,
      intervalMs: 1000 / explicitHz,
      source: 'meta.displayHz',
    }
  }
  const lowerTailDt = percentile([...dts].sort((a, b) => a - b), 5)
  if (Number.isFinite(lowerTailDt) && lowerTailDt > 0) {
    const intervalMs = Math.max(1000 / 240, Math.min(1000 / 30, lowerTailDt))
    return {
      authoritative: false,
      hz: 1000 / intervalMs,
      intervalMs,
      source: 'diagnostic-inference-frame-dt-p5',
    }
  }
  return {
    authoritative: false,
    hz: DEFAULT_FPS_TARGET,
    intervalMs: 1000 / DEFAULT_FPS_TARGET,
    source: 'diagnostic-default-60hz-no-frame-samples',
  }
}

function longestConsecutiveRun(entries) {
  if (entries.length === 0) return null
  const sorted = entries.slice().sort((a, b) => a.frameIdx - b.frameIdx)
  let currentStart = sorted[0]
  let currentEnd = sorted[0]
  let currentCount = 0
  let currentDurationMs = 0
  let longest = null
  for (const entry of sorted) {
    if (currentCount > 0 && entry.frameIdx !== currentEnd.frameIdx + 1) {
      currentStart = entry
      currentCount = 0
      currentDurationMs = 0
    }
    currentEnd = entry
    currentCount += 1
    currentDurationMs += entry.dtMs
    if (!longest || currentCount > longest.count) {
      longest = {
        count: currentCount,
        startFrameIdx: currentStart.frameIdx,
        endFrameIdx: currentEnd.frameIdx,
        durationMs: currentDurationMs,
      }
    }
  }
  return longest
}

function classifyFrameBudget(frames, targetFps, display) {
  const budgetMs = 1000 / targetFps
  const expectedDisplayIntervals = Math.max(
    1,
    Math.ceil(budgetMs / display.intervalMs - Number.EPSILON),
  )
  const expectedMaxMs = expectedDisplayIntervals * display.intervalMs
  const rawMissThresholdMs = budgetMs + FRAME_BUDGET_TOLERANCE_MS
  const missedPresentationThresholdMs = expectedMaxMs + FRAME_BUDGET_TOLERANCE_MS
  const severeThresholdMs = Math.max(
    budgetMs * 2,
    expectedMaxMs + display.intervalMs + FRAME_BUDGET_TOLERANCE_MS,
  )
  const eligibleFrames = frames.filter(
    (frame) => Number.isFinite(frame.dtMs) && frame.dtMs > 0,
  )
  const misses = []
  for (const frame of eligibleFrames) {
    if (frame.dtMs <= rawMissThresholdMs) continue
    const severe = frame.dtMs >= severeThresholdMs
    const missedPresentation = frame.dtMs > missedPresentationThresholdMs
    const missedVsyncs = missedPresentation
      ? Math.max(
          1,
          Math.ceil(
            (frame.dtMs - FRAME_BUDGET_TOLERANCE_MS) / display.intervalMs - Number.EPSILON,
          ) - expectedDisplayIntervals,
        )
      : 0
    misses.push({
      frameIdx: frame.frameIdx,
      wallT: frame.wallT,
      dtMs: frame.dtMs,
      overBudgetMs: frame.dtMs - budgetMs,
      classification: severe
        ? 'severe'
        : missedPresentation
          ? 'missed-presentation'
          : 'expected-display-quantized-pacing',
      expectedDisplayIntervals,
      presentationIntervals: expectedDisplayIntervals + missedVsyncs,
      missedVsyncs,
    })
  }
  const expectedQuantized = misses.filter(
    (miss) => miss.classification === 'expected-display-quantized-pacing',
  )
  const missedPresentations = misses.filter((miss) => miss.missedVsyncs > 0)
  const severe = misses.filter((miss) => miss.classification === 'severe')
  const rawRate = rate(misses.length, eligibleFrames.length)
  const presentationRate = rate(missedPresentations.length, eligibleFrames.length)
  return {
    misses,
    summary: {
      targetFps,
      budgetMs,
      toleranceMs: FRAME_BUDGET_TOLERANCE_MS,
      rawMissThresholdMs,
      display,
      expectedDisplayIntervals,
      expectedMaxMs,
      missedPresentationThresholdMs,
      severeThresholdMs,
      eligibleFrameCount: eligibleFrames.length,
      rawMisses: {
        count: misses.length,
        rate: rawRate,
        ratePct: percent(rawRate),
        frameRanges: compactFrameRanges(misses),
        longestRun: longestConsecutiveRun(misses),
        worst: boundedWorst(misses, 'dtMs'),
      },
      expectedQuantizedPacing: {
        count: expectedQuantized.length,
        frameRanges: compactFrameRanges(expectedQuantized),
      },
      missedPresentations: {
        count: missedPresentations.length,
        rate: presentationRate,
        ratePct: percent(presentationRate),
        missedVsyncs: missedPresentations.reduce((sum, miss) => sum + miss.missedVsyncs, 0),
        frameRanges: compactFrameRanges(missedPresentations),
        longestRun: longestConsecutiveRun(missedPresentations),
        worst: boundedWorst(missedPresentations, 'dtMs'),
      },
      severe: {
        count: severe.length,
        frameRanges: compactFrameRanges(severe),
        longestRun: longestConsecutiveRun(severe),
        worst: boundedWorst(severe, 'dtMs'),
      },
    },
  }
}

function buildRollingEpisodes(lowSamples) {
  const episodes = []
  let current = []
  const flush = () => {
    if (current.length === 0) return
    const first = current[0]
    const last = current.at(-1)
    const fpsValues = current.map((sample) => sample.fps)
    episodes.push({
      startFrameIdx: first.frameIdx,
      endFrameIdx: last.frameIdx,
      startWallT: first.wallT,
      endWallT: last.wallT,
      detectionDurationMs: Math.max(0, last.wallT - first.wallT),
      coveredFromFrameIdx: first.windowStartFrameIdx,
      coveredFromWallT: first.windowStartWallT,
      coveredDurationMs: Math.max(0, last.wallT - first.windowStartWallT),
      sampleCount: current.length,
      minFps: Math.min(...fpsValues),
      avgFps: fpsValues.reduce((sum, value) => sum + value, 0) / fpsValues.length,
    })
    current = []
  }
  for (const sample of lowSamples) {
    if (current.length > 0 && sample.frameIdx !== current.at(-1).frameIdx + 1) flush()
    current.push(sample)
  }
  flush()
  return episodes
}

function analyzeRollingFps(frames, targetFps) {
  const cadenceFrames = frames.filter(
    (frame) =>
      Number.isFinite(frame.wallT) && Number.isFinite(frame.dtMs) && frame.dtMs > 0,
  )
  const thresholdFps = targetFps - ROLLING_FPS_TOLERANCE
  const samples = []
  let startIndex = 0
  for (let endIndex = 0; endIndex < cadenceFrames.length; endIndex += 1) {
    const end = cadenceFrames[endIndex]
    while (
      startIndex + 1 < endIndex &&
      end.wallT - cadenceFrames[startIndex].wallT > ROLLING_FPS_WINDOW_MS
    ) {
      startIndex += 1
    }
    const start = cadenceFrames[startIndex]
    const spanMs = end.wallT - start.wallT
    if (spanMs < ROLLING_FPS_MIN_COVERAGE_MS || endIndex <= startIndex) continue
    samples.push({
      frameIdx: end.frameIdx,
      wallT: end.wallT,
      windowStartFrameIdx: start.frameIdx,
      windowStartWallT: start.wallT,
      spanMs,
      fps: ((endIndex - startIndex) * 1000) / spanMs,
    })
  }
  const lowSamples = samples.filter((sample) => sample.fps < thresholdFps)
  const episodes = buildRollingEpisodes(lowSamples)
  const worstEpisodes = episodes
    .slice()
    .sort((left, right) => left.minFps - right.minFps || right.sampleCount - left.sampleCount)
    .slice(0, EVIDENCE_LIMIT)
  const worstSample = lowSamples.reduce(
    (worst, sample) => (!worst || sample.fps < worst.fps ? sample : worst),
    null,
  )
  return {
    targetFps,
    windowMs: ROLLING_FPS_WINDOW_MS,
    minCoverageMs: ROLLING_FPS_MIN_COVERAGE_MS,
    toleranceFps: ROLLING_FPS_TOLERANCE,
    thresholdFps,
    sampleCount: samples.length,
    fps: stats(samples.map((sample) => sample.fps)),
    lowSampleCount: lowSamples.length,
    lowSampleFrameRanges: compactFrameRanges(lowSamples),
    episodeCount: episodes.length,
    episodes: worstEpisodes,
    episodeEvidenceLimit: EVIDENCE_LIMIT,
    worstSample,
  }
}

function peakFrame(frames, field) {
  return frames.reduce((peak, frame) => {
    const value = frame[field]
    if (!Number.isFinite(value)) return peak
    return !peak || value > peak.value
      ? { frameIdx: frame.frameIdx, wallT: frame.wallT, value }
      : peak
  }, null)
}

function renderLoad(frames) {
  return {
    draws: stats(frames.map((frame) => frame.draws)),
    triangles: stats(frames.map((frame) => frame.tris)),
    peakDrawFrame: peakFrame(frames, 'draws'),
    peakTriangleFrame: peakFrame(frames, 'tris'),
  }
}

function isCleanupInput(row) {
  return row?.kind === 'releaseAll' || /cleanup|release all held input/iu.test(row?.intent ?? '')
}

function isInputRecord(row) {
  return (
    row &&
    typeof row.kind === 'string' &&
    (Number.isFinite(row.seq) || /^(gamepad|controller|input)[:/-]/u.test(row.kind))
  )
}

function isInputSummary(row) {
  return row.kind === 'key' || row.kind === 'releaseAll'
}

function inputModality(kind) {
  if (/^key/u.test(kind)) return 'keyboard'
  if (/^(move|click|drag|wheel|mouseDown|mouseUp)$/u.test(kind)) return 'pointer'
  if (/^(gamepad|controller)[:/-]/u.test(kind)) return 'controller'
  return 'other'
}

function gapEvidence(ms, from, to) {
  const endpoint = (row) => ({
    seq: row.seq ?? null,
    t: row.t,
    kind: row.kind,
    intent: row.intent ?? null,
    boundary: row.boundary ?? null,
  })
  return { ms, from: endpoint(from), to: endpoint(to) }
}

function maximumDispatchGap(dispatchRecords, startBoundary, endBoundary) {
  const timeline = [
    { ...startBoundary, boundary: 'measurement-start' },
    ...dispatchRecords,
    { ...endBoundary, boundary: 'measurement-end' },
  ].sort((a, b) => a.t - b.t || (a.seq ?? -1) - (b.seq ?? -1))
  let maximum = null
  for (let index = 1; index < timeline.length; index += 1) {
    const from = timeline[index - 1]
    const to = timeline[index]
    const gapMs = to.t - from.t
    if (!maximum || gapMs > maximum.ms) maximum = gapEvidence(gapMs, from, to)
  }
  return maximum
}

function maximumUncontrolledIdle(inputRecords, startBoundary, endBoundary) {
  const heldKeys = new Set()
  const heldMouseButtons = new Set()
  let idleStart = { ...startBoundary, boundary: 'measurement-start' }
  let maximum = null
  const updateMaximum = (to) => {
    if (!idleStart) return
    const gapMs = to.t - idleStart.t
    if (!maximum || gapMs > maximum.ms) maximum = gapEvidence(gapMs, idleStart, to)
  }
  for (const row of inputRecords) {
    if (!Number.isFinite(row.t)) continue
    const cleanup = isCleanupInput(row)
    const summary = isInputSummary(row)
    const wasControlled = heldKeys.size > 0 || heldMouseButtons.size > 0
    const userDispatch = !cleanup && !summary
    if (!wasControlled && userDispatch) updateMaximum(row)

    if (row.kind === 'keyDown') heldKeys.add(String(row.key).toLowerCase())
    else if (row.kind === 'keyUp') heldKeys.delete(String(row.key).toLowerCase())
    else if (row.kind === 'mouseDown') heldMouseButtons.add(row.button ?? 'left')
    else if (row.kind === 'mouseUp') heldMouseButtons.delete(row.button ?? 'left')
    else if (row.kind === 'releaseAll') {
      heldKeys.clear()
      heldMouseButtons.clear()
    }

    const controlled = heldKeys.size > 0 || heldMouseButtons.size > 0
    if (controlled) idleStart = null
    else if (wasControlled || userDispatch) idleStart = row
  }
  if (heldKeys.size === 0 && heldMouseButtons.size === 0) {
    updateMaximum({ ...endBoundary, boundary: 'measurement-end' })
  }
  return {
    heldAtEnd: { keys: [...heldKeys].sort(), mouseButtons: [...heldMouseButtons].sort() },
    maximum,
  }
}

function analyzeInputs(trace, expectedWindow, measureFromFrame, measureToFrame) {
  const timedTrace = trace
    .filter((row) => Number.isFinite(row?.t))
    .slice()
    .sort((a, b) => a.t - b.t || (a.seq ?? -1) - (b.seq ?? -1))
  const starts = timedTrace.filter(
    (row) => row.kind === 'measurement-boundary' && row.edge === 'start',
  )
  const ends = timedTrace.filter(
    (row) => row.kind === 'measurement-boundary' && row.edge === 'end',
  )
  const startBoundary = starts[0] ?? null
  const endBoundary = ends[0] ?? null
  const issues = []
  if (starts.length !== 1) issues.push(`expected 1 start boundary, received ${starts.length}`)
  if (ends.length !== 1) issues.push(`expected 1 end boundary, received ${ends.length}`)
  if (startBoundary && endBoundary && endBoundary.t <= startBoundary.t) {
    issues.push('end boundary does not follow start boundary')
  }
  if (!expectedWindow || typeof expectedWindow !== 'object') {
    issues.push('meta.measurementWindow is missing')
  } else {
    if (expectedWindow.startFrameIdx !== measureFromFrame) {
      issues.push('meta.measurementWindow start frame disagrees with report window')
    }
    if (expectedWindow.endFrameIdx !== measureToFrame) {
      issues.push('meta.measurementWindow end frame disagrees with report window')
    }
  }
  if (expectedWindow && startBoundary && endBoundary) {
    if (startBoundary.frameIdx !== expectedWindow.startFrameIdx) {
      issues.push('trace start frame disagrees with meta.measurementWindow')
    }
    if (endBoundary.frameIdx !== expectedWindow.endFrameIdx) {
      issues.push('trace end frame disagrees with meta.measurementWindow')
    }
    if (startBoundary.t !== expectedWindow.startDriverT) {
      issues.push('trace start timestamp disagrees with meta.measurementWindow')
    }
    if (endBoundary.t !== expectedWindow.endDriverT) {
      issues.push('trace end timestamp disagrees with meta.measurementWindow')
    }
  }
  const valid = issues.length === 0
  const measuredTrace = valid
    ? timedTrace.filter((row) => row.t >= startBoundary.t && row.t <= endBoundary.t)
    : []
  const inputRecords = measuredTrace.filter(isInputRecord)
  const dispatchRecords = inputRecords.filter(
    (row) => !isInputSummary(row) && !isCleanupInput(row),
  )
  const byKind = new Map()
  const byIntent = new Map()
  const modalities = { keyboard: false, pointer: false, controller: false, other: false }
  for (const row of dispatchRecords) {
    byKind.set(row.kind, (byKind.get(row.kind) ?? 0) + 1)
    if (typeof row.intent === 'string' && row.intent.length > 0) {
      byIntent.set(row.intent, (byIntent.get(row.intent) ?? 0) + 1)
    }
    modalities[inputModality(row.kind)] = true
  }
  const durationMs = valid ? endBoundary.t - startBoundary.t : null
  const idle = valid
    ? maximumUncontrolledIdle(inputRecords, startBoundary, endBoundary)
    : { heldAtEnd: { keys: [], mouseButtons: [] }, maximum: null }
  return {
    status: valid ? 'measured' : 'unmeasured',
    measurementWindow: {
      valid,
      issues,
      startCount: starts.length,
      endCount: ends.length,
      start: startBoundary,
      end: endBoundary,
      durationMs,
    },
    traceRecordCount: trace.length,
    measuredTraceRecordCount: measuredTrace.length,
    inputRecordCount: inputRecords.length,
    dispatchRecordCount: dispatchRecords.length,
    cleanupRecordCount: inputRecords.filter(isCleanupInput).length,
    summaryRecordCount: inputRecords.filter(isInputSummary).length,
    byKind: Object.fromEntries([...byKind].sort(([a], [b]) => a.localeCompare(b))),
    byIntent: Object.fromEntries([...byIntent].sort(([a], [b]) => a.localeCompare(b))),
    modalities,
    firstInput: dispatchRecords[0] ?? null,
    lastInput: dispatchRecords.at(-1) ?? null,
    actionsPerMinute:
      durationMs && durationMs > 0
        ? round2((dispatchRecords.length * 60000) / durationMs)
        : null,
    maxDispatchGap: valid
      ? maximumDispatchGap(dispatchRecords, startBoundary, endBoundary)
      : null,
    maxUncontrolledIdleGap: idle.maximum,
    heldAtEnd: idle.heldAtEnd,
  }
}

function phaseBoundary(label) {
  const match = /^(.*?)(?:[-:](start|end))$/u.exec(label)
  return match ? { name: match[1], edge: match[2] } : null
}

function makePhaseSegment(name, depth, start, end, frames, missByFrame) {
  const segmentFrames = frames.filter(
    (frame) => frame.frameIdx >= start.frameIdx && frame.frameIdx < end.frameIdx,
  )
  const cadenceFrames = frames.filter(
    (frame) =>
      frame.frameIdx > start.frameIdx &&
      frame.frameIdx <= end.frameIdx &&
      frame.dtMs > 0,
  )
  const cadence = stats(cadenceFrames.map((frame) => frame.dtMs))
  const budgetMisses = cadenceFrames
    .map((frame) => missByFrame.get(frame.frameIdx))
    .filter(Boolean)
  const missedPresentations = budgetMisses.filter((miss) => miss.missedVsyncs > 0)
  return {
    name,
    status: 'closed',
    depth,
    range: '[start,end)',
    startLabel: start.label,
    endLabel: end.label,
    startFrameIdx: start.frameIdx,
    endFrameIdxExclusive: end.frameIdx,
    startWallT: start.wallT,
    endWallT: end.wallT,
    durationMs: Math.max(0, end.wallT - start.wallT),
    frameCount: segmentFrames.length,
    cadence: { fpsEffective: cadence.avg ? round1(1000 / cadence.avg) : null, dt: cadence },
    frameBudget: {
      rawMissCount: budgetMisses.length,
      rawMissRate: rate(budgetMisses.length, cadenceFrames.length),
      rawMissFrameRanges: compactFrameRanges(budgetMisses),
      missedPresentationCount: missedPresentations.length,
      missedPresentationFrameRanges: compactFrameRanges(missedPresentations),
    },
    render: renderLoad(segmentFrames),
  }
}

function analyzePhases(frames, frameBudgetMisses) {
  const marks = frames.flatMap((frame) =>
    (Array.isArray(frame.marks) ? frame.marks : []).map((label, order) => ({
      label,
      order,
      frameIdx: frame.frameIdx,
      wallT: frame.wallT,
    })),
  )
  const stack = []
  const segments = []
  const pointMarks = []
  const unpairedMarks = []
  const overlapIssues = []
  const missByFrame = new Map(frameBudgetMisses.map((miss) => [miss.frameIdx, miss]))
  for (const mark of marks) {
    const boundary = phaseBoundary(mark.label)
    if (!boundary) {
      pointMarks.push(mark)
    } else if (boundary.edge === 'start') {
      stack.push({ ...mark, name: boundary.name, depth: stack.length })
    } else {
      const matchingIndex = stack.findLastIndex((start) => start.name === boundary.name)
      if (matchingIndex < 0) {
        unpairedMarks.push({ ...mark, reason: 'missing start' })
        continue
      }
      while (stack.length - 1 > matchingIndex) {
        unpairedMarks.push({ ...stack.pop(), reason: `missing end before ${mark.label}` })
      }
      const start = stack.pop()
      segments.push(makePhaseSegment(boundary.name, start.depth, start, mark, frames, missByFrame))
    }
  }
  for (const start of stack) unpairedMarks.push({ ...start, reason: 'missing end' })
  segments.sort(
    (a, b) => a.depth - b.depth || a.startFrameIdx - b.startFrameIdx || a.name.localeCompare(b.name),
  )
  const lastByDepth = new Map()
  for (const segment of segments) {
    const previous = lastByDepth.get(segment.depth)
    if (previous && segment.startFrameIdx < previous.endFrameIdxExclusive) {
      overlapIssues.push(`depth ${segment.depth}: ${previous.name} overlaps ${segment.name}`)
    }
    lastByDepth.set(segment.depth, segment)
  }
  return {
    markCount: marks.length,
    boundaryMarkCount: marks.length - pointMarks.length,
    pointMarks: { count: pointMarks.length, marks: pointMarks.slice(0, EVIDENCE_LIMIT) },
    segments,
    pairing: {
      valid: unpairedMarks.length === 0 && overlapIssues.length === 0,
      unpairedCount: unpairedMarks.length,
      unpairedMarks: unpairedMarks.slice(0, EVIDENCE_LIMIT),
      overlapIssueCount: overlapIssues.length,
      overlapIssues: overlapIssues.slice(0, EVIDENCE_LIMIT),
    },
  }
}

function taskStarvationSummary(starvations) {
  return {
    count: starvations.length,
    frameRanges: compactFrameRanges(starvations),
    evalMs: stats(starvations.map((episode) => episode.evalMs)),
    mergedPollCount: starvations.reduce(
      (sum, episode) => sum + (Number.isFinite(episode.count) ? episode.count : 1),
      0,
    ),
    worst: boundedWorst(starvations, 'evalMs'),
  }
}

function freezeSummary(freezes) {
  return {
    count: freezes.length,
    frameRanges: compactFrameRanges(freezes),
    stallMs: stats(freezes.map((freeze) => freeze.stallMs)),
    worst: boundedWorst(freezes, 'stallMs'),
  }
}

function collectFreezeEvidence(cadenceFrames, watchdogEvents) {
  const byFrame = new Map()
  for (const frame of cadenceFrames) {
    if (!(Number.isFinite(frame.dtMs) && frame.dtMs >= FREEZE_THRESHOLD_MS)) continue
    byFrame.set(frame.frameIdx, {
      sources: ['frame-cadence'],
      frameIdx: frame.frameIdx,
      wallT: frame.wallT,
      stallMs: frame.dtMs,
      evalMs: null,
      screenshot: null,
    })
  }
  let unframedIndex = 0
  for (const event of watchdogEvents) {
    const watchdog = event.data ?? {}
    const frameIdx = Number.isInteger(watchdog.frameIdx) ? watchdog.frameIdx : null
    const correlated =
      frameIdx === null
        ? null
        : (byFrame.get(frameIdx) ?? byFrame.get(frameIdx + 1) ?? null)
    if (correlated) {
      if (!correlated.sources.includes('watchdog')) correlated.sources.push('watchdog')
      correlated.evalMs = Math.max(correlated.evalMs ?? 0, watchdog.evalMs ?? 0)
      if (correlated.sources.includes('frame-cadence')) {
        correlated.watchdogStallMs = Math.max(
          correlated.watchdogStallMs ?? 0,
          watchdog.stallMs ?? 0,
        )
      } else {
        correlated.stallMs = Math.max(correlated.stallMs ?? 0, watchdog.stallMs ?? 0)
      }
      correlated.screenshot ??= watchdog.screenshot ?? null
      continue
    }
    const key = frameIdx === null ? `watchdog-${unframedIndex++}` : frameIdx
    const existing = byFrame.get(key)
    if (existing) {
      existing.evalMs = Math.max(existing.evalMs ?? 0, watchdog.evalMs ?? 0)
      existing.stallMs = Math.max(existing.stallMs ?? 0, watchdog.stallMs ?? 0)
      existing.screenshot ??= watchdog.screenshot ?? null
    } else {
      byFrame.set(key, {
        sources: ['watchdog'],
        frameIdx,
        wallT: null,
        stallMs: watchdog.stallMs ?? null,
        evalMs: watchdog.evalMs ?? null,
        screenshot: watchdog.screenshot ?? null,
      })
    }
  }
  return [...byFrame.values()].sort(
    (left, right) =>
      (left.frameIdx ?? Number.POSITIVE_INFINITY) -
      (right.frameIdx ?? Number.POSITIVE_INFINITY),
  )
}

function analyzeFrameContinuity(raw, measureFromFrame, measureToFrame, measuredFrameCount) {
  if (!raw || typeof raw !== 'object') {
    return {
      pass: false,
      issues: ['meta.frameContinuity is missing'],
      droppedByRing: null,
      gapCount: null,
      gaps: [],
    }
  }
  const issues = Array.isArray(raw.issues) ? [...raw.issues] : []
  const gaps = Array.isArray(raw.gaps) ? raw.gaps : []
  const requireCondition = (condition, issue) => {
    if (!condition) issues.push(issue)
  }
  requireCondition(raw.pass === true, 'continuity tracker reported failure')
  requireCondition(raw.droppedByRing === 0, 'frame ring dropped samples')
  requireCondition(raw.startMarkCount === 1, 'measurement start mark count is not 1')
  requireCondition(raw.endMarkCount === 1, 'measurement end mark count is not 1')
  requireCondition(
    raw.measureFromFrame === measureFromFrame,
    'continuity measureFromFrame disagrees with report window',
  )
  requireCondition(
    raw.firstMeasuredFrameIdx === measureFromFrame,
    'first measured frame does not equal measureFromFrame',
  )
  requireCondition(Number.isInteger(measureToFrame), 'meta.measureToFrame is missing')
  requireCondition(
    raw.endMarkFrameIdx === measureToFrame,
    'continuity end mark disagrees with measureToFrame',
  )
  requireCondition(
    raw.lastMeasuredFrameIdx === measureToFrame,
    'last measured frame does not equal measureToFrame',
  )
  requireCondition(raw.measuredFrameCount > 0, 'measured frame window is empty')
  requireCondition(
    raw.measuredFrameCount === measuredFrameCount,
    'continuity measured-frame count disagrees with report window',
  )
  requireCondition(gaps.length === 0, 'measured frame IDs are not contiguous')
  const uniqueIssues = [...new Set(issues)]
  return {
    pass: uniqueIssues.length === 0,
    issues: uniqueIssues.slice(0, EVIDENCE_LIMIT),
    drainCount: raw.drainCount ?? null,
    droppedByRing: raw.droppedByRing ?? null,
    firstFrameIdx: raw.firstFrameIdx ?? null,
    lastFrameIdx: raw.lastFrameIdx ?? null,
    totalFrameCount: raw.totalFrameCount ?? null,
    measureFromFrame: raw.measureFromFrame ?? null,
    startMarkCount: raw.startMarkCount ?? null,
    startMarkFrameIdx: raw.startMarkFrameIdx ?? null,
    endMarkCount: raw.endMarkCount ?? null,
    endMarkFrameIdx: raw.endMarkFrameIdx ?? null,
    firstMeasuredFrameIdx: raw.firstMeasuredFrameIdx ?? null,
    lastMeasuredFrameIdx: raw.lastMeasuredFrameIdx ?? null,
    measuredFrameCount: raw.measuredFrameCount ?? null,
    gapCount: gaps.length,
    gaps: gaps.slice(0, EVIDENCE_LIMIT),
  }
}

function filterMeasurementEvents(events, measurementWindow, eventContinuity) {
  const issues = []
  if (!measurementWindow || typeof measurementWindow !== 'object') {
    issues.push('meta.measurementWindow is missing')
  }
  const startDriverT = measurementWindow?.startDriverT
  const endDriverT = measurementWindow?.endDriverT
  const startMarkSeq = measurementWindow?.eventStartMarkSeq
  const endMarkSeq = measurementWindow?.eventEndMarkSeq
  const startCursor = measurementWindow?.eventStartCursor
  const endCursor = measurementWindow?.eventEndCursor
  if (!Number.isFinite(startDriverT)) issues.push('driver event start timestamp is missing')
  if (!Number.isFinite(endDriverT)) issues.push('driver event end timestamp is missing')
  if (Number.isFinite(startDriverT) && Number.isFinite(endDriverT) && endDriverT <= startDriverT) {
    issues.push('driver event end does not follow start')
  }
  if (!Number.isInteger(startCursor)) issues.push('bridge event start cursor is missing')
  if (!Number.isInteger(endCursor)) issues.push('bridge event end cursor is missing')
  if (!Number.isInteger(startMarkSeq)) issues.push('bridge event start mark sequence is missing')
  if (!Number.isInteger(endMarkSeq)) issues.push('bridge event end mark sequence is missing')
  if (
    Number.isInteger(startMarkSeq) &&
    Number.isInteger(endMarkSeq) &&
    endMarkSeq <= startMarkSeq
  ) {
    issues.push('bridge event end mark does not follow start mark')
  }
  if (Number.isInteger(startCursor) && startCursor !== startMarkSeq) {
    issues.push('bridge event start mark does not equal the measurement start cursor')
  }
  if (measurementWindow?.eventDroppedByRing !== 0) {
    issues.push(`bridge event ring dropped ${measurementWindow?.eventDroppedByRing ?? 'unknown'} event(s)`)
  }
  const measuredBridgeEvents =
    Number.isInteger(startMarkSeq) && Number.isInteger(endMarkSeq)
      ? events
          .filter(
            (event) =>
              Number.isInteger(event.seq) &&
              event.seq >= startMarkSeq &&
              event.seq <= endMarkSeq,
          )
          .sort((left, right) => left.seq - right.seq)
      : []
  if (Number.isInteger(startMarkSeq) && Number.isInteger(endMarkSeq)) {
    if (measuredBridgeEvents[0]?.seq !== startMarkSeq) {
      issues.push('events.jsonl is missing the bridge measurement start mark')
    }
    if (measuredBridgeEvents.at(-1)?.seq !== endMarkSeq) {
      issues.push('events.jsonl is missing the bridge measurement end mark')
    }
    for (let index = 1; index < measuredBridgeEvents.length; index += 1) {
      if (measuredBridgeEvents[index].seq !== measuredBridgeEvents[index - 1].seq + 1) {
        issues.push('events.jsonl contains a measured bridge sequence gap')
        break
      }
    }
  }
  if (!eventContinuity || typeof eventContinuity !== 'object') {
    issues.push('meta.eventContinuity is missing')
  } else {
    if (eventContinuity.pass !== true) {
      const continuityIssues = Array.isArray(eventContinuity.issues)
        ? eventContinuity.issues
        : []
      issues.push(...(continuityIssues.length > 0
        ? continuityIssues
        : ['event continuity reported failure']))
    }
    if (eventContinuity.droppedByRing !== 0) {
      issues.push(`event continuity recorded ${eventContinuity.droppedByRing ?? 'unknown'} ring drop(s)`)
    }
    if (eventContinuity.startMarkCount !== 1) {
      issues.push(`event continuity start mark count=${eventContinuity.startMarkCount ?? 'unknown'}`)
    }
    if (eventContinuity.endMarkCount !== 1) {
      issues.push(`event continuity end mark count=${eventContinuity.endMarkCount ?? 'unknown'}`)
    }
    if (eventContinuity.startMarkSeq !== startMarkSeq) {
      issues.push('event continuity start mark disagrees with meta.measurementWindow')
    }
    if (eventContinuity.endMarkSeq !== endMarkSeq) {
      issues.push('event continuity end mark disagrees with meta.measurementWindow')
    }
    if (eventContinuity.startCursor !== measurementWindow?.eventStartCursor) {
      issues.push('event continuity start cursor disagrees with meta.measurementWindow')
    }
    if (eventContinuity.endCursor !== measurementWindow?.eventEndCursor) {
      issues.push('event continuity end cursor disagrees with meta.measurementWindow')
    }
    if (
      Number.isInteger(startMarkSeq) &&
      Number.isInteger(endMarkSeq) &&
      eventContinuity.eventCount !== endMarkSeq - startMarkSeq + 1
    ) {
      issues.push('event continuity count disagrees with inclusive mark range')
    }
    if (eventContinuity.eventCount !== measuredBridgeEvents.length) {
      issues.push('event continuity count disagrees with events.jsonl')
    }
    if ((eventContinuity.gaps?.length ?? 0) > 0) {
      issues.push(`${eventContinuity.gaps.length} measured event gap(s)`)
    }
  }
  const uniqueIssues = [...new Set(issues)]
  const valid = uniqueIssues.length === 0
  const measuredEvents = valid
    ? events.filter((event) =>
        Number.isInteger(event.seq)
          ? event.seq >= startMarkSeq && event.seq <= endMarkSeq
          : Number.isFinite(event.t) && event.t >= startDriverT && event.t <= endDriverT,
      )
    : []
  return {
    valid,
    issues: uniqueIssues.slice(0, EVIDENCE_LIMIT),
    events: measuredEvents,
    sourceEventCount: events.length,
    measuredEventCount: measuredEvents.length,
    startDriverT: startDriverT ?? null,
    endDriverT: endDriverT ?? null,
    startMarkSeq: startMarkSeq ?? null,
    endMarkSeq: endMarkSeq ?? null,
    droppedByRing: measurementWindow?.eventDroppedByRing ?? null,
    continuity: eventContinuity
      ? {
          pass: eventContinuity.pass === true,
          drainCount: eventContinuity.drainCount ?? null,
          eventCount: eventContinuity.eventCount ?? null,
          gapCount: eventContinuity.gaps?.length ?? 0,
        }
      : null,
  }
}

function analyzeScenarioValidity(raw) {
  if (!raw || typeof raw !== 'object') {
    return { pass: false, issues: ['meta.scenarioValidity is missing'], error: null }
  }
  const issues = Array.isArray(raw.issues) ? [...raw.issues] : []
  if (raw.pass !== true && issues.length === 0) issues.push('scenario validity reported failure')
  if (raw.error && !issues.some((issue) => /scenario error/iu.test(issue))) {
    issues.push(`scenario error: ${raw.error.message ?? raw.error.name ?? 'unknown'}`)
  }
  return {
    pass: raw.pass === true && issues.length === 0 && !raw.error,
    issues: [...new Set(issues)].slice(0, EVIDENCE_LIMIT),
    error: raw.error ?? null,
  }
}

function analyzeViewport(meta) {
  const requested = meta.requestedViewport ?? null
  const actual = meta.actualViewport ?? null
  const issues = []
  if (!requested || !Number.isFinite(requested.width) || !Number.isFinite(requested.height)) {
    issues.push('requested viewport is missing')
  }
  if (!actual || !Number.isFinite(actual.width) || !Number.isFinite(actual.height)) {
    issues.push('actual viewport is missing')
  } else if (!(Number.isFinite(actual.dpr) && actual.dpr > 0)) {
    issues.push('actual viewport DPR is missing')
  }
  if (
    requested &&
    actual &&
    (actual.width !== requested.width || actual.height !== requested.height)
  ) {
    issues.push('actual viewport dimensions differ from request')
  }
  if (meta.viewportMatchesRequest !== true) issues.push('actual viewport differs from request')
  return { pass: issues.length === 0, issues, requested, actual }
}

function profilerCoverageGate({ label, requested, disabled, sampleCount, coverageRate }) {
  if (disabled) return unmeasuredGate(label, 'profiler disabled for observer-light run')
  if (!requested && sampleCount === 0) return unmeasuredGate(label, 'profiler not requested')
  const sufficient =
    sampleCount > 0 && coverageRate !== null && coverageRate >= PROFILER_MIN_COVERAGE_RATE
  return measuredGate(
    label,
    sufficient,
    `${sampleCount} sample(s), ${percent(coverageRate)}% measured-frame coverage`,
  )
}

const GPU_FRAME_SUFFIX = /:f(\d+)$/u
const GPU_TIMESTAMP_STATUSES = new Set(['measured', 'no-queries', 'incomplete'])

function gpuPassFrame(uid) {
  const match = typeof uid === 'string' ? GPU_FRAME_SUFFIX.exec(uid) : null
  return match ? Number(match[1]) : null
}

function gpuPassType(uid) {
  if (uid.startsWith('c:')) return 'compute'
  return 'render'
}

function declaredGpuFrames(sample, field) {
  return new Set(
    (Array.isArray(sample?.[field]) ? sample[field] : []).filter((frameIdx) =>
      Number.isInteger(frameIdx),
    ),
  )
}

function gpuTimestampStatus(sample, type) {
  const status = sample?.[`${type}Status`]
  return GPU_TIMESTAMP_STATUSES.has(status) ? status : null
}

function buildGpuLedger(samples) {
  const frameRows = new Map()
  const passRows = new Map()
  const passValuesByUid = new Map()
  let duplicatePassCount = 0
  let conflictingDuplicatePassCount = 0
  let explicitComputeNoQueryBatchCount = 0
  let renderPassCount = 0
  let computePassCount = 0

  const ensureFrame = (threeFrame) => {
    let row = frameRows.get(threeFrame)
    if (!row) {
      row = {
        threeFrame,
        renderMs: 0,
        computeMs: 0,
        renderMeasured: false,
        computeMeasured: false,
      }
      frameRows.set(threeFrame, row)
    }
    return row
  }

  const addPass = (gpuPass, threeFrame, type) => {
    const previousMs = passValuesByUid.get(gpuPass.uid)
    if (previousMs !== undefined) {
      duplicatePassCount += 1
      if (previousMs !== gpuPass.ms) conflictingDuplicatePassCount += 1
      return false
    }
    passValuesByUid.set(gpuPass.uid, gpuPass.ms)
    if (type === 'compute') computePassCount += 1
    else renderPassCount += 1
    const row = ensureFrame(threeFrame)
    row[`${type}Ms`] += gpuPass.ms
    const context = gpuPass.uid.replace(GPU_FRAME_SUFFIX, '')
    let valuesByFrame = passRows.get(context)
    if (!valuesByFrame) {
      valuesByFrame = new Map()
      passRows.set(context, valuesByFrame)
    }
    valuesByFrame.set(threeFrame, (valuesByFrame.get(threeFrame) ?? 0) + gpuPass.ms)
    return true
  }

  const orderedSamples = samples
    .slice()
    .sort((left, right) => left.resolvedAtFrame - right.resolvedAtFrame)
  for (const sample of orderedSamples) {
    const renderStatus = gpuTimestampStatus(sample, 'render')
    const computeStatus = gpuTimestampStatus(sample, 'compute')
    if (computeStatus === 'no-queries') explicitComputeNoQueryBatchCount += 1

    const renderFrames = declaredGpuFrames(sample, 'renderFrames')
    const computeFrames = declaredGpuFrames(sample, 'computeFrames')
    const batchFrames = declaredGpuFrames(sample, 'threeFrames')
    const parsedFrames = { render: new Set(), compute: new Set() }
    const acceptedFrames = { render: new Set(), compute: new Set() }

    for (const gpuPass of sample.passes ?? []) {
      if (
        !gpuPass ||
        typeof gpuPass.uid !== 'string' ||
        !(Number.isFinite(gpuPass.ms) && gpuPass.ms >= 0)
      ) {
        continue
      }
      const threeFrame = gpuPassFrame(gpuPass.uid)
      if (!Number.isInteger(threeFrame)) continue
      const type = gpuPassType(gpuPass.uid)
      parsedFrames[type].add(threeFrame)
      batchFrames.add(threeFrame)
      if (addPass(gpuPass, threeFrame, type)) acceptedFrames[type].add(threeFrame)
    }

    for (const threeFrame of renderFrames) batchFrames.add(threeFrame)
    for (const threeFrame of computeFrames) batchFrames.add(threeFrame)

    const markMeasuredFrames = (type, status, parsedTypeFrames) => {
      if (status === 'incomplete') return
      if (status === 'measured' || status === 'no-queries') {
        for (const threeFrame of batchFrames) ensureFrame(threeFrame)[`${type}Measured`] = true
        return
      }
      for (const threeFrame of parsedTypeFrames) {
        ensureFrame(threeFrame)[`${type}Measured`] = true
      }
    }
    markMeasuredFrames('render', renderStatus, acceptedFrames.render)
    markMeasuredFrames('compute', computeStatus, acceptedFrames.compute)

    // Legacy samples did not carry status or per-type frame arrays. Three's
    // returned value is still exact for the final frame only, so use it only as
    // a one-frame fallback; never amortize it over the resolve batch.
    const useLegacyLastFrame = (type, status, parsedTypeFrames) => {
      if (status !== null || parsedTypeFrames.size > 0) return
      const lastFrameMs = sample[`${type}Ms`]
      if (!Number.isFinite(lastFrameMs)) return
      const typeFrames = type === 'render' ? renderFrames : computeFrames
      const candidates = typeFrames.size > 0 ? typeFrames : batchFrames
      if (candidates.size === 0) return
      const lastThreeFrame = Math.max(...candidates)
      const row = ensureFrame(lastThreeFrame)
      row[`${type}Ms`] = lastFrameMs
      row[`${type}Measured`] = true
    }
    useLegacyLastFrame('render', renderStatus, parsedFrames.render)
    useLegacyLastFrame('compute', computeStatus, parsedFrames.compute)
  }

  const rows = [...frameRows.values()].sort((left, right) => left.threeFrame - right.threeFrame)
  const renderRows = rows.filter((row) => row.renderMeasured)
  const computeRows = rows.filter((row) => row.computeMeasured)
  const completeRows = rows.filter((row) => row.renderMeasured && row.computeMeasured)
  const observedRows = rows.filter((row) => row.renderMeasured)
  const passes = [...passRows]
    .map(([pass, valuesByFrame]) => ({
      pass,
      samples: valuesByFrame.size,
      ...stats([...valuesByFrame.values()]),
    }))
    .sort((left, right) => (right.p95 ?? 0) - (left.p95 ?? 0))

  return {
    resolveCount: samples.length,
    timestampedFrameCount: rows.length,
    renderFrameCount: renderRows.length,
    computeFrameCount: computeRows.length,
    completeFrameCount: completeRows.length,
    partialFrameCount: observedRows.length - completeRows.length,
    duplicatePassCount,
    conflictingDuplicatePassCount,
    explicitComputeNoQueryBatchCount,
    renderPassCount,
    computePassCount,
    renderTotals: stats(renderRows.map((row) => row.renderMs)),
    computeTotals: stats(computeRows.map((row) => row.computeMs)),
    observedTotals: stats(
      observedRows.map((row) => row.renderMs + (row.computeMeasured ? row.computeMs : 0)),
    ),
    totals: stats(completeRows.map((row) => row.renderMs + row.computeMs)),
    passes,
  }
}

function hasScopedCpuSample(frame) {
  return (
    Number.isFinite(frame.cpu?.measuredTopLevelMs) && Array.isArray(frame.cpu?.topLevel)
  )
}

export function buildReport({
  runDir,
  fpsCap = DEFAULT_FPS_TARGET,
  measureFromFrame = 0,
  meta = {},
}) {
  const allFrames = readJsonl(path.join(runDir, 'frames.jsonl'))
  const allEvents = readJsonl(path.join(runDir, 'events.jsonl'))
  const trace = readJsonl(path.join(runDir, 'trace.jsonl'))
  const measureToFrame = Number.isInteger(meta.measureToFrame) ? meta.measureToFrame : null
  const frames = allFrames.filter(
    (frame) =>
      frame.frameIdx >= measureFromFrame &&
      Number.isInteger(measureToFrame) &&
      frame.frameIdx <= measureToFrame,
  )
  const cadenceFrames = frames.filter((frame) => frame.frameIdx > measureFromFrame)
  const targetFps = Number.isFinite(fpsCap) && fpsCap > 0 ? fpsCap : DEFAULT_FPS_TARGET
  const frameContinuity = analyzeFrameContinuity(
    meta.frameContinuity,
    measureFromFrame,
    measureToFrame,
    frames.length,
  )
  const scenarioValidity = analyzeScenarioValidity(meta.scenarioValidity)
  const viewport = analyzeViewport(meta)
  const eventWindow = filterMeasurementEvents(
    allEvents,
    meta.measurementWindow,
    meta.eventContinuity,
  )
  const events = eventWindow.events

  const dts = cadenceFrames
    .map((frame) => frame.dtMs)
    .filter((value) => Number.isFinite(value) && value > 0)
  const dtStats = stats(dts)
  const fpsEffective = dtStats.avg ? round1(1000 / dtStats.avg) : null
  const display = resolveDisplayTiming(dts, meta)
  const classifiedBudget = classifyFrameBudget(cadenceFrames, targetFps, display)
  const frameBudget = classifiedBudget.summary
  const frameBudgetMisses = classifiedBudget.misses
  const rollingFps = analyzeRollingFps(cadenceFrames, targetFps)
  const render = renderLoad(frames)
  const input = analyzeInputs(trace, meta.measurementWindow, measureFromFrame, measureToFrame)
  const phases = analyzePhases(frames, frameBudgetMisses)
  const cpuRequested = meta.frameProfile === true
  const cpuDisabled = meta.frameProfile === false
  const gpuRequested = meta.gpuProfile === true
  const gpuDisabled = meta.gpuProfile === false

  const cpuFrames = frames.filter(hasScopedCpuSample)
  const cpuCoverageRate = rate(cpuFrames.length, frames.length)
  const cpuCoverageSufficient =
    cpuFrames.length > 0 &&
    cpuCoverageRate !== null &&
    cpuCoverageRate >= PROFILER_MIN_COVERAGE_RATE
  const wrappedSliceResiduals = stats(
    cpuFrames.map((frame) => frame.cpu.unmeasuredActiveMs),
  )
  const measuredWrapped = stats(cpuFrames.map((frame) => frame.cpu.measuredTopLevelMs))
  const spanAgg = new Map()
  for (const frame of cpuFrames) {
    for (const span of frame.cpu.topLevel ?? []) {
      let aggregate = spanAgg.get(span.id)
      if (!aggregate) {
        aggregate = { id: span.id, values: [] }
        spanAgg.set(span.id, aggregate)
      }
      aggregate.values.push(span.ms)
    }
  }
  const spanTable = [...spanAgg.values()]
    .map((aggregate) => ({
      id: aggregate.id,
      frames: aggregate.values.length,
      ...stats(aggregate.values),
      totalMs: round1(aggregate.values.reduce((sum, value) => sum + value, 0)),
    }))
    .sort((a, b) => b.totalMs - a.totalMs)
  const benchOverheadSpan = spanTable.find((span) => span.id.includes('BenchBridgeCollector'))

  const loafs = events
    .filter(
      (event) =>
        event.type === 'loaf' &&
        Number.isFinite(event.data?.startTime) &&
        Number.isFinite(event.data?.duration),
    )
    .map((event) => ({
      start: event.data.startTime,
      end: event.data.startTime + event.data.duration,
      data: event.data,
    }))
  const severeFrameIds = new Set(
    frameBudgetMisses
      .filter((miss) => miss.classification === 'severe')
      .map((miss) => miss.frameIdx),
  )
  const spikes = []
  for (const frame of frames) {
    if (!severeFrameIds.has(frame.frameIdx)) continue
    const frameStart = frame.wallT - frame.dtMs
    const cpu = !cpuDisabled && hasScopedCpuSample(frame) ? frame.cpu : null
    const overlappingLoaf = loafs.filter(
      (loaf) => loaf.end > frameStart && loaf.start < frame.wallT,
    )
    const clippedLoafIntervals = overlappingLoaf
      .map((loaf) => ({
        start: Math.max(loaf.start, frameStart),
        end: Math.min(loaf.end, frame.wallT),
      }))
      .sort((left, right) => left.start - right.start)
    let loafMs = 0
    let loafEnd = Number.NEGATIVE_INFINITY
    for (const interval of clippedLoafIntervals) {
      if (interval.end <= loafEnd) continue
      loafMs += interval.end - Math.max(interval.start, loafEnd)
      loafEnd = interval.end
    }
    const measuredMs = cpu?.measuredTopLevelMs ?? 0
    const unexplainedMs = Math.max(0, frame.dtMs - Math.max(measuredMs, loafMs))
    spikes.push({
      frameIdx: frame.frameIdx,
      wallT: frame.wallT,
      dtMs: frame.dtMs,
      measuredMs,
      loafMs,
      unexplainedMs,
      cpuMeasured: Boolean(cpu),
      topSpans: cpu
        ? (cpu.topLevel ?? [])
            .slice()
            .sort((a, b) => b.ms - a.ms)
            .slice(0, 4)
            .map((span) => ({ id: span.id, ms: span.ms }))
        : [],
      loafScripts: overlappingLoaf.flatMap((loaf) => loaf.data.scripts ?? []).slice(0, 3),
      marks: Array.isArray(frame.marks) ? frame.marks : [],
    })
  }
  spikes.sort((a, b) => b.dtMs - a.dtMs)
  const spikeUnexplained = stats(spikes.map((spike) => spike.unexplainedMs))

  const measurementEndFrame = Number.isInteger(frameContinuity.endMarkFrameIdx)
    ? frameContinuity.endMarkFrameIdx
    : Number.POSITIVE_INFINITY
  const gpuResolved = new Map()
  for (const frame of frames) {
    const resolvedAtFrame = frame.gpu?.resolvedAtFrame
    if (
      frame.gpu &&
      Number.isInteger(resolvedAtFrame) &&
      resolvedAtFrame >= measureFromFrame &&
      resolvedAtFrame <= measurementEndFrame &&
      (Number.isFinite(frame.gpu.renderMs) ||
        Number.isFinite(frame.gpu.computeMs) ||
        (frame.gpu.passes?.length ?? 0) > 0 ||
        gpuTimestampStatus(frame.gpu, 'render') !== null ||
        gpuTimestampStatus(frame.gpu, 'compute') !== null)
    ) {
      gpuResolved.set(resolvedAtFrame, frame.gpu)
    }
  }
  const gpuSamples = [...gpuResolved.values()]
  const gpuLedger = buildGpuLedger(gpuSamples)
  const gpuCoveredFrameCount = Math.min(frames.length, gpuLedger.completeFrameCount)
  const gpuRenderCoveredFrameCount = Math.min(frames.length, gpuLedger.renderFrameCount)
  const gpuComputeCoveredFrameCount = Math.min(frames.length, gpuLedger.computeFrameCount)
  const gpuCoverageRate = rate(gpuCoveredFrameCount, frames.length)
  const gpuRenderCoverageRate = rate(gpuRenderCoveredFrameCount, frames.length)
  const gpuComputeCoverageRate = rate(gpuComputeCoveredFrameCount, frames.length)
  const gpuCoverageSufficient =
    gpuLedger.totals.n > 0 &&
    gpuCoverageRate !== null &&
    gpuCoverageRate >= PROFILER_MIN_COVERAGE_RATE
  const gpuTotals = gpuLedger.totals
  const passTable = gpuLedger.passes

  const watchdogFreezeEvents = events.filter(
    (event) => event.type === 'detector:freeze' && event.data?.kind !== 'starvation',
  )
  const freezes = collectFreezeEvidence(cadenceFrames, watchdogFreezeEvents)
  const starvations = events
    .filter((event) => event.type === 'detector:task-starvation')
    .map((event) => event.data)
  const freezeDetector = freezeSummary(freezes)
  const taskStarvation = taskStarvationSummary(starvations)
  const pageErrors = events.filter((event) => event.type === 'pageerror')
  const consoleErrors = events.filter((event) => event.type === 'console:error')
  const deviceLost = events.filter(
    (event) => event.type === 'device-lost' || event.data === 'device-lost',
  )
  const crashes = events.filter((event) => event.type === 'crash')
  const visibilityLoss = events.filter(
    (event) => event.type === 'visibility' && event.data?.state === 'hidden',
  )

  const memPoints = frames
    .filter((frame) => Number.isFinite(frame.memMB) && Number.isFinite(frame.wallT))
    .map((frame) => ({ x: frame.wallT / 60000, y: frame.memMB }))
  let memSlopePerMin = null
  if (memPoints.length > 60) {
    const count = memPoints.length
    const sumX = memPoints.reduce((sum, point) => sum + point.x, 0)
    const sumY = memPoints.reduce((sum, point) => sum + point.y, 0)
    const sumXX = memPoints.reduce((sum, point) => sum + point.x * point.x, 0)
    const sumXY = memPoints.reduce((sum, point) => sum + point.x * point.y, 0)
    const denominator = count * sumXX - sumX * sumX
    if (Math.abs(denominator) > 1e-9) {
      memSlopePerMin = round2((count * sumXY - sumX * sumY) / denominator)
    }
  }

  const gpuBudgetMs = frameBudget.budgetMs
  const gates = [
    measuredGate(
      'Scenario validity',
      scenarioValidity.pass,
      scenarioValidity.pass
        ? 'scenario completed with no validity issue'
        : scenarioValidity.issues.join('; '),
    ),
    measuredGate(
      'Requested viewport was applied',
      viewport.pass,
      viewport.pass
        ? `${viewport.actual.width}x${viewport.actual.height} at DPR ${viewport.actual.dpr ?? 'unknown'}`
        : viewport.issues.join('; '),
    ),
    measuredGate(
      'Frame capture continuity and measurement boundaries',
      frameContinuity.pass,
      frameContinuity.pass
        ? `${frameContinuity.measuredFrameCount} contiguous measured frame(s), zero ring drops`
        : frameContinuity.issues.join('; '),
    ),
    measuredGate(
      'Measured frame window is non-empty',
      frames.length > 0 && cadenceFrames.length > 0 && frameBudget.eligibleFrameCount > 0,
      `${frames.length} boundary-inclusive frame(s), ${frameBudget.eligibleFrameCount} authoritative cadence interval(s) from ${allFrames.length} captured frame(s)`,
    ),
    measuredGate(
      'Input trace has one ordered measurement window',
      input.measurementWindow.valid,
      input.measurementWindow.valid
        ? `${round2(input.measurementWindow.durationMs)}ms driver-clock window`
        : input.measurementWindow.issues.join('; '),
    ),
    measuredGate(
      'Event stream has one lossless measurement window',
      eventWindow.valid,
      eventWindow.valid
        ? `${eventWindow.measuredEventCount}/${eventWindow.sourceEventCount} event(s) inside measurement`
        : eventWindow.issues.join('; '),
    ),
    measuredGate(
      'Phase marks are paired and sibling segments do not overlap',
      phases.pairing.valid,
      phases.pairing.valid
        ? `${phases.segments.length} half-open paired segment(s)`
        : `${phases.pairing.unpairedCount} unpaired mark(s), ${phases.pairing.overlapIssueCount} overlap issue(s)`,
    ),
    frames.length === 0
      ? unmeasuredGate('Frame presentation budget', 'no measured frames')
      : !display.authoritative
        ? unmeasuredGate(
            'Frame presentation budget',
            'meta.displayHz missing; inferred display timing is diagnostic only',
          )
        : measuredGate(
            `No missed presentation beyond ${round2(
              frameBudget.missedPresentationThresholdMs,
            )}ms display pacing + tolerance`,
            frameBudget.missedPresentations.count === 0,
            `${frameBudget.rawMisses.count} raw >${round2(frameBudget.rawMissThresholdMs)}ms budget miss(es): ` +
              `${frameBudget.expectedQuantizedPacing.count} expected display-quantized, ` +
              `${frameBudget.missedPresentations.count} missed presentation(s), ` +
              `${frameBudget.severe.count} severe`,
          ),
    rollingFps.sampleCount > 0
      ? measuredGate(
          `Rolling 1s FPS >= ${rollingFps.thresholdFps}`,
          rollingFps.episodeCount === 0,
          `${rollingFps.episodeCount} low-FPS episode(s), ${rollingFps.lowSampleCount}/${rollingFps.sampleCount} low sample(s)`,
        )
      : unmeasuredGate(
          `Rolling 1s FPS >= ${rollingFps.thresholdFps}`,
          `less than ${ROLLING_FPS_MIN_COVERAGE_MS}ms of cadence coverage`,
        ),
    profilerCoverageGate({
      label: `CPU profiler frame coverage >= ${PROFILER_MIN_COVERAGE_RATE * 100}%`,
      requested: cpuRequested,
      disabled: cpuDisabled,
      sampleCount: cpuFrames.length,
      coverageRate: cpuCoverageRate,
    }),
    unmeasuredGate(
      'A1: whole-frame CPU residual',
      cpuFrames.length > 0
        ? 'R3F named spans are scoped diagnostics; wrapped-slice residual is not independent whole-frame CPU coverage'
        : 'no independent whole-frame CPU active-time measurement',
    ),
    spikes.length === 0
      ? measuredGate(
          'A2: every severe frame explained (unexplained max <= 3ms)',
          true,
          `no frames >= ${round2(frameBudget.severeThresholdMs)}ms`,
        )
      : spikes.every((spike) => spike.cpuMeasured)
        ? measuredGate(
            'A2: every severe frame explained (unexplained max <= 3ms)',
            spikeUnexplained.max !== null && spikeUnexplained.max <= 3,
            `${spikes.length} severe frame(s), unexplained max = ${spikeUnexplained.max}ms`,
          )
        : unmeasuredGate(
            'A2: every severe frame explained (unexplained max <= 3ms)',
            `${spikes.filter((spike) => !spike.cpuMeasured).length}/${spikes.length} severe frame(s) lack scoped CPU samples`,
          ),
    profilerCoverageGate({
      label: `GPU profiler frame coverage >= ${PROFILER_MIN_COVERAGE_RATE * 100}%`,
      requested: gpuRequested,
      disabled: gpuDisabled,
      sampleCount: gpuCoveredFrameCount,
      coverageRate: gpuCoverageRate,
    }),
    !gpuDisabled && gpuCoverageSufficient
      ? measuredGate(
          `B: GPU total p95 <= ${round1(gpuBudgetMs)}ms`,
          gpuTotals.p95 !== null && gpuTotals.p95 <= gpuBudgetMs,
          `render+compute p95 = ${gpuTotals.p95}ms over ${gpuTotals.n} timestamped Three renderer frame(s)`,
        )
      : unmeasuredGate(
          `B: GPU total p95 <= ${round1(gpuBudgetMs)}ms`,
          gpuDisabled
            ? 'GPU profiler disabled'
            : `insufficient complete render+compute frame coverage (${percent(
                gpuCoverageRate,
              )}%; render ${percent(gpuRenderCoverageRate)}%, compute ${percent(
                gpuComputeCoverageRate,
              )}%)`,
        ),
    measuredGate(
      `No frame freezes >= ${FREEZE_THRESHOLD_MS}ms`,
      freezes.length === 0,
      `${freezes.length} freeze(s)${freezes.length ? `, worst stall ${freezeDetector.stallMs.max}ms` : ''}`,
    ),
    meta.taskStarvationMeasured === true && meta.watchdog?.enabled === true
      ? measuredGate(
          `No main-thread task starvation >= ${FREEZE_THRESHOLD_MS}ms`,
          starvations.length === 0,
          `${starvations.length} episode(s)${
            starvations.length
              ? `, worst evaluate ${taskStarvation.evalMs.max}ms over ${taskStarvation.mergedPollCount} poll(s)`
              : ''
          }`,
        )
      : unmeasuredGate(
          `No main-thread task starvation >= ${FREEZE_THRESHOLD_MS}ms`,
          `watchdog ${meta.watchdog?.enabled === false ? 'disabled' : 'measurement unavailable'}`,
        ),
    measuredGate(
      'Zero page errors / crashes / device-lost',
      pageErrors.length === 0 && crashes.length === 0 && deviceLost.length === 0,
      `${pageErrors.length} pageerror, ${crashes.length} crash, ${deviceLost.length} device-lost, ${consoleErrors.length} console errors`,
    ),
    measuredGate(
      'Run validity (page stayed visible)',
      visibilityLoss.length === 0,
      visibilityLoss.length
        ? `page went hidden ${visibilityLoss.length}x — timings unreliable`
        : 'visible throughout',
    ),
      benchOverheadSpan && !cpuDisabled
      ? measuredGate(
          'Bench overhead <= 0.6ms avg',
          benchOverheadSpan.avg !== null && benchOverheadSpan.avg <= 0.6,
          `collector span avg = ${benchOverheadSpan.avg}ms`,
        )
      : unmeasuredGate(
          'Bench overhead <= 0.6ms avg',
          cpuCoverageSufficient
            ? 'collector span absent from scoped samples'
            : 'unmeasured without sufficient CPU profiler coverage',
        ),
  ]

  const failedGates = gates.filter((entry) => entry.status === 'fail')
  const unmeasuredGates = gates.filter((entry) => entry.status === 'unmeasured')
  const verdict = failedGates.length > 0 ? 'FAIL' : unmeasuredGates.length > 0 ? 'PARTIAL' : 'PASS'
  const report = {
    meta,
    verdict,
    pass: verdict === 'PASS' ? true : verdict === 'FAIL' ? false : null,
    window: {
      totalFrames: allFrames.length,
      measuredFrames: frames.length,
      authoritativeCadenceIntervals: cadenceFrames.length,
      measureFromFrame,
      cadenceFromFrame: frames.length > 1 ? measureFromFrame + 1 : null,
      measureToFrame: Number.isInteger(measureToFrame) ? measureToFrame : null,
    },
    scenarioValidity,
    viewport,
    frameContinuity,
    eventWindow: {
      valid: eventWindow.valid,
      issues: eventWindow.issues,
      sourceEventCount: eventWindow.sourceEventCount,
      measuredEventCount: eventWindow.measuredEventCount,
      startDriverT: eventWindow.startDriverT,
      endDriverT: eventWindow.endDriverT,
      startMarkSeq: eventWindow.startMarkSeq,
      endMarkSeq: eventWindow.endMarkSeq,
      droppedByRing: eventWindow.droppedByRing,
      continuity: eventWindow.continuity,
    },
    cadence: { fpsCap: targetFps, fpsEffective, dt: dtStats },
    frameBudget,
    rollingFps,
    phases,
    render,
    input: { ...input, provenance: meta.inputModalities ?? null },
    cpu: {
      attribution: {
        status: cpuDisabled
          ? 'disabled'
          : cpuCoverageSufficient
            ? 'measured-scoped'
            : cpuRequested
              ? 'incomplete'
              : 'unmeasured',
        scope: 'named R3F spans only; no independent whole-frame active-time coverage',
        requested: meta.frameProfile ?? null,
        cdpProfileRequested: meta.cpuProfile ?? null,
        samples: cpuFrames.length,
        coverageRate: cpuCoverageRate,
      },
      wrappedSliceResiduals,
      measuredWrapped,
      topSpans: spanTable.slice(0, EVIDENCE_LIMIT),
      benchOverhead: benchOverheadSpan ?? null,
    },
    gpu: {
      attribution: {
        status: gpuDisabled
          ? 'disabled'
          : gpuCoverageSufficient
            ? 'measured'
            : gpuRequested
              ? 'incomplete'
              : 'unmeasured',
        requested: meta.gpuProfile ?? null,
        samples: gpuLedger.resolveCount,
        coveredFrames: gpuCoveredFrameCount,
        coverageRate: gpuCoverageRate,
        scope:
          'per-Three-renderer-frame timestamp sums grouped by UID :f suffix; complete totals require explicit render and compute accounting',
        render: {
          coveredFrames: gpuRenderCoveredFrameCount,
          coverageRate: gpuRenderCoverageRate,
          passCount: gpuLedger.renderPassCount,
        },
        compute: {
          status:
            gpuComputeCoveredFrameCount === 0
              ? 'unmeasured'
              : gpuLedger.computePassCount > 0
                ? 'measured'
                : 'no-timestamped-work',
          coveredFrames: gpuComputeCoveredFrameCount,
          coverageRate: gpuComputeCoverageRate,
          passCount: gpuLedger.computePassCount,
          explicitNoQueryBatches: gpuLedger.explicitComputeNoQueryBatchCount,
        },
        deduplication: {
          timestampedFrames: gpuLedger.timestampedFrameCount,
          partialFrames: gpuLedger.partialFrameCount,
          duplicatePasses: gpuLedger.duplicatePassCount,
          conflictingDuplicatePasses: gpuLedger.conflictingDuplicatePassCount,
        },
      },
      totals: gpuTotals,
      observedTotals: gpuLedger.observedTotals,
      renderTotals: gpuLedger.renderTotals,
      computeTotals: gpuLedger.computeTotals,
      passes: passTable.slice(0, EVIDENCE_LIMIT),
      samples: gpuLedger.resolveCount,
    },
    spikes: {
      count: spikes.length,
      thresholdMs: frameBudget.severeThresholdMs,
      frameRanges: compactFrameRanges(spikes),
      worst: spikes.slice(0, EVIDENCE_LIMIT),
      unexplained: spikeUnexplained,
    },
    detectors: {
      freezes: freezeDetector,
      taskStarvation,
      pageErrors: pageErrors.length,
      consoleErrors: consoleErrors.length,
      crashes: crashes.length,
      deviceLost: deviceLost.length,
      visibilityLoss: visibilityLoss.length,
    },
    memory: { slopeMBPerMin: memSlopePerMin, samples: memPoints.length },
    gates,
    gateSummary: {
      pass: gates.filter((entry) => entry.status === 'pass').length,
      fail: failedGates.length,
      unmeasured: unmeasuredGates.length,
    },
  }
  writeFileSync(path.join(runDir, 'report.json'), JSON.stringify(report, null, 2))
  writeFileSync(path.join(runDir, 'report.md'), renderMarkdown(report))
  return report
}

function markdownCell(value) {
  return String(value).replaceAll('|', '\\|').replaceAll('\n', ' ')
}

function compactRangesForMarkdown(ranges, limit = EVIDENCE_LIMIT) {
  if (ranges.length === 0) return 'none'
  const shown = ranges.slice(0, limit).join(', ')
  return ranges.length > limit ? `${shown}, … (+${ranges.length - limit})` : shown
}

function metric(value, suffix = '') {
  return value === null || value === undefined ? 'n/a' : `${round2(value)}${suffix}`
}

function renderMarkdown(report) {
  const lines = []
  const meta = report.meta
  lines.push(`# Bench report — ${meta.scenario ?? 'run'} (seed ${meta.seed ?? '?'})`)
  lines.push('')
  lines.push(
    `- run: \`${meta.runId ?? '?'}\`  git: \`${meta.git?.sha?.slice(0, 8) ?? '?'}\`${
      meta.git?.dirty ? ' (dirty)' : ''
    }  mode: ${meta.mode ?? 'dev'}`,
  )
  lines.push(
    `- adapter: ${JSON.stringify(meta.adapter ?? null)}  viewport: ${
      report.viewport.actual
        ? `${report.viewport.actual.width}x${report.viewport.actual.height} @ DPR ${report.viewport.actual.dpr ?? '?'}`
        : '?'
    }`,
  )
  lines.push(
    `- frames captured in bounds: ${report.window.measuredFrames}/${report.window.totalFrames}; ` +
      `${report.window.authoritativeCadenceIntervals} cadence interval(s) from #${
        report.window.cadenceFromFrame ?? 'n/a'
      } (measure-start frame retained only for boundaries)`,
  )
  lines.push(
    `- target: ${report.frameBudget.targetFps} FPS / ${round2(report.frameBudget.budgetMs)}ms · ` +
      `display: ${round2(report.frameBudget.display.hz)}Hz (${report.frameBudget.display.source}, ` +
      `${report.frameBudget.display.authoritative ? 'authoritative' : 'diagnostic only'})`,
  )
  lines.push('')
  lines.push(`## Verdict: ${report.verdict}`)
  if (report.verdict === 'PARTIAL') {
    lines.push('')
    lines.push('_All measured gates passed; one or more scoped attribution gates were unmeasured._')
  }
  lines.push('')
  lines.push('| gate | result | detail |')
  lines.push('|---|---|---|')
  for (const reportGate of report.gates) {
    lines.push(
      `| ${markdownCell(reportGate.gate)} | ${reportGate.status.toUpperCase()} | ${markdownCell(reportGate.detail)} |`,
    )
  }

  lines.push('')
  lines.push('## Frame cadence and presentation budget')
  const dt = report.cadence.dt
  lines.push(
    `effective ~${metric(report.cadence.fpsEffective, ' FPS')} · dt p50 ${metric(dt.p50, 'ms')} · ` +
      `p95 ${metric(dt.p95, 'ms')} · p99 ${metric(dt.p99, 'ms')} · max ${metric(dt.max, 'ms')}`,
  )
  const budget = report.frameBudget
  lines.push(
    `raw misses ${budget.rawMisses.count}/${budget.eligibleFrameCount} (${metric(
      budget.rawMisses.ratePct,
      '%',
    )}) · expected display pacing ${budget.expectedQuantizedPacing.count} · ` +
      `missed presentations ${budget.missedPresentations.count} · severe ${budget.severe.count}`,
  )
  lines.push(
    `raw miss ranges: ${compactRangesForMarkdown(budget.rawMisses.frameRanges)} · ` +
      `missed-presentation ranges: ${compactRangesForMarkdown(
        budget.missedPresentations.frameRanges,
      )}`,
  )
  if (budget.rawMisses.longestRun) {
    const longest = budget.rawMisses.longestRun
    lines.push(
      `longest raw-miss run: ${longest.count} frames (#${longest.startFrameIdx}–#${longest.endFrameIdx}, ` +
        `${round2(longest.durationMs)}ms)`,
    )
  }
  const rolling = report.rollingFps
  lines.push(
    `rolling ${rolling.windowMs}ms FPS: ${rolling.episodeCount} episode(s) below ${rolling.thresholdFps}; ` +
      `worst ${metric(rolling.worstSample?.fps, ' FPS')}`,
  )
  if (rolling.episodes.length > 0) {
    lines.push('')
    lines.push('| low-FPS episode | detected frames | covered ms | min FPS | avg FPS |')
    lines.push('|---|---|---|---|---|')
    for (const episode of rolling.episodes.slice(0, 12)) {
      lines.push(
        `| #${episode.startFrameIdx}–#${episode.endFrameIdx} | ${episode.sampleCount} | ` +
          `${round2(episode.coveredDurationMs)} | ${round2(episode.minFps)} | ${round2(
            episode.avgFps,
          )} |`,
      )
    }
  }

  lines.push('')
  lines.push('## Phase segments')
  if (!report.phases.pairing.valid) {
    lines.push(
      `Invalid phase marks: ${report.phases.pairing.unpairedCount} unpaired, ` +
        `${report.phases.pairing.overlapIssueCount} sibling overlap issue(s).`,
    )
  }
  if (report.phases.segments.length === 0) {
    lines.push('No paired `*-start` / `*-end` marks in the measured window.')
  } else {
    lines.push('')
    lines.push(
      '| phase | depth | frames [start,end) | duration ms | effective FPS | raw misses | missed presentations | draws p95 | tris p95 |',
    )
    lines.push('|---|---|---|---|---|---|---|---|---|')
    for (const segment of report.phases.segments) {
      lines.push(
        `| \`${segment.name}\` | ${segment.depth} | #${segment.startFrameIdx}–#${
          segment.endFrameIdxExclusive
        } (${segment.frameCount}) | ${round2(segment.durationMs)} | ${metric(
          segment.cadence.fpsEffective,
        )} | ${segment.frameBudget.rawMissCount} | ${
          segment.frameBudget.missedPresentationCount
        } | ${metric(segment.render.draws.p95)} | ${metric(segment.render.triangles.p95)} |`,
      )
    }
  }

  lines.push('')
  lines.push('## Render load')
  lines.push(
    `draws p50 ${metric(report.render.draws.p50)} · p95 ${metric(
      report.render.draws.p95,
    )} · max ${metric(report.render.draws.max)} at frame #${
      report.render.peakDrawFrame?.frameIdx ?? 'n/a'
    }`,
  )
  lines.push(
    `triangles p50 ${metric(report.render.triangles.p50)} · p95 ${metric(
      report.render.triangles.p95,
    )} · max ${metric(report.render.triangles.max)} at frame #${
      report.render.peakTriangleFrame?.frameIdx ?? 'n/a'
    }`,
  )

  lines.push('')
  lines.push('## Input coverage')
  lines.push(
    `${report.input.dispatchRecordCount} measured dispatch record(s) · modalities ${JSON.stringify(
      report.input.modalities,
    )} · max dispatch gap ${metric(report.input.maxDispatchGap?.ms, 'ms')} · ` +
      `max uncontrolled idle ${metric(report.input.maxUncontrolledIdleGap?.ms, 'ms')}`,
  )
  lines.push(`kinds: ${JSON.stringify(report.input.byKind)}`)

  lines.push('')
  lines.push('## CPU scoped diagnostics')
  lines.push(report.cpu.attribution.scope)
  if (report.cpu.attribution.status === 'measured-scoped') {
    lines.push('')
    lines.push('| named R3F span | frames | avg ms | p95 ms | max ms | total ms |')
    lines.push('|---|---|---|---|---|---|')
    for (const span of report.cpu.topSpans.slice(0, 15)) {
      lines.push(
        `| \`${span.id}\` | ${span.frames} | ${span.avg} | ${span.p95} | ${span.max} | ${span.totalMs} |`,
      )
    }
  } else {
    lines.push(`Profiler status: ${report.cpu.attribution.status}.`)
  }

  lines.push('')
  lines.push('## GPU ledger')
  lines.push(report.gpu.attribution.scope)
  lines.push(
    `complete render+compute coverage ${metric(
      percent(report.gpu.attribution.coverageRate),
      '%',
    )} · render ${metric(percent(report.gpu.attribution.render.coverageRate), '%')} · ` +
      `compute ${metric(percent(report.gpu.attribution.compute.coverageRate), '%')} ` +
      `(${report.gpu.attribution.compute.status})`,
  )
  if (report.gpu.totals.n > 0) {
    lines.push(
      `complete total: p50 ${metric(report.gpu.totals.p50, 'ms')} · p95 ${metric(
        report.gpu.totals.p95,
        'ms',
      )} · max ${metric(report.gpu.totals.max, 'ms')} over ${report.gpu.totals.n} ` +
        'timestamped Three renderer frame(s)',
    )
  } else {
    lines.push(
      `complete total unavailable; render-only p95 ${metric(
        report.gpu.renderTotals.p95,
        'ms',
      )} over ${report.gpu.renderTotals.n} timestamped Three renderer frame(s)`,
    )
  }
  if (report.gpu.passes.length > 0) {
    lines.push('')
    lines.push('| pass (context) | Three frames | avg ms | p95 ms | max ms |')
    lines.push('|---|---|---|---|---|')
    for (const gpuPass of report.gpu.passes.slice(0, 15)) {
      lines.push(
        `| \`${gpuPass.pass}\` | ${gpuPass.samples} | ${gpuPass.avg} | ${gpuPass.p95} | ${gpuPass.max} |`,
      )
    }
  }

  if (report.spikes.count > 0) {
    lines.push('')
    lines.push(
      `## Severe frames (${report.spikes.count} frames >= ${round2(
        report.spikes.thresholdMs,
      )}ms)`,
    )
    lines.push('')
    for (const spike of report.spikes.worst) {
      lines.push(
        `- frame ${spike.frameIdx}: ${round2(spike.dtMs)}ms (scoped spans ${round2(
          spike.measuredMs,
        )}ms, LoAF ${round2(spike.loafMs)}ms, unexplained ${round2(
          spike.unexplainedMs,
        )}ms)${spike.marks.length ? ` marks: ${spike.marks.join(',')}` : ''}`,
      )
      for (const span of spike.topSpans) lines.push(`    - \`${span.id}\` ${round2(span.ms)}ms`)
    }
  }

  if (report.detectors.freezes.count > 0) {
    lines.push('')
    lines.push('## Freezes')
    for (const freeze of report.detectors.freezes.worst) {
      lines.push(
        `- frame ${freeze.frameIdx}: stall ${freeze.stallMs}ms / eval ${
          freeze.evalMs
        }ms${freeze.screenshot ? ` — ${freeze.screenshot}` : ''}`,
      )
    }
  }

  if (report.detectors.taskStarvation.count > 0) {
    lines.push('')
    lines.push('## Main-thread task starvation')
    lines.push('')
    lines.push('| frame | evaluate ms | merged polls | detector time |')
    lines.push('|---|---|---|---|')
    for (const episode of report.detectors.taskStarvation.worst) {
      lines.push(
        `| #${episode.frameIdx} | ${episode.evalMs} | ${episode.count ?? 1} | ${
          episode.t ?? 'n/a'
        } |`,
      )
    }
  }

  lines.push('')
  lines.push(
    `memory slope: ${report.memory.slopeMBPerMin ?? 'n/a'} MB/min over ${
      report.memory.samples
    } samples`,
  )
  lines.push('')
  return lines.join('\n')
}
