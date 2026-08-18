import {
  benchmarkParams,
  readFloorVisibility,
  restoreLandrushBenchmarkFixture,
  scenarioDurationMs,
  waitForWorldLayout,
} from '../scenario-utils.mjs'

export default {
  name: 'landrush-enter-house',
  fixture: 'outside',
  urlParams: () => `${benchmarkParams('outside')}&landrushNavDebug=1`,
  async prepare({ bridge, page }) {
    await waitForWorldLayout(page)
    await restoreLandrushBenchmarkFixture(page, bridge, { player: true })
  },
  async execute({ minutes, mark, page, sleep, trace }) {
    const durationMs = scenarioDurationMs(minutes)
    const startedAt = Date.now()
    const initialFloor = await readFloorVisibility(page)
    const initialNavigation = await page.evaluate(
      () => window.__LANDRUSH_ISLAND_NAV_TEST__?.getState() ?? null,
    )
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

    const navigationRequest = await page.evaluate(() => {
      const navigation = window.__LANDRUSH_ISLAND_NAV_TEST__
      const state = navigation?.getState()
      if (!(navigation && state)) return null
      const start = state.robot
      const portal = state.doorPortals
        .filter((candidate) => Math.abs(candidate.baseY - start.y) < 0.75)
        .sort(
          (a, b) =>
            Math.hypot(a.center.x - start.x, a.center.z - start.z) -
            Math.hypot(b.center.x - start.x, b.center.z - start.z),
        )[0]
      if (!portal) return null
      const sides = [portal.sideA, portal.sideB]
      const target = sides.sort(
        (a, b) =>
          Math.hypot(b.x - start.x, b.z - start.z) -
          Math.hypot(a.x - start.x, a.z - start.z),
      )[0]
      if (!target) return null
      return {
        doorId: portal.doorId,
        started: navigation.startMove({
          label: 'benchmark-enter-house',
          start,
          target,
        }),
        target,
      }
    })
    if (!navigationRequest?.started) {
      throw new Error('enter-house navigation could not target the nearest doorway')
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
        const navigation = await page.evaluate(
          () => window.__LANDRUSH_ISLAND_NAV_TEST__?.getState() ?? null,
        )
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
