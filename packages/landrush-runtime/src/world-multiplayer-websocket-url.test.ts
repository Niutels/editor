import { describe, expect, test } from 'bun:test'
import { resolveWorldMultiplayerWebSocketUrl } from './world-multiplayer-websocket-url'

const HOSTED_URL =
  'wss://landrush-world-multiplayer.onrender.com/api/landrush-lab/world-multiplayer/ws'

describe('world multiplayer WebSocket URL', () => {
  test('keeps an explicit ws query override ahead of local and hosted resolution', () => {
    expect(
      resolveWorldMultiplayerWebSocketUrl({
        currentUrl:
          'http://192.168.1.198:3002/landrush-lab/pascal-multiplayer-island?ws=https%3A%2F%2Foverride.example%2Fsocket',
        hostedUrl: HOSTED_URL,
      }),
    ).toBe('wss://override.example/socket')
  })

  test('routes a LAN dev page to the multiplayer server on the same hostname', () => {
    expect(
      resolveWorldMultiplayerWebSocketUrl({
        currentUrl: 'http://192.168.1.198:3002/landrush-lab/pascal-multiplayer-island',
        hostedUrl: HOSTED_URL,
      }),
    ).toBe('ws://192.168.1.198:3003/api/landrush-lab/world-multiplayer/ws')
  })

  test('uses secure WebSockets for an HTTPS dev page', () => {
    expect(
      resolveWorldMultiplayerWebSocketUrl({
        currentUrl: 'https://devbox.local:3002/landrush-lab/pascal-multiplayer-island',
        hostedUrl: HOSTED_URL,
      }),
    ).toBe('wss://devbox.local:3003/api/landrush-lab/world-multiplayer/ws')
  })

  test('preserves loopback development resolution', () => {
    expect(
      resolveWorldMultiplayerWebSocketUrl({
        currentUrl: 'http://localhost:3010/landrush-lab/pascal-multiplayer-island',
        hostedUrl: HOSTED_URL,
      }),
    ).toBe('ws://localhost:3003/api/landrush-lab/world-multiplayer/ws')
  })

  test('keeps hosted production pages on the configured multiplayer service', () => {
    expect(
      resolveWorldMultiplayerWebSocketUrl({
        currentUrl: 'https://niutgames.com/landrush-lab/pascal-multiplayer-island',
        hostedUrl: 'https://multiplayer.niutgames.com/world/ws',
      }),
    ).toBe('wss://multiplayer.niutgames.com/world/ws')
  })
})
