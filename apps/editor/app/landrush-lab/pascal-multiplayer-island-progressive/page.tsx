import { Suspense } from 'react'
import { LandrushIslandProgressiveClient } from '@/components/landrush-lab/pascal-multiplayer-island-progressive-client'

export default function PascalMultiplayerIslandProgressivePage() {
  return (
    <Suspense fallback={null}>
      <LandrushIslandProgressiveClient experience="pascal-multiplayer-island" />
    </Suspense>
  )
}
