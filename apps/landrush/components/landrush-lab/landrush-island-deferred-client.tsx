'use client'

import { lazy, Suspense, useState } from 'react'
import { createLandrushBackgroundMusicPlaybackState } from './landrush-island-background-music'
import { LandrushIslandBackgroundMusic } from './landrush-island-background-music-client'
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
      <LandrushIslandDeferredRuntime />
    </LandrushIslandStartupPresentationGate>
  )
}

function LandrushIslandDeferredRuntime() {
  const [initialPlayback] = useState(createLandrushBackgroundMusicPlaybackState)

  return (
    <>
      <LandrushIslandBackgroundMusic
        initialPlayback={initialPlayback}
        key={`startup-day-track:${initialPlayback.dayTrackIndex}`}
      />
      <LandrushKeyboardFocusAnchor />
      <Suspense fallback={null}>
        <DeferredLandrushIslandClient experience="pascal-multiplayer-island" />
      </Suspense>
    </>
  )
}
