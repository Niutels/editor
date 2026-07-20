import { Suspense } from 'react'
import { PascalCliffsVegetationDebugClient } from '@/components/landrush-lab/pascal-cliffs-vegetation-debug-client'

export default function PascalCliffsVegetationDebugPage() {
  return (
    <Suspense fallback={null}>
      <PascalCliffsVegetationDebugClient />
    </Suspense>
  )
}
