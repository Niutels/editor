import { describe, expect, test } from 'bun:test'
import {
  ZOMBIE_ESCAPE_OBSTACLE_BREACH_DURATION_SECONDS,
  ZOMBIE_ESCAPE_SIMULATION,
} from './zombie-escape-config'
import {
  advanceZombieEscapeAttackCycle,
  beginZombieEscapeAttackCycle,
  ZOMBIE_ESCAPE_ATTACK_CYCLE_EVENT,
} from './zombie-escape-simulation'

describe('Zombie Escape attack cycle', () => {
  test('starts at phase zero and resolves exactly one contact per authored cycle', () => {
    const cycle = createAttackCycle()
    const duration = ZOMBIE_ESCAPE_SIMULATION.zombieObstacleAttackCooldownSeconds
    const contactSeconds = duration * ZOMBIE_ESCAPE_SIMULATION.zombieObstacleAttackContactPhase
    const beforeContactSeconds = contactSeconds - 0.001

    cycle.attackCooldown[0] = 0
    cycle.attackContactResolved[0] = 1
    beginZombieEscapeAttackCycle(cycle, 0)

    expect(cycle.attackCooldown[0]).toBeCloseTo(duration, 6)
    expect(cycle.attackContactResolved[0]).toBe(0)
    expect(advanceFor(cycle, beforeContactSeconds)).toEqual({ completions: 0, contacts: 0 })
    expect(advanceFor(cycle, 0.001)).toEqual({ completions: 0, contacts: 1 })
    expect(cycle.attackContactResolved[0]).toBe(1)
    expect(advanceFor(cycle, duration - contactSeconds)).toEqual({ completions: 1, contacts: 0 })
    expect(cycle.attackCooldown[0]).toBeCloseTo(duration, 5)
    expect(cycle.attackContactResolved[0]).toBe(0)
  })

  test('aligns the second contact and two-hit breach duration with route planning', () => {
    const cycle = createAttackCycle()
    const duration = ZOMBIE_ESCAPE_SIMULATION.zombieObstacleAttackCooldownSeconds
    const contactSeconds = duration * ZOMBIE_ESCAPE_SIMULATION.zombieObstacleAttackContactPhase

    beginZombieEscapeAttackCycle(cycle, 0)
    const firstContacts = advanceFor(cycle, contactSeconds)
    const recoveryContacts = advanceFor(cycle, duration - contactSeconds)
    const secondContacts = advanceFor(cycle, contactSeconds)

    expect(firstContacts).toEqual({ completions: 0, contacts: 1 })
    expect(recoveryContacts).toEqual({ completions: 1, contacts: 0 })
    expect(secondContacts).toEqual({ completions: 0, contacts: 1 })
    expect(duration + contactSeconds).toBeCloseTo(
      ZOMBIE_ESCAPE_OBSTACLE_BREACH_DURATION_SECONDS,
      10,
    )
  })
})

function createAttackCycle() {
  return {
    attackContactResolved: new Uint8Array(1),
    attackCooldown: new Float32Array(1),
  }
}

function advanceFor(cycle: ReturnType<typeof createAttackCycle>, elapsedSeconds: number) {
  let completions = 0
  let contacts = 0
  let remaining = elapsedSeconds
  while (remaining > 0.000_000_1) {
    const delta = Math.min(ZOMBIE_ESCAPE_SIMULATION.maximumFrameDeltaSeconds, remaining)
    const event = advanceZombieEscapeAttackCycle(cycle, 0, delta)
    if ((event & ZOMBIE_ESCAPE_ATTACK_CYCLE_EVENT.contact) !== 0) contacts += 1
    if ((event & ZOMBIE_ESCAPE_ATTACK_CYCLE_EVENT.completed) !== 0) completions += 1
    remaining -= delta
  }
  return { completions, contacts }
}
