import { Suspense } from 'react'
import { LandrushIslandDeferredClient } from '@/components/landrush-lab/landrush-island-deferred-client'

export default function PascalMultiplayerIslandPage() {
  return (
    <Suspense fallback={null}>
      <LandrushIslandDeferredClient />
    </Suspense>
  )
}
