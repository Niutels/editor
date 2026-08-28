import { describe, expect, test } from 'bun:test'
import {
  applyZombieEscapeGeneratedAssetSettlementReport,
  beginZombieEscapeGeneratedAssetRetry,
  createZombieEscapeGeneratedAssetRetryState,
  resolveZombieEscapeGeneratedAssetAutoRetryPlan,
} from './zombie-escape-generated-asset-retry'

describe('Zombie Escape generated asset retry isolation', () => {
  test('retries a failed cosmetic domain without advancing or consuming the core retry budget', () => {
    const failed = applyZombieEscapeGeneratedAssetSettlementReport(
      createZombieEscapeGeneratedAssetRetryState(),
      {
        failures: [{ key: 'zombie:dockworker', message: 'HTTP 503' }],
        pendingKeys: [],
      },
    )
    expect(resolveZombieEscapeGeneratedAssetAutoRetryPlan(failed, 'core')).toBeNull()
    expect(resolveZombieEscapeGeneratedAssetAutoRetryPlan(failed, 'cosmetic')).toEqual({
      delayMs: 650,
      failures: [{ key: 'zombie:dockworker', message: 'HTTP 503' }],
    })

    const retrying = beginZombieEscapeGeneratedAssetRetry(
      failed,
      failed.failures,
      'automatic',
    )
    expect(retrying.generations).toEqual({ core: 0, cosmetic: 1 })
    expect(retrying.attempts).toEqual({ core: 0, cosmetic: 1 })
    expect(retrying.retrying).toEqual({ core: false, cosmetic: true })

    const pending = applyZombieEscapeGeneratedAssetSettlementReport(retrying, {
      failures: [],
      pendingKeys: ['zombie:dockworker'],
    })
    expect(pending.failures).toEqual(failed.failures)
    expect(pending.retrying.cosmetic).toBe(true)
    expect(pending.generations.core).toBe(0)

    const recovered = applyZombieEscapeGeneratedAssetSettlementReport(pending, {
      failures: [],
      pendingKeys: [],
    })
    expect(recovered.failures).toEqual([])
    expect(recovered.attempts).toEqual({ core: 0, cosmetic: 0 })
    expect(recovered.retrying).toEqual({ core: false, cosmetic: false })
  })

  test('retains two bounded automatic retries for a core weapon independently of cosmetics', () => {
    let state = applyZombieEscapeGeneratedAssetSettlementReport(
      createZombieEscapeGeneratedAssetRetryState(),
      {
        failures: [{ key: 'weapon:/generated/pistol.glb', message: 'network failed' }],
        pendingKeys: [],
      },
    )

    expect(resolveZombieEscapeGeneratedAssetAutoRetryPlan(state, 'core')?.delayMs).toBe(650)
    state = beginZombieEscapeGeneratedAssetRetry(state, state.failures, 'automatic')
    state = applyZombieEscapeGeneratedAssetSettlementReport(state, {
      failures: [{ key: 'weapon:/generated/pistol.glb', message: 'network failed again' }],
      pendingKeys: [],
    })
    expect(resolveZombieEscapeGeneratedAssetAutoRetryPlan(state, 'core')?.delayMs).toBe(1_300)
    state = beginZombieEscapeGeneratedAssetRetry(state, state.failures, 'automatic')
    state = applyZombieEscapeGeneratedAssetSettlementReport(state, {
      failures: [{ key: 'weapon:/generated/pistol.glb', message: 'still unavailable' }],
      pendingKeys: [],
    })

    expect(resolveZombieEscapeGeneratedAssetAutoRetryPlan(state, 'core')).toBeNull()
    expect(state.generations).toEqual({ core: 2, cosmetic: 0 })
    expect(state.attempts).toEqual({ core: 2, cosmetic: 0 })
  })

  test('advances both domains only when one retry request contains both failure classes', () => {
    const initial = createZombieEscapeGeneratedAssetRetryState()
    const next = beginZombieEscapeGeneratedAssetRetry(
      initial,
      [
        { key: 'weapon:/generated/pistol.glb', message: 'weapon failed' },
        { key: 'zombie:dockworker', message: 'zombie failed' },
      ],
      'manual',
    )
    expect(next.generations).toEqual({ core: 1, cosmetic: 1 })
    expect(next.retrying).toEqual({ core: true, cosmetic: true })
  })
})
