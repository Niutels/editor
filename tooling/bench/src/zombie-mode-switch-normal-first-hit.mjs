export const ZOMBIE_MODE_SWITCH_NORMAL_FIRST_HIT = Object.freeze({
  expectedAfterHealth: 92,
  expectedBeforeHealth: 100,
  maximumReprotectionDelayMs: 250,
})

function finite(value) {
  return typeof value === 'number' && Number.isFinite(value)
}

function requireRoomHold(issues, label, state, playerProtected) {
  if (
    state?.active !== true ||
    state?.obstacleDamageSuppressed !== true ||
    state?.phaseHeld !== true ||
    state?.playerProtected !== playerProtected
  ) {
    issues.push(`${label} room hold=${JSON.stringify(state ?? null)}`)
  }
}

function requirePlayingNight(issues, label, state) {
  if (state?.phase !== 'night' || state?.status !== 'playing') {
    issues.push(`${label} phase/status=${String(state?.phase)}/${String(state?.status)}`)
  }
}

export function validateZombieModeSwitchNormalFirstHit({
  probe,
  switchPageTMs,
  windowEndMs,
}) {
  const issues = []
  if (probe?.enabled !== true) return ['normal first-hit probe was not enabled']
  if (!finite(switchPageTMs) || !finite(windowEndMs) || windowEndMs <= 0) {
    return ['normal first-hit validator received an invalid logical window']
  }
  const logicalEndMs = switchPageTMs + windowEndMs
  const inWindow = (value) => finite(value) && value >= switchPageTMs && value <= logicalEndMs

  if (probe.error !== null) issues.push(`probe error=${String(probe.error)}`)
  if (probe.stoppedReason !== 'reprotected') {
    issues.push(`probe stopped=${String(probe.stoppedReason)}`)
  }
  if (!inWindow(probe.releasedAtMs)) {
    issues.push(`release time=${String(probe.releasedAtMs)}`)
  }
  if (probe.initialPlayerState?.health !== ZOMBIE_MODE_SWITCH_NORMAL_FIRST_HIT.expectedBeforeHealth) {
    issues.push(`initial health=${String(probe.initialPlayerState?.health)}`)
  }
  requirePlayingNight(issues, 'initial', probe.initialPlayerState)
  if (probe.releasedPlayerState?.health !== ZOMBIE_MODE_SWITCH_NORMAL_FIRST_HIT.expectedBeforeHealth) {
    issues.push(`released health=${String(probe.releasedPlayerState?.health)}`)
  }
  if (probe.releasedPlayerState?.playerProtected !== false) {
    issues.push(`released playerProtected=${String(probe.releasedPlayerState?.playerProtected)}`)
  }
  requirePlayingNight(issues, 'released', probe.releasedPlayerState)
  requireRoomHold(issues, 'released', probe.releasedRoomState, false)

  if (probe.damageCount !== 1) issues.push(`damage count=${String(probe.damageCount)}`)
  if (!inWindow(probe.damageAtMs)) issues.push(`damage time=${String(probe.damageAtMs)}`)
  if (
    probe.damageFromHealth !== ZOMBIE_MODE_SWITCH_NORMAL_FIRST_HIT.expectedBeforeHealth ||
    probe.damageToHealth !== ZOMBIE_MODE_SWITCH_NORMAL_FIRST_HIT.expectedAfterHealth
  ) {
    issues.push(
      `damage transition=${String(probe.damageFromHealth)}->${String(probe.damageToHealth)}`,
    )
  }
  if (probe.damagePlayerState?.health !== ZOMBIE_MODE_SWITCH_NORMAL_FIRST_HIT.expectedAfterHealth) {
    issues.push(`damage state health=${String(probe.damagePlayerState?.health)}`)
  }
  if (!(probe.damagePlayerState?.hitSlowSeconds > 0) || !(probe.damagePlayerState?.hurtFlash > 0)) {
    issues.push(
      `damage feedback=${String(probe.damagePlayerState?.hitSlowSeconds)}/${String(probe.damagePlayerState?.hurtFlash)}`,
    )
  }
  if (
    !(probe.damagePlayerState?.audioWriteSequence > probe.releasedPlayerState?.audioWriteSequence)
  ) {
    issues.push(
      `damage audio sequence=${String(probe.releasedPlayerState?.audioWriteSequence)}->${String(probe.damagePlayerState?.audioWriteSequence)}`,
    )
  }
  requirePlayingNight(issues, 'damage', probe.damagePlayerState)

  if (probe.firstUnexpectedHudHealth !== null) {
    issues.push(`HUD mismatch=${String(probe.firstUnexpectedHudHealth)}`)
  }
  if (probe.hudHealth !== ZOMBIE_MODE_SWITCH_NORMAL_FIRST_HIT.expectedAfterHealth) {
    issues.push(`HUD health=${String(probe.hudHealth)}`)
  }
  if (!inWindow(probe.hudAtMs) || probe.hudAtMs < probe.damageAtMs) {
    issues.push(`HUD time=${String(probe.hudAtMs)}`)
  }
  if (!inWindow(probe.reprotectedAtMs) || probe.reprotectedAtMs < probe.hudAtMs) {
    issues.push(`reprotection time=${String(probe.reprotectedAtMs)}`)
  }
  const reprotectionDelayMs = probe.reprotectedAtMs - probe.damageAtMs
  if (
    !finite(reprotectionDelayMs) ||
    reprotectionDelayMs < 0 ||
    reprotectionDelayMs > ZOMBIE_MODE_SWITCH_NORMAL_FIRST_HIT.maximumReprotectionDelayMs
  ) {
    issues.push(`reprotection delay=${String(reprotectionDelayMs)}ms`)
  }
  if (
    probe.reprotectedPlayerState?.playerProtected !== true ||
    !(probe.reprotectedPlayerState?.health > ZOMBIE_MODE_SWITCH_NORMAL_FIRST_HIT.expectedBeforeHealth)
  ) {
    issues.push(
      `reprotected player=${String(probe.reprotectedPlayerState?.health)}/${String(probe.reprotectedPlayerState?.playerProtected)}`,
    )
  }
  requirePlayingNight(issues, 'reprotected', probe.reprotectedPlayerState)
  requireRoomHold(issues, 'reprotected', probe.reprotectedRoomState, true)

  if (probe.terminalObservation !== null) {
    issues.push(`terminal observation=${JSON.stringify(probe.terminalObservation)}`)
  }
  if (probe.finalPlayerState?.playerProtected !== true) {
    issues.push(`final playerProtected=${String(probe.finalPlayerState?.playerProtected)}`)
  }
  requirePlayingNight(issues, 'final', probe.finalPlayerState)
  requireRoomHold(issues, 'final', probe.finalRoomState, true)
  return issues
}
