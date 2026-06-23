import { Suspense } from 'react'
import { GrassWaterLabClient } from '@/components/landrush-lab/grass-water-lab-client'

export default function LandrushGrassWaterLabPage() {
  return (
    <Suspense fallback={null}>
      <GrassWaterLabClient />
    </Suspense>
  )
}
