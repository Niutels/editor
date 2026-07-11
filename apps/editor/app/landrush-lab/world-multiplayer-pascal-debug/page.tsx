import { Suspense } from 'react'
import { PascalWorldMultiplayerDebugClient } from '@/components/landrush-lab/pascal-world-multiplayer-debug-client'

export default function PascalWorldMultiplayerDebugPage() {
  return (
    <Suspense fallback={null}>
      <PascalWorldMultiplayerDebugClient />
    </Suspense>
  )
}
