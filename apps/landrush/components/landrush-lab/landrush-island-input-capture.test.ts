import { describe, expect, test } from 'bun:test'
import {
  LANDRUSH_ZOMBIE_NAVIGATION_OVERLAY_CONTROLS_SELECTOR,
  type LandrushIslandInputElement,
  landrushIslandInputElementBlocksGameplay,
} from './landrush-island-input-capture'

describe('Landrush island capture-phase input target guard', () => {
  test('rejects Space and Arrow movement before mutating held keys for a nested overlay button', () => {
    const overlayOwner = {}
    const nestedButton = {
      closest: (selector: string) =>
        selector === LANDRUSH_ZOMBIE_NAVIGATION_OVERLAY_CONTROLS_SELECTOR ? overlayOwner : null,
      isContentEditable: false,
      tagName: 'BUTTON',
    } as LandrushIslandInputElement
    const pressedKeys = new Set<string>()

    for (const code of ['Space', 'ArrowUp', 'KeyW']) {
      if (!landrushIslandInputElementBlocksGameplay(nestedButton)) pressedKeys.add(code)
    }

    expect(pressedKeys.size).toBe(0)
  })

  test('preserves ordinary canvas keyboard targets', () => {
    const canvas = {
      closest: () => null,
      isContentEditable: false,
      tagName: 'CANVAS',
    } as LandrushIslandInputElement

    expect(landrushIslandInputElementBlocksGameplay(canvas)).toBe(false)
  })

  test('preserves native keyboard activation for standalone interface buttons', () => {
    const button = {
      closest: () => null,
      isContentEditable: false,
      tagName: 'BUTTON',
    } as LandrushIslandInputElement

    expect(landrushIslandInputElementBlocksGameplay(button)).toBe(true)
  })
})
