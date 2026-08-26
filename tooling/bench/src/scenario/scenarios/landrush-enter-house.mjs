import {
  benchmarkParams,
  findTraversableLandrushExteriorEntryRoute,
  placeLandrushPlayerAt,
  readFloorVisibility,
  restoreLandrushBenchmarkFixture,
  scenarioDurationMs,
  waitForStableFloorState,
  waitForWorldLayout,
} from '../scenario-utils.mjs'

let preparedEntryRoute = null

export default {
  name: 'landrush-enter-house',
  fixture: 'outside',
  urlParams: () => `${benchmarkParams('outside')}&landrushNavDebug=1`,
  async prepare({ bridge, page, sleep }) {
    await waitForWorldLayout(page)
    await restoreLandrushBenchmarkFixture(page, bridge, { player: true })
    preparedEntryRoute ??= await findTraversableLandrushExteriorEntryRoute(page, sleep)
    if (!preparedEntryRoute) {
      throw new Error('enter-house benchmark could not find a traversable exterior doorway')
    }
    if (
      !(await placeLandrushPlayerAt(
        page,
        preparedEntryRoute.outside,
        'benchmark-entry-ready',
      ))
    ) {
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
