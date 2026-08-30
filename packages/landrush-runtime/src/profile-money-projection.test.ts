import { describe, expect, test } from 'bun:test'
import { MAX_PROFILE_MONEY } from '@landrush/protocol'
import { projectProfileMoneyBalance } from './world-multiplayer-client'

describe('profile money projection', () => {
  test('projects queued rewards and purchases in operation order', () => {
    expect(
      projectProfileMoneyBalance(40, [
        { kind: 'zombie-kill-reward' },
        { cost: 35, kind: 'weapon-purchase' },
        { kind: 'zombie-kill-reward' },
      ]),
    ).toBe(25)
  })

  test('fails closed for an unavailable or unaffordable projection', () => {
    expect(projectProfileMoneyBalance(-1, [])).toBeNull()
    expect(projectProfileMoneyBalance(20, [{ cost: 21, kind: 'weapon-purchase' }])).toBeNull()
    expect(projectProfileMoneyBalance(20, [{ cost: 0, kind: 'weapon-purchase' }])).toBeNull()
    expect(
      projectProfileMoneyBalance(MAX_PROFILE_MONEY, [{ kind: 'zombie-kill-reward' }]),
    ).toBeNull()
  })
})
