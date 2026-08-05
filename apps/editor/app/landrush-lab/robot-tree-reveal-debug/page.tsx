import { Suspense } from 'react'
import { RobotTreeRevealDebugClient } from '@/components/landrush-lab/robot-tree-reveal-debug-client'

export default function RobotTreeRevealDebugPage() {
  return (
    <Suspense fallback={null}>
      <RobotTreeRevealDebugClient />
    </Suspense>
  )
}
