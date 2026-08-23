import { describe, expect, test } from 'bun:test'
import {
  acquireLandrushZombieEscapeCanvasPointerOwnership,
  shouldLandrushZombieEscapeOwnCanvasPointerEvents,
} from './landrush-zombie-escape-mode'

describe('Landrush Zombie Escape canvas pointer ownership', () => {
  test('belongs to Pascal during day/build and to combat only during the expected night phase', () => {
    expect(shouldLandrushZombieEscapeOwnCanvasPointerEvents(false, 'build')).toBe(false)
    expect(shouldLandrushZombieEscapeOwnCanvasPointerEvents(true, 'build')).toBe(false)
    expect(shouldLandrushZombieEscapeOwnCanvasPointerEvents(false, 'night')).toBe(false)
    expect(shouldLandrushZombieEscapeOwnCanvasPointerEvents(true, 'night')).toBe(true)
  })

  test('suspends an enabled R3F pointer manager and restores it on release', () => {
    let enabled = true
    const changes: boolean[] = []
    const release = acquireLandrushZombieEscapeCanvasPointerOwnership({
      getEnabled: () => enabled,
      setEnabled: (nextEnabled) => {
        enabled = nextEnabled
        changes.push(nextEnabled)
      },
    })

    expect(enabled).toBe(false)
    release()
    expect(enabled).toBe(true)
    expect(changes).toEqual([false, true])
  })

  test('preserves an already-disabled R3F pointer manager', () => {
    let enabled = false
    const changes: boolean[] = []
    const release = acquireLandrushZombieEscapeCanvasPointerOwnership({
      getEnabled: () => enabled,
      setEnabled: (nextEnabled) => {
        enabled = nextEnabled
        changes.push(nextEnabled)
      },
    })

    release()
    expect(enabled).toBe(false)
    expect(changes).toEqual([])
  })
})
