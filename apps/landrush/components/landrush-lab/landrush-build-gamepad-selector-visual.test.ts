import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'

const chromeStyles = readFileSync(
  new URL('./landrush-pascal-editor-chrome.module.css', import.meta.url),
  'utf8',
).replaceAll('\r\n', '\n')

function extractCssBlock(source: string, selector: string): string {
  const selectorIndex = source.indexOf(`${selector} {`)
  expect(selectorIndex).toBeGreaterThanOrEqual(0)
  const openingBraceIndex = source.indexOf('{', selectorIndex)
  let depth = 0
  for (let index = openingBraceIndex; index < source.length; index += 1) {
    if (source[index] === '{') depth += 1
    if (source[index] !== '}') continue
    depth -= 1
    if (depth === 0) return source.slice(openingBraceIndex + 1, index)
  }
  throw new Error(`CSS block is not closed: ${selector}`)
}

function compactCss(source: string): string {
  return source.replace(/\s+/g, ' ').trim()
}

describe('Landrush build gamepad selector visual', () => {
  test('shows programmatic palette focus as the full-color blue selector', () => {
    const focusSelector = '.chrome :global([data-editor-build-controller-item]:focus)'
    const imageSelector = '.chrome :global([data-editor-build-controller-item]:focus img)'
    const focusedControl = compactCss(extractCssBlock(chromeStyles, focusSelector))
    const focusedImage = compactCss(extractCssBlock(chromeStyles, imageSelector))

    expect(chromeStyles).not.toContain('[data-editor-build-controller-item]:focus-visible')
    expect(focusedControl).toContain(
      'background-color: color-mix(in oklab, var(--sidebar-primary) 20%, transparent);',
    )
    expect(focusedControl).toContain('box-shadow: 0 0 0 2px var(--sidebar-primary);')
    expect(focusedControl).toContain('filter: none;')
    expect(focusedControl).toContain('opacity: 1;')
    expect(focusedControl).toContain('outline: none;')
    expect(focusedImage).toContain('filter: none;')
    expect(focusedImage).toContain('opacity: 1;')
  })
})
