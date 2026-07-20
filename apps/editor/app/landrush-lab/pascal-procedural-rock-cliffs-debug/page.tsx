import { Suspense } from 'react'
import { PascalProceduralRockCliffsDebugClient } from '@/components/landrush-lab/pascal-procedural-rock-cliffs-debug-client'

export default function PascalProceduralRockCliffsDebugPage() {
  return (
    <Suspense fallback={null}>
      <PascalProceduralRockCliffsDebugClient />
    </Suspense>
  )
}
