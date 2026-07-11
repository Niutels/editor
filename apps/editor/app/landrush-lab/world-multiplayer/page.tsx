import { Suspense } from 'react'
import { WorldMultiplayerLabClient } from '@/components/landrush-lab/world-multiplayer-lab-client'

export default function LandrushWorldMultiplayerLabPage() {
  return (
    <Suspense fallback={null}>
      <WorldMultiplayerLabClient />
    </Suspense>
  )
}
