import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { renderToStaticMarkup } from 'react-dom/server'
import {
  LandrushControllerCommandHud,
  type LandrushControllerCommandId,
} from './landrush-controller-command-hud'
import { resolveLandrushZombieEscapeControllerCommands } from './landrush-zombie-escape-mode'

function renderedPrompt(markup: string, control: LandrushControllerCommandId) {
  const match = markup.match(
    new RegExp(`<(?:button|div)[^>]*data-landrush-controller-control="${control}"[^>]*>`),
  )
  expect(match).not.toBeNull()
  return match?.[0] ?? ''
}

const islandClientSource = readFileSync(
  new URL('./landrush-island-client.tsx', import.meta.url),
  'utf8',
)

describe('LandrushControllerCommandHud', () => {
  test('keeps the four face controls in their physical diamond positions', () => {
    const markup = renderToStaticMarkup(<LandrushControllerCommandHud commands={{}} />)

    expect(markup.match(/data-landrush-controller-control=/g)).toHaveLength(8)
    expect(renderedPrompt(markup, 'triangle')).toContain('data-landrush-controller-position="top"')
    expect(renderedPrompt(markup, 'square')).toContain('data-landrush-controller-position="left"')
    expect(renderedPrompt(markup, 'circle')).toContain('data-landrush-controller-position="right"')
    expect(renderedPrompt(markup, 'cross')).toContain('data-landrush-controller-position="bottom"')
  })

  test('keeps L1/L2 and R1/R2 in two stable shoulder columns', () => {
    const markup = renderToStaticMarkup(<LandrushControllerCommandHud commands={{}} />)

    expect(renderedPrompt(markup, 'l1')).toContain('data-landrush-controller-column="left"')
    expect(renderedPrompt(markup, 'l1')).toContain('data-landrush-controller-row="1"')
    expect(renderedPrompt(markup, 'l2')).toContain('data-landrush-controller-column="left"')
    expect(renderedPrompt(markup, 'l2')).toContain('data-landrush-controller-row="2"')
    expect(renderedPrompt(markup, 'r1')).toContain('data-landrush-controller-column="right"')
    expect(renderedPrompt(markup, 'r1')).toContain('data-landrush-controller-row="1"')
    expect(renderedPrompt(markup, 'r2')).toContain('data-landrush-controller-column="right"')
    expect(renderedPrompt(markup, 'r2')).toContain('data-landrush-controller-row="2"')
  })

  test('names real bindings and leaves unused controls dim and non-semantic', () => {
    const markup = renderToStaticMarkup(
      <LandrushControllerCommandHud
        commands={{
          cross: { label: 'Jump' },
          l2: { label: 'Crouch' },
          r2: { label: 'Attack' },
          square: { label: 'Interact' },
        }}
        label="Zombie Escape controller commands"
      />,
    )

    expect(markup).toContain('aria-label="Zombie Escape controller commands"')
    expect(markup).toContain('<span class="sr-only">Cross: Jump</span>')
    expect(markup).toContain('<span class="sr-only">Square: Interact</span>')
    expect(markup).toContain('<span class="sr-only">L2: Crouch</span>')
    expect(markup).toContain('<span class="sr-only">R2: Attack</span>')
    expect(renderedPrompt(markup, 'circle')).toContain('data-landrush-controller-bound="false"')
    expect(renderedPrompt(markup, 'circle')).toContain('aria-hidden="true"')
    expect(renderedPrompt(markup, 'l1')).toContain('data-landrush-controller-bound="false"')
    expect(renderedPrompt(markup, 'r1')).toContain('data-landrush-controller-bound="false"')
  })

  test('retains real button semantics when a caller supplies an activation', () => {
    const markup = renderToStaticMarkup(
      <LandrushControllerCommandHud
        commands={{ triangle: { label: 'Map', onActivate: () => undefined } }}
      />,
    )

    expect(renderedPrompt(markup, 'triangle')).toStartWith('<button')
    expect(renderedPrompt(markup, 'triangle')).toContain('aria-label="Triangle: Map"')
    expect(renderedPrompt(markup, 'circle')).toStartWith('<div')
  })
})

describe('integrated Zombie Escape controller commands', () => {
  test('advertises only bindings that the live night input owner implements', () => {
    expect(
      resolveLandrushZombieEscapeControllerCommands({
        pickupAvailable: false,
        terminal: false,
      }),
    ).toEqual({
      cross: { label: 'Jump' },
      l2: { label: 'Crouch' },
      r2: { label: 'Attack' },
      square: { label: 'Interact' },
    })
  })

  test('makes Square and Triangle contextual without inventing shoulder bindings', () => {
    expect(
      resolveLandrushZombieEscapeControllerCommands({
        pickupAvailable: true,
        terminal: true,
      }),
    ).toEqual({
      cross: { label: 'Jump' },
      l2: { label: 'Crouch' },
      r2: { label: 'Attack' },
      square: { label: 'Buy' },
      triangle: { label: 'Run again' },
    })
  })
})

describe('integrated day controller command placement', () => {
  test('uses the bottom-right corner while narrow build chrome is presented', () => {
    expect(islandClientSource).toContain(
      "'pointer-events-none absolute right-3 z-[100] lg:top-[18vh] lg:right-5'",
    )
    expect(islandClientSource).toContain(
      "buildEditorChromeActive ? 'bottom-3 lg:bottom-auto' : 'top-20'",
    )
  })
})
