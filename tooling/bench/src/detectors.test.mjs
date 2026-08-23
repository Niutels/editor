import assert from 'node:assert/strict'
import test from 'node:test'

import { attachPageCapture, BeaconWatchdog } from './detectors.mjs'

test('BeaconWatchdog stop joins the active polling loop before returning', async () => {
  let releaseEvaluate = () => {}
  let evaluateFinished = false
  const evaluateBlocked = new Promise((resolve) => {
    releaseEvaluate = () => {
      evaluateFinished = true
      resolve({ frameIdx: 1, visibility: 'visible' })
    }
  })
  const watchdog = new BeaconWatchdog({
    events: null,
    page: { evaluate: async () => evaluateBlocked },
    pollMs: 1_000,
    runDir: '.',
    startupGraceMs: 10_000,
  }).start()

  await new Promise((resolve) => setTimeout(resolve, 0))
  let stopFinished = false
  const stopping = watchdog.stop().then(() => {
    stopFinished = true
  })
  await new Promise((resolve) => setTimeout(resolve, 0))
  assert.equal(stopFinished, false)

  releaseEvaluate()
  await stopping
  assert.equal(evaluateFinished, true)
  assert.equal(stopFinished, true)
})

test('page capture detaches every writer-facing listener before artifacts close', async () => {
  const listeners = new Map()
  const page = {
    off(type, listener) {
      assert.equal(listeners.get(type), listener)
      listeners.delete(type)
    },
    on(type, listener) {
      listeners.set(type, listener)
    },
  }
  const events = []
  const capture = attachPageCapture(page, {
    write: (event) => events.push(event),
  })

  listeners.get('crash')()
  assert.equal(capture.crashed, true)
  assert.equal(events.length, 1)
  capture.dispose()
  capture.dispose()
  assert.equal(listeners.size, 0)
})
