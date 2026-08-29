import { describe, expect, test } from 'bun:test'
import nextConfig from '../../next.config'

describe('Landrush static image delivery', () => {
  test('emits direct image URLs for the static production host', () => {
    expect(nextConfig.images?.unoptimized).toBe(true)
  })
})
