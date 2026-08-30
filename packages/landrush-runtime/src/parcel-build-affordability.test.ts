import { describe, expect, test } from 'bun:test'
import type { ParcelBuildNode } from '@landrush/protocol'
import {
  calculateParcelBuildReservationCost,
  projectProfileMoneyBalanceAfterBuildReservations,
  resolveParcelBuildNodesQuote,
} from './world-multiplayer-client'

const item = (id: string) => ({ id, type: 'item' }) satisfies ParcelBuildNode
const wall = (id: string, length: number) =>
  ({
    end: [length, 0],
    id,
    start: [0, 0],
    type: 'wall',
  }) as ParcelBuildNode

describe('parcel build affordability', () => {
  test('reserves the authoritative-to-in-flight and replacement-pending legs exactly', () => {
    expect(
      calculateParcelBuildReservationCost({
        authoritativeNodes: [],
        inFlightNodes: [item('item-a')],
        pendingNodes: [item('item-a'), wall('wall-a', 1)],
      }),
    ).toEqual({ cost: 60, ok: true })
  })

  test('quotes only the net new reservation and admits an exact-balance placement', () => {
    expect(
      resolveParcelBuildNodesQuote({
        authorityKnown: true,
        existingPendingBuildCost: 50,
        newPendingBuildCost: 60,
        pricingFailure: null,
        profileBalanceBeforeBuildReservations: 60,
        profileMoneyFresh: true,
      }),
    ).toEqual({
      allowed: true,
      availableBalance: 10,
      cost: 10,
      existingPendingBuildCost: 50,
      newPendingBuildCost: 60,
      reason: null,
      remainingBalance: 0,
    })
  })

  test('denies a second rapid paid commit against the first commit reservation', () => {
    expect(
      resolveParcelBuildNodesQuote({
        authorityKnown: true,
        existingPendingBuildCost: 10,
        newPendingBuildCost: 20,
        pricingFailure: null,
        profileBalanceBeforeBuildReservations: 10,
        profileMoneyFresh: true,
      }),
    ).toEqual({
      allowed: false,
      availableBalance: 0,
      cost: 10,
      existingPendingBuildCost: 10,
      newPendingBuildCost: 20,
      reason: 'insufficient-funds',
      remainingBalance: null,
    })
  })

  test('allows a non-increasing replacement while stale but rejects a new paid reservation', () => {
    expect(
      resolveParcelBuildNodesQuote({
        authorityKnown: true,
        existingPendingBuildCost: 50,
        newPendingBuildCost: 10,
        pricingFailure: null,
        profileBalanceBeforeBuildReservations: 50,
        profileMoneyFresh: false,
      }),
    ).toMatchObject({ allowed: true, cost: 0, reason: null, remainingBalance: 40 })
    expect(
      resolveParcelBuildNodesQuote({
        authorityKnown: true,
        existingPendingBuildCost: 0,
        newPendingBuildCost: 10,
        pricingFailure: null,
        profileBalanceBeforeBuildReservations: 50,
        profileMoneyFresh: false,
      }),
    ).toMatchObject({ allowed: false, cost: 10, reason: 'profile-money-stale' })
  })

  test('preserves the unmetered offline quote without a wallet', () => {
    expect(
      resolveParcelBuildNodesQuote({
        authorityKnown: true,
        existingPendingBuildCost: 0,
        newPendingBuildCost: 0,
        pricingFailure: null,
        profileBalanceBeforeBuildReservations: null,
        profileMoneyFresh: false,
      }),
    ).toMatchObject({
      allowed: true,
      availableBalance: null,
      cost: 0,
      reason: null,
      remainingBalance: null,
    })
  })

  test('fails closed for unknown authority and unpriced proposals', () => {
    expect(
      resolveParcelBuildNodesQuote({
        authorityKnown: false,
        existingPendingBuildCost: 0,
        newPendingBuildCost: 0,
        pricingFailure: null,
        profileBalanceBeforeBuildReservations: null,
        profileMoneyFresh: false,
      }).reason,
    ).toBe('build-authority-unavailable')
    expect(
      resolveParcelBuildNodesQuote({
        authorityKnown: true,
        existingPendingBuildCost: 0,
        newPendingBuildCost: null,
        pricingFailure: 'unpriced-build-node',
        profileBalanceBeforeBuildReservations: 100,
        profileMoneyFresh: true,
      }).reason,
    ).toBe('unpriced-build-node')
  })

  test('subtracts exact pending build reservations from the projected profile balance', () => {
    expect(projectProfileMoneyBalanceAfterBuildReservations(60, [], 60)).toBe(0)
    expect(projectProfileMoneyBalanceAfterBuildReservations(60, [], 61)).toBeNull()
  })
})
