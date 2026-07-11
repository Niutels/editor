import { Suspense } from 'react'
import { PascalPathsGrassDebugClient } from '@/components/landrush-lab/pascal-paths-grass-debug-client'

export default function PascalPathsGrassDebugPage() {
  return (
    <Suspense fallback={null}>
      <PascalPathsGrassDebugClient />
    </Suspense>
  )
}
