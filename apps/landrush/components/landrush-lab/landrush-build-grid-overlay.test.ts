import { describe, expect, test } from 'bun:test'
import { shouldAnimateLandrushBuildGridFade } from './landrush-build-grid-overlay'

describe('Landrush build grid overlay fade', () => {
  test('does not schedule a fade when the overlay is already at its target', () => {
    expect(shouldAnimateLandrushBuildGridFade(0, 0)).toBe(false)
    expect(shouldAnimateLandrushBuildGridFade(1, 1)).toBe(false)
  })

  test('keeps real enter and exit fades', () => {
    expect(shouldAnimateLandrushBuildGridFade(0, 1)).toBe(true)
    expect(shouldAnimateLandrushBuildGridFade(1, 0)).toBe(true)
    expect(shouldAnimateLandrushBuildGridFade(0.4, 1)).toBe(true)
  })
})
