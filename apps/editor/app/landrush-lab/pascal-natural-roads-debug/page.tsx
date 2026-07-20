import { Suspense } from 'react'
import { PascalNaturalRoadsDebugClient } from '@/components/landrush-lab/pascal-natural-roads-debug-client'

export default function PascalNaturalRoadsDebugPage() {
  return (
    <Suspense fallback={null}>
      <PascalNaturalRoadsDebugClient />
    </Suspense>
  )
}
