import { describe, expect, test } from 'bun:test'
import type { ProfileMoneyOperationRequest } from '@landrush/runtime'
import { createZombieEscapeSimulation } from '@landrush/zombie-gameplay/zombie-escape-simulation'
import { createZombieEscapeArena } from '@landrush/zombie-gameplay/zombie-escape-world'
import {
  applyLandrushZombieEscapeProfileMoneyOperations,
  hydrateLandrushZombieEscapeProfileMoney,
  resolveLandrushZombieEscapeDeathAction,
  shouldAttemptLandrushZombieEscapeDeathReport,
} from './landrush-zombie-escape-session'

describe('Landrush Zombie Escape session state', () => {
  test('submits purchase and kill operations and adopts each synchronous projection', () => {
    const simulation = createZombieEscapeSimulation(createZombieEscapeArena(91), 92)
    simulation.money = 80
    simulation.kills = 4
    simulation.weaponPurchaseCount = 1
    const operations: ProfileMoneyOperationRequest[] = []
    const projections = [60, 70, 80]

    applyLandrushZombieEscapeProfileMoneyOperations({
      checkpoint: { kills: 2, money: 110, purchaseCost: 50, weaponPurchaseCount: 0 },
      onOperation: (operation) => {
        operations.push(operation)
        return projections.shift() ?? null
      },
      simulation,
    })

    expect(operations).toEqual([
      { cost: 50, kind: 'weapon-purchase' },
      { kind: 'zombie-kill-reward' },
      { kind: 'zombie-kill-reward' },
    ])
    expect(simulation.money).toBe(80)
  })

  test('hydrates finite profile balances without accepting invalid values', () => {
    const simulation = createZombieEscapeSimulation(createZombieEscapeArena(93), 94)
    expect(hydrateLandrushZombieEscapeProfileMoney(simulation, 275)).toBe(true)
    expect(simulation.money).toBe(275)
    expect(hydrateLandrushZombieEscapeProfileMoney(simulation, Number.NaN)).toBe(false)
    expect(simulation.money).toBe(275)
  })

  test('routes only offline death to local build and online canonical death to the server', () => {
    expect(
      resolveLandrushZombieEscapeDeathAction({ clockMode: 'offline-local', status: 'lost' }),
    ).toBe('enter-build')
    expect(
      resolveLandrushZombieEscapeDeathAction({ clockMode: 'online-canonical', status: 'lost' }),
    ).toBe('report-death')
    expect(
      resolveLandrushZombieEscapeDeathAction({ clockMode: 'online-waiting', status: 'lost' }),
    ).toBe('none')
    expect(
      resolveLandrushZombieEscapeDeathAction({ clockMode: 'online-canonical', status: 'won' }),
    ).toBe('none')
  })

  test('retries only an unacknowledged online death after the bounded delay', () => {
    expect(
      shouldAttemptLandrushZombieEscapeDeathReport({
        clockMode: 'online-canonical',
        nextAttemptAtSeconds: 4,
        nowSeconds: 4,
        reported: false,
        status: 'lost',
      }),
    ).toBe(true)
    expect(
      shouldAttemptLandrushZombieEscapeDeathReport({
        clockMode: 'online-canonical',
        nextAttemptAtSeconds: 4,
        nowSeconds: 3.99,
        reported: false,
        status: 'lost',
      }),
    ).toBe(false)
    expect(
      shouldAttemptLandrushZombieEscapeDeathReport({
        clockMode: 'online-canonical',
        nextAttemptAtSeconds: 4,
        nowSeconds: 5,
        reported: true,
        status: 'lost',
      }),
    ).toBe(false)
  })
})
