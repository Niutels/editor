export function createFrameContinuityTracker(measureFromFrame) {
  return {
    drainCount: 0,
    droppedByRing: 0,
    endMarkCount: 0,
    endMarkFrameIdx: null,
    firstFrameIdx: null,
    firstMeasuredFrameIdx: null,
    gaps: [],
    lastFrameIdx: null,
    lastMeasuredFrameIdx: null,
    measureFromFrame,
    measuredFrameCount: 0,
    measurementOpen: false,
    startMarkCount: 0,
    startMarkFrameIdx: null,
    totalFrameCount: 0,
  }
}

export function recordFrameDrain(tracker, { droppedByRing = 0, frames = [] }) {
  tracker.drainCount += 1
  tracker.droppedByRing += Math.max(0, droppedByRing)

  for (const frame of frames) {
    const frameIdx = frame?.frameIdx
    if (!Number.isInteger(frameIdx)) continue
    tracker.firstFrameIdx ??= frameIdx
    tracker.lastFrameIdx = frameIdx
    tracker.totalFrameCount += 1

    const marks = Array.isArray(frame.marks) ? frame.marks : []
    if (marks.includes('measure-start')) {
      tracker.startMarkCount += 1
      tracker.startMarkFrameIdx ??= frameIdx
      tracker.measurementOpen = true
    }

    if (tracker.measurementOpen) {
      if (tracker.lastMeasuredFrameIdx !== null && frameIdx !== tracker.lastMeasuredFrameIdx + 1) {
        tracker.gaps.push({
          expected: tracker.lastMeasuredFrameIdx + 1,
          received: frameIdx,
        })
      }
      tracker.firstMeasuredFrameIdx ??= frameIdx
      tracker.lastMeasuredFrameIdx = frameIdx
      tracker.measuredFrameCount += 1
    }

    if (marks.includes('measure-end')) {
      tracker.endMarkCount += 1
      tracker.endMarkFrameIdx = frameIdx
      tracker.measurementOpen = false
    }
  }
}

export function summarizeFrameContinuity(tracker) {
  const issues = []
  if (tracker.droppedByRing > 0) {
    issues.push(`${tracker.droppedByRing} frame(s) dropped by the bridge ring`)
  }
  if (tracker.startMarkCount !== 1) {
    issues.push(`measure-start mark count=${tracker.startMarkCount}`)
  }
  if (tracker.endMarkCount !== 1) {
    issues.push(`measure-end mark count=${tracker.endMarkCount}`)
  }
  if (tracker.measurementOpen) issues.push('measurement frame window never closed')
  if (tracker.measuredFrameCount === 0) issues.push('measurement frame window is empty')
  if (
    tracker.firstMeasuredFrameIdx !== null &&
    tracker.firstMeasuredFrameIdx !== tracker.measureFromFrame
  ) {
    issues.push(
      `first measured frame=${tracker.firstMeasuredFrameIdx}, expected=${tracker.measureFromFrame}`,
    )
  }
  if (
    tracker.endMarkFrameIdx !== null &&
    tracker.lastMeasuredFrameIdx !== tracker.endMarkFrameIdx
  ) {
    issues.push(
      `last measured frame=${tracker.lastMeasuredFrameIdx}, end mark=${tracker.endMarkFrameIdx}`,
    )
  }
  if (tracker.gaps.length > 0) {
    issues.push(`${tracker.gaps.length} non-consecutive measured frame gap(s)`)
  }

  return {
    drainCount: tracker.drainCount,
    droppedByRing: tracker.droppedByRing,
    endMarkCount: tracker.endMarkCount,
    endMarkFrameIdx: tracker.endMarkFrameIdx,
    firstFrameIdx: tracker.firstFrameIdx,
    firstMeasuredFrameIdx: tracker.firstMeasuredFrameIdx,
    gaps: tracker.gaps.slice(0, 20),
    issues,
    lastFrameIdx: tracker.lastFrameIdx,
    lastMeasuredFrameIdx: tracker.lastMeasuredFrameIdx,
    measureFromFrame: tracker.measureFromFrame,
    measuredFrameCount: tracker.measuredFrameCount,
    pass: issues.length === 0,
    startMarkCount: tracker.startMarkCount,
    startMarkFrameIdx: tracker.startMarkFrameIdx,
    totalFrameCount: tracker.totalFrameCount,
  }
}

export function createEventContinuityTracker(eventStartCursor) {
  return {
    drainCount: 0,
    droppedByRing: 0,
    endCursor: eventStartCursor,
    endMarkCount: 0,
    endMarkSeq: null,
    eventCount: 0,
    gaps: [],
    lastMeasuredSeq: null,
    measurementOpen: false,
    startCursor: eventStartCursor,
    startMarkCount: 0,
    startMarkSeq: null,
  }
}

export function recordEventDrain(tracker, { cursor, droppedByRing = 0, events = [] }) {
  tracker.drainCount += 1
  tracker.droppedByRing += Math.max(0, droppedByRing)
  if (Number.isInteger(cursor)) tracker.endCursor = cursor

  for (const event of events) {
    const seq = event?.seq
    if (!Number.isInteger(seq)) continue
    const isMark = event.type === 'mark'
    const label = isMark ? event.data?.label : null
    if (label === 'measure-start') {
      tracker.startMarkCount += 1
      tracker.startMarkSeq ??= seq
      tracker.measurementOpen = true
    }

    if (tracker.measurementOpen) {
      if (tracker.lastMeasuredSeq !== null && seq !== tracker.lastMeasuredSeq + 1) {
        tracker.gaps.push({
          expected: tracker.lastMeasuredSeq + 1,
          received: seq,
        })
      }
      tracker.lastMeasuredSeq = seq
      tracker.eventCount += 1
    }

    if (label === 'measure-end') {
      tracker.endMarkCount += 1
      tracker.endMarkSeq = seq
      tracker.measurementOpen = false
    }
  }
}

export function summarizeEventContinuity(tracker) {
  const issues = []
  if (tracker.droppedByRing > 0) {
    issues.push(`${tracker.droppedByRing} event(s) dropped by the bridge ring`)
  }
  if (tracker.startMarkCount !== 1) {
    issues.push(`measure-start event mark count=${tracker.startMarkCount}`)
  }
  if (tracker.endMarkCount !== 1) {
    issues.push(`measure-end event mark count=${tracker.endMarkCount}`)
  }
  if (tracker.measurementOpen) issues.push('measurement event window never closed')
  if (tracker.gaps.length > 0) {
    issues.push(`${tracker.gaps.length} non-consecutive measured event gap(s)`)
  }

  return {
    drainCount: tracker.drainCount,
    droppedByRing: tracker.droppedByRing,
    endCursor: tracker.endCursor,
    endMarkCount: tracker.endMarkCount,
    endMarkSeq: tracker.endMarkSeq,
    eventCount: tracker.eventCount,
    gaps: tracker.gaps.slice(0, 20),
    issues,
    pass: issues.length === 0,
    startCursor: tracker.startCursor,
    startMarkCount: tracker.startMarkCount,
    startMarkSeq: tracker.startMarkSeq,
  }
}
