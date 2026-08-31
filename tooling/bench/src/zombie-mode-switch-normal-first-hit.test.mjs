import { describe, expect, test } from 'bun:test'
import {
  validateZombieModeSwitchNormalFirstHit,
  ZOMBIE_MODE_SWITCH_NORMAL_FIRST_HIT,
} from './zombie-mode-switch-normal-first-hit.mjs'

function playerState(overrides = {}) {
  return {
    audioWriteSequence: 4,
    health: 100,
    hitSlowSeconds: 0,
    hurtFlash: 0,
    phase: 'night',
    playerProtected: false,
    status: 'playing',
    ...overrides,
  }
}

function roomState(playerProtected) {
  return {
    active: true,
    obstacleDamageSuppressed: true,
    phaseHeld: true,
    playerProtected,
  }
}

function validProbe() {
  return {
    damageAtMs: 10_100,
    damageCount: 1,
    damageFromHealth: 100,
    damagePlayerState: playerState({
      audioWriteSequence: 5,
      health: 92,
      hitSlowSeconds: 0.4,
      hurtFlash: 1,
    }),
    damageToHealth: 92,
    enabled: true,
    error: null,
    finalPlayerState: playerState({ health: 1_000_000_000, playerProtected: true }),
    finalRoomState: roomState(true),
    firstUnexpectedHudHealth: null,
    hudAtMs: 10_180,
    hudHealth: 92,
    initialPlayerState: playerState(),
    releasedAtMs: 1_010,
    releasedPlayerState: playerState(),
    releasedRoomState: roomState(false),
    reprotectedAtMs: 10_181,
    reprotectedPlayerState: playerState({
      audioWriteSequence: 5,
      health: 1_000_000_000,
      hitSlowSeconds: 0.4,
      hurtFlash: 1,
      playerProtected: true,
    }),
    reprotectedRoomState: roomState(true),
    stoppedReason: 'reprotected',
    terminalObservation: null,
  }
}

describe('Zombie mode-switch authentic normal first-hit validator', () => {
  test('accepts one real 100 to 92 hit, matching HUD publication, and bounded reprotection', () => {
    expect(
      validateZombieModeSwitchNormalFirstHit({
        probe: validProbe(),
        switchPageTMs: 1_000,
        windowEndMs: 15_000,
      }),
    ).toEqual([])
  })

  test('rejects missing, multiple, late, mismatched, terminal, and slow-reprotection probes', () => {
    const probe = validProbe()
    probe.damageAtMs = 16_001
    probe.damageCount = 2
    probe.damageToHealth = 84
    probe.firstUnexpectedHudHealth = 84
    probe.hudHealth = 84
    probe.hudAtMs = 16_020
    probe.reprotectedAtMs =
      probe.damageAtMs + ZOMBIE_MODE_SWITCH_NORMAL_FIRST_HIT.maximumReprotectionDelayMs + 1
    probe.reprotectedPlayerState = playerState({ health: 84 })
    probe.reprotectedRoomState = roomState(false)
    probe.stoppedReason = 'timeout'
    probe.terminalObservation = { atMs: 15_900, phase: 'night', status: 'lost' }
    probe.finalPlayerState = playerState({ health: 0, status: 'lost' })
    probe.finalRoomState = roomState(false)

    const issues = validateZombieModeSwitchNormalFirstHit({
      probe,
      switchPageTMs: 1_000,
      windowEndMs: 15_000,
    })
    expect(issues.join('\n')).toContain('damage count=2')
    expect(issues.join('\n')).toContain('damage time=16001')
    expect(issues.join('\n')).toContain('damage transition=100->84')
    expect(issues.join('\n')).toContain('HUD mismatch=84')
    expect(issues.join('\n')).toContain('HUD health=84')
    expect(issues.join('\n')).toContain('terminal observation=')
    expect(issues.join('\n')).toContain('reprotection delay=251ms')
    expect(issues.join('\n')).toContain('probe stopped=timeout')
  })

  test('rejects an absent hit probe', () => {
    expect(
      validateZombieModeSwitchNormalFirstHit({
        probe: null,
        switchPageTMs: 1_000,
        windowEndMs: 15_000,
      }),
    ).toEqual(['normal first-hit probe was not enabled'])
  })
})
