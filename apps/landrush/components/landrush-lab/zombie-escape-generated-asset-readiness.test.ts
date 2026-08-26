import { describe, expect, test } from 'bun:test'
import {
  resolveZombieEscapeGeneratedAssetReadinessSnapshot,
  resolveZombieEscapeGeneratedAssetSettlement,
  tryCreateZombieEscapeGeneratedAsset,
  type ZombieEscapeGeneratedAssetTerminalStatus,
} from './zombie-escape-generated-asset-readiness'

describe('Zombie Escape generated asset readiness', () => {
  test('converts a throwing visual clone factory into an explicit retryable failure', () => {
    const result = tryCreateZombieEscapeGeneratedAsset(() => {
      throw new Error('cloneSkeleton rejected malformed rig')
    })

    expect(result).toEqual({
      message: 'cloneSkeleton rejected malformed rig',
      ok: false,
    })
  })

  test('contains animation activation and update failures at the asset-frame boundary', () => {
    for (const message of ['AnimationAction.play failed', 'AnimationMixer.update failed']) {
      expect(
        tryCreateZombieEscapeGeneratedAsset(() => {
          throw new Error(message)
        }),
      ).toEqual({ message, ok: false })
    }
  })

  test('requires every unique catalog slot to reach a terminal status', () => {
    const statuses = new Map<string, ZombieEscapeGeneratedAssetTerminalStatus>([
      ['weapon:pistol', { state: 'ready' }],
      ['zombie:dockworker', { state: 'ready' }],
    ])
    expect(
      resolveZombieEscapeGeneratedAssetSettlement(
        ['weapon:pistol', 'weapon:carbine', 'zombie:dockworker'],
        statuses,
      ),
    ).toEqual({
      failed: [],
      pending: ['weapon:carbine'],
      ready: false,
      settled: false,
    })
  })

  test('keeps failures explicit instead of silently declaring degraded content ready', () => {
    const statuses = new Map<string, ZombieEscapeGeneratedAssetTerminalStatus>([
      ['weapon:pistol', { state: 'ready' }],
      ['zombie:dockworker', { message: 'HTTP 503', state: 'failed' }],
    ])
    expect(
      resolveZombieEscapeGeneratedAssetSettlement(['weapon:pistol', 'zombie:dockworker'], statuses),
    ).toEqual({
      failed: [{ key: 'zombie:dockworker', message: 'HTTP 503' }],
      pending: [],
      ready: false,
      settled: true,
    })
  })

  test('returns ready only after every expected slot succeeds', () => {
    const statuses = new Map<string, ZombieEscapeGeneratedAssetTerminalStatus>([
      ['weapon:pistol', { state: 'ready' }],
      ['zombie:dockworker', { state: 'ready' }],
    ])
    expect(
      resolveZombieEscapeGeneratedAssetSettlement(['weapon:pistol', 'zombie:dockworker'], statuses)
        .ready,
    ).toBe(true)
  })

  test('reports stable catalog-ordered task keys and terminal progress', () => {
    const statuses = new Map<string, ZombieEscapeGeneratedAssetTerminalStatus>([
      ['zombie:dockworker', { message: 'HTTP 503', state: 'failed' }],
      ['weapon:pistol', { state: 'ready' }],
      ['unexpected:asset', { state: 'ready' }],
    ])

    expect(
      resolveZombieEscapeGeneratedAssetReadinessSnapshot({
        expectedKeys: ['weapon:pistol', 'weapon:carbine', 'zombie:dockworker', 'weapon:pistol'],
        generation: 4,
        pipelineReady: true,
        statuses,
      }),
    ).toEqual({
      allocationReady: false,
      completed: 2,
      expectedKeys: ['weapon:pistol', 'weapon:carbine', 'zombie:dockworker'],
      generation: 4,
      pipelineReady: true,
      ready: false,
      readyKeys: ['weapon:pistol'],
      settledKeys: ['weapon:pistol', 'zombie:dockworker'],
      total: 3,
    })
  })

  test('keeps successful allocation distinct from render-pipeline readiness', () => {
    const statuses = new Map<string, ZombieEscapeGeneratedAssetTerminalStatus>([
      ['weapon:pistol', { state: 'ready' }],
      ['zombie:dockworker', { state: 'ready' }],
    ])
    const resolve = (pipelineReady: boolean) =>
      resolveZombieEscapeGeneratedAssetReadinessSnapshot({
        expectedKeys: ['weapon:pistol', 'zombie:dockworker'],
        generation: 9,
        pipelineReady,
        statuses,
      })

    expect(resolve(false)).toMatchObject({
      allocationReady: true,
      completed: 2,
      pipelineReady: false,
      ready: false,
    })
    expect(resolve(true)).toMatchObject({
      allocationReady: true,
      completed: 2,
      pipelineReady: true,
      ready: true,
    })
  })
})
