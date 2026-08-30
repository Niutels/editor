import assert from 'node:assert/strict'
import test from 'node:test'
import { formatAtomicRenderScale, summarizeAtomicRenderScale } from './atomic-render-scale.mjs'

const VARIANTS = ['baseline', 'trace', 'v8', 'scoped', 'gpu']

function captures(rendererDpr = 0.7) {
  return Object.fromEntries(
    VARIANTS.map((variant) => [
      variant,
      {
        bridge: {
          after: { dpr: 1, rendererDpr },
          before: { dpr: 1, rendererDpr },
        },
      },
    ]),
  )
}

test('summarizes stable device and renderer DPR across atomic variants', () => {
  const summary = summarizeAtomicRenderScale(captures(), VARIANTS)
  assert.deepEqual(summary, {
    deviceDpr: 1,
    rendererDpr: 0.7,
    stableAcrossVariants: true,
  })
  assert.equal(
    formatAtomicRenderScale(summary),
    'device DPR 1.00; internal 3D renderer DPR 0.70',
  )
})

test('rejects a renderer DPR change between atomic variants', () => {
  const values = captures()
  values.gpu.bridge.after.rendererDpr = 0.8
  assert.throws(
    () => summarizeAtomicRenderScale(values, VARIANTS),
    /renderer DPR is not stable across atomic captures/u,
  )
})

test('keeps legacy captures rebuildable without inventing a renderer DPR', () => {
  const values = captures()
  for (const value of Object.values(values)) {
    delete value.bridge.before.rendererDpr
    delete value.bridge.after.rendererDpr
  }
  assert.deepEqual(summarizeAtomicRenderScale(values, VARIANTS), {
    deviceDpr: 1,
    rendererDpr: null,
    stableAcrossVariants: null,
  })
})
