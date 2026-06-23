import { Suspense } from 'react'
import { WorldLabClient } from '@/components/landrush-lab/world-lab-client'

export default function LandrushWorldLabPage() {
  return (
    <Suspense fallback={null}>
      <WorldLabClient />
    </Suspense>
  )
}
