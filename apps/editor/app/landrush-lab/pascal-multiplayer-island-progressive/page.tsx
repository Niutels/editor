import { Suspense } from 'react'
import { PascalWaterClient as PascalMultiplayerIslandProgressiveClient } from '@/components/landrush-lab/pascal-multiplayer-island-progressive-client'

export default function PascalMultiplayerIslandProgressivePage() {
  return (
    <Suspense fallback={null}>
      <PascalMultiplayerIslandProgressiveClient experience="pascal-multiplayer-island" />
    </Suspense>
  )
}
