import { Suspense } from 'react'
import { WaterBodyLabClient } from '@/components/landrush-lab/water-body-lab-client'

export default function LandrushWaterBodyLabPage() {
  return (
    <Suspense fallback={null}>
      <WaterBodyLabClient />
    </Suspense>
  )
}
