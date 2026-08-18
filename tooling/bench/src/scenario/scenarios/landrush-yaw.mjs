import {
  benchmarkParams,
  scenarioDurationMs,
  waitForWorldLayout,
} from '../scenario-utils.mjs'

export default {
  name: 'landrush-yaw',
  urlParams: () => benchmarkParams('outside'),
  prepare: ({ page }) => waitForWorldLayout(page),
  async execute({ input, minutes, mark, sleep }) {
    await mark('yaw-start')
    await input.keyDown('e', { intent: 'yaw camera clockwise' })
    try {
      await sleep(scenarioDurationMs(minutes))
    } finally {
      await input.keyUp('e', { intent: 'stop camera yaw' })
    }
    await mark('yaw-end')
  },
}
