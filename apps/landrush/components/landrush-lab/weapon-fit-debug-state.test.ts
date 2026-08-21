import { describe, expect, test } from 'bun:test'
import {
  changeWeaponFitDebugWeapon,
  createDefaultWeaponFitSettings,
  parseWeaponFitDebugParams,
  serializeWeaponFitDebugParams,
  WEAPON_FIT_DEBUG_WEAPONS,
} from './weapon-fit-debug-state'
import { ZOMBIE_ESCAPE_WEAPON_CATALOG } from './zombie-escape-weapon-catalog'

describe('weapon fit debug state', () => {
  test('derives the selector and asset paths from the shared firearm catalog', () => {
    expect(WEAPON_FIT_DEBUG_WEAPONS).toBe(ZOMBIE_ESCAPE_WEAPON_CATALOG)
    expect(WEAPON_FIT_DEBUG_WEAPONS).toHaveLength(5)
    for (const weapon of WEAPON_FIT_DEBUG_WEAPONS) {
      expect(weapon.assetPath).toContain(`/assets/weapons/${weapon.id}.glb`)
    }
  })

  test('round-trips every adjustable parameter', () => {
    const selectedWeapon = WEAPON_FIT_DEBUG_WEAPONS.at(-1)!
    const settings = {
      ...changeWeaponFitDebugWeapon(createDefaultWeaponFitSettings(), selectedWeapon.id),
      cameraBookmark: 'near' as const,
      dominantHand: 'left' as const,
      gripMode: 'one-hand' as const,
      showAxes: true,
      showBounds: true,
      showSkeleton: true,
      transform: {
        offsetX: 0.125,
        offsetY: -0.08,
        offsetZ: 0.2,
        rotationX: 11,
        rotationY: -37,
        rotationZ: 6,
        scale: 1.24,
      },
    }

    expect(parseWeaponFitDebugParams(serializeWeaponFitDebugParams(settings))).toEqual(settings)
  })

  test('rejects unknown catalog IDs and clamps unsafe numeric input', () => {
    const params = new URLSearchParams({
      rx: '9999',
      scale: '-4',
      tx: 'not-a-number',
      weapon: 'retired-melee-entry',
    })
    const parsed = parseWeaponFitDebugParams(params)
    const defaults = createDefaultWeaponFitSettings()

    expect(parsed.weaponId).toBe(defaults.weaponId)
    expect(parsed.transform.offsetX).toBe(0)
    expect(parsed.transform.rotationX).toBe(180)
    expect(parsed.transform.scale).toBe(0.35)
  })

  test('keeps the canonical 1:1 scale when the URL omits transform parameters', () => {
    const parsed = parseWeaponFitDebugParams(new URLSearchParams())

    expect(parsed.transform.scale).toBe(1)
    expect(parsed.transform.offsetX).toBe(0)
  })
})
