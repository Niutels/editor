import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'

const source = readFileSync(
  new URL('./landrush-island-tv-screens.tsx', import.meta.url),
  'utf8',
).replaceAll('\r\n', '\n')

describe('Landrush island TV lifecycle', () => {
  test('retains TV render resources while phase visibility and activity are disabled', () => {
    expect(source).not.toContain('if (!enabled || televisions.length === 0) return null')
    expect(source).not.toContain('if (!enabled) return null')
    expect(source.match(/active=\{enabled\}/g)).toHaveLength(2)
    expect(source).toContain('visible={active}')
    expect(source).toContain('if (!active) {\n      group.visible = false')
    expect(source).toContain('if (!activeRef.current) return')
    expect(source).toContain('sendLandrushIslandYoutubePlayback(playerIframeRef.current, false)')
  })
})
