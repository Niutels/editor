import { describe, expect, test } from 'bun:test'
import { renderToStaticMarkup } from 'react-dom/server'
import {
  consumeLandrushZombieEscapeTouchJumpRequest,
  createLandrushZombieEscapeTouchInputState,
  type LandrushZombieEscapeTouchInputKind,
} from './landrush-zombie-escape-touch-input'
import {
  activateLandrushZombieEscapeTouchJump,
  LandrushZombieEscapeTouchJoysticks,
  resolveTouchCapability,
  shouldRequestLandrushZombieEscapeTouchJumpFromClick,
} from './landrush-zombie-escape-touch-joysticks'

function createOwnerDocument({
  coarsePointer,
  maxTouchPoints,
}: {
  coarsePointer: boolean
  maxTouchPoints: number
}) {
  return {
    defaultView: {
      matchMedia: () => ({ matches: coarsePointer }),
      navigator: { maxTouchPoints },
    },
  } as unknown as Document
}

describe('Landrush Zombie Escape touch joysticks', () => {
  test('keeps the capability listener behind a shallow memo boundary', () => {
    expect((LandrushZombieEscapeTouchJoysticks as unknown as { $$typeof: symbol }).$$typeof).toBe(
      Symbol.for('react.memo'),
    )
  })

  test('renders both visible sticks and an accessible jump action on a touch device', () => {
    const ownerDocument = createOwnerDocument({ coarsePointer: true, maxTouchPoints: 5 })
    const inputRef = { current: createLandrushZombieEscapeTouchInputState() }

    const markup = renderToStaticMarkup(
      <LandrushZombieEscapeTouchJoysticks
        inputRef={inputRef}
        onInput={() => undefined}
        ownerDocument={ownerDocument}
        visible
      />,
    )

    expect(markup).toContain('data-testid="landrush-zombie-escape-touch-controls"')
    expect(markup).toContain('data-enabled="true"')
    expect(markup.match(/data-stick=/g)).toHaveLength(2)
    expect(markup).toContain('data-stick="move"')
    expect(markup).toContain('data-stick="aim"')
    expect(markup).toContain('data-touch-action="jump"')
    expect(markup).toContain('aria-label="Jump"')
    expect(markup).toContain('type="button"')
    expect(markup.match(/pointer-events-auto/g)).toHaveLength(3)
    expect(markup.match(/size-\[clamp\(4\.2rem,15\.4vw,5\.6rem\)\]/g)).toHaveLength(2)
    expect(markup.match(/size-\[clamp\(1\.82rem,6\.3vw,2\.38rem\)\]/g)).toHaveLength(2)
    expect(markup.match(/inset-\[32%\]/g)).toHaveLength(1)
    expect(markup).toContain('touch-none select-none')
    expect(markup).toContain('[-webkit-tap-highlight-color:transparent]')
    expect(markup).toContain('[-webkit-touch-callout:none]')
    expect(markup).toContain('[-webkit-user-select:none]')
    expect(markup.match(/draggable="false"/g)).toHaveLength(3)
  })

  test('anchors both control clusters above the safe area and groups jump over aim', () => {
    const ownerDocument = createOwnerDocument({ coarsePointer: true, maxTouchPoints: 5 })
    const inputRef = { current: createLandrushZombieEscapeTouchInputState() }
    const markup = renderToStaticMarkup(
      <LandrushZombieEscapeTouchJoysticks
        inputRef={inputRef}
        onInput={() => undefined}
        ownerDocument={ownerDocument}
        visible
      />,
    )

    expect(markup.match(/data-touch-control-cluster=/g)).toHaveLength(2)
    expect(
      markup.match(/bottom-\[max\(2\.375rem,calc\(env\(safe-area-inset-bottom\)\+1\.25rem\)\)\]/g),
    ).toHaveLength(2)
    expect(markup.indexOf('data-touch-action="jump"')).toBeLessThan(
      markup.indexOf('data-stick="aim"'),
    )
  })

  test('does not queue a second jump from the click synthesized after pointer activation', () => {
    expect(shouldRequestLandrushZombieEscapeTouchJumpFromClick(0)).toBe(true)
    expect(shouldRequestLandrushZombieEscapeTouchJumpFromClick(1)).toBe(false)
    expect(shouldRequestLandrushZombieEscapeTouchJumpFromClick(2)).toBe(false)
  })

  test('claims touch input ownership when jump is the first touch action', () => {
    const input = createLandrushZombieEscapeTouchInputState()
    const activatedInputs: LandrushZombieEscapeTouchInputKind[] = []

    activateLandrushZombieEscapeTouchJump(input, (activatedInput) => {
      activatedInputs.push(activatedInput)
    })

    expect(activatedInputs).toEqual(['jump'])
    expect(consumeLandrushZombieEscapeTouchJumpRequest(input)).toBe(true)
  })

  test('uses layout for centering and a single transform channel for knob movement', () => {
    const ownerDocument = createOwnerDocument({ coarsePointer: true, maxTouchPoints: 5 })
    const inputRef = { current: createLandrushZombieEscapeTouchInputState() }
    const markup = renderToStaticMarkup(
      <LandrushZombieEscapeTouchJoysticks
        inputRef={inputRef}
        onInput={() => undefined}
        ownerDocument={ownerDocument}
        visible
      />,
    )

    const knobTags = markup.match(/<div[^>]*data-touch-stick-knob="(?:move|aim)"[^>]*>/g) ?? []
    expect(markup.match(/place-items-center/g)).toHaveLength(3)
    expect(markup.match(/style="transform:translate3d\(0, 0, 0\)"/g)).toHaveLength(2)
    expect(markup).not.toContain('translate(-50%')
    expect(knobTags).toHaveLength(2)
    for (const knobTag of knobTags) {
      expect(knobTag).not.toContain('-translate-x-1/2')
      expect(knobTag).not.toContain('-translate-y-1/2')
    }
  })

  test('does not render touch controls without a touch capability signal', () => {
    const ownerDocument = createOwnerDocument({ coarsePointer: false, maxTouchPoints: 0 })
    const inputRef = { current: createLandrushZombieEscapeTouchInputState() }

    expect(resolveTouchCapability(ownerDocument)).toBe(false)
    expect(
      renderToStaticMarkup(
        <LandrushZombieEscapeTouchJoysticks
          inputRef={inputRef}
          onInput={() => undefined}
          ownerDocument={ownerDocument}
          visible
        />,
      ),
    ).toBe('')
  })
})
