import {
  benchmarkParams,
  scenarioDurationMs,
  waitForWorldLayout,
} from '../scenario-utils.mjs'

export default {
  name: 'landrush-static',
  urlParams: () => benchmarkParams('outside'),
  prepare: ({ page }) => waitForWorldLayout(page),
  async execute({ minutes, mark, sleep }) {
    await mark('static-start')
    await sleep(scenarioDurationMs(minutes))
    await mark('static-end')
  },
}
