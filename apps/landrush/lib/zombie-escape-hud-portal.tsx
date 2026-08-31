'use client'

import { type ReactNode, useSyncExternalStore } from 'react'
import { createPortal } from 'react-dom'

type LandrushZombieEscapeHudPortalEntry = Readonly<{
  owner: symbol
  ownerDocument: Document
  render: (snapshot: unknown) => ReactNode
  snapshot: unknown
  zIndex: string
}>

const listeners = new Set<() => void>()
let currentEntry: LandrushZombieEscapeHudPortalEntry | null = null

function emitLandrushZombieEscapeHudPortalChange() {
  for (const listener of listeners) listener()
}

export function publishLandrushZombieEscapeHudPortal<T>({
  owner,
  ownerDocument,
  render,
  snapshot,
  zIndex,
}: Readonly<{
  owner: symbol
  ownerDocument: Document
  render: (snapshot: T) => ReactNode
  snapshot: T
  zIndex: string
}>) {
  currentEntry = {
    owner,
    ownerDocument,
    render: render as (snapshot: unknown) => ReactNode,
    snapshot,
    zIndex,
  }
  emitLandrushZombieEscapeHudPortalChange()
}

export function updateLandrushZombieEscapeHudPortalSnapshot<T>(owner: symbol, snapshot: T) {
  if (currentEntry?.owner !== owner || Object.is(currentEntry.snapshot, snapshot)) return false
  currentEntry = { ...currentEntry, snapshot }
  emitLandrushZombieEscapeHudPortalChange()
  return true
}

export function releaseLandrushZombieEscapeHudPortal(owner: symbol) {
  if (currentEntry?.owner !== owner) return false
  currentEntry = null
  emitLandrushZombieEscapeHudPortalChange()
  return true
}

function readLandrushZombieEscapeHudPortal() {
  return currentEntry
}

function subscribeLandrushZombieEscapeHudPortal(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function LandrushZombieEscapeHudPortalOutlet() {
  const entry = useSyncExternalStore(
    subscribeLandrushZombieEscapeHudPortal,
    readLandrushZombieEscapeHudPortal,
    () => null,
  )
  if (!entry) return null

  return createPortal(
    <div
      data-landrush-zombie-escape-hud-portal="true"
      style={{
        inset: 0,
        pointerEvents: 'none',
        position: 'fixed',
        zIndex: entry.zIndex,
      }}
    >
      {entry.render(entry.snapshot)}
    </div>,
    entry.ownerDocument.body,
  )
}
