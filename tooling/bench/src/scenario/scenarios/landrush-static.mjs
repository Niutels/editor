import {
  benchmarkParams,
  restoreLandrushBenchmarkFixture,
  scenarioDurationMs,
  waitForWorldLayout,
} from '../scenario-utils.mjs'

export default {
  name: 'landrush-static',
  fixture: 'outside',
  urlParams: ({ args = {} } = {}) => {
    const params = new URLSearchParams(benchmarkParams('outside'))
    if (args['no-stylized-blades'] === true) params.set('profileNoStylizedBlades', '1')
    if (args['no-stylized-ground'] === true) params.set('profileNoStylizedGround', '1')
    if (args['no-land-layers'] === true) params.set('profileNoLandLayers', '1')
    if (args['disable-shadows'] === true) params.set('disable', 'shadows')
    return params.toString()
  },
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
