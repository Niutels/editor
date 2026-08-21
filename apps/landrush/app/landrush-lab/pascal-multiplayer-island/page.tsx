import { Suspense } from 'react'
import { LandrushIslandClient } from '@/components/landrush-lab/landrush-island-client'
import { LandrushIslandLoadingShell } from '@/components/landrush-lab/landrush-island-loading-shell'
import { LandrushKeyboardFocusAnchor } from '@/components/landrush-lab/landrush-keyboard-focus-anchor'

export default function PascalMultiplayerIslandPage() {
  return (
    <Suspense fallback={<LandrushIslandLoadingShell />}>
      <LandrushKeyboardFocusAnchor />
      <LandrushIslandClient experience="pascal-multiplayer-island" />
    </Suspense>
  )
}
