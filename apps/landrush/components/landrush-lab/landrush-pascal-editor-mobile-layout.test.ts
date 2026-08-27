import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { LANDRUSH_PASCAL_EDITOR_RAIL_WIDTH } from '@landrush/pascal-host'

const chromeSource = readFileSync(
  new URL('./landrush-pascal-editor-chrome.tsx', import.meta.url),
  'utf8',
).replaceAll('\r\n', '\n')
const chromeStyles = readFileSync(
  new URL('./landrush-pascal-editor-chrome.module.css', import.meta.url),
  'utf8',
).replaceAll('\r\n', '\n')

function extractCssBlock(source: string, selector: string): string {
  const selectorIndex = source.indexOf(selector)
  expect(selectorIndex).toBeGreaterThanOrEqual(0)
  const openingBraceIndex = source.indexOf('{', selectorIndex)
  expect(openingBraceIndex).toBeGreaterThan(selectorIndex)
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

const mobileStyles = extractCssBlock(chromeStyles, '@media (max-width: 1023px)')
const desktopStyles = chromeStyles.slice(0, chromeStyles.indexOf('@media (max-width: 1023px)'))

describe('Landrush Pascal editor mobile layout contract', () => {
  test('uses one <= 1023px contract with a total 25vw sidebar', () => {
    expect(chromeStyles.match(/@media \(max-width: 1023px\)/g)).toHaveLength(1)
    expect(compactCss(extractCssBlock(chromeStyles, '.chrome'))).toContain(
      '--landrush-editor-mobile-width: 25vw;',
    )
    expect(compactCss(extractCssBlock(mobileStyles, '.sidebar'))).toContain(
      'width: var(--landrush-editor-mobile-width);',
    )
  })

  test('stacks adaptive touch targets above a full-width panel and removes touch resizing', () => {
    const sidebar = compactCss(extractCssBlock(mobileStyles, '.sidebar'))
    const navigation = compactCss(extractCssBlock(mobileStyles, '.sidebarNav'))
    const tabButton = compactCss(extractCssBlock(mobileStyles, '.sidebarTabButton'))
    const panel = compactCss(extractCssBlock(mobileStyles, '.panel'))
    const resizer = compactCss(extractCssBlock(mobileStyles, '.resizer'))

    expect(sidebar).toContain('flex-direction: column;')
    expect(navigation).toContain('display: grid;')
    expect(navigation).toContain('width: 100%;')
    expect(navigation).toContain('grid-template-columns: repeat(auto-fit, minmax(2.75rem, 1fr));')
    expect(navigation).toContain('grid-auto-rows: 2.75rem;')
    expect(tabButton).toContain('height: 2.75rem;')
    expect(panel).toContain('width: 100%;')
    expect(panel).toContain('flex: 1 1 auto;')
    expect(resizer).toContain('display: none;')
    expect(chromeSource.indexOf('data-landrush-editor-sidebar-nav')).toBeLessThan(
      chromeSource.indexOf('data-landrush-editor-panel={activePanel}'),
    )
    expect(chromeSource).toContain('data-landrush-editor-panel-viewport')
    expect(chromeSource).toContain('data-landrush-editor-resizer')
  })

  test('uses the same 25vw inset for open viewer overlays and the full-width close transform', () => {
    const closedViewer = compactCss(extractCssBlock(mobileStyles, '.viewerOverlays'))
    const openViewer = compactCss(
      extractCssBlock(
        mobileStyles,
        ".chrome[data-landrush-pascal-editor-open='true'] .viewerOverlays",
      ),
    )

    expect(closedViewer).toContain('left: 0;')
    expect(openViewer).toContain('left: var(--landrush-editor-mobile-width);')
    expect(chromeSource).toContain(
      "data-landrush-pascal-editor-open={layoutOpen ? 'true' : 'false'}",
    )
    expect(chromeSource).toContain('data-landrush-editor-viewer-overlays')
    expect(chromeSource).toMatch(
      /transform: `translate3d\(\$\{layoutOpen \? '0' : '-100%'\}, 0, 0\)`,/,
    )
  })

  test('reclaims the display when collapsed without covering its remaining controls', () => {
    const collapsedSelector =
      ".chrome[data-landrush-pascal-editor-open='true'][data-landrush-pascal-editor-collapsed='true']"
    const compactMobileStyles = compactCss(mobileStyles)

    expect(compactMobileStyles).toContain(
      `${collapsedSelector} .sidebar { bottom: auto; height: auto; }`,
    )
    expect(compactMobileStyles).toContain(`${collapsedSelector} .viewerOverlays { left: 0; }`)
    expect(compactMobileStyles).toContain(
      `${collapsedSelector} .topToolbar, ${collapsedSelector} .levelSelectorContainer > div:first-child { left: calc(var(--landrush-editor-mobile-width) + 0.5rem); }`,
    )
    expect(chromeSource).toContain('{active && !isCollapsed ? (')
    expect(chromeSource).toContain(
      "data-landrush-pascal-editor-collapsed={isCollapsed ? 'true' : 'false'}",
    )
  })

  test('compacts mobile toolbar labels and separates the remaining overlay controls', () => {
    const exitLabel = compactCss(extractCssBlock(mobileStyles, '.exitBuildLabel'))
    const rightButtons = compactCss(extractCssBlock(mobileStyles, '.rightToolbar :global(button)'))
    const rightLabels = compactCss(
      extractCssBlock(mobileStyles, '.rightToolbar :global(button > span)'),
    )
    const topToolbar = compactCss(extractCssBlock(mobileStyles, '.topToolbar'))
    const selectToolbar = compactCss(extractCssBlock(mobileStyles, '.selectToolbar'))
    const levelSelector = compactCss(
      extractCssBlock(mobileStyles, '.levelSelectorContainer > div:first-child'),
    )

    expect(exitLabel).toContain('display: none;')
    expect(rightButtons).toContain('width: 2rem !important;')
    expect(rightLabels).toContain('display: none;')
    expect(topToolbar).toContain('top: 3.25rem;')
    expect(selectToolbar).toContain('left: 0.5rem;')
    expect(selectToolbar).toContain('transform: none;')
    expect(levelSelector).toContain('top: 6rem;')
    expect(chromeSource).toContain('data-landrush-editor-exit-label')
    expect(chromeSource).toContain('data-landrush-editor-toolbar-right')
    expect(chromeSource).toContain('data-landrush-editor-select-toolbar')
    expect(chromeSource).toContain('data-landrush-editor-level-selector-container')
    expect(chromeSource).toContain(
      '<CommunityViewerToolbarRight capabilities={LANDRUSH_VIEWER_CAPABILITIES} />',
    )
  })

  test('keeps mobile sizing in CSS without overwriting the desktop sidebar store', () => {
    expect(chromeSource).not.toContain('25vw')
    expect(chromeSource).not.toContain('matchMedia')
    expect(chromeSource).not.toContain('window.innerWidth')
    expect(chromeSource.match(/\bsetWidth\(/g)).toHaveLength(2)
    expect(chromeSource).toContain('if (width < SIDEBAR_MIN_WIDTH) setWidth(SIDEBAR_MIN_WIDTH)')
    expect(chromeSource).toContain(
      'setWidth(Math.max(SIDEBAR_MIN_WIDTH, Math.min(nextWidth, SIDEBAR_MAX_WIDTH)))',
    )
  })

  test('preserves desktop panel sizing and the 56px vertical rail', () => {
    expect(LANDRUSH_PASCAL_EDITOR_RAIL_WIDTH).toBe(56)
    expect(compactCss(extractCssBlock(desktopStyles, '.sidebar'))).toContain(
      'width: var(--landrush-editor-sidebar-width);',
    )
    expect(compactCss(extractCssBlock(desktopStyles, '.sidebarNav'))).toContain('width: 3.5rem;')
    expect(compactCss(extractCssBlock(desktopStyles, '.sidebarNav'))).toContain(
      'flex-direction: column;',
    )
    expect(compactCss(extractCssBlock(desktopStyles, '.panel'))).toContain(
      'width: var(--landrush-editor-panel-width);',
    )
    expect(chromeSource).toMatch(/'--landrush-editor-panel-width': `\$\{width\}px`/)
    expect(chromeSource).toMatch(/'--landrush-editor-sidebar-width': `\$\{sidebarWidth\}px`/)
    expect(chromeSource).toContain(
      'const nextWidth = event.clientX - LANDRUSH_PASCAL_EDITOR_RAIL_WIDTH',
    )
  })
})
