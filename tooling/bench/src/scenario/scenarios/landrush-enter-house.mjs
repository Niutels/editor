import {
  benchmarkParams,
  readFloorVisibility,
  restoreLandrushBenchmarkFixture,
  scenarioDurationMs,
  waitForWorldLayout,
} from '../scenario-utils.mjs'

let preparedEntryRoute = null

async function placePlayerAt(page, point, label) {
  return page.evaluate(
    ({ nextLabel, nextPoint }) =>
      window.__LANDRUSH_ISLAND_NAV_TEST__?.setupStart({
        label: nextLabel,
        start: nextPoint,
      }) ?? false,
    { nextLabel: label, nextPoint: point },
  )
}

async function waitForStableFloorState(page, sleep, timeoutMs = 3_000) {
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
    if (consecutive >= 3) return last
    await sleep(100)
  }
  return last
}

async function discoverExteriorEntryRoutes(page, sleep) {
  const portals = await page.evaluate(
    () => window.__LANDRUSH_ISLAND_NAV_TEST__?.getState().doorPortals ?? [],
  )
  const routes = []
  for (const portal of portals.filter((candidate) => Math.abs(candidate.baseY) < 0.75)) {
    const sides = [portal.sideA, portal.sideB]
    const observations = []
    for (const [index, side] of sides.entries()) {
      const point = { ...side, y: portal.baseY }
      if (!(await placePlayerAt(page, point, `benchmark-entry-probe-${portal.doorId}-${index}`))) {
        continue
      }
      observations.push({ floor: await waitForStableFloorState(page, sleep), point })
    }
    const outside = observations.find(({ floor }) => floor?.insideBuilding === false)
    const inside = observations.find(({ floor }) => floor?.insideBuilding === true)
    if (outside && inside) {
      routes.push({
        buildingScopeId: inside.floor.buildingScopeId,
        doorId: portal.doorId,
        inside: inside.point,
        outside: outside.point,
      })
    }
  }
  return routes
}

async function findTraversableEntryRoute(page, sleep) {
  const routes = await discoverExteriorEntryRoutes(page, sleep)
  for (const route of routes) {
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
    while (Date.now() - startedAt < 8_000) {
      const floor = await readFloorVisibility(page)
      if (
        floor?.insideBuilding &&
        (!route.buildingScopeId || floor.buildingScopeId === route.buildingScopeId)
      ) {
        return route
      }
      await sleep(100)
    }
  }
  return null
}

export default {
  name: 'landrush-enter-house',
  fixture: 'outside',
  urlParams: () => `${benchmarkParams('outside')}&landrushNavDebug=1`,
  async prepare({ bridge, page, sleep }) {
    await waitForWorldLayout(page)
    await restoreLandrushBenchmarkFixture(page, bridge, { player: true })
    preparedEntryRoute ??= await findTraversableEntryRoute(page, sleep)
    if (!preparedEntryRoute) {
      throw new Error('enter-house benchmark could not find a traversable exterior doorway')
    }
    if (!(await placePlayerAt(page, preparedEntryRoute.outside, 'benchmark-entry-ready'))) {
      throw new Error('enter-house benchmark could not stage the player outside')
    }
    const floor = await waitForStableFloorState(page, sleep)
    if (floor?.insideBuilding) {
      throw new Error('enter-house benchmark doorway outside side resolved inside the building')
    }
  },
  async execute({ minutes, mark, page, sleep, trace }) {
    const durationMs = scenarioDurationMs(minutes)
    const startedAt = Date.now()
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
    if (initialFloor?.insideBuilding) {
      throw new Error('enter-house benchmark started inside a building')
    }

    const navigationRequest = await page.evaluate((route) => {
      const navigation = window.__LANDRUSH_ISLAND_NAV_TEST__
      if (!(navigation && route)) return null
      return {
        buildingScopeId: route.buildingScopeId,
        doorId: route.doorId,
        started: navigation.startMove({
          label: 'benchmark-enter-house',
          start: route.outside,
          target: route.inside,
        }),
        start: route.outside,
        target: route.inside,
      }
    }, preparedEntryRoute)
    if (!navigationRequest?.started) {
      throw new Error('enter-house navigation could not target the validated doorway')
    }
    trace.write({
      kind: 'validation',
      t: performance.now(),
      name: 'enter-house-navigation-request',
      navigationRequest,
    })
    await mark('enter-house-start')
    let enteredAt = null
    let nextSampleAt = startedAt
    while (Date.now() - startedAt < durationMs) {
      const floor = await readFloorVisibility(page)
      if (Date.now() >= nextSampleAt) {
        const navigation = await page.evaluate(() => ({
          debug: window.__LANDRUSH_ISLAND_NAV_DEBUG__ ?? null,
          state: window.__LANDRUSH_ISLAND_NAV_TEST__?.getState() ?? null,
        }))
        trace.write({
          kind: 'validation',
          t: performance.now(),
          name: 'enter-house-motion-sample',
          floor,
          navigation,
        })
        nextSampleAt = Date.now() + 1_000
      }
      if (floor?.insideBuilding) {
        enteredAt = Date.now()
        trace.write({
          kind: 'validation',
          t: performance.now(),
          name: 'entered-house',
          elapsedMs: enteredAt - startedAt,
          floor,
        })
        break
      }
      await sleep(100)
    }

    if (enteredAt === null) throw new Error('player never entered the captured house')
    await mark('entered-house')
    const remainingMs = durationMs - (Date.now() - startedAt)
    if (remainingMs > 0) await sleep(remainingMs)
    await mark('enter-house-end')
  },
}
