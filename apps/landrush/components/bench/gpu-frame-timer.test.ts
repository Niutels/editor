import { describe, expect, test } from 'bun:test'
import { createGpuFrameTimer } from './gpu-frame-timer'

type FakePool = {
  trackTimestamp: boolean
  currentQueryIndex: number
  queryOffsets: Map<string, number>
  timestamps: Map<string, number>
  frames: number[]
}

function fakePool(entries: [uid: string, ms: number][]): FakePool {
  return {
    trackTimestamp: true,
    currentQueryIndex: entries.length * 2,
    queryOffsets: new Map(entries.map(([uid], index) => [uid, index * 2])),
    timestamps: new Map(),
    frames: [],
  }
}

function resolveFakePool(pool: FakePool, durations: Map<string, number>) {
  const uids = [...pool.queryOffsets.keys()]
  pool.currentQueryIndex = 0
  pool.queryOffsets.clear()
  pool.frames = [...new Set(uids.map((uid) => Number(uid.match(/:f(\d+)$/u)?.[1])))]
  for (const uid of uids) pool.timestamps.set(uid, durations.get(uid) ?? Number.NaN)
  const lastFrame = pool.frames.at(-1)
  return uids.reduce(
    (total, uid) =>
      Number(uid.match(/:f(\d+)$/u)?.[1]) === lastFrame ? total + (durations.get(uid) ?? 0) : total,
    0,
  )
}

describe('createGpuFrameTimer', () => {
  test('captures exact render and compute UID batches while preserving last-frame totals', async () => {
    const durations = new Map([
      ['r:1:main:f41', 12],
      ['r:2:post:f41', 3],
      ['r:1:main:f42', 20],
      ['c:1:simulation:f42', 4],
    ])
    const renderPool = fakePool([...durations].filter(([uid]) => uid.startsWith('r:')))
    const computePool = fakePool([...durations].filter(([uid]) => uid.startsWith('c:')))
    const backend = {
      trackTimestamp: false,
      timestampQueryPool: { render: renderPool, compute: computePool },
    }
    const renderer = {
      backend,
      hasFeature: (name: string) => name === 'timestamp-query',
      resolveTimestampsAsync: async (type: 'render' | 'compute') =>
        resolveFakePool(type === 'render' ? renderPool : computePool, durations),
    }

    const timer = createGpuFrameTimer(renderer)
    timer.sample(17)
    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(timer.latest()).toEqual({
      resolvedAtFrame: 17,
      threeFrames: [41, 42],
      renderFrames: [41, 42],
      computeFrames: [42],
      renderStatus: 'measured',
      computeStatus: 'measured',
      renderMs: 20,
      computeMs: 4,
      passes: [
        { uid: 'r:1:main:f41', ms: 12 },
        { uid: 'r:2:post:f41', ms: 3 },
        { uid: 'r:1:main:f42', ms: 20 },
        { uid: 'c:1:simulation:f42', ms: 4 },
      ],
      passCount: 4,
      queryPressure: 8,
    })
    expect(renderPool.timestamps.size).toBe(0)
    expect(computePool.timestamps.size).toBe(0)

    timer.dispose()
    expect(backend.trackTimestamp).toBe(false)
  })

  test('distinguishes an observed batch with no compute queries from failed timing', async () => {
    const durations = new Map([['r:1:main:f51', 8]])
    const renderPool = fakePool([...durations])
    const backend = {
      trackTimestamp: false,
      timestampQueryPool: { render: renderPool },
    }
    const timer = createGpuFrameTimer({
      backend,
      hasFeature: () => true,
      resolveTimestampsAsync: async () => resolveFakePool(renderPool, durations),
    })

    timer.sample(23)
    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(timer.latest()?.renderStatus).toBe('measured')
    expect(timer.latest()?.computeStatus).toBe('no-queries')
    expect(timer.latest()?.computeMs).toBeNull()
    timer.dispose()
  })
})
