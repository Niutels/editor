// Camera-load baseline: the page's own ?benchmark=1 auto-orbit drives a steady
// camera sweep with zero input dependencies. The cleanest scenario for
// measuring, calibrating overhead, and regression baselines.

export default {
  name: 'orbit-sweep',
  urlParams: () => 'benchmark=1',
  async execute({ minutes, mark, sleep, log }) {
    const totalMs = minutes * 60_000
    const stepMs = 15_000
    const t0 = Date.now()
    let step = 0
    while (Date.now() - t0 < totalMs) {
      await sleep(Math.min(stepMs, totalMs - (Date.now() - t0)))
      step += 1
      await mark(`orbit-${step}`)
      log(`orbit sweep ${Math.round((100 * (Date.now() - t0)) / totalMs)}%`)
    }
  },
}
