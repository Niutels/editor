import {
  benchmarkParams,
  restoreLandrushBenchmarkFixture,
  scenarioDurationMs,
  waitForWorldLayout,
} from '../scenario-utils.mjs'

export default {
  name: 'landrush-static',
  fixture: 'outside',
  urlParams: () => benchmarkParams('outside'),
  async prepare({ bridge, page }) {
    await waitForWorldLayout(page)
    await restoreLandrushBenchmarkFixture(page, bridge)
  },
  async execute({ minutes, mark, sleep }) {
    await mark('static-start')
    await sleep(scenarioDurationMs(minutes))
    await mark('static-end')
  },
}
