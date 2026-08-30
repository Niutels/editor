import {
  benchmarkParams,
  discoverLandrushExteriorEntryCandidates,
  landrushEntryTraversalMotionIssues,
  readFloorVisibility,
  restoreLandrushBenchmarkFixture,
  scenarioDurationMs,
  waitForStableFloorState,
  waitForWorldLayout,
} from '../scenario-utils.mjs'

const ENTRY_ENDPOINT_TOLERANCE_METERS = 0.4
const ENTRY_PHASE_TIMEOUT_MS = 8_000
const ENTRY_REQUIRED_ENDPOINT_SAMPLES = 3
const LOADING_HANDOFF_TERMINAL_GRACE_MS = 5_000
const LOADING_HANDOFF_TIMEOUT_MS = 120_000

let preparedEntryCandidates = []

async function waitForLoadingHandoff(page, sleep) {
  const startedAt = Date.now()
  const deadline = Date.now() + LOADING_HANDOFF_TIMEOUT_MS
  const transitions = []
  let terminalDeadline = null
  let transitionKey = null
  let latest = null
  while (Date.now() < (terminalDeadline ?? deadline)) {
    latest = await page.evaluate(() => {
      const main = document.querySelector('main[data-landrush-loading-handed-off]')
      const overlay = document.querySelector('[role="progressbar"]')
      const floorPresentation =
        window.__LANDRUSH_ISLAND_RUNTIME_PROBE__?.floorPresentationSamples?.at(-1) ?? null
      const startup = window.__LANDRUSH_ATOMIC_STARTUP__
      return {
        activeRenderRepresentative: startup?.activeRenderRepresentative ?? null,
        floorPreparation: window.__LANDRUSH_ISLAND_RUNTIME_PROBE__?.floorFadePreparation ?? null,
        floorPresentationIssues: floorPresentation
          ? {
              roots: floorPresentation.roots?.filter(
                (root) =>
                  root.ready !== true ||
                  root.pending === true ||
                  root.quarantineCount > 0 ||
                  root.assignmentMismatchCount > 0,
              ),
              timeMs: floorPresentation.timeMs,
            }
          : null,
        handedOff: main?.getAttribute('data-landrush-loading-handed-off') === 'true',
        loading: main ? { ...main.dataset } : null,
        overlayProgress: overlay?.getAttribute('aria-valuenow') ?? null,
        overlayStatus:
          overlay?.querySelector('[data-landrush-island-loading-shell-status]')?.textContent ?? null,
        overlayVisible: Boolean(
          overlay && !overlay.hasAttribute('hidden') && overlay.getAttribute('aria-hidden') !== 'true',
        ),
        renderReadinessTail: startup?.renderReadiness?.slice(-16) ?? null,
      }
    })
    const nextTransitionKey = JSON.stringify({
      floorCompleted: latest.loading?.landrushLoadingFloorPresentationCompleted ?? null,
      floorReady: latest.loading?.landrushLoadingFloorPresentationReady ?? null,
      handedOff: latest.handedOff,
      overlayProgress: latest.overlayProgress,
      pipelineCompleted: latest.loading?.landrushLoadingZombiePipelineCompleted ?? null,
      pipelineReady: latest.loading?.landrushLoadingZombiePipelineReady ?? null,
    })
    if (nextTransitionKey !== transitionKey) {
      transitionKey = nextTransitionKey
      transitions.push({ elapsedMs: Date.now() - startedAt, ...JSON.parse(nextTransitionKey) })
    }
    if (latest.handedOff && !latest.overlayVisible) return
    if (latest.handedOff && terminalDeadline === null) {
      terminalDeadline = Date.now() + LOADING_HANDOFF_TERMINAL_GRACE_MS
    }
    await sleep(100)
  }
  throw new Error(
    `enter-house benchmark loading did not hand off: ${JSON.stringify({ latest, transitions })}`,
  )
}

async function readEntryObservation(page) {
  return page.evaluate(() => {
    const navigation = window.__LANDRUSH_ISLAND_NAV_TEST__?.getState() ?? null
    const runtimeProbe = window.__LANDRUSH_ISLAND_RUNTIME_PROBE__
    return {
      floor: runtimeProbe?.floorVisibility ?? null,
      floorPreparation: runtimeProbe?.floorFadePreparation ?? null,
      frameIdx: window.__PASCAL_BENCH__?.beacon()?.frameIdx ?? null,
      navigation,
      observedAtMs: performance.now(),
      robot: navigation?.robot ?? null,
    }
  })
}

function entryEndpointReached(observation, target) {
  const robot = observation?.navigation?.robot
  return (
    robot &&
    Number.isFinite(robot.x) &&
    Number.isFinite(robot.z) &&
    Math.hypot(robot.x - target.x, robot.z - target.z) <= ENTRY_ENDPOINT_TOLERANCE_METERS
  )
}

function createEntryCandidateOrientations(candidate) {
  return [
    { ...candidate, orientation: 'near' },
    {
      ...candidate,
      inside: candidate.outside,
      orientation: 'far',
      outside: candidate.inside,
    },
  ]
}

async function stageMeasuredDoorSide({ deadline, page, route, sleep, trace }) {
  const stage = await page.evaluate((candidate) => {
    const navigation = window.__LANDRUSH_ISLAND_NAV_TEST__
    const staged =
      navigation?.setupStart({
        label: `benchmark-enter-house-stage-${candidate.orientation}-${candidate.doorId}`,
        start: candidate.outside,
      }) ?? false
    return {
      frameIdx: window.__PASCAL_BENCH__?.beacon()?.frameIdx ?? null,
      staged,
    }
  }, route)
  trace.write({
    kind: 'validation',
    t: performance.now(),
    name: 'enter-house-door-side-stage',
    doorId: route.doorId,
    orientation: route.orientation,
    staged: stage.staged,
  })
  if (!stage.staged) return { observation: null, status: 'unavailable' }

  let consecutiveExteriorSamples = 0
  while (Date.now() < deadline) {
    const observation = await readEntryObservation(page)
    const frameAdvanced =
      Number.isInteger(stage.frameIdx) &&
      Number.isInteger(observation.frameIdx) &&
      observation.frameIdx > stage.frameIdx
    if (
      frameAdvanced &&
      observation.floor?.insideBuilding === true &&
      entryEndpointReached(observation, route.outside)
    ) {
      return { observation, status: 'inside' }
    }
    consecutiveExteriorSamples =
      frameAdvanced &&
      observation.floor?.insideBuilding === false &&
      entryEndpointReached(observation, route.outside)
        ? consecutiveExteriorSamples + 1
        : 0
    if (consecutiveExteriorSamples >= ENTRY_REQUIRED_ENDPOINT_SAMPLES) {
      return { observation, status: 'exterior' }
    }
    await sleep(100)
  }
  return { observation: null, status: 'timeout' }
}

export default {
  name: 'landrush-enter-house',
  fixture: 'outside',
  lifecycle: {
    captureInitialCheckpoint: false,
    prepareAfterWarmup: false,
    settleBeforeMeasurement: false,
    warmupSeconds: 0,
  },
  urlParams: ({ args = {} } = {}) =>
    `${benchmarkParams('outside')}&landrushNavDebug=1${
      args.game === 'zombie-escape' ? '&game=zombie-escape' : ''
    }`,
  async prepare({ bridge, page, sleep }) {
    await waitForWorldLayout(page)
    await restoreLandrushBenchmarkFixture(page, bridge, { player: true })
    await waitForLoadingHandoff(page, sleep)
    const floor = await waitForStableFloorState(page, sleep)
    if (floor?.insideBuilding !== false) {
      throw new Error(
        `enter-house benchmark fixture did not resolve outside ` +
          `(insideBuilding=${String(floor?.insideBuilding)})`,
      )
    }
    preparedEntryCandidates = await discoverLandrushExteriorEntryCandidates(page)
    if (preparedEntryCandidates.length === 0) {
      throw new Error('enter-house benchmark could not discover a ground-floor doorway candidate')
    }
  },
  async execute({ minutes, mark, page, sleep, trace }) {
    const durationMs = scenarioDurationMs(minutes)
    const initialFloor = await readFloorVisibility(page)
    const initialNavigation = await page.evaluate(() => ({
      debug: window.__LANDRUSH_ISLAND_NAV_DEBUG__ ?? null,
      state: window.__LANDRUSH_ISLAND_NAV_TEST__?.getState() ?? null,
    }))
    trace.write({
      kind: 'validation',
      t: performance.now(),
      name: 'enter-house-initial-state',
      floor: initialFloor,
      navigation: initialNavigation,
    })
    if (initialFloor?.insideBuilding !== false) {
      throw new Error(
        `enter-house benchmark did not start from proven exterior state ` +
          `(insideBuilding=${String(initialFloor?.insideBuilding)})`,
      )
    }

    await mark('enter-house-start')
    const startedAt = Date.now()
    let enteredAt = null
    let nextSampleAt = startedAt
    let enteredFloor = null
    let enteredRoute = null
    for (const candidate of preparedEntryCandidates) {
      if (Date.now() - startedAt >= durationMs) break
      for (const route of createEntryCandidateOrientations(candidate)) {
        const orientationDeadline = Math.min(
          startedAt + durationMs,
          Date.now() + ENTRY_PHASE_TIMEOUT_MS,
        )
        const stagedSide = await stageMeasuredDoorSide({
          deadline: orientationDeadline,
          page,
          route,
          sleep,
          trace,
        })
        if (stagedSide.status === 'inside') {
          trace.write({
            kind: 'validation',
            t: performance.now(),
            name: 'enter-house-orientation-rejected',
            doorId: route.doorId,
            orientation: route.orientation,
            reason: 'staged-side-inside',
          })
          continue
        }
        if (stagedSide.status !== 'exterior' || !stagedSide.observation) continue

        const navigationRequest = await page.evaluate((entryRoute) => {
          const navigation = window.__LANDRUSH_ISLAND_NAV_TEST__
          if (!navigation) return null
          return {
            doorId: entryRoute.doorId,
            orientation: entryRoute.orientation,
            phase: 'cross',
            started: navigation.startMove({
              label: `benchmark-enter-house-${entryRoute.orientation}-cross-${entryRoute.doorId}`,
              start: entryRoute.outside,
              target: entryRoute.inside,
            }),
            start: entryRoute.outside,
            target: entryRoute.inside,
          }
        }, route)
        trace.write({
          kind: 'validation',
          t: performance.now(),
          name: 'enter-house-navigation-request',
          navigationRequest,
        })
        if (!navigationRequest?.started) continue

        const traversalObservations = []
        let firstInsideAt = null
        let firstInsideFloor = null
        let lastFrameIdx = stagedSide.observation.frameIdx
        while (Date.now() < orientationDeadline) {
          const observation = await readEntryObservation(page)
          const floor = observation.floor
          if (Date.now() >= nextSampleAt) {
            trace.write({
              kind: 'validation',
              t: performance.now(),
              name: 'enter-house-motion-sample',
              floor,
              floorPreparation: observation.floorPreparation,
              navigation: {
                debug: await page.evaluate(
                  () => window.__LANDRUSH_ISLAND_NAV_DEBUG__ ?? null,
                ),
                state: observation.navigation,
              },
            })
            nextSampleAt = Date.now() + 1_000
          }
          if (
            !Number.isInteger(lastFrameIdx) ||
            (Number.isInteger(observation.frameIdx) && observation.frameIdx > lastFrameIdx)
          ) {
            traversalObservations.push(observation)
            lastFrameIdx = observation.frameIdx
          }
          if (floor?.insideBuilding === true) {
            firstInsideAt ??= Date.now()
            firstInsideFloor ??= floor
            if (
              landrushEntryTraversalMotionIssues(traversalObservations, {
                start: route.outside,
                target: route.inside,
              }).length === 0
            ) {
              enteredAt = firstInsideAt
              enteredFloor = firstInsideFloor
              enteredRoute = route
              break
            }
          }
          await sleep(100)
        }
        if (enteredAt !== null) break
        if (firstInsideAt !== null) {
          trace.write({
            kind: 'validation',
            t: performance.now(),
            name: 'enter-house-crossing-rejected',
            doorId: route.doorId,
            orientation: route.orientation,
            reason: 'inside-without-motion-proof',
          })
        }
      }
      if (enteredAt !== null) break
    }

    if (enteredAt === null) throw new Error('player never entered the captured house')
    trace.write({
      kind: 'validation',
      t: performance.now(),
      name: 'entered-house',
      doorId: enteredRoute?.doorId ?? null,
      elapsedMs: enteredAt - startedAt,
      floor: enteredFloor,
      floorPreparation:
        (await readEntryObservation(page)).floorPreparation,
    })
    await mark('entered-house')
    const remainingMs = durationMs - (Date.now() - startedAt)
    if (remainingMs > 0) await sleep(remainingMs)
    await mark('enter-house-end')
  },
}
