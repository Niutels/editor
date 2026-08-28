import assert from 'node:assert/strict'
import test from 'node:test'
import {
  buildBaselineWallLedger,
  buildGpuAtomicLedger,
  buildScopedCpuLedger,
  buildTraceLedger,
  buildV8SampleLedger,
  createFrameWindows,
} from './atomic-frame-accounting.mjs'

function frames(stepMs = 10) {
  return Array.from({ length: 1_203 }, (_, frameIdx) => ({
    cpu: {
      intervalMs: stepMs,
      measuredTopLevelMs: 3,
      topLevel: [{ id: 'simulation', ms: 3 }],
      unmeasuredActiveMs: 2,
      waitMs: 5,
    },
    dtMs: frameIdx === 0 ? 0 : stepMs,
    frameIdx,
    gpu: null,
    wallT: frameIdx * stepMs,
  }))
}

test('creates one exact continuous twelve-second wall window', () => {
  const source = frames()
  const window = createFrameWindows(source, 2_010)
  assert.equal(window.coveredUs, 12_000_000)
  assert.equal(window.windows[0].startOffsetUs, -2_000_000)
  assert.equal(window.windows.at(-1).endOffsetUs, 10_000_000)
  const ledger = buildBaselineWallLedger(source, 2_010)
  assert.equal(ledger.invariants.maxLeafUs, 2_000)
  assert.equal(ledger.invariants.noLeafAbove2ms, true)
})

test('partitions nested trace work and explicit idle without losing a microsecond', () => {
  const source = frames()
  const markerUs = 10_000_000
  const traceEvents = [
    { args: { name: 'Renderer' }, name: 'process_name', ph: 'M', pid: 1, tid: 0 },
    { args: { name: 'CrRendererMain' }, name: 'thread_name', ph: 'M', pid: 1, tid: 2 },
    { args: {}, name: 'switch-marker', ph: 'R', pid: 1, tid: 2, ts: markerUs },
    {
      args: {},
      cat: 'disabled-by-default-devtools.timeline',
      dur: 4_000,
      name: 'RunTask',
      ph: 'X',
      pid: 1,
      tid: 2,
      ts: markerUs + 1_000,
    },
    {
      args: { data: { functionName: 'tick', url: 'http://localhost/tick.ts', lineNumber: 4 } },
      cat: 'devtools.timeline',
      dur: 3_000,
      name: 'FunctionCall',
      ph: 'X',
      pid: 1,
      tid: 2,
      ts: markerUs + 1_500,
    },
  ]
  const ledger = buildTraceLedger({
    frames: source,
    markerName: 'switch-marker',
    switchPageTMs: 2_010,
    traceEvents,
  })
  assert.equal(ledger.invariants.threadFrameReconciliation, true)
  assert.equal(ledger.invariants.maxLeafUs <= 2_000, true)
  assert.equal(
    ledger.frames.some((frame) =>
      frame.threads[0].leaves.some((leaf) => leaf.label.includes('FunctionCall: tick')),
    ),
    true,
  )
})

test('reconciles scoped duration buckets after clipping and splitting', () => {
  const ledger = buildScopedCpuLedger(frames(), 2_010)
  assert.equal(ledger.invariants.windowCoverageUs, 12_000_000)
  assert.equal(ledger.invariants.maxLeafUs <= 2_000, true)
  for (const frame of ledger.frames) {
    assert.equal(
      frame.leaves.reduce((sum, leaf) => sum + leaf.durationUs, 0),
      frame.totalUs,
    )
  }
})

test('makes the V8 statistical timeline total and atomic', () => {
  const source = frames()
  const profile = {
    endTime: 20_000_000,
    nodes: [
      { callFrame: { functionName: '(root)', url: '' }, children: [2], id: 1 },
      { callFrame: { functionName: 'simulate', lineNumber: 9, url: 'http://localhost/sim.ts' }, id: 2 },
    ],
    samples: Array.from({ length: 15_000 }, () => 2),
    startTime: 5_000_000,
    timeDeltas: Array.from({ length: 15_000 }, () => 1_000),
  }
  const ledger = buildV8SampleLedger({
    clockOffsetUs: 5_000_000,
    clockUncertaintyUs: 1_000,
    frames: source,
    profile,
    switchPageTMs: 2_010,
  })
  assert.equal(ledger.invariants.windowCoverageUs, 12_000_000)
  assert.equal(ledger.invariants.clockUncertaintyUs, 1_000)
  assert.equal(ledger.invariants.maxLeafUs <= 2_000, true)
  assert.throws(
    () =>
      buildV8SampleLedger({
        clockOffsetUs: 5_000_000,
        clockUncertaintyUs: 2_001,
        frames: source,
        profile,
        switchPageTMs: 2_010,
      }),
    /V8 clock uncertainty/,
  )
})

test('maps timestamped GPU passes to the render following the start frame', () => {
  const source = frames()
  const sample = {
    computeFrames: [2],
    computeStatus: 'no-queries',
    passes: [{ ms: 4.5, uid: 'r:main:f2' }],
    renderFrames: [2],
    renderStatus: 'measured',
    resolvedAtFrame: 10,
    threeFrames: [2],
  }
  source[10].gpu = sample
  const ledger = buildGpuAtomicLedger(source, 2_010)
  const mapped = ledger.frames.find((frame) => frame.benchRenderFrameIdx === 9)
  assert(mapped)
  assert.equal(mapped.gpuBusyUs, 4_500)
  assert.equal(Math.max(...mapped.leaves.map((leaf) => leaf.durationUs)), 2_000)
})
