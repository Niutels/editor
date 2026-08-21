export type ZombieEscapeHitFlickerPhase = 'black' | 'none' | 'red'

export function resolveZombieEscapeHitFlickerPhase(hitFlash: number): ZombieEscapeHitFlickerPhase {
  const amount = Number.isFinite(hitFlash) ? Math.max(0, Math.min(1, hitFlash)) : 0
  if (amount <= 0) return 'none'
  return Math.floor((1 - amount) * 6) % 2 === 0 ? 'red' : 'black'
}
