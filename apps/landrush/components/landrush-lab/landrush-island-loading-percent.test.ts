import { describe, expect, test } from 'bun:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { LandrushIslandLoadingPercent } from './landrush-island-loading-percent'

describe('Landrush loading percentage display', () => {
  test.each([
    false,
    true,
  ])('renders one clipped row for every percentage, streamed=%s', (streamed) => {
    const markup = renderToStaticMarkup(createElement(LandrushIslandLoadingPercent, { streamed }))
    const rows = Array.from(
      markup.matchAll(/data-landrush-island-loading-percent-row="(\d+)"[^>]*>(\d+)%<\/span>/g),
    )

    expect(rows.map((row) => [Number(row[1]), Number(row[2])])).toEqual(
      Array.from({ length: 101 }, (_, percent) => [percent, percent]),
    )
    expect(markup).toContain('data-landrush-island-loading-shell-percent-reel')
    expect(markup).toContain('h-4 w-[4ch] overflow-hidden text-right font-mono')
    expect(markup).toContain('class="h-4 shrink-0 leading-4"')
    expect(markup).toContain('aria-hidden="true"')
    expect(markup).toContain(
      `data-landrush-island-loading-shell-percent-value="${streamed ? 8 : 0}"`,
    )
  })

  test('leaves the streamed number on the CSS clock before hydration', () => {
    const markup = renderToStaticMarkup(
      createElement(LandrushIslandLoadingPercent, { streamed: true }),
    )
    expect(markup).not.toContain('animation:none')
  })

  test('starts the runtime fallback at zero without playing the streamed bootstrap', () => {
    const markup = renderToStaticMarkup(createElement(LandrushIslandLoadingPercent))
    expect(markup).toContain('animation:none;transform:translate3d(0, 0, 0)')
  })
})
