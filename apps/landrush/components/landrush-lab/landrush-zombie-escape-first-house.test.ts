import { describe, expect, test } from 'bun:test'
import {
  resolveLandrushZombieEscapeFirstHouseBuildSatisfied,
  shouldRequestLandrushZombieEscapeClockInitialization,
} from './landrush-zombie-escape-first-house'

describe('Zombie Escape first-house clock gate', () => {
  test('keeps online UI locked until the server accepts and starts the canonical clock', () => {
    expect(
      resolveLandrushZombieEscapeFirstHouseBuildSatisfied({
        clockMode: 'online-canonical',
        offlineFirstHouseBuilt: true,
        phaseEndsAt: null,
      }),
    ).toBe(false)
    expect(
      resolveLandrushZombieEscapeFirstHouseBuildSatisfied({
        clockMode: 'online-canonical',
        offlineFirstHouseBuilt: false,
        phaseEndsAt: 20_000,
      }),
    ).toBe(true)
  })

  test('requests canonical initialization while held without using local house readiness', () => {
    expect(
      shouldRequestLandrushZombieEscapeClockInitialization({
        clockMode: 'online-canonical',
        nightStartReady: true,
        phase: 'build',
        phaseEndsAt: null,
      }),
    ).toBe(true)
    expect(
      shouldRequestLandrushZombieEscapeClockInitialization({
        clockMode: 'online-waiting',
        nightStartReady: true,
        phase: 'build',
        phaseEndsAt: null,
      }),
    ).toBe(false)
  })

  test('preserves the local first-house latch only for offline play', () => {
    expect(
      resolveLandrushZombieEscapeFirstHouseBuildSatisfied({
        clockMode: 'offline-local',
        offlineFirstHouseBuilt: true,
        phaseEndsAt: null,
      }),
    ).toBe(true)
    expect(
      resolveLandrushZombieEscapeFirstHouseBuildSatisfied({
        clockMode: 'online-waiting',
        offlineFirstHouseBuilt: true,
        phaseEndsAt: null,
      }),
    ).toBe(false)
  })
})
