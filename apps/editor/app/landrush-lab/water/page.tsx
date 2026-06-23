import { Suspense } from 'react'
import { WaterLabClient } from '@/components/landrush-lab/water-lab-client'

export default function LandrushWaterLabPage() {
  return (
    <Suspense fallback={null}>
      <WaterLabClient />
    </Suspense>
  )
}
