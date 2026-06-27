import { Suspense } from 'react'
import { PascalWaterClient } from '@/components/landrush-lab/pascal-water-client'

export default function PascalMultiplayerIslandWaterDebugPage() {
  return (
    <Suspense fallback={null}>
      <PascalWaterClient
        experience="pascal-multiplayer-island"
        waterFieldDebugMode="cached-worker"
      />
    </Suspense>
  )
}
