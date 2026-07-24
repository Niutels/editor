// Post-run budget evaluation over frames.jsonl + events.jsonl.
//
// Two-ledger model (CPU and GPU run in parallel — never summed against wall
// time):
//   Gate A (CPU): p99 unmeasuredActiveMs <= 3ms, and every SPIKE frame
//     (dt > 1.5x cap interval) must be explained: dt minus measured spans minus
//     overlapping long-animation-frame time <= 3ms.
//   Gate B (GPU): render+compute p95 within the frame budget; per-pass table
//     gives the attribution (no pass is ever lumped).
//   Plus: zero freezes >= threshold, zero page errors / device-lost, and the
//   bridge's own collector span stays within its overhead budget.

import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'

const round1 = (v) => (v === null || v === undefined ? null : Math.round(v * 10) / 10)
const round2 = (v) => (v === null || v === undefined ? null : Math.round(v * 100) / 100)

function percentile(sortedAsc, p) {
  if (sortedAsc.length === 0) return null
  const idx = Math.min(sortedAsc.length - 1, Math.ceil((p / 100) * sortedAsc.length) - 1)
  return sortedAsc[Math.max(0, idx)]
}

function stats(values) {
  const sorted = values.filter((v) => Number.isFinite(v)).sort((a, b) => a - b)
  if (sorted.length === 0) return { n: 0, avg: null, p50: null, p95: null, p99: null, max: null }
  const sum = sorted.reduce((a, b) => a + b, 0)
  return {
    n: sorted.length,
    avg: round2(sum / sorted.length),
    p50: round2(percentile(sorted, 50)),
    p95: round2(percentile(sorted, 95)),
    p99: round2(percentile(sorted, 99)),
    max: round2(sorted[sorted.length - 1]),
  }
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

/**
 * @param {object} opts
 * @param {string} opts.runDir
 * @param {number} opts.fpsCap page frame cap (FrameLimiter default 50)
 * @param {number} [opts.measureFromFrame] exclude warmup frames before this index
 */
export function buildReport({ runDir, fpsCap = 50, measureFromFrame = 0, meta = {} }) {
  const allFrames = readJsonl(path.join(runDir, 'frames.jsonl'))
  const events = readJsonl(path.join(runDir, 'events.jsonl'))
  const frames = allFrames.filter((f) => f.frameIdx >= measureFromFrame)

  const capIntervalMs = 1000 / fpsCap
  const spikeThresholdMs = capIntervalMs * 1.5
  const gpuBudgetMs = capIntervalMs

  // ---- frame cadence
  const dts = frames.map((f) => f.dtMs).filter((v) => v > 0)
  const dtStats = stats(dts)
  const fpsEffective = dtStats.avg ? round1(1000 / dtStats.avg) : null

  // ---- CPU ledger
  const cpuFrames = frames.filter((f) => f.cpu)
  const residuals = stats(cpuFrames.map((f) => f.cpu.unmeasuredActiveMs))
  const measured = stats(cpuFrames.map((f) => f.cpu.measuredTopLevelMs))

  const spanAgg = new Map()
  for (const frame of cpuFrames) {
    for (const span of frame.cpu.topLevel) {
      let agg = spanAgg.get(span.id)
      if (!agg) spanAgg.set(span.id, (agg = { id: span.id, values: [] }))
      agg.values.push(span.ms)
    }
  }
  const spanTable = [...spanAgg.values()]
    .map((agg) => ({
      id: agg.id,
      frames: agg.values.length,
      ...stats(agg.values),
      totalMs: round1(agg.values.reduce((a, b) => a + b, 0)),
    }))
    .sort((a, b) => b.totalMs - a.totalMs)

  const benchOverheadSpan = spanTable.find((s) => s.id.includes('BenchBridgeCollector'))

  // ---- LoAF index for spike attribution (same performance.now timebase)
  const loafs = events
    .filter((e) => e.type === 'loaf' && e.data)
    .map((e) => ({ start: e.data.startTime, end: e.data.startTime + e.data.duration, data: e.data }))

  const spikes = []
  for (const frame of frames) {
    if (frame.dtMs <= spikeThresholdMs) continue
    const frameStart = frame.wallT - frame.dtMs
    const cpu = frame.cpu
    const overlappingLoaf = loafs.filter((l) => l.end > frameStart && l.start < frame.wallT)
    const loafMs = overlappingLoaf.reduce(
      (total, l) => total + (Math.min(l.end, frame.wallT) - Math.max(l.start, frameStart)),
      0,
    )
    const measuredMs = cpu?.measuredTopLevelMs ?? 0
    // Attribution: measured spans + browser-side long-animation-frame work.
    // The two can overlap (spans run inside the animation frame), so the
    // unexplained remainder uses the larger of the two, not their sum.
    const explainedMs = Math.max(measuredMs, loafMs)
    const unexplainedMs = Math.max(0, frame.dtMs - explainedMs)
    spikes.push({
      frameIdx: frame.frameIdx,
      dtMs: round1(frame.dtMs),
      measuredMs: round1(measuredMs),
      loafMs: round1(loafMs),
      unexplainedMs: round1(unexplainedMs),
      topSpans: cpu
        ? cpu.topLevel
            .slice()
            .sort((a, b) => b.ms - a.ms)
            .slice(0, 4)
            .map((s) => ({ id: s.id, ms: round1(s.ms) }))
        : [],
      loafScripts: overlappingLoaf.flatMap((l) => l.data.scripts ?? []).slice(0, 3),
      marks: frame.marks,
    })
  }
  spikes.sort((a, b) => b.dtMs - a.dtMs)

  // ---- GPU ledger
  const gpuResolved = new Map()
  for (const frame of frames) {
    if (frame.gpu && frame.gpu.renderMs !== null && frame.gpu.resolvedAtFrame >= 0) {
      gpuResolved.set(frame.gpu.resolvedAtFrame, frame.gpu)
    }
  }
  const gpuSamples = [...gpuResolved.values()]
  const gpuTotals = stats(gpuSamples.map((g) => (g.renderMs ?? 0) + (g.computeMs ?? 0)))
  const passAgg = new Map()
  for (const sample of gpuSamples) {
    const byContext = new Map()
    for (const pass of sample.passes ?? []) {
      const key = pass.uid.replace(/:f\d+$/, '')
      byContext.set(key, (byContext.get(key) ?? 0) + pass.ms)
    }
    // A resolve batch may cover several three-frames; normalize per frame.
    const frameCount = Math.max(1, sample.passes?.length ? new Set((sample.passes ?? []).map((p) => p.uid.match(/:f(\d+)$/)?.[1])).size : 1)
    for (const [key, totalMs] of byContext) {
      let agg = passAgg.get(key)
      if (!agg) passAgg.set(key, (agg = { key, values: [] }))
      agg.values.push(totalMs / frameCount)
    }
  }
  const passTable = [...passAgg.values()]
    .map((agg) => ({ pass: agg.key, samples: agg.values.length, ...stats(agg.values) }))
    .sort((a, b) => (b.p95 ?? 0) - (a.p95 ?? 0))

  // ---- events / detectors
  const freezes = events.filter((e) => e.type === 'detector:freeze').map((e) => e.data)
  const pageErrors = events.filter((e) => e.type === 'pageerror')
  const consoleErrors = events.filter((e) => e.type === 'console:error')
  const deviceLost = events.filter((e) => e.type === 'device-lost' || e.data === 'device-lost')
  const crashes = events.filter((e) => e.type === 'crash')
  const visibilityLoss = events.filter(
    (e) => e.type === 'visibility' && e.data?.state === 'hidden',
  )

  // ---- memory slope (MB per minute, least squares)
  const memPoints = frames
    .filter((f) => f.memMB !== null)
    .map((f) => ({ x: f.wallT / 60000, y: f.memMB }))
  let memSlopePerMin = null
  if (memPoints.length > 60) {
    const n = memPoints.length
    const sx = memPoints.reduce((a, p) => a + p.x, 0)
    const sy = memPoints.reduce((a, p) => a + p.y, 0)
    const sxx = memPoints.reduce((a, p) => a + p.x * p.x, 0)
    const sxy = memPoints.reduce((a, p) => a + p.x * p.y, 0)
    const denom = n * sxx - sx * sx
    if (Math.abs(denom) > 1e-9) memSlopePerMin = round2((n * sxy - sx * sy) / denom)
  }

  // ---- gates
  const spikeUnexplained = stats(spikes.map((s) => s.unexplainedMs))
  const gates = [
    {
      gate: 'A1: CPU residual p99 <= 3ms',
      pass: residuals.n > 0 && residuals.p99 !== null && residuals.p99 <= 3,
      detail: `unmeasuredActive p99 = ${residuals.p99}ms over ${residuals.n} frames`,
    },
    {
      gate: 'A2: spike frames explained (unexplained p95 <= 3ms)',
      pass: spikes.length === 0 || (spikeUnexplained.p95 !== null && spikeUnexplained.p95 <= 3),
      detail: `${spikes.length} spikes (dt > ${round1(spikeThresholdMs)}ms), unexplained p95 = ${spikeUnexplained.p95}ms`,
    },
    {
      gate: `B: GPU total p95 <= ${round1(gpuBudgetMs)}ms`,
      pass: gpuTotals.n > 0 && gpuTotals.p95 !== null && gpuTotals.p95 <= gpuBudgetMs,
      detail: `render+compute p95 = ${gpuTotals.p95}ms over ${gpuTotals.n} resolves; per-pass table attributes all of it`,
    },
    {
      gate: 'No freezes >= 250ms',
      pass: freezes.length === 0,
      detail: `${freezes.length} freeze(s)${freezes.length ? `, worst ${Math.max(...freezes.map((f) => Math.max(f.evalMs, f.stallMs)))}ms` : ''}`,
    },
    {
      gate: 'Zero page errors / crashes / device-lost',
      pass: pageErrors.length === 0 && crashes.length === 0 && deviceLost.length === 0,
      detail: `${pageErrors.length} pageerror, ${crashes.length} crash, ${deviceLost.length} device-lost, ${consoleErrors.length} console errors`,
    },
    {
      gate: 'Run validity (page stayed visible)',
      pass: visibilityLoss.length === 0,
      detail: visibilityLoss.length ? `page went hidden ${visibilityLoss.length}x — timings unreliable` : 'visible throughout',
    },
    {
      gate: 'Bench overhead <= 0.6ms avg',
      pass: !benchOverheadSpan || (benchOverheadSpan.avg !== null && benchOverheadSpan.avg <= 0.6),
      detail: benchOverheadSpan ? `collector span avg = ${benchOverheadSpan.avg}ms` : 'collector span not present',
    },
  ]

  const report = {
    meta,
    window: { totalFrames: allFrames.length, measuredFrames: frames.length, measureFromFrame },
    cadence: { fpsCap, fpsEffective, dt: dtStats },
    cpu: {
      residuals,
      measured,
      topSpans: spanTable.slice(0, 20),
      benchOverhead: benchOverheadSpan ?? null,
    },
    gpu: { totals: gpuTotals, passes: passTable, samples: gpuSamples.length },
    spikes: { count: spikes.length, thresholdMs: round1(spikeThresholdMs), worst: spikes.slice(0, 10), unexplained: spikeUnexplained },
    detectors: {
      freezes,
      pageErrors: pageErrors.length,
      consoleErrors: consoleErrors.length,
      crashes: crashes.length,
      deviceLost: deviceLost.length,
      visibilityLoss: visibilityLoss.length,
    },
    memory: { slopeMBPerMin: memSlopePerMin, samples: memPoints.length },
    gates,
    pass: gates.every((g) => g.pass),
  }

  writeFileSync(path.join(runDir, 'report.json'), JSON.stringify(report, null, 2))
  writeFileSync(path.join(runDir, 'report.md'), renderMarkdown(report))
  return report
}

function renderMarkdown(report) {
  const lines = []
  const m = report.meta
  lines.push(`# Bench report — ${m.scenario ?? 'run'} (seed ${m.seed ?? '?'})`)
  lines.push('')
  lines.push(`- run: \`${m.runId ?? '?'}\`  git: \`${m.git?.sha?.slice(0, 8) ?? '?'}\`${m.git?.dirty ? ' (dirty)' : ''}  mode: ${m.mode ?? 'dev'}`)
  lines.push(`- adapter: ${JSON.stringify(m.adapter ?? null)}  viewport: ${m.viewport ? `${m.viewport.w}x${m.viewport.h}` : '?'}`)
  lines.push(`- frames measured: ${report.window.measuredFrames}/${report.window.totalFrames} (warmup excluded before #${report.window.measureFromFrame})`)
  lines.push('')
  lines.push(`## Verdict: ${report.pass ? 'PASS' : 'FAIL'}`)
  lines.push('')
  lines.push('| gate | result | detail |')
  lines.push('|---|---|---|')
  for (const gate of report.gates) {
    lines.push(`| ${gate.gate} | ${gate.pass ? 'PASS' : 'FAIL'} | ${gate.detail} |`)
  }
  lines.push('')
  lines.push('## Frame cadence')
  const dt = report.cadence.dt
  lines.push(
    `cap ${report.cadence.fpsCap}fps · effective ~${report.cadence.fpsEffective}fps · dt p50 ${dt.p50}ms · p95 ${dt.p95}ms · p99 ${dt.p99}ms · max ${dt.max}ms`,
  )
  lines.push('')
  lines.push('## CPU ledger (top spans by total time)')
  lines.push('')
  lines.push('| span | frames | avg ms | p95 ms | max ms | total ms |')
  lines.push('|---|---|---|---|---|---|')
  for (const span of report.cpu.topSpans.slice(0, 15)) {
    lines.push(`| \`${span.id}\` | ${span.frames} | ${span.avg} | ${span.p95} | ${span.max} | ${span.totalMs} |`)
  }
  lines.push('')
  lines.push(`residual (unmeasured active): p50 ${report.cpu.residuals.p50}ms · p95 ${report.cpu.residuals.p95}ms · p99 ${report.cpu.residuals.p99}ms · max ${report.cpu.residuals.max}ms`)
  lines.push('')
  lines.push('## GPU ledger')
  const gpu = report.gpu
  lines.push(`total (render+compute): p50 ${gpu.totals.p50}ms · p95 ${gpu.totals.p95}ms · max ${gpu.totals.max}ms over ${gpu.samples} resolves`)
  lines.push('')
  lines.push('| pass (context) | samples | avg ms | p95 ms | max ms |')
  lines.push('|---|---|---|---|---|')
  for (const pass of gpu.passes.slice(0, 15)) {
    lines.push(`| \`${pass.pass}\` | ${pass.samples} | ${pass.avg} | ${pass.p95} | ${pass.max} |`)
  }
  lines.push('')
  lines.push('_Pass context ids are stable within a run; identify a pass by toggling `?disable=ao,denoise,outline,postFx` or `?profileNo*` ablation params and diffing this table._')
  lines.push('')
  if (report.spikes.count > 0) {
    lines.push(`## Spikes (${report.spikes.count} frames > ${report.spikes.thresholdMs}ms)`)
    lines.push('')
    for (const spike of report.spikes.worst) {
      lines.push(
        `- frame ${spike.frameIdx}: ${spike.dtMs}ms (measured ${spike.measuredMs}ms, loaf ${spike.loafMs}ms, unexplained ${spike.unexplainedMs}ms)${spike.marks.length ? ` marks: ${spike.marks.join(',')}` : ''}`,
      )
      for (const span of spike.topSpans) lines.push(`    - \`${span.id}\` ${span.ms}ms`)
    }
    lines.push('')
  }
  if (report.detectors.freezes.length > 0) {
    lines.push('## Freezes')
    for (const freeze of report.detectors.freezes) {
      lines.push(`- frame ${freeze.frameIdx}: stall ${freeze.stallMs}ms / eval ${freeze.evalMs}ms${freeze.screenshot ? ` — ${freeze.screenshot}` : ''}`)
    }
    lines.push('')
  }
  lines.push(`memory slope: ${report.memory.slopeMBPerMin ?? 'n/a'} MB/min over ${report.memory.samples} samples`)
  lines.push('')
  return lines.join('\n')
}
