import { Suspense } from 'react'
import { LandrushIslandClient } from '@/components/landrush-lab/landrush-island-client'

export default function LandrushIslandPage() {
  return (
    <Suspense fallback={null}>
      <LandrushIslandClient />
    </Suspense>
  )
}
