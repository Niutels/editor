import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import {
  publishLandrushZombieEscapeHudPortal,
  releaseLandrushZombieEscapeHudPortal,
  updateLandrushZombieEscapeHudPortalSnapshot,
} from './zombie-escape-hud-portal'

describe('Landrush Zombie Escape HUD portal', () => {
  test('keeps the latest owner authoritative without an independent React root', () => {
    const firstOwner = Symbol('first')
    const secondOwner = Symbol('second')
    const ownerDocument = { body: {} } as Document
    const render = (snapshot: number) => String(snapshot)

    publishLandrushZombieEscapeHudPortal({
      owner: firstOwner,
      ownerDocument,
      render,
      snapshot: 1,
      zIndex: '120',
    })
    expect(updateLandrushZombieEscapeHudPortalSnapshot(firstOwner, 1)).toBe(false)
    expect(updateLandrushZombieEscapeHudPortalSnapshot(firstOwner, 2)).toBe(true)

    publishLandrushZombieEscapeHudPortal({
      owner: secondOwner,
      ownerDocument,
      render,
      snapshot: 2,
      zIndex: '130',
    })
    expect(updateLandrushZombieEscapeHudPortalSnapshot(firstOwner, 3)).toBe(false)
    expect(releaseLandrushZombieEscapeHudPortal(firstOwner)).toBe(false)
    expect(updateLandrushZombieEscapeHudPortalSnapshot(secondOwner, 4)).toBe(true)
    expect(releaseLandrushZombieEscapeHudPortal(secondOwner)).toBe(true)
    expect(updateLandrushZombieEscapeHudPortalSnapshot(secondOwner, 5)).toBe(false)
  })

  test('mounts one body portal from the existing app root', () => {
    const source = readFileSync(new URL('./zombie-escape-hud-portal.tsx', import.meta.url), 'utf8')
    const bootstrap = readFileSync(new URL('../app/client-bootstrap.tsx', import.meta.url), 'utf8')

    expect(source).toContain("import { createPortal } from 'react-dom'")
    expect(source).not.toContain("from 'react-dom/client'")
    expect(source).not.toContain('createRoot(')
    expect(source).toContain('entry.ownerDocument.body')
    expect(source).toContain('data-landrush-zombie-escape-hud-portal="true"')
    expect(bootstrap).toContain('<LandrushZombieEscapeHudPortalOutlet />')
  })
})
