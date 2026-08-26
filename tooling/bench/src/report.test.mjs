import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { buildReport } from './report.mjs'

const jsonl = (rows) =>
  rows.length > 0 ? `${rows.map((row) => JSON.stringify(row)).join('\n')}\n` : ''

function cpuSample({ residualMs = 0, measuredMs = 2, collectorMs = 0.2 } = {}) {
  return {
    intervalMs: 16.67,
    activeWallMs: measuredMs,
    measuredTopLevelMs: measuredMs,
    unmeasuredActiveMs: residualMs,
    waitMs: 0,
    schedulerProfile: 'synthetic',
    topLevel: [
      { id: 'BenchBridgeCollector/useFrame', ms: collectorMs },
      { id: 'Game/update', ms: Math.max(0, measuredMs - collectorMs) },
    ],
  }
}

function gpuSample(frameIdx, totalMs = 5) {
  return {
    renderMs: totalMs - 1,
    computeMs: 1,
    resolvedAtFrame: frameIdx,
    passes: [{ uid: `main:f${frameIdx}`, ms: totalMs - 1 }],
    queryPressure: 0,
    workDoneDeltaMs: totalMs,
    supported: true,
  }
}

function gpuBatchSample({ resolvedAtFrame, frames, renderDurations, computeStatus }) {
  return {
    renderMs: renderDurations.at(-1),
    computeMs: null,
    resolvedAtFrame,
    threeFrames: frames,
    renderFrames: frames,
    computeFrames: [],
    renderStatus: 'measured',
    computeStatus,
    passes: frames.map((threeFrame, index) => ({
      uid: `r:1:main:f${threeFrame}`,
      ms: renderDurations[index],
    })),
    queryPressure: frames.length * 2,
    workDoneDeltaMs: null,
    supported: true,
  }
}

function makeFrames({
  count,
  firstFrameIdx = 1,
  dt = () => 1000 / 60,
  cpu = () => null,
  gpu = () => null,
  marks = () => [],
  draws = (index) => 20 + index,
  tris = (index) => 10_000 + index * 100,
}) {
  let wallT = 0
  return Array.from({ length: count }, (_, index) => {
    const dtMs = dt(index)
    wallT += dtMs
    return {
      frameIdx: firstFrameIdx + index,
      wallT,
      dtMs,
      simT: wallT / 1000,
      draws: draws(index),
      tris: tris(index),
      memMB: 100 + index * 0.01,
      marks: marks(index),
      cpu: cpu(index),
      gpu: gpu(index),
    }
  })
}

function addMeasurementMarks(frames) {
  const bounded = frames.map((frame) => ({ ...frame, marks: [...(frame.marks ?? [])] }))
  if (bounded.length === 0) return bounded
  bounded[0].marks.unshift('measure-start')
  bounded.at(-1).marks.push('measure-end')
  return bounded
}

function continuityFor(frames, measureFromFrame = frames[0]?.frameIdx ?? 0) {
  const measureToFrame = frames.at(-1)?.frameIdx ?? null
  return {
    pass: frames.length > 0,
    issues: [],
    drainCount: 1,
    droppedByRing: 0,
    firstFrameIdx: frames[0]?.frameIdx ?? null,
    lastFrameIdx: measureToFrame,
    totalFrameCount: frames.length,
    measureFromFrame,
    startMarkCount: frames.length > 0 ? 1 : 0,
    startMarkFrameIdx: frames[0]?.frameIdx ?? null,
    endMarkCount: frames.length > 0 ? 1 : 0,
    endMarkFrameIdx: measureToFrame,
    firstMeasuredFrameIdx: frames[0]?.frameIdx ?? null,
    lastMeasuredFrameIdx: measureToFrame,
    measuredFrameCount: frames.length,
    gaps: [],
  }
}

async function withSyntheticRun(
  {
    frames,
    events = [],
    trace = [],
    driverStartT = 0,
    driverEndT = 10_000,
    options = {},
  },
  verify,
) {
  const runDir = await mkdtemp(path.join(tmpdir(), 'landrush-report-test-'))
  try {
    const boundedFrames = addMeasurementMarks(frames)
    const measureFromFrame = options.measureFromFrame ?? boundedFrames[0]?.frameIdx ?? 0
    const measureToFrame = boundedFrames.at(-1)?.frameIdx ?? null
    const frameContinuity = continuityFor(boundedFrames, measureFromFrame)
    const baseMeta = {
      measureFromFrame,
      measureToFrame,
      measurementWindow: {
        startFrameIdx: measureFromFrame,
        endFrameIdx: measureToFrame,
        startDriverT: driverStartT,
        endDriverT: driverEndT,
        eventStartCursor: 10,
        eventEndCursor: 21,
        eventStartMarkSeq: 10,
        eventEndMarkSeq: 20,
        eventDroppedByRing: 0,
      },
      frameContinuity,
      eventContinuity: {
        pass: true,
        issues: [],
        drainCount: 1,
        droppedByRing: 0,
        startCursor: 10,
        endCursor: 21,
        startMarkCount: 1,
        endMarkCount: 1,
        startMarkSeq: 10,
        endMarkSeq: 20,
        eventCount: 11,
        gaps: [],
      },
      scenarioValidity: { pass: true, issues: [], error: null },
      requestedViewport: { width: 1280, height: 720 },
      actualViewport: { width: 1280, height: 720, dpr: 1 },
      viewportMatchesRequest: true,
      watchdog: { enabled: true, source: 'scenario-lifecycle', pollMs: 100 },
      taskStarvationMeasured: true,
      inputModalities: {
        keyboard: { status: 'measured', source: 'trusted-cdp' },
        mouse: { status: 'measured', source: 'trusted-cdp' },
        controller: { status: 'unmeasured', source: 'physical-controller-required' },
      },
      cpuProfile: false,
      frameProfile: false,
      gpuProfile: false,
    }
    const meta = { ...baseMeta, ...(options.meta ?? {}) }
    const boundedTrace = [
      {
        kind: 'measurement-boundary',
        edge: 'start',
        frameIdx: measureFromFrame,
        t: driverStartT,
      },
      ...trace,
      {
        kind: 'measurement-boundary',
        edge: 'end',
        frameIdx: measureToFrame,
        t: driverEndT,
      },
    ]
    const boundedEvents = [
      { seq: 10, t: 100, type: 'mark', data: { label: 'measure-start' } },
      ...Array.from({ length: 9 }, (_, index) => ({
        seq: 11 + index,
        t: 200 + index,
        type: 'synthetic:bridge-event',
        data: null,
      })),
      ...events,
      { seq: 20, t: 9000, type: 'mark', data: { label: 'measure-end' } },
    ]
    await Promise.all([
      writeFile(path.join(runDir, 'frames.jsonl'), jsonl(boundedFrames)),
      writeFile(path.join(runDir, 'events.jsonl'), jsonl(boundedEvents)),
      writeFile(path.join(runDir, 'trace.jsonl'), jsonl(boundedTrace)),
    ])
    const report = buildReport({
      runDir,
      ...options,
      measureFromFrame,
      meta,
    })
    const jsonText = await readFile(path.join(runDir, 'report.json'), 'utf8')
    const writtenJson = JSON.parse(jsonText)
    const markdown = await readFile(path.join(runDir, 'report.md'), 'utf8')
    await verify({
      report,
      writtenJson,
      markdown,
      jsonBytes: Buffer.byteLength(jsonText),
      boundedFrames,
    })
  } finally {
    await rm(runDir, { force: true, recursive: true })
  }
}

function findGate(report, prefix) {
  return report.gates.find((entry) => entry.gate.startsWith(prefix))
}

test('true 60 FPS on 144 Hz stays clean and 18k-frame JSON remains compact', async () => {
  const refreshPattern = [2, 2, 3, 2, 3]
  const frames = makeFrames({
    count: 18_000,
    dt: (index) => refreshPattern[index % refreshPattern.length] * (1000 / 144),
  })

  await withSyntheticRun(
    { frames, options: { meta: { displayHz: 144 } } },
    async ({ report, jsonBytes }) => {
      assert.equal(report.cadence.fpsCap, 60)
      assert.equal(report.cadence.fpsEffective, 60)
      assert.equal(report.frameBudget.expectedDisplayIntervals, 3)
      assert.equal(report.frameBudget.rawMisses.count, 7200)
      assert.equal(report.frameBudget.expectedQuantizedPacing.count, 7200)
      assert.equal(report.frameBudget.missedPresentations.count, 0)
      assert.equal(report.frameBudget.severe.count, 0)
      assert.equal(report.rollingFps.lowSampleCount, 0)
      assert.equal(report.rollingFps.episodeCount, 0)
      assert.ok(report.rollingFps.fps.min >= 59)
      assert.equal(report.gateSummary.fail, 0)
      assert.ok(jsonBytes < 1_000_000, `report JSON was ${jsonBytes} bytes`)
      assert.equal('misses' in report.frameBudget, false)
      assert.equal('events' in report.input, false)
    },
  )
})

test('presentation classification is unmeasured without explicit display Hz', async () => {
  const refreshPattern = [2, 2, 3, 2, 3]
  const frames = makeFrames({
    count: 300,
    dt: (index) => (index === 150 ? 4 : refreshPattern[index % 5]) * (1000 / 144),
  })

  await withSyntheticRun({ frames }, async ({ report }) => {
    assert.equal(report.frameBudget.display.authoritative, false)
    assert.equal(report.frameBudget.display.hz, 72)
    assert.equal(report.frameBudget.missedPresentations.count, 0)
    assert.equal(findGate(report, 'Frame presentation budget').status, 'unmeasured')
    assert.equal(report.verdict, 'PARTIAL')
  })
})

test('scenario contracts hard-gate raw cadence p95 and measured console errors', async () => {
  const scenarioContract = { cadence: { maximumP95Ms: 17.42 } }
  await withSyntheticRun(
    {
      frames: makeFrames({ count: 120, dt: () => 1000 / 60 }),
      options: { meta: { displayHz: 60, scenarioContract } },
    },
    async ({ report }) => {
      assert.equal(findGate(report, 'Cadence p95').status, 'pass')
      assert.equal(findGate(report, 'Zero page errors').status, 'pass')
      assert.equal(report.verdict, 'PARTIAL')
    },
  )

  await withSyntheticRun(
    {
      frames: makeFrames({ count: 120, dt: () => 17.421 }),
      options: { meta: { displayHz: 60, scenarioContract } },
    },
    async ({ report }) => {
      assert.equal(report.cadence.dt.p95, 17.42)
      assert.equal(findGate(report, 'Cadence p95').status, 'fail')
      assert.equal(report.verdict, 'FAIL')
    },
  )

  await withSyntheticRun(
    {
      events: [{ t: 1_000, type: 'console:error', data: ['synthetic failure'] }],
      frames: makeFrames({ count: 120, dt: () => 1000 / 60 }),
      options: { meta: { displayHz: 60, scenarioContract } },
    },
    async ({ report }) => {
      assert.equal(report.detectors.consoleErrors, 1)
      assert.equal(findGate(report, 'Cadence p95').status, 'pass')
      assert.equal(findGate(report, 'Zero page errors').status, 'fail')
      assert.equal(report.verdict, 'FAIL')
    },
  )
})

test('boundary operators distinguish expected quantization, misses, and severe frames', async () => {
  const budgetMs = 1000 / 60
  const displayIntervalMs = 1000 / 144
  const expectedMaxMs = 3 * displayIntervalMs
  const rawThresholdMs = budgetMs + 0.75
  const presentationThresholdMs = expectedMaxMs + 0.75
  const severeThresholdMs = Math.max(
    2 * budgetMs,
    expectedMaxMs + displayIntervalMs + 0.75,
  )
  const dts = [
    rawThresholdMs,
    rawThresholdMs + 0.000_001,
    presentationThresholdMs,
    presentationThresholdMs + 0.000_001,
    severeThresholdMs,
  ]
  const frames = makeFrames({ count: dts.length, dt: (index) => dts[index] })

  await withSyntheticRun(
    { frames, options: { meta: { displayHz: 144 } } },
    async ({ report }) => {
      assert.deepEqual(report.frameBudget.rawMisses.frameRanges, ['2-5'])
      assert.deepEqual(report.frameBudget.expectedQuantizedPacing.frameRanges, ['2-3'])
      assert.deepEqual(report.frameBudget.missedPresentations.frameRanges, ['4-5'])
      assert.deepEqual(report.frameBudget.severe.frameRanges, ['5'])
      assert.equal(report.frameBudget.rawMissThresholdMs, rawThresholdMs)
      assert.equal(report.frameBudget.missedPresentationThresholdMs, presentationThresholdMs)
      assert.equal(report.frameBudget.severeThresholdMs, severeThresholdMs)
    },
  )
})

test('CPU named spans stay scoped and A1 never becomes a global CPU pass', async () => {
  const frames = makeFrames({
    count: 100,
    cpu: () => cpuSample({ residualMs: 0 }),
    gpu: (index) => gpuSample(index + 1),
  })
  await withSyntheticRun(
    {
      frames,
      options: {
        meta: { displayHz: 60, cpuProfile: true, frameProfile: true, gpuProfile: true },
      },
    },
    async ({ report, markdown }) => {
      assert.equal(findGate(report, 'CPU profiler frame coverage').status, 'pass')
      assert.equal(findGate(report, 'GPU profiler frame coverage').status, 'pass')
      assert.equal(findGate(report, 'A1:').status, 'unmeasured')
      assert.match(findGate(report, 'A1:').detail, /not independent whole-frame CPU coverage/u)
      assert.equal(report.cpu.attribution.status, 'measured-scoped')
      assert.equal(report.cpu.attribution.cdpProfileRequested, true)
      assert.equal(report.verdict, 'PARTIAL')
      assert.match(markdown, /CPU scoped diagnostics/u)
    },
  )
})

test('requested CPU and GPU profiling below 90% coverage fails', async () => {
  const frames = makeFrames({
    count: 100,
    cpu: (index) => (index < 89 ? cpuSample() : {}),
    gpu: (index) => (index < 89 ? gpuSample(index + 1) : null),
  })
  await withSyntheticRun(
    {
      frames,
      options: { meta: { displayHz: 60, frameProfile: true, gpuProfile: true } },
    },
    async ({ report }) => {
      assert.equal(findGate(report, 'CPU profiler frame coverage').status, 'fail')
      assert.equal(findGate(report, 'GPU profiler frame coverage').status, 'fail')
      assert.equal(report.cpu.attribution.status, 'incomplete')
      assert.equal(report.gpu.attribution.status, 'incomplete')
      assert.equal(report.verdict, 'FAIL')
    },
  )
})

test('GPU resolve batches are grouped per Three frame and duplicate UIDs are counted once', async () => {
  const firstBatch = gpuBatchSample({
    resolvedAtFrame: 3,
    frames: [101, 102, 103],
    renderDurations: [30, 40, 50],
    computeStatus: 'no-queries',
  })
  const secondBatch = gpuBatchSample({
    resolvedAtFrame: 6,
    frames: [103, 104, 105, 106],
    renderDurations: [50, 60, 70, 80],
    computeStatus: 'no-queries',
  })
  const frames = makeFrames({
    count: 6,
    gpu: (index) => (index === 2 ? firstBatch : index === 5 ? secondBatch : null),
  })

  await withSyntheticRun(
    {
      frames,
      options: { meta: { displayHz: 60, gpuProfile: true } },
    },
    async ({ report, markdown }) => {
      assert.equal(report.gpu.samples, 2)
      assert.equal(report.gpu.totals.n, 6)
      assert.equal(report.gpu.totals.p95, 80)
      assert.equal(report.gpu.renderTotals.p95, 80)
      assert.equal(report.gpu.passes[0].samples, 6)
      assert.equal(report.gpu.passes[0].p95, 80)
      assert.equal(report.gpu.attribution.coveredFrames, 6)
      assert.equal(report.gpu.attribution.compute.status, 'no-timestamped-work')
      assert.equal(report.gpu.attribution.deduplication.duplicatePasses, 1)
      assert.equal(report.gpu.attribution.deduplication.conflictingDuplicatePasses, 0)
      assert.equal(findGate(report, 'GPU profiler frame coverage').status, 'pass')
      assert.equal(findGate(report, 'B: GPU').status, 'fail')
      assert.match(markdown, /p95 80ms .*over 6 timestamped Three renderer frame/u)
    },
  )
})

test('GPU totals remain unmeasured when legacy batches omit compute accounting', async () => {
  const firstBatch = gpuBatchSample({
    resolvedAtFrame: 3,
    frames: [201, 202, 203],
    renderDurations: [30, 40, 50],
    computeStatus: null,
  })
  const secondBatch = gpuBatchSample({
    resolvedAtFrame: 6,
    frames: [204, 205, 206],
    renderDurations: [60, 70, 80],
    computeStatus: null,
  })
  const frames = makeFrames({
    count: 6,
    gpu: (index) => (index === 2 ? firstBatch : index === 5 ? secondBatch : null),
  })

  await withSyntheticRun(
    {
      frames,
      options: { meta: { displayHz: 60, gpuProfile: true } },
    },
    async ({ report, markdown }) => {
      assert.equal(report.gpu.totals.n, 0)
      assert.equal(report.gpu.renderTotals.n, 6)
      assert.equal(report.gpu.renderTotals.p95, 80)
      assert.equal(report.gpu.observedTotals.p95, 80)
      assert.equal(report.gpu.attribution.compute.status, 'unmeasured')
      assert.equal(report.gpu.attribution.status, 'incomplete')
      assert.equal(findGate(report, 'GPU profiler frame coverage').status, 'fail')
      assert.equal(findGate(report, 'B: GPU').status, 'unmeasured')
      assert.match(markdown, /complete total unavailable; render-only p95 80ms/u)
    },
  )
})

test('A2 requires the maximum unexplained severe frame to be within 3ms', async () => {
  const frames = makeFrames({
    count: 21,
    dt: () => 40,
    cpu: (index) => cpuSample({ measuredMs: index === 20 ? 0 : 39 }),
  })
  await withSyntheticRun(
    { frames, options: { meta: { displayHz: 60, frameProfile: true } } },
    async ({ report }) => {
      const a2 = findGate(report, 'A2:')
      assert.equal(a2.status, 'fail')
      assert.equal(report.spikes.unexplained.p95, 1)
      assert.equal(report.spikes.unexplained.max, 40)
    },
  )
})

test('ring drops and measured-frame gaps are hard continuity failures', async () => {
  const frames = makeFrames({ count: 100 })
  const badContinuity = {
    ...continuityFor(frames),
    pass: false,
    issues: ['1 frame(s) dropped by the bridge ring'],
    droppedByRing: 1,
    gaps: [{ expected: 50, received: 51 }],
  }
  await withSyntheticRun(
    {
      frames,
      options: { meta: { displayHz: 60, frameContinuity: badContinuity } },
    },
    async ({ report }) => {
      const continuity = findGate(report, 'Frame capture continuity')
      assert.equal(continuity.status, 'fail')
      assert.equal(report.frameContinuity.droppedByRing, 1)
      assert.equal(report.frameContinuity.gapCount, 1)
      assert.equal(report.verdict, 'FAIL')
    },
  )
})

test('phase segments are paired, nested, and half-open without sibling overlap', async () => {
  const frames = makeFrames({
    count: 40,
    marks: (index) => {
      if (index === 0) return ['outer-start']
      if (index === 10) return ['inner-start']
      if (index === 15) return ['checkpoint']
      if (index === 20) return ['inner-end']
      if (index === 30) return ['outer-end']
      return []
    },
  })
  await withSyntheticRun(
    { frames, options: { meta: { displayHz: 60 } } },
    async ({ report }) => {
      assert.equal(report.phases.pairing.valid, true)
      assert.equal(report.phases.pointMarks.count, 1)
      const measure = report.phases.segments.find((segment) => segment.name === 'measure')
      const outer = report.phases.segments.find((segment) => segment.name === 'outer')
      const inner = report.phases.segments.find((segment) => segment.name === 'inner')
      assert.deepEqual(
        [measure.depth, measure.startFrameIdx, measure.endFrameIdxExclusive, measure.frameCount],
        [0, 1, 40, 39],
      )
      assert.deepEqual(
        [outer.depth, outer.startFrameIdx, outer.endFrameIdxExclusive, outer.frameCount],
        [1, 1, 31, 30],
      )
      assert.deepEqual(
        [inner.depth, inner.startFrameIdx, inner.endFrameIdxExclusive, inner.frameCount],
        [2, 11, 21, 10],
      )
    },
  )
})

test('unpaired phase marks fail validity instead of extending to measurement end', async () => {
  const frames = makeFrames({
    count: 90,
    marks: (index) => (index === 10 ? ['zombie-night-start'] : []),
  })
  await withSyntheticRun(
    { frames, options: { meta: { displayHz: 60 } } },
    async ({ report }) => {
      assert.equal(report.phases.pairing.valid, false)
      assert.equal(report.phases.pairing.unpairedCount, 1)
      assert.equal(findGate(report, 'Phase marks').status, 'fail')
      assert.equal(
        report.phases.segments.some((segment) => segment.name === 'zombie-night'),
        false,
      )
    },
  )
})

test('input coverage is measurement-bound and distinguishes held control from dispatch gaps', async () => {
  const frames = makeFrames({ count: 90 })
  const trace = [
    { seq: -1, kind: 'move', t: -10, x: 0, y: 0 },
    { seq: 0, kind: 'move', t: 100, x: 1, y: 1 },
    { seq: 1, kind: 'keyDown', t: 110, key: 'w', intent: 'run' },
    { seq: 2, kind: 'mouseDown', t: 210, button: 'left', intent: 'fire' },
    { seq: 3, kind: 'mouseUp', t: 310, button: 'left', intent: 'release' },
    { seq: 4, kind: 'keyUp', t: 1000, key: 'w', intent: 'scenario cleanup' },
    {
      seq: 5,
      kind: 'releaseAll',
      t: 1100,
      releasedKeys: ['w'],
      releasedMouseButtons: [],
      intent: 'scenario cleanup',
    },
    { seq: 6, kind: 'move', t: 1300, x: 9, y: 9 },
  ]
  await withSyntheticRun(
    {
      frames,
      trace,
      driverEndT: 1200,
      options: { meta: { displayHz: 60 } },
    },
    async ({ report, markdown }) => {
      assert.equal(report.input.dispatchRecordCount, 4)
      assert.equal(report.input.cleanupRecordCount, 2)
      assert.deepEqual(report.input.byKind, {
        keyDown: 1,
        mouseDown: 1,
        mouseUp: 1,
        move: 1,
      })
      assert.deepEqual(report.input.modalities, {
        keyboard: true,
        pointer: true,
        controller: false,
        other: false,
      })
      assert.equal(report.input.maxDispatchGap.ms, 890)
      assert.equal(report.input.maxUncontrolledIdleGap.ms, 200)
      assert.deepEqual(report.input.heldAtEnd, { keys: [], mouseButtons: [] })
      assert.equal(report.input.provenance.controller.status, 'unmeasured')
      assert.match(markdown, /max dispatch gap 890ms/u)
      assert.match(markdown, /max uncontrolled idle 200ms/u)
    },
  )
})

test('events are filtered to the inclusive measurement window and starvation is tri-state', async () => {
  const frames = makeFrames({ count: 180 })
  const events = [
    { t: -100, type: 'pageerror', data: 'before measurement' },
    {
      t: 1000,
      type: 'detector:task-starvation',
      data: { t: 10_000, frameIdx: 40, evalMs: 310, count: 2 },
    },
    {
      t: 2000,
      type: 'detector:task-starvation',
      data: { t: 20_000, frameIdx: 72, evalMs: 480, count: 3 },
    },
    { t: 4000, type: 'pageerror', data: 'after measurement' },
  ]
  await withSyntheticRun(
    {
      frames,
      events,
      driverEndT: 3000,
      options: { meta: { displayHz: 60 } },
    },
    async ({ report, markdown }) => {
      assert.equal(report.detectors.pageErrors, 0)
      assert.equal(report.detectors.taskStarvation.count, 2)
      assert.equal(report.detectors.taskStarvation.mergedPollCount, 5)
      assert.equal(report.detectors.taskStarvation.evalMs.max, 480)
      assert.equal(findGate(report, 'No main-thread task starvation').status, 'fail')
      assert.match(markdown, /## Main-thread task starvation/u)
    },
  )

  await withSyntheticRun(
    {
      frames,
      events: [],
      driverEndT: 3000,
      options: {
        meta: {
          displayHz: 60,
          watchdog: { enabled: false, source: 'scenario-lifecycle', pollMs: null },
          taskStarvationMeasured: false,
        },
      },
    },
    async ({ report }) => {
      assert.equal(findGate(report, 'No main-thread task starvation').status, 'unmeasured')
    },
  )
})

test('scenario and viewport validity are hard gates', async () => {
  const frames = makeFrames({ count: 90 })
  await withSyntheticRun(
    {
      frames,
      options: {
        meta: {
          displayHz: 60,
          scenarioValidity: {
            pass: false,
            issues: ['scenario error: player died'],
            error: { name: 'Error', message: 'player died', stack: null },
          },
          actualViewport: { width: 1279, height: 720, dpr: 1 },
          viewportMatchesRequest: false,
        },
      },
    },
    async ({ report }) => {
      assert.equal(findGate(report, 'Scenario validity').status, 'fail')
      assert.equal(findGate(report, 'Requested viewport').status, 'fail')
      assert.equal(report.verdict, 'FAIL')
    },
  )
})

test('trace-boundary disagreement and event continuity loss are hard failures', async () => {
  const frames = makeFrames({ count: 90 })
  const measureFromFrame = frames[0].frameIdx
  const measureToFrame = frames.at(-1).frameIdx

  await withSyntheticRun(
    {
      frames,
      options: {
        meta: {
          displayHz: 60,
          measurementWindow: {
            startFrameIdx: measureFromFrame + 1,
            endFrameIdx: measureToFrame,
            startDriverT: 0,
            endDriverT: 10_000,
            eventStartCursor: 10,
            eventEndCursor: 21,
            eventStartMarkSeq: 10,
            eventEndMarkSeq: 20,
            eventDroppedByRing: 0,
          },
        },
      },
    },
    async ({ report }) => {
      assert.equal(findGate(report, 'Input trace').status, 'fail')
      assert.match(report.input.measurementWindow.issues.join(' '), /start frame disagrees/u)
    },
  )

  await withSyntheticRun(
    {
      frames,
      options: {
        meta: {
          displayHz: 60,
          eventContinuity: {
            pass: false,
            issues: ['1 non-consecutive measured event gap(s)'],
            drainCount: 2,
            droppedByRing: 0,
            startCursor: 10,
            endCursor: 21,
            startMarkCount: 1,
            endMarkCount: 1,
            startMarkSeq: 10,
            endMarkSeq: 20,
            eventCount: 10,
            gaps: [{ expected: 15, received: 16 }],
          },
        },
      },
    },
    async ({ report }) => {
      assert.equal(findGate(report, 'Event stream').status, 'fail')
      assert.equal(report.eventWindow.continuity.gapCount, 1)
      assert.equal(report.verdict, 'FAIL')
    },
  )
})

test('disabled profilers, watchdog state, viewport dimensions, and missing end bounds stay conservative', async () => {
  const profiledFrames = makeFrames({
    count: 90,
    dt: (index) => (index === 1 ? 40 : 1000 / 60),
    cpu: () => cpuSample(),
    gpu: (index) => gpuSample(index + 1),
  })
  await withSyntheticRun(
    {
      frames: profiledFrames,
      options: {
        meta: {
          displayHz: 60,
          frameProfile: false,
          gpuProfile: false,
          watchdog: { enabled: false, source: 'scenario-lifecycle', pollMs: null },
          taskStarvationMeasured: true,
          actualViewport: { width: 1279, height: 720, dpr: 1 },
          viewportMatchesRequest: true,
        },
      },
    },
    async ({ report, markdown }) => {
      assert.equal(findGate(report, 'CPU profiler frame coverage').status, 'unmeasured')
      assert.equal(findGate(report, 'GPU profiler frame coverage').status, 'unmeasured')
      assert.equal(findGate(report, 'A2:').status, 'unmeasured')
      assert.equal(findGate(report, 'B: GPU').status, 'unmeasured')
      assert.equal(findGate(report, 'Bench overhead').status, 'unmeasured')
      assert.equal(findGate(report, 'No main-thread task starvation').status, 'unmeasured')
      assert.equal(findGate(report, 'Requested viewport').status, 'fail')
      assert.match(markdown, /1279x720 @ DPR 1/u)
    },
  )

  await withSyntheticRun(
    {
      frames: makeFrames({ count: 90 }),
      options: { meta: { displayHz: 60, measureToFrame: null } },
    },
    async ({ report }) => {
      assert.equal(report.window.measuredFrames, 0)
      assert.equal(findGate(report, 'Frame capture continuity').status, 'fail')
      assert.equal(findGate(report, 'Measured frame window').status, 'fail')
      assert.equal(report.verdict, 'FAIL')
    },
  )
})

test('overlapping LoAF evidence is unioned before computing A2 unexplained time', async () => {
  const frames = makeFrames({
    count: 2,
    dt: (index) => (index === 0 ? 1000 / 60 : 40),
    cpu: () => cpuSample({ measuredMs: 0, collectorMs: 0 }),
  })
  const events = [
    {
      t: 100,
      type: 'loaf',
      data: { startTime: 1000 / 60, duration: 25, scripts: [] },
    },
    {
      t: 101,
      type: 'loaf',
      data: { startTime: 1000 / 60, duration: 25, scripts: [] },
    },
  ]
  await withSyntheticRun(
    {
      frames,
      events,
      options: { meta: { displayHz: 60, frameProfile: true } },
    },
    async ({ report }) => {
      assert.equal(report.spikes.count, 1)
      assert.equal(report.spikes.worst[0].loafMs, 25)
      assert.equal(report.spikes.unexplained.max, 15)
      assert.equal(findGate(report, 'A2:').status, 'fail')
    },
  )
})

test('cadence starts after measure-start and raw dt freezes remain authoritative without watchdog', async () => {
  const frames = makeFrames({
    count: 3,
    dt: (index) => (index < 2 ? 300 : 1000 / 60),
  })
  await withSyntheticRun(
    {
      frames,
      options: {
        meta: {
          displayHz: 60,
          watchdog: { enabled: false, source: 'scenario-lifecycle', pollMs: null },
          taskStarvationMeasured: false,
        },
      },
    },
    async ({ report }) => {
      assert.equal(report.frameBudget.eligibleFrameCount, 2)
      assert.deepEqual(report.frameBudget.severe.frameRanges, ['2'])
      assert.equal(report.detectors.freezes.count, 1)
      assert.deepEqual(report.detectors.freezes.frameRanges, ['2'])
      assert.deepEqual(report.detectors.freezes.worst[0].sources, ['frame-cadence'])
      assert.equal(findGate(report, 'No frame freezes').status, 'fail')
      assert.equal(findGate(report, 'No main-thread task starvation').status, 'unmeasured')
    },
  )
})
