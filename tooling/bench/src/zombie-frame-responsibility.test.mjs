import assert from 'node:assert/strict'
import test from 'node:test'
import {
  SLOW_FRAME_CONTRIBUTOR_HEADERS,
  SLOW_FRAME_HEADERS,
  buildRawFrameTimeline,
  buildZombieFrameResponsibility,
  isStrictFrameBudgetMiss,
  isStrictFrameBudgetMissMs,
  serializeSlowFrameContributorsCsv,
  serializeSlowFramesCsv,
  slowFrameContributorRows,
  slowFrameRows,
} from './zombie-frame-responsibility.mjs'

const WINDOW = Object.freeze({ endOffsetUs: 53_333, startOffsetUs: 0 })
const INTERVALS = Object.freeze([
  { endOffsetUs: 16_666, frameIdx: 10, startOffsetUs: 0 },
  { endOffsetUs: 33_333, frameIdx: 11, startOffsetUs: 16_666 },
  { endOffsetUs: 53_333, frameIdx: 12, startOffsetUs: 33_333 },
])

function assertClose(actual, expected, tolerance = 0.000_001) {
  assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} != ${expected}`)
}

function splitLeaves(startOffsetUs, endOffsetUs, category, label, detail = null) {
  const leaves = []
  let cursor = startOffsetUs
  while (cursor < endOffsetUs) {
    const end = Math.min(endOffsetUs, cursor + 2_000)
    leaves.push({
      category,
      detail,
      durationUs: end - cursor,
      endOffsetUs: end,
      label,
      startOffsetUs: cursor,
      traceCategory: 'devtools.timeline',
      traceName: category === 'idle-or-untraced' ? null : 'FunctionCall',
    })
    cursor = end
  }
  return leaves
}

function mainLeaves(interval) {
  if (interval.frameIdx === 10) {
    return splitLeaves(interval.startOffsetUs, interval.endOffsetUs, 'idle-or-untraced', 'idle')
  }
  if (interval.frameIdx === 11) {
    return [
      ...splitLeaves(16_666, 18_666, 'javascript', 'exactly two milliseconds'),
      ...splitLeaves(
        18_666,
        20_667,
        'javascript',
        'above, "two"\nline',
        { functionName: 'quoted' },
      ),
      ...splitLeaves(20_667, 33_333, 'idle-or-untraced', 'idle'),
    ]
  }
  return [
    ...splitLeaves(33_333, 49_333, 'javascript', 'long JavaScript'),
    ...splitLeaves(49_333, 51_333, 'style-layout', 'exactly two style'),
    ...splitLeaves(51_333, 53_333, 'paint-composite', 'exactly two paint'),
  ]
}

function invariants() {
  return {
    exactWindowCoverage: true,
    frameContinuityIssues: [],
    windowCoverageUs: WINDOW.endOffsetUs - WINDOW.startOffsetUs,
  }
}

function standardFrames() {
  return INTERVALS.map((interval) => ({
    clipped: false,
    ...interval,
    totalUs: interval.endOffsetUs - interval.startOffsetUs,
  }))
}

function makeFixture() {
  const traceFrames = INTERVALS.map((interval) => {
    const leaves = mainLeaves(interval)
    const idleOrUntracedUs = leaves
      .filter((leaf) => leaf.category === 'idle-or-untraced')
      .reduce((sum, leaf) => sum + leaf.durationUs, 0)
    const gpuActiveEndUs =
      interval.frameIdx === 10 ? interval.startOffsetUs + 8_000 : interval.endOffsetUs
    const gpuLeaves = [
      ...splitLeaves(
        interval.startOffsetUs,
        gpuActiveEndUs,
        'gpu-process-cpu',
        'GPUTask',
      ),
      ...splitLeaves(
        gpuActiveEndUs,
        interval.endOffsetUs,
        'idle-or-untraced',
        'idle',
      ),
    ]
    return {
      clipped: false,
      ...interval,
      threads: [
        {
          activeUs: interval.endOffsetUs - interval.startOffsetUs - idleOrUntracedUs,
          idleOrUntracedUs,
          key: '1:2',
          leaves,
          processName: 'Renderer',
          threadName: 'CrRendererMain',
        },
        {
          activeUs: interval.endOffsetUs - interval.startOffsetUs,
          idleOrUntracedUs: 0,
          key: '1:3',
          leaves: [
            {
              category: 'worker',
              durationUs: interval.endOffsetUs - interval.startOffsetUs,
              endOffsetUs: interval.endOffsetUs,
              label: 'background worker work',
              startOffsetUs: interval.startOffsetUs,
            },
          ],
          processName: 'Renderer',
          threadName: 'DedicatedWorker thread',
        },
        {
          activeUs: gpuActiveEndUs - interval.startOffsetUs,
          idleOrUntracedUs: interval.endOffsetUs - gpuActiveEndUs,
          key: '9:10',
          leaves: gpuLeaves,
          processName: 'GPU Process',
          threadName: 'CrGpuMain',
        },
      ],
      totalUs: interval.endOffsetUs - interval.startOffsetUs,
    }
  })
  const standard = standardFrames()
  return {
    baselineLedger: {
      frames: structuredClone(standard),
      invariants: invariants(),
      schema: 'baseline-test/v1',
      window: WINDOW,
    },
    gpuLedger: {
      frames: INTERVALS.map((interval) => ({
        benchEndFrameIdx: interval.frameIdx,
        benchRenderFrameIdx: interval.frameIdx - 1,
        complete: true,
        endOffsetUs: interval.endOffsetUs,
        gpuBusyUs: 750,
        startOffsetUs: interval.startOffsetUs,
        wallIntervalUs: interval.endOffsetUs - interval.startOffsetUs,
      })),
      invariants: invariants(),
      schema: 'gpu-test/v1',
      window: WINDOW,
    },
    scopedLedger: {
      frames: structuredClone(standard),
      invariants: invariants(),
      schema: 'scoped-test/v1',
      window: WINDOW,
    },
    traceLedger: {
      frames: traceFrames,
      invariants: invariants(),
      mainThreadKey: '1:2',
      schema: 'trace-test/v1',
      window: WINDOW,
    },
    v8Ledger: {
      frames: structuredClone(standard),
      invariants: invariants(),
      schema: 'v8-test/v1',
      window: WINDOW,
    },
  }
}

function makeFloatingReconciliationFixture({
  rawDurationUs = 3_602_034,
  rawStartOffsetUs = -2_000_000,
} = {}) {
  const logicalWindow = Object.freeze({
    endOffsetUs: rawStartOffsetUs + rawDurationUs,
    startOffsetUs: rawStartOffsetUs,
  })
  const traceInterval = Object.freeze({
    endOffsetUs: rawStartOffsetUs + 3_000_000,
    frameIdx: 1,
    startOffsetUs: rawStartOffsetUs,
  })
  const traceLeaves = []
  for (
    let startOffsetUs = traceInterval.startOffsetUs;
    startOffsetUs < traceInterval.endOffsetUs;
    startOffsetUs += 600
  ) {
    const endOffsetUs = Math.min(traceInterval.endOffsetUs, startOffsetUs + 600)
    traceLeaves.push({
      category: 'javascript',
      detail: null,
      durationUs: endOffsetUs - startOffsetUs,
      endOffsetUs,
      label: (traceLeaves.length & 1) === 0 ? 'alternating A' : 'alternating B',
      startOffsetUs,
      traceCategory: 'devtools.timeline',
      traceName: 'FunctionCall',
    })
  }
  const rawFrame = {
    boundaryCrossing: false,
    frameIdx: 1,
    plotEndOffsetMs: logicalWindow.endOffsetUs / 1_000,
    plotEndOffsetUs: logicalWindow.endOffsetUs,
    plotStartOffsetMs: logicalWindow.startOffsetUs / 1_000,
    plotStartOffsetUs: logicalWindow.startOffsetUs,
    rawDurationMs: rawDurationUs / 1_000,
    rawEndOffsetMs: logicalWindow.endOffsetUs / 1_000,
    rawEndOffsetUs: logicalWindow.endOffsetUs,
    rawStartOffsetMs: logicalWindow.startOffsetUs / 1_000,
    rawStartOffsetUs: logicalWindow.startOffsetUs,
  }
  const standardFrame = {
    clipped: false,
    endOffsetUs: logicalWindow.endOffsetUs,
    frameIdx: 1,
    startOffsetUs: logicalWindow.startOffsetUs,
    totalUs: logicalWindow.endOffsetUs - logicalWindow.startOffsetUs,
  }
  const standardLedger = (schema) => ({
    frames: [structuredClone(standardFrame)],
    invariants: {
      exactWindowCoverage: true,
      frameContinuityIssues: [],
      windowCoverageUs: standardFrame.totalUs,
    },
    schema,
    window: logicalWindow,
  })
  const traceTotalUs = traceInterval.endOffsetUs - traceInterval.startOffsetUs
  const traceInvariants = {
    exactWindowCoverage: true,
    frameContinuityIssues: [],
    windowCoverageUs: logicalWindow.endOffsetUs - logicalWindow.startOffsetUs,
  }
  return {
    baselineLedger: standardLedger('baseline-floating-test/v1'),
    frameTimelines: {
      trace: { frameMembership: 'floating reconciliation fixture', frames: [rawFrame] },
    },
    gpuLedger: {
      frames: [
        {
          benchEndFrameIdx: 1,
          benchRenderFrameIdx: 0,
          complete: true,
          endOffsetUs: logicalWindow.endOffsetUs,
          gpuBusyUs: 0,
          startOffsetUs: logicalWindow.startOffsetUs,
          wallIntervalUs: standardFrame.totalUs,
        },
      ],
      invariants: structuredClone(traceInvariants),
      schema: 'gpu-floating-test/v1',
      window: logicalWindow,
    },
    logicalWindow,
    scopedLedger: standardLedger('scoped-floating-test/v1'),
    traceLedger: {
      frames: [
        {
          clipped: false,
          ...traceInterval,
          threads: [
            {
              activeUs: traceTotalUs,
              idleOrUntracedUs: 0,
              key: '1:2',
              leaves: traceLeaves,
              processName: 'Renderer',
              threadName: 'CrRendererMain',
            },
            {
              activeUs: traceTotalUs,
              idleOrUntracedUs: 0,
              key: '9:10',
              leaves: [
                {
                  category: 'gpu-process-cpu',
                  durationUs: traceTotalUs,
                  endOffsetUs: traceInterval.endOffsetUs,
                  label: 'GPUTask',
                  startOffsetUs: traceInterval.startOffsetUs,
                },
              ],
              processName: 'GPU Process',
              threadName: 'CrGpuMain',
            },
          ],
          totalUs: traceTotalUs,
        },
      ],
      invariants: traceInvariants,
      mainThreadKey: '1:2',
      schema: 'trace-floating-test/v1',
      window: logicalWindow,
    },
    v8Ledger: standardLedger('v8-floating-test/v1'),
  }
}

test('uses the exact strict rational frame-budget boundary', () => {
  const exactBudgetUs = 1_000_000 / 60
  assert.equal(isStrictFrameBudgetMiss(exactBudgetUs), false)
  assert.equal(isStrictFrameBudgetMiss(exactBudgetUs - 0.000_001), false)
  assert.equal(isStrictFrameBudgetMiss(exactBudgetUs + 0.000_001), true)
  assert.equal(isStrictFrameBudgetMiss(16_666), false)
  assert.equal(isStrictFrameBudgetMiss(16_667), true)
  const exactBudgetMs = 1_000 / 60
  assert.equal(isStrictFrameBudgetMissMs(exactBudgetMs), false)
  assert.equal(isStrictFrameBudgetMissMs(exactBudgetMs - 0.000_000_001), false)
  assert.equal(isStrictFrameBudgetMissMs(exactBudgetMs + 0.000_000_001), true)
})

test('builds one exact renderer-main stack and preserves every frame and strict miss', () => {
  const bundle = buildZombieFrameResponsibility(makeFixture())
  assert.equal(bundle.primary.frames.length, 3)
  assert.deepEqual(
    bundle.primary.frames.map((frame) => frame.strictBudgetMiss),
    [false, true, true],
  )
  assert.deepEqual(
    bundle.primary.slowFrames.map((frame) => frame.frameIdx),
    [11, 12],
  )
  assert.equal(bundle.primary.slowFrameCount, 2)
  assert.equal(bundle.invariants.primaryFrameCount, 3)
  assert.equal(
    bundle.primary.series.some((series) => series.label.includes('background worker work')),
    true,
  )
  for (const frame of bundle.primary.frames) {
    assertClose(
      frame.chartBuckets.reduce((sum, bucket) => sum + bucket.durationUs, 0),
      frame.totalUs,
    )
    assertClose(
      frame.chartBuckets.reduce(
        (sum, bucket) => sum + bucket.postBudgetUsNumerator,
        0,
      ),
      frame.overBudgetUsNumerator,
    )
  }
})

test('keeps CrGpuMain occupancy parallel to the renderer-main responsibility stack', () => {
  const bundle = buildZombieFrameResponsibility(makeFixture())
  assert.equal(bundle.parallelTracks.length, 1)
  const track = bundle.parallelTracks[0]
  assert.equal(track.id, 'gpu-process-cr-gpu-main')
  assert.equal(track.key, '9:10')
  assert.equal(track.additiveToPrimary, false)
  assert.equal(track.frames.length, bundle.primary.frames.length)
  assert.deepEqual(
    track.frames.map((frame) => frame.activeUs),
    [8_000, 16_667, 20_000],
  )
  assert.deepEqual(
    track.frames.map((frame) => frame.activeWhileRendererMainIdleOrUntracedUs),
    [8_000, 12_666, 0],
  )
  assert.equal(bundle.invariants.gpuProcessTrackFrameCount, 3)
})

test('aggregates atomic leaves before the strict greater-than-two-ms fill rule', () => {
  const bundle = buildZombieFrameResponsibility(makeFixture())
  const frame = bundle.primary.slowFrames.find((candidate) => candidate.frameIdx === 11)
  const exact = frame.contributors.find(
    (contributor) => contributor.label === 'exactly two milliseconds',
  )
  const above = frame.contributors.find((contributor) => contributor.label.includes('above,'))
  assert.equal(exact.durationUs, 2_000)
  assert.equal(exact.ownColorFill, false)
  assert.equal(exact.chartBucketId, 'other-each-leq-2ms')
  assert.equal(above.durationUs, 2_001)
  assert.equal(above.sourceLeafCount, 2)
  assert.equal(above.ownColorFill, true)
  assert.match(above.chartSeriesId, /^responsibility-/u)
  assert.equal(
    bundle.primary.series.at(-1).displayedDurationUs,
    Math.max(...bundle.primary.series.map((series) => series.displayedDurationUs)),
  )
})

test('attributes the exact post-budget tail per raw leaf and reconciles the residual', () => {
  const bundle = buildZombieFrameResponsibility(makeFixture())
  const firstSlow = bundle.primary.slowFrames.find((frame) => frame.frameIdx === 11)
  assertClose(firstSlow.overBudgetUsNumerator, 20)
  assertClose(
    firstSlow.contributors.find((contributor) => contributor.category === 'gpu-process-wall')
      .postBudgetUsNumerator,
    20,
  )
  const secondSlow = bundle.primary.slowFrames.find((frame) => frame.frameIdx === 12)
  assertClose(secondSlow.overBudgetUsNumerator, 200_000)
  const style = secondSlow.contributors.find(
    (contributor) => contributor.label === 'exactly two style',
  )
  const paint = secondSlow.contributors.find(
    (contributor) => contributor.label === 'exactly two paint',
  )
  assertClose(style.postBudgetUsNumerator, 80_000)
  assertClose(paint.postBudgetUsNumerator, 120_000)
  const residual = secondSlow.chartBuckets.find(
    (bucket) => bucket.seriesId === 'other-each-leq-2ms',
  )
  assert.equal(residual.durationUs, 4_000)
  assertClose(residual.postBudgetUsNumerator, 200_000)
})

test('keeps all four differential ledgers separate and emits every slow-frame row', () => {
  const bundle = buildZombieFrameResponsibility(makeFixture())
  for (const variant of ['baseline', 'v8', 'scoped', 'gpu']) {
    assert.equal(bundle.diagnostics[variant].additiveToPrimary, false)
    assert.equal(bundle.diagnostics[variant].slowFrameCount, 2)
  }
  const frameRows = slowFrameRows(bundle)
  assert.equal(frameRows.length, 10)
  assert.deepEqual(new Set(frameRows.map((row) => row.capture_variant)), new Set([
    'baseline',
    'trace',
    'v8',
    'scoped',
    'gpu',
  ]))
  const contributorRows = slowFrameContributorRows(bundle)
  assert.equal(contributorRows.length, 6)
  assert.equal(contributorRows.every((row) => row.capture_variant === 'trace'), true)
  assertClose(
    contributorRows
      .filter((row) => row.frame_idx === 12)
      .reduce((sum, row) => sum + row.post_budget_us_numerator, 0),
    200_000,
  )
})

test('serializes stable exhaustive CSV headers and escapes contributor labels', () => {
  const bundle = buildZombieFrameResponsibility(makeFixture())
  const framesCsv = serializeSlowFramesCsv(bundle)
  const contributorsCsv = serializeSlowFrameContributorsCsv(bundle)
  assert.equal(framesCsv.split('\n')[0], SLOW_FRAME_HEADERS.join(','))
  assert.equal(
    contributorsCsv.split('\n')[0],
    SLOW_FRAME_CONTRIBUTOR_HEADERS.join(','),
  )
  assert.match(contributorsCsv, /"above, ""two""\nline"/u)
  assert.equal(framesCsv.endsWith('\n'), true)
  assert.equal(contributorsCsv.endsWith('\n'), true)
})

test('keeps full boundary-frame duration separate from clipped plot overlap', () => {
  const timeline = buildRawFrameTimeline(
    [
      { frameIdx: 1, wallT: 97.9 },
      { frameIdx: 2, wallT: 98.000_000_4 },
      { frameIdx: 3, wallT: 114.999_999_6 },
      { frameIdx: 4, wallT: 115.1 },
    ],
    100,
    { windowEndMs: 15, windowStartMs: -2 },
  )
  assert.equal(timeline.frames.length, 3)
  const first = timeline.frames[0]
  const last = timeline.frames.at(-1)
  assert.equal(first.boundaryCrossing, true)
  assert.ok(first.rawStartOffsetMs < -2)
  assert.equal(first.plotStartOffsetMs, -2)
  assertClose(first.rawDurationMs, 0.100_000_4, 0.000_000_001)
  assert.equal(last.boundaryCrossing, true)
  assert.ok(last.rawEndOffsetMs > 15)
  assert.equal(last.plotEndOffsetMs, 15)
  assertClose(last.rawDurationMs, 0.100_000_4, 0.000_000_001)
})

test('uses raw sub-microsecond duration instead of rounded ledger duration for misses', () => {
  const fixture = makeFixture()
  const rawFrames = [
    {
      boundaryCrossing: false,
      frameIdx: 10,
      plotEndOffsetMs: 16.666_666_667_7,
      plotEndOffsetUs: 16_666.666_667_7,
      plotStartOffsetMs: 0,
      plotStartOffsetUs: 0,
      rawDurationMs: 16.666_666_667_7,
      rawEndOffsetMs: 16.666_666_667_7,
      rawEndOffsetUs: 16_666.666_667_7,
      rawStartOffsetMs: 0,
      rawStartOffsetUs: 0,
    },
    {
      boundaryCrossing: false,
      frameIdx: 11,
      plotEndOffsetMs: 33.333_333_333_2,
      plotEndOffsetUs: 33_333.333_333_2,
      plotStartOffsetMs: 16.666_666_667_7,
      plotStartOffsetUs: 16_666.666_667_7,
      rawDurationMs: 16.666_666_665_5,
      rawEndOffsetMs: 33.333_333_333_2,
      rawEndOffsetUs: 33_333.333_333_2,
      rawStartOffsetMs: 16.666_666_667_7,
      rawStartOffsetUs: 16_666.666_667_7,
    },
    {
      boundaryCrossing: false,
      frameIdx: 12,
      plotEndOffsetMs: 53.333,
      plotEndOffsetUs: 53_333,
      plotStartOffsetMs: 33.333_333_333_2,
      plotStartOffsetUs: 33_333.333_333_2,
      rawDurationMs: 19.999_666_666_8,
      rawEndOffsetMs: 53.333,
      rawEndOffsetUs: 53_333,
      rawStartOffsetMs: 33.333_333_333_2,
      rawStartOffsetUs: 33_333.333_333_2,
    },
  ]
  const bundle = buildZombieFrameResponsibility({
    ...fixture,
    frameTimelines: { trace: { frameMembership: 'test raw frames', frames: rawFrames } },
  })
  assert.deepEqual(
    bundle.primary.frames.map((frame) => frame.strictBudgetMiss),
    [true, false, true],
  )
  assert.deepEqual(
    bundle.primary.slowFrames.map((frame) => frame.frameIdx),
    [10, 12],
  )
})

test('accepts only sub-nanosecond drift from high-cardinality floating reconciliation', () => {
  const bundle = buildZombieFrameResponsibility(makeFloatingReconciliationFixture())
  const frame = bundle.primary.frames[0]
  const postBudgetDifference = Math.abs(
    frame.chartBuckets.reduce((sum, bucket) => sum + bucket.postBudgetUsNumerator, 0) -
      frame.overBudgetUsNumerator,
  )
  assert.ok(postBudgetDifference > 0.000_01)
  assert.ok(postBudgetDifference < 0.000_1)
})

test('rejects floating reconciliation drift strictly above one tenth of a nanosecond', () => {
  assert.throws(
    () =>
      buildZombieFrameResponsibility(
        makeFloatingReconciliationFixture({
          rawDurationUs: 3_000_001,
          rawStartOffsetUs: 100_000_000_000,
        }),
      ),
    (error) => {
      const difference = Number(/differs by ([\d.]+)/u.exec(error.message)?.[1])
      assert.ok(difference > 0.000_1)
      return true
    },
  )
})

test('names available GPU and presentation owners and leaves only true gaps irreducible', () => {
  const fixture = makeFixture()
  const frame = fixture.traceLedger.frames[0]
  frame.threads = frame.threads.filter((thread) => thread.key !== '1:3')
  frame.threads.push({
    activeUs: 4_000,
    idleOrUntracedUs: frame.totalUs - 4_000,
    key: '20:21',
    leaves: [
      ...splitLeaves(0, 8_000, 'idle-or-untraced', 'idle'),
      ...splitLeaves(8_000, 12_000, 'paint-composite', 'DrawAndSwap'),
      ...splitLeaves(12_000, frame.totalUs, 'idle-or-untraced', 'idle'),
    ],
    processName: 'Viz',
    threadName: 'Compositor',
  })
  const bundle = buildZombieFrameResponsibility(fixture)
  const ownership = bundle.primary.frames[0].chartBuckets
  assertClose(
    ownership
      .filter((bucket) => bucket.category === 'gpu-process-wall')
      .reduce((sum, bucket) => sum + bucket.durationUs, 0),
    8_000,
  )
  assertClose(
    ownership
      .filter((bucket) => bucket.category === 'presentation-wait-wall')
      .reduce((sum, bucket) => sum + bucket.durationUs, 0),
    4_000,
  )
  assertClose(
    ownership
      .filter((bucket) => bucket.category === 'irreducible-unowned-wall')
      .reduce((sum, bucket) => sum + bucket.durationUs, 0),
    4_666,
  )
  assertClose(
    ownership.reduce((sum, bucket) => sum + bucket.durationUs, 0),
    bundle.primary.frames[0].totalUs,
  )
})

test('rejects continuity loss in every independent capture variant', () => {
  const ledgerKeys = {
    baseline: 'baselineLedger',
    gpu: 'gpuLedger',
    scoped: 'scopedLedger',
    trace: 'traceLedger',
    v8: 'v8Ledger',
  }
  for (const [variant, key] of Object.entries(ledgerKeys)) {
    const fixture = makeFixture()
    fixture[key].invariants.frameContinuityIssues.push('frame 1 -> frame 3')
    assert.throws(
      () => buildZombieFrameResponsibility(fixture),
      new RegExp(`${variant} frame continuity is invalid`, 'u'),
    )
  }
})

test('rejects a trace partition with a gap instead of hiding missing wall time', () => {
  const fixture = makeFixture()
  fixture.traceLedger.frames[1].threads[0].leaves[0].startOffsetUs += 1
  fixture.traceLedger.frames[1].threads[0].leaves[0].durationUs -= 1
  assert.throws(
    () => buildZombieFrameResponsibility(fixture),
    /leaves overlap or have a gap/u,
  )
})
