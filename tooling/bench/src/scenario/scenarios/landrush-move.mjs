import {
  benchmarkParams,
  restoreLandrushBenchmarkFixture,
  scenarioDurationMs,
  waitForWorldLayout,
} from '../scenario-utils.mjs'

export default {
  name: 'landrush-move',
  fixture: 'outside',
  urlParams: () => benchmarkParams('outside'),
  async prepare({ bridge, page }) {
    await waitForWorldLayout(page)
    await restoreLandrushBenchmarkFixture(page, bridge)
  },
  async execute({ input, minutes, mark, sleep }) {
    await mark('move-start')
    await input.keyDown('w', { intent: 'walk forward' })
    await input.keyDown('a', { intent: 'curve while walking' })
    try {
      await sleep(scenarioDurationMs(minutes))
    } finally {
      await input.keyUp('a', { intent: 'stop curving' })
      await input.keyUp('w', { intent: 'stop walking' })
    }
    await mark('move-end')
  },
}
