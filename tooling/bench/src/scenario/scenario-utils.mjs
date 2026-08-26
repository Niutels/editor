export function benchmarkParams(report = 'outside') {
  return [
    'landrushProbe=1',
    `benchmarkReport=${report}`,
  ].join('&')
}

export function scenarioDurationMs(minutes) {
  return Math.max(4_000, Math.round(minutes * 60_000))
}

export async function waitForSceneNodes(
  bridge,
  minimum,
  { minimumFrameIdx = 120, timeoutMs = 180_000 } = {},
) {
  const startedAt = Date.now()
  let last = null
  let consecutive = 0
  while (Date.now() - startedAt < timeoutMs) {
    last = (await bridge.beacon()).beacon
    if ((last?.nodeCount ?? 0) >= minimum && (last?.frameIdx ?? 0) >= minimumFrameIdx) {
      consecutive += 1
      if (consecutive >= 4) return last
    } else {
      consecutive = 0
    }
    await new Promise((resolve) => setTimeout(resolve, 500))
  }
  throw new Error(
    `scene did not reach ${minimum} nodes at frame ${minimumFrameIdx} ` +
      `(last nodes=${last?.nodeCount ?? 'unavailable'}, frame=${last?.frameIdx ?? 'unavailable'})`,
  )
}

export async function waitForWorldLayout(page, minimumLevels = 3, { timeoutMs = 180_000 } = {}) {
  const startedAt = Date.now()
  let last = null
  let consecutive = 0
  while (Date.now() - startedAt < timeoutMs) {
    last = await readFloorVisibility(page)
    const levelCount = Array.isArray(last?.visibleLevelIds) ? last.visibleLevelIds.length : 0
    if (levelCount >= minimumLevels) {
      consecutive += 1
      if (consecutive >= 4) return last
    } else {
      consecutive = 0
    }
    await new Promise((resolve) => setTimeout(resolve, 500))
  }
  throw new Error(
    `world layout did not reach ${minimumLevels} visible levels ` +
      `(last=${last?.visibleLevelIds?.length ?? 'unavailable'})`,
  )
}

export async function waitForLocalParcelOwnership(
  page,
  parcelId,
  { timeoutMs = 30_000 } = {},
) {
  const startedAt = Date.now()
  let last = null
  let consecutive = 0
  while (Date.now() - startedAt < timeoutMs) {
    last = await page.evaluate(
      () => window.__LANDRUSH_ISLAND_RUNTIME_PROBE__?.parcelDiagnostics ?? null,
    )
    if (last?.localOwnershipParcelId === parcelId) {
      consecutive += 1
      if (consecutive >= 4) return last
    } else {
      consecutive = 0
    }
    await new Promise((resolve) => setTimeout(resolve, 250))
  }
  throw new Error(
    `local parcel ownership did not reconcile to ${parcelId} ` +
      `(last=${last?.localOwnershipParcelId ?? 'unavailable'})`,
  )
}

export async function waitForActiveBuildParcel(page, parcelId, { timeoutMs = 30_000 } = {}) {
  const startedAt = Date.now()
  let last = null
  let consecutive = 0
  while (Date.now() - startedAt < timeoutMs) {
    last = await page.evaluate(
      () => window.__LANDRUSH_ISLAND_RUNTIME_PROBE__?.parcelDiagnostics ?? null,
    )
    if (last?.buildParcelId === parcelId && last.buildParcelCentroid) {
      consecutive += 1
      if (consecutive >= 4) return last
    } else {
      consecutive = 0
    }
    await new Promise((resolve) => setTimeout(resolve, 250))
  }
  throw new Error(
    `build parcel did not become ${parcelId} ` +
      `(last=${last?.buildParcelId ?? 'unavailable'})`,
  )
}

export async function activateEditorTool(bridge, mode, tool, { timeoutMs = 20_000 } = {}) {
  const startedAt = Date.now()
  let last = null
  let consecutive = 0
  while (Date.now() - startedAt < timeoutMs) {
    await bridge.setMode(mode)
    await bridge.setTool(tool)
    await new Promise((resolve) => setTimeout(resolve, 500))
    last = (await bridge.beacon()).beacon
    if (last?.mode === mode && last?.tool === tool) {
      consecutive += 1
      if (consecutive >= 3) return last
    } else {
      consecutive = 0
    }
  }
  throw new Error(
    `editor tool did not stay active (mode=${last?.mode ?? 'unknown'}, tool=${last?.tool ?? 'none'})`,
  )
}

export async function readFloorVisibility(page) {
  return page.evaluate(
    () => window.__LANDRUSH_ISLAND_RUNTIME_PROBE__?.floorVisibility ?? null,
  )
}

export async function placeLandrushPlayerAt(page, point, label) {
  return page.evaluate(
    ({ nextLabel, nextPoint }) =>
      window.__LANDRUSH_ISLAND_NAV_TEST__?.setupStart({
        label: nextLabel,
        start: nextPoint,
      }) ?? false,
    { nextLabel: label, nextPoint: point },
  )
}

export async function waitForStableFloorState(
  page,
  sleep,
  { pollMs = 100, requiredConsecutiveSamples = 3, timeoutMs = 3_000 } = {},
) {
  const startedAt = Date.now()
  let lastSignature = null
  let consecutive = 0
  let last = null
  while (Date.now() - startedAt < timeoutMs) {
    last = await readFloorVisibility(page)
    const signature = JSON.stringify({
      buildingScopeId: last?.buildingScopeId ?? null,
      insideBuilding: last?.insideBuilding ?? null,
      levelId: last?.levelId ?? null,
      regionSource: last?.regionSource ?? null,
    })
    if (signature === lastSignature) consecutive += 1
    else {
      lastSignature = signature
      consecutive = 1
    }
    if (consecutive >= requiredConsecutiveSamples) return last
    await sleep(pollMs)
  }
  return last
}

const LANDRUSH_ENTRY_ENDPOINT_POSE_TOLERANCE_METERS = 0.35
const LANDRUSH_ENTRY_MAXIMUM_FRAME_DELTA_SECONDS = 0.05
const LANDRUSH_ENTRY_MAXIMUM_SPEED_METERS_PER_SECOND = 2.75 * 2.48
const LANDRUSH_ENTRY_MOTION_TOLERANCE_METERS = 0.08
const LANDRUSH_ENTRY_MINIMUM_MOTION_METERS = 0.025
const LANDRUSH_ENTRY_TRAVERSAL_POLL_MS = 100
const LANDRUSH_ENTRY_TRAVERSAL_TIMEOUT_MS = 8_000
const LANDRUSH_ENTRY_REQUIRED_STABLE_FRAMES = 3

async function readLandrushExteriorEntryObservation(page) {
  return page.evaluate(() => {
    const floor = window.__LANDRUSH_ISLAND_RUNTIME_PROBE__?.floorVisibility ?? null
    const navigation = window.__LANDRUSH_ISLAND_NAV_TEST__?.getState() ?? null
    const beacon = window.__PASCAL_BENCH__?.beacon() ?? null
    return {
      floor: floor
        ? {
            buildingScopeId: floor.buildingScopeId ?? null,
            insideBuilding: floor.insideBuilding,
            levelId: floor.levelId ?? null,
            regionSource: floor.regionSource ?? null,
          }
        : null,
      frameIdx: beacon?.frameIdx ?? null,
      observedAtMs: performance.now(),
      robot: navigation?.robot ?? null,
    }
  })
}

function landrushEntryObservationFrameIdx(observation) {
  return observation?.frameIdx ?? observation?.bridgeFrameIdx
}

function landrushEntryObservationPose(observation) {
  return observation?.robot ?? observation?.playerPose ?? null
}

export function landrushEntryTraversalMotionIssues(
  observations,
  {
    arrivalToleranceMeters = LANDRUSH_ENTRY_ENDPOINT_POSE_TOLERANCE_METERS,
    maximumSpeedMetersPerSecond = LANDRUSH_ENTRY_MAXIMUM_SPEED_METERS_PER_SECOND,
    start,
    startToleranceMeters = LANDRUSH_ENTRY_ENDPOINT_POSE_TOLERANCE_METERS,
    target,
  },
) {
  if (!Array.isArray(observations) || observations.length < 3) {
    return ['doorway traversal did not capture enough advancing pose samples']
  }
  const issues = []
  let intermediatePoseCount = 0
  let motionSegmentCount = 0
  for (let index = 1; index < observations.length; index += 1) {
    const previous = observations[index - 1]
    const current = observations[index]
    const previousFrameIdx = landrushEntryObservationFrameIdx(previous)
    const currentFrameIdx = landrushEntryObservationFrameIdx(current)
    const previousPose = landrushEntryObservationPose(previous)
    const currentPose = landrushEntryObservationPose(current)
    const elapsedMs = current?.observedAtMs - previous?.observedAtMs
    const frameDelta = currentFrameIdx - previousFrameIdx
    if (
      !Number.isInteger(previousFrameIdx) ||
      !Number.isInteger(currentFrameIdx) ||
      frameDelta <= 0 ||
      !Number.isFinite(previous?.observedAtMs) ||
      !Number.isFinite(current?.observedAtMs) ||
      !(elapsedMs > 0) ||
      !previousPose ||
      !currentPose ||
      !Number.isFinite(previousPose.x) ||
      !Number.isFinite(previousPose.z) ||
      !Number.isFinite(currentPose.x) ||
      !Number.isFinite(currentPose.z)
    ) {
      issues.push(`doorway traversal sample ${String(index)} is not frame/time-backed`)
      continue
    }
    const displacement = Math.hypot(
      currentPose.x - previousPose.x,
      currentPose.z - previousPose.z,
    )
    const maximumElapsedDisplacement =
      maximumSpeedMetersPerSecond * (elapsedMs / 1_000)
    const maximumFrameDisplacement =
      maximumSpeedMetersPerSecond * LANDRUSH_ENTRY_MAXIMUM_FRAME_DELTA_SECONDS * frameDelta
    const maximumDisplacement =
      Math.min(maximumElapsedDisplacement, maximumFrameDisplacement) +
      LANDRUSH_ENTRY_MOTION_TOLERANCE_METERS
    if (displacement > maximumDisplacement) {
      issues.push(
        `doorway traversal sample ${String(index)} moved ${displacement.toFixed(3)}m; ` +
          `production bound=${maximumDisplacement.toFixed(3)}m`,
      )
    }
    if (displacement >= LANDRUSH_ENTRY_MINIMUM_MOTION_METERS) motionSegmentCount += 1
    if (
      start &&
      target &&
      Math.hypot(currentPose.x - start.x, currentPose.z - start.z) >
        startToleranceMeters &&
      Math.hypot(currentPose.x - target.x, currentPose.z - target.z) >
        arrivalToleranceMeters
    ) {
      intermediatePoseCount += 1
    }
  }
  if (motionSegmentCount < 2) {
    issues.push(`doorway traversal captured ${String(motionSegmentCount)} advancing motion segments`)
  }
  if (intermediatePoseCount < 1) {
    issues.push('doorway traversal captured no advancing intermediate pose')
  }
  return issues
}

export function landrushExteriorEntryObservationIssues(
  observation,
  {
    buildingScopeId = null,
    expectedInside = null,
    levelId = null,
    minimumFrameIdx = -1,
    point,
    poseToleranceMeters = LANDRUSH_ENTRY_ENDPOINT_POSE_TOLERANCE_METERS,
  },
) {
  const issues = []
  if (!Number.isInteger(observation?.frameIdx) || observation.frameIdx <= minimumFrameIdx) {
    issues.push(`bridge frame=${String(observation?.frameIdx)} after ${String(minimumFrameIdx)}`)
  }
  const robot = observation?.robot
  if (
    !robot ||
    !Number.isFinite(robot.x) ||
    !Number.isFinite(robot.y) ||
    !Number.isFinite(robot.z)
  ) {
    issues.push('player pose is unavailable')
  } else if (
    !point ||
    Math.hypot(robot.x - point.x, robot.z - point.z) > poseToleranceMeters ||
    (Number.isFinite(point.y) && Math.abs(robot.y - point.y) > poseToleranceMeters)
  ) {
    issues.push('player pose does not match the doorway endpoint')
  }
  const floor = observation?.floor
  if (floor?.insideBuilding !== true && floor?.insideBuilding !== false) {
    issues.push(`insideBuilding=${String(floor?.insideBuilding)}`)
  } else if (expectedInside !== null && floor.insideBuilding !== expectedInside) {
    issues.push(`insideBuilding=${String(floor.insideBuilding)} expected ${String(expectedInside)}`)
  }
  if (expectedInside === true) {
    if (!buildingScopeId || floor?.buildingScopeId !== buildingScopeId) {
      issues.push(
        `building=${String(floor?.buildingScopeId)} expected ${String(buildingScopeId)}`,
      )
    }
    if (!levelId || floor?.levelId !== levelId) {
      issues.push(`level=${String(floor?.levelId)} expected ${String(levelId)}`)
    }
  }
  return issues
}

async function waitForLandrushExteriorEntryEndpoint(
  page,
  sleep,
  {
    buildingScopeId = null,
    expectedInside = null,
    levelId = null,
    minimumFrameIdx = -1,
    point,
    poseToleranceMeters = LANDRUSH_ENTRY_ENDPOINT_POSE_TOLERANCE_METERS,
    timeoutMs = 5_000,
  },
) {
  const startedAt = Date.now()
  let consecutive = 0
  let lastAcceptedFrameIdx = minimumFrameIdx
  let lastSignature = null
  while (Date.now() - startedAt < timeoutMs) {
    const observation = await readLandrushExteriorEntryObservation(page)
    const issues = landrushExteriorEntryObservationIssues(observation, {
      buildingScopeId,
      expectedInside,
      levelId,
      minimumFrameIdx: lastAcceptedFrameIdx,
      point,
      poseToleranceMeters,
    })
    const signature = JSON.stringify({
      buildingScopeId: observation?.floor?.buildingScopeId ?? null,
      insideBuilding: observation?.floor?.insideBuilding ?? null,
      levelId: observation?.floor?.levelId ?? null,
      regionSource: observation?.floor?.regionSource ?? null,
    })
    if (issues.length === 0) {
      consecutive = signature === lastSignature ? consecutive + 1 : 1
      lastSignature = signature
      lastAcceptedFrameIdx = observation.frameIdx
      if (consecutive >= LANDRUSH_ENTRY_REQUIRED_STABLE_FRAMES) return observation
    } else {
      consecutive = 0
      lastSignature = null
    }
    await sleep(LANDRUSH_ENTRY_TRAVERSAL_POLL_MS)
  }
  return null
}

function compareStableStrings(first, second) {
  const left = String(first ?? '')
  const right = String(second ?? '')
  return left < right ? -1 : left > right ? 1 : 0
}

export function sortLandrushExteriorEntryRoutes(routes) {
  return [...routes].sort(
    (first, second) =>
      compareStableStrings(first.buildingScopeId, second.buildingScopeId) ||
      compareStableStrings(first.levelId, second.levelId) ||
      compareStableStrings(first.doorId, second.doorId),
  )
}

export async function discoverLandrushExteriorEntryRoutes(page, sleep) {
  const portals = await page.evaluate(
    () => window.__LANDRUSH_ISLAND_NAV_TEST__?.getState().doorPortals ?? [],
  )
  const routes = []
  for (const portal of portals.filter((candidate) => Math.abs(candidate.baseY) < 0.75)) {
    const observations = []
    for (const [index, side] of [portal.sideA, portal.sideB].entries()) {
      const point = { ...side, y: portal.baseY }
      const before = await readLandrushExteriorEntryObservation(page)
      if (
        !(await placeLandrushPlayerAt(
          page,
          point,
          `benchmark-entry-probe-${portal.doorId}-${index}`,
        ))
      ) {
        continue
      }
      const observation = await waitForLandrushExteriorEntryEndpoint(page, sleep, {
        minimumFrameIdx: Number.isInteger(before?.frameIdx) ? before.frameIdx : -1,
        point,
      })
      if (observation) observations.push({ floor: observation.floor, point })
    }
    const outside = observations.find(({ floor }) => floor?.insideBuilding === false)
    const inside = observations.find(({ floor }) => floor?.insideBuilding === true)
    if (
      outside &&
      inside &&
      typeof inside.floor.buildingScopeId === 'string' &&
      inside.floor.buildingScopeId.length > 0 &&
      typeof inside.floor.levelId === 'string' &&
      inside.floor.levelId.length > 0
    ) {
      routes.push({
        buildingScopeId: inside.floor.buildingScopeId,
        doorId: portal.doorId,
        inside: inside.point,
        levelId: inside.floor.levelId,
        outside: outside.point,
      })
    }
  }
  return sortLandrushExteriorEntryRoutes(routes)
}

export async function findTraversableLandrushExteriorEntryRoute(page, sleep) {
  const routes = await discoverLandrushExteriorEntryRoutes(page, sleep)
  for (const route of routes) {
    const beforeOutside = await readLandrushExteriorEntryObservation(page)
    if (
      !(await placeLandrushPlayerAt(
        page,
        route.outside,
        `benchmark-entry-restage-${route.doorId}`,
      ))
    ) {
      continue
    }
    const stagedOutside = await waitForLandrushExteriorEntryEndpoint(page, sleep, {
      expectedInside: false,
      minimumFrameIdx: Number.isInteger(beforeOutside?.frameIdx) ? beforeOutside.frameIdx : -1,
      point: route.outside,
    })
    if (!stagedOutside) continue

    const started = await page.evaluate((candidate) => {
      const navigation = window.__LANDRUSH_ISLAND_NAV_TEST__
      return (
        navigation?.startMove({
          label: `benchmark-entry-validation-${candidate.doorId}`,
          start: candidate.outside,
          target: candidate.inside,
        }) ?? false
      )
    }, route)
    if (!started) continue

    const startedAt = Date.now()
    let lastFrameIdx = stagedOutside.frameIdx
    const traversalObservations = [stagedOutside]
    let consecutiveInsideFrames = 0
    let lastInsideSignature = null
    let traversedInside = null
    while (Date.now() - startedAt < LANDRUSH_ENTRY_TRAVERSAL_TIMEOUT_MS) {
      const observation = await readLandrushExteriorEntryObservation(page)
      if (Number.isInteger(observation?.frameIdx) && observation.frameIdx > lastFrameIdx) {
        lastFrameIdx = observation.frameIdx
        traversalObservations.push(observation)
        const endpointIssues = landrushExteriorEntryObservationIssues(observation, {
          buildingScopeId: route.buildingScopeId,
          expectedInside: true,
          levelId: route.levelId,
          minimumFrameIdx: stagedOutside.frameIdx,
          point: route.inside,
        })
        const insideSignature = JSON.stringify(observation.floor)
        if (endpointIssues.length === 0) {
          consecutiveInsideFrames =
            insideSignature === lastInsideSignature ? consecutiveInsideFrames + 1 : 1
          lastInsideSignature = insideSignature
          if (consecutiveInsideFrames >= LANDRUSH_ENTRY_REQUIRED_STABLE_FRAMES) {
            if (
              landrushEntryTraversalMotionIssues(traversalObservations, {
                start: route.outside,
                target: route.inside,
              }).length === 0
            ) {
              traversedInside = observation
            }
            break
          }
        } else {
          consecutiveInsideFrames = 0
          lastInsideSignature = null
        }
      }
      await sleep(LANDRUSH_ENTRY_TRAVERSAL_POLL_MS)
    }
    if (!traversedInside) continue

    if (
      !(await placeLandrushPlayerAt(
        page,
        route.outside,
        `benchmark-entry-revalidate-${route.doorId}`,
      ))
    ) {
      continue
    }
    const revalidatedOutside = await waitForLandrushExteriorEntryEndpoint(page, sleep, {
      expectedInside: false,
      minimumFrameIdx: traversedInside.frameIdx,
      point: route.outside,
    })
    if (revalidatedOutside) return route
  }
  return null
}

export async function readLandrushViewMode(page) {
  return page.evaluate(() => {
    const frames = window.__LANDRUSH_ISLAND_RUNTIME_PROBE__?.frameSamples ?? []
    return frames.at(-1)?.mode ?? null
  })
}

export async function enterLandrushBuildMode(page, { timeoutMs = 30_000 } = {}) {
  const startedAt = Date.now()
  let requested = false
  let lastMode = null
  while (Date.now() - startedAt < timeoutMs) {
    const state = await page.evaluate((shouldRequest) => {
      const probe = window.__LANDRUSH_ISLAND_RUNTIME_PROBE__
      const mode = probe?.frameSamples?.at(-1)?.mode ?? null
      if (mode === 'build') return { mode, requested: false }
      if (!shouldRequest && probe?.enterFirstBuildParcel) {
        return { mode, requested: probe.enterFirstBuildParcel() }
      }
      return { mode, requested: false }
    }, requested)
    lastMode = state.mode
    requested ||= state.requested
    if (lastMode === 'build') return
    await new Promise((resolve) => setTimeout(resolve, 250))
  }
  throw new Error(
    `Landrush build view did not become ready (request=${requested}, mode=${lastMode ?? 'unknown'})`,
  )
}

export async function restoreLandrushBenchmarkFixture(
  page,
  bridge,
  { player = false, timeoutMs = 30_000 } = {},
) {
  const startedAt = Date.now()
  let fixture = null
  while (Date.now() - startedAt < timeoutMs) {
    fixture = await page.evaluate((restorePlayer) => {
      const value = window.__LANDRUSH_BENCHMARK_FIXTURE__
      if (!value) return null
      if (restorePlayer) {
        const navigation = window.__LANDRUSH_ISLAND_NAV_TEST__
        if (!navigation) return null
        navigation.setupStart({
          heading: value.player.heading,
          label: 'benchmark-fixture',
          start: {
            x: value.player.position[0],
            y: value.player.position[1],
            z: value.player.position[2],
          },
        })
      }
      return value
    }, player)
    if (fixture) break
    await new Promise((resolve) => setTimeout(resolve, 250))
  }

  if (!fixture) {
    throw new Error(
      player
        ? 'Landrush benchmark fixture player bridge did not become ready'
        : 'Landrush benchmark fixture was not installed',
    )
  }
  if (fixture.camera) await bridge.setCameraPose(fixture.camera)
  return fixture
}
