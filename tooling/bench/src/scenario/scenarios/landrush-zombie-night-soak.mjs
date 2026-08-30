import { scenarioDurationMs, waitForSceneNodes } from '../scenario-utils.mjs'

const POLL_MS = 350
const REQUIRED_STABLE_SAMPLES = 4
let preparePass = 0

async function readState(page, bridge) {
  const state = await page.evaluate(() => {
    const zombie = window.__LANDRUSH_ZOMBIE_ESCAPE__
    return {
      activeTargets: zombie?.targets?.active ?? null,
      integratedIntoExistingCanvas: zombie?.integratedIntoExistingCanvas ?? false,
      night: zombie?.night ?? null,
      phase: zombie?.phase ?? null,
      phaseReady: zombie?.phaseReady ?? false,
      phaseSecondsRemaining: zombie?.phaseSecondsRemaining ?? null,
      roomSoak: zombie?.benchmarkRoomSoak ?? null,
      status: zombie?.status ?? null,
    }
  })
  return { ...state, frameIdx: (await bridge.beacon()).beacon?.frameIdx ?? null }
}

function stateIssues(state) {
  const issues = []
  if (state.integratedIntoExistingCanvas !== true) issues.push('not integrated into existing canvas')
  if (state.phase !== 'night') issues.push(`phase=${String(state.phase)}`)
  if (state.phaseReady !== true) issues.push(`phaseReady=${String(state.phaseReady)}`)
  if (state.status !== 'playing') issues.push(`status=${String(state.status)}`)
  if (!Number.isInteger(state.night) || state.night < 1) issues.push(`night=${String(state.night)}`)
  if (!Number.isFinite(state.activeTargets) || state.activeTargets < 1) {
    issues.push(`activeTargets=${String(state.activeTargets)}`)
  }
  if (!Number.isInteger(state.frameIdx)) issues.push(`frameIdx=${String(state.frameIdx)}`)
  return issues
}

async function waitForNight(page, bridge, sleep, timeoutMs = 240_000) {
  const startedAt = Date.now()
  let stableSamples = 0
  let last = null
  let lastIssues = []
  while (Date.now() - startedAt < timeoutMs) {
    last = await readState(page, bridge)
    lastIssues = stateIssues(last)
    stableSamples = lastIssues.length === 0 ? stableSamples + 1 : 0
    if (stableSamples >= REQUIRED_STABLE_SAMPLES) return last
    await sleep(POLL_MS)
  }
  throw new Error(`zombie night did not settle (${lastIssues.join('; ')}, last=${JSON.stringify(last)})`)
}

async function startNight(page) {
  const selector = '[data-testid="landrush-zombie-escape-build-countdown"]'
  await page.waitForFunction(
    (buttonSelector) => {
      const button = document.querySelector(buttonSelector)
      return button instanceof HTMLButtonElement && !button.disabled
    },
    selector,
    { timeout: 240_000 },
  )
  await page.click(selector)
}

export default {
  name: 'landrush-zombie-night-soak',
  fixture: 'outside',
  urlParams: ({ args = {} } = {}) => {
    const params = new URLSearchParams({
      benchmarkReport: 'outside',
      game: 'zombie-escape',
      landrushZombieRoomSoak: '1',
    })
    if (typeof args.disable === 'string' && args.disable.length > 0) {
      params.set('disable', args.disable)
    }
    return params.toString()
  },
  async prepare({ args = {}, bridge, page, sleep }) {
    if (preparePass === 0) {
      await waitForSceneNodes(bridge, 1)
      preparePass = 1
      return
    }
    if (args['start-night'] === true) await startNight(page)
    await waitForNight(page, bridge, sleep)
    const soak = await page.evaluate(() => window.__LANDRUSH_ZOMBIE_ESCAPE_ROOM_SOAK__?.begin())
    if (!soak?.active || !soak.phaseHeld || !soak.playerProtected) {
      throw new Error(`zombie night soak did not activate (${JSON.stringify(soak)})`)
    }
    await waitForNight(page, bridge, sleep)
  },
  async execute({ bridge, mark, minutes, page, sleep, trace }) {
    const initial = await readState(page, bridge)
    const initialIssues = stateIssues(initial)
    if (initialIssues.length > 0) throw new Error(`invalid initial state: ${initialIssues.join('; ')}`)
    trace.write({ kind: 'validation', name: 'zombie-night-soak-initial', state: initial, t: performance.now() })
    try {
      await mark('zombie-night-soak-start')
      await sleep(scenarioDurationMs(minutes))
      await mark('zombie-night-soak-end')
      const final = await readState(page, bridge)
      const issues = stateIssues(final)
      if (final.night !== initial.night) issues.push(`night changed ${initial.night} -> ${final.night}`)
      if (!final.roomSoak?.active || !final.roomSoak.phaseHeld) issues.push('room soak stopped')
      trace.write({ issues, kind: 'validation', name: 'zombie-night-soak-final', state: final, t: performance.now() })
      if (issues.length > 0) throw new Error(`invalid final state: ${issues.join('; ')}`)
    } finally {
      await page.evaluate(() => window.__LANDRUSH_ZOMBIE_ESCAPE_ROOM_SOAK__?.end())
    }
  },
}
