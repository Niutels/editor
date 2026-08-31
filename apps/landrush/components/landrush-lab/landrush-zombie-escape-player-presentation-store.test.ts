import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { createLandrushZombieEscapePlayerPresentationStore } from './landrush-zombie-escape-player-presentation-store'

describe('Landrush Zombie Escape player presentation store', () => {
  test('does not notify or replace its snapshot for repeated status and actionability reports', () => {
    const store = createLandrushZombieEscapePlayerPresentationStore()
    const initial = store.getSnapshot()
    let notifications = 0
    const unsubscribe = store.subscribe(() => {
      notifications += 1
    })

    expect(store.setStatus('playing')).toBe(false)
    expect(store.setInteractionActionable(false)).toBe(false)
    expect(store.getSnapshot()).toBe(initial)
    expect(notifications).toBe(0)

    expect(store.setStatus('lost')).toBe(true)
    expect(store.setStatus('lost')).toBe(false)
    expect(store.setInteractionActionable(true)).toBe(true)
    expect(store.setInteractionActionable(true)).toBe(false)
    expect(notifications).toBe(2)
    expect(store.getSnapshot()).toMatchObject({ interactionActionable: true, status: 'lost' })

    unsubscribe()
    expect(store.setStatus('playing')).toBe(true)
    expect(notifications).toBe(2)
  })

  test('reconciles destroyed furniture semantically before notifying the local robot', () => {
    const store = createLandrushZombieEscapePlayerPresentationStore()
    let notifications = 0
    store.subscribe(() => {
      notifications += 1
    })

    expect(store.setDestroyedFurnitureIds(new Set(['chair', 'table']))).toBe(true)
    const first = store.getSnapshot()
    expect(store.setDestroyedFurnitureIds(new Set(['table', 'chair']))).toBe(false)
    expect(store.getSnapshot()).toBe(first)
    expect(store.setDestroyedFurnitureIds(new Set(['chair']))).toBe(true)
    expect([...store.getSnapshot().destroyedFurnitureIds]).toEqual(['chair'])
    expect(notifications).toBe(2)
  })

  test('keeps phase canonical in the island while isolating status renders to the local robot', () => {
    const source = readFileSync(new URL('./landrush-island-client.tsx', import.meta.url), 'utf8')
    const playerLayerStart = source.indexOf('function LandrushIslandPlayerLayer({')
    const playerLayerEnd = source.indexOf('function LandrushIslandRevealProofOccluder({')
    const playerLayer = source.slice(playerLayerStart, playerLayerEnd)
    const normalizedPlayerLayer = playerLayer.replace(/\s+/g, ' ')

    expect(source).toContain('setZombieEscapePhase(phase)')
    expect(source).toContain(
      'zombieEscapeRoomStateObservation={multiplayer.zombieEscapeStateObservation}',
    )
    expect(playerLayer).not.toContain('useState<ZombieEscapeGameStatus>')
    expect(playerLayer).not.toContain('setZombieEscapeStatus')
    expect(playerLayer).toContain('<LandrushIslandZombiePlayerPresentation')
    expect(normalizedPlayerLayer).toContain(
      'onStatusChange={zombieEscapePlayerPresentationStore.setStatus}',
    )
    expect(normalizedPlayerLayer).toContain(
      'onInteractionActionabilityChange={ zombieEscapePlayerPresentationStore.setInteractionActionable }',
    )
  })
})
