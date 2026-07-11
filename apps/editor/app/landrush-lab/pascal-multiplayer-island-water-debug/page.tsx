import { Suspense } from 'react'
import { LandrushIslandClient } from '@/components/landrush-lab/landrush-island-client'

export default function PascalMultiplayerIslandWaterDebugPage() {
  return (
    <Suspense fallback={null}>
      <LandrushIslandClient
        experience="pascal-multiplayer-island"
        waterFieldDebugMode="cached-worker"
      />
    </Suspense>
  )
}
