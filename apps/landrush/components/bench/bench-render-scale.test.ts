import { describe, expect, test } from 'bun:test'
import { readBenchRenderScale } from './bench-render-scale'

describe('benchmark render scale metadata', () => {
  test('keeps the legacy DPR as device DPR and reports the renderer DPR separately', () => {
    let reads = 0
    const metadata = readBenchRenderScale(
      {
        getPixelRatio: () => {
          reads += 1
          return 0.7
        },
      },
      1,
    )

    expect(metadata).toEqual({ dpr: 1, rendererDpr: 0.7 })
    expect(reads).toBe(1)
  })
})
