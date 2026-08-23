import assert from 'node:assert/strict'
import test from 'node:test'
import activeScenario, {
  activitySegmentName,
  canUseZombieActiveVisibleRestart,
  classifyZombieActiveStablePhase,
  clickZombieActiveVisibleRestart,
  collectZombieActiveFinalIssues,
  createZombieActiveDeadlineState,
  createZombieActiveValidityState,
  diffZombieActiveHeldKeys,
  drainZombieActiveDueActions,
  observeZombieActiveSample,
  phaseSegmentName,
  prepareZombieActiveValidityForRestart,
  rebaseZombieActiveSample,
  resolveZombieActivePlayIntent,
  ZOMBIE_ACTIVE_INPUT_MODALITIES,
  ZOMBIE_ACTIVE_SEMANTIC_CADENCE,
  ZOMBIE_ACTIVE_TIMING,
  zombieActiveCanvasViewportIssues,
  zombieActiveNextDeadlineMs,
  zombieActiveRequiredCycles,
  zombieActiveRestartProgressIssues,
  zombieActiveVisibleTerminalIssues,
} from './landrush-zombie-active.mjs'

const DAY_SECONDS = ZOMBIE_ACTIVE_TIMING.daySeconds
const NIGHT_SECONDS = ZOMBIE_ACTIVE_TIMING.nightSeconds
const DAY_DURATION_MS = DAY_SECONDS * 1_000
const NIGHT_DURATION_MS = NIGHT_SECONDS * 1_000

function sample({
  expectedPhase,
  frameIdx,
  night,
  phase,
  phaseReady,
  remaining,
  shotsFired = 0,
  status = 'playing',
  runAgainButtonRect = status === 'playing'
    ? null
    : { height: 38, left: 752, top: 541, width: 94 },
}) {
  return {
    bridge: { frameIdx, nodeCount: 200, visibility: 'visible' },
    canvasCount: 1,
    canvasRect: { height: 720, left: 0, top: 0, width: 1280 },
    documentFocused: true,
    documentVisibility: 'visible',
    hud: { expectedPhase, phase, phaseReady },
    loaderCount: 0,
    pickupPrompt: false,
    runAgainButtonRect,
    viewport: { height: 720, width: 1280 },
    zombie: {
      expectedPhase,
      integratedIntoExistingCanvas: true,
      night,
      phase,
      phaseReady,
      phaseSecondsRemaining: remaining,
      shotsFired,
      status,
    },
  }
}

function observe(state, nextSample, nowMs) {
  const result = observeZombieActiveSample(state, nextSample, nowMs)
  assert.deepEqual(result.issues, [])
  return result.state
}

function completeCycle(state, { cycle, frameIdx, nowMs, shotsFired }) {
  const dayNight = cycle - 1
  const dayEntry = cycle === 1 ? DAY_SECONDS - 0.5 : DAY_SECONDS
  state = observe(
    state,
    sample({
      expectedPhase: 'build',
      frameIdx: frameIdx++,
      night: dayNight,
      phase: 'build',
      phaseReady: true,
      remaining: dayEntry,
      shotsFired,
    }),
    nowMs,
  )
  for (let second = 1; second < DAY_SECONDS; second += 1) {
    nowMs += 1_000
    state = observe(
      state,
      sample({
        expectedPhase: 'build',
        frameIdx: frameIdx++,
        night: dayNight,
        phase: 'build',
        phaseReady: true,
        remaining: dayEntry - second,
        shotsFired,
      }),
      nowMs,
    )
  }
  nowMs += 500
  state = observe(
    state,
    sample({
      expectedPhase: 'build',
      frameIdx: frameIdx++,
      night: cycle,
      phase: 'night',
      phaseReady: true,
      remaining: NIGHT_SECONDS,
      shotsFired,
    }),
    nowMs,
  )
  nowMs += 2_000
  state = observe(
    state,
    sample({
      expectedPhase: 'night',
      frameIdx: frameIdx++,
      night: cycle,
      phase: 'night',
      phaseReady: true,
      remaining: NIGHT_SECONDS,
      shotsFired,
    }),
    nowMs,
  )
  for (let second = 1; second < NIGHT_SECONDS; second += 1) {
    nowMs += 1_000
    state = observe(
      state,
      sample({
        expectedPhase: 'night',
        frameIdx: frameIdx++,
        night: cycle,
        phase: 'night',
        phaseReady: true,
        remaining: NIGHT_SECONDS - second,
        shotsFired: shotsFired + second,
      }),
      nowMs,
    )
  }
  shotsFired += NIGHT_SECONDS - 1
  nowMs += 1_000
  state = observe(
    state,
    sample({
      expectedPhase: 'night',
      frameIdx: frameIdx++,
      night: cycle,
      phase: 'build',
      phaseReady: true,
      remaining: DAY_SECONDS,
      shotsFired,
    }),
    nowMs,
  )
  nowMs += 2_000
  state = observe(
    state,
    sample({
      expectedPhase: 'build',
      frameIdx: frameIdx++,
      night: cycle,
      phase: 'build',
      phaseReady: true,
      remaining: DAY_SECONDS,
      shotsFired,
    }),
    nowMs,
  )
  return { frameIdx, nowMs, shotsFired, state }
}

function validCadence(cycles, requestedDurationMs) {
  return {
    cadence: {
      fireBursts: cycles * 40,
      jumps: cycles * 16,
      maximumActiveGapMs: 1_500,
      movementChanges: cycles * 30,
      pointerMoves: cycles * 120,
    },
    inputObserver: {
      byType: {
        keydown: cycles * 30,
        keyup: cycles * 30,
        pointerdown: cycles * 40,
        pointermove: cycles * 350,
        pointerup: cycles * 40,
      },
      canvasPointerEvents: cycles * 350,
      firstAt: 0,
      lastAt: requestedDurationMs,
      trusted: cycles * 500,
    },
  }
}

test('play intent and held-key diffs are deterministic across day and night', () => {
  assert.deepEqual(
    resolveZombieActivePlayIntent({ phase: 'day', phaseElapsedMs: 0 }),
    resolveZombieActivePlayIntent({ phase: 'day', phaseElapsedMs: 0 }),
  )
  assert.equal(resolveZombieActivePlayIntent({ phase: 'day', phaseElapsedMs: 1_000 }).fire, false)
  assert.equal(resolveZombieActivePlayIntent({ phase: 'night', phaseElapsedMs: 1_000 }).fire, false)
  assert.equal(resolveZombieActivePlayIntent({ phase: 'night', phaseElapsedMs: 3_200 }).fire, true)
  assert.deepEqual(diffZombieActiveHeldKeys(['w', 'shift'], ['w', 'd', 'shift']), {
    press: ['d'],
    release: [],
  })
  const stableNight = { cycle: 2, kind: 'night' }
  assert.equal(activitySegmentName(stableNight, 2_999), 'zombie-active-night-2-movement-only')
  assert.equal(activitySegmentName(stableNight, 3_000), 'zombie-active-night-2-movement-fire')
  assert.equal(activitySegmentName(stableNight, 5_999), 'zombie-active-night-2-movement-fire')
  assert.equal(activitySegmentName(stableNight, 6_000), null)
  assert.equal(
    activitySegmentName(stableNight, 3_000, 1),
    'zombie-active-night-2-movement-fire-retry-1',
  )
  assert.equal(
    phaseSegmentName(
      sample({
        expectedPhase: 'night',
        frameIdx: 1,
        night: 2,
        phase: 'night',
        phaseReady: true,
        remaining: NIGHT_SECONDS - 1,
      }),
      1,
    ),
    'zombie-active-night-2-retry-1',
  )
})

test('deadline cadence drains every scheduled aim and fire transition across irregular ticks', () => {
  const stable = { cycle: 1, kind: 'night' }
  const ticks = [
    0,
    117,
    2_940,
    3_111,
    8_740,
    19_003,
    41_888,
    NIGHT_DURATION_MS - 1_001,
    NIGHT_DURATION_MS - 1,
  ]
  let state = createZombieActiveDeadlineState()
  const actions = []
  for (const phaseElapsedMs of ticks) {
    const drained = drainZombieActiveDueActions(state, { phaseElapsedMs, stable })
    state = drained.state
    actions.push(...drained.actions)
  }

  const aims = actions.filter((action) => action.kind === 'aim')
  const downs = actions.filter((action) => action.kind === 'fire-down')
  const ups = actions.filter((action) => action.kind === 'fire-up')
  const expectedAimCount = Math.ceil(
    NIGHT_DURATION_MS / ZOMBIE_ACTIVE_SEMANTIC_CADENCE.aimIntervalMs,
  )
  const expectedFireDownCount = Math.ceil(
    (NIGHT_DURATION_MS - ZOMBIE_ACTIVE_SEMANTIC_CADENCE.fireDelayMs) /
      ZOMBIE_ACTIVE_SEMANTIC_CADENCE.firePeriodMs,
  )
  const expectedFireUpCount = Math.ceil(
    (NIGHT_DURATION_MS -
      ZOMBIE_ACTIVE_SEMANTIC_CADENCE.fireDelayMs -
      ZOMBIE_ACTIVE_SEMANTIC_CADENCE.fireHoldMs) /
      ZOMBIE_ACTIVE_SEMANTIC_CADENCE.firePeriodMs,
  )
  assert.equal(aims.length, expectedAimCount)
  assert.equal(downs.length, expectedFireDownCount)
  assert.equal(ups.length, expectedFireUpCount)
  assert.deepEqual(
    downs.map((action) => action.deadlineMs),
    Array.from(
      { length: expectedFireDownCount },
      (_, index) =>
        ZOMBIE_ACTIVE_SEMANTIC_CADENCE.fireDelayMs +
        index * ZOMBIE_ACTIVE_SEMANTIC_CADENCE.firePeriodMs,
    ),
  )
  assert.deepEqual(
    ups.map((action) => action.deadlineMs),
    Array.from(
      { length: expectedFireUpCount },
      (_, index) =>
        ZOMBIE_ACTIVE_SEMANTIC_CADENCE.fireDelayMs +
        ZOMBIE_ACTIVE_SEMANTIC_CADENCE.fireHoldMs +
        index * ZOMBIE_ACTIVE_SEMANTIC_CADENCE.firePeriodMs,
    ),
  )
  assert.equal(zombieActiveNextDeadlineMs(state), null)
  assert.ok(
    actions.every(
      (action, index) => index === 0 || actions[index - 1].deadlineMs <= action.deadlineMs,
    ),
  )
})

test('deadline cadence does not duplicate events and resets at phase boundaries', () => {
  const stableNight = { cycle: 2, kind: 'night' }
  let state = createZombieActiveDeadlineState()
  let drained = drainZombieActiveDueActions(state, {
    phaseElapsedMs: 12_000,
    stable: stableNight,
  })
  state = drained.state
  assert.equal(drained.actions.filter((action) => action.kind === 'fire-down').length, 8)

  drained = drainZombieActiveDueActions(state, {
    phaseElapsedMs: 11_000,
    stable: stableNight,
  })
  assert.deepEqual(drained.actions, [])

  drained = drainZombieActiveDueActions(drained.state, {
    phaseElapsedMs: 0,
    stable: { cycle: 3, kind: 'day' },
  })
  assert.deepEqual(drained.actions, [])
  assert.equal(zombieActiveNextDeadlineMs(drained.state), null)

  drained = drainZombieActiveDueActions(drained.state, {
    phaseElapsedMs: 4_000,
    stable: { cycle: 3, kind: 'night' },
  })
  assert.equal(drained.actions.filter((action) => action.kind === 'fire-down').length, 1)
  assert.equal(drained.actions.filter((action) => action.kind === 'fire-up').length, 1)
})

test('deadline cadence tolerates floating-point boundary drift without draining materially early', () => {
  const stable = { cycle: 1, kind: 'night' }
  let drained = drainZombieActiveDueActions(createZombieActiveDeadlineState(), {
    phaseElapsedMs: 1_999.999,
    stable,
  })
  assert.equal(
    drained.actions.some((action) => action.deadlineMs === 2_000),
    false,
  )

  drained = drainZombieActiveDueActions(drained.state, {
    phaseElapsedMs: 1_999.999_999_999_9,
    stable,
  })
  assert.deepEqual(
    drained.actions.filter((action) => action.deadlineMs === 2_000),
    [{ deadlineMs: 2_000, kind: 'aim' }],
  )
})

test('uses one natural cycle for four minutes with a passive observer-light lifecycle', () => {
  assert.equal(zombieActiveRequiredCycles(4 * 60_000), 1)
  assert.equal(activeScenario.lifecycle.watchdog, false)
  assert.equal(activeScenario.urlParams(), 'benchmarkReport=outside&game=zombie-escape')
  assert.equal(activeScenario.urlParams().includes('landrushProbe'), false)
  assert.equal(activeScenario.urlParams().includes('navDebug'), false)
  assert.deepEqual(activeScenario.inputModalities, ZOMBIE_ACTIVE_INPUT_MODALITIES)
  assert.deepEqual(activeScenario.inputModalities.controller, {
    source: 'physical-controller-required',
    status: 'unmeasured',
  })
})

test('accepts harmless canvas bleed but rejects a material viewport mismatch', () => {
  assert.deepEqual(
    zombieActiveCanvasViewportIssues({
      canvasRect: { height: 1090.8, left: -9.6, top: -5.4, width: 1939.2 },
      viewport: { height: 1080, width: 1920 },
    }),
    [],
  )
  assert.ok(
    zombieActiveCanvasViewportIssues({
      canvasRect: { height: 720, left: 0, top: 0, width: 1280 },
      viewport: { height: 1080, width: 1920 },
    }).some((issue) => issue.includes('does not cover viewport')),
  )
})

test('only a healthy visible terminal qualifies for the real Run again control', async () => {
  const lost = sample({
    expectedPhase: 'night',
    frameIdx: 200,
    night: 2,
    phase: 'night',
    phaseReady: true,
    remaining: 38.75,
    shotsFired: 30,
    status: 'lost',
  })
  assert.equal(canUseZombieActiveVisibleRestart(lost), true)
  assert.deepEqual(zombieActiveVisibleTerminalIssues(lost, null), [])
  assert.deepEqual(
    zombieActiveVisibleTerminalIssues({ ...lost, zombie: { ...lost.zombie, status: 'won' } }, null),
    [],
  )

  const clicks = []
  await clickZombieActiveVisibleRestart(
    {
      click: async (...args) => clicks.push(args),
    },
    lost,
  )
  assert.deepEqual(clicks, [
    [
      799,
      560,
      { intent: 'restart through visible Run again control during active measurement' },
    ],
  ])

  const missingControl = { ...lost, runAgainButtonRect: null }
  assert.equal(canUseZombieActiveVisibleRestart(missingControl), false)
  assert.ok(
    zombieActiveVisibleTerminalIssues(missingControl, null).some((issue) =>
      issue.includes('Run again'),
    ),
  )
  const hidden = { ...lost, documentVisibility: 'hidden' }
  assert.equal(canUseZombieActiveVisibleRestart(hidden), false)
  assert.ok(zombieActiveVisibleTerminalIssues(hidden, null).some((issue) => issue.includes('hidden')))
  assert.equal(canUseZombieActiveVisibleRestart({ ...lost, hud: null }), false)
  const missingBridge = { ...lost, bridge: null }
  assert.equal(canUseZombieActiveVisibleRestart(missingBridge), false)
  assert.ok(
    zombieActiveVisibleTerminalIssues(missingBridge, null).some((issue) =>
      issue.includes('bridge'),
    ),
  )
  await assert.rejects(
    clickZombieActiveVisibleRestart(
      {
        click: async () => assert.fail('ineligible terminal must not click'),
      },
      missingControl,
    ),
    /not eligible/,
  )
})

test('terminal restarts require completed-cycle progress and obey the derived cap', () => {
  assert.deepEqual(
    zombieActiveRestartProgressIssues({
      completedCycles: 1,
      lastRestartCompletedCycles: 0,
      requiredCycles: 2,
      restartCount: 0,
    }),
    [],
  )
  assert.ok(
    zombieActiveRestartProgressIssues({
      completedCycles: 0,
      lastRestartCompletedCycles: 0,
      requiredCycles: 2,
      restartCount: 0,
    }).some((issue) => issue.includes('no completed-cycle progress')),
  )
  assert.ok(
    zombieActiveRestartProgressIssues({
      completedCycles: 2,
      lastRestartCompletedCycles: 1,
      requiredCycles: 2,
      restartCount: 2,
    }).some((issue) => issue.includes('limit reached')),
  )
})

test('restart accounting preserves completed cycles and discards the interrupted partial cycle', () => {
  let firstRun = {
    frameIdx: 1,
    nowMs: 0,
    shotsFired: 0,
    state: createZombieActiveValidityState(),
  }
  firstRun = completeCycle(firstRun.state, { ...firstRun, cycle: 1 })
  assert.equal(firstRun.state.completedCycles, 1)
  assert.ok(firstRun.state.cycles[2])

  const prepared = prepareZombieActiveValidityForRestart(firstRun.state)
  assert.equal(prepared.completedCycles, 1)
  assert.equal(prepared.maximumNight, 1)
  assert.equal(prepared.startedAtMs, firstRun.state.startedAtMs)
  assert.equal(prepared.last, null)
  assert.equal(prepared.cycles[2], undefined)
  assert.ok(firstRun.state.cycles[2])

  const rebasedDay = rebaseZombieActiveSample(
    sample({
      expectedPhase: 'build',
      frameIdx: firstRun.frameIdx,
      night: 0,
      phase: 'build',
      phaseReady: true,
      remaining: DAY_SECONDS - 0.5,
      shotsFired: 0,
    }),
    { cycleOffset: 1, shotsFiredOffset: firstRun.shotsFired },
  )
  assert.deepEqual(classifyZombieActiveStablePhase(rebasedDay), { cycle: 2, kind: 'day' })
  assert.equal(rebasedDay.zombie.shotsFired, firstRun.shotsFired)
  assert.deepEqual(
    observeZombieActiveSample(prepared, rebasedDay, firstRun.nowMs + 250).issues,
    [],
  )

  const resumed = completeCycle(prepared, {
    cycle: 2,
    frameIdx: firstRun.frameIdx,
    nowMs: firstRun.nowMs + 500,
    shotsFired: firstRun.shotsFired,
  })
  assert.equal(resumed.state.completedCycles, 2)
  const requestedDurationMs = resumed.state.last.atMs - resumed.state.startedAtMs
  assert.deepEqual(
    collectZombieActiveFinalIssues({
      ...validCadence(2, requestedDurationMs),
      requestedDurationMs,
      requiredCycles: 2,
      validity: resumed.state,
    }),
    [],
  )
})

test('treats HUD/simulation handoff skew as a bounded transition', () => {
  const transition = sample({
    expectedPhase: 'build',
    frameIdx: 10,
    night: 0,
    phase: 'build',
    phaseReady: true,
    remaining: 0.01,
  })
  transition.hud = { expectedPhase: 'night', phase: 'night', phaseReady: false }
  assert.equal(classifyZombieActiveStablePhase(transition), null)
  assert.deepEqual(
    observeZombieActiveSample(createZombieActiveValidityState(), transition, 0).issues,
    [],
  )
})

test('counts actual countdown through presentation skew without charging transition wall time', () => {
  let state = createZombieActiveValidityState()
  state = observe(
    state,
    sample({
      expectedPhase: 'build',
      frameIdx: 1,
      night: 1,
      phase: 'night',
      phaseReady: true,
      remaining: NIGHT_SECONDS,
    }),
    0,
  )
  state = observe(
    state,
    sample({
      expectedPhase: 'night',
      frameIdx: 2,
      night: 1,
      phase: 'night',
      phaseReady: true,
      remaining: NIGHT_SECONDS - 0.2,
    }),
    2_000,
  )
  state = observe(
    state,
    sample({
      expectedPhase: 'night',
      frameIdx: 3,
      night: 1,
      phase: 'night',
      phaseReady: true,
      remaining: 3,
    }),
    NIGHT_DURATION_MS - 1_200,
  )

  const presentationTransition = sample({
    expectedPhase: 'build',
    frameIdx: 4,
    night: 1,
    phase: 'night',
    phaseReady: false,
    remaining: 2.5,
  })
  assert.equal(classifyZombieActiveStablePhase(presentationTransition), null)
  state = observe(state, presentationTransition, NIGHT_DURATION_MS - 700)
  state = observe(
    state,
    sample({
      expectedPhase: 'build',
      frameIdx: 5,
      night: 1,
      phase: 'night',
      phaseReady: false,
      remaining: 0.25,
    }),
    NIGHT_DURATION_MS + 1_550,
  )
  state = observe(
    state,
    sample({
      expectedPhase: 'build',
      frameIdx: 6,
      night: 1,
      phase: 'build',
      phaseReady: true,
      remaining: DAY_SECONDS,
    }),
    NIGHT_DURATION_MS + 1_800,
  )

  assert.equal(state.completedCycles, 1)
  assert.equal(state.cycles[1].night.entryRemaining, NIGHT_SECONDS - 0.2)
  assert.equal(state.cycles[1].night.simulationMs, NIGHT_DURATION_MS)
  assert.equal(state.cycles[1].night.wallMs, NIGHT_DURATION_MS - 3_200)
  assert.equal(state.transitionSinceMs, null)
})

test('credits the exact skipped countdown tail from the completed run without relaxing gates', () => {
  let state = createZombieActiveValidityState()
  state = observe(
    state,
    sample({
      expectedPhase: 'build',
      frameIdx: 1,
      night: 0,
      phase: 'build',
      phaseReady: true,
      remaining: DAY_SECONDS - 0.5,
    }),
    0,
  )
  state = observe(
    state,
    sample({
      expectedPhase: 'build',
      frameIdx: 2,
      night: 0,
      phase: 'build',
      phaseReady: true,
      remaining: 0.5,
    }),
    DAY_DURATION_MS - 1_000,
  )
  state = observe(
    state,
    sample({
      expectedPhase: 'build',
      frameIdx: 3,
      night: 1,
      phase: 'night',
      phaseReady: true,
      remaining: NIGHT_SECONDS,
    }),
    DAY_DURATION_MS - 500,
  )
  state = observe(
    state,
    sample({
      expectedPhase: 'night',
      frameIdx: 4,
      night: 1,
      phase: 'night',
      phaseReady: true,
      remaining: NIGHT_SECONDS - 0.116_666_666_666_66,
    }),
    DAY_DURATION_MS + 1_500,
  )
  state = observe(
    state,
    sample({
      expectedPhase: 'night',
      frameIdx: 5,
      night: 1,
      phase: 'night',
      phaseReady: true,
      remaining: 2.716_666_666_647_24,
    }),
    DAY_DURATION_MS + NIGHT_DURATION_MS - 1_333.333_333_313_9,
  )
  state = observe(
    state,
    sample({
      expectedPhase: 'build',
      frameIdx: 6,
      night: 1,
      phase: 'build',
      phaseReady: true,
      remaining: DAY_SECONDS - 3.25,
    }),
    DAY_DURATION_MS + NIGHT_DURATION_MS + 4_750,
  )

  assert.ok(Math.abs(state.cycles[1].night.simulationMs - NIGHT_DURATION_MS) < 0.001)
  const requestedDurationMs = state.last.atMs - state.startedAtMs
  assert.deepEqual(
    collectZombieActiveFinalIssues({
      ...validCadence(1, requestedDurationMs),
      requestedDurationMs,
      requiredCycles: 1,
      validity: state,
    }),
    [],
  )
})

test('rejects illegal actual phase identities, countdown increases, skips, and long transitions', () => {
  let night = observe(
    createZombieActiveValidityState(),
    sample({
      expectedPhase: 'night',
      frameIdx: 1,
      night: 1,
      phase: 'night',
      phaseReady: true,
      remaining: 3,
    }),
    0,
  )
  const illegalAdvance = observeZombieActiveSample(
    night,
    sample({
      expectedPhase: 'build',
      frameIdx: 2,
      night: 2,
      phase: 'build',
      phaseReady: true,
      remaining: DAY_SECONDS,
    }),
    250,
  )
  assert.ok(illegalAdvance.issues.some((issue) => issue.includes('changed illegally')))

  const increase = observeZombieActiveSample(
    night,
    sample({
      expectedPhase: 'night',
      frameIdx: 2,
      night: 1,
      phase: 'night',
      phaseReady: true,
      remaining: 4,
    }),
    250,
  )
  assert.ok(increase.issues.some((issue) => issue.includes('countdown increased')))

  const day = observe(
    createZombieActiveValidityState(),
    sample({
      expectedPhase: 'build',
      frameIdx: 1,
      night: 0,
      phase: 'build',
      phaseReady: true,
      remaining: 10,
    }),
    0,
  )
  const skippedNight = observeZombieActiveSample(
    day,
    sample({
      expectedPhase: 'night',
      frameIdx: 2,
      night: 2,
      phase: 'night',
      phaseReady: true,
      remaining: NIGHT_SECONDS,
    }),
    250,
  )
  assert.ok(skippedNight.issues.some((issue) => issue.includes('night skipped')))
  assert.ok(skippedNight.issues.some((issue) => issue.includes('changed illegally')))

  night = observe(
    night,
    sample({
      expectedPhase: 'build',
      frameIdx: 2,
      night: 1,
      phase: 'night',
      phaseReady: false,
      remaining: 2.5,
    }),
    1_000,
  )
  const longTransition = observeZombieActiveSample(
    night,
    sample({
      expectedPhase: 'build',
      frameIdx: 3,
      night: 1,
      phase: 'night',
      phaseReady: false,
      remaining: 2.5,
    }),
    14_001,
  )
  assert.ok(longTransition.issues.some((issue) => issue.includes('transition exceeded')))
})

test('validity accepts repeated natural day-night-day cycles with bounded timing drift', () => {
  let result = {
    frameIdx: 1,
    nowMs: 0,
    shotsFired: 0,
    state: createZombieActiveValidityState(),
  }
  result = completeCycle(result.state, { ...result, cycle: 1 })
  result = completeCycle(result.state, { ...result, cycle: 2 })

  assert.equal(result.state.completedCycles, 2)
  assert.deepEqual(classifyZombieActiveStablePhase(result.state.last), {
    cycle: 3,
    kind: 'day',
  })
  const requestedDurationMs = result.state.last.atMs
  const issues = collectZombieActiveFinalIssues({
    ...validCadence(2, requestedDurationMs),
    requestedDurationMs,
    requiredCycles: 2,
    validity: result.state,
  })
  assert.deepEqual(issues, [])
})

test('validity rejects death and a night counter reset', () => {
  let state = createZombieActiveValidityState()
  state = observe(
    state,
    sample({
      expectedPhase: 'build',
      frameIdx: 1,
      night: 0,
      phase: 'build',
      phaseReady: true,
      remaining: DAY_SECONDS - 0.5,
    }),
    0,
  )
  const death = observeZombieActiveSample(
    state,
    sample({
      expectedPhase: 'build',
      frameIdx: 2,
      night: 0,
      phase: 'build',
      phaseReady: true,
      remaining: DAY_SECONDS - 1,
      status: 'lost',
    }),
    500,
  )
  assert.ok(death.issues.some((issue) => issue.includes('status=lost')))

  state = observe(
    state,
    sample({
      expectedPhase: 'night',
      frameIdx: 3,
      night: 1,
      phase: 'night',
      phaseReady: true,
      remaining: NIGHT_SECONDS,
    }),
    2_000,
  )
  const reset = observeZombieActiveSample(
    state,
    sample({
      expectedPhase: 'build',
      frameIdx: 4,
      night: 0,
      phase: 'build',
      phaseReady: true,
      remaining: DAY_SECONDS,
    }),
    3_000,
  )
  assert.ok(reset.issues.some((issue) => issue.includes('night reset')))
})

test('validity accepts an adjacent same-frame sample but rejects frame regression', () => {
  let state = createZombieActiveValidityState()
  state = observe(
    state,
    sample({
      expectedPhase: 'build',
      frameIdx: 10,
      night: 0,
      phase: 'build',
      phaseReady: true,
      remaining: DAY_SECONDS - 0.5,
    }),
    0,
  )

  const sameFrame = observeZombieActiveSample(
    state,
    sample({
      expectedPhase: 'build',
      frameIdx: 10,
      night: 0,
      phase: 'build',
      phaseReady: true,
      remaining: DAY_SECONDS - 0.6,
    }),
    100,
  )
  assert.deepEqual(sameFrame.issues, [])

  const regression = observeZombieActiveSample(
    sameFrame.state,
    sample({
      expectedPhase: 'build',
      frameIdx: 9,
      night: 0,
      phase: 'build',
      phaseReady: true,
      remaining: DAY_SECONDS - 0.7,
    }),
    200,
  )
  assert.ok(regression.issues.some((issue) => issue.includes('regressed from 10 to 9')))
})

test('final validity rejects countdown timing drift', () => {
  const driftedWallMs = DAY_DURATION_MS / 2
  let state = createZombieActiveValidityState()
  state = observe(
    state,
    sample({
      expectedPhase: 'build',
      frameIdx: 1,
      night: 0,
      phase: 'build',
      phaseReady: true,
      remaining: DAY_SECONDS - 0.5,
    }),
    0,
  )
  state = observe(
    state,
    sample({
      expectedPhase: 'build',
      frameIdx: 2,
      night: 0,
      phase: 'build',
      phaseReady: true,
      remaining: DAY_SECONDS - 1.5,
    }),
    driftedWallMs,
  )
  state.completedCycles = 1
  state.cycles[1].completed = true
  state.cycles[1].night.entryRemaining = NIGHT_SECONDS
  state.cycles[1].night.simulationMs = (NIGHT_SECONDS - 1) * 1_000
  state.cycles[1].night.wallMs = (NIGHT_SECONDS - 1) * 1_000

  const issues = collectZombieActiveFinalIssues({
    ...validCadence(1, driftedWallMs),
    requestedDurationMs: driftedWallMs,
    requiredCycles: 1,
    validity: state,
  })
  assert.ok(issues.some((issue) => issue.includes('timing drifted')))
})
