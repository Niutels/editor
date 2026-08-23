import { describe, expect, test } from 'bun:test'
import { LANDRUSH_ZOMBIE_ESCAPE_FRAME_ORDER } from './landrush-zombie-escape-mode'

describe('Landrush Zombie Escape frame order', () => {
  test('presents floors before passthrough after effects and before the viewer render', () => {
    expect(LANDRUSH_ZOMBIE_ESCAPE_FRAME_ORDER.effects).toBeLessThan(
      LANDRUSH_ZOMBIE_ESCAPE_FRAME_ORDER.floorPresentation,
    )
    expect(LANDRUSH_ZOMBIE_ESCAPE_FRAME_ORDER.floorPresentation).toBeLessThan(
      LANDRUSH_ZOMBIE_ESCAPE_FRAME_ORDER.passthrough,
    )
    expect(LANDRUSH_ZOMBIE_ESCAPE_FRAME_ORDER.passthrough).toBeLessThan(
      LANDRUSH_ZOMBIE_ESCAPE_FRAME_ORDER.viewerRender,
    )
  })
})
