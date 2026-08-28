import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
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

  test('keeps the 10 Hz HUD snapshot outside the memoized 3D presentation subtree', () => {
    const source = readFileSync(
      new URL('./landrush-zombie-escape-mode.tsx', import.meta.url),
      'utf8',
    )
    const presentationStart = source.indexOf('const LandrushZombieEscapePresentation = memo(')
    const presentationEnd = source.indexOf('type LandrushZombieEscapeHudProps', presentationStart)
    const modeStart = source.indexOf('export function LandrushZombieEscapeMode')
    const modeEnd = source.indexOf('type LandrushZombieEscapePresentationProps', modeStart)

    expect(presentationStart).toBeGreaterThanOrEqual(0)
    expect(presentationEnd).toBeGreaterThan(presentationStart)
    expect(modeStart).toBeGreaterThanOrEqual(0)
    expect(modeEnd).toBeGreaterThan(modeStart)
    expect(source.slice(presentationStart, presentationEnd)).not.toContain('snapshot')
    expect(source.slice(modeStart, modeEnd)).toContain('<LandrushZombieEscapePresentation')
    expect(source.slice(modeStart, modeEnd)).toContain('<LandrushZombieEscapeHudPortal')
  })

  test('defers the HUD portal until startup presentation is admitted', () => {
    const source = readFileSync(
      new URL('./landrush-zombie-escape-mode.tsx', import.meta.url),
      'utf8',
    )
    const modeStart = source.indexOf('export function LandrushZombieEscapeMode')
    const modeEnd = source.indexOf('type LandrushZombieEscapePresentationProps', modeStart)
    const modeSource = source.slice(modeStart, modeEnd)

    expect(modeStart).toBeGreaterThanOrEqual(0)
    expect(modeEnd).toBeGreaterThan(modeStart)
    expect(modeSource).toContain('const [hudPortalAdmitted, setHudPortalAdmitted] = useState(phaseReady)')
    expect(modeSource).toContain('if (phaseReady) setHudPortalAdmitted(true)')
    expect(modeSource).toContain('{hudPortalAdmitted ? (\n        <LandrushZombieEscapeHudPortal')
    expect(modeSource).toContain('phaseReady={interactionActionable}')
  })
})
