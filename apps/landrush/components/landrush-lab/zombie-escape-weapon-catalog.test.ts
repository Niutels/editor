import { describe, expect, test } from 'bun:test'
import {
  ZOMBIE_ESCAPE_WEAPON_ASSET_FRAME,
  ZOMBIE_ESCAPE_WEAPON_CATALOG,
} from './zombie-escape-weapon-catalog'

const EXPECTED_MUZZLE_ANCHORS = {
  'driftwood-scattergun': [-0.00305, 0.05746, 0.41],
  'reef-carbine': [-0.0001, 0.05018, 0.39],
  'storm-coil-repeater': [-0.00068, 0.0931, 0.35],
  'sunflare-pistol': [0.00025, 0.05445, 0.17],
  'tidebreak-launcher': [-0.00046, 0.05835, 0.47],
} as const

describe('zombie escape firearm catalog', () => {
  test('defines five distinct generated firearm contracts', () => {
    expect(ZOMBIE_ESCAPE_WEAPON_CATALOG).toHaveLength(5)
    expect(new Set(ZOMBIE_ESCAPE_WEAPON_CATALOG.map(({ id }) => id)).size).toBe(5)
    expect(new Set(ZOMBIE_ESCAPE_WEAPON_CATALOG.map(({ displayName }) => displayName)).size).toBe(5)
    expect(new Set(ZOMBIE_ESCAPE_WEAPON_CATALOG.map(({ meshy }) => meshy.prompt)).size).toBe(5)
  })

  test('targets textured 3k Smart Topology GLBs at stable public paths', () => {
    for (const weapon of ZOMBIE_ESCAPE_WEAPON_CATALOG) {
      expect(weapon.assetPath).toBe(`/landrush-lab/zombie-escape/assets/weapons/${weapon.id}.glb`)
      expect(weapon.meshy).toMatchObject({
        aiModel: 'meshy-t2',
        modelType: 'smart-topology',
        targetPolycount: 3000,
        textureResolution: '2k',
        topology: 'triangle',
      })
      expect(weapon.meshy.prompt.length).toBeLessThanOrEqual(600)
      expect(weapon.meshy.texturePrompt.length).toBeLessThanOrEqual(600)
      expect(weapon.triangleBudget).toEqual({
        maximumTriangles: 3600,
        minimumTriangles: 2400,
        targetTriangles: 3000,
      })
    }
  })

  test('uses a consistent +Z firing frame with valid body, grip, and muzzle positions', () => {
    expect(ZOMBIE_ESCAPE_WEAPON_ASSET_FRAME.longitudinalAxis).toBe('+z')
    for (const weapon of ZOMBIE_ESCAPE_WEAPON_CATALOG) {
      expect(weapon.grip.axis).toEqual([0, 0, 1])
      expect(weapon.muzzle.forwardAxis).toEqual([0, 0, 1])
      expect(weapon.muzzle.anchorMeters[2]).toBeGreaterThan(weapon.grip.primaryAnchorMeters[2])
      expect(weapon.canonicalDimensionsMeters.lengthZ).toBeGreaterThan(
        weapon.canonicalDimensionsMeters.widthX,
      )
      expect(weapon.canonicalDimensionsMeters.lengthZ).toBeGreaterThan(
        weapon.canonicalDimensionsMeters.heightY,
      )
      expect(weapon.collisionBounds.halfExtentsMeters).toEqual([
        weapon.canonicalDimensionsMeters.widthX / 2,
        weapon.canonicalDimensionsMeters.heightY / 2,
        weapon.canonicalDimensionsMeters.lengthZ / 2,
      ])
    }
  })

  test('keeps each muzzle socket calibrated to its normalized GLB leading face', () => {
    for (const weapon of ZOMBIE_ESCAPE_WEAPON_CATALOG) {
      expect(weapon.muzzle.anchorMeters).toEqual(EXPECTED_MUZZLE_ANCHORS[weapon.id])
      expect(weapon.muzzle.anchorMeters[2]).toBe(weapon.canonicalDimensionsMeters.lengthZ / 2)
      expect(Math.abs(weapon.muzzle.anchorMeters[0])).toBeLessThanOrEqual(
        weapon.canonicalDimensionsMeters.widthX / 2,
      )
      expect(Math.abs(weapon.muzzle.anchorMeters[1])).toBeLessThanOrEqual(
        weapon.canonicalDimensionsMeters.heightY / 2,
      )
    }
  })

  test('has coherent one- and two-hand fit metadata', () => {
    expect(new Set(ZOMBIE_ESCAPE_WEAPON_CATALOG.map(({ wield }) => wield))).toEqual(
      new Set(['one-hand', 'two-hand']),
    )
    for (const weapon of ZOMBIE_ESCAPE_WEAPON_CATALOG) {
      expect(weapon.handFitDefaults.primary.hand).toBe('right')
      if (weapon.wield === 'one-hand') {
        expect(weapon.grip.secondaryAnchorMeters).toBeNull()
        expect(weapon.handFitDefaults.secondary).toBeNull()
      } else {
        expect(weapon.grip.secondaryAnchorMeters).not.toBeNull()
        expect(weapon.handFitDefaults.secondary?.hand).toBe('left')
      }
    }
  })
})
