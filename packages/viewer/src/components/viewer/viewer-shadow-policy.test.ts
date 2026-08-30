import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'

describe('Viewer shadow policy', () => {
  test('lets an explicit host policy override the persisted viewer preference', () => {
    const viewerSource = readFileSync(new URL('./index.tsx', import.meta.url), 'utf8')

    expect(viewerSource).toContain('shadows?: boolean')
    expect(viewerSource).toContain('const shadowsEnabled = shadows ?? preferredShadowsEnabled')
    expect(viewerSource).toContain('enabled: shadowsEnabled')
  })
})
