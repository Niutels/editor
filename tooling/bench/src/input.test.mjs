import assert from 'node:assert/strict'
import test from 'node:test'
import { InputDriver } from './input.mjs'

function createDriver(send) {
  const calls = []
  const trace = []
  return {
    calls,
    driver: new InputDriver({
      cdp: {
        async send(method, params) {
          calls.push({ method, params })
          return send?.(method, params)
        },
      },
      rng: () => 0.5,
      trace: { write: (entry) => trace.push(entry) },
    }),
    trace,
  }
}

test('tracks held keys and mouse buttons and releases every input', async () => {
  const { calls, driver } = createDriver()

  await driver.keyDown('shift')
  await driver.keyDown('w')
  await driver.mouseDown(120, 180, { moveDurationMs: 0 })
  await driver.movePath(150, 200, { durationMs: 0, steps: 2 })

  assert.deepEqual(driver.getHeldInput(), {
    keys: ['shift', 'w'],
    mouseButtons: ['left'],
  })
  const heldMove = calls.findLast(
    ({ method, params }) => method === 'Input.dispatchMouseEvent' && params.type === 'mouseMoved',
  )
  assert.equal(heldMove.params.buttons, 1)

  const result = await driver.releaseAll()

  assert.deepEqual(result.errors, [])
  assert.deepEqual(result.releasedMouseButtons, ['left'])
  assert.deepEqual(result.releasedKeys, ['w', 'shift'])
  assert.deepEqual(driver.getHeldInput(), { keys: [], mouseButtons: [] })
})

test('releaseAll continues after dispatch failures and leaves failed inputs available to retry', async () => {
  const failedOnce = new Set()
  const { calls, driver } = createDriver((method, params) => {
    const id =
      method === 'Input.dispatchMouseEvent' && params.type === 'mouseReleased'
        ? 'mouse:left'
        : method === 'Input.dispatchKeyEvent' && params.type === 'keyUp' && params.code === 'KeyW'
          ? 'key:w'
          : null
    if (id && !failedOnce.has(id)) {
      failedOnce.add(id)
      throw new Error(`transient ${id}`)
    }
  })

  await driver.keyDown('shift')
  await driver.keyDown('w')
  await driver.mouseDown(100, 100, { moveDurationMs: 0 })
  const first = await driver.releaseAll()

  assert.deepEqual(first.errors.map(({ input }) => input).sort(), ['key:w', 'mouse:left'])
  assert.deepEqual(driver.getHeldInput(), { keys: ['w'], mouseButtons: ['left'] })
  assert.ok(
    calls.some(
      ({ method, params }) =>
        method === 'Input.dispatchKeyEvent' &&
        params.type === 'keyUp' &&
        params.code === 'ShiftLeft',
    ),
  )

  const second = await driver.releaseAll()
  assert.deepEqual(second.errors, [])
  assert.deepEqual(driver.getHeldInput(), { keys: [], mouseButtons: [] })
})

test('dragPath releases its mouse hold when movement dispatch fails', async () => {
  let pressed = false
  let failed = false
  const { calls, driver } = createDriver((method, params) => {
    if (method !== 'Input.dispatchMouseEvent') return
    if (params.type === 'mousePressed') pressed = true
    if (pressed && params.type === 'mouseMoved' && !failed) {
      failed = true
      throw new Error('movement failed')
    }
  })

  await assert.rejects(driver.dragPath(80, 90, 220, 240, { durationMs: 0 }), /movement failed/)

  assert.deepEqual(driver.getHeldInput(), { keys: [], mouseButtons: [] })
  assert.ok(
    calls.some(
      ({ method, params }) =>
        method === 'Input.dispatchMouseEvent' && params.type === 'mouseReleased',
    ),
  )
})

test('failed keyDown is never registered as held', async () => {
  const { driver } = createDriver((method, params) => {
    if (method === 'Input.dispatchKeyEvent' && params.type === 'keyDown') {
      throw new Error('key dispatch failed')
    }
  })

  await assert.rejects(driver.keyDown('w'), /key dispatch failed/)
  assert.deepEqual(driver.getHeldInput(), { keys: [], mouseButtons: [] })
})
