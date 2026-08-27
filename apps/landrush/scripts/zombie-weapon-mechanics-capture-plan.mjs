export const ZOMBIE_WEAPON_MECHANICS_CAPTURE_VIEWS = ['final', 'no-post']
export const ZOMBIE_WEAPON_MECHANICS_CAPTURE_WEAPONS = [
  'sunflare-pistol',
  'reef-carbine',
  'driftwood-scattergun',
  'storm-coil-repeater',
  'tidebreak-launcher',
]
export const ZOMBIE_WEAPON_MECHANICS_CAPTURE_VARIANTS = [1, 2, 3, 4, 5]

export function createZombieWeaponMechanicsCaptureTimes({
  endSeconds = 1.2,
  frameCount = 30,
  startSeconds = 0,
} = {}) {
  if (!(Number.isFinite(startSeconds) && startSeconds >= 0)) {
    throw new Error('Weapon mechanics capture start must be a finite non-negative number.')
  }
  if (!(Number.isFinite(endSeconds) && endSeconds > startSeconds)) {
    throw new Error('Weapon mechanics capture end must be greater than its start.')
  }
  if (!(Number.isInteger(frameCount) && frameCount >= 2)) {
    throw new Error('Weapon mechanics capture requires at least two frames.')
  }

  return Array.from({ length: frameCount }, (_, frameIndex) => {
    const progress = frameIndex / (frameCount - 1)
    return startSeconds + (endSeconds - startSeconds) * progress
  })
}

export function createZombieWeaponMechanicsCaptureUrl(
  baseUrl,
  view,
  timeSeconds = 0,
  weaponId = null,
  variantNumber = null,
) {
  if (!ZOMBIE_WEAPON_MECHANICS_CAPTURE_VIEWS.includes(view)) {
    throw new Error(`Unsupported weapon mechanics capture view: ${String(view)}`)
  }
  if (!(Number.isFinite(timeSeconds) && timeSeconds >= 0)) {
    throw new Error('Weapon mechanics capture time must be a finite non-negative number.')
  }
  if (weaponId !== null && !ZOMBIE_WEAPON_MECHANICS_CAPTURE_WEAPONS.includes(weaponId)) {
    throw new Error(`Unsupported weapon mechanics capture weapon: ${String(weaponId)}`)
  }
  if (
    variantNumber !== null &&
    !ZOMBIE_WEAPON_MECHANICS_CAPTURE_VARIANTS.includes(variantNumber)
  ) {
    throw new Error(`Unsupported weapon mechanics VFX variant: ${String(variantNumber)}`)
  }
  if (variantNumber !== null && weaponId === null) {
    throw new Error('A weapon mechanics VFX variant requires a selected weapon.')
  }

  const url = new URL('/landrush-lab/zombie-shooting-debug', baseUrl)
  url.searchParams.set('mechanics', '1')
  url.searchParams.set('time', formatCaptureNumber(timeSeconds))
  url.searchParams.set('view', view)
  if (weaponId !== null) url.searchParams.set('weapon', weaponId)
  if (variantNumber !== null) url.searchParams.set('variant', String(variantNumber))
  return url.toString()
}

export function assertZombieWeaponMechanicsCaptureState(
  state,
  expectedWeaponId = null,
  expectedVariantNumber = null,
) {
  if (!(state && state.ready === true)) {
    throw new Error('Weapon mechanics proof did not report capture readiness.')
  }
  const expectedIds = expectedWeaponId
    ? [expectedWeaponId]
    : ZOMBIE_WEAPON_MECHANICS_CAPTURE_WEAPONS
  if (!Array.isArray(state.scenarios) || state.scenarios.length !== expectedIds.length) {
    throw new Error(
      expectedWeaponId
        ? `Weapon mechanics proof must report exactly one ${expectedWeaponId} scenario.`
        : 'Weapon mechanics proof must report exactly five scenarios.',
    )
  }
  const scenarioIds = new Set(state.scenarios.map((scenario) => scenario?.id))
  for (const expectedId of expectedIds) {
    if (!scenarioIds.has(expectedId)) {
      throw new Error(`Weapon mechanics proof is missing scenario ${expectedId}.`)
    }
  }
  if (
    expectedVariantNumber !== null &&
    state.variantIndex !== expectedVariantNumber - 1
  ) {
    throw new Error(
      `Weapon mechanics proof reported V${String((state.variantIndex ?? -1) + 1)} instead of V${String(expectedVariantNumber)}.`,
    )
  }
  return state
}

function formatCaptureNumber(value) {
  return Number(value.toFixed(6)).toString()
}
