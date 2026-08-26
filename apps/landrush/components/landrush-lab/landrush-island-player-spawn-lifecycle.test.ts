import { describe, expect, test } from 'bun:test'
import { resolveLandrushIslandSpawnAuthorityHandoff } from './landrush-island-player-spawn-lifecycle'

describe('Landrush island player spawn lifecycle', () => {
  test('hands a fallback player to a scene spawn when initial authority becomes ready', () => {
    expect(
      resolveLandrushIslandSpawnAuthorityHandoff({
        authorityReady: false,
        authoritySettled: false,
        replayActive: false,
        source: 'scene',
      }),
    ).toBe('wait')
    expect(
      resolveLandrushIslandSpawnAuthorityHandoff({
        authorityReady: true,
        authoritySettled: false,
        replayActive: false,
        source: 'scene',
      }),
    ).toBe('apply')
  })

  test('settles a ready fallback so a later spawn edit cannot teleport the player', () => {
    expect(
      resolveLandrushIslandSpawnAuthorityHandoff({
        authorityReady: true,
        authoritySettled: false,
        replayActive: false,
        source: 'fallback',
      }),
    ).toBe('settle')
    expect(
      resolveLandrushIslandSpawnAuthorityHandoff({
        authorityReady: true,
        authoritySettled: true,
        replayActive: false,
        source: 'scene',
      }),
    ).toBe('wait')
  })

  test('settles replay hydration without replacing replay motion', () => {
    expect(
      resolveLandrushIslandSpawnAuthorityHandoff({
        authorityReady: true,
        authoritySettled: false,
        replayActive: true,
        source: 'scene',
      }),
    ).toBe('settle')
  })
})
