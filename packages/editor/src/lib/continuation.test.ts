import { describe, expect, test } from 'bun:test'
import { continuationContextOf, nextContinuation } from './continuation'

describe('tool continuation', () => {
  test('classifies every point-placement tool that honors point continuation', () => {
    for (const kind of [
      'block',
      'column',
      'door',
      'item',
      'lean-to-extension',
      'shelf',
      'spawn',
      'stair',
      'window',
    ]) {
      expect(continuationContextOf(kind)).toBe('point')
    }
  })

  test('keeps line and cabinet tools in their dedicated continuation contexts', () => {
    expect(continuationContextOf('wall')).toBe('wall')
    expect(continuationContextOf('fence')).toBe('fence')
    expect(continuationContextOf('cabinet')).toBe('cabinet')
    expect(continuationContextOf('roof')).toBeNull()
  })

  test('cycles point placement between once and repeat', () => {
    expect(nextContinuation('point', 'once')).toBe('repeat')
    expect(nextContinuation('point', 'repeat')).toBe('once')
  })
})
