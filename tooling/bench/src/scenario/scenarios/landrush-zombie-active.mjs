import { scenarioDurationMs } from '../scenario-utils.mjs'

export const ZOMBIE_ACTIVE_TIMING = Object.freeze({
  daySeconds: 60,
  nightSeconds: 180,
})

export const ZOMBIE_ACTIVE_INPUT_MODALITIES = Object.freeze({
  controller: Object.freeze({
    status: 'unmeasured',
    source: 'physical-controller-required',
  }),
  keyboard: Object.freeze({ status: 'measured', source: 'trusted-cdp' }),
  mouse: Object.freeze({ status: 'measured', source: 'trusted-cdp' }),
})

const CONTROL_TICK_MS = 250
const DEADLINE_EPSILON_MS = 1e-6
const NIGHT_DURATION_MS = ZOMBIE_ACTIVE_TIMING.nightSeconds * 1_000
const READY_POLL_MS = 100
const READY_STABILITY_MS = 500
const READY_TIMEOUT_MS = 240_000
const TRANSITION_TIMEOUT_MS = 12_000
const TIMING_DRIFT_LIMIT_RATIO = 0.25
const MAX_SEMANTIC_INPUT_GAP_MS = 3_000
const MINIMUM_INITIAL_DAY_REMAINING_SECONDS = ZOMBIE_ACTIVE_TIMING.daySeconds - 2
const DAY_MOVEMENT_PATTERNS = [
  ['w', 'shift'],
  ['w', 'd', 'shift'],
  ['d', 'shift'],
  ['s', 'd', 'shift'],
  ['s', 'shift'],
  ['s', 'a', 'shift'],
  ['a', 'shift'],
  ['w', 'a', 'shift'],
]
const NIGHT_MOVEMENT_PATTERNS = [
  ['w', 'shift'],
  ['w', 'd', 'shift'],
  ['d', 'shift'],
  ['s', 'd', 'shift'],
  ['s', 'shift'],
  ['s', 'a', 'shift'],
  ['a', 'shift'],
  ['w', 'a', 'shift'],
]

export const ZOMBIE_ACTIVE_SEMANTIC_CADENCE = Object.freeze({
  aimIntervalMs: CONTROL_TICK_MS,
  fireDelayMs: 3_000,
  fireHoldMs: 720,
  firePeriodMs: 1_200,
})

let preparedInitialSample = null

export function resolveZombieActivePlayIntent({ phase, phaseElapsedMs }) {
  const isNight = phase === 'night'
  const activeNightElapsedMs = Math.max(0, phaseElapsedMs - 3_000)
  const patterns = isNight ? NIGHT_MOVEMENT_PATTERNS : DAY_MOVEMENT_PATTERNS
  const movementPeriodMs = isNight ? 1_350 : 1_600
  const patternIndex = Math.floor(Math.max(0, phaseElapsedMs) / movementPeriodMs) % patterns.length
  const angle = (Math.max(0, phaseElapsedMs) / 3_800) * Math.PI * 2
  return {
    aim: {
      u: 0.5 + Math.cos(angle) * 0.24,
      v: 0.56 + Math.sin(angle * 0.73) * 0.18,
    },
    fire: isNight && phaseElapsedMs >= 3_000 && activeNightElapsedMs % 1_200 < 720,
    heldKeys: [...patterns[patternIndex]],
    jumpSequence: Math.floor(Math.max(0, phaseElapsedMs) / (isNight ? 3_500 : 4_000)),
  }
}

export function diffZombieActiveHeldKeys(currentKeys, desiredKeys) {
  const current = new Set(currentKeys)
  const desired = new Set(desiredKeys)
  return {
    press: desiredKeys.filter((key) => !current.has(key)),
    release: currentKeys.filter((key) => !desired.has(key)),
  }
}

export function createZombieActiveDeadlineState() {
  return {
    activeToken: null,
    nextAimAtMs: null,
    nextFireDownAtMs: null,
    nextFireUpAtMs: null,
  }
}

function nextNightDeadline(deadlineMs) {
  return deadlineMs < NIGHT_DURATION_MS ? deadlineMs : null
}

export function drainZombieActiveDueActions(current, { phaseElapsedMs, stable }) {
  const activeToken = stable ? `${stable.kind}:${stable.cycle}` : null
  let state = { ...current }
  if (state.activeToken !== activeToken) {
    const night = stable?.kind === 'night'
    state = {
      activeToken,
      nextAimAtMs: night ? 0 : null,
      nextFireDownAtMs: night ? ZOMBIE_ACTIVE_SEMANTIC_CADENCE.fireDelayMs : null,
      nextFireUpAtMs: night
        ? ZOMBIE_ACTIVE_SEMANTIC_CADENCE.fireDelayMs +
          ZOMBIE_ACTIVE_SEMANTIC_CADENCE.fireHoldMs
        : null,
    }
  }

  if (stable?.kind !== 'night' || !Number.isFinite(phaseElapsedMs)) {
    return { actions: [], state }
  }

  const dueThroughMs = Math.max(0, Math.min(phaseElapsedMs, NIGHT_DURATION_MS))
  const actions = []
  while (
    state.nextAimAtMs !== null &&
    state.nextAimAtMs <= dueThroughMs + DEADLINE_EPSILON_MS
  ) {
    actions.push({ deadlineMs: state.nextAimAtMs, kind: 'aim' })
    state.nextAimAtMs = nextNightDeadline(
      state.nextAimAtMs + ZOMBIE_ACTIVE_SEMANTIC_CADENCE.aimIntervalMs,
    )
  }
  while (
    state.nextFireDownAtMs !== null &&
    state.nextFireDownAtMs <= dueThroughMs + DEADLINE_EPSILON_MS
  ) {
    actions.push({ deadlineMs: state.nextFireDownAtMs, kind: 'fire-down' })
    state.nextFireDownAtMs = nextNightDeadline(
      state.nextFireDownAtMs + ZOMBIE_ACTIVE_SEMANTIC_CADENCE.firePeriodMs,
    )
  }
  while (
    state.nextFireUpAtMs !== null &&
    state.nextFireUpAtMs <= dueThroughMs + DEADLINE_EPSILON_MS
  ) {
    actions.push({ deadlineMs: state.nextFireUpAtMs, kind: 'fire-up' })
    state.nextFireUpAtMs = nextNightDeadline(
      state.nextFireUpAtMs + ZOMBIE_ACTIVE_SEMANTIC_CADENCE.firePeriodMs,
    )
  }
  const priority = { aim: 0, 'fire-down': 1, 'fire-up': 2 }
  actions.sort(
    (first, second) =>
      first.deadlineMs - second.deadlineMs || priority[first.kind] - priority[second.kind],
  )
  return { actions, state }
}

export function zombieActiveNextDeadlineMs(state) {
  const deadlines = [state.nextAimAtMs, state.nextFireDownAtMs, state.nextFireUpAtMs].filter(
    Number.isFinite,
  )
  return deadlines.length > 0 ? Math.min(...deadlines) : null
}

export function zombieActiveRequiredCycles(requestedDurationMs) {
  const cycleDurationMs =
    (ZOMBIE_ACTIVE_TIMING.daySeconds + ZOMBIE_ACTIVE_TIMING.nightSeconds) * 1_000
  return Math.max(1, Math.floor(requestedDurationMs / cycleDurationMs))
}

export function classifyZombieActiveStablePhase(sample) {
  const zombie = sample?.zombie
  if (!zombie?.phaseReady || zombie.phase !== zombie.expectedPhase) return null
  const hud = sample?.hud
  if (
    hud &&
    (!hud.phaseReady ||
      hud.phase !== hud.expectedPhase ||
      hud.phase !== zombie.phase ||
      hud.expectedPhase !== zombie.expectedPhase)
  ) {
    return null
  }
  if (zombie.phase === 'build' && Number.isInteger(zombie.night) && zombie.night >= 0) {
    return { cycle: zombie.night + 1, kind: 'day' }
  }
  if (zombie.phase === 'night' && Number.isInteger(zombie.night) && zombie.night >= 1) {
    return { cycle: zombie.night, kind: 'night' }
  }
  return null
}

export function createZombieActiveValidityState() {
  return {
    completedCycles: 0,
    cycles: {},
    last: null,
    maximumNight: 0,
    startedAtMs: null,
    transitionSinceMs: null,
  }
}

export function observeZombieActiveSample(current, sample, nowMs) {
  const next = cloneValidityState(current)
  const issues = zombieActiveSampleIssues(sample, current.last)
  if (next.startedAtMs === null) next.startedAtMs = nowMs

  const zombie = sample.zombie
  if (zombie) {
    if (zombie.night < next.maximumNight) {
      issues.push(`night reset from ${next.maximumNight} to ${zombie.night}`)
    }
    if (zombie.night > next.maximumNight + 1) {
      issues.push(`night skipped from ${next.maximumNight} to ${zombie.night}`)
    }
    next.maximumNight = Math.max(next.maximumNight, zombie.night)

    const stable = classifyZombieActiveStablePhase(sample)
    if (stable) {
      next.transitionSinceMs = null
      const cycle = ensureCycle(next, stable.cycle)
      if (stable.kind === 'day') {
        cycle.day.entryRemaining ??= zombie.phaseSecondsRemaining
        if (zombie.night > 0) {
          const completedCycle = ensureCycle(next, zombie.night)
          completedCycle.completed = true
          next.completedCycles = Math.max(next.completedCycles, zombie.night)
        }
      } else {
        cycle.night.entryRemaining ??= zombie.phaseSecondsRemaining
        if (stable.cycle > next.completedCycles + 1) {
          issues.push(`night ${stable.cycle} began before cycle ${stable.cycle - 1} completed`)
        }
      }
    } else if (next.transitionSinceMs === null) {
      next.transitionSinceMs = nowMs
    } else if (nowMs - next.transitionSinceMs > TRANSITION_TIMEOUT_MS) {
      issues.push(`phase transition exceeded ${TRANSITION_TIMEOUT_MS}ms`)
    }

    const previous = current.last
    const countdownIdentity = actualCountdownIdentity(sample)
    const previousCountdownIdentity = actualCountdownIdentity(previous)
    if (
      previous &&
      countdownIdentity &&
      previousCountdownIdentity?.key === countdownIdentity.key
    ) {
      const wallDeltaMs = Math.max(0, nowMs - previous.atMs)
      const simulationDeltaMs =
        (previous.zombie.phaseSecondsRemaining - zombie.phaseSecondsRemaining) * 1_000
      if (simulationDeltaMs < -350) {
        issues.push(
          `${zombie.phase} countdown increased from ` +
            `${previous.zombie.phaseSecondsRemaining.toFixed(2)} to ` +
            `${zombie.phaseSecondsRemaining.toFixed(2)}`,
        )
      } else {
        const phaseTiming = ensureCycle(next, countdownIdentity.cycleIndex)[
          countdownIdentity.timing
        ]
        phaseTiming.simulationMs += Math.max(0, simulationDeltaMs)
        const countdownKey = readyCountdownKey(sample)
        if (countdownKey && readyCountdownKey(previous) === countdownKey) {
          phaseTiming.wallMs += wallDeltaMs
        }
      }
    } else if (previous && countdownIdentity && previousCountdownIdentity) {
      if (isLegalActualPhaseAdvance(previousCountdownIdentity, countdownIdentity)) {
        const phaseTiming = ensureCycle(next, previousCountdownIdentity.cycleIndex)[
          previousCountdownIdentity.timing
        ]
        phaseTiming.simulationMs += previous.zombie.phaseSecondsRemaining * 1_000
      } else {
        issues.push(
          `actual phase identity changed illegally from ${previousCountdownIdentity.key} ` +
            `to ${countdownIdentity.key}`,
        )
      }
    }
  }

  next.last = sample.zombie
    ? {
        atMs: nowMs,
        bridgeFrameIdx: sample.bridge?.frameIdx ?? null,
        zombie: {
          night: sample.zombie.night,
          phase: sample.zombie.phase,
          phaseReady: sample.zombie.phaseReady,
          phaseSecondsRemaining: sample.zombie.phaseSecondsRemaining,
          shotsFired: sample.zombie.shotsFired,
          expectedPhase: sample.zombie.expectedPhase,
        },
      }
    : null
  return { issues, state: next }
}

export function collectZombieActiveFinalIssues({
  cadence,
  inputObserver,
  requestedDurationMs,
  requiredCycles,
  validity,
}) {
  const issues = []
  if (validity.completedCycles < requiredCycles) {
    issues.push(`completed ${validity.completedCycles}/${requiredCycles} required cycles`)
  }
  const measuredMs = (validity.last?.atMs ?? 0) - (validity.startedAtMs ?? 0)
  if (measuredMs + CONTROL_TICK_MS < requestedDurationMs) {
    issues.push(`active scenario measured ${Math.round(measuredMs)}ms/${requestedDurationMs}ms`)
  }

  for (let cycleIndex = 1; cycleIndex <= validity.completedCycles; cycleIndex += 1) {
    const cycle = validity.cycles[cycleIndex]
    if (!cycle) {
      issues.push(`cycle ${cycleIndex} timing is missing`)
      continue
    }
    const minimumDayEntry =
      cycleIndex === 1
        ? MINIMUM_INITIAL_DAY_REMAINING_SECONDS
        : ZOMBIE_ACTIVE_TIMING.daySeconds - 1
    if ((cycle.day.entryRemaining ?? 0) < minimumDayEntry) {
      issues.push(
        `cycle ${cycleIndex} day entered at ${String(cycle.day.entryRemaining)}s ` +
          `(minimum ${minimumDayEntry}s)`,
      )
    }
    const minimumNightEntry = ZOMBIE_ACTIVE_TIMING.nightSeconds - 1
    if ((cycle.night.entryRemaining ?? 0) < minimumNightEntry) {
      issues.push(
        `cycle ${cycleIndex} night entered at ${String(cycle.night.entryRemaining)}s ` +
          `(minimum ${minimumNightEntry}s)`,
      )
    }
    const minimumDaySimulationMs = Math.max(
      0,
      ((cycle.day.entryRemaining ?? ZOMBIE_ACTIVE_TIMING.daySeconds) - 1.5) * 1_000,
    )
    if (cycle.day.simulationMs < minimumDaySimulationMs) {
      issues.push(
        `cycle ${cycleIndex} day observed ${Math.round(cycle.day.simulationMs)}ms ` +
          `(minimum ${Math.round(minimumDaySimulationMs)}ms)`,
      )
    }
    const minimumNightSimulationMs = (ZOMBIE_ACTIVE_TIMING.nightSeconds - 2) * 1_000
    if (cycle.night.simulationMs < minimumNightSimulationMs) {
      issues.push(`cycle ${cycleIndex} night observed ${Math.round(cycle.night.simulationMs)}ms`)
    }
    for (const phase of ['day', 'night']) {
      const timing = cycle[phase]
      const driftMs = Math.abs(timing.wallMs - timing.simulationMs)
      const configuredDurationMs = ZOMBIE_ACTIVE_TIMING[`${phase}Seconds`] * 1_000
      const driftLimitMs = configuredDurationMs * TIMING_DRIFT_LIMIT_RATIO
      if (driftMs > driftLimitMs) {
        issues.push(
          `cycle ${cycleIndex} ${phase} timing drifted ${Math.round(driftMs)}ms ` +
            `(limit ${Math.round(driftLimitMs)}ms)`,
        )
      }
    }
  }

  const cycles = Math.max(1, validity.completedCycles)
  if (cadence.movementChanges < cycles * 30) {
    issues.push(`movement cadence ${cadence.movementChanges}/${cycles * 30}`)
  }
  if (cadence.pointerMoves < cycles * 120) {
    issues.push(`aim cadence ${cadence.pointerMoves}/${cycles * 120}`)
  }
  if (cadence.fireBursts < cycles * 40) {
    issues.push(`fire cadence ${cadence.fireBursts}/${cycles * 40}`)
  }
  if (cadence.jumps < cycles * 16) {
    issues.push(`jump cadence ${cadence.jumps}/${cycles * 16}`)
  }
  if (cadence.maximumActiveGapMs > MAX_SEMANTIC_INPUT_GAP_MS) {
    issues.push(`semantic input gap reached ${Math.round(cadence.maximumActiveGapMs)}ms`)
  }

  if (!inputObserver) {
    issues.push('trusted input observer is unavailable')
  } else {
    if (inputObserver.trusted < cycles * 500) {
      issues.push(`trusted input count ${inputObserver.trusted}/${cycles * 500}`)
    }
    if ((inputObserver.byType?.keydown ?? 0) < cycles * 30) {
      issues.push(`trusted keydown count ${inputObserver.byType?.keydown ?? 0}`)
    }
    if ((inputObserver.byType?.keyup ?? 0) < cycles * 30) {
      issues.push(`trusted keyup count ${inputObserver.byType?.keyup ?? 0}`)
    }
    if ((inputObserver.byType?.pointermove ?? 0) < cycles * 350) {
      issues.push(`trusted pointermove count ${inputObserver.byType?.pointermove ?? 0}`)
    }
    if ((inputObserver.byType?.pointerdown ?? 0) < cycles * 40) {
      issues.push(`trusted pointerdown count ${inputObserver.byType?.pointerdown ?? 0}`)
    }
    if ((inputObserver.byType?.pointerup ?? 0) < cycles * 40) {
      issues.push(`trusted pointerup count ${inputObserver.byType?.pointerup ?? 0}`)
    }
    if ((inputObserver.canvasPointerEvents ?? 0) < cycles * 350) {
      issues.push(`trusted canvas pointer count ${inputObserver.canvasPointerEvents ?? 0}`)
    }
    const trustedDurationMs = (inputObserver.lastAt ?? 0) - (inputObserver.firstAt ?? 0)
    if (trustedDurationMs + 1_000 < requestedDurationMs) {
      issues.push(
        `trusted input covered ${Math.round(trustedDurationMs)}ms/${requestedDurationMs}ms`,
      )
    }
  }
  return issues
}

async function readZombieActiveState(page) {
  return page.evaluate(() => {
    const canvases = [...document.querySelectorAll('canvas')]
    const canvas = canvases[0] ?? null
    const rect = canvas?.getBoundingClientRect() ?? null
    const hud = document.querySelector('[data-testid="landrush-zombie-escape-hud"]')
    const zombie = window.__LANDRUSH_ZOMBIE_ESCAPE__
    const bridge = window.__PASCAL_BENCH__?.beacon() ?? null
    const inputObserver = window.__LANDRUSH_ZOMBIE_ACTIVE_INPUT__?.snapshot() ?? null
    const runAgainButton = document.querySelector(
      '[data-testid="landrush-zombie-escape-run-again"]',
    )
    const runAgainButtonRect = runAgainButton?.getBoundingClientRect() ?? null
    return {
      bridge: bridge
        ? {
            frameIdx: bridge.frameIdx ?? null,
            nodeCount: bridge.nodeCount ?? null,
            visibility: bridge.visibility ?? null,
          }
        : null,
      canvasCount: canvases.length,
      canvasRect: rect
        ? {
            height: rect.height,
            left: rect.left,
            top: rect.top,
            width: rect.width,
          }
        : null,
      documentFocused: document.hasFocus(),
      documentVisibility: document.visibilityState,
      hud: hud
        ? {
            expectedPhase: hud.getAttribute('data-expected-phase'),
            phase: hud.getAttribute('data-phase'),
            phaseReady: hud.getAttribute('data-phase-ready') === 'true',
          }
        : null,
      inputObserver,
      loaderCount: document.querySelectorAll('[role="progressbar"]').length,
      pickupPrompt: Boolean(
        document.querySelector('[data-testid="landrush-zombie-escape-pickup-prompt"]'),
      ),
      runAgainButtonRect: runAgainButtonRect
        ? {
            height: runAgainButtonRect.height,
            left: runAgainButtonRect.left,
            top: runAgainButtonRect.top,
            width: runAgainButtonRect.width,
          }
        : null,
      viewport: { height: window.innerHeight, width: window.innerWidth },
      zombie:
        zombie && typeof zombie === 'object'
          ? {
              expectedPhase: zombie.expectedPhase ?? null,
              integratedIntoExistingCanvas: zombie.integratedIntoExistingCanvas ?? false,
              night: zombie.night ?? null,
              phase: zombie.phase ?? null,
              phaseReady: zombie.phaseReady ?? false,
              phaseSecondsRemaining: zombie.phaseSecondsRemaining ?? null,
              shotsFired: zombie.shots?.shotsFired ?? null,
              status: zombie.status ?? null,
            }
          : null,
    }
  })
}

export function zombieActiveCanvasViewportIssues(sample) {
  const rect = sample?.canvasRect
  const viewport = sample?.viewport
  if (
    !rect ||
    !Number.isFinite(rect.left) ||
    !Number.isFinite(rect.top) ||
    !Number.isFinite(rect.width) ||
    !Number.isFinite(rect.height) ||
    !Number.isFinite(viewport?.width) ||
    !Number.isFinite(viewport?.height) ||
    viewport.width <= 0 ||
    viewport.height <= 0
  ) {
    return ['canvas/viewport bounds are unavailable']
  }

  const toleranceX = viewport.width * 0.05
  const toleranceY = viewport.height * 0.05
  const right = rect.left + rect.width
  const bottom = rect.top + rect.height
  const issues = []
  if (
    rect.left > toleranceX ||
    rect.top > toleranceY ||
    right < viewport.width - toleranceX ||
    bottom < viewport.height - toleranceY
  ) {
    issues.push(
      `canvas does not cover viewport: rect=${rect.width.toFixed(1)}x${rect.height.toFixed(1)}` +
        `@${rect.left.toFixed(1)},${rect.top.toFixed(1)} viewport=` +
        `${viewport.width}x${viewport.height}`,
    )
  }
  if (rect.width > viewport.width * 1.1 || rect.height > viewport.height * 1.1) {
    issues.push(
      `canvas materially exceeds viewport: ${rect.width.toFixed(1)}x${rect.height.toFixed(1)} ` +
        `vs ${viewport.width}x${viewport.height}`,
    )
  }
  return issues
}

function zombieActiveSampleIssues(sample, previous, { allowTerminal = false } = {}) {
  const issues = []
  if (sample.loaderCount !== 0) issues.push(`loader count=${sample.loaderCount}`)
  if (sample.canvasCount !== 1) issues.push(`canvas count=${sample.canvasCount}`)
  if (!sample.canvasRect || sample.canvasRect.width <= 0 || sample.canvasRect.height <= 0) {
    issues.push('canvas has no visible bounds')
  }
  issues.push(...zombieActiveCanvasViewportIssues(sample))
  if (sample.documentVisibility !== 'visible') {
    issues.push(`document visibility=${sample.documentVisibility}`)
  }
  if (!sample.bridge || !Number.isFinite(sample.bridge.frameIdx)) {
    issues.push('bench bridge frame is unavailable')
  } else if (previous && sample.bridge.frameIdx < previous.bridgeFrameIdx) {
    issues.push(
      `bench frame regressed from ${previous.bridgeFrameIdx} to ${sample.bridge.frameIdx}`,
    )
  }
  if (!Number.isFinite(sample.bridge?.nodeCount) || sample.bridge.nodeCount < 1) {
    issues.push(`scene node count=${String(sample.bridge?.nodeCount)}`)
  }
  if (!sample.hud) issues.push('Zombie Escape HUD is unavailable')
  const zombie = sample.zombie
  if (!zombie) return [...issues, 'Zombie Escape state is unavailable']
  if (zombie.integratedIntoExistingCanvas !== true) {
    issues.push('Zombie Escape is not integrated into the existing canvas')
  }
  const terminalStatus = zombie.status === 'lost' || zombie.status === 'won'
  if (zombie.status !== 'playing' && !(allowTerminal && terminalStatus)) {
    issues.push(`Zombie Escape status=${zombie.status}`)
  }
  if (!Number.isInteger(zombie.night) || zombie.night < 0) {
    issues.push(`night=${String(zombie.night)}`)
  }
  if (!['build', 'night'].includes(zombie.phase)) issues.push(`phase=${String(zombie.phase)}`)
  if (!['build', 'night'].includes(zombie.expectedPhase)) {
    issues.push(`expected phase=${String(zombie.expectedPhase)}`)
  }
  const phaseDuration =
    zombie.phase === 'night' ? ZOMBIE_ACTIVE_TIMING.nightSeconds : ZOMBIE_ACTIVE_TIMING.daySeconds
  if (
    !Number.isFinite(zombie.phaseSecondsRemaining) ||
    zombie.phaseSecondsRemaining < 0 ||
    zombie.phaseSecondsRemaining > phaseDuration + 0.5
  ) {
    issues.push(`${zombie.phase} remaining=${String(zombie.phaseSecondsRemaining)}`)
  }
  if (!Number.isFinite(zombie.shotsFired) || zombie.shotsFired < 0) {
    issues.push(`shots fired=${String(zombie.shotsFired)}`)
  }
  if (previous && zombie.shotsFired < previous.zombie.shotsFired) {
    issues.push(`shots fired reset from ${previous.zombie.shotsFired} to ${zombie.shotsFired}`)
  }
  const stable = classifyZombieActiveStablePhase(sample)
  if (
    stable &&
    (sample.hud.phase !== zombie.phase ||
      sample.hud.expectedPhase !== zombie.expectedPhase ||
      sample.hud.phaseReady !== zombie.phaseReady)
  ) {
    issues.push('stable HUD phase state disagrees with the simulation')
  }
  return issues
}

function readyCountdownKey(sample) {
  const zombie = sample?.zombie
  if (!zombie?.phaseReady || zombie.phase !== zombie.expectedPhase) return null
  return `${zombie.phase}:${zombie.night}`
}

function actualCountdownIdentity(sample) {
  const zombie = sample?.zombie
  if (
    !zombie ||
    !['build', 'night'].includes(zombie.phase) ||
    !Number.isInteger(zombie.night) ||
    zombie.night < 0 ||
    (zombie.phase === 'night' && zombie.night < 1)
  ) {
    return null
  }
  return {
    cycleIndex: zombie.phase === 'night' ? zombie.night : zombie.night + 1,
    key: `${zombie.phase}:${zombie.night}`,
    night: zombie.night,
    phase: zombie.phase,
    timing: zombie.phase === 'night' ? 'night' : 'day',
  }
}

function isLegalActualPhaseAdvance(previous, current) {
  return previous.phase === 'build'
    ? current.phase === 'night' && current.night === previous.night + 1
    : current.phase === 'build' && current.night === previous.night
}

function cloneValidityState(state) {
  return {
    ...state,
    cycles: Object.fromEntries(
      Object.entries(state.cycles).map(([index, cycle]) => [
        index,
        {
          ...cycle,
          day: { ...cycle.day },
          night: { ...cycle.night },
        },
      ]),
    ),
    last: state.last
      ? {
          ...state.last,
          zombie: { ...state.last.zombie },
        }
      : null,
  }
}

export function rebaseZombieActiveSample(
  sample,
  { cycleOffset = 0, shotsFiredOffset = 0 } = {},
) {
  if (!sample?.zombie) return sample
  return {
    ...sample,
    zombie: {
      ...sample.zombie,
      night: Number.isInteger(sample.zombie.night)
        ? sample.zombie.night + cycleOffset
        : sample.zombie.night,
      shotsFired: Number.isFinite(sample.zombie.shotsFired)
        ? sample.zombie.shotsFired + shotsFiredOffset
        : sample.zombie.shotsFired,
    },
  }
}

export function prepareZombieActiveValidityForRestart(current) {
  const next = cloneValidityState(current)
  for (const cycleIndex of Object.keys(next.cycles)) {
    if (Number(cycleIndex) > next.completedCycles) delete next.cycles[cycleIndex]
  }
  next.last = null
  next.maximumNight = next.completedCycles
  next.transitionSinceMs = null
  return next
}

function ensureCycle(state, cycleIndex) {
  state.cycles[cycleIndex] ??= {
    completed: false,
    day: { entryRemaining: null, simulationMs: 0, wallMs: 0 },
    night: { entryRemaining: null, simulationMs: 0, wallMs: 0 },
  }
  return state.cycles[cycleIndex]
}

function initialReadyIssues(sample, previous) {
  const issues = zombieActiveSampleIssues(sample, previous)
  const stable = classifyZombieActiveStablePhase(sample)
  if (stable?.kind !== 'day' || stable.cycle !== 1) {
    issues.push(`initial stable phase=${stable ? `${stable.kind}:${stable.cycle}` : 'transition'}`)
  }
  if (
    (sample.zombie?.phaseSecondsRemaining ?? 0) < MINIMUM_INITIAL_DAY_REMAINING_SECONDS
  ) {
    issues.push(`initial day has only ${String(sample.zombie?.phaseSecondsRemaining)}s remaining`)
  }
  return issues
}

export function canUseZombieActiveVisibleRestart(sample) {
  const reset = sample?.runAgainButtonRect
  return (
    sample?.loaderCount === 0 &&
    sample?.canvasCount === 1 &&
    zombieActiveCanvasViewportIssues(sample).length === 0 &&
    sample?.documentFocused === true &&
    sample?.documentVisibility === 'visible' &&
    Number.isFinite(sample?.bridge?.frameIdx) &&
    Number.isFinite(sample?.bridge?.nodeCount) &&
    sample.bridge.nodeCount > 0 &&
    sample.bridge.visibility === 'visible' &&
    sample?.hud != null &&
    sample?.zombie?.integratedIntoExistingCanvas === true &&
    reset != null &&
    reset.width > 0 &&
    reset.height > 0
  )
}

export function zombieActiveVisibleTerminalIssues(sample, previous) {
  const issues = zombieActiveSampleIssues(sample, previous, { allowTerminal: true })
  if (!['lost', 'won'].includes(sample?.zombie?.status)) {
    issues.push(`terminal status=${String(sample?.zombie?.status)}`)
  }
  if (!canUseZombieActiveVisibleRestart(sample)) {
    issues.push('healthy visible Run again control is unavailable')
  }
  return issues
}

export function zombieActiveRestartProgressIssues({
  completedCycles,
  lastRestartCompletedCycles,
  requiredCycles,
  restartCount,
}) {
  const issues = []
  if (completedCycles <= lastRestartCompletedCycles) {
    issues.push(
      `terminal restart made no completed-cycle progress ` +
        `(${completedCycles}/${lastRestartCompletedCycles})`,
    )
  }
  if (restartCount >= requiredCycles) {
    issues.push(`terminal restart limit reached (${restartCount}/${requiredCycles})`)
  }
  return issues
}

export async function clickZombieActiveVisibleRestart(input, sample) {
  if (
    !['lost', 'won'].includes(sample?.zombie?.status) ||
    !canUseZombieActiveVisibleRestart(sample)
  ) {
    throw new Error('Zombie Escape visible Run again control is not eligible')
  }
  const rect = sample.runAgainButtonRect
  await input.click(rect.left + rect.width / 2, rect.top + rect.height / 2, {
    intent: 'restart through visible Run again control during active measurement',
  })
}

async function waitForZombieActiveReady(
  page,
  sleep,
  input,
  trace,
  { allowVisibleReset = true } = {},
) {
  const startedAt = Date.now()
  let candidate = null
  let resetCount = 0
  let last = null
  let issues = []
  while (Date.now() - startedAt < READY_TIMEOUT_MS) {
    last = await readZombieActiveState(page)
    issues = initialReadyIssues(last, null)
    const now = performance.now()
    if (issues.length === 0) {
      candidate ??= { frameIdx: last.bridge.frameIdx, since: now }
      if (
        now - candidate.since >= READY_STABILITY_MS &&
        last.bridge.frameIdx > candidate.frameIdx
      ) {
        return last
      }
    } else {
      candidate = null
      const stable = classifyZombieActiveStablePhase(last)
      const missedInitialDay =
        last.zombie?.status !== 'playing' ||
        stable?.kind !== 'day' ||
        stable.cycle !== 1 ||
        (last.zombie?.phaseSecondsRemaining ?? 0) < MINIMUM_INITIAL_DAY_REMAINING_SECONDS
      if (
        allowVisibleReset &&
        missedInitialDay &&
        last.zombie?.status !== 'playing' &&
        resetCount === 0 &&
        canUseZombieActiveVisibleRestart(last)
      ) {
        const rect = last.runAgainButtonRect
        await input.click(rect.left + rect.width / 2, rect.top + rect.height / 2, {
          intent: 'restart through visible Run again control before measurement',
        })
        resetCount += 1
        trace?.write({
          kind: 'validation',
          name: 'zombie-active-visible-reset',
          priorState: last.zombie,
          t: performance.now(),
        })
      }
    }
    await sleep(READY_POLL_MS)
  }
  throw new Error(
    `Zombie Escape active scenario did not become ready (${issues.join('; ')}; ` +
      `last=${JSON.stringify(last)})`,
  )
}

async function installTrustedInputObserver(page) {
  await page.evaluate(() => {
    window.__LANDRUSH_ZOMBIE_ACTIVE_INPUT__?.dispose()
    const types = ['keydown', 'keyup', 'pointermove', 'pointerdown', 'pointerup']
    const state = {
      byType: {},
      canvasPointerEvents: 0,
      firstAt: null,
      lastAt: null,
      maximumGapMs: 0,
      trusted: 0,
      untrusted: 0,
    }
    const observe = (event) => {
      if (!event.isTrusted) {
        state.untrusted += 1
        return
      }
      const now = performance.now()
      if (state.firstAt === null) state.firstAt = now
      if (state.lastAt !== null)
        state.maximumGapMs = Math.max(state.maximumGapMs, now - state.lastAt)
      state.lastAt = now
      state.trusted += 1
      state.byType[event.type] = (state.byType[event.type] ?? 0) + 1
      if (event.type.startsWith('pointer') && event.target instanceof HTMLCanvasElement) {
        state.canvasPointerEvents += 1
      }
    }
    for (const type of types)
      window.addEventListener(type, observe, { capture: true, passive: true })
    window.__LANDRUSH_ZOMBIE_ACTIVE_INPUT__ = {
      dispose() {
        for (const type of types) window.removeEventListener(type, observe, { capture: true })
        delete window.__LANDRUSH_ZOMBIE_ACTIVE_INPUT__
      },
      snapshot() {
        return { ...state, byType: { ...state.byType } }
      },
    }
  })
}

async function disposeTrustedInputObserver(page) {
  await page.evaluate(() => window.__LANDRUSH_ZOMBIE_ACTIVE_INPUT__?.dispose())
}

async function syncHeldKeys(input, heldKeys, desiredKeys) {
  const changes = diffZombieActiveHeldKeys([...heldKeys], desiredKeys)
  for (const key of changes.release) {
    await input.keyUp(key, { intent: 'active-play movement release' })
    heldKeys.delete(key)
  }
  for (const key of changes.press) {
    await input.keyDown(key, { intent: 'active-play movement hold' })
    heldKeys.add(key)
  }
  return changes.press.length + changes.release.length
}

function createCadenceState() {
  return {
    activeToken: null,
    fireBursts: 0,
    firstActionAt: null,
    interactions: 0,
    jumps: 0,
    lastActionAt: null,
    maximumActiveGapMs: 0,
    movementChanges: 0,
    pointerMoves: 0,
    semanticActions: 0,
  }
}

function beginActiveCadenceWindow(cadence, token, nowMs) {
  if (cadence.activeToken === token) return
  cadence.activeToken = token
  cadence.lastActionAt = nowMs
}

function recordCadenceAction(cadence, nowMs) {
  cadence.firstActionAt ??= nowMs
  if (cadence.lastActionAt !== null) {
    cadence.maximumActiveGapMs = Math.max(cadence.maximumActiveGapMs, nowMs - cadence.lastActionAt)
  }
  cadence.lastActionAt = nowMs
  cadence.semanticActions += 1
}

export function phaseSegmentName(sample, retryIndex = 0) {
  const stable = classifyZombieActiveStablePhase(sample)
  const retrySuffix = retryIndex > 0 ? `-retry-${retryIndex}` : ''
  if (stable) return `zombie-active-${stable.kind}-${stable.cycle}${retrySuffix}`
  const zombie = sample.zombie
  if (!zombie) return 'zombie-active-state-unavailable'
  return zombie.phase === 'night'
    ? `zombie-active-night-${zombie.night}-transition${retrySuffix}`
    : `zombie-active-day-${zombie.night + 1}-transition${retrySuffix}`
}

export function activitySegmentName(stable, phaseElapsedMs, retryIndex = 0) {
  if (stable?.kind !== 'night') return null
  const retrySuffix = retryIndex > 0 ? `-retry-${retryIndex}` : ''
  if (phaseElapsedMs < 3_000) {
    return `zombie-active-night-${stable.cycle}-movement-only${retrySuffix}`
  }
  if (phaseElapsedMs < 6_000) {
    return `zombie-active-night-${stable.cycle}-movement-fire${retrySuffix}`
  }
  return null
}

export default {
  name: 'landrush-zombie-active',
  fixture: 'outside',
  lifecycle: {
    captureInitialCheckpoint: false,
    deferDrain: true,
    prepareAfterWarmup: false,
    settleBeforeMeasurement: false,
    watchdog: false,
    warmupSeconds: 0,
  },
  inputModalities: ZOMBIE_ACTIVE_INPUT_MODALITIES,
  urlParams: () => 'benchmarkReport=outside&game=zombie-escape',
  async prepare({ input, page, sleep, trace }) {
    preparedInitialSample = await waitForZombieActiveReady(page, sleep, input, trace)
    await installTrustedInputObserver(page)
  },
  async execute({ input, mark, minutes, page, recordEvidence, sleep, trace }) {
    const requestedDurationMs = scenarioDurationMs(minutes)
    const cycleDurationMs =
      (ZOMBIE_ACTIVE_TIMING.daySeconds + ZOMBIE_ACTIVE_TIMING.nightSeconds) * 1_000
    const requiredCycles = zombieActiveRequiredCycles(requestedDurationMs)
    const maximumDurationMs = requestedDurationMs + cycleDurationMs + 40_000
    const startedAt = performance.now()
    let validity = createZombieActiveValidityState()
    const cadence = createCadenceState()
    let deadlineState = createZombieActiveDeadlineState()
    const heldKeys = new Set()
    let fireHeld = false
    let lastInteractAt = Number.NEGATIVE_INFINITY
    let lastJumpToken = null
    let openActivitySegment = null
    let openPhaseSegment = null
    let executionError = null
    let finalSample = preparedInitialSample
    let cycleOffset = 0
    let shotsFiredOffset = 0
    let restartCount = 0
    let lastRestartCompletedCycles = 0
    const terminalRestarts = []

    const publishEvidence = (issues = []) => {
      recordEvidence?.('zombie-active', {
        cadence: { ...cadence },
        issues,
        restarts: terminalRestarts.map((restart) => ({ ...restart })),
        state: finalSample,
        thresholds: {
          maxSemanticInputGapMs: MAX_SEMANTIC_INPUT_GAP_MS,
          restartLimit: requiredCycles,
          timingDriftLimitRatio: TIMING_DRIFT_LIMIT_RATIO,
        },
        validity: cloneValidityState(validity),
      })
    }

    trace.write({
      kind: 'validation',
      name: 'zombie-active-ready',
      requestedDurationMs,
      requiredCycles,
      state: preparedInitialSample,
      t: performance.now(),
    })

    try {
      while (true) {
        const now = performance.now()
        if (now - startedAt > maximumDurationMs) {
          throw new Error(
            `Zombie Escape active scenario exceeded ${maximumDurationMs}ms ` +
              `(${validity.completedCycles}/${requiredCycles} cycles)`,
          )
        }

        const rawSample = await readZombieActiveState(page)
        const sample = rebaseZombieActiveSample(rawSample, {
          cycleOffset,
          shotsFiredOffset,
        })
        finalSample = sample
        if (sample.zombie?.status === 'lost' || sample.zombie?.status === 'won') {
          const terminalIssues = [
            ...zombieActiveVisibleTerminalIssues(sample, validity.last),
            ...zombieActiveRestartProgressIssues({
              completedCycles: validity.completedCycles,
              lastRestartCompletedCycles,
              requiredCycles,
              restartCount,
            }),
          ]
          if (terminalIssues.length > 0) {
            throw new Error(
              `invalid Zombie Escape active terminal: ${terminalIssues.join('; ')} ` +
                `(sample=${JSON.stringify(sample)})`,
            )
          }

          if (openActivitySegment) {
            await mark(`${openActivitySegment}-end`)
            openActivitySegment = null
          }
          if (openPhaseSegment) {
            await mark(`${openPhaseSegment}-end`)
            openPhaseSegment = null
          }

          const restartNumber = restartCount + 1
          const restartSegment = `zombie-active-visible-restart-${restartNumber}`
          const restartEvidence = {
            completedCycles: validity.completedCycles,
            elapsedMs: performance.now() - startedAt,
            night: sample.zombie.night,
            number: restartNumber,
            phase: sample.zombie.phase,
            ready: false,
            remaining: sample.zombie.phaseSecondsRemaining,
            status: sample.zombie.status,
          }
          terminalRestarts.push(restartEvidence)
          trace.write({
            kind: 'validation',
            name: 'zombie-active-visible-terminal',
            restart: { ...restartEvidence },
            state: sample,
            t: performance.now(),
          })
          publishEvidence()

          await mark(`${restartSegment}-start`)
          let readySample = null
          try {
            let cleanup = await input.releaseAll({
              intent: 'Zombie Escape terminal input release before visible restart',
            })
            if (cleanup.errors.length > 0) {
              cleanup = await input.releaseAll({
                intent: 'Zombie Escape terminal input release retry',
              })
            }
            if (cleanup.errors.length > 0) {
              throw new Error(
                `Zombie Escape terminal input release failed: ${JSON.stringify(cleanup.errors)}`,
              )
            }
            heldKeys.clear()
            fireHeld = false
            await clickZombieActiveVisibleRestart(input, sample)
            readySample = await waitForZombieActiveReady(page, sleep, input, trace, {
              allowVisibleReset: false,
            })
          } finally {
            await mark(`${restartSegment}-end`)
          }

          const completedCycles = validity.completedCycles
          cycleOffset = completedCycles
          shotsFiredOffset = sample.zombie.shotsFired
          validity = prepareZombieActiveValidityForRestart(validity)
          lastRestartCompletedCycles = completedCycles
          restartCount = restartNumber
          deadlineState = createZombieActiveDeadlineState()
          lastInteractAt = Number.NEGATIVE_INFINITY
          lastJumpToken = null
          cadence.activeToken = null
          cadence.lastActionAt = performance.now()
          finalSample = rebaseZombieActiveSample(readySample, {
            cycleOffset,
            shotsFiredOffset,
          })
          restartEvidence.ready = true
          restartEvidence.readyAtMs = performance.now() - startedAt
          restartEvidence.readyNight = finalSample.zombie?.night ?? null
          trace.write({
            kind: 'validation',
            name: 'zombie-active-visible-restart-ready',
            restart: { ...restartEvidence },
            state: finalSample,
            t: performance.now(),
          })
          publishEvidence()
          continue
        }

        const observed = observeZombieActiveSample(validity, sample, now)
        validity = observed.state
        if (observed.issues.length > 0) {
          throw new Error(
            `invalid Zombie Escape active state: ${observed.issues.join('; ')} ` +
              `(sample=${JSON.stringify(sample)})`,
          )
        }

        const phaseSegment = phaseSegmentName(sample, restartCount)
        if (phaseSegment !== openPhaseSegment) {
          if (openActivitySegment) {
            await mark(`${openActivitySegment}-end`)
            openActivitySegment = null
          }
          if (openPhaseSegment) await mark(`${openPhaseSegment}-end`)
          await mark(`${phaseSegment}-start`)
          trace.write({
            kind: 'validation',
            name: 'zombie-active-phase',
            phase: phaseSegment,
            state: sample.zombie,
            t: performance.now(),
          })
          openPhaseSegment = phaseSegment
        }

        const elapsedMs = performance.now() - startedAt
        const stable = classifyZombieActiveStablePhase(sample)
        if (
          stable?.kind === 'day' &&
          stable.cycle > 1 &&
          elapsedMs >= requestedDurationMs &&
          validity.completedCycles >= requiredCycles
        ) {
          break
        }

        if (!stable) {
          const changes = await syncHeldKeys(input, heldKeys, [])
          if (changes > 0) cadence.movementChanges += 1
          if (fireHeld) {
            await input.mouseUp({
              button: 'left',
              intent: 'pause fire during phase transition',
            })
            fireHeld = false
          }
          await sleep(CONTROL_TICK_MS)
          continue
        }

        const activeToken = `${stable.kind}:${stable.cycle}`
        beginActiveCadenceWindow(cadence, activeToken, performance.now())
        const phaseDurationSeconds =
          stable.kind === 'night'
            ? ZOMBIE_ACTIVE_TIMING.nightSeconds
            : ZOMBIE_ACTIVE_TIMING.daySeconds
        const phaseElapsedMs = Math.max(
          0,
          (phaseDurationSeconds - sample.zombie.phaseSecondsRemaining) * 1_000,
        )
        const intent = resolveZombieActivePlayIntent({
          phase: stable.kind === 'night' ? 'night' : 'day',
          phaseElapsedMs,
        })
        const drainedDeadlines = drainZombieActiveDueActions(deadlineState, {
          phaseElapsedMs,
          stable,
        })
        deadlineState = drainedDeadlines.state
        const activitySegment = activitySegmentName(stable, phaseElapsedMs, restartCount)
        if (activitySegment !== openActivitySegment) {
          if (openActivitySegment) await mark(`${openActivitySegment}-end`)
          if (activitySegment) await mark(`${activitySegment}-start`)
          openActivitySegment = activitySegment
        }
        const movementChanges = await syncHeldKeys(input, heldKeys, intent.heldKeys)
        if (movementChanges > 0) {
          cadence.movementChanges += 1
          recordCadenceAction(cadence, performance.now())
        }

        const jumpToken = `${activeToken}:${intent.jumpSequence}`
        if (jumpToken !== lastJumpToken) {
          await input.key('space', {
            intent: 'active-play controller-cross-equivalent jump',
          })
          cadence.jumps += 1
          recordCadenceAction(cadence, performance.now())
          lastJumpToken = jumpToken
        }

        if (sample.pickupPrompt && performance.now() - lastInteractAt >= 2_000) {
          await input.key('e', {
            intent: 'active-play controller-square-equivalent interact',
          })
          cadence.interactions += 1
          lastInteractAt = performance.now()
          recordCadenceAction(cadence, lastInteractAt)
        }

        if (stable.kind === 'night') {
          const rect = sample.canvasRect
          for (const action of drainedDeadlines.actions) {
            const scheduledIntent = resolveZombieActivePlayIntent({
              phase: 'night',
              phaseElapsedMs: action.deadlineMs,
            })
            const aimX = rect.left + rect.width * scheduledIntent.aim.u
            const aimY = rect.top + rect.height * scheduledIntent.aim.v
            if (action.kind === 'aim') {
              await input.movePath(aimX, aimY, { durationMs: 24, steps: 3 })
              cadence.pointerMoves += 1
              recordCadenceAction(cadence, performance.now())
            } else if (action.kind === 'fire-down' && !fireHeld) {
              await input.mouseDown(aimX, aimY, {
                button: 'left',
                intent: 'active-play controller-trigger-equivalent fire',
                moveDurationMs: 0,
              })
              fireHeld = true
              cadence.fireBursts += 1
              recordCadenceAction(cadence, performance.now())
            } else if (action.kind === 'fire-up' && fireHeld) {
              await input.mouseUp({
                button: 'left',
                intent: 'active-play fire burst release',
              })
              fireHeld = false
              recordCadenceAction(cadence, performance.now())
            }
          }
        } else if (fireHeld) {
          await input.mouseUp({
            button: 'left',
            intent: 'stop fire on day entry',
          })
          fireHeld = false
        }

        const nextDeadlineMs = zombieActiveNextDeadlineMs(deadlineState)
        const untilNextDeadlineMs =
          nextDeadlineMs === null ? CONTROL_TICK_MS : Math.max(1, nextDeadlineMs - phaseElapsedMs)
        await sleep(Math.min(CONTROL_TICK_MS, untilNextDeadlineMs))
      }
    } catch (error) {
      executionError = error
    } finally {
      try {
        let cleanup = await input.releaseAll({
          intent: 'Zombie Escape active scenario cleanup',
        })
        if (cleanup.errors.length > 0) {
          cleanup = await input.releaseAll({
            intent: 'Zombie Escape active scenario cleanup retry',
          })
        }
        fireHeld = false
        heldKeys.clear()
        if (cleanup.errors.length > 0) {
          executionError ??= new Error(
            `Zombie Escape active input cleanup failed: ${JSON.stringify(cleanup.errors)}`,
          )
        }
      } catch (error) {
        executionError ??= error
      }
      try {
        finalSample = rebaseZombieActiveSample(await readZombieActiveState(page), {
          cycleOffset,
          shotsFiredOffset,
        })
      } catch (error) {
        executionError ??= error
      }
      try {
        await disposeTrustedInputObserver(page)
      } catch (error) {
        executionError ??= error
      }
      try {
        if (openActivitySegment) await mark(`${openActivitySegment}-end`)
        if (openPhaseSegment) await mark(`${openPhaseSegment}-end`)
      } catch (error) {
        executionError ??= error
      }
    }

    if (executionError) throw executionError
    const finalIssues = collectZombieActiveFinalIssues({
      cadence,
      inputObserver: finalSample?.inputObserver ?? null,
      requestedDurationMs,
      requiredCycles,
      validity,
    })
    trace.write({
      cadence,
      issues: finalIssues,
      kind: 'validation',
      name: 'zombie-active-final',
      restarts: terminalRestarts,
      state: finalSample,
      t: performance.now(),
      validity,
    })
    publishEvidence(finalIssues)
    if (finalIssues.length > 0) {
      throw new Error(`invalid Zombie Escape active run: ${finalIssues.join('; ')}`)
    }
  },
}
