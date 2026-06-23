import { Suspense } from 'react'
import { WorldLabClient } from '@/components/landrush-lab/world-lab-client'

export default function LandrushWorldCopyLabPage() {
  return (
    <Suspense fallback={null}>
      <WorldLabClient variant="dirt-copy" />
    </Suspense>
  )
}
