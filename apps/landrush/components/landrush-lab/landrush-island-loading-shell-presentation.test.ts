import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'

describe('Landrush island loading shell presentation', () => {
  test('keeps the staged scene visible through the loading veil', () => {
    const shellSource = readFileSync(
      new URL('./landrush-island-loading-shell.tsx', import.meta.url),
      'utf8',
    )

    expect(shellSource).toContain('bg-slate-950/58')
    expect(shellSource).not.toContain('bg-[#0f1720]')
  })
})
