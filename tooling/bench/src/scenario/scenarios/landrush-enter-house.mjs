import {
  benchmarkParams,
  readFloorVisibility,
  scenarioDurationMs,
  waitForWorldLayout,
} from '../scenario-utils.mjs'

export default {
  name: 'landrush-enter-house',
  urlParams: () => benchmarkParams('outside'),
  prepare: ({ page }) => waitForWorldLayout(page),
  async execute({ input, minutes, mark, page, sleep, trace }) {
    const durationMs = scenarioDurationMs(minutes)
    const startedAt = Date.now()
    const initialFloor = await readFloorVisibility(page)
    if (initialFloor?.insideBuilding) {
      throw new Error('enter-house benchmark started inside a building')
    }

    await mark('enter-house-start')
    await input.keyDown('w', { intent: 'cross parcel-11 wall boundary' })
    let enteredAt = null
    try {
      while (Date.now() - startedAt < durationMs) {
        const floor = await readFloorVisibility(page)
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
    } finally {
      await input.keyUp('w', { intent: 'stop after crossing wall boundary' })
    }

    if (enteredAt === null) throw new Error('player never entered the captured house')
    await mark('entered-house')
    const remainingMs = durationMs - (Date.now() - startedAt)
    if (remainingMs > 0) await sleep(remainingMs)
    await mark('enter-house-end')
  },
}
