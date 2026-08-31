import { describe, expect, test } from 'bun:test'
import nextConfig from '../next.config'
import {
  installLandrushDevToolsIndicatorPlacement,
  LANDRUSH_DEV_TOOLS_INDICATOR_STYLE,
} from './dev-tools-indicator-placement'

class FakeStyleElement {
  id = ''
  parent: FakeShadowRoot | null = null
  removed = false
  textContent = ''

  remove() {
    this.removed = true
    this.parent?.remove(this)
    this.parent = null
  }
}

class FakeShadowRoot {
  styles: FakeStyleElement[] = []

  append(style: FakeStyleElement) {
    style.parent = this
    this.styles.push(style)
  }

  getElementById(id: string) {
    return this.styles.find((style) => style.id === id) ?? null
  }

  remove(style: FakeStyleElement) {
    this.styles = this.styles.filter((candidate) => candidate !== style)
  }
}

function createTargetDocument(getShadowRoot: () => FakeShadowRoot | null) {
  return {
    createElement: () => new FakeStyleElement(),
    documentElement: {},
    querySelector: () => {
      const shadowRoot = getShadowRoot()
      return shadowRoot ? { shadowRoot } : null
    },
  } as unknown as Document
}

describe('Landrush Next.js dev tools indicator placement', () => {
  test('uses the bottom-right Next.js indicator corner on fresh dev boots', () => {
    expect(nextConfig.devIndicators).toEqual({ position: 'bottom-right' })
  })

  test('replaces an existing shadow style, clears stale corners, and owns cleanup', () => {
    const shadowRoot = new FakeShadowRoot()
    const staleStyle = new FakeStyleElement()
    staleStyle.id = 'landrush-dev-tools-indicator-placement'
    shadowRoot.append(staleStyle)

    const cleanup = installLandrushDevToolsIndicatorPlacement({
      cancelExpiry: () => {
        throw new Error('an immediate installation must not schedule expiry cleanup')
      },
      createObserver: () => {
        throw new Error('an immediate installation must not create an observer')
      },
      scheduleExpiry: () => {
        throw new Error('an immediate installation must not schedule an expiry')
      },
      targetDocument: createTargetDocument(() => shadowRoot),
    })

    expect(staleStyle.removed).toBe(true)
    expect(shadowRoot.styles).toHaveLength(1)
    expect(shadowRoot.styles[0]?.textContent).toBe(LANDRUSH_DEV_TOOLS_INDICATOR_STYLE)
    expect(shadowRoot.styles[0]?.textContent).toContain('top: auto !important')
    expect(shadowRoot.styles[0]?.textContent).toContain(
      'right: max(0.75rem, env(safe-area-inset-right)) !important',
    )
    expect(shadowRoot.styles[0]?.textContent).toContain(
      'bottom: max(3rem, calc(env(safe-area-inset-bottom) + 2.25rem)) !important',
    )
    expect(shadowRoot.styles[0]?.textContent).toContain('left: auto !important')

    cleanup()
    cleanup()
    expect(shadowRoot.styles).toHaveLength(0)
  })

  test('observes only until a delayed portal appears, then cancels its bounded expiry', () => {
    let shadowRoot: FakeShadowRoot | null = null
    let mutationCallback: (() => void) | null = null
    let expiryCallback: (() => void) | null = null
    let observedOptions: MutationObserverInit | null = null
    let disconnectCount = 0
    const cancelledExpiries: number[] = []

    const cleanup = installLandrushDevToolsIndicatorPlacement({
      cancelExpiry: (expiryId) => cancelledExpiries.push(expiryId),
      createObserver: (callback) => {
        mutationCallback = callback
        return {
          disconnect: () => {
            disconnectCount += 1
          },
          observe: (_target, options) => {
            observedOptions = options
          },
        }
      },
      scheduleExpiry: (callback, delayMs) => {
        expect(delayMs).toBe(10_000)
        expiryCallback = callback
        return 17
      },
      targetDocument: createTargetDocument(() => shadowRoot),
    })

    expect(observedOptions).toEqual({ childList: true, subtree: true })
    expect(expiryCallback).not.toBeNull()
    shadowRoot = new FakeShadowRoot()
    mutationCallback?.()

    expect(shadowRoot.styles).toHaveLength(1)
    expect(disconnectCount).toBe(1)
    expect(cancelledExpiries).toEqual([17])

    cleanup()
    expect(shadowRoot.styles).toHaveLength(0)
    expect(disconnectCount).toBe(1)
  })
})
