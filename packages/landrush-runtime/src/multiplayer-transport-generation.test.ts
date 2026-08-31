import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import {
  advanceMultiplayerTransportScopeGeneration,
  createMultiplayerTransportScopeGeneration,
  isMultiplayerTransportCallbackCurrent,
  isMultiplayerTransportSessionCallbackCurrent,
} from './multiplayer-transport-generation'

const PENDING_SCOPE = {
  contentAuthority: 'online-pending',
  gameMode: null,
  localProfileId: 'pending-player',
  parcelWorldId: null,
  roomId: 'room-a',
  spectator: false,
} as const

describe('multiplayer transport scope generation', () => {
  test('advances synchronously when profile authority replaces online-pending', () => {
    const pending = createMultiplayerTransportScopeGeneration(PENDING_SCOPE)
    const unchanged = advanceMultiplayerTransportScopeGeneration(pending, PENDING_SCOPE)
    const online = advanceMultiplayerTransportScopeGeneration(unchanged, {
      ...PENDING_SCOPE,
      contentAuthority: 'online',
      localProfileId: 'player-a',
    })

    expect(unchanged).toBe(pending)
    expect(online.generation).toBe(1)
  })

  test('advances when the declared game mode changes', () => {
    const normal = createMultiplayerTransportScopeGeneration(PENDING_SCOPE)
    const zombieEscape = advanceMultiplayerTransportScopeGeneration(normal, {
      ...PENDING_SCOPE,
      gameMode: 'zombie-escape',
    })

    expect(zombieEscape.generation).toBe(1)
    expect(zombieEscape.scope.gameMode).toBe('zombie-escape')
  })

  test('rejects an old socket even while it is still the socket ref current value', () => {
    const socket = {}

    expect(
      isMultiplayerTransportCallbackCurrent({
        capturedGeneration: 2,
        currentGeneration: 3,
        currentTransport: socket,
        transport: socket,
      }),
    ).toBe(false)
  })

  test('requires both the current socket identity and its captured generation', () => {
    const socket = {}

    expect(
      isMultiplayerTransportCallbackCurrent({
        capturedGeneration: 3,
        currentGeneration: 3,
        currentTransport: socket,
        transport: socket,
      }),
    ).toBe(true)
    expect(
      isMultiplayerTransportCallbackCurrent({
        capturedGeneration: 3,
        currentGeneration: 3,
        currentTransport: {},
        transport: socket,
      }),
    ).toBe(false)
  })

  test('rejects an ACK retry after either transport generation or connection changes', () => {
    const socket = {}

    expect(
      isMultiplayerTransportSessionCallbackCurrent({
        capturedConnectionId: 'connection-a',
        capturedGeneration: 2,
        currentConnectionId: 'connection-a',
        currentGeneration: 3,
        currentTransport: socket,
        transport: socket,
      }),
    ).toBe(false)
    expect(
      isMultiplayerTransportSessionCallbackCurrent({
        capturedConnectionId: 'connection-a',
        capturedGeneration: 3,
        currentConnectionId: 'connection-b',
        currentGeneration: 3,
        currentTransport: socket,
        transport: socket,
      }),
    ).toBe(false)
  })

  test('rejects a delayed first-A callback after parcel scope rotates A to B to A', () => {
    const socket = {}
    const firstA = advanceMultiplayerTransportScopeGeneration(
      createMultiplayerTransportScopeGeneration(PENDING_SCOPE),
      { ...PENDING_SCOPE, parcelWorldId: 'world-a' },
    )
    const worldB = advanceMultiplayerTransportScopeGeneration(firstA, {
      ...PENDING_SCOPE,
      parcelWorldId: 'world-b',
    })
    const secondA = advanceMultiplayerTransportScopeGeneration(worldB, {
      ...PENDING_SCOPE,
      parcelWorldId: 'world-a',
    })

    expect(secondA.generation).toBe(firstA.generation + 2)
    expect(
      isMultiplayerTransportCallbackCurrent({
        capturedGeneration: firstA.generation,
        currentGeneration: secondA.generation,
        currentTransport: socket,
        transport: socket,
      }),
    ).toBe(false)
  })

  test('guards every WebSocket event callback with the captured transport generation', () => {
    const source = readFileSync(new URL('./world-multiplayer-client.ts', import.meta.url), 'utf8')

    expect(source).toContain("socket.addEventListener('open'")
    expect(source).toContain("socket.addEventListener('message'")
    expect(source).toContain("socket.addEventListener('close'")
    expect(source).toContain("socket.addEventListener('error'")
    expect(source.match(/isCurrentSocket\(\)/g)?.length).toBeGreaterThanOrEqual(5)
    expect(source).toContain(
      'transportScopeGenerationRef.current.generation !== transportGeneration',
    )
    expect(source).toContain('isMultiplayerTransportSessionCallbackCurrent({')
    expect(source).toContain('parcelWorldId: worldId')
    expect(source).toContain("LandrushWorldMultiplayerGameMode = 'zombie-escape' | null")
    expect(source).not.toContain("type: 'initialize-zombie-escape-clock'")
    expect(source).toContain('observation.state.phaseEndsAt !== null')
    expect(source).toContain("type: 'start-zombie-escape-night'")
  })
})
