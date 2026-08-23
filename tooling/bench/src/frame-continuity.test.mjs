import assert from 'node:assert/strict'
import test from 'node:test'

import { BridgeClient } from './bridge-client.mjs'
import {
  createEventContinuityTracker,
  createFrameContinuityTracker,
  recordEventDrain,
  recordFrameDrain,
  summarizeEventContinuity,
  summarizeFrameContinuity,
} from './frame-continuity.mjs'

test('accepts one complete consecutive measurement window across drains', () => {
  const tracker = createFrameContinuityTracker(10)
  recordFrameDrain(tracker, {
    frames: [
      { frameIdx: 8, marks: [] },
      { frameIdx: 9, marks: [] },
      { frameIdx: 10, marks: ['measure-start'] },
      { frameIdx: 11, marks: [] },
    ],
  })
  recordFrameDrain(tracker, {
    frames: [
      { frameIdx: 12, marks: [] },
      { frameIdx: 13, marks: ['measure-end'] },
      { frameIdx: 14, marks: [] },
    ],
  })

  assert.deepEqual(summarizeFrameContinuity(tracker), {
    drainCount: 2,
    droppedByRing: 0,
    endMarkCount: 1,
    endMarkFrameIdx: 13,
    firstFrameIdx: 8,
    firstMeasuredFrameIdx: 10,
    gaps: [],
    issues: [],
    lastFrameIdx: 14,
    lastMeasuredFrameIdx: 13,
    measureFromFrame: 10,
    measuredFrameCount: 4,
    pass: true,
    startMarkCount: 1,
    startMarkFrameIdx: 10,
    totalFrameCount: 7,
  })
})

test('rejects bridge drops, missing boundaries, and measured frame gaps', () => {
  const tracker = createFrameContinuityTracker(20)
  recordFrameDrain(tracker, {
    droppedByRing: 4,
    frames: [
      { frameIdx: 21, marks: ['measure-start'] },
      { frameIdx: 23, marks: [] },
    ],
  })

  const summary = summarizeFrameContinuity(tracker)
  assert.equal(summary.pass, false)
  assert.deepEqual(summary.gaps, [{ expected: 22, received: 23 }])
  assert.match(summary.issues.join('; '), /dropped by the bridge ring/u)
  assert.match(summary.issues.join('; '), /measure-end mark count=0/u)
  assert.match(summary.issues.join('; '), /first measured frame=21, expected=20/u)
  assert.match(summary.issues.join('; '), /non-consecutive measured frame gap/u)
})

test('BridgeClient reports a ring drop on its first pull', async () => {
  const page = {
    async evaluate(_callback, cursor) {
      assert.equal(cursor, 0)
      return JSON.stringify({
        cursor: 10,
        frames: [{ frameIdx: 7 }, { frameIdx: 8 }, { frameIdx: 9 }],
      })
    },
  }
  const bridge = new BridgeClient(page)

  const result = await bridge.pumpFrames()

  assert.equal(result.droppedByRing, 7)
  assert.equal(bridge.frameCursor, 10)
})

test('accepts one cursor-bounded event measurement window across drains', () => {
  const tracker = createEventContinuityTracker(40)
  recordEventDrain(tracker, {
    cursor: 43,
    events: [
      { seq: 40, type: 'mark', data: { label: 'measure-start' } },
      { seq: 41, type: 'loaf' },
      { seq: 42, type: 'bus:tool:change' },
    ],
  })
  recordEventDrain(tracker, {
    cursor: 45,
    events: [
      { seq: 43, type: 'longtask' },
      { seq: 44, type: 'mark', data: { label: 'measure-end' } },
    ],
  })

  assert.deepEqual(summarizeEventContinuity(tracker), {
    drainCount: 2,
    droppedByRing: 0,
    endCursor: 45,
    endMarkCount: 1,
    endMarkSeq: 44,
    eventCount: 5,
    gaps: [],
    issues: [],
    pass: true,
    startCursor: 40,
    startMarkCount: 1,
    startMarkSeq: 40,
  })
})

test('rejects event ring drops, missing boundaries, and sequence gaps', () => {
  const tracker = createEventContinuityTracker(12)
  recordEventDrain(tracker, {
    cursor: 18,
    droppedByRing: 2,
    events: [
      { seq: 14, type: 'mark', data: { label: 'measure-start' } },
      { seq: 17, type: 'loaf' },
    ],
  })

  const summary = summarizeEventContinuity(tracker)
  assert.equal(summary.pass, false)
  assert.deepEqual(summary.gaps, [{ expected: 15, received: 17 }])
  assert.match(summary.issues.join('; '), /dropped by the bridge ring/u)
  assert.match(summary.issues.join('; '), /measure-end event mark count=0/u)
})

test('BridgeClient primes frame cursors and reports cursor-bounded event drains', async () => {
  const evaluations = []
  const page = {
    async evaluate(_callback, cursor) {
      evaluations.push(cursor)
      return JSON.stringify({
        cursor: 8,
        events: [
          { seq: 6, type: 'mark', data: { label: 'measure-start' } },
          { seq: 7, type: 'loaf' },
        ],
      })
    },
  }
  const bridge = new BridgeClient(page)
  bridge.primeFrameCursor(55)
  bridge.eventCursor = 4

  const batch = await bridge.pumpEventBatch()

  assert.equal(bridge.frameCursor, 55)
  assert.deepEqual(evaluations, [4])
  assert.equal(batch.requestedCursor, 4)
  assert.equal(batch.cursor, 8)
  assert.equal(batch.droppedByRing, 2)
  assert.equal(bridge.eventCursor, 8)
})
