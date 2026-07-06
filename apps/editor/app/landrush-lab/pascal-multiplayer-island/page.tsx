import { Suspense } from 'react'
import { LandrushIslandClient } from '@/components/landrush-lab/landrush-island-client'

export default function PascalMultiplayerIslandPage() {
  return (
    <Suspense fallback={null}>
      <LandrushIslandClient experience="pascal-multiplayer-island" />
    </Suspense>
  )
}
