import { Suspense } from 'react'
import { IslandLabClient } from '@/components/landrush-lab/island-lab-client'

export default function LandrushIslandLabPage() {
  return (
    <Suspense fallback={null}>
      <IslandLabClient />
    </Suspense>
  )
}
