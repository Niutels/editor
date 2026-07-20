import { Suspense } from 'react'
import { PascalPathsGrassDebugClient } from '@/components/landrush-lab/pascal-paths-grass-debug-client'

export default function PascalPathsNaturalWaterPage() {
  return (
    <Suspense fallback={null}>
      <PascalPathsGrassDebugClient waterVariant="natural-animated" />
    </Suspense>
  )
}
