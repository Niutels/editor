#!/usr/bin/env node

import { readFileSync } from 'node:fs'
import path from 'node:path'

function readJson(filePath, fallback = null) {
  try {
    return JSON.parse(readFileSync(filePath, 'utf8'))
  } catch {
    return fallback
  }
}

function readJsonl(filePath) {
  try {
    return readFileSync(filePath, 'utf8')
      .split('\n')
      .filter(Boolean)
      .map((line) => JSON.parse(line))
  } catch {
    return []
  }
}

function percentile(sorted, value) {
  if (sorted.length === 0) return null
  const index = Math.max(0, Math.min(sorted.length - 1, Math.ceil(sorted.length * value) - 1))
  return sorted[index]
}

function round(value) {
  return Number.isFinite(value) ? Math.round(value * 10) / 10 : null
}

function intervals(rows, readTime) {
  return rows.slice(1).map((row, index) => round(readTime(row) - readTime(rows[index])))
}

const args = process.argv.slice(2)
const runArg = args.find((arg) => !arg.startsWith('--'))
const thresholdArg = args.find((arg) => arg.startsWith('--gap-ms='))
const gapMs = Number(thresholdArg?.split('=')[1] ?? 100)

if (!runArg || !Number.isFinite(gapMs) || gapMs <= 0) {
  console.error('usage: node analyze-run.mjs <runDir> [--gap-ms=100]')
  process.exit(2)
}

const runDir = path.resolve(runArg)
const run = readJson(path.join(runDir, 'run.json'), {})
const allFrames = readJsonl(path.join(runDir, 'frames.jsonl'))
const events = readJsonl(path.join(runDir, 'events.jsonl'))
const measureFromFrame = Number(run.measureFromFrame ?? 0)
const frames = allFrames.filter((frame) => Number(frame.frameIdx) >= measureFromFrame)
const frameTimes = frames
  .map((frame) => Number(frame.dtMs))
  .filter((value) => Number.isFinite(value) && value > 0)
  .sort((a, b) => a - b)
const gaps = frames
  .filter((frame) => Number(frame.dtMs) >= gapMs)
  .sort((a, b) => Number(a.wallT) - Number(b.wallT))
const freezes = events.filter(
  (event) => event.type === 'detector:freeze' && event.data?.kind !== 'starvation',
)
const starvations = events.filter((event) => event.type === 'detector:task-starvation')
const errors = events.filter((event) =>
  ['pageerror', 'console:error', 'crash', 'device-lost'].includes(event.type),
)

const result = {
  run: {
    runId: run.runId ?? path.basename(runDir),
    scenario: run.scenario ?? null,
    mode: run.mode ?? null,
    seed: run.seed ?? null,
    minutes: run.minutes ?? null,
    periodicCheckpoints: run.periodicCheckpoints ?? null,
    cpuProfile: run.cpuProfile ?? null,
    frameProfile: run.frameProfile ?? null,
    gpuProfile: run.gpuProfile ?? null,
  },
  frames: {
    measured: frames.length,
    p50Ms: round(percentile(frameTimes, 0.5)),
    p95Ms: round(percentile(frameTimes, 0.95)),
    p99Ms: round(percentile(frameTimes, 0.99)),
    maxMs: frameTimes.length ? round(frameTimes.at(-1)) : null,
    over100Ms: frameTimes.filter((value) => value >= 100).length,
    over150Ms: frameTimes.filter((value) => value >= 150).length,
    over200Ms: frameTimes.filter((value) => value >= 200).length,
    over250Ms: frameTimes.filter((value) => value >= 250).length,
  },
  selectedGaps: {
    thresholdMs: gapMs,
    count: gaps.length,
    timeline: gaps.map((frame, index) => ({
      frameIdx: frame.frameIdx,
      wallTMs: round(Number(frame.wallT)),
      dtMs: round(Number(frame.dtMs)),
      sincePreviousMs:
        index === 0 ? null : round(Number(frame.wallT) - Number(gaps[index - 1].wallT)),
    })),
  },
  detectors: {
    freezes: freezes.length,
    freezeIntervalsMs: intervals(freezes, (event) => Number(event.t)),
    starvations: starvations.length,
    starvationIntervalsMs: intervals(starvations, (event) => Number(event.t)),
    errors: errors.map((event) => ({ type: event.type, t: event.t, data: event.data })),
  },
}

console.log(JSON.stringify(result, null, 2))
