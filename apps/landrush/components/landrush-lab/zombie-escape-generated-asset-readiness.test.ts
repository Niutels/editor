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
      pipelineCompleted: 1,
      pipelineMissingRepresentativeKeys: [],
      pipelineReady: true,
      pipelineTotal: 1,
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

  test('reports unique missing render representatives while exact pipeline admission is blocked', () => {
    const statuses = new Map<string, ZombieEscapeGeneratedAssetTerminalStatus>([
      ['weapon:pistol', { state: 'ready' }],
    ])

    expect(
      resolveZombieEscapeGeneratedAssetReadinessSnapshot({
        expectedKeys: ['weapon:pistol'],
        generation: 3,
        pipelineMissingRepresentativeKeys: [
          'effect:death-dust',
          'island:material-presentation:night',
          'effect:death-dust',
        ],
        pipelineReady: false,
        statuses,
      }),
    ).toMatchObject({
      allocationReady: true,
      pipelineMissingRepresentativeKeys: [
        'effect:death-dust',
        'island:material-presentation:night',
      ],
      pipelineReady: false,
      ready: false,
    })
  })

  test('normalizes pipeline progress to finite bounded integers without weakening readiness', () => {
    const statuses = new Map<string, ZombieEscapeGeneratedAssetTerminalStatus>([
      ['weapon:pistol', { state: 'ready' }],
    ])
    const resolve = (pipelineCompleted: number, pipelineTotal: number, pipelineReady = false) =>
      resolveZombieEscapeGeneratedAssetReadinessSnapshot({
        expectedKeys: ['weapon:pistol'],
        generation: 2,
        pipelineCompleted,
        pipelineReady,
        pipelineTotal,
        statuses,
      })

    expect(resolve(2.9, 4.8)).toMatchObject({
      pipelineCompleted: 2,
      pipelineReady: false,
      pipelineTotal: 4,
      ready: false,
    })
    expect(resolve(-4, 0)).toMatchObject({ pipelineCompleted: 0, pipelineTotal: 1 })
    expect(resolve(Number.NaN, Number.POSITIVE_INFINITY)).toMatchObject({
      pipelineCompleted: 0,
      pipelineTotal: 1,
    })
    expect(resolve(Number.MAX_VALUE, Number.MAX_VALUE)).toMatchObject({
      pipelineCompleted: Number.MAX_SAFE_INTEGER,
      pipelineTotal: Number.MAX_SAFE_INTEGER,
    })
    expect(resolve(0, 7, true)).toMatchObject({
      pipelineCompleted: 7,
      pipelineReady: true,
      pipelineTotal: 7,
      ready: true,
    })
  })
})
