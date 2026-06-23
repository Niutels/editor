import { Suspense } from 'react'
import { GrassLabClient } from '@/components/landrush-lab/grass-lab-client'

export default function LandrushGrassLabPage() {
  return (
    <Suspense fallback={null}>
      <GrassLabClient />
    </Suspense>
  )
}
