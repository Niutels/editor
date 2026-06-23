import { Suspense } from 'react'
import { BuildModeLabClient } from '@/components/landrush-lab/build-mode-lab-client'

export default function LandrushBuildModeLabPage() {
  return (
    <Suspense fallback={null}>
      <BuildModeLabClient />
    </Suspense>
  )
}
