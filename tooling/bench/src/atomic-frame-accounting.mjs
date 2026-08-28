const DEFAULT_WINDOW_START_US = -2_000_000
const DEFAULT_WINDOW_END_US = 10_000_000
const DEFAULT_MAX_LEAF_US = 2_000
const GPU_FRAME_SUFFIX = /:f(\d+)$/u

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

function finiteNumber(value) {
  return typeof value === 'number' && Number.isFinite(value)
}

function roundUs(milliseconds) {
  return Math.round(milliseconds * 1_000)
}

function cleanUrl(value) {
  if (typeof value !== 'string' || value.length === 0) return null
  const withoutQuery = value.split('?')[0]
  const parts = withoutQuery.split(/[\\/]/u)
  return parts.at(-1) || withoutQuery
}

function traceData(event) {
  return event?.args?.data ?? event?.args?.beginData ?? event?.args ?? {}
}

function traceDetail(event) {
  const data = traceData(event)
  const detail = {}
  const functionName = data.functionName ?? data.callFrame?.functionName
  const url = data.url ?? data.scriptName ?? data.callFrame?.url
  const lineNumber = data.lineNumber ?? data.callFrame?.lineNumber
  const columnNumber = data.columnNumber ?? data.callFrame?.columnNumber
  const type = data.type
  if (typeof functionName === 'string' && functionName.length > 0) {
    detail.functionName = functionName
  }
  if (typeof url === 'string' && url.length > 0) detail.url = cleanUrl(url)
  if (Number.isInteger(lineNumber)) detail.lineNumber = lineNumber
  if (Number.isInteger(columnNumber)) detail.columnNumber = columnNumber
  if (typeof type === 'string' && type.length > 0) detail.type = type
  if (Number.isInteger(data.timerId)) detail.timerId = data.timerId
  return Object.keys(detail).length > 0 ? detail : null
}

function traceLabel(event) {
  const detail = traceDetail(event)
  if (event.name === 'FunctionCall' && detail?.functionName) {
    const source = detail.url
      ? ` @ ${detail.url}${Number.isInteger(detail.lineNumber) ? `:${detail.lineNumber + 1}` : ''}`
      : ''
    return `FunctionCall: ${detail.functionName}${source}`
  }
  if (event.name === 'EventDispatch' && detail?.type) return `EventDispatch: ${detail.type}`
  if (event.name === 'TimerFire' && Number.isInteger(detail?.timerId)) {
    return `TimerFire: ${detail.timerId}`
  }
  return event.name
}

function traceCategory(event, processName, threadName) {
  const name = String(event.name)
  if (/V8\.GC|Scavenger|MarkCompact|MinorGC|MajorGC|garbage/i.test(name)) {
    return 'garbage-collection'
  }
  if (/Style|Layout|Recalc|Document::updateStyle/i.test(name)) return 'style-layout'
  if (/Paint|Layer|Composit|Commit|Raster|Tile/i.test(name)) return 'paint-composite'
  if (processName === 'GPU Process' || /GPU|Dawn|WebGPU/i.test(name)) return 'gpu-process-cpu'
  if (/Worker/i.test(threadName)) return 'worker'
  if (
    /FunctionCall|v8\.|AnimationFrame|Microtask|Timer|EventDispatch|Script|MessagePort/i.test(
      name,
    )
  ) {
    return 'javascript'
  }
  if (/Resource|Fetch|URLLoader|IOHandler|FileReader|CacheStorage|Network/i.test(name)) {
    return 'network-io'
  }
  if (/Audio/i.test(name)) return 'audio'
  if (/RunTask|ThreadController|Scheduler|TaskQueue/i.test(name)) return 'scheduler'
  if (processName === 'Browser') return 'browser'
  return 'other'
}

function traceSpecificity(event) {
  const name = String(event.name)
  if (/GC|Scavenger|MarkCompact/i.test(name)) return 1_000
  if (name === 'FunctionCall') return 980
  if (/Style|Layout|Paint|Layer|Composit|Commit|Raster/i.test(name)) return 950
  if (/EventDispatch|TimerFire|FireAnimationFrame|RunMicrotasks/i.test(name)) return 900
  if (String(event.cat).includes('devtools.timeline')) return 850
  if (String(event.cat).includes('blink')) return 800
  if (String(event.cat).includes('cc')) return 780
  if (name === 'v8.callFunction') return 500
  if (/RunTask|ThreadControllerImpl::RunTask/i.test(name)) return 100
  return 600
}

function isSynchronousAccountingEvent(event) {
  if (event?.ph !== 'X' || !finiteNumber(event.ts) || !(finiteNumber(event.dur) && event.dur > 0)) {
    return false
  }
  if (event.name === 'UserTiming::Measure' || event.name === 'CpuProfiler::StartProfiling') {
    return false
  }
  if (String(event.cat).includes('blink.user_timing')) return false
  return true
}

function splitSegment(segment, maximumLeafUs = DEFAULT_MAX_LEAF_US) {
  const durationUs = segment.endOffsetUs - segment.startOffsetUs
  assert(durationUs >= 0, 'cannot split a negative accounting segment')
  if (durationUs === 0) return []
  const splitCount = Math.ceil(durationUs / maximumLeafUs)
  const leaves = []
  let cursor = segment.startOffsetUs
  for (let splitPart = 1; cursor < segment.endOffsetUs; splitPart += 1) {
    const endOffsetUs = Math.min(segment.endOffsetUs, cursor + maximumLeafUs)
    leaves.push({
      ...segment,
      startOffsetUs: cursor,
      endOffsetUs,
      durationUs: endOffsetUs - cursor,
      ...(splitCount > 1 ? { sourceDurationUs: durationUs, splitCount, splitPart } : {}),
    })
    cursor = endOffsetUs
  }
  return leaves
}

function scaleDurations(durations, targetUs) {
  if (durations.length === 0) return []
  if (targetUs <= 0) return durations.map(() => 0)
  const sourceTotal = durations.reduce((sum, value) => sum + Math.max(0, value), 0)
  if (sourceTotal <= 0) {
    const base = Math.floor(targetUs / durations.length)
    let remainder = targetUs - base * durations.length
    return durations.map(() => {
      const value = base + (remainder > 0 ? 1 : 0)
      remainder -= remainder > 0 ? 1 : 0
      return value
    })
  }
  const exact = durations.map((value) => (Math.max(0, value) / sourceTotal) * targetUs)
  const scaled = exact.map(Math.floor)
  let remainder = targetUs - scaled.reduce((sum, value) => sum + value, 0)
  const order = exact
    .map((value, index) => ({ fraction: value - Math.floor(value), index }))
    .sort((left, right) => right.fraction - left.fraction || left.index - right.index)
  for (let index = 0; remainder > 0; index += 1) {
    scaled[order[index % order.length].index] += 1
    remainder -= 1
  }
  return scaled
}

function maximumLeafDuration(frames, key = 'leaves') {
  let maximum = 0
  for (const frame of frames) {
    const collections = key === 'threads' ? frame.threads.map((thread) => thread.leaves) : [frame[key]]
    for (const leaves of collections) {
      for (const leaf of leaves ?? []) maximum = Math.max(maximum, leaf.durationUs ?? 0)
    }
  }
  return maximum
}

export function createFrameWindows(
  frames,
  switchPageTMs,
  {
    windowStartUs = DEFAULT_WINDOW_START_US,
    windowEndUs = DEFAULT_WINDOW_END_US,
  } = {},
) {
  const ordered = [...frames]
    .filter((frame) => Number.isInteger(frame?.frameIdx) && finiteNumber(frame?.wallT))
    .sort((left, right) => left.wallT - right.wallT || left.frameIdx - right.frameIdx)
  const windows = []
  const continuityIssues = []
  for (let index = 1; index < ordered.length; index += 1) {
    const startFrame = ordered[index - 1]
    const endFrame = ordered[index]
    if (endFrame.frameIdx !== startFrame.frameIdx + 1) {
      continuityIssues.push(`frame ${startFrame.frameIdx} -> ${endFrame.frameIdx}`)
    }
    const rawStartOffsetUs = roundUs(startFrame.wallT - switchPageTMs)
    const rawEndOffsetUs = roundUs(endFrame.wallT - switchPageTMs)
    if (rawEndOffsetUs <= rawStartOffsetUs) continue
    if (rawEndOffsetUs <= windowStartUs || rawStartOffsetUs >= windowEndUs) continue
    const startOffsetUs = Math.max(windowStartUs, rawStartOffsetUs)
    const endOffsetUs = Math.min(windowEndUs, rawEndOffsetUs)
    windows.push({
      clipped: startOffsetUs !== rawStartOffsetUs || endOffsetUs !== rawEndOffsetUs,
      endFrame,
      endOffsetUs,
      frameIdx: endFrame.frameIdx,
      rawEndOffsetUs,
      rawStartOffsetUs,
      startFrame,
      startOffsetUs,
      totalUs: endOffsetUs - startOffsetUs,
    })
  }
  assert(windows.length > 0, 'no benchmark frame intersects the atomic window')
  assert(
    windows[0].startOffsetUs === windowStartUs,
    `frame capture starts at ${windows[0].startOffsetUs}us, not ${windowStartUs}us`,
  )
  assert(
    windows.at(-1).endOffsetUs === windowEndUs,
    `frame capture ends at ${windows.at(-1).endOffsetUs}us, not ${windowEndUs}us`,
  )
  for (let index = 1; index < windows.length; index += 1) {
    assert(
      windows[index - 1].endOffsetUs === windows[index].startOffsetUs,
      `frame wall coverage has a gap at ${windows[index - 1].endOffsetUs}us`,
    )
  }
  const coveredUs = windows.reduce((sum, frame) => sum + frame.totalUs, 0)
  assert(coveredUs === windowEndUs - windowStartUs, `frame coverage is ${coveredUs}us`)
  return { continuityIssues, coveredUs, windowEndUs, windows, windowStartUs }
}

export function buildBaselineWallLedger(frames, switchPageTMs, options = {}) {
  const frameWindow = createFrameWindows(frames, switchPageTMs, options)
  const atomicFrames = frameWindow.windows.map((frame) => {
    const leaves = splitSegment({
      category: 'wall-time',
      endOffsetUs: frame.endOffsetUs,
      label: 'observer-light frame interval',
      startOffsetUs: frame.startOffsetUs,
    })
    assert(
      leaves.reduce((sum, leaf) => sum + leaf.durationUs, 0) === frame.totalUs,
      `baseline frame ${frame.frameIdx} does not reconcile`,
    )
    return {
      clipped: frame.clipped,
      endOffsetUs: frame.endOffsetUs,
      frameIdx: frame.frameIdx,
      leaves,
      startOffsetUs: frame.startOffsetUs,
      totalUs: frame.totalUs,
    }
  })
  const maxLeafUs = maximumLeafDuration(atomicFrames)
  assert(maxLeafUs <= DEFAULT_MAX_LEAF_US, `baseline leaf is ${maxLeafUs}us`)
  return {
    frames: atomicFrames,
    invariants: {
      exactWindowCoverage: frameWindow.coveredUs === 12_000_000,
      frameContinuityIssues: frameWindow.continuityIssues,
      maxLeafUs,
      noLeafAbove2ms: maxLeafUs <= DEFAULT_MAX_LEAF_US,
      windowCoverageUs: frameWindow.coveredUs,
    },
    schema: 'landrush-atomic-baseline-wall/v1',
    unit: 'microseconds',
    window: { endOffsetUs: frameWindow.windowEndUs, startOffsetUs: frameWindow.windowStartUs },
  }
}

function traceNames(traceEvents) {
  const processNames = new Map()
  const threadNames = new Map()
  for (const event of traceEvents) {
    if (event.ph !== 'M') continue
    if (event.name === 'process_name') processNames.set(event.pid, event.args?.name ?? 'unknown')
    if (event.name === 'thread_name') {
      threadNames.set(`${event.pid}:${event.tid}`, event.args?.name ?? 'unknown')
    }
  }
  return { processNames, threadNames }
}

export function findTraceMarkerUs(traceEvents, markerName) {
  const exact = traceEvents.find(
    (event) => finiteNumber(event?.ts) && event.name === markerName,
  )
  if (exact) return Math.round(exact.ts)
  const candidates = traceEvents.filter((event) => {
    if (!finiteNumber(event?.ts)) return false
    if (!/Mark|TimeStamp|UserTiming/i.test(String(event.name))) return false
    try {
      return JSON.stringify(event.args ?? {}).includes(markerName)
    } catch {
      return false
    }
  })
  assert(candidates.length > 0, `trace marker ${markerName} is missing`)
  return Math.round(candidates[0].ts)
}

function chooseTraceEvent(active, events) {
  let selected = null
  for (const id of active) {
    const candidate = events[id]
    if (!selected) {
      selected = candidate
      continue
    }
    if (
      candidate.specificity > selected.specificity ||
      (candidate.specificity === selected.specificity &&
        candidate.sourceDurationUs < selected.sourceDurationUs)
    ) {
      selected = candidate
    }
  }
  return selected
}

function buildTraceThreadPartition({
  events,
  processName,
  threadName,
  threadWindowEndUs,
  threadWindowStartUs,
  traceZeroUs,
}) {
  const normalized = []
  for (const event of events) {
    const sourceStartUs = Math.round(event.ts)
    const sourceEndUs = Math.round(event.ts + event.dur)
    const startUs = Math.max(threadWindowStartUs, sourceStartUs)
    const endUs = Math.min(threadWindowEndUs, sourceEndUs)
    if (endUs <= startUs) continue
    normalized.push({
      category: traceCategory(event, processName, threadName),
      detail: traceDetail(event),
      endUs,
      id: normalized.length,
      label: traceLabel(event),
      sourceDurationUs: sourceEndUs - sourceStartUs,
      specificity: traceSpecificity(event),
      startUs,
      traceCategory: event.cat ?? '',
      traceName: event.name,
    })
  }
  const points = []
  for (const event of normalized) {
    points.push({ action: 1, id: event.id, timeUs: event.startUs })
    points.push({ action: -1, id: event.id, timeUs: event.endUs })
  }
  points.sort(
    (left, right) => left.timeUs - right.timeUs || left.action - right.action || left.id - right.id,
  )
  const active = new Set()
  const segments = []
  let cursor = threadWindowStartUs
  let pointIndex = 0
  const append = (startUs, endUs) => {
    if (endUs <= startUs) return
    const selected = chooseTraceEvent(active, normalized)
    const segment = selected
      ? {
          category: selected.category,
          detail: selected.detail,
          endOffsetUs: endUs - traceZeroUs,
          label: selected.label,
          sourceDurationUs: selected.sourceDurationUs,
          sourceEventId: selected.id,
          startOffsetUs: startUs - traceZeroUs,
          traceCategory: selected.traceCategory,
          traceName: selected.traceName,
        }
      : {
          category: 'idle-or-untraced',
          detail: null,
          endOffsetUs: endUs - traceZeroUs,
          label: 'idle, presentation wait, or work outside enabled trace categories',
          sourceDurationUs: endUs - startUs,
          sourceEventId: null,
          startOffsetUs: startUs - traceZeroUs,
          traceCategory: '',
          traceName: null,
        }
    const previous = segments.at(-1)
    if (
      previous &&
      previous.endOffsetUs === segment.startOffsetUs &&
      previous.sourceEventId === segment.sourceEventId &&
      previous.label === segment.label
    ) {
      previous.endOffsetUs = segment.endOffsetUs
      previous.sourceDurationUs = Math.max(previous.sourceDurationUs, segment.sourceDurationUs)
    } else {
      segments.push(segment)
    }
  }
  while (pointIndex < points.length) {
    const timeUs = points[pointIndex].timeUs
    append(cursor, timeUs)
    while (pointIndex < points.length && points[pointIndex].timeUs === timeUs) {
      const point = points[pointIndex]
      if (point.action < 0) active.delete(point.id)
      else active.add(point.id)
      pointIndex += 1
    }
    cursor = timeUs
  }
  append(cursor, threadWindowEndUs)
  return segments
}

export function buildTraceLedger({ frames, markerName, switchPageTMs, traceEvents }) {
  const frameWindow = createFrameWindows(frames, switchPageTMs)
  const traceZeroUs = findTraceMarkerUs(traceEvents, markerName)
  const traceStartUs = traceZeroUs + frameWindow.windowStartUs
  const traceEndUs = traceZeroUs + frameWindow.windowEndUs
  const { processNames, threadNames } = traceNames(traceEvents)
  const eventsByThread = new Map()
  for (const event of traceEvents) {
    if (!isSynchronousAccountingEvent(event)) continue
    if (event.ts + event.dur <= traceStartUs || event.ts >= traceEndUs) continue
    const key = `${event.pid}:${event.tid}`
    let values = eventsByThread.get(key)
    if (!values) {
      values = []
      eventsByThread.set(key, values)
    }
    values.push(event)
  }
  const partitions = [...eventsByThread].map(([key, events]) => {
    const [pid, tid] = key.split(':').map(Number)
    const processName = processNames.get(pid) ?? 'unknown'
    const threadName = threadNames.get(key) ?? 'unknown'
    return {
      key,
      pid,
      processName,
      segments: buildTraceThreadPartition({
        events,
        processName,
        threadName,
        threadWindowEndUs: traceEndUs,
        threadWindowStartUs: traceStartUs,
        traceZeroUs,
      }),
      threadName,
      tid,
    }
  })
  partitions.sort((left, right) => {
    const leftMain = left.threadName === 'CrRendererMain' ? 0 : 1
    const rightMain = right.threadName === 'CrRendererMain' ? 0 : 1
    return (
      leftMain - rightMain ||
      left.processName.localeCompare(right.processName) ||
      left.threadName.localeCompare(right.threadName) ||
      left.tid - right.tid
    )
  })
  const mainThread = partitions.find(
    (partition) => partition.processName === 'Renderer' && partition.threadName === 'CrRendererMain',
  )
  assert(mainThread, 'trace has no Renderer/CrRendererMain thread')
  const cursors = new Map(partitions.map((partition) => [partition.key, 0]))
  const totals = new Map(
    partitions.map((partition) => [
      partition.key,
      {
        activeUs: 0,
        idleOrUntracedUs: 0,
        key: partition.key,
        pid: partition.pid,
        processName: partition.processName,
        threadName: partition.threadName,
        tid: partition.tid,
      },
    ]),
  )
  const atomicFrames = frameWindow.windows.map((frame) => {
    const threads = partitions.map((partition) => {
      let cursor = cursors.get(partition.key) ?? 0
      while (
        cursor < partition.segments.length &&
        partition.segments[cursor].endOffsetUs <= frame.startOffsetUs
      ) {
        cursor += 1
      }
      const leaves = []
      let index = cursor
      while (
        index < partition.segments.length &&
        partition.segments[index].startOffsetUs < frame.endOffsetUs
      ) {
        const source = partition.segments[index]
        const startOffsetUs = Math.max(frame.startOffsetUs, source.startOffsetUs)
        const endOffsetUs = Math.min(frame.endOffsetUs, source.endOffsetUs)
        leaves.push(...splitSegment({ ...source, endOffsetUs, startOffsetUs }))
        index += 1
      }
      cursors.set(partition.key, cursor)
      const coveredUs = leaves.reduce((sum, leaf) => sum + leaf.durationUs, 0)
      assert(coveredUs === frame.totalUs, `${partition.key} frame ${frame.frameIdx} covers ${coveredUs}us`)
      const idleOrUntracedUs = leaves
        .filter((leaf) => leaf.category === 'idle-or-untraced')
        .reduce((sum, leaf) => sum + leaf.durationUs, 0)
      const activeUs = coveredUs - idleOrUntracedUs
      const total = totals.get(partition.key)
      total.activeUs += activeUs
      total.idleOrUntracedUs += idleOrUntracedUs
      return {
        activeUs,
        idleOrUntracedUs,
        key: partition.key,
        leaves,
        pid: partition.pid,
        processName: partition.processName,
        threadName: partition.threadName,
        tid: partition.tid,
      }
    })
    return {
      clipped: frame.clipped,
      endOffsetUs: frame.endOffsetUs,
      frameIdx: frame.frameIdx,
      startOffsetUs: frame.startOffsetUs,
      threads,
      totalUs: frame.totalUs,
    }
  })
  const maxLeafUs = maximumLeafDuration(atomicFrames, 'threads')
  assert(maxLeafUs <= DEFAULT_MAX_LEAF_US, `trace leaf is ${maxLeafUs}us`)
  return {
    frames: atomicFrames,
    invariants: {
      exactWindowCoverage: frameWindow.coveredUs === 12_000_000,
      frameContinuityIssues: frameWindow.continuityIssues,
      maxLeafUs,
      noLeafAbove2ms: maxLeafUs <= DEFAULT_MAX_LEAF_US,
      participatingThreadCount: partitions.length,
      threadFrameReconciliation: true,
      windowCoverageUs: frameWindow.coveredUs,
    },
    mainThreadKey: mainThread.key,
    schema: 'landrush-atomic-chrome-thread-wall/v1',
    threadTotals: [...totals.values()],
    traceMarkerUs: traceZeroUs,
    unit: 'microseconds',
    window: { endOffsetUs: frameWindow.windowEndUs, startOffsetUs: frameWindow.windowStartUs },
  }
}

function cpuNodeMetadata(profile) {
  const nodes = new Map((profile.nodes ?? []).map((node) => [node.id, node]))
  const parents = new Map()
  for (const node of profile.nodes ?? []) {
    for (const child of node.children ?? []) parents.set(child, node.id)
  }
  const metadata = new Map()
  for (const node of profile.nodes ?? []) {
    const callFrame = node.callFrame ?? {}
    const functionName = callFrame.functionName || '(anonymous)'
    const url = cleanUrl(callFrame.url)
    const line = Number.isInteger(callFrame.lineNumber) ? callFrame.lineNumber + 1 : null
    const label = `${functionName}${url ? ` @ ${url}${line ? `:${line}` : ''}` : ''}`
    const stack = []
    let cursor = node.id
    while (cursor !== undefined && stack.length < 16) {
      const stackNode = nodes.get(cursor)
      if (!stackNode) break
      const stackFrame = stackNode.callFrame ?? {}
      const stackFunction = stackFrame.functionName || '(anonymous)'
      const stackUrl = cleanUrl(stackFrame.url)
      stack.push(`${stackFunction}${stackUrl ? ` @ ${stackUrl}` : ''}`)
      cursor = parents.get(cursor)
    }
    metadata.set(node.id, {
      category:
        functionName === '(idle)'
          ? 'idle'
          : /garbage collector/i.test(functionName)
            ? 'garbage-collection'
            : 'sampled-javascript',
      columnNumber: Number.isInteger(callFrame.columnNumber) ? callFrame.columnNumber + 1 : null,
      functionName,
      label,
      lineNumber: line,
      nodeId: node.id,
      stack,
      url,
    })
  }
  return metadata
}

function fillSampleCoverage(segments, windowStartUs, windowEndUs) {
  const ordered = [...segments].sort((left, right) => left.startOffsetUs - right.startOffsetUs)
  const filled = []
  let cursor = windowStartUs
  for (const segment of ordered) {
    if (segment.endOffsetUs <= cursor) continue
    if (segment.startOffsetUs > cursor) {
      filled.push({
        category: 'sampling-uncovered',
        endOffsetUs: segment.startOffsetUs,
        label: 'V8 sampling uncovered time',
        nodeId: null,
        startOffsetUs: cursor,
      })
    }
    const startOffsetUs = Math.max(cursor, segment.startOffsetUs)
    filled.push({ ...segment, startOffsetUs })
    cursor = Math.max(cursor, segment.endOffsetUs)
  }
  if (cursor < windowEndUs) {
    filled.push({
      category: 'sampling-uncovered',
      endOffsetUs: windowEndUs,
      label: 'V8 sampling uncovered time',
      nodeId: null,
      startOffsetUs: cursor,
    })
  }
  return filled
}

export function buildV8SampleLedger({
  clockOffsetUs,
  clockUncertaintyUs = 0,
  frames,
  profile,
  switchPageTMs,
}) {
  assert(finiteNumber(clockOffsetUs), 'V8 ledger requires a monotonic/page clock offset')
  assert(
    finiteNumber(clockUncertaintyUs) && clockUncertaintyUs <= DEFAULT_MAX_LEAF_US,
    `V8 clock uncertainty is ${clockUncertaintyUs}us`,
  )
  const frameWindow = createFrameWindows(frames, switchPageTMs)
  const t0MonotonicUs = Math.round(clockOffsetUs + switchPageTMs * 1_000)
  const metadata = cpuNodeMetadata(profile)
  const samples = profile.samples ?? []
  const timeDeltas = profile.timeDeltas ?? []
  assert(samples.length === timeDeltas.length, 'V8 profile samples/timeDeltas length mismatch')
  let cursorUs = Math.round(profile.startTime)
  const segments = []
  for (let index = 0; index < samples.length; index += 1) {
    const deltaUs = Math.max(0, Math.round(timeDeltas[index]))
    const nextUs = cursorUs + deltaUs
    const startOffsetUs = cursorUs - t0MonotonicUs
    const endOffsetUs = nextUs - t0MonotonicUs
    if (endOffsetUs > frameWindow.windowStartUs && startOffsetUs < frameWindow.windowEndUs) {
      const node = metadata.get(samples[index]) ?? {
        category: 'sampling-uncovered',
        label: `unknown V8 node ${samples[index]}`,
        nodeId: samples[index],
      }
      segments.push({
        category: node.category,
        endOffsetUs: Math.min(frameWindow.windowEndUs, endOffsetUs),
        label: node.label,
        nodeId: node.nodeId,
        startOffsetUs: Math.max(frameWindow.windowStartUs, startOffsetUs),
      })
    }
    cursorUs = nextUs
  }
  const coveredSegments = fillSampleCoverage(
    segments,
    frameWindow.windowStartUs,
    frameWindow.windowEndUs,
  )
  const atomicFrames = frameWindow.windows.map((frame) => {
    const leaves = []
    for (const segment of coveredSegments) {
      if (segment.endOffsetUs <= frame.startOffsetUs) continue
      if (segment.startOffsetUs >= frame.endOffsetUs) break
      leaves.push(
        ...splitSegment({
          ...segment,
          endOffsetUs: Math.min(frame.endOffsetUs, segment.endOffsetUs),
          startOffsetUs: Math.max(frame.startOffsetUs, segment.startOffsetUs),
        }),
      )
    }
    const coveredUs = leaves.reduce((sum, leaf) => sum + leaf.durationUs, 0)
    assert(coveredUs === frame.totalUs, `V8 frame ${frame.frameIdx} covers ${coveredUs}us`)
    return {
      clipped: frame.clipped,
      endOffsetUs: frame.endOffsetUs,
      frameIdx: frame.frameIdx,
      leaves,
      startOffsetUs: frame.startOffsetUs,
      totalUs: frame.totalUs,
    }
  })
  const maxLeafUs = maximumLeafDuration(atomicFrames)
  assert(maxLeafUs <= DEFAULT_MAX_LEAF_US, `V8 sample leaf is ${maxLeafUs}us`)
  const usedNodeIds = new Set(
    atomicFrames.flatMap((frame) => frame.leaves.map((leaf) => leaf.nodeId)).filter(Number.isInteger),
  )
  return {
    frames: atomicFrames,
    invariants: {
      clockUncertaintyUs,
      exactWindowCoverage: frameWindow.coveredUs === 12_000_000,
      frameContinuityIssues: frameWindow.continuityIssues,
      maxLeafUs,
      noLeafAbove2ms: maxLeafUs <= DEFAULT_MAX_LEAF_US,
      windowCoverageUs: frameWindow.coveredUs,
    },
    nodes: [...usedNodeIds].map((nodeId) => metadata.get(nodeId)).filter(Boolean),
    schema: 'landrush-atomic-v8-samples/v1',
    unit: 'microseconds',
    window: { endOffsetUs: frameWindow.windowEndUs, startOffsetUs: frameWindow.windowStartUs },
  }
}

export function buildScopedCpuLedger(frames, switchPageTMs) {
  const frameWindow = createFrameWindows(frames, switchPageTMs)
  const atomicFrames = frameWindow.windows.map((frame) => {
    const cpu = frame.endFrame.cpu
    let buckets
    if (!cpu) {
      buckets = [{ category: 'profiler-missing', durationUs: frame.totalUs, label: 'scoped profiler missing' }]
    } else {
      const spans = (cpu.topLevel ?? []).filter((span) => finiteNumber(span?.ms) && span.ms >= 0)
      const measuredUs = Math.max(0, roundUs(cpu.measuredTopLevelMs ?? 0))
      const spanDurations = scaleDurations(
        spans.map((span) => roundUs(span.ms)),
        measuredUs,
      )
      buckets = spans.map((span, index) => ({
        category: 'scoped-app-system',
        durationUs: spanDurations[index],
        label: span.id,
      }))
      if (measuredUs > 0 && spans.length === 0) {
        buckets.push({
          category: 'scoped-app-system',
          durationUs: measuredUs,
          label: 'measured top-level work without exported span id',
        })
      }
      buckets.push(
        {
          category: 'unmeasured-active',
          durationUs: Math.max(0, roundUs(cpu.unmeasuredActiveMs ?? 0)),
          label: 'active work outside scoped spans',
        },
        {
          category: 'wait-or-outside-envelope',
          durationUs: Math.max(0, roundUs(cpu.waitMs ?? 0)),
          label: 'wait, presentation, or work outside the observed envelope',
        },
      )
      const sourceIntervalUs = Math.max(0, roundUs(cpu.intervalMs ?? frame.endFrame.dtMs ?? 0))
      const currentTotal = buckets.reduce((sum, bucket) => sum + bucket.durationUs, 0)
      if (sourceIntervalUs > currentTotal) {
        buckets.push({
          category: 'profiler-accounting-residual',
          durationUs: sourceIntervalUs - currentTotal,
          label: 'scoped profiler rounding/accounting residual',
        })
      }
      const scaled = scaleDurations(
        buckets.map((bucket) => bucket.durationUs),
        frame.totalUs,
      )
      buckets = buckets.map((bucket, index) => ({ ...bucket, durationUs: scaled[index] }))
    }
    const leaves = []
    let cursor = frame.startOffsetUs
    for (const bucket of buckets) {
      const endOffsetUs = cursor + bucket.durationUs
      leaves.push(
        ...splitSegment({
          category: bucket.category,
          endOffsetUs,
          label: bucket.label,
          startOffsetUs: cursor,
          syntheticDurationOrder: true,
        }),
      )
      cursor = endOffsetUs
    }
    assert(cursor === frame.endOffsetUs, `scoped frame ${frame.frameIdx} ends at ${cursor}us`)
    return {
      clipped: frame.clipped,
      endOffsetUs: frame.endOffsetUs,
      frameIdx: frame.frameIdx,
      leaves,
      sourceProfilerIntervalUs: cpu ? roundUs(cpu.intervalMs) : null,
      startOffsetUs: frame.startOffsetUs,
      totalUs: frame.totalUs,
    }
  })
  const maxLeafUs = maximumLeafDuration(atomicFrames)
  assert(maxLeafUs <= DEFAULT_MAX_LEAF_US, `scoped CPU leaf is ${maxLeafUs}us`)
  return {
    frames: atomicFrames,
    invariants: {
      exactWindowCoverage: frameWindow.coveredUs === 12_000_000,
      frameContinuityIssues: frameWindow.continuityIssues,
      maxLeafUs,
      noLeafAbove2ms: maxLeafUs <= DEFAULT_MAX_LEAF_US,
      windowCoverageUs: frameWindow.coveredUs,
    },
    ordering: 'duration-only; exported scoped spans do not carry per-frame start timestamps',
    schema: 'landrush-atomic-scoped-cpu/v1',
    unit: 'microseconds',
    window: { endOffsetUs: frameWindow.windowEndUs, startOffsetUs: frameWindow.windowStartUs },
  }
}

function gpuPassFrame(uid) {
  const match = typeof uid === 'string' ? GPU_FRAME_SUFFIX.exec(uid) : null
  return match ? Number(match[1]) : null
}

function buildMeasuredGpuFrames(frames) {
  const samples = new Map()
  for (const frame of frames) {
    const sample = frame.gpu
    if (!sample || !Number.isInteger(sample.resolvedAtFrame) || sample.resolvedAtFrame < 0) continue
    samples.set(sample.resolvedAtFrame, sample)
  }
  const rows = new Map()
  const rowsByBenchFrame = new Map()
  const mappingIssues = []
  const passValues = new Map()
  const ensure = (threeFrame) => {
    let row = rows.get(threeFrame)
    if (!row) {
      row = {
        computeStatus: null,
        passes: [],
        renderStatus: null,
        threeFrame,
      }
      rows.set(threeFrame, row)
    }
    return row
  }
  const orderedSamples = [...samples.values()].sort(
    (left, right) => left.resolvedAtFrame - right.resolvedAtFrame,
  )
  let previousResolvedAtFrame = null
  for (const sample of orderedSamples) {
    const batchFrames = new Set([
      ...(sample.threeFrames ?? []),
      ...(sample.renderFrames ?? []),
      ...(sample.computeFrames ?? []),
    ])
    for (const pass of sample.passes ?? []) {
      if (!(typeof pass?.uid === 'string' && finiteNumber(pass.ms) && pass.ms >= 0)) continue
      const threeFrame = gpuPassFrame(pass.uid)
      if (!Number.isInteger(threeFrame)) continue
      batchFrames.add(threeFrame)
      const previous = passValues.get(pass.uid)
      if (previous !== undefined) {
        assert(previous === pass.ms, `GPU pass ${pass.uid} has conflicting durations`)
        continue
      }
      passValues.set(pass.uid, pass.ms)
      ensure(threeFrame).passes.push({
        durationUs: roundUs(pass.ms),
        label: pass.uid.replace(GPU_FRAME_SUFFIX, ''),
        type: pass.uid.startsWith('c:') ? 'compute' : 'render',
        uid: pass.uid,
      })
    }
    for (const threeFrame of batchFrames) {
      const row = ensure(threeFrame)
      if (sample.renderStatus === 'measured' || sample.renderStatus === 'no-queries') {
        row.renderStatus = sample.renderStatus
      } else if (sample.renderStatus === 'incomplete') {
        row.renderStatus = 'incomplete'
      }
      if (sample.computeStatus === 'measured' || sample.computeStatus === 'no-queries') {
        row.computeStatus = sample.computeStatus
      } else if (sample.computeStatus === 'incomplete') {
        row.computeStatus = 'incomplete'
      }
    }
    const orderedThreeFrames = [...batchFrames].sort((left, right) => left - right)
    if (
      previousResolvedAtFrame !== null &&
      orderedThreeFrames.length !== sample.resolvedAtFrame - previousResolvedAtFrame
    ) {
      mappingIssues.push(
        `resolve ${previousResolvedAtFrame}->${sample.resolvedAtFrame} contains ${orderedThreeFrames.length} timestamp frame(s)`,
      )
    }
    const firstBenchFrame = sample.resolvedAtFrame - orderedThreeFrames.length
    for (let index = 0; index < orderedThreeFrames.length; index += 1) {
      const benchFrameIdx = firstBenchFrame + index
      if (rowsByBenchFrame.has(benchFrameIdx)) {
        mappingIssues.push(`bench render frame ${benchFrameIdx} has multiple timestamp frames`)
        continue
      }
      rowsByBenchFrame.set(benchFrameIdx, ensure(orderedThreeFrames[index]))
    }
    previousResolvedAtFrame = sample.resolvedAtFrame
  }
  return { mappingIssues, rowsByBenchFrame }
}

export function buildGpuAtomicLedger(frames, switchPageTMs) {
  const frameWindow = createFrameWindows(frames, switchPageTMs)
  const gpuFrames = buildMeasuredGpuFrames(frames)
  const atomicFrames = frameWindow.windows.map((frame) => {
    const benchRenderFrameIdx = frame.startFrame.frameIdx
    const measured = gpuFrames.rowsByBenchFrame.get(benchRenderFrameIdx)
    const threeFrame = measured?.threeFrame ?? null
    const leaves = []
    let gpuCursorUs = 0
    for (const pass of measured?.passes ?? []) {
      const passLeaves = splitSegment({
        category: `gpu-${pass.type}`,
        endOffsetUs: gpuCursorUs + pass.durationUs,
        label: pass.label,
        startOffsetUs: gpuCursorUs,
        uid: pass.uid,
      })
      leaves.push(...passLeaves)
      gpuCursorUs += pass.durationUs
    }
    return {
      benchEndFrameIdx: frame.frameIdx,
      benchRenderFrameIdx,
      complete:
        measured?.renderStatus === 'measured' &&
        (measured?.computeStatus === 'measured' || measured?.computeStatus === 'no-queries'),
      computeStatus: measured?.computeStatus ?? 'missing',
      endOffsetUs: frame.endOffsetUs,
      gpuBusyUs: gpuCursorUs,
      leaves,
      renderStatus: measured?.renderStatus ?? 'missing',
      startOffsetUs: frame.startOffsetUs,
      threeFrame,
      wallIntervalUs: frame.totalUs,
    }
  })
  const maxLeafUs = maximumLeafDuration(atomicFrames)
  assert(maxLeafUs <= DEFAULT_MAX_LEAF_US, `GPU leaf is ${maxLeafUs}us`)
  const completeFrameCount = atomicFrames.filter((frame) => frame.complete).length
  return {
    frames: atomicFrames,
    invariants: {
      completeFrameCount,
      exactWindowCoverage: frameWindow.coveredUs === 12_000_000,
      frameContinuityIssues: frameWindow.continuityIssues,
      gpuFrameCoverageRate: completeFrameCount / atomicFrames.length,
      maxLeafUs,
      mappingIssues: gpuFrames.mappingIssues,
      noLeafAbove2ms: maxLeafUs <= DEFAULT_MAX_LEAF_US,
      windowCoverageUs: frameWindow.coveredUs,
    },
    ordering: 'duration-only within each timestamped Three.js frame; pass timestamps expose duration but not pass start time',
    schema: 'landrush-atomic-webgpu/v1',
    unit: 'microseconds',
    window: { endOffsetUs: frameWindow.windowEndUs, startOffsetUs: frameWindow.windowStartUs },
  }
}

export function numericStats(values) {
  const ordered = values.filter(finiteNumber).sort((left, right) => left - right)
  if (ordered.length === 0) return { average: null, count: 0, maximum: null, median: null, p95: null }
  const percentile = (amount) => ordered[Math.min(ordered.length - 1, Math.floor(ordered.length * amount))]
  return {
    average: ordered.reduce((sum, value) => sum + value, 0) / ordered.length,
    count: ordered.length,
    maximum: ordered.at(-1),
    median: percentile(0.5),
    p95: percentile(0.95),
  }
}

export const ATOMIC_WINDOW = Object.freeze({
  endUs: DEFAULT_WINDOW_END_US,
  maximumLeafUs: DEFAULT_MAX_LEAF_US,
  startUs: DEFAULT_WINDOW_START_US,
})
