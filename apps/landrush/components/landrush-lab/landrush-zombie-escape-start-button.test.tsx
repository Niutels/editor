import { describe, expect, test } from 'bun:test'
import { renderToStaticMarkup } from 'react-dom/server'
import { LandrushZombieEscapeStartButton } from './landrush-zombie-escape-mode'

describe('Landrush Zombie Escape start button', () => {
  test('always presents the manual start action without a build countdown', () => {
    const markup = renderToStaticMarkup(
      <LandrushZombieEscapeStartButton disabled={false} onStartZombie={() => {}} />,
    )

    expect(markup).toContain('<button')
    expect(markup).toContain('aria-label="Start zombie"')
    expect(markup).toContain('title="Start zombie"')
    expect(markup).toContain('type="button"')
    expect(markup).toContain('data-testid="landrush-zombie-escape-build-countdown"')
    expect(markup).toContain('size-[5.625rem]')
    expect(markup).toContain('size-[3.75rem]')
    expect(markup).toContain('aria-hidden="true"')
    expect(markup).toContain('viewBox="0 0 24 24"')
    expect(markup).toContain('data-moon-texture="true"')
    expect(markup).toContain('landrush-zombie-start-moon-clip')
    expect(markup).not.toContain('>Start zombie</button>')
    expect(markup).not.toContain('Day ·')
    expect(markup).not.toContain('Waiting on house')
  })

  test('waits only for runtime readiness', () => {
    const markup = renderToStaticMarkup(
      <LandrushZombieEscapeStartButton disabled onStartZombie={() => {}} />,
    )

    expect(markup).toContain('disabled=""')
    expect(markup).toContain('aria-label="Start zombie"')
    expect(markup).not.toContain('>Start zombie</button>')
  })
})
