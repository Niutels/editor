import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'

describe('Landrush Pascal shadow policy', () => {
  test('keeps shadows disabled at the Viewer host boundary', () => {
    const hostSource = readFileSync(new URL('./landrush-pascal-host.tsx', import.meta.url), 'utf8')

    expect(hostSource).toMatch(/<Viewer[\s\S]*?shadows=\{false\}/)
  })
})
