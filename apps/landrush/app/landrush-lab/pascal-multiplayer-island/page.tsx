import { Suspense } from 'react'
import { LandrushIslandClient } from '@/components/landrush-lab/landrush-island-client'
import { LandrushIslandStartupPresentationGate } from '@/components/landrush-lab/landrush-island-startup-presentation-gate'
import { LandrushKeyboardFocusAnchor } from '@/components/landrush-lab/landrush-keyboard-focus-anchor'

export default function PascalMultiplayerIslandPage() {
  return (
    <Suspense fallback={null}>
      <LandrushIslandStartupPresentationGate>
        <LandrushKeyboardFocusAnchor />
        <LandrushIslandClient experience="pascal-multiplayer-island" />
      </LandrushIslandStartupPresentationGate>
    </Suspense>
  )
}
