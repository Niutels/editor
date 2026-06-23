import { Suspense } from 'react'
import { ParcelsLabClient } from '@/components/landrush-lab/parcels-lab-client'

export default function LandrushParcelsLabPage() {
  return (
    <Suspense fallback={null}>
      <ParcelsLabClient />
    </Suspense>
  )
}
