import { describe, expect, test } from 'bun:test'
import { renderToStaticMarkup } from 'react-dom/server'
import { LandrushZombieEscapeDayCountdown } from './landrush-zombie-escape-mode'

describe('Landrush Zombie Escape Day countdown', () => {
  test('is a stable accessible button that reveals its action on hover or focus', () => {
    const markup = renderToStaticMarkup(
      <LandrushZombieEscapeDayCountdown
        disabled={false}
        onStartZombie={() => {}}
        phaseSecondsRemaining={59.1}
      />,
    )

    expect(markup).toContain('<button')
    expect(markup).toContain('aria-label="Start zombie"')
    expect(markup).toContain('type="button"')
    expect(markup).toContain('data-testid="landrush-zombie-escape-build-countdown"')
    expect(markup).toContain('Day · 1:00')
    expect(markup).toContain('Start zombie')
    expect(markup).toContain('group-hover:opacity-100')
    expect(markup).toContain('group-focus-visible:opacity-100')
  })

  test('cannot start before the phase is ready', () => {
    const markup = renderToStaticMarkup(
      <LandrushZombieEscapeDayCountdown
        disabled
        onStartZombie={() => {}}
        phaseSecondsRemaining={60}
      />,
    )

    expect(markup).toContain('disabled=""')
  })
})
