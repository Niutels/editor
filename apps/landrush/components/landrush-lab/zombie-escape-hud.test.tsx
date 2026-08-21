import { describe, expect, test } from 'bun:test'
import { renderToStaticMarkup } from 'react-dom/server'
import { ZombieEscapeHud, ZombieEscapeMoneyBadge } from './zombie-escape-hud'
import type { ZombieEscapeHudSnapshot } from './zombie-escape-simulation'

function createHudSnapshot(): ZombieEscapeHudSnapshot {
  return {
    ammo: 12,
    cameraBookmark: 'design',
    debugMode: 'final',
    elapsedSeconds: 0,
    extractionOpen: false,
    frameMs: 0,
    health: 100,
    kills: 0,
    money: 0,
    muzzleFlashes: 0,
    night: 1,
    paused: false,
    phase: 'night',
    phaseSecondsRemaining: 60,
    pickupPrompt: null,
    purchaseFeedback: null,
    renderCalls: 0,
    shots: 0,
    shotsFired: 0,
    shotsImpacting: 0,
    shotsTraveling: 0,
    status: 'playing',
    triangles: 0,
    wave: 1,
    waveRemaining: 0,
    waveState: 'active',
    weaponIndex: 0,
    zombies: 0,
  }
}

describe('ZombieEscapeMoneyBadge', () => {
  test.each([
    { money: 0, text: '$0' },
    { money: 37, text: '$37' },
  ])('renders $text as an accessible persistent economy count', ({ money, text }) => {
    const markup = renderToStaticMarkup(<ZombieEscapeMoneyBadge money={money} />)

    expect(markup).toContain('data-testid="landrush-zombie-escape-money"')
    expect(markup).toContain(`aria-label="Money: ${text}"`)
    expect(markup).toContain(`<span>${String(money)}</span>`)
  })

  test('sanitizes invalid economy presentation without mutating simulation state', () => {
    const markup = renderToStaticMarkup(<ZombieEscapeMoneyBadge money={Number.NaN} />)

    expect(markup).toContain('aria-label="Money: $0"')
  })
})

describe('ZombieEscapeHud controls', () => {
  test('advertises the canonical L3 sprint and R2 fire mapping', () => {
    const markup = renderToStaticMarkup(
      <ZombieEscapeHud
        api={null}
        inputMode="gamepad"
        onQualityToggle={() => undefined}
        quality="balanced"
        snapshot={createHudSnapshot()}
      />,
    )

    expect(markup).toContain('RT fire · L3 run')
    expect(markup).not.toContain('LB run')
  })
})
