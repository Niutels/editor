import { describe, expect, test } from 'bun:test'
import {
  parseZombieShootingShaderDebugMode,
  parseZombieShootingShaderProof,
  parseZombieShootingZombify,
} from './zombie-shooting-debug-client'

describe('zombie shooting shader proof query', () => {
  test('requires an exact opt-in flag', () => {
    expect(parseZombieShootingShaderProof('1')).toBe(true)
    expect(parseZombieShootingShaderProof('true')).toBe(false)
    expect(parseZombieShootingShaderProof(null)).toBe(false)
  })

  test('clamps deterministic zombification and defaults invalid values to the final phase', () => {
    expect(parseZombieShootingZombify('0.42')).toBe(0.42)
    expect(parseZombieShootingZombify('-2')).toBe(0)
    expect(parseZombieShootingZombify('8')).toBe(1)
    expect(parseZombieShootingZombify('')).toBe(1)
    expect(parseZombieShootingZombify('invalid')).toBe(1)
    expect(parseZombieShootingZombify(null)).toBe(1)
  })

  test('accepts only the shader diagnostic channels', () => {
    for (const mode of ['final', 'mottle', 'roughness', 'tissue', 'veins'] as const) {
      expect(parseZombieShootingShaderDebugMode(mode)).toBe(mode)
    }
    expect(parseZombieShootingShaderDebugMode('diagnostic')).toBe('final')
    expect(parseZombieShootingShaderDebugMode(null)).toBe('final')
  })
})
