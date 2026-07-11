import { Suspense } from 'react'
import { ParcelsRoadsLabClient } from '@/components/landrush-lab/parcels-roads-lab-client'

export default function LandrushParcelsRoadsLabPage() {
  return (
    <Suspense fallback={null}>
      <ParcelsRoadsLabClient />
    </Suspense>
  )
}
