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
