import { describe, expect, it } from 'bun:test'
import {
  createLandrushZombieEscapeIntegratedArena,
  createLandrushZombieEscapeIntegratedArenaFromPlayRadius,
} from '@landrush/zombie-gameplay/landrush-zombie-escape-arena'

describe('Landrush Zombie Escape integrated arena', () => {
  it('reconstructs the exact production arena from its compiled play radius', () => {
    const surface = [
      { x: -30, z: -30 },
      { x: 30, z: -30 },
      { x: 30, z: 30 },
      { x: -30, z: 30 },
    ]
    const live = createLandrushZombieEscapeIntegratedArena(surface, { x: 0, z: 0 })
    const headless = createLandrushZombieEscapeIntegratedArenaFromPlayRadius(live.playRadius)

    expect(headless).toEqual(live)
    expect(headless.obstacleCount).toBe(0)
    expect(headless.playerStartX).toBe(0)
    expect(headless.playerStartZ).toBe(0)
  })

  it('fails closed on an invalid captured play radius', () => {
    expect(() => createLandrushZombieEscapeIntegratedArenaFromPlayRadius(Number.NaN)).toThrow()
    expect(() => createLandrushZombieEscapeIntegratedArenaFromPlayRadius(13.99)).toThrow()
  })
})
