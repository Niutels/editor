'use client'

import { lazy, Suspense } from 'react'
import { LandrushIslandStartupPresentationGate } from './landrush-island-startup-presentation-gate'
import { LandrushKeyboardFocusAnchor } from './landrush-keyboard-focus-anchor'

const DeferredLandrushIslandClient = lazy(() =>
  import('./landrush-island-client').then(({ LandrushIslandClient }) => ({
    default: LandrushIslandClient,
  })),
)

export function LandrushIslandDeferredClient() {
  return (
    <LandrushIslandStartupPresentationGate>
      <LandrushKeyboardFocusAnchor />
      <Suspense fallback={null}>
        <DeferredLandrushIslandClient experience="pascal-multiplayer-island" />
      </Suspense>
    </LandrushIslandStartupPresentationGate>
  )
}
