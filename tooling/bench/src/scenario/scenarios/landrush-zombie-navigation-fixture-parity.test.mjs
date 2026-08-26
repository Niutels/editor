import assert from 'node:assert/strict'
import { test } from 'node:test'
import scenario, {
  isLandrushZombieNavigationFixtureCaptureRequested,
  isLandrushZombieNavigationFullParityRequested,
} from './landrush-zombie-navigation-fixture-parity.mjs'

test('defaults to a stripped browser smoke and enables the heavy proof only explicitly', () => {
  assert.equal(scenario.fixture, 'zombie-navigation-real-island')
  assert.equal(isLandrushZombieNavigationFullParityRequested({}), false)
  assert.equal(isLandrushZombieNavigationFullParityRequested({ 'full-parity': '1' }), true)
  assert.equal(isLandrushZombieNavigationFixtureCaptureRequested({}), false)
  assert.equal(isLandrushZombieNavigationFixtureCaptureRequested({ 'capture-fixture': true }), true)

  const smokeParams = new URLSearchParams(scenario.urlParams({ args: {} }))
  assert.equal(smokeParams.get('landrushNavDebug'), '1')
  assert.equal(smokeParams.get('landrushNavFixtureCapture'), '1')
  assert.equal(smokeParams.get('landrushNavScaleProof'), null)

  const fullParams = new URLSearchParams(
    scenario.urlParams({ args: { 'full-parity': '1' } }),
  )
  assert.equal(fullParams.get('landrushNavFixtureCapture'), '1')
  assert.equal(fullParams.get('landrushNavScaleProof'), '1')
})
